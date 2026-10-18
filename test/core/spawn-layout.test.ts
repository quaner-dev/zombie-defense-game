import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import map from '../../config/map.json' with { type: 'json' };

test('cardinal waves enter in five-zombie batches across all battlefield edges', () => {
  const previous = (map as any).spawn_layout;
  (map as any).spawn_layout = { columns: 9, spacing_px: 20 };
  try {
    const spawn = () => {
      const h = new BattleTestHarness(); h.start('LV01_zombie_wave', 1); h.advance(3);
      return { units: h.getUnits().filter(u => u.faction === 'zombie'), events: h.getEvents() };
    };
    const first = spawn();
    const units = first.units;
    const positions = units.map(u => u.position);
    assert.equal(units.length, 5);
    assert.equal(new Set(positions.map(p => `${p.x},${p.y}`)).size, 5);
    assert.deepEqual(spawn().units.map(u => u.position), positions);
    assert.deepEqual(Object.fromEntries(['north','south','east','west'].map(side =>
      [side, units.filter(u => u.spawnPointId === side).length])),
      { north: 2, south: 1, east: 1, west: 1 });
    assert.equal(first.events.filter(event => event.type === 'zombie_batch_spawn').length, 1);
    assert.equal((first.events.find(event => event.type === 'zombie_batch_spawn')!.data as any).batchSize, 5);
    assert.deepEqual(units.find(u => u.spawnPointId === 'north')!.position, { x: 460, y: 180 });
    assert.deepEqual(units.find(u => u.spawnPointId === 'south')!.position, { x: 460, y: 2160 });
  } finally { (map as any).spawn_layout = previous; }
});
