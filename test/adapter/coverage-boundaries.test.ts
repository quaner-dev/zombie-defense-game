import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitMap, DragCommand, ProjectileTracks } from '../../assets/scripts/adapter/contracts.js';
import { BattleSession } from '../../src/adapter/BattleSession.js';
import { VibrationAdapter, optionalWeChatVibration } from '../../assets/scripts/adapter/VibrationAdapter.js';
import { fixture } from '../../test-support/cocos-fixture.js';

// Regression targets: removing viewport validation, identity guards, zero-length
// interpolation, finite-clock/input guards, session lifecycle gates, or optional
// diagnostic calls must break the corresponding observable assertion below.
test('fitMap rejects nonpositive and nonfinite dimensions in every slot',()=>{
  for(const index of [0,1,2,3])for(const invalid of [0,-1,NaN,Infinity,-Infinity]){
    const dimensions=[1080,2400,1080,2400];dimensions[index]=invalid;
    assert.throws(()=>fitMap({x:0,y:0,width:dimensions[0],height:dimensions[1]},dimensions[2],dimensions[3]),/Invalid viewport/);
  }
});

test('drag ignores unrelated motion and accepts exactly eight pixels with captured identities',()=>{
  const d=new DragCommand(),p={x:10,y:20},ids=['h1'];
  d.move(1,p,p);assert.equal(d.preview,null);
  d.begin(1,p,p,0,false,true,ids);ids.push('h2');p.x=90;
  d.move(2,{x:99,y:99},{x:99,y:99});
  assert.deepEqual(d.preview,{start:{x:10,y:20},target:{x:10,y:20},unitIds:['h1']});
  assert.deepEqual(d.end(1,{x:18,y:20},{x:30,y:40},1),{start:{x:10,y:20},target:{x:30,y:40},unitIds:['h1']});
  d.reset();assert.equal(d.begin(2,p,p,1,false,true),true);
});

test('projectile zero-distance, pre-spawn and overshoot positions stay bounded; hits expire',()=>{
  const t=new ProjectileTracks();
  t.consume([{type:'ignored',time_s:0,data:{}},
    {type:'projectile_spawned',time_s:2,data:{id:'zero',origin:{x:5,y:6},destination:{x:5,y:6}}},
    {type:'projectile_spawned',time_s:2,data:{id:'moving',origin:{x:0,y:0},destination:{x:10,y:0}}}]);
  assert.deepEqual(t.positions(1,100).map(p=>p.position),[{x:5,y:6},{x:0,y:0}]);
  assert.deepEqual(t.positions(4,100).map(p=>p.position),[{x:5,y:6},{x:10,y:0}]);
  t.consume([{type:'projectile_hit',time_s:4,data:{projectileId:'zero',position:{x:5,y:6}}},
    {type:'projectile_hit',time_s:4,data:{projectileId:'zero',position:{x:5,y:6}}},
    {type:'projectile_expired',time_s:4,data:{projectileId:'moving'}}]);
  assert.deepEqual(t.counts,{active:0,hits:1});t.positions(4.13,100);
  assert.deepEqual(t.counts,{active:0,hits:0});
});

test('session invalid ticks clear pending batches without advancing or consuming commands',()=>{
  const s=new BattleSession();s.restart();s.confirmRoster();
  const human=s.battle.getUnits().find(u=>u.faction==='human')!;
  assert.equal(s.move(human.position.x,human.position.y,180,1600),true);
  const before=s.snapshot;
  for(const dt of [-1,NaN,Infinity,-Infinity]){
    s.events=[{type:'stale',time_s:0,data:{}}];s.tick(dt);
    assert.deepEqual(s.events,[]);assert.deepEqual(s.snapshot,before);assert.equal(s.deploymentRemaining,3);
  }
  s.tick(0);assert.ok(s.events.some(e=>e.type==='group_command'));
  assert.equal(s.move(-10000,-10000,180,1600),false);
});

