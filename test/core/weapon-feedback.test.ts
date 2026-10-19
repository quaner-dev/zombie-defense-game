import test from 'node:test';
import assert from 'node:assert/strict';
import mapConfig from '../../config/map.json' with { type: 'json' };
import config from '../../config/units.json' with { type: 'json' };
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { CommandSystem } from '../../src/core/CommandSystem.js';
import { MovementSystem } from '../../src/core/MovementSystem.js';
import { ProjectileSystem } from '../../src/core/ProjectileSystem.js';
import { MapModel, type MapDefinition, type TerrainDefinition } from '../../src/core/MapModel.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import type { BattleEvent } from '../../src/core/types.js';

function setup(terrain: TerrainDefinition[] = []) {
  const store = new UnitStore();
  const map = new MapModel({ ...structuredClone(mapConfig), terrain } as unknown as MapDefinition);
  const combat = new CombatSystem(store, map), commands = new CommandSystem(store, map);
  const movement = new MovementSystem(store, map);
  let time = 0;
  const advance = (ticks: number) => {
    const events: BattleEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      time += .05;
      events.push(...combat.update(.05, time), ...movement.update(.05, time));
    }
    return events;
  };
  const zombie = (x: number, y = 500) => {
    const unit = store.spawn('normal_zombie', { x, y }, 'A');
    unit.speed_px_per_s = 0;
    unit.hp = unit.maxHp = 10000;
    return unit;
  };
  return { store, map, combat, commands, movement, advance, zombie };
}

test('one anchored flame damages all in-cone targets once per tick without spawning projectiles', () => {
  const f = setup(), flame = f.store.spawn('flamethrower', { x: 300, y: 500 }, 'A');
  const near = f.zombie(400), far = f.zombie(510, 530);
  const outside = f.zombie(500, 560), behind = f.zombie(100), beyond = f.zombie(530);
  const stored = f.zombie(490); stored.state = 'StoredInGut';
  const release = f.advance(6);
  assert.equal(flame.state, 'Firing');
  assert.equal(flame.flameLength_px, 220);
  assert.equal(near.hp, 10000, 'release animation does no damage');
  const first = f.advance(3);
  assert.equal(near.hp, 9986); assert.equal(far.hp, 9986);
  assert.equal(first.filter(event => event.type === 'damage').length, 2);
  f.advance(3);
  assert.equal(near.hp, 9972); assert.equal(far.hp, 9972);
  for (const target of [outside, behind, beyond, stored]) assert.equal(target.hp, 10000);
  assert.ok(![...release, ...first].some(event => event.type === 'projectile_spawned'));
  assert.deepEqual(f.combat.drainShots(), []);
});

for (const kind of ['wall', 'door']) {
  test(`flame damage stops at a closed ${kind} even when another target is visible`, () => {
    const f = setup([{ id: 'cover', kind, blocksMovement: true, maxHp: 100,
      bounds: { left: 440, right: 450, top: 500, bottom: 550 } }]);
    f.store.spawn('flamethrower', { x: 300, y: 500 }, 'A');
    const visible = f.zombie(400, 495), covered = f.zombie(500, 510);
    f.advance(9);
    assert.equal(visible.hp, 9986);
    assert.equal(covered.hp, 10000);
  });
}

test('move commands retract the flame before movement and do not reset the waiting timer', () => {
  const f = setup(), flame = f.store.spawn('flamethrower', { x: 300, y: 500 }, 'A');
  const target = f.zombie(450);
  f.advance(9);
  f.commands.issueMoveGroup([flame.id], 300, 600, .45);
  const before = target.hp;
  f.advance(2);
  assert.equal(flame.position.y, 500);
  assert.ok(flame.flameLength_px > 0 && flame.flameLength_px < 220);
  const elapsed = flame.stateElapsed_s;
  f.commands.issueMoveGroup([flame.id], 300, 610, .55);
  assert.equal(flame.stateElapsed_s, elapsed);
  f.advance(4);
  assert.equal(flame.state, 'Moving'); assert.equal(flame.flameLength_px, 0);
  const y = flame.position.y;
  f.advance(1);
  assert.ok(Math.abs(flame.position.y - y - config.flamethrower.speed_px_per_s * .05) < 1e-8);
  assert.equal(target.hp, before, 'retraction and movement never leave lingering flame damage');
  for (let i = 0; i < 70 && flame.moveTarget; i++) f.advance(1);
  f.advance(1);
  assert.equal(flame.state, 'ReleasingFlame');
  assert.equal(flame.flameLength_px, 0);
  f.advance(2); assert.ok(flame.flameLength_px > 0 && flame.flameLength_px < 220);
});

