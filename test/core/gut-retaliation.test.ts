import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { CivilianStore } from '../../src/core/CivilianStore.js';
import { MapModel, type TerrainDefinition } from '../../src/core/MapModel.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import config from '../../config/units.json' with { type: 'json' };

function setup(terrain: TerrainDefinition[] = [], rescue = false) {
  const map = new MapModel({ battle_bounds: { left: 0, top: 0, right: 1000, bottom: 1000 },
    defense_line_y: 800, routes: [], spawnPoints: [], terrain });
  const store = new UnitStore(), civilians = rescue ? new CivilianStore() : undefined;
  const combat = new CombatSystem(store, map, undefined, civilians);
  const gut = store.spawn('gut_zombie', { x: 500, y: 500 }, 'A');
  const swallowed = store.spawn('normal_zombie', { x: 510, y: 500 }, 'A');
  const shooter = store.spawn('rifleman', { x: 850, y: 500 }, 'A');
  let tick = 0;
  const advance = () => combat.update(.05, ++tick / 20);
  advance();
  assert.equal(swallowed.state, 'StoredInGut');
  const hit = () => combat.applyDamage(gut.id, 1, shooter.id, tick / 20, 'bullet', shooter.position);
  return { map, store, combat, gut, swallowed, shooter, civilians, advance, hit };
}

for (const rescue of [false, true]) {
  test(`a hit makes a gut approach the shooter before spitting locally in ${rescue ? 'rescue' : 'normal'} combat`, () => {
    const f = setup([], rescue);
    // The shooter must take priority over a closer defender or rescue civilian.
    const nearer = f.store.spawn('rifleman', { x: 400, y: 500 }, 'A');
    f.civilians?.spawn({ x: 450, y: 500 });
    const start = { ...f.gut.position }, storedPosition = { ...f.swallowed.position };
    assert.ok(!f.hit().some(e => e.type === 'gut_thrown'));
    assert.equal(f.swallowed.state, 'StoredInGut');
    assert.deepEqual(f.swallowed.position, storedPosition);
    f.advance();
    assert.equal(f.gut.targetId, f.shooter.id);
    assert.ok(f.gut.position.x > start.x, 'the gut walks toward its attacker');
    assert.equal(f.swallowed.state, 'StoredInGut');

    // Move the shooter after the hit: pursuit must use its current position.
    f.shooter.position = { x: 700, y: 650 };
    let spit;
    for (let i = 0; i < 400 && !spit; i++) {
      const events = f.advance();
      spit = events.find(e => e.type === 'gut_thrown');
      if (!spit) assert.equal(f.swallowed.state, 'StoredInGut');
    }
    assert.ok(spit, 'the pending hit survives the walk without another shot');
    assert.ok(Math.hypot(f.gut.position.x - f.shooter.position.x, f.gut.position.y - f.shooter.position.y)
      <= config.gut_zombie.attack_range_px + 1e-8);
    assert.equal(f.swallowed.state, 'Suicidal');
    assert.equal(f.swallowed.stateElapsed_s, 0, 'the explosion timer starts after release');
    assert.equal(f.swallowed.storedInGutById, null);
    assert.equal(f.gut.storedGutUnitIds.length, 0);
    assert.ok(Math.hypot(f.swallowed.position.x - f.gut.position.x, f.swallowed.position.y - f.gut.position.y)
      <= f.gut.radius_px + f.swallowed.radius_px + 2 + 1e-8);
    for (const human of [f.shooter, nearer]) {
      assert.ok(Math.hypot(f.swallowed.position.x - human.position.x, f.swallowed.position.y - human.position.y)
        >= f.swallowed.radius_px + human.radius_px, 'spitting must not cover a soldier');
      assert.equal(human.faction, 'human');
    }
    assert.deepEqual((spit.data as { targetPosition: unknown }).targetPosition, f.swallowed.position);
  });
}

