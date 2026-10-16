import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { WaveManager, type WaveSpawnEventData } from '../../src/core/WaveManager.js';

const expectedSpawns = [
  [{ unitType: 'normal_zombie', route: 'B', count: 50 }],
  [{ unitType: 'normal_zombie', route: 'A', count: 50 }, { unitType: 'normal_zombie', route: 'C', count: 50 }],
  [{ unitType: 'normal_zombie', route: 'A', count: 60 }, { unitType: 'normal_zombie', route: 'B', count: 80 }, { unitType: 'normal_zombie', route: 'C', count: 60 }],
];

for (const [index, time] of [0, 7, 20].entries()) {
  test(`wave ${index + 1} emits exact per-route counts at ${time}s`, () => {
    const harness = new BattleTestHarness();
    harness.start('LV01_zombie_wave', 1);
    harness.advance(3 + time);
    const event = harness.getEvents().filter(e => e.type === 'wave_spawn')[index];
    assert.deepEqual((event.data as WaveSpawnEventData).spawns, expectedSpawns[index]);
    assert.equal(event.time_s, time);
    assert.equal(harness.getSnapshot().spawnedZombies, [50, 150, 350][index]);
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
  assert.equal(harness.getSnapshot().spawnedZombies, 50);
  assert.equal(harness.getEvents()[0].time_s, 0);
});

test('explicit deployment ending emits the zero-time wave immediately and only once', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(1);
  harness.endDeployment();
  assert.equal(harness.getSnapshot().spawnedZombies, 50);
  assert.equal(harness.getSnapshot().time_s, 0);
  harness.endDeployment();
  harness.advance(0);
  assert.equal(harness.getEvents().length, 1);
  harness.advance(7);
  assert.equal(harness.getSnapshot().time_s, 7);
  assert.equal(harness.getSnapshot().spawnedZombies, 150);
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
  assert.equal(harness.getSnapshot().spawnedZombies, 350);
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

test('zero-duration deployment can process the boundary through advance(0)', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 0, initialHumans: 50 });
  harness.start('LV01_zombie_wave', 1);
  harness.advance(0);
  assert.equal(harness.getSnapshot().spawnedZombies, 50);
  harness.advance(0);
  assert.equal(harness.getEvents().length, 1);
});