test('overheated flame keeps its full recovery countdown across replacement move commands', () => {
  const f = setup(), flame = f.store.spawn('flamethrower', { x: 300, y: 500 }, 'A');
  const target = f.zombie(450);
  f.advance(45);
  assert.equal(flame.state, 'Overheated'); assert.equal(flame.weaponHeat, 100);
  const remaining = flame.weaponCooldown_s, hp = target.hp;
  f.commands.issueMoveGroup([flame.id], 300, 520, 2.25);
  f.advance(10);
  f.commands.issueMoveGroup([flame.id], 300, 525, 2.75);
  assert.ok(Math.abs(flame.weaponCooldown_s - (remaining - .5)) < 1e-8);
  f.advance(10);
  assert.equal(target.hp, hp); assert.equal(flame.weaponHeat, 100, 'heat stays locked first');
  f.advance(30);
  assert.equal(flame.state, 'Cooling');
  assert.ok(flame.weaponHeat < 100 && flame.weaponHeat > 25);
  f.advance(24);
  assert.equal(flame.weaponCooldown_s, 0);
  assert.equal(flame.weaponHeat, 25);
  assert.equal(flame.state, 'ReleasingFlame');
});

test('engineer dismantling never attacks or turns, and redeploying cannot skip cooling', () => {
  const f = setup(), engineer = f.store.spawn('engineer', { x: 300, y: 500 }, 'A');
  f.zombie(450);
  f.commands.toggleEngineerDeployment(engineer.id);
  assert.ok(!f.advance(40).some(event => event.type === 'projectile_spawned'));
  assert.equal(engineer.state, 'Deployed');
  f.advance(62);
  assert.equal(engineer.state, 'Overheated');
  assert.equal(engineer.weaponHeat, 100);
  f.advance(50);
  assert.equal(engineer.state, 'Cooling');
  f.commands.issueMoveGroup([engineer.id], 300, 520, 7.6);
  const facing = { ...engineer.facing };
  f.zombie(300, 620);
  f.advance(10);
  const elapsed = engineer.stateElapsed_s;
  f.commands.issueMoveGroup([engineer.id], 300, 525, 8.1);
  assert.equal(engineer.stateElapsed_s, elapsed);
  const events = f.advance(20);
  assert.deepEqual(engineer.facing, facing);
  assert.equal(engineer.targetId, null);
  assert.ok(!events.some(event => event.type === 'projectile_spawned'));
  assert.equal(engineer.state, 'Moving');
  assert.ok(engineer.weaponCooldown_s > 0);
  f.commands.toggleEngineerDeployment(engineer.id);
  assert.ok(!f.advance(40).some(event => event.type === 'projectile_spawned'));
  assert.equal(engineer.state, 'Deployed');
});

test('an idle engineer automatically sets up for two seconds before firing', () => {
  const f = setup(), engineer = f.store.spawn('engineer', { x: 300, y: 500 }, 'A');
  f.zombie(450);
  const start = { ...engineer.position };
  const deploying = f.advance(40);
  assert.equal(engineer.state, 'Deploying');
  assert.ok(Math.abs(engineer.stateElapsed_s - 1.95) < 1e-8);
  assert.deepEqual(engineer.position, start);
  assert.ok(!deploying.some(event => event.type === 'projectile_spawned'));
  const deployed = f.advance(1);
  assert.equal(engineer.state, 'Deployed');
  assert.ok(deployed.some(event => event.type === 'unit_state_changed' && (event.data as { to: string }).to === 'Deployed'));
  assert.ok(f.advance(2).some(event => event.type === 'projectile_spawned' && (event.data as { projectileKind: string }).projectileKind === 'machine_gun'));
});