test('session group commands obey pause and terminal gates and recover after restart',()=>{
  const s=new BattleSession();s.restart();s.confirmRoster();
  const humans=s.battle.getUnits().filter(u=>u.unitType==='rifleman').slice(0,2),human=humans[0];
  assert.equal(s.moveGroup(humans.map(u=>u.id),180,1600),true);
  s.paused=true;const count=s.battle.getEvents().length;
  assert.equal(s.moveGroup(humans.map(u=>u.id),180,1700),false);
  assert.equal(s.move(human.position.x,human.position.y,180,1700),false);
  assert.equal(s.battle.getEvents().length,count);
  s.paused=false;s.tick(123);assert.notEqual(s.snapshot.result,'running');
  const terminal=s.battle.getEvents().length;
  assert.equal(s.moveGroup(humans.map(u=>u.id),180,1700),false);
  assert.equal(s.move(human.position.x,human.position.y,180,1700),false);
  assert.equal(s.battle.getEvents().length,terminal);
  s.restart();s.confirmRoster();assert.equal(s.moveGroup([],180,1700),false);
  assert.equal(s.moveGroup(s.battle.getUnits().filter(u=>u.unitType==='rifleman').slice(0,2).map(u=>u.id),180,1700),true);
});

test('vibration finite-clock guard does not spend cooldown and reset clears a prior attempt',()=>{
  let now=NaN,calls=0;
  const v=new VibrationAdapter({vibrateShort({fail}){calls++;fail(new Error('device unavailable'));}},()=>now);
  for(now of [NaN,Infinity,-Infinity])v.consume([{type:'route_breached'}],true,false);
  assert.equal(calls,0);now=100;v.consume([{type:'route_breached'}],true,false);assert.equal(calls,1);
  v.reset();v.consume([{type:'route_breached'}],true,false);assert.equal(calls,2);
});

test('vibration default clock and optional wx preserve the platform receiver',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'wx');
  let calls=0;const platform={vibrateShort(){assert.equal(this,platform);calls++;return {} as any;}};
  try{
    Object.defineProperty(globalThis,'wx',{value:platform,configurable:true});
    assert.equal(optionalWeChatVibration(),platform);
    new VibrationAdapter(optionalWeChatVibration()).consume([{type:'route_breached'}],true,false);
    assert.equal(calls,1);
  }finally{if(descriptor)Object.defineProperty(globalThis,'wx',descriptor);else delete (globalThis as any).wx;}
});

for(const [name,consoleValue] of [['absent',undefined],['null',null],['warn-only',{warn(){}}]] as const){
  test(`diagnostics tolerate ${name} console through load, layout, restart and updates`,()=>{
    const f=fixture(true,undefined,{console:consoleValue});
    f.controller.layout();f.controller.restart();f.confirm();
    for(let i=0;i<4;i++)f.controller.update(.05);
    assert.equal(f.controller.session.snapshot.result,'running');
    assert.ok(Math.abs(f.controller.session.deploymentRemaining-2.8)<1e-9);
    f.controller.onDestroy();
  });
}

test('diagnostics keep console receiver, snapshot values and limit frame logs',()=>{
  const calls:unknown[][]=[];
  const logger={log(...args:unknown[]){assert.equal(this,logger);calls.push(args);}};
  const f=fixture(true,undefined,{console:logger},undefined,true);
  const entries=()=>calls.map(args=>JSON.parse(String(args[0]).slice(String(args[0]).indexOf('{'))));
  assert.ok(entries().some(entry=>entry.event==='BattleSceneController.onLoad:start'));
  assert.ok(entries().some(entry=>entry.event==='BattleSceneController.onLoad:complete'));
  assert.equal(entries().find(entry=>entry.event==='scene.ready').data.screen,'menu');
  f.button(0,'start');f.button(0,'end');
  for(let i=0;i<5;i++)f.controller.update(.01);
  const updates=entries().filter(entry=>entry.event==='update');
  assert.deepEqual(updates.map(entry=>entry.data.frame),[1,2,3]);
  assert.equal(entries().filter(entry=>entry.event==='runtime.heartbeat').length,1);
  assert.equal(entries().find(entry=>entry.event==='scene.ready').data.screen,'menu','old logs retain their original state');
  assert.equal(f.controller.session.snapshot.result,'running');f.controller.onDestroy();
});
