import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';

test('reads an initial battle snapshot', () => {
  const harness = new BattleTestHarness();

  harness.start('LV01_zombie_wave', 1);
  harness.advance(3);

  assert.deepEqual(harness.getSnapshot(), {
    time_s: 0,
    aliveHumans: 15,
    // The first 5-zombie edge batch appears when deployment ends.
    aliveZombies: 5,
    spawnedZombies: 5,
    waveIndex: 1,
    breachedRoutes: [],
    result: 'running',
  });
  // Task 2: the first wave (battle time 0s) spawns once deployment ends.
  assert.deepEqual(
    harness.getEvents().map((e) => e.type),
    ['wave_spawn', 'zombie_batch_spawn'],
  );
});
