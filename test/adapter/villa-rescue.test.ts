import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';

function enterVilla() {
  const f=fixture(true,undefined,{console:undefined},undefined,true);
  f.button(1,'start');f.button(1,'end');
  f.button(2,'start');f.button(2,'end');f.confirm();
  return f;
}

test('production villa draws six blue civilians, visible windows and the southeast door immediately', () => {
  const f=enterVilla(),c=f.controller,s=c.session;
  assert.equal(s.activeScene.id,'villa-rescue');
  assert.equal(s.deploymentRemaining,0);
  const circles=c.units.g.calls.filter((call:any)=>call.kind==='circle'&&call.args[2]===14&&call.fill?.hex==='#4BA3FF');
  assert.equal(circles.length,6);
  for(const civilian of s.battle.getCivilians()) {
    assert.ok(circles.some((call:any)=>call.args[0]===civilian.position.x&&call.args[1]===-civilian.position.y));
  }
  const entrances=c.map.doors.calls.filter((call:any)=>call.kind==='rect');
  assert.equal(entrances.filter((call:any)=>call.color?.hex==='#326F8B').length,4);
  assert.ok(entrances.some((call:any)=>call.color?.hex==='#95653E'&&call.args.join(',')==='656,-1600,140,24'));
  assert.match(c.hud.status.string,/平民：6\/6/);
  assert.doesNotMatch(c.hud.status.string,/波/);
  assert.equal(c.hud.waveBanner.node.active,false);
  c.onDestroy();
});

test('breaking a window removes the glass drawing while preserving adjacent walls', () => {
  const f=enterVilla(),c=f.controller,s=c.session;
  const walls=JSON.stringify(c.map.base.calls);
  s.map.damageDoor('villa-window-north',180);c.draw();
  assert.equal(c.map.doors.calls.filter((call:any)=>call.kind==='rect'&&call.color?.hex==='#326F8B').length,3);
  assert.equal(JSON.stringify(c.map.base.calls),walls);
  assert.match(c.hud.status.string,/北窗已破/);
  c.onDestroy();
});

test('civilian transform freezes on pause, renders warning, fails, and resets on replay', () => {
  const f=enterVilla(),c=f.controller,s=c.session;
  s.battle.hitCivilian('civilian-1');s.tick(.4);c.draw();
  assert.match(c.hud.status.string,/变身中/);
  assert.ok(c.units.g.calls.some((call:any)=>call.kind==='circle'&&call.fill?.hex==='#4266AA'));
  const elapsed=s.battle.getCivilians()[0].transformElapsed_s;
  s.paused=true;s.tick(10);assert.equal(s.battle.getCivilians()[0].transformElapsed_s,elapsed);
  s.paused=false;s.tick(.4);c.draw();
  assert.equal(s.snapshot.result,'lose');
  assert.match(c.hud.result.string,/平民被感染，解救失败/);
  assert.doesNotMatch(c.hud.result.string,/评分|星级|伤害|击杀|波/);
  assert.equal(c.units.g.calls.filter((call:any)=>call.kind==='circle'&&call.args[2]===14&&call.fill?.hex==='#4BA3FF').length,5);
  c.restart();f.confirm();
  assert.equal(s.snapshot.civiliansRemaining,6);
  assert.equal(c.units.g.calls.filter((call:any)=>call.kind==='circle'&&call.args[2]===14&&call.fill?.hex==='#4BA3FF').length,6);
  assert.ok(s.map.getEntranceStates().every((e:any)=>!e.destroyed&&e.hp===e.maxHp));
  c.onDestroy();
});

test('three scene buttons and the back button have separate touch areas', () => {
  const f=fixture(true,undefined,{console:undefined},undefined,true);
  f.button(1,'start');f.button(1,'end');
  const boxes=f.hud.boxes;
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
    const a=boxes[i],b=boxes[j];
    assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
  }
  assert.doesNotMatch(f.hud.sceneLabels[2].string,/波/);
  f.controller.onDestroy();
});
