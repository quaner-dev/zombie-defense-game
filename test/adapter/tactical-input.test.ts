import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';
import { mapToScreen } from '../../assets/scripts/adapter/contracts.js';

test('three opening InputManager drags position the two flamethrowers and shield for a surviving victory', () => {
  const f = fixture(true), c = f.controller, s = c.session;
  s.tick(3);
  const captured: any[] = [];
  const humans=s.battle.getUnits().filter((u:any)=>u.faction==='human');
  const soldiers=[...humans.filter((u:any)=>u.unitType==='flamethrower'),...humans.filter((u:any)=>u.unitType==='shield')];
  const targets=[{x:330,y:1560},{x:330,y:1620},{x:375,y:1590}];
  for (const [i, selected] of soldiers.entries()) {
      const center = {...selected.position};
      const target = targets[i];
      const press = mapToScreen(center,c.frame), release = mapToScreen(target,c.frame);
      f.advanceTime(301); // Respect the real gesture cooldown; no extra battle time is submitted.
      f.touch('start',1,press.x,press.y);
      assert.ok(f.controls.drag.preview,`${selected.unitType} ${selected.id} accepts a gesture`);
      assert.deepEqual(Array.from(f.controls.drag.preview.unitIds),[selected.id]);
      f.touch('end',1,release.x,release.y);
      const event = s.battle.getEvents().filter((e: any) => e.type === 'group_command').at(-1);
      assert.equal(event.time_s,0);
      assert.equal(event.data.issuedAt_s,0);
      assert.deepEqual(Array.from(event.data.unitIds),[selected.id]);
      // Screen/map conversion permits floating point roundoff, never an altered target.
      assert.ok(Math.abs(event.data.target.x-target.x)<1e-9 && Math.abs(event.data.target.y-target.y)<1e-9);
      captured.push({ at:0, center, ids:Array.from(event.data.unitIds) });
  }
  assert.ok(captured.every(c => c.ids.length >= 1));
  s.tick(110);
  assert.equal(s.snapshot.result,'win');
  assert.ok(s.snapshot.aliveHumans>0);
  assert.equal(s.battle.getEvents().filter((e: any) => e.type === 'group_command').length,3);
  c.onDestroy();
});
