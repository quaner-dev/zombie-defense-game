import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import map from '../../config/map.json' with { type: 'json' };

test('configured wave layout separates zombies deterministically within route width and bounds', () => {
  const previous = (map as any).spawn_layout;
  (map as any).spawn_layout = { columns: 9, spacing_px: 20 };
  try {
    const spawn = () => {
      const h = new BattleTestHarness(); h.start('LV01_zombie_wave', 1); h.advance(3);
      return h.getUnits().filter(u => u.faction === 'zombie').map(u => u.position);
    };
    const positions = spawn();
    assert.equal(new Set(positions.map(p => `${p.x},${p.y}`)).size, 50);
    assert.deepEqual(spawn(), positions);
    assert.ok(positions.every(p => Math.abs(p.x - 540) <= 120 && p.y >= -180 && p.y < 0));
    assert.deepEqual(positions[0], { x: 460, y: -40 });
    assert.deepEqual(positions[9], { x: 460, y: -60 });
    (map as any).routes[1].spawn_layout = { columns: 5, spacing_px: 10 };
    try { assert.deepEqual(spawn()[0], { x: 520, y: -40 }); }
    finally { delete (map as any).routes[1].spawn_layout; }
  } finally { (map as any).spawn_layout = previous; }
});
