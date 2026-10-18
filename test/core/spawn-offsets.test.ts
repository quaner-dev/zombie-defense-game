import test from 'node:test';
import assert from 'node:assert/strict';
import { MapModel } from '../../src/core/MapModel.js';
import { SpawnSystem } from '../../src/core/SpawnSystem.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import type { WaveSpawnEventData } from '../../src/core/WaveManager.js';

function wave(waveIndex: number, battleTime_s: number): WaveSpawnEventData {
  return { waveIndex, battleTime_s, batchSize: 1, batchInterval_s: 0, spawns: [
    { unitType: 'normal_zombie', route: 'B', spawnPoint: 'corridor-north', count: 1 },
  ] };
}

test('spawn positions rotate across waves and reset with the battle', () => {
  const store = new UnitStore();
  const spawns = new SpawnSystem(store, MapModel.load('LV01_cabin_rooms'));

  spawns.enqueue(wave(0, 0));
  spawns.update(0);
  const first = store.living()[0].position;

  spawns.enqueue(wave(1, 1));
  spawns.update(1);
  const second = store.living()[1].position;
  assert.notDeepEqual(second, first);

  store.clear();
  spawns.reset();
  spawns.enqueue(wave(0, 2));
  spawns.update(2);
  assert.deepEqual(store.living()[0].position, first);
});

test('incremental edge spawns keep the same centered grid as a single batch', () => {
  const map = new MapModel({
    battle_bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    defense_line_y: 50,
    spawn_layout: { columns: 4, spacing_px: 10 },
    routes: [{ id: 'A', spawn: { x: 50, y: 0 }, defend: { x: 50, y: 50 }, width: 40, waypoints: [{ x: 50, y: 50 }] }],
    spawnPoints: [{ id: 'north', x: 50, y: 0, side: 'north', width: 40 }],
    terrain: [],
  });

  const batch = map.spawnPositions('A', 8, 'north', 0);
  const incremental = Array.from({ length: 8 }, (_, index) => map.spawnPositions('A', 1, 'north', index)[0]);
  assert.deepEqual(incremental, batch);
  assert.deepEqual(batch.slice(0, 4), [
    { x: 35, y: 0 }, { x: 45, y: 0 }, { x: 55, y: 0 }, { x: 65, y: 0 },
  ]);
});
