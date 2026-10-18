import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandSystem } from '../../src/core/CommandSystem.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { MapModel } from '../../src/core/MapModel.js';
import { MovementSystem } from '../../src/core/MovementSystem.js';
import { UnitStore } from '../../src/core/UnitStore.js';

test('a coordinate command captures only the nearest living soldier', () => {
  const store = new UnitStore();
  const commands = new CommandSystem(store, MapModel.load());
  const nearest = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  const second = store.spawn('rifleman', { x: 340, y: 400 }, 'A');
  const support = store.spawn('shield', { x: 360, y: 400 }, 'A');

  const event = commands.issueMoveAt(300, 400, 700, 800, 1);
  assert.deepEqual(event?.data.unitIds, [nearest.id]);
  assert.equal(nearest.state, 'Moving');
  assert.equal(second.state, 'Idle');
  assert.equal(support.state, 'Idle');
});

test('a moving soldier keeps moving while firing at an in-range zombie', () => {
  const store = new UnitStore();
  const map = MapModel.load();
  const combat = new CombatSystem(store, map);
  const movement = new MovementSystem(store, map);
  const soldier = store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1200 }, 'B');
  zombie.speed_px_per_s = 0;
  soldier.state = 'Moving';
  soldier.moveTarget = { x: 700, y: 1370 };
  soldier.attackElapsed_s = 0.34;

  const events = combat.update(0.05, 0.05);
  assert.ok(events.some(event => event.type === 'projectile_spawned'));
  assert.equal(soldier.state, 'Moving');
  assert.equal(soldier.targetId, zombie.id);
  const before = soldier.position.x;
  movement.update(0.05, 0.05);
  assert.ok(soldier.position.x > before);
  assert.equal(soldier.targetId, zombie.id);
});
