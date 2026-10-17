import test, { beforeEach, afterEach } from 'node:test';
import config from '../../config/units.json' with { type: 'json' };

// Rule fixtures deliberately retain prototype range/speed/cadence.
// Candidate-defaults and acceptance tests exercise the calibrated disk values.
const calibrated = structuredClone(config);
beforeEach(() => {
  config.rifleman.attack_range_px = 300;
  config.normal_zombie.speed_px_per_s = 60;
  config.normal_zombie.attack_interval_s = 1;
});
afterEach(() => Object.assign(config, structuredClone(calibrated)));
import assert from 'node:assert/strict';
import { UnitStore } from '../../src/core/UnitStore.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { ProjectileSystem } from '../../src/core/ProjectileSystem.js';
import { MapModel, type MapDefinition } from '../../src/core/MapModel.js';
import mapConfig from '../../config/map.json' with { type: 'json' };

function setup(map = MapModel.load()) {
  const store = new UnitStore();
  const combat = new CombatSystem(store, map);
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

test('crossing the warning line preserves the full direct pursuit step and notifies once', () => {
  const { store, combat } = setup();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1198.2 }, 'B');
  const human = store.spawn('rifleman', { x: 600, y: 1278.2 }, 'C');
  human.state = 'Moving';
  const events = combat.update(0.05, 0.05);
  assert.ok(Math.abs(zombie.position.x - 541.8) < 1e-9);
  assert.ok(Math.abs(zombie.position.y - 1200.6) < 1e-9);
  assert.equal(zombie.breached, true);
  assert.equal(zombie.state, 'Advancing');
  assert.deepEqual(events.filter(e => e.type === 'route_breached'), [
    { type: 'route_breached', time_s: 0.05, data: { routeId: 'B', unitId: zombie.id } },
  ]);
  human.position = { x: zombie.position.x, y: 1100 };
  const returning = combat.update(0.05, 0.1);
  assert.ok(zombie.position.y < 1200);
  assert.equal(zombie.targetId, human.id);
  assert.equal(zombie.state, 'Advancing');
  assert.equal(returning.filter(e => e.type === 'route_breached').length, 0);
  human.position.y = 1300;
  const recrossing = combat.update(0.05, 0.15);
  assert.ok(zombie.position.y > 1200);
  assert.equal(zombie.breached, true);
  assert.equal(recrossing.filter(e => e.type === 'route_breached').length, 0);
});

test('melee at <=28px stops movement and deals 10 damage every second regardless of breach', () => {
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
  zombie.attackElapsed_s = 0.95;
  const events = ticks(combat, 1);
  assert.equal(human.hp, 70);
  assert.equal(zombie.breached, false);
  assert.equal(events.filter(e => e.type === 'route_breached').length, 0);
});

for (const [name, position, expectedPosition, expectedVelocity] of [
  ['diagonally across labels', { x: 580, y: 230 }, { x: 542.4, y: 258.2 }, { x: 48, y: -36 }],
  ['horizontally', { x: 640, y: 260 }, { x: 543, y: 260 }, { x: 60, y: 0 }],
  ['upward', { x: 540, y: 160 }, { x: 540, y: 257 }, { x: 0, y: -60 }],
] as const) test(`newborn zombie acquires the globally nearest human and pursues ${name}`, () => {
  const { store, combat } = setup();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  store.spawn('rifleman', { x: 540, y: 500 }, 'B');
  const closest = store.spawn('rifleman', position, 'A');
  const events = combat.update(0.05, 0.05);
  assert.equal(zombie.targetId, closest.id);
  assert.ok(Math.abs(zombie.position.x - expectedPosition.x) < 1e-9);
  assert.ok(Math.abs(zombie.position.y - expectedPosition.y) < 1e-9);
  assert.deepEqual(zombie.velocity, expectedVelocity);
  assert.equal(zombie.state, 'Advancing');
  assert.equal(zombie.breached, false);
  assert.equal(events.filter(e => e.type === 'route_breached').length, 0);
});

test('newborn melee at the inclusive range boundary preserves interval and damage without crossing', () => {
  const { store, combat } = setup();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  const human = store.spawn('rifleman', { x: 568, y: 260 }, 'C');
  assert.equal(ticks(combat, 19).filter(e => e.type === 'damage').length, 0);
  const events = ticks(combat, 1);
  assert.equal(human.hp, 90);
  assert.equal(zombie.state, 'Attacking');
  assert.deepEqual(zombie.position, { x: 540, y: 260 });
  assert.deepEqual(zombie.velocity, { x: 0, y: 0 });
  assert.equal(zombie.breached, false);
  assert.equal(events.filter(e => e.type === 'route_breached').length, 0);
});

