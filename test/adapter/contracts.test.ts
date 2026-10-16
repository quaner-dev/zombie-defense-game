import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitMap, screenToMap, mapToScreen, DragCommand, ProjectileTracks } from '../../assets/scripts/adapter/contracts.js';
import { BattleSession } from '../../src/adapter/BattleSession.js';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';

// Catch stretching/cropping, axis inversion and ignoring safe-area insets.
for (const [width,height] of [[1080,2400],[2400,1080],[750,1624]]) {
  test(`contain map inside safe area ${width}x${height}`, () => {
    const f = fitMap({x:20,y:40,width:width-40,height:height-100},1080,2400);
    assert.ok(f.x>=20 && f.y>=40);
    assert.ok(f.x+1080*f.scale<=width-20+1e-8);
    assert.ok(f.y+2400*f.scale<=height-60+1e-8);
    const p=mapToScreen({x:270,y:600},f);
    const back=screenToMap(p,f,{left:0,top:0,right:1080,bottom:2400});
    assert.ok(Math.abs(back.x-270)<1e-8 && Math.abs(back.y-600)<1e-8);
  });
}
test('screen origin is bottom left; map origin top left; targets clamp',()=>{
  const f=fitMap({x:0,y:0,width:1080,height:2400},1080,2400);
  assert.deepEqual(screenToMap({x:0,y:2400},f,{left:0,top:0,right:1080,bottom:2400}),{x:0,y:0});
  assert.deepEqual(screenToMap({x:-10,y:-10},f,{left:10,top:20,right:1000,bottom:2200}),{x:10,y:2200});
});
test('drag rejects UI, empty start, second finger, short drag, cancel and drag-back; cooldown uses wall time',()=>{
  const d=new DragCommand(); const p={x:100,y:100};
  assert.equal(d.begin(1,p,p,0,true,true),false);
  assert.equal(d.begin(1,p,p,0,false,false),false);
  assert.equal(d.begin(1,p,p,0,false,true),true);
  assert.equal(d.begin(2,p,p,0,false,true),false);
  d.cancel(2); // unrelated finger cancellation must not discard the primary drag
  assert.ok(d.preview);
  assert.equal(d.end(2,{x:200,y:100},{x:200,y:100},10),null);
  assert.equal(d.end(1,{x:107,y:100},{x:107,y:100},10),null);
  d.begin(1,p,p,20,false,true); d.move(1,{x:200,y:100},{x:200,y:100});
  assert.equal(d.end(1,p,p,30),null);
  d.begin(1,p,p,40,false,true); d.cancel();
  assert.equal(d.end(1,{x:200,y:100},{x:200,y:100},50),null);
  d.begin(1,p,p,60,false,true);
  assert.deepEqual(d.end(1,{x:200,y:100},{x:200,y:100},70),{start:p,target:{x:200,y:100},unitIds:[]});
  assert.equal(d.begin(1,p,p,300,false,true),false);
  assert.equal(d.begin(1,p,p,370,false,true),true);
});
test('projectile spawn interpolates and hit/expiry retire once, restart clears',()=>{
  const t=new ProjectileTracks();
  t.consume([{type:'projectile_spawned',time_s:1,data:{id:'p',origin:{x:0,y:0},destination:{x:100,y:0}}}]);
  assert.equal(t.positions(1.05,1000)[0].position.x,50.00000000000004);
  t.consume([{type:'projectile_hit',time_s:1.1,data:{projectileId:'p',position:{x:100,y:0}}},{type:'projectile_expired',time_s:1.1,data:{projectileId:'p'}}]);
  assert.equal(t.positions(1.11,1000).length,0);
  assert.equal(t.hits.length,1);
  t.clear(); assert.equal(t.hits.length,0);
});
test('incremental events are isolated, cursor bounded, restart cursor resets',()=>{
  const b=new BattleTestHarness(); b.start('LV01_zombie_wave',1); b.endDeployment();
  const batch=b.readEvents(0); assert.ok(batch.events.length>0);
  batch.events[0].type='corrupt';
  assert.equal(b.readEvents(0).events[0].type,'wave_spawn');
  assert.deepEqual(b.readEvents(batch.cursor).events,[]);
  assert.throws(()=>b.readEvents(-1));
  b.start('LV01_zombie_wave',1); assert.deepEqual(b.readEvents(0),{cursor:0,events:[]});
});
test('deployment, pause, terminal freeze and restart are core-driven',()=>{
  const s=new BattleSession(); s.restart();
  s.battle.getEvents=()=>{throw new Error('must use incremental events');};
  const human=s.battle.getUnits().find(u=>u.faction==='human')!;
  s.move(human.position.x,human.position.y,540,1600);
  assert.ok(s.battle.getUnits().some(u=>u.state==='Moving'));
  s.tick(1);
  assert.ok(s.events.some(e=>e.type==='group_command'));
  s.tick(0);assert.equal(s.events.length,0);
  assert.equal(s.deploymentRemaining,2); s.paused=true; s.tick(10);
  assert.equal(s.deploymentRemaining,2); s.paused=false;
  s.tick(2); assert.equal(s.snapshot.waveIndex,1);
  for(let i=0;i<1200 && s.snapshot.result==='running';i++) s.tick(.1);
  assert.notEqual(s.snapshot.result,'running');
  const before=s.snapshot; s.tick(100); assert.deepEqual(s.snapshot,before);
  s.restart(); s.tick(0);
  assert.equal(s.events.length,0);
  assert.equal(s.snapshot.result,'running'); assert.equal(s.snapshot.aliveHumans,50);
  assert.equal(s.deploymentRemaining,3); assert.equal(s.paused,false); assert.equal(s.events.length,0);
});
test('engine path works without structuredClone or Array.at',()=>{
  const original=globalThis.structuredClone;
  const originalAt=Array.prototype.at;
  try { globalThis.structuredClone=undefined as any;Array.prototype.at=undefined as any;
    const b=new BattleTestHarness(); b.start('LV01_zombie_wave',1); b.endDeployment(); b.advance(10);
    assert.ok(b.getUnits().length>50); assert.ok(b.getEvents().length>1);
  } finally {globalThis.structuredClone=original;Array.prototype.at=originalAt;}
});
