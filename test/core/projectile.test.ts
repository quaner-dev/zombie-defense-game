import test from 'node:test';
import assert from 'node:assert/strict';
import { UnitStore } from '../../src/core/UnitStore.js';
import { MapModel } from '../../src/core/MapModel.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { ProjectileSystem } from '../../src/core/ProjectileSystem.js';

function setup(distance = 180) {
  const store = new UnitStore();
  const combat = new CombatSystem(store, MapModel.load());
  const projectiles = new ProjectileSystem(store, combat);
  const human = store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  const zombie = store.spawn('normal_zombie', { x: 540 + distance, y: 1370 }, 'B');
  return { store, combat, projectiles, human, zombie };
}

test('projectile flies at 900px/s to captured target point before authoritative damage', () => {
  const { projectiles, human, zombie } = setup();
  const event = projectiles.spawn(human, zombie, 0);
  assert.equal(event.type, 'projectile_spawned');
  zombie.position.y += 50;
  projectiles.update(0.1, 0.1);
  assert.deepEqual(projectiles.getProjectiles()[0].position, { x: 630, y: 1370 });
  assert.equal(zombie.hp, 40);
  const events = projectiles.update(0.1, 0.2);
  assert.equal(zombie.hp, 30);
  assert.equal(events.filter(e => e.type === 'projectile_hit').length, 1);
  assert.equal(events.filter(e => e.type === 'projectile_expired').length, 1);
  assert.deepEqual(projectiles.getProjectiles(), []);
  assert.deepEqual(projectiles.update(1, 1.2), []);
});

test('maximum flight time is 0.35s and resolves exactly once even short of target point', () => {
  const { projectiles, human, zombie } = setup(900);
  projectiles.spawn(human, zombie, 0);
  projectiles.update(0.349, 0.349);
  assert.equal(zombie.hp, 40);
  const events = projectiles.update(0.001, 0.35);
  assert.equal(zombie.hp, 30);
  assert.equal(events.filter(e => e.type === 'projectile_hit').length, 1);
  assert.equal(events.filter(e => e.type === 'projectile_expired').length, 1);
  assert.deepEqual(projectiles.update(10, 10.35), []);
});

test('dead targets still produce visual arrival but no further authoritative damage', () => {
  const { store, projectiles, human, zombie } = setup();
  projectiles.spawn(human, zombie, 0);
  store.kill(zombie.id);
  const events = projectiles.update(0.2, 0.2);
  assert.equal(events.filter(e => e.type === 'projectile_hit').length, 1);
  assert.equal(events.filter(e => e.type === 'damage' || e.type === 'unit_died').length, 0);
  assert.equal(zombie.hp, 0);
});

test('stale projectile target ID cannot damage a pooled replacement', () => {
  const { store, projectiles, human, zombie } = setup();
  projectiles.spawn(human, zombie, 0);
  store.remove(zombie.id);
  const replacement = store.spawn('normal_zombie', { x: 720, y: 1370 }, 'B');
  assert.equal(projectiles.update(0.2, 0.2).filter(e => e.type === 'damage').length, 0);
  assert.equal(replacement.hp, 40);
});

test('combat shots are consumed once by projectile simulation', () => {
  const { combat, projectiles, zombie } = setup();
  for (let i = 0; i < 10; i++) combat.update(0.05, (i + 1) * 0.05);
  assert.equal(zombie.hp, 40);
  projectiles.update(0.05, 0.55);
  assert.equal(projectiles.getProjectiles().length, 1);
  projectiles.update(0.3, 0.85);
  assert.equal(zombie.hp, 30);
  assert.deepEqual(projectiles.update(1, 1.85), []);
});
