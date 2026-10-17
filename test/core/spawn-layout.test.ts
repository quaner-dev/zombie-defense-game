import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import map from '../../config/map.json' with { type: 'json' };

test('cardinal wave layout separates zombies deterministically along all battlefield edges', () => {
  const previous = (map as any).spawn_layout;
  (map as any).spawn_layout = { columns: 9, spacing_px: 20 };
  try {
    const spawn = () => {
      const h = new BattleTestHarness(); h.start('LV01_zombie_wave', 1); h.advance(3);
      return h.getUnits().filter(u => u.faction === 'zombie');
    };
    const units = spawn();
    const positions = units.map(u => u.position);
    assert.equal(new Set(positions.map(p => `${p.x},${p.y}`)).size, 50);
    assert.deepEqual(spawn().map(u => u.position), positions);
    assert.deepEqual(Object.fromEntries(['north','south','east','west'].map(side =>
      [side, units.filter(u => u.spawnPointId === side).length])),
      { north: 13, south: 13, east: 12, west: 12 });
    assert.deepEqual(units.find(u => u.spawnPointId === 'north')!.position, { x: 460, y: 180 });
    assert.deepEqual(units.find(u => u.spawnPointId === 'south')!.position, { x: 460, y: 2160 });
  } finally { (map as any).spawn_layout = previous; }
});
