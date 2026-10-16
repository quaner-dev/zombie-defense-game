import test from 'node:test';
import assert from 'node:assert/strict';
import { UnitStore } from '../../src/core/UnitStore.js';
import { MovementSystem } from '../../src/core/MovementSystem.js';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';

test('death is idempotent, excludes dead units, and freezes their movement', () => {
  const store = new UnitStore();
  const unit = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  unit.state = 'Moving';
  unit.moveTarget = { x: 800, y: 400 };
  unit.targetId = 'enemy';
  unit.velocity = { x: 120, y: 0 };
  assert.equal(store.kill(unit.id), true);
  assert.equal(store.kill(unit.id), false);
  assert.equal(store.kill('missing'), false);
  assert.equal(unit.hp, 0);
  assert.equal(unit.state, 'Dead');
  assert.equal(unit.moveTarget, null);
  assert.equal(unit.targetId, null);
  assert.deepEqual(unit.velocity, { x: 0, y: 0 });
  assert.deepEqual(store.living(), []);
  new MovementSystem(store).update(2, 2);
  assert.deepEqual(unit.position, { x: 300, y: 400 });
});

test('pool reuse resets every field and assigns a new identity to prevent stale references', () => {
  const store = new UnitStore();
  const unit = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  const oldId = unit.id;
  unit.hp = 1;
  unit.state = 'Firing';
  unit.moveTarget = { x: 900, y: 900 };
  unit.targetId = 'enemy';
  unit.velocity = { x: 10, y: 20 };
  unit.attackElapsed_s = 0.49;
  unit.breached = true;
  assert.equal(store.remove(oldId), true);
  assert.equal(store.remove(oldId), false);
  assert.equal(unit.active, false);
  assert.equal(store.get(oldId), undefined);
  const reused = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  assert.equal(reused, unit);
  assert.notEqual(reused.id, oldId);
  assert.equal(store.kill(oldId), false);
  assert.equal(reused.unitType, 'normal_zombie');
  assert.equal(reused.faction, 'zombie');
  // Preserve the reviewed Task 2 config rather than silently rebalance zombies.
  assert.equal(reused.hp, 100);
  assert.equal(reused.maxHp, 100);
  assert.equal(reused.speed_px_per_s, 40);
  assert.equal(reused.state, 'Advancing');
  assert.equal(reused.routeId, 'B');
  assert.deepEqual(reused.position, { x: 540, y: 260 });
  assert.deepEqual(reused.velocity, { x: 0, y: 0 });
  assert.equal(reused.moveTarget, null);
  assert.equal(reused.targetId, null);
  assert.equal(reused.attackElapsed_s, 0);
  assert.equal(reused.breached, false);
  assert.equal(reused.active, true);
  assert.equal(store.living().length, 1);
});

test('clear removes all active units and reuse restores human config without resetting IDs', () => {
  const store = new UnitStore();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  const oldId = zombie.id;
  store.clear();
  assert.deepEqual(store.all(), []);
  assert.equal(zombie.active, false);
  const human = store.spawn('rifleman', { x: 180, y: 1370 }, 'A');
  assert.notEqual(human.id, oldId);
  assert.equal(human.hp, 100);
  assert.equal(human.speed_px_per_s, 120);
  assert.equal(human.state, 'Idle');
});

test('harness consumes wave spawns into living units on the configured routes', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 0, initialHumans: 2 });
  harness.start('LV01_zombie_wave', 1);
  harness.advance(20);
  const zombies = harness.getUnits().filter(unit => unit.faction === 'zombie');
  assert.equal(zombies.length, 350);
  assert.equal(zombies.filter(unit => unit.routeId === 'A').length, 110);
  assert.equal(zombies.filter(unit => unit.routeId === 'B').length, 130);
  assert.equal(zombies.filter(unit => unit.routeId === 'C').length, 110);
  assert.ok(zombies.every(unit => unit.unitType === 'normal_zombie' && unit.active));
  assert.equal(new Set(harness.getUnits().map(unit => unit.id)).size, 352);
  assert.equal(harness.getSnapshot().aliveHumans, 2);
  assert.equal(harness.getSnapshot().aliveZombies, 350);
});