test('a nearby gut still waits for a hit, then spits on the next AI step', () => {
  const f = setup();
  f.shooter.position = { x: f.gut.position.x + 37, y: f.gut.position.y };
  assert.ok(!f.advance().some(e => e.type === 'gut_thrown'));
  assert.ok(!f.hit().some(e => e.type === 'gut_thrown'));
  assert.equal(f.swallowed.state, 'StoredInGut');
  assert.ok(f.advance().some(e => e.type === 'gut_thrown'));
  assert.notDeepEqual(f.swallowed.position, f.shooter.position);
});

test('a wall blocks spitting even when the shooter is within melee range', () => {
  const wall: TerrainDefinition = { id: 'wall', kind: 'wall', blocksMovement: true,
    bounds: { left: 535, top: 400, right: 539, bottom: 600 } };
  const f = setup([wall]);
  f.gut.position = { x: 506, y: 500 };
  f.shooter.position = { x: 542, y: 500 };
  f.hit();
  for (let i = 0; i < 5; i++) assert.ok(!f.advance().some(e => e.type === 'gut_thrown'));
  assert.equal(f.swallowed.state, 'StoredInGut');
});

test('spitting beside a wall stays local, on clear ground and inside map bounds', () => {
  const wall: TerrainDefinition = { id: 'wall', kind: 'wall', blocksMovement: true,
    bounds: { left: 100, top: 100, right: 450, bottom: 550 } };
  const f = setup([wall]);
  f.gut.position = { x: 480, y: 500 };
  f.shooter.position = { x: 480, y: 537 };
  f.hit();
  assert.ok(f.advance().some(e => e.type === 'gut_thrown'));
  assert.ok(!f.map.terrainContains(f.swallowed.position, wall, f.swallowed.radius_px));
  assert.equal(f.map.firstBlockingTerrain(f.gut.position, f.swallowed.position, f.swallowed.radius_px), null);
  assert.ok(Math.hypot(f.swallowed.position.x - f.gut.position.x, f.swallowed.position.y - f.gut.position.y) <= 46 + 1e-8);
});

test('spitting at a map corner keeps the whole released body inside the battlefield', () => {
  const f = setup();
  f.gut.position = { x: 28, y: 28 };
  f.shooter.position = { x: 28, y: 65 };
  f.hit();
  assert.ok(f.advance().some(e => e.type === 'gut_thrown'));
  const { x, y } = f.swallowed.position, radius = f.swallowed.radius_px;
  assert.ok(x - radius >= 0 && x + radius <= 1000 && y - radius >= 0 && y + radius <= 1000);
  assert.ok(Math.hypot(x - f.gut.position.x, y - f.gut.position.y) <= 46 + 1e-8);
});

test('no clear local spit position defers release without losing the stored zombie', () => {
  const f = setup();
  f.shooter.position = { x: f.gut.position.x + 37, y: f.gut.position.y };
  const surrounding = Array.from({ length: 8 }, (_, index) => f.store.spawn('rifleman', {
    x: f.gut.position.x + Math.cos(index * Math.PI / 4) * 46,
    y: f.gut.position.y + Math.sin(index * Math.PI / 4) * 46,
  }, 'A'));
  f.hit();
  assert.ok(!f.advance().some(e => e.type === 'gut_thrown'));
  assert.equal(f.swallowed.state, 'StoredInGut');
  assert.equal(f.gut.storedGutUnitIds.length, 1);
  surrounding.forEach(human => f.store.remove(human.id));
  assert.ok(f.advance().some(e => e.type === 'gut_thrown'));
});

for (const action of ['kill', 'remove'] as const) {
  test(`a pending spit is cancelled when its attacker is ${action === 'kill' ? 'dead' : 'removed'}`, () => {
    const f = setup();
    f.hit();
    const attackerPosition = { ...f.shooter.position }, attackerId = f.shooter.id;
    f.store[action](attackerId);
    const replacement = f.store.spawn('rifleman', attackerPosition, 'A');
    assert.ok(replacement.id !== attackerId);
    for (let i = 0; i < 350; i++) assert.ok(!f.advance().some(e => e.type === 'gut_thrown'));
    assert.equal(f.swallowed.state, 'StoredInGut');
  });
}

