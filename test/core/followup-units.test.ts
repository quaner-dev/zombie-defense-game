import test from 'node:test';
import assert from 'node:assert/strict';
import { UnitStore } from '../../src/core/UnitStore.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { CombatStats } from '../../src/core/CombatStats.js';
import { MapModel } from '../../src/core/MapModel.js';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';

test('default follow-up squad is nine units with sniper and engineer', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 0, initialHumans: 9,
    initialHumanTypeWeights: { rifleman: 4, flamethrower: 2, shield: 1, sniper: 1, engineer: 1 } });
  harness.start('LV01_zombie_wave', 1);
  const types = harness.getUnits().filter(unit => unit.faction === 'human').map(unit => unit.unitType);
  assert.equal(types.length, 9);
  assert.equal(types.filter(type => type === 'sniper').length, 1);
  assert.equal(types.filter(type => type === 'engineer').length, 1);
});

test('damage statistics use actual damage and killer attribution', () => {
  const store = new UnitStore();
  const stats = new CombatStats();
  const combat = new CombatSystem(store, MapModel.load(), stats);
  const sniper = store.spawn('sniper', { x: 400, y: 500 }, 'B');
  const zombie = store.spawn('normal_zombie', { x: 450, y: 500 }, 'B');
  stats.register(sniper);
  const events = combat.applyDamage(zombie.id, 40, sniper.id, 0, 'sniper', sniper.position);
  const lethal = combat.applyDamage(zombie.id, 100, sniper.id, .1, 'sniper', sniper.position);
  assert.equal((events.find(event => event.type === 'damage')?.data as { appliedAmount: number }).appliedAmount, 40);
  assert.equal((lethal.find(event => event.type === 'damage')?.data as { appliedAmount: number }).appliedAmount, 20);
  const result = stats.snapshot(store.all()).byUnitType.sniper;
  assert.equal(result.damage, 60);
  assert.equal(result.kills, 1);
});

test('shield reduces direct front damage but not explosion damage', () => {
  const store = new UnitStore();
  const combat = new CombatSystem(store, MapModel.load());
  const shield = store.spawn('shield', { x: 500, y: 500 }, 'B');
  shield.facing = { x: 1, y: 0 };
  const source = store.spawn('normal_zombie', { x: 550, y: 500 }, 'B');
  const front = combat.applyDamage(shield.id, 10, source.id, 0, 'melee', source.position);
  assert.equal((front[0].data as { appliedAmount: number }).appliedAmount, 4);
  shield.hp = shield.maxHp;
  const explosion = combat.applyDamage(shield.id, 10, source.id, .1, 'explosion', source.position);
  assert.equal((explosion[0].data as { appliedAmount: number }).appliedAmount, 10);
});

test('courtyard continuous generation stops exactly at 720', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 0, initialHumans: 9,
    initialHumanTypeWeights: { engineer: 9 } });
  harness.start('LV02_courtyard_wave', 1);
  harness.advance(30);
  assert.ok(harness.getSnapshot().spawnedZombies <= 720);
  for (let i = 0; i < 80 && harness.getSnapshot().spawnedZombies < 720; i++) harness.advance(10);
  assert.ok(harness.getSnapshot().spawnedZombies <= 720);
  assert.equal(harness.getUnits().filter(unit => unit.unitType === 'gut_zombie').length, 36);
});

test('gut zombie throws only after a hit and releases its remaining inventory on death', () => {
  const store = new UnitStore();
  const combat = new CombatSystem(store, MapModel.load());
  const gut = store.spawn('gut_zombie', { x: 500, y: 500 }, 'B');
  const swallowed = store.spawn('normal_zombie', { x: 510, y: 500 }, 'B');
  const attacker = store.spawn('rifleman', { x: 540, y: 500 }, 'B');
  combat.update(.05, .05);
  assert.equal(gut.storedGutUnitIds.length, 1);
  assert.equal(swallowed.state, 'StoredInGut', 'same-frame AI must not reactivate swallowed zombies');
  assert.equal(attacker.targetId, gut.id, 'stored zombies cannot be targeted from an earlier frame snapshot');
  assert.deepEqual(combat.applyDamage(swallowed.id, 1, attacker.id, .1), [], 'in-flight shots cannot hit stored zombies');
  const hit = combat.applyDamage(gut.id, 1, attacker.id, .1, 'bullet', attacker.position);
  assert.ok(hit.some(event => event.type === 'gut_thrown'));
  assert.equal(swallowed.state, 'Suicidal');
  combat.update(.05, .15);
  assert.equal(swallowed.state, 'Suicidal', 'a thrown zombie cannot be swallowed again');
  assert.equal(gut.storedGutUnitIds.length, 0);
  for (let i = 0; i < 20; i++) combat.update(.05, .20 + i * .05);
  assert.equal(swallowed.state, 'Dead');
  const remaining = store.spawn('normal_zombie', { x: 512, y: 500 }, 'B');
  gut.storedGutUnitIds.push(remaining.id);
  combat.applyDamage(gut.id, 999, attacker.id, 2, 'bullet', attacker.position);
  assert.equal(remaining.state, 'Advancing');
  assert.equal(remaining.storedInGutById, null);
});