test('zombie reselects stable ID ties, moved targets, dead targets and recycled target lifetimes', () => {
  const { store, combat } = setup();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  const first = store.spawn('rifleman', { x: 440, y: 260 }, 'A');
  const second = store.spawn('rifleman', { x: 640, y: 260 }, 'C');
  combat.update(0, 0);
  assert.equal(zombie.targetId, first.id);
  second.position.x = 550;
  combat.update(0, 0);
  assert.equal(zombie.targetId, second.id);
  const deadId = second.id;
  store.kill(deadId);
  zombie.attackElapsed_s = 0.95;
  const events = combat.update(0.05, 0.05);
  assert.equal(zombie.targetId, first.id);
  assert.equal(events.filter(e => e.type === 'damage').length, 0);
  store.remove(deadId);
  const replacement = store.spawn('rifleman', { x: 540, y: 270 }, 'C');
  combat.update(0, 0.05);
  assert.notEqual(replacement.id, deadId);
  assert.equal(zombie.targetId, replacement.id);
  store.remove(replacement.id);
  combat.update(0, 0.05);
  assert.equal(zombie.targetId, first.id);
});

for (const breached of [false, true]) test(`zombie with no living humans idles with zero velocity (breached=${breached})`, () => {
  const { store, combat } = setup();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  const human = store.spawn('rifleman', { x: 540, y: 280 }, 'A');
  zombie.breached = breached;
  zombie.targetId = human.id;
  zombie.velocity = { x: 10, y: 60 };
  zombie.attackElapsed_s = 0.95;
  store.kill(human.id);
  const events = combat.update(0.05, 0.05);
  assert.equal(zombie.targetId, null);
  assert.equal(zombie.state, 'Idle');
  assert.equal(zombie.attackElapsed_s, 0);
  assert.deepEqual(zombie.position, { x: 540, y: 260 });
  assert.deepEqual(zombie.velocity, { x: 0, y: 0 });
  assert.equal(events.filter(e => e.type === 'damage' || e.type === 'route_breached').length, 0);
});

test('breached zombies pursue and melee humans above the defense line', () => {
  const { store, combat } = setup();
  const human = store.spawn('rifleman', { x: 800, y: 1100 }, 'B');
  human.state = 'Moving';
  const zombie = store.spawn('normal_zombie', { x: 800, y: 1200 }, 'B');
  zombie.breached = true;
  combat.update(0.05, 0.05);
  assert.equal(zombie.position.y, 1197);
  ticks(combat, 43);
  assert.equal(zombie.position.y, 1128);
  assert.equal(human.hp, 90);
  assert.equal(zombie.state, 'Attacking');
});

test('a rifleman killed by an earlier inserted zombie cannot fire later in the frame', () => {
  const { store, combat } = setup();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1200 }, 'B');
  const human = store.spawn('rifleman', { x: 540, y: 1228 }, 'B');
  zombie.breached = true;
  zombie.attackElapsed_s = 0.95;
  human.hp = 10;
  human.attackElapsed_s = 0.45;
  const events = combat.update(0.05, 0.05);
  assert.equal(human.hp, 0);
  assert.equal(events.filter(e => e.type === 'unit_died').length, 1);
  assert.equal(events.filter(e => e.type === 'projectile_spawned').length, 0);
  assert.deepEqual(combat.drainShots(), []);
  assert.equal(human.state, 'Dead');
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

test('wall collisions hold a small group until three zombies can climb through', () => {
  const definition = structuredClone(mapConfig) as unknown as MapDefinition;
  definition.terrain = [{ id: 'test-wall', kind: 'wall', blocksMovement: true, stackRequired: 3,
    bounds: { left: 500, top: 600, right: 540, bottom: 800 } }];
  const map = new MapModel(definition);
  const run = (count: number) => {
    const { store, combat } = setup(map);
    const human = store.spawn('rifleman', { x: 650, y: 700 }, 'B');human.state = 'Moving';
    const zombies = Array.from({ length: count }, (_, i) => {
      const zombie = store.spawn('normal_zombie', { x: 480, y: 680 + i * 20 }, 'A');
      zombie.speed_px_per_s = 120;
      return zombie;
    });
    const events = Array.from({ length: 24 }, (_, i) => combat.update(.05, (i + 1) * .05)).flat();
    return { zombies, events };
  };
  const two = run(2);
  assert.equal(two.events.filter(e => e.type === 'wall_climb_started').length, 0);
  assert.ok(two.zombies.every(unit => unit.position.x <= 492));
  const three = run(3);
  assert.ok(three.events.some(e => e.type === 'wall_climb_started'));
  assert.ok(three.zombies.every(unit => unit.position.x > 548));
});

test('overlapping zombies keep separate positions after a crowd movement update', () => {
  const { store, combat } = setup();
  store.spawn('rifleman', { x: 800, y: 500 }, 'B').state = 'Moving';
  const zombies = Array.from({ length: 3 }, () => store.spawn('normal_zombie', { x: 540, y: 500 }, 'B'));
  combat.update(0, 0);
  assert.equal(new Set(zombies.map(unit => `${unit.position.x},${unit.position.y}`)).size, 3);
});