test('lethal gunfire releases inventory locally without spitting at the killer', () => {
  const f = setup();
  f.hit();
  const position = { ...f.gut.position };
  const events = f.combat.applyDamage(f.gut.id, 1000, f.shooter.id, .1, 'bullet', f.shooter.position);
  assert.ok(!events.some(e => e.type === 'gut_thrown'));
  assert.ok(events.some(e => e.type === 'gut_released'));
  assert.equal(f.gut.state, 'Dead');
  assert.equal(f.swallowed.state, 'Advancing');
  assert.equal(f.swallowed.storedInGutById, null);
  assert.ok(Math.hypot(f.swallowed.position.x - position.x, f.swallowed.position.y - position.y) <= 46);
});

test('successive nearby hits respect the spit cooldown and each spit needs a hit', () => {
  const f = setup();
  const extra = f.store.spawn('normal_zombie', { x: 510, y: 500 }, 'A');
  f.shooter.hp = f.shooter.maxHp = 10000;
  f.shooter.position = { x: f.gut.position.x + 37, y: f.gut.position.y };
  f.hit();
  assert.equal(f.advance().filter(e => e.type === 'gut_thrown').length, 1);
  assert.equal(extra.state, 'StoredInGut');
  f.hit();
  for (let i = 0; i < 23; i++) assert.ok(!f.advance().some(e => e.type === 'gut_thrown'));
  assert.equal(extra.state, 'StoredInGut');
  assert.equal(f.advance().filter(e => e.type === 'gut_thrown').length, 1);
  assert.equal(extra.state, 'Suicidal');
  const unprovoked = f.store.spawn('normal_zombie', { ...f.gut.position }, 'A');
  for (let i = 0; i < 30; i++) assert.ok(!f.advance().some(e => e.type === 'gut_thrown'));
  assert.equal(unprovoked.state, 'StoredInGut');
});

test('a locally spat zombie gets the full suicide delay and retains explosion damage', () => {
  const f = setup();
  f.shooter.hp = f.shooter.maxHp = 10000;
  f.shooter.position = { x: f.gut.position.x + 37, y: f.gut.position.y };
  f.hit();
  assert.ok(f.advance().some(e => e.type === 'gut_thrown'));
  for (let i = 0; i < 15; i++) {
    assert.ok(!f.advance().some(e => e.type === 'zombie_exploded'));
    assert.equal(f.swallowed.state, 'Suicidal');
  }
  const explosion = f.advance();
  assert.equal(f.swallowed.state, 'Dead');
  assert.ok(explosion.some(e => e.type === 'zombie_exploded'));
  assert.ok(explosion.some(e => e.type === 'damage' &&
    (e.data as { targetId: string; damageKind: string; appliedAmount: number }).targetId === f.shooter.id &&
    (e.data as { damageKind: string }).damageKind === 'explosion' &&
    (e.data as { appliedAmount: number }).appliedAmount === config.gut_zombie.explosion_damage_human));
  assert.equal(f.shooter.faction, 'human');
});

test('death, transformation and pooled reuse clear a gut retaliation target', () => {
  const f = setup();
  f.hit();
  assert.equal(f.gut.gutRetaliationTargetId, f.shooter.id);
  f.store.transform(f.gut.id, 'gut_zombie');
  assert.equal(f.gut.gutRetaliationTargetId, null);
  f.hit();
  f.store.kill(f.gut.id);
  assert.equal(f.gut.gutRetaliationTargetId, null);
  f.store.remove(f.gut.id);
  const fresh = f.store.spawn('gut_zombie', { x: 500, y: 500 }, 'A');
  assert.equal(fresh.gutRetaliationTargetId, null);
});
