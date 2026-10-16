import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';

test('reads an initial battle snapshot', () => {
  const harness = new BattleTestHarness();

  harness.start('LV01_zombie_wave', 1);
  harness.advance(3);

  assert.deepEqual(harness.getSnapshot(), {
    time_s: 0,
    aliveHumans: 50,
    // Task 2: battle time 0s spawns the first wave (50 center zombies).
    aliveZombies: 50,
    spawnedZombies: 50,
    waveIndex: 1,
    breachedRoutes: [],
    result: 'running',
  });
  // Task 2: the first wave (battle time 0s) spawns once deployment ends.
  assert.deepEqual(
    harness.getEvents().map((e) => e.type),
    ['wave_spawn'],
  );
});
