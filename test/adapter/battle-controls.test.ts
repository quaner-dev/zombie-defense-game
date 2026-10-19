import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';
import { DragCommand, fitBattlefield, mapToScreen, screenToMap } from '../../assets/scripts/adapter/contracts.js';

test('450ms hold selects one; the first drag locks squad mode for its entire lifetime',()=>{
  const d=new DragCommand();
  d.begin(1,{x:0,y:0},{x:100,y:100},0,false,true,['a','b'],'b');
  d.update(449);assert.equal(d.preview!.unitIds.length,2);d.update(450);assert.deepEqual(d.preview!.unitIds,['b']);
  d.move(1,{x:20,y:0},{x:120,y:100},600);assert.deepEqual(d.end(1,{x:30,y:0},{x:130,y:100},700)!.unitIds,['b']);
  d.reset();d.begin(1,{x:0,y:0},{x:100,y:100},0,false,true,['a','b'],'b');
  d.move(1,{x:8,y:0},{x:108,y:100},200);d.update(900);
  assert.equal(d.mode,'squad');assert.deepEqual(d.end(1,{x:30,y:0},{x:130,y:100},1000)!.unitIds,['a','b']);
  d.reset();d.begin(1,{x:0,y:0},{x:100,y:100},0,false,true,['a','b']);d.update(450);d.cancel();assert.equal(d.preview,null);
});
test('production input captures a squad and long press detaches the actual touched member',()=>{
  const f=fixture(true),c=f.controller,s=c.session,store=s.battle.units;store.clear();
  const a=store.spawn('rifleman',{x:300,y:1400},'A'),b=store.spawn('shield',{x:350,y:1400},'A');
  const p=mapToScreen(b.position,c.frame),end=mapToScreen({x:500,y:1700},c.frame);
  f.touch('start',1,p.x,p.y);assert.deepEqual(Array.from(f.controls.drag.preview.unitIds),[a.id,b.id]);
  c.draw();assert.equal(c.hud.gestureHint.string,'整队移动 · 2 人');
  f.advanceTime(450);c.update(.05);assert.deepEqual(Array.from(f.controls.drag.preview.unitIds),[b.id]);
  assert.equal(c.hud.gestureHint.string,'单兵移动 · 1 人');assert.equal(c.hud.gestureHint.node.active,true);
  assert.equal(f.controls.drag.mode,'single');f.touch('move',1,end.x,end.y);f.touch('end',1,end.x,end.y);
  const command=s.battle.getEvents().find((e:any)=>e.type==='group_command');assert.deepEqual(Array.from(command.data.unitIds),[b.id]);
  assert.equal(a.moveTarget,null);assert.ok(b.moveTarget);c.onDestroy();
});
test('selection UI freezes time, enforces the cap, previews all 15 soldiers, and reopens on restart',()=>{
  const f=fixture(true,undefined,{console:undefined},undefined,true),c=f.controller,s=c.session;
  f.button(0,'start');f.button(0,'end');assert.equal(s.screen,'roster');
  for(let i=0;i<100;i++)c.update(.05);assert.equal(s.snapshot.time_s,0);assert.equal(s.snapshot.spawnedZombies,0);
  for(let i=0;i<6;i++){f.button(1,'start');f.button(1,'end');}c.draw();assert.equal(s.rosterTotal,15);
  assert.equal(c.hud.rosterPreviewUnits.length,15);assert.equal(c.hud.rosterBoxes[1].enabled(),false);
  f.button(1,'start');f.button(1,'end');assert.equal(s.rosterTotal,15);f.confirm();assert.equal(s.screen,'battle');
  assert.equal(s.initialHumans,15);c.restart();assert.equal(s.screen,'roster');assert.equal(s.rosterTotal,15);assert.equal(c.field.active,false);
  for(const type of Object.keys(s.roster))s.changeRoster(type,-s.roster[type]);c.draw();assert.equal(c.hud.rosterBoxes[11].enabled(),false);
  f.confirm();assert.equal(s.screen,'roster');c.onDestroy();
});
for(const safe of [{x:0,y:0,width:1080,height:2400},{x:40,y:80,width:1000,height:2200},{x:0,y:0,width:2400,height:1080}]){
  test(`battlefield is uniformly centered and touch coordinates round-trip ${safe.width}x${safe.height}`,()=>{
    const f=fitBattlefield(safe,1080,2400);
    assert.ok(Math.abs(f.x+f.width*f.scale/2-(safe.x+safe.width/2))<1e-8);
    assert.ok(Math.abs(f.y+f.height*f.scale/2-(safe.y+safe.height/2))<1e-8);
    const area=f.width*f.height*f.scale*f.scale/(safe.width*safe.height);assert.ok(area<=.5+1e-8);
    if(safe.width===1080)assert.ok(Math.abs(area-.5)<1e-8);
    const p={x:330,y:1560},back=screenToMap(mapToScreen(p,f),f,{left:0,top:0,right:1080,bottom:2400});
    assert.ok(Math.hypot(p.x-back.x,p.y-back.y)<1e-8);
  });
}
const zombie=(id:string,x:number,type='normal_zombie')=>({id,unitType:type,faction:'zombie',position:{x,y:1000},velocity:{x:0,y:0},radius_px:16,hp:50,maxHp:60,state:'Advancing',active:true,facing:{x:0,y:1}});
test('actual damage flashes only that zombie body, rate-limits without prolonging, and retains special markings',()=>{
  const f=fixture(),v=f.unitView,a=zombie('a',300),b=zombie('b',400,'fat_zombie');
  const hit=(id:string,appliedAmount=10)=>[{type:'damage',time_s:0,data:{targetId:id,appliedAmount,sourceId:'human',damageKind:'flame'}}];
  const body=(x:number)=>v.g.calls.find((call:any)=>call.kind==='circle'&&call.args[0]===x&&call.args[2]===16).fill.hex;
  v.render([a,b],null,0,hit('b'));assert.equal(body(300),'#9F8BE8');assert.equal(body(400),'#FFFFFF');
  assert.ok(v.g.calls.some((call:any)=>call.kind==='circle'&&call.args[0]===400&&call.args[2]===9.92&&call.stroke.hex==='#703E37'));
  assert.ok(!v.g.calls.some((call:any)=>call.kind==='rect'));
  v.render([a,b],null,.05,hit('b'));assert.notEqual(body(400),'#FFFFFF');assert.notEqual(body(400),'#CB7356');
  v.render([a,b],null,.11,hit('b'));assert.equal(body(400),'#CB7356');
  v.render([a,b],null,.15,hit('b'));assert.equal(body(400),'#FFFFFF');
  v.clear();v.render([a,b],null,1,hit('a',0));assert.equal(body(300),'#9F8BE8');assert.equal(v.hitFlashes.size,0);
  v.render([a,b],null,1.1,hit('a'));v.render([b],null,1.11);assert.equal(v.hitFlashes.size,0);
});
test('lethal zombie flash freezes on pause, fades after the result, and clears on restart',()=>{
  const f=fixture(true),c=f.controller,s=c.session;
  const z=s.battle.units.spawn('normal_zombie',{x:300,y:1400},'A');
  s.battle.events.push(...s.battle.combat.applyDamage(z.id,999,'human',0,'bullet'));
  s.tick(0);const snapshot=s.battle.getSnapshot.bind(s.battle);s.battle.getSnapshot=()=>({...snapshot(),result:'win'});
  c.draw();assert.equal(c.units.hitFlashes.size,1);assert.equal(c.units.retainedDeaths,1);
  s.paused=true;for(let i=0;i<5;i++)c.update(.05);assert.equal(c.units.hitFlashes.size,1);
  s.paused=false;for(let i=0;i<8;i++)c.update(.05);
  assert.equal(c.units.hitFlashes.size,0);assert.equal(c.units.retainedDeaths,0);
  s.battle.getSnapshot=snapshot;c.restart();assert.equal(c.units.hitFlashes.size,0);c.onDestroy();
});
