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
    aliveZombies: 0,
    spawnedZombies: 0,
    waveIndex: 0,
    breachedRoutes: [],
    result: 'running',
  });
  assert.deepEqual(harness.getEvents(), []);
});
