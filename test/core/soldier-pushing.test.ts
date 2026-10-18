import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementSystem } from '../../src/core/MovementSystem.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { MapModel } from '../../src/core/MapModel.js';
import type { Unit } from '../../src/core/types.js';

function separated(units: Unit[]) {
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    assert.ok(Math.hypot(units[i].position.x - units[j].position.x,
      units[i].position.y - units[j].position.y) >= units[i].radius_px + units[j].radius_px + 2 - .001);
  }
}

test('moving A pushes resting B forwards without taking over its state or combat target', () => {
  const store = new UnitStore(), movement = new MovementSystem(store, MapModel.load());
  const a = store.spawn('rifleman', { x: 500, y: 1370 }, 'B');
  const b = store.spawn('shield', { x: 540, y: 1370 }, 'B');
  a.state = 'Moving'; a.moveTarget = { x: 540, y: 1370 };
  b.state = 'Attacking'; b.targetId = 'enemy';
  for (let frame = 0; frame < 30; frame++) {
    movement.update(.05, frame * .05); separated([a, b]);
  }
  assert.ok(a.position.x > 520);
  assert.ok(b.position.x > 550);
  assert.equal(b.state, 'Attacking'); assert.equal(b.targetId, 'enemy');
  assert.equal(b.moveTarget, null);
});

test('a push travels through a chain of seven soldiers', () => {
  const store = new UnitStore(), movement = new MovementSystem(store);
  const units = Array.from({ length: 7 }, (_, i) => store.spawn('rifleman', { x: 300 + i * 30, y: 500 }, 'B'));
  units[0].state = 'Moving'; units[0].moveTarget = { x: 450, y: 500 };
  for (let frame = 0; frame < 40; frame++) {
    movement.update(.05, frame * .05); separated(units);
  }
  assert.ok(units[6].position.x > 550);
});

test('coincident soldiers separate deterministically and then stay still', () => {
  function run() {
    const store = new UnitStore(), movement = new MovementSystem(store);
    const units = ['rifleman', 'flamethrower', 'shield'].map(type =>
      store.spawn(type as 'rifleman' | 'flamethrower' | 'shield', { x: 500, y: 500 }, 'B'));
    movement.update(.05, 0); separated(units);
    const positions = units.map(u => ({ ...u.position }));
    movement.update(.05, .05);
    assert.deepEqual(units.map(u => u.position), positions);
    return positions;
  }
  assert.deepEqual(run(), run());
});

test('a wall or battlefield edge stops the push and holds A back', () => {
  for (const wall of [false, true]) {
    const map = new MapModel({ battle_bounds: { left: 0, top: 0, right: 600, bottom: 600 },
      defense_line_y: 300, routes: [], spawnPoints: [], terrain: wall ? [{ id: 'wall', kind: 'wall',
        bounds: { left: 550, top: 100, right: 580, bottom: 500 }, blocksMovement: true }] : [] });
    const store = new UnitStore(), movement = new MovementSystem(store, map);
    const limit = wall ? 550 : 600;
    const a = store.spawn('rifleman', { x: limit - 44, y: 300 }, 'B');
    const b = store.spawn('rifleman', { x: limit - 14.01, y: 300 }, 'B');
    a.state = 'Moving'; a.moveTarget = { x: limit - 14.01, y: 300 };
    for (let frame = 0; frame < 30; frame++) { movement.update(.05, frame * .05); separated([a, b]); }
    assert.ok(b.position.x <= limit - b.radius_px);
    assert.ok(a.position.x < b.position.x);
    for (const unit of [a, b]) for (const terrain of map.terrain)
      assert.equal(map.terrainContains(unit.position, terrain, unit.radius_px), false);
  }
});

test('dead soldiers and zombies do not participate in soldier pushing', () => {
  const store = new UnitStore(), movement = new MovementSystem(store);
  const a = store.spawn('rifleman', { x: 500, y: 500 }, 'B');
  const dead = store.spawn('rifleman', { x: 500, y: 500 }, 'B'); store.kill(dead.id);
  const zombie = store.spawn('normal_zombie', { x: 500, y: 500 }, 'B');
  movement.update(.05, 0);
  for (const unit of [a, dead, zombie]) assert.deepEqual(unit.position, { x: 500, y: 500 });
});
