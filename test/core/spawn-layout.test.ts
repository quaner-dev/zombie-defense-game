import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { MapModel } from '../../src/core/MapModel.js';
import { WaveManager } from '../../src/core/WaveManager.js';
import { courtyard } from '../../src/scenes/courtyard.js';

test('courtyard continuous spawning enters deterministic batches from all four edges', () => {
  MapModel.register(courtyard.mapId, courtyard.map);
  WaveManager.register(courtyard.levelId, courtyard.level);
    const spawn = () => {
      const h = new BattleTestHarness(); h.start(courtyard.levelId, 1); h.advance(3);
      return { h, units: h.getUnits().filter(u => u.faction === 'zombie'), events: h.getEvents() };
    };
    const first = spawn();
    const units = first.units;
    const positions = units.map(u => u.position);
    assert.equal(units.length, 20);
    assert.equal(new Set(positions.map(p => `${p.x},${p.y}`)).size, 10);
    assert.deepEqual(spawn().units.map(u => u.position), positions);
    assert.deepEqual(Object.fromEntries(['north','south','east','west'].map(side =>
      [side, units.filter(u => u.spawnPointId === side).length])),
      { north: 6, south: 6, east: 4, west: 4 });
    assert.ok(first.events.filter(event => event.type === 'zombie_batch_spawn').length >= 1);
    assert.equal((first.events.find(event => event.type === 'zombie_batch_spawn')!.data as any).batchSize, 10);
    for (const unit of units) {
      const area = courtyard.map.spawnPoints.find(point => point.id === unit.spawnPointId)!.spawnArea;
      assert.ok(area, 'courtyard spawns have bounded admission areas');
      assert.ok(unit.position.x >= area.left && unit.position.x <= area.right);
      assert.ok(unit.position.y >= area.top && unit.position.y <= area.bottom);
    }
    first.h.advance(0.34);
    assert.equal(first.h.getSnapshot().spawnedZombies, 10);
    first.h.advance(0.01);
    assert.equal(first.h.getSnapshot().spawnedZombies, 20);
});
