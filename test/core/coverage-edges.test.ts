import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { MapModel, type MapDefinition } from '../../src/core/MapModel.js';
import { WaveManager } from '../../src/core/WaveManager.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { ProjectileSystem } from '../../src/core/ProjectileSystem.js';
import { MovementSystem } from '../../src/core/MovementSystem.js';
import { CommandSystem, formationPositions } from '../../src/core/CommandSystem.js';

function definition(): MapDefinition {
  return {
    battle_bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    defense_line_y: 80,
    routes: [{ id: 'A', waypoints: [{ x: 50, y: 100 }],
      spawn: { x: 50, y: 0 }, defend: { x: 50, y: 90 }, width: 40 }],
    spawnPoints: [{ id: 'A', x: 50, y: 0 }],
  };
}

// Regression targets: removing either readiness guard or cursor validation must fail.
test('unstarted harness rejects map access and commands without mutating its snapshot', () => {
  const harness = new BattleTestHarness();
  const before = harness.getSnapshot();
  assert.throws(() => harness.getMapModel(), /Battle has not started/);
  harness.advance(1);
  harness.endDeployment();
  harness.issueMoveAt(0, 0, 1, 1);
  assert.equal(harness.issueMoveGroup(['missing'], 1, 1), false);
  assert.deepEqual(harness.getSnapshot(), before);
  assert.deepEqual(harness.readEvents(0), { cursor: 0, events: [] });
});

test('event cursors return only unseen events and detached nested payloads', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.endDeployment();
  const first = harness.readEvents(0);
  assert.equal(first.cursor, 1);
  assert.equal(first.events[0].type, 'wave_spawn');
  (first.events[0].data as { spawns: { count: number }[] }).spawns[0].count = -1;
  assert.equal((harness.readEvents(0).events[0].data as { spawns: { count: number }[] }).spawns[0].count, 50);
  assert.deepEqual(harness.readEvents(first.cursor), { cursor: first.cursor, events: [] });
  const ids = harness.getUnits().filter(unit => unit.faction === 'human').slice(0, 2).map(unit => unit.id);
  assert.equal(harness.issueMoveGroup(ids, 600, 1400), true);
  const next = harness.readEvents(first.cursor);
  assert.equal(next.events.filter(event => event.type === 'group_command').length, 1);
  assert.equal(next.cursor, first.cursor + next.events.length);
  for (const cursor of [-1, 0.5, NaN, Infinity, next.cursor + 1]) {
    assert.throws(() => harness.readEvents(cursor), RangeError);
  }
  assert.equal(harness.issueMoveGroup([], 600, 1400), false);
});

test('invalid elapsed intervals preserve an already started battle', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  const before = harness.getSnapshot();
  for (const seconds of [-1, NaN, Infinity]) harness.advance(seconds);
  assert.deepEqual(harness.getSnapshot(), before);
  assert.deepEqual(harness.getEvents(), []);
});

// Regression target: skipping the final partial deployment tick loses movement/time.
test('non-tick-aligned deployment moves units before starting the battle clock', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 0.075, initialHumans: 6 });
  harness.start('LV01_zombie_wave', 1);
  const humans = harness.getUnits();
  const ids = humans.slice(0, 2).map(unit => unit.id);
  assert.equal(harness.issueMoveGroup(ids, 600, 1370), true);
  harness.advance(0.05);
  assert.equal(harness.getSnapshot().spawnedZombies, 0);
  harness.advance(0.025);
  assert.equal(harness.getSnapshot().time_s, 0);
  assert.equal(harness.getSnapshot().spawnedZombies, 50);
  const moved = harness.getUnits().find(unit => unit.id === ids[0])!;
  assert.ok(moved.position.x > humans[0].position.x);
  harness.advance(0.05);
  assert.equal(harness.getSnapshot().time_s, 0.05);
  assert.equal(harness.getEvents().filter(event => event.type === 'wave_spawn').length, 1);
});

test('wave index advances once per scheduled wave and unknown levels use the default', () => {
  const manager = WaveManager.load('missing-level');
  assert.equal(manager.getMapId(), 'default');
  assert.equal(manager.getWaveIndex(), 0);
  assert.equal(manager.allWavesSpawned(), false);
  assert.equal(manager.update(0).length, 1);
  assert.equal(manager.getWaveIndex(), 1);
  assert.deepEqual(manager.update(0), []);
  assert.equal(manager.getWaveIndex(), 1);
  assert.equal(manager.update(20).length, 2);
  assert.equal(manager.getWaveIndex(), 3);
  assert.equal(manager.allWavesSpawned(), true);
});

test('registered levels and maps can select multiple configured spawn routes', () => {
  const map = definition();
  map.routes.push({ id: 'B', waypoints: [{ x: 80, y: 100 }],
    spawn: { x: 80, y: 0 }, defend: { x: 80, y: 90 }, width: 40 });
  map.spawnPoints.push({ id: 'B', x: 80, y: 0 });
  MapModel.register('two-route-fixture', map);
  WaveManager.register('two-route-level-fixture', {
    mapId: 'two-route-fixture',
    waves: [{ battleTime_s: 0, spawns: [{ unitType: 'normal_zombie', route: 'B', count: 2 }] }],
  });

  const harness = new BattleTestHarness();
  harness.start('two-route-level-fixture', 1);
  assert.equal(harness.getWaveCount(), 1);
  assert.equal(harness.getUnits().filter(unit => unit.faction === 'human' && unit.routeId === 'A').length, 25);
  assert.equal(harness.getUnits().filter(unit => unit.faction === 'human' && unit.routeId === 'B').length, 25);
  harness.advance(3.05);
  assert.deepEqual(harness.getUnits().filter(unit => unit.faction === 'zombie').map(unit => unit.routeId), ['B', 'B']);
});

