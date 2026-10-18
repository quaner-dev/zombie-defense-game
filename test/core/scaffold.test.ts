import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';

test('reads an initial battle snapshot', () => {
  const harness = new BattleTestHarness();

  harness.start('LV01_zombie_wave', 1);
  harness.advance(3);

  const snapshot = harness.getSnapshot();
  assert.equal(snapshot.time_s, 0);
  assert.equal(snapshot.aliveHumans, 9);
  // The first 10-zombie corridor batch appears when deployment ends.
  assert.equal(snapshot.aliveZombies, 10);
  assert.equal(snapshot.spawnedZombies, 10);
  assert.equal(snapshot.waveIndex, 1);
  assert.deepEqual(snapshot.breachedRoutes, []);
  assert.equal(snapshot.result, 'running');
  assert.equal(snapshot.stats.byUnitType.sniper.spawned, 1);
  assert.equal(snapshot.stats.byUnitType.engineer.spawned, 1);
  // Task 2: the first wave (battle time 0s) spawns once deployment ends.
  assert.deepEqual(
    harness.getEvents().map((e) => e.type),
    ['wave_spawn', 'zombie_batch_spawn'],
  );
});
