import test from 'node:test';
import config from '../../config/units.json' with { type: 'json' };
import assert from 'node:assert/strict';
import { UnitStore } from '../../src/core/UnitStore.js';
import { ResultSystem } from '../../src/core/ResultSystem.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { ProjectileSystem } from '../../src/core/ProjectileSystem.js';
import { MapModel } from '../../src/core/MapModel.js';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';

test('win requires every wave spawned and no living zombies', () => {
  const store = new UnitStore();
  store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  const results = new ResultSystem(store);
  assert.deepEqual(results.update(false, 1), []);
  const zombie = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  assert.deepEqual(results.update(true, 2), []);
  store.kill(zombie.id);
  assert.equal(results.update(true, 3)[0].type, 'win');
  assert.equal(results.getResult(), 'win');
  assert.deepEqual(results.update(true, 4), []);
});

test('all riflemen dead loses even before every wave spawned', () => {
  const store = new UnitStore();
  const human = store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  const results = new ResultSystem(store);
  store.kill(human.id);
  assert.equal(results.update(false, 1)[0].type, 'lose');
  assert.equal(results.getResult(), 'lose');
});

test('lose wins a same-frame tie and terminal result is immutable', () => {
  const store = new UnitStore();
  const results = new ResultSystem(store);
  assert.equal(results.update(true, 1)[0].type, 'lose');
  store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  assert.deepEqual(results.update(true, 2), []);
  assert.equal(results.getResult(), 'lose');
});

test('harness integrates movement, projectile hits, breach statistics, deaths and terminal freeze', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 0, initialHumans: 2 });
  harness.start('LV01_zombie_wave', 1);
  for (let i = 0; i < 2000 && harness.getSnapshot().result === 'running'; i++) harness.advance(0.05);
  const snapshot = harness.getSnapshot();
  assert.equal(snapshot.result, 'lose');
  assert.equal(snapshot.aliveHumans, 0);
  assert.ok(snapshot.aliveZombies > 0);
  assert.ok(snapshot.breachedRoutes.includes('B'));
  for (const type of ['projectile_spawned', 'projectile_hit', 'projectile_expired', 'damage', 'unit_died', 'route_breached', 'lose']) {
    assert.ok(harness.getEvents().some(e => e.type === type), type);
  }
  const units = harness.getUnits();
  const events = harness.getEvents();
  harness.advance(100);
  harness.endDeployment();
  harness.issueMoveAt(540, 1370, 180, 1370);
  assert.deepEqual(harness.getSnapshot(), snapshot);
  assert.deepEqual(harness.getUnits(), units);
  assert.deepEqual(harness.getEvents(), events);
  assert.equal(events.filter(e => e.type === 'lose').length, 1);
  harness.start('LV01_zombie_wave', 1);
  assert.equal(harness.getSnapshot().result, 'running');
  assert.deepEqual(harness.getEvents(), []);
});

test('harness subdivides elapsed time so late-spawned waves do not move retroactively', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 0, initialHumans: 50 });
  harness.start('LV01_zombie_wave', 1);
  harness.advance(7);
  const a = harness.getUnits().find(u => u.faction === 'zombie' && u.routeId === 'A')!;
  assert.equal(a.position.y, 260);
  assert.equal(harness.getSnapshot().time_s, 7);
});

test('in-flight lethal hit and final melee death in one frame resolve as lose', () => {
  const store = new UnitStore();
  const combat = new CombatSystem(store, MapModel.load());
  const projectiles = new ProjectileSystem(store, combat);
  const results = new ResultSystem(store);
  const human = store.spawn('rifleman', { x: 540, y: 1228 }, 'B');
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1200 }, 'B');
  human.hp = 10;
  zombie.hp = 10;
  zombie.attackElapsed_s = config.normal_zombie.attack_interval_s - 0.05;
  projectiles.spawn(human, zombie, 0);
  combat.update(0.05, 0.05);
  projectiles.update(0.05, 0.05);
  assert.equal(human.state, 'Dead');
  assert.equal(zombie.state, 'Dead');
  assert.equal(results.update(true, 0.05)[0].type, 'lose');
});
