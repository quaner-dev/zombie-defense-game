import test, { beforeEach, afterEach } from 'node:test';
import config from '../../config/units.json' with { type: 'json' };

// Rule fixtures deliberately retain prototype range/speed/cadence.
// Candidate-defaults and acceptance tests exercise the calibrated disk values.
const calibrated = structuredClone(config);
beforeEach(() => {
  config.rifleman.attack_range_px = 300;
  config.rifleman.attack_interval_s = 0.5;
  config.normal_zombie.hitPoints = 40;
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
  const projectiles = new ProjectileSystem(store, combat, map);
  return { store, combat, projectiles };
}
function openMap() {
  return new MapModel({ ...structuredClone(mapConfig), terrain: [] } as unknown as MapDefinition);
}
function ticks(combat: CombatSystem, count: number) {
  return Array.from({ length: count }, (_, i) => combat.update(0.05, (i + 1) * 0.05)).flat();
}

test('rifleman selects nearest living target within inclusive 300px with stable ID ties', () => {
  const { store, combat } = setup(openMap());
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

test('moving riflemen acquire targets, accumulate attack time and fire without stopping', () => {
  const { store, combat } = setup();
  const human = store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1200 }, 'B');
  zombie.speed_px_per_s = 0;
  human.state = 'Moving';
  human.moveTarget = { x: 900, y: 1370 };
  human.attackElapsed_s = 0.49;
  const movingEvents = ticks(combat, 20);
  assert.equal(movingEvents.filter(e => e.type === 'projectile_spawned').length, 2);
  assert.equal(human.targetId, zombie.id);
  assert.ok(human.attackElapsed_s >= 0 && human.attackElapsed_s < 0.5);
  assert.equal(human.state, 'Moving');
  human.state = 'Idle';
  human.attackElapsed_s = 0;
  assert.equal(ticks(combat, 9).filter(e => e.type === 'projectile_spawned').length, 0);
  assert.equal(ticks(combat, 1).filter(e => e.type === 'projectile_spawned').length, 1);
});

test('a rifle only fires in range and restarts aiming when a target leaves and returns', () => {
  const { store, combat } = setup(openMap());
  const human = store.spawn('rifleman', { x: 300, y: 500 }, 'A');
  const zombie = store.spawn('normal_zombie', { x: 600.01, y: 500 }, 'B');
  zombie.speed_px_per_s = 0;
  assert.equal(ticks(combat, 20).filter(e => e.type === 'projectile_spawned').length, 0);
  assert.equal(human.targetId, null);
  zombie.position.x = 600;
  assert.equal(ticks(combat, 9).filter(e => e.type === 'projectile_spawned').length, 0);
  zombie.position.x = 600.01;combat.update(.05, 1.5);
  assert.equal(human.attackElapsed_s, 0);assert.equal(human.targetId, null);
  zombie.position.x = 600;
  assert.equal(ticks(combat, 9).filter(e => e.type === 'projectile_spawned').length, 0);
  assert.equal(ticks(combat, 1).filter(e => e.type === 'projectile_spawned').length, 1);
});

test('riflemen choose a visible in-range zombie instead of firing through a wall', () => {
  const definition = structuredClone(mapConfig) as unknown as MapDefinition;
  definition.terrain = [{ id: 'wall', kind: 'wall', blocksMovement: true,
    bounds: { left: 500, top: 600, right: 540, bottom: 800 } }];
  const { store, combat } = setup(new MapModel(definition));
  const human = store.spawn('rifleman', { x: 480, y: 700 }, 'A');
  const hidden = store.spawn('normal_zombie', { x: 600, y: 700 }, 'B');hidden.speed_px_per_s = 0;
  const visible = store.spawn('normal_zombie', { x: 480, y: 900 }, 'B');visible.speed_px_per_s = 0;
  const shots = ticks(combat, 10).filter(e => e.type === 'projectile_spawned');
  assert.equal(human.targetId, visible.id);
  assert.ok(shots.length > 0 && shots.every(e => (e.data as { targetId: string }).targetId === visible.id));
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
  const { store, combat } = setup(openMap());
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

test('small zombie groups go around walls while three nearby zombies can still climb', () => {
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
    const events = Array.from({ length: 100 }, (_, i) => combat.update(.05, (i + 1) * .05)).flat();
    return { zombies, events };
  };
  const two = run(2);
  assert.equal(two.events.filter(e => e.type === 'wall_climb_started').length, 0);
  assert.ok(two.zombies.every(unit => unit.position.x > 548 && unit.state === 'Attacking'));
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

test('a lone zombie touching a wall takes collision-free steps and reaches the soldier', () => {
  const map = MapModel.load(), { store, combat } = setup(map);
  const human = store.spawn('rifleman', { x: 540, y: 1150 }, 'B');human.state = 'Moving';
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1044 }, 'B');
  for (let i = 0; i < 1000 && human.hp === 100; i++) {
    const before = { ...zombie.position };
    combat.update(.05, (i + 1) * .05);
    assert.equal(map.firstBlockingTerrain(before, zombie.position, zombie.radius_px), null);
    assert.equal(zombie.climbingWallId, null);
  }
  assert.ok(human.hp < 100);
  assert.equal(zombie.state, 'Attacking');
});

test('a thin wall inside melee range causes a detour instead of a permanent stop', () => {
  const definition = structuredClone(mapConfig) as unknown as MapDefinition;
  definition.terrain = [{ id: 'thin-wall', kind: 'wall', blocksMovement: true,
    bounds: { left: 500, top: 600, right: 502, bottom: 800 } }];
  const map = new MapModel(definition), { store, combat } = setup(map);
  const human = store.spawn('rifleman', { x: 512, y: 700 }, 'B');human.state = 'Moving';
  const zombie = store.spawn('normal_zombie', { x: 480, y: 700 }, 'B');
  combat.update(.05, .05);
  assert.ok(Math.hypot(zombie.velocity.x, zombie.velocity.y) > 0);
  assert.equal(human.hp, 100);
  for (let i = 0; i < 250 && human.hp === 100; i++) combat.update(.05, (i + 2) * .05);
  assert.ok(human.hp < 100);
});

test('zombies retarget a reachable soldier when the nearest is behind an impassable wall', () => {
  const definition = structuredClone(mapConfig) as unknown as MapDefinition;
  definition.terrain = [{ id: 'sealed-wall', kind: 'wall', blocksMovement: true,
    bounds: { left: 500, top: 180, right: 540, bottom: 2160 } }];
  const { store, combat } = setup(new MapModel(definition));
  store.spawn('rifleman', { x: 600, y: 700 }, 'B').state = 'Moving';
  const reachable = store.spawn('rifleman', { x: 300, y: 900 }, 'A');reachable.state = 'Moving';
  const zombie = store.spawn('normal_zombie', { x: 480, y: 700 }, 'A');
  combat.update(.05, .05);
  assert.equal(zombie.targetId, reachable.id);
  assert.ok(zombie.velocity.x < 0 && zombie.velocity.y > 0);
});

test('a zombie can pursue a soldier resting one body radius against the wall', () => {
  const map = MapModel.load(), { store, combat } = setup(map);
  const human = store.spawn('rifleman', { x: 398, y: 1180 }, 'B');human.state = 'Moving';
  const zombie = store.spawn('normal_zombie', { x: 400, y: 850 }, 'B');
  for (let i = 0; i < 400 && human.hp === 100; i++) combat.update(.05, (i + 1) * .05);
  assert.ok(human.hp < 100, '7px soldier clearance must not make its position unreachable by an 8px zombie');
  assert.equal(zombie.state, 'Attacking');
});

test('crowd separation does not prevent a climbing stack from completing its shared exit', () => {
  const definition = structuredClone(mapConfig) as unknown as MapDefinition;
  definition.terrain = [{ id: 'wall', kind: 'wall', blocksMovement: true, stackRequired: 3,
    bounds: { left: 500, top: 600, right: 540, bottom: 800 } }];
  const { store, combat } = setup(new MapModel(definition));
  store.spawn('rifleman', { x: 800, y: 700 }, 'B').state = 'Moving';
  const zombies = Array.from({ length: 3 }, (_, i) => {
    const zombie = store.spawn('normal_zombie', { x: 530, y: 700 }, 'A');
    zombie.climbingWallId = 'wall';zombie.climbTarget = { x: 550, y: 700 };
    zombie.stackLevel = i + 1;zombie.state = 'Climbing';return zombie;
  });
  const events = ticks(combat, 20);
  assert.equal(events.filter(e => e.type === 'wall_climbed').length, 3);
  assert.ok(zombies.every(zombie => zombie.climbingWallId === null && zombie.position.x > 548));
});

test('terminal projectile cleanup pairs pending shots with expiry and prevents later hits', () => {
  const { store, projectiles } = setup(openMap());
  const human = store.spawn('rifleman', { x: 300, y: 500 }, 'A');
  const zombie = store.spawn('normal_zombie', { x: 560, y: 500 }, 'B');
  const spawned = projectiles.spawn(human, zombie, 1);
  projectiles.update(.05, 1.05);
  assert.equal(projectiles.getProjectiles().length, 1);
  assert.deepEqual(projectiles.expireAll(1.05), [{ type: 'projectile_expired', time_s: 1.05,
    data: { projectileId: (spawned.data as { id: string }).id } }]);
  assert.deepEqual(projectiles.expireAll(1.05), []);
  assert.deepEqual(projectiles.update(1, 2), []);
  assert.equal(zombie.hp, 40);
});
