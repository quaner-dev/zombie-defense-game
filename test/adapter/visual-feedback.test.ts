import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';

const human = (overrides:Record<string,unknown>={}) => ({
  id:'human-1',unitType:'rifleman',faction:'human',position:{x:100,y:400},velocity:{x:0,y:0},
  hp:100,maxHp:100,speed_px_per_s:120,state:'Idle',routeId:'A',targetId:null,moveTarget:null,
  attackElapsed_s:0,breached:false,active:true,...overrides,
});

test('HUD presents Chinese copy and shows a pressed button state until release',()=>{
  const f=fixture();
  f.button(0,'start');f.hud.render();
  assert.equal((f.hud.pause as any).string,'暂停');
  assert.match((f.hud.status as any).string,/人类 50/);
  assert.equal(f.hud.boxes[0].pressed,true);
  assert.ok(f.hud.g.calls.some((call:any)=>call.kind==='roundRect'&&call.color.hex==='#355B61'));

  f.button(0,'end');f.hud.render();
  assert.equal(f.controller.session.paused,true);
  assert.equal((f.hud.pause as any).string,'继续');
  assert.equal(f.hud.boxes[0].pressed,false);
  assert.equal((f.root.getChildByName('Restart') as any).components.find((c:any)=>c.string!==undefined).string,'重新开始');
});

test('selected units fade in, and moving arrows mark the destination at a smaller scale',()=>{
  const f=fixture(),view=f.unitView,unit=human();
  view.render([unit] as any,['human-1'],10);
  const first=(view.g.calls.find((call:any)=>call.kind==='stroke') as any).color.a;
  view.render([unit] as any,['human-1'],10.075);
  const middle=(view.g.calls.find((call:any)=>call.kind==='stroke') as any).color.a;
  assert.ok(middle>first);

  const moving=human({state:'Moving',moveTarget:{x:180,y:400}});
  view.render([moving] as any,null,11);
  assert.deepEqual(view.g.calls.find((call:any)=>call.kind==='lineTo').args,[108,-400]);
  assert.ok(view.g.calls.some((call:any)=>call.kind==='circle'&&call.args[0]===180&&call.args[1]===-400&&call.args[2]===3));
});

test('melee damage draws a short expanding pulse on the attacked human',()=>{
  const f=fixture(),view=f.unitView,target=human();
  const attacker=human({id:'zombie-1',unitType:'normal_zombie',faction:'zombie',state:'Attacking',targetId:target.id});
  const hit=[{type:'damage',time_s:1,data:{sourceId:attacker.id,targetId:target.id,amount:10,hp:90}}];
  view.render([attacker,target] as any,null,1,hit as any);
  assert.ok(view.g.calls.some((call:any)=>call.kind==='circle'&&call.args[0]===target.position.x&&call.args[2]===8));
  // Events are delivered once per adapter draw; subsequent frames only age
  // the retained pulse instead of replaying the same damage event.
  view.render([attacker,target] as any,null,1.12);
  assert.ok(view.g.calls.some((call:any)=>call.kind==='circle'&&call.args[0]===target.position.x&&call.args[2]>12));
  view.render([attacker,target] as any,null,1.25);
  assert.ok(!view.g.calls.some((call:any)=>call.kind==='circle'&&call.args[0]===target.position.x&&call.args[2]>12));
});

test('the open battlefield boundary uses one four-sided perimeter indicator',()=>{
  const f=fixture(true),map=(f.controller as any).map;
  map.render(['A'],.03);
  assert.equal(map.warning.calls.filter((call:any)=>call.kind==='moveTo').length,4);
  assert.ok(map.warning.calls.some((call:any)=>call.kind==='moveTo'&&call.args[0]===60&&call.args[1]===-180));
  assert.ok(map.base.calls.some((call:any)=>call.kind==='rect'&&call.args[0]===350&&call.args[2]===40));
});
