import test from 'node:test';
import assert from 'node:assert/strict';
import { UnitStore } from '../../src/core/UnitStore.js';
import { MapModel } from '../../src/core/MapModel.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { ProjectileSystem } from '../../src/core/ProjectileSystem.js';

function setup() {
  const store = new UnitStore();
  const combat = new CombatSystem(store, MapModel.load());
  const projectiles = new ProjectileSystem(store, combat);
  return { store, combat, projectiles };
}
function ticks(combat: CombatSystem, count: number) {
  return Array.from({ length: count }, (_, i) => combat.update(0.05, (i + 1) * 0.05)).flat();
}

test('rifleman selects nearest living target within inclusive 300px with stable ID ties', () => {
  const { store, combat } = setup();
  const human = store.spawn('rifleman', { x: 540, y: 1000 }, 'B');
  const far = store.spawn('normal_zombie', { x: 840.01, y: 1000 }, 'C');
  const a = store.spawn('normal_zombie', { x: 240, y: 1000 }, 'A');
  const b = store.spawn('normal_zombie', { x: 840, y: 1000 }, 'C');
  combat.update(0, 0);
  assert.equal(human.targetId, a.id);
  store.kill(a.id);
  combat.update(0, 0);
  assert.equal(human.targetId, b.id);
  store.kill(b.id);
  combat.update(0, 0);
  assert.equal(human.targetId, null);
  assert.equal(human.state, 'Idle');
  assert.equal(far.hp, 40);
});

test('rifle fires every 0.5s, queues visual flight without immediate damage, and caps large frames', () => {
  const { store, combat } = setup();
  const human = store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1200 }, 'B');
  assert.equal(ticks(combat, 9).filter(e => e.type === 'projectile_spawned').length, 0);
  assert.equal(ticks(combat, 1).filter(e => e.type === 'projectile_spawned').length, 1);
  assert.equal(zombie.hp, 40);
  assert.equal(ticks(combat, 10).filter(e => e.type === 'projectile_spawned').length, 1);
  human.attackElapsed_s = 0;
  assert.equal(combat.update(10, 10).filter(e => e.type === 'projectile_spawned').length, 0);
});

test('moving riflemen neither acquire targets nor accumulate attack time', () => {
  const { store, combat } = setup();
  const human = store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  store.spawn('normal_zombie', { x: 540, y: 1200 }, 'B');
  human.state = 'Moving';
  human.moveTarget = { x: 900, y: 1370 };
  human.attackElapsed_s = 0.49;
  assert.equal(ticks(combat, 20).filter(e => e.type === 'projectile_spawned').length, 0);
  assert.equal(human.targetId, null);
  assert.equal(human.attackElapsed_s, 0);
  human.state = 'Idle';
  assert.equal(ticks(combat, 9).filter(e => e.type === 'projectile_spawned').length, 0);
  assert.equal(ticks(combat, 1).filter(e => e.type === 'projectile_spawned').length, 1);
});

test('four valid 10 damage hits kill ordinary zombie once and reject later damage', () => {
  const { store, combat } = setup();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  const events = Array.from({ length: 5 }, () => combat.applyDamage(zombie.id, 10, 'rifle', 1)).flat();
  assert.equal(zombie.maxHp, 40);
  assert.equal(zombie.hp, 0);
  assert.equal(zombie.state, 'Dead');
  assert.equal(events.filter(e => e.type === 'damage').length, 4);
  assert.equal(events.filter(e => e.type === 'unit_died').length, 1);
});

test('zombies advance at 60px/s, breach inclusively at y=1200 only once, then pursue nearest human', () => {
  const { store, combat } = setup();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1197 }, 'B');
  const human = store.spawn('rifleman', { x: 640, y: 1300 }, 'B');
  const events = combat.update(0.05, 0.05);
  assert.equal(zombie.position.y, 1200);
  assert.equal(zombie.breached, true);
  assert.equal(events.filter(e => e.type === 'route_breached').length, 1);
  assert.equal(ticks(combat, 2).filter(e => e.type === 'route_breached').length, 0);
  assert.equal(zombie.targetId, human.id);
  assert.ok(zombie.position.x > 540);
});

test('melee requires breach and <=28px, stops movement, and deals 10 damage every second', () => {
  const { store, combat } = setup();
  const human = store.spawn('rifleman', { x: 540, y: 1228 }, 'B');
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1200 }, 'B');
  const start = { ...zombie.position };
  assert.equal(ticks(combat, 19).filter(e => e.type === 'damage').length, 0);
  assert.equal(human.hp, 100);
  ticks(combat, 1);
  assert.equal(human.hp, 90);
  assert.deepEqual(zombie.position, start);
  ticks(combat, 20);
  assert.equal(human.hp, 80);
  human.position.y = 1228.01;
  zombie.attackElapsed_s = 0.99;
  combat.update(0, 3);
  assert.equal(human.hp, 80);
  zombie.position.y = 1199;
  zombie.breached = false;
  human.position.y = 1199;
  ticks(combat, 1);
  assert.equal(human.hp, 80);
});

test('pursuit stops in inclusive melee range even for diagonal floating point coordinates', () => {
  const { store, combat } = setup();
  const human = store.spawn('rifleman', { x: 550, y: 1300 }, 'B');
  human.state = 'Moving';
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1200 }, 'B');
  zombie.speed_px_per_s = 3000;
  combat.update(0.05, 0.05);
  ticks(combat, 20);
  assert.equal(human.hp, 90);
  assert.equal(zombie.state, 'Attacking');
  assert.deepEqual(zombie.velocity, { x: 0, y: 0 });
});