// Regression target: terminal commands must not spawn waves or change simulation state.
test('ending deployment after defeat leaves the terminal battle frozen', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 0, initialHumans: 0 });
  harness.start('LV01_zombie_wave', 1);
  harness.advance(0);
  assert.equal(harness.getSnapshot().result, 'lose');
  const before = harness.getSnapshot();
  const units = harness.getUnits();
  const events = harness.getEvents();
  harness.endDeployment();
  harness.advance(30);
  harness.issueMoveAt(540, 1370, 600, 1400);
  assert.equal(harness.issueMoveGroup(['unit-1'], 600, 1400), false);
  assert.deepEqual(harness.getSnapshot(), before);
  assert.deepEqual(harness.getUnits(), units);
  assert.deepEqual(harness.getEvents(), events);
});

// Regression target: invalid elapsed time must not poison movement or combat timers.
for (const [label, seconds] of [['negative', -1], ['NaN', NaN], ['infinite', Infinity]] as const) {
  test(`movement and combat reject ${label} elapsed time without side effects`, () => {
    const store = new UnitStore();
    const human = store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
    const zombie = store.spawn('normal_zombie', { x: 540, y: 1370 }, 'B');
    human.state = 'Moving';
    human.moveTarget = { x: 600, y: 1370 };
    human.targetId = zombie.id;
    human.attackElapsed_s = 0.49;
    zombie.attackElapsed_s = 0.99;
    const before = structuredClone(store.all());
    const movement = new MovementSystem(store);
    const combat = new CombatSystem(store, MapModel.load());
    assert.deepEqual(movement.update(seconds, 1), []);
    assert.deepEqual(store.all(), before);
    assert.deepEqual(combat.update(seconds, 1), []);
    assert.deepEqual(store.all(), before);
    assert.deepEqual(combat.drainShots(), []);
  });
}

test('unknown map IDs use default geometry', () => {
  const fallback = MapModel.load('missing-map');
  assert.deepEqual(fallback.battle_bounds, MapModel.load().battle_bounds);
  assert.deepEqual(fallback.getRoute('A'), MapModel.load().getRoute('A'));
});

for (const [label, point] of [
  ['nonfinite x', { x: NaN, y: 50 }], ['nonfinite y', { x: 50, y: Infinity }],
  ['left', { x: -1, y: 50 }], ['right', { x: 101, y: 50 }],
  ['top', { x: 50, y: -1 }], ['bottom', { x: 50, y: 101 }],
] as const) {
  test(`map rejects ${label} spawn points`, () => {
    const data = definition();
    data.spawnPoints[0] = { id: 'A', ...point };
    assert.throws(() => new MapModel(data), /outside battlefield bounds/);
  });
}

test('map rejects routes without any terminal waypoint', () => {
  const data = definition();
  data.routes[0].waypoints = [];
  assert.throws(() => new MapModel(data), /must reach the defense line/);
});

test('spawn layout defaults to coincident positions and handles zero requested units', () => {
  const map = new MapModel(definition());
  assert.deepEqual(map.spawnPositions('A', 2), [{ x: 50, y: 0 }, { x: 50, y: 0 }]);
  assert.deepEqual(map.spawnPositions('A', 0), []);
});

test('spawn layout clamps column count, spacing, route width and battlefield edges', () => {
  const data = definition();
  data.spawn_layout = { columns: 0, spacing_px: -10 };
  assert.deepEqual(new MapModel(data).spawnPositions('A', 2), [{ x: 50, y: 0 }, { x: 50, y: 0 }]);
  data.routes[0].spawn_layout = { columns: 3.9, spacing_px: 100 };
  data.routes[0].spawn = { x: 0, y: 100 };
  assert.deepEqual(new MapModel(data).spawnPositions('A', 4), [
    { x: 0, y: 100 }, { x: 0, y: 100 }, { x: 20, y: 100 }, { x: 0, y: 100 },
  ]);
});

test('single-unit formation has exactly one clamped target with no division by zero', () => {
  const map = new MapModel(definition());
  assert.deepEqual(formationPositions(1, { x: -10, y: 150 }, map), [{ x: 0, y: 100 }]);
});

test('nonfinite selection inputs do not select or mutate a valid group', () => {
  const store = new UnitStore();
  const a = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  const b = store.spawn('rifleman', { x: 320, y: 400 }, 'A');
  const commands = new CommandSystem(store, MapModel.load());
  for (let index = 0; index < 5; index++) {
    const args: [number, number, number, number, number] = [300, 400, 600, 800, 1];
    args[index] = NaN;
    assert.equal(commands.issueMoveAt(...args), null);
  }
  assert.deepEqual([a.state, b.state], ['Idle', 'Idle']);
  assert.deepEqual([a.moveTarget, b.moveTarget], [null, null]);
});

test('zero-distance projectile arrives once at launch time and still applies damage', () => {
  const store = new UnitStore();
  const combat = new CombatSystem(store, MapModel.load());
  const projectiles = new ProjectileSystem(store, combat);
  const human = store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  const zombie = store.spawn('normal_zombie', { x: 540, y: 1370 }, 'B');
  projectiles.spawn(human, zombie, 2);
  for (const seconds of [-1, NaN, Infinity]) {
    assert.deepEqual(projectiles.update(seconds, 2), []);
    assert.equal(zombie.hp, 40);
  }
  const events = projectiles.update(0, 2);
  assert.equal(events.filter(event => event.type === 'projectile_hit').length, 1);
  assert.ok(events.every(event => event.time_s === 2));
  assert.equal(zombie.hp, 30);
  assert.deepEqual(projectiles.getProjectiles(), []);
  assert.deepEqual(projectiles.update(1, 3), []);
});