test('dragging a deployed engineer dismantles, moves and automatically sets up again', () => {
  const f = setup(), engineer = f.store.spawn('engineer', { x: 300, y: 500 }, 'A');
  f.zombie(450);
  f.advance(41);
  const start = { ...engineer.position };
  f.commands.issueMoveGroup([engineer.id], 300, 580, 2.05);
  assert.equal(engineer.state, 'Dismantling');
  const first = f.advance(10);
  const elapsed = engineer.stateElapsed_s;
  f.commands.issueMoveGroup([engineer.id], 300, 600, 2.55);
  assert.equal(engineer.stateElapsed_s, elapsed, 'replacing the destination preserves progress');
  const rest = f.advance(19);
  assert.deepEqual(engineer.position, start, 'the gun must be packed before moving');
  assert.ok(![...first, ...rest].some(event => event.type === 'projectile_spawned'));
  f.advance(1);
  assert.equal(engineer.state, 'Moving');
  assert.ok(engineer.position.y > start.y);
  for (let i = 0; i < 60 && engineer.state === 'Moving'; i++) f.advance(1);
  assert.equal(engineer.state, 'Idle');
  assert.ok(Math.abs(engineer.position.y - 600) <= config.movement.arrival_tolerance_px);
  f.advance(1);
  assert.equal(engineer.state, 'Deploying');
  assert.equal(engineer.stateElapsed_s, 0);
  assert.ok(!f.advance(40).some(event => event.type === 'projectile_spawned'));
  assert.equal(engineer.state, 'Deployed');
  assert.ok(f.advance(2).some(event => event.type === 'projectile_spawned'));
});

test('setup and overheating can be interrupted by a move without skipping dismantling or cooling', () => {
  for (const state of ['Deploying', 'Overheated', 'Cooling'] as const) {
    const f = setup(), engineer = f.store.spawn('engineer', { x: 300, y: 500 }, 'A');
    engineer.state = state; engineer.stateElapsed_s = .5;
    engineer.weaponCooldown_s = 4; engineer.weaponHeat = 100;
    f.commands.issueMoveGroup([engineer.id], 300, 650, 1);
    assert.equal(engineer.state, 'Dismantling');
    assert.equal(engineer.stateElapsed_s, 0);
    assert.equal(engineer.weaponCooldown_s, 4);
    f.advance(29);
    assert.deepEqual(engineer.position, { x: 300, y: 500 });
    f.advance(1);
    assert.equal(engineer.state, 'Moving');
    assert.ok(Math.abs(engineer.weaponCooldown_s - 2.5) < 1e-8);
    assert.ok(engineer.position.y > 500);
  }
});

test('a rifle shot reaches a target at its new 460px range before expiring', () => {
  const f = setup(), rifle = f.store.spawn('rifleman', { x: 300, y: 500 }, 'A');
  const target = f.zombie(760), projectiles = new ProjectileSystem(f.store, f.combat, f.map);
  const shot = f.advance(7).find(event => event.type === 'projectile_spawned');
  assert.ok(shot); assert.equal(rifle.targetId, target.id);
  const hits = projectiles.update(.55, .9);
  assert.ok(hits.some(event => event.type === 'damage'));
  assert.equal(target.hp, 10000 - config.rifleman.damagePerHit);
});

test('a sniper shot travels its full range before its impact and damage', () => {
  const f = setup(), sniper = f.store.spawn('sniper', { x: 300, y: 500 }, 'A');
  const target = f.zombie(300 + config.sniper.attack_range_px);
  const projectiles = new ProjectileSystem(f.store, f.combat, f.map);
  const shot = f.advance(32).find(event => event.type === 'projectile_spawned');
  assert.ok(shot); assert.equal(sniper.targetId, target.id);
  assert.deepEqual(sniper.facing, { x: config.sniper.attack_range_px, y: 0 });
  const inFlight = projectiles.update(.35, shot.time_s + .35);
  assert.ok(!inFlight.some(event => event.type === 'projectile_hit' || event.type === 'damage'));
  assert.equal(target.hp, 10000);
  const events = projectiles.update(.1, shot.time_s + .45);
  const hit = events.find(event => event.type === 'projectile_hit');
  assert.ok(hit);
  assert.deepEqual((hit.data as { position: { x: number; y: number } }).position, target.position);
  assert.equal(target.hp, 10000 - config.sniper.damagePerHit);
  assert.equal(projectiles.getProjectiles().length, 0);
});
