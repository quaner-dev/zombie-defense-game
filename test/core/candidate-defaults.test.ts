import test from 'node:test';
import assert from 'node:assert/strict';
import units from '../../config/units.json' with { type: 'json' };
import map from '../../config/map.json' with { type: 'json' };
import { MapModel, type MapDefinition } from '../../src/core/MapModel.js';

test('calibrated defaults increase rifle cadence and zombie HP while preserving movement and damage', () => {
  assert.equal(units.normal_zombie.speed_px_per_s, 41.9);
  assert.equal(units.normal_zombie.attack_interval_s, 0.13);
  assert.equal(units.rifleman.attack_range_px, 260);
  assert.ok(units.rifleman.attack_range_px <= units.projectile.speed_px_per_s * units.projectile.max_flight_time_s);
  assert.equal(units.rifleman.speed_px_per_s, 48);
  assert.ok(units.rifleman.speed_px_per_s > units.normal_zombie.speed_px_per_s);
  assert.ok(units.rifleman.speed_px_per_s / units.normal_zombie.speed_px_per_s < 1.2);
  assert.equal(units.normal_zombie.hitPoints, 60);
  assert.equal(units.rifleman.attack_interval_s, 0.35);
  assert.equal(units.normal_zombie.damagePerHit, 10);
  assert.equal(units.rifleman.damagePerHit, 10);
  assert.deepEqual((map as any).spawn_layout, { columns: 25, spacing_px: 22 });
  assert.ok(map.routes.every(r => !('spawn_layout' in r)));
});

test('zombies spawn in distinct spreads along all four battlefield edges', () => {
  const model = MapModel.load();
  for (const [side, point] of [['north','north'],['south','south'],['east','east'],['west','west']] as const) {
    const positions = model.spawnPositions('A', 50, point);
    assert.equal(new Set(positions.map(p => `${p.x},${p.y}`)).size, 50);
    if (side === 'north') assert.ok(positions.every(p => p.y < 230));
    if (side === 'south') assert.ok(positions.every(p => p.y > 2110));
    if (side === 'east') assert.ok(positions.every(p => p.x > 990));
    if (side === 'west') assert.ok(positions.every(p => p.x < 90));
  }
  const definition = structuredClone(map) as unknown as MapDefinition;
  (definition as any).spawn_layout = { columns: 3, spacing_px: 1000 };
  const custom = new MapModel(definition);
  const positions = custom.spawnPositions('A', 100, 'north');
  assert.deepEqual(positions[0], { x: 90, y: 180 });
  assert.deepEqual(positions[2], { x: 990, y: 180 });
  assert.ok(positions.every(p => p.x >= 60 && p.x <= 1020 && p.y >= 180 && p.y <= 2160));
});

test('the wall config blocks movement and requires a three-zombie stack', () => {
  const model = MapModel.load();
  const wall = model.terrain.find(item => item.id === 'north-barricade')!;
  assert.equal(wall.blocksMovement, true);
  assert.equal(wall.stackRequired, 3);
  assert.deepEqual(model.firstBlockingTerrain({x:540,y:1040},{x:540,y:1080},8)?.terrain.id,'north-barricade');
  assert.equal(model.firstBlockingTerrain({x:300,y:1040},{x:300,y:1080},8),null);
});

test('wall contact blocks a long step through the wall but permits retreat', () => {
  const model = MapModel.load();
  const contact = { x: 540, y: 1052 };
  assert.equal(model.firstBlockingTerrain(contact, { x: 540, y: 1400 }, 8)?.fraction, 0);
  assert.equal(model.firstBlockingTerrain(contact, { x: 540, y: 1000 }, 8), null);
});
