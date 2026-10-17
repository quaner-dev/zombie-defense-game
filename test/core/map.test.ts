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
    assert.deepEqual(route.spawn, { x, y: -40 });
    assert.deepEqual(route.defend, { x, y: 1370 });
    assert.equal(route.width, 240);
    assert.deepEqual(route.waypoints, [{ x, y: -40 }, { x, y: 1370 }]);
    assert.deepEqual(map.getSpawnPoint(id), { id, x, y: -40 });
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

for (const top of [NaN, Infinity, -Infinity, 181]) {
  test(`map rejects invalid spawn boundary ${top}`, () => {
    const data = definition();
    data.spawn_bounds = { top };
    assert.throws(() => new MapModel(data), /spawn bounds/i);
  });
}

test('offscreen entry is allowed only for spawn points and the initial waypoint', () => {
  const data = definition();
  const map = new MapModel(data);
  assert.equal(map.spawn_top, -180);
  for (const select of [
    (d: MapDefinition) => d.routes[0].spawn,
    (d: MapDefinition) => d.routes[0].waypoints[0],
    (d: MapDefinition) => d.spawnPoints[0],
  ]) {
    for (const point of [{ x: 180, y: -181 }, { x: 59, y: -40 }, { x: NaN, y: -40 }, { x: 180, y: Infinity }]) {
      const invalid = definition();
      Object.assign(select(invalid), point);
      assert.throws(() => new MapModel(invalid), /outside battlefield bounds/);
    }
    const boundary = definition();
    select(boundary).y = -180;
    assert.doesNotThrow(() => new MapModel(boundary));
  }
  const interior = definition();
  interior.routes[0].waypoints.splice(1, 0, { x: 180, y: -40 });
  assert.throws(() => new MapModel(interior), /outside battlefield bounds/);
  const defend = definition();
  defend.routes[0].defend.y = -40;
  assert.throws(() => new MapModel(defend), /outside battlefield bounds/);
});

test('maps without spawn bounds retain battlefield-only entry and downward spawn rows', () => {
  const data = definition();
  delete data.spawn_bounds;
  for (const route of data.routes) {
    route.spawn.y = 260;
    route.waypoints[0].y = 260;
  }
  for (const spawn of data.spawnPoints) spawn.y = 260;
  data.spawn_layout = { columns: 2, spacing_px: 20 };
  const map = new MapModel(data);
  assert.equal(map.spawn_top, 180);
  assert.deepEqual(map.spawnPositions('A', 4), [
    { x: 170, y: 260 }, { x: 190, y: 260 },
    { x: 170, y: 280 }, { x: 190, y: 280 },
  ]);
  data.routes[0].spawn.y = 179;
  assert.throws(() => new MapModel(data), /outside battlefield bounds/);
});

test('offscreen rows extend upward and clamp at the configured spawn boundary', () => {
  const data = definition();
  data.spawn_layout = { columns: 2, spacing_px: 100 };
  const map = new MapModel(data);
  assert.deepEqual(map.spawnPositions('A', 6), [
    { x: 130, y: -40 }, { x: 230, y: -40 },
    { x: 130, y: -140 }, { x: 230, y: -140 },
    { x: 130, y: -180 }, { x: 230, y: -180 },
  ]);
  assert.deepEqual(map.spawnPositions('A', 0), []);
});

test('map rejects waypoints outside battlefield and routes ending above defense line', () => {
  const outside = definition();
  outside.routes[0].waypoints[0].x = 1440;
  assert.throws(() => new MapModel(outside), /bounds/i);
  const short = definition();
  short.routes[0].waypoints[short.routes[0].waypoints.length - 1].y = 1100;
  assert.throws(() => new MapModel(short), /defense/i);
});
