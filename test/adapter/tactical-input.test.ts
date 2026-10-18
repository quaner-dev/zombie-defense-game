import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';
import { mapToScreen } from '../../assets/scripts/adapter/contracts.js';

test('three opening InputManager drags submit one captured soldier per route', () => {
  const f = fixture(true), c = f.controller, s = c.session;
  s.tick(3);
  const captured: any[] = [];
  for (const stage of [{ at: 0, y: 1400 }]) {
    s.tick(stage.at - s.snapshot.time_s);
    for (const [i, region] of ['A', 'B', 'C'].entries()) {
      const group = s.battle.getUnits().filter((u: any) => u.faction === 'human' && u.active && u.hp > 0 && u.routeId === region);
      const center = { x: group.reduce((n: number,u: any) => n + u.position.x,0)/group.length,
        y: group.reduce((n: number,u: any) => n + u.position.y,0)/group.length };
      const target = { x: [450,540,630][i], y: stage.y };
      const press = mapToScreen(center,c.frame), release = mapToScreen(target,c.frame);
      const selected = group.slice().sort((a: any,b: any) =>
        Math.hypot(a.position.x-center.x,a.position.y-center.y)-Math.hypot(b.position.x-center.x,b.position.y-center.y) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
      f.advanceTime(301); // Respect the real gesture cooldown; no extra battle time is submitted.
      f.touch('start',1,press.x,press.y);
      assert.ok(f.controls.drag.preview,`stage ${stage.at} region ${region} accepts a gesture`);
      assert.deepEqual(Array.from(f.controls.drag.preview.unitIds),[selected.id]);
      f.touch('end',1,release.x,release.y);
      const event = s.battle.getEvents().filter((e: any) => e.type === 'group_command').at(-1);
      assert.equal(event.time_s,stage.at);
      assert.equal(event.data.issuedAt_s,stage.at);
      assert.deepEqual(Array.from(event.data.unitIds),[selected.id]);
      // Screen/map conversion permits floating point roundoff, never an altered target.
      assert.ok(Math.abs(event.data.target.x-target.x)<1e-9 && Math.abs(event.data.target.y-target.y)<1e-9);
      captured.push({ at:stage.at, region, center, ids:Array.from(event.data.unitIds) });
    }
  }
  assert.ok(captured.every(c => c.ids.length >= 1));
  s.tick(110);
  assert.equal(s.snapshot.result,'win');
  assert.ok(s.snapshot.aliveHumans>0);
  assert.equal(s.battle.getEvents().filter((e: any) => e.type === 'group_command').length,3);
  c.onDestroy();
});
