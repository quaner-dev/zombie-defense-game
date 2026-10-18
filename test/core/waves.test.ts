import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { WaveManager, type WaveSpawnEventData } from '../../src/core/WaveManager.js';
import { MapModel } from '../../src/core/MapModel.js';

const expectedSpawns = [
  [
    { unitType: 'normal_zombie', route: 'B', spawnPoint: 'north', count: 13 },
    { unitType: 'normal_zombie', route: 'B', spawnPoint: 'south', count: 13 },
    { unitType: 'normal_zombie', route: 'B', spawnPoint: 'east', count: 12 },
    { unitType: 'normal_zombie', route: 'B', spawnPoint: 'west', count: 12 },
  ],
  [
    { unitType: 'normal_zombie', route: 'A', spawnPoint: 'north', count: 21 },
    { unitType: 'fat_zombie', route: 'A', spawnPoint: 'north', count: 2 },
    { unitType: 'zombie_mother', route: 'A', spawnPoint: 'north', count: 2 },
    { unitType: 'normal_zombie', route: 'A', spawnPoint: 'south', count: 25 },
    { unitType: 'normal_zombie', route: 'C', spawnPoint: 'east', count: 25 },
    { unitType: 'normal_zombie', route: 'C', spawnPoint: 'west', count: 25 },
  ],
  [
    { unitType: 'normal_zombie', route: 'A', spawnPoint: 'north', count: 11 },
    { unitType: 'fat_zombie', route: 'A', spawnPoint: 'north', count: 2 },
    { unitType: 'zombie_mother', route: 'A', spawnPoint: 'north', count: 2 },
    ...['A','B','C'].flatMap((route, routeIndex) => ['north','south','east','west'].map(spawnPoint => ({
      unitType: 'normal_zombie', route,
      spawnPoint,
      count: routeIndex === 1 ? 20 : 15,
    })).filter(spawn => route !== 'A' || spawn.spawnPoint !== 'north')),
  ],
];

for (const [index, time] of [0, 7, 20].entries()) {
  test(`wave ${index + 1} emits exact per-route counts at ${time}s`, () => {
    const harness = new BattleTestHarness();
    harness.start('LV01_zombie_wave', 1);
    harness.advance(3 + time);
    const event = harness.getEvents().filter(e => e.type === 'wave_spawn')[index];
    assert.deepEqual((event.data as WaveSpawnEventData).spawns, expectedSpawns[index]);
    assert.equal(event.time_s, time);
    assert.equal(harness.getSnapshot().spawnedZombies, [5, 45, 125][index]);
  });
}

test('deployment suppresses waves and battle clock until its exact boundary', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(2.5);
  harness.advance(0);
  assert.equal(harness.getSnapshot().time_s, 0);
  assert.equal(harness.getSnapshot().spawnedZombies, 0);
  assert.deepEqual(harness.getEvents(), []);
  harness.advance(0.5);
  assert.equal(harness.getSnapshot().time_s, 0);
  assert.equal(harness.getSnapshot().spawnedZombies, 5);
  assert.equal(harness.getEvents()[0].time_s, 0);
  assert.equal(harness.getEvents().filter(event => event.type === 'zombie_batch_spawn').length, 1);
});

test('explicit deployment ending emits the zero-time wave immediately and only once', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(1);
  harness.endDeployment();
  assert.equal(harness.getSnapshot().spawnedZombies, 5);
  assert.equal(harness.getSnapshot().time_s, 0);
  harness.endDeployment();
  harness.advance(0);
  assert.equal(harness.getEvents().filter(event => event.type === 'wave_spawn').length, 1);
  assert.equal(harness.getEvents().filter(event => event.type === 'zombie_batch_spawn').length, 1);
  harness.advance(7);
  assert.equal(harness.getSnapshot().time_s, 7);
  assert.equal(harness.getSnapshot().spawnedZombies, 45);
});

test('snapshot uses battle clock and excludes deployment on overshoot', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(5);
  assert.equal(harness.getSnapshot().time_s, 2);
  harness.advance(0.5);
  assert.equal(harness.getSnapshot().time_s, 2.5);
  harness.start('LV01_zombie_wave', 1);
  assert.equal(harness.getSnapshot().time_s, 0);
  assert.deepEqual(harness.getEvents(), []);
});

test('waves fire at thresholds, not before, without clearing previous waves', () => {
  const manager = WaveManager.load('LV01_zombie_wave');
  assert.deepEqual(manager.update(-0.001), []);
  assert.equal(manager.update(0).length, 1);
  assert.deepEqual(manager.update(6.999), []);
  assert.equal(manager.update(7).length, 1);
  assert.deepEqual(manager.update(19.999), []);
  assert.equal(manager.update(20).length, 1);
  assert.deepEqual(manager.update(20), []);
  assert.deepEqual(manager.update(100), []);
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(23);
  assert.equal(harness.getSnapshot().spawnedZombies, 125);
  assert.equal(harness.getSnapshot().aliveZombies,
    harness.getUnits().filter(u => u.faction === 'zombie' && u.hp > 0).length);
  assert.equal(harness.getSnapshot().result, 'running');
});

test('late updates retain scheduled timestamps for every emitted wave', () => {
  const manager = WaveManager.load('LV01_zombie_wave');
  assert.deepEqual(manager.update(25).map(event => event.time_s), [0, 7, 20]);
  assert.deepEqual(manager.update(25), []);
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(28);
  assert.deepEqual(harness.getEvents().filter(e => e.type === 'wave_spawn').map(event => event.time_s), [0, 7, 20]);
  assert.equal(harness.getSnapshot().time_s, 25);
});

test('wave map validation rejects unknown cardinal spawn points', () => {
  const invalid = new WaveManager({ mapId: 'default', waves: [{ battleTime_s: 0, spawns: [
    { unitType: 'normal_zombie', route: 'A', spawnPoint: 'missing', count: 1 },
  ] }] });
  assert.throws(() => invalid.validateMap(MapModel.load()), /spawn point.*missing/i);
});

test('zero-duration deployment can process the boundary through advance(0)', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 0, initialHumans: 50 });
  harness.start('LV01_zombie_wave', 1);
  harness.advance(0);
  assert.equal(harness.getSnapshot().spawnedZombies, 5);
  harness.advance(0);
  assert.equal(harness.getEvents().filter(event => event.type === 'wave_spawn').length, 1);
  assert.equal(harness.getEvents().filter(event => event.type === 'zombie_batch_spawn').length, 1);
});
