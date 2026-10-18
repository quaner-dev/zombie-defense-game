import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { CommandSystem } from '../../src/core/CommandSystem.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { MapModel } from '../../src/core/MapModel.js';
import { ProjectileSystem } from '../../src/core/ProjectileSystem.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { getHumanModule } from '../../src/core/units/index.js';

function openMap() {
  return new MapModel({
    battle_bounds: { left: 0, top: 0, right: 1000, bottom: 1000 },
    defense_line_y: 500,
    routes: [], spawnPoints: [], terrain: [],
  });
}

test('each human archetype has an independent module and its own configured stats', () => {
  const store = new UnitStore();
  const flame = store.spawn('flamethrower', { x: 200, y: 300 }, 'A');
  const shield = store.spawn('shield', { x: 200, y: 400 }, 'A');

  assert.equal(getHumanModule('flamethrower').unitType, 'flamethrower');
  assert.equal(getHumanModule('shield').unitType, 'shield');
  assert.equal(flame.faction, 'human');
  assert.equal(flame.hp, 110);
  assert.equal(shield.faction, 'human');
  assert.equal(shield.hp, 220);
  assert.ok(shield.maxHp > flame.maxHp);
});

test('default squad composition includes riflemen, flamethrowers and shield soldiers', () => {
  const battle = new BattleTestHarness();
  battle.start('LV01_zombie_wave', 1);
  const humans = battle.getUnits().filter(unit => unit.faction === 'human');
  const counts = Object.fromEntries(['rifleman', 'flamethrower', 'shield'].map(type =>
    [type, humans.filter(unit => unit.unitType === type).length]));

  assert.deepEqual(counts, { rifleman: 9, flamethrower: 3, shield: 3 });
});

test('spray projectiles deal area damage to nearby zombies and keep their projectile kind', () => {
  const store = new UnitStore();
  const map = openMap();
  const combat = new CombatSystem(store, map);
  const projectiles = new ProjectileSystem(store, combat, map);
  const flame = store.spawn('flamethrower', { x: 200, y: 300 }, 'A');
  const target = store.spawn('normal_zombie', { x: 300, y: 300 }, 'B');
  const splashTarget = store.spawn('normal_zombie', { x: 345, y: 300 }, 'B');
  const outside = store.spawn('normal_zombie', { x: 390, y: 300 }, 'B');

  const spawned = projectiles.spawn(flame, target, 0);
  assert.equal(spawned.type, 'projectile_spawned');
  const payload = spawned.data as { projectileKind: string; splashRadius_px: number };
  assert.equal(payload.projectileKind, 'flame');
  assert.equal(payload.splashRadius_px, 72);

  const impacts = projectiles.update(0.2, 0.2);
  assert.equal(target.hp, 36);
  assert.equal(splashTarget.hp, 36);
  assert.equal(outside.hp, 60);
  assert.equal(impacts.filter(event => event.type === 'damage').length, 2);
});

test('group commands accept new human modules through the shared human faction contract', () => {
  const store = new UnitStore();
  const flame = store.spawn('flamethrower', { x: 200, y: 300 }, 'A');
  const shield = store.spawn('shield', { x: 220, y: 300 }, 'A');
  const commands = new CommandSystem(store, openMap());

  const event = commands.issueMoveGroup([flame.id, shield.id], 400, 400, 1);
  assert.deepEqual(event?.data.unitIds, [flame.id, shield.id]);
  assert.equal(flame.state, 'Moving');
  assert.equal(shield.state, 'Moving');
});
