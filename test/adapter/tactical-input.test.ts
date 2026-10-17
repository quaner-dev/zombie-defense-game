import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';
import { mapToScreen } from '../../assets/scripts/adapter/contracts.js';

test('six real InputManager centroid drags reproduce the current viewport victory benchmark', () => {
  const f = fixture(true), c = f.controller, s = c.session;
  s.tick(3);
  const captured: any[] = [];
  for (const stage of [{ at: 28, y: 1550 }, { at: 52, y: 1750 }]) {
    s.tick(stage.at - s.snapshot.time_s);
    for (const [i, region] of ['A', 'B', 'C'].entries()) {
      const group = s.battle.getUnits().filter((u: any) => u.faction === 'human' && u.active && u.hp > 0 && u.routeId === region);
      const center = { x: group.reduce((n: number,u: any) => n + u.position.x,0)/group.length,
        y: group.reduce((n: number,u: any) => n + u.position.y,0)/group.length };
      const target = { x: [180,540,900][i], y: stage.y };
      const press = mapToScreen(center,c.frame), release = mapToScreen(target,c.frame);
      f.advanceTime(301); // Respect the real gesture cooldown; no extra battle time is submitted.
      f.touch('start',1,press.x,press.y);
      assert.ok(f.controls.drag.preview,`stage ${stage.at} region ${region} accepts a gesture`);
      assert.deepEqual(Array.from(f.controls.drag.preview.unitIds).sort(),Array.from(group,(u: any) => u.id).sort());
      f.touch('end',1,release.x,release.y);
      const event = s.battle.getEvents().filter((e: any) => e.type === 'group_command').at(-1);
      assert.equal(event.time_s,stage.at);
      assert.equal(event.data.issuedAt_s,stage.at);
      assert.deepEqual(Array.from(event.data.unitIds).sort(),Array.from(group,(u: any) => u.id).sort());
      // Screen/map conversion permits floating point roundoff, never an altered target.
      assert.ok(Math.abs(event.data.target.x-target.x)<1e-9 && Math.abs(event.data.target.y-target.y)<1e-9);
      captured.push({ at:stage.at, region, center, ids:Array.from(event.data.unitIds) });
    }
  }
  // The first casualty now occurs before the second-stage A-route command;
  // the acceptance report is the source of truth for this living-group count.
  assert.deepEqual(captured.map(c => c.ids.length),[17,17,16,14,17,16]);
  assert.ok(captured[3].center.y > captured[0].center.y,'second stage recaptures current living positions');
  s.tick(85);
  assert.equal(s.snapshot.result,'win');
  assert.equal(s.snapshot.aliveHumans,22);
  assert.equal(s.snapshot.aliveZombies,0);
  assert.equal(s.snapshot.time_s,68.05);
  assert.equal(s.battle.getEvents().filter((e: any) => e.type === 'group_command').length,6);
  c.onDestroy();
});
