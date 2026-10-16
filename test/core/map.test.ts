import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MapModel, type MapDefinition } from '../../src/core/MapModel.js';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { WaveManager } from '../../src/core/WaveManager.js';

function definition(): MapDefinition {
  return JSON.parse(readFileSync(new URL('../../config/map.json', import.meta.url), 'utf8'));
}

test('map exposes documented vertical routes, bounds and defense geometry', () => {
  const map = MapModel.load();
  assert.deepEqual(map.battle_bounds, { left: 60, top: 180, right: 1020, bottom: 2160 });
  assert.equal(map.defense_line_y, 1200);
  for (const [id, x] of [['A', 180], ['B', 540], ['C', 900]] as const) {
    const route = map.getRoute(id)!;
    assert.deepEqual(route.spawn, { x, y: 260 });
    assert.deepEqual(route.defend, { x, y: 1370 });
    assert.equal(route.width, 240);
    assert.deepEqual(route.waypoints, [{ x, y: 260 }, { x, y: 1370 }]);
    assert.deepEqual(map.getSpawnPoint(id), { id, x, y: 260 });
  }
  assert.equal(map.getRoute('center'), undefined);
  assert.equal(map.getRoute('Z'), undefined);
});

test('harness retains loaded map and validates all scheduled spawn routes', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  const map = harness.getMapModel();
  assert.ok(map instanceof MapModel);
  harness.advance(23);
  for (const event of harness.getEvents().filter(e => e.type === 'wave_spawn')) {
    for (const spawn of (event.data as { spawns: { route: string }[] }).spawns) {
      assert.ok(map.getRoute(spawn.route));
    }
  }
  const invalid = new WaveManager({ mapId: 'default', waves: [{ battleTime_s: 0, spawns: [{ route: 'missing', unitType: 'normal_zombie', count: 1 }] }] });
  assert.throws(() => invalid.validateMap(map), /route.*missing/i);
});

test('map rejects waypoints outside battlefield and routes ending above defense line', () => {
  const outside = definition();
  outside.routes[0].waypoints[0].x = 1440;
  assert.throws(() => new MapModel(outside), /bounds/i);
  const short = definition();
  short.routes[0].waypoints[short.routes[0].waypoints.length - 1].y = 1100;
  assert.throws(() => new MapModel(short), /defense/i);
});
