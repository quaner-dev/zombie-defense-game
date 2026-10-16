import test from 'node:test';
import assert from 'node:assert/strict';
import units from '../../config/units.json' with { type: 'json' };
import map from '../../config/map.json' with { type: 'json' };
import { MapModel } from '../../src/core/MapModel.js';

test('global pursuit calibrated defaults preserve HP and damage', () => {
  assert.equal(units.normal_zombie.speed_px_per_s, 41.9);
  assert.equal(units.normal_zombie.attack_interval_s, 0.13);
  assert.equal(units.rifleman.attack_range_px, 400);
  assert.equal(units.normal_zombie.hitPoints, 40);
  assert.equal(units.normal_zombie.damagePerHit, 10);
  assert.equal(units.rifleman.damagePerHit, 10);
  assert.deepEqual((map as any).spawn_layout, { columns: 9, spacing_px: 5 });
  assert.ok(map.routes.every(r => !('spawn_layout' in r)));
});

test('candidate C layout applies to every route and clamps configurable layouts', () => {
  const model = MapModel.load();
  for (const [route, x] of [['A',180],['B',540],['C',900]] as const) {
    const positions = model.spawnPositions(route, 50);
    assert.deepEqual(positions[0], { x: x - 20, y: 260 });
    assert.deepEqual(positions[9], { x: x - 20, y: 265 });
    assert.equal(new Set(positions.map(p => `${p.x},${p.y}`)).size, 50);
  }
  const definition = structuredClone(map);
  (definition as any).spawn_layout = { columns: 3, spacing_px: 1000 };
  const custom = new MapModel(definition);
  const positions = custom.spawnPositions('A', 100);
  assert.deepEqual(positions[0], { x: 60, y: 260 });
  assert.deepEqual(positions[2], { x: 300, y: 260 });
  assert.ok(positions.every(p => p.x >= 60 && p.x <= 1020 && p.y >= 180 && p.y <= 2160));
});
