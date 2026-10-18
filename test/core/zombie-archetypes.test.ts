import test from 'node:test';
import assert from 'node:assert/strict';
import units from '../../config/units.json' with { type: 'json' };
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { MapModel, type MapDefinition } from '../../src/core/MapModel.js';
import mapConfig from '../../config/map.json' with { type: 'json' };
import { UnitStore } from '../../src/core/UnitStore.js';
import { getZombieModule } from '../../src/core/units/index.js';
import { CivilianStore } from '../../src/core/CivilianStore.js';

function openMap(): MapModel {
  return new MapModel({ ...structuredClone(mapConfig), terrain: [] } as unknown as MapDefinition);
}

test('zombie modules keep independent stats without soldier infection on hit', () => {
  assert.ok(units.normal_zombie.hitPoints < units.zombie_mother.hitPoints);
  assert.ok(units.zombie_mother.hitPoints < units.fat_zombie.hitPoints);
  assert.ok(units.fat_zombie.speed_px_per_s < units.normal_zombie.speed_px_per_s);
  assert.equal(getZombieModule('normal_zombie').getMeleeAttackProfile().infectsOnHit, false);
  assert.equal(getZombieModule('fat_zombie').getMeleeAttackProfile().infectsOnHit, false);
  assert.equal(getZombieModule('zombie_mother').getMeleeAttackProfile().infectsOnHit, false);
});

test('fat zombie advances more slowly than a normal zombie', () => {
  const distanceAfterStep = (unitType: 'normal_zombie' | 'fat_zombie') => {
    const store = new UnitStore();
    const combat = new CombatSystem(store, openMap());
    const zombie = store.spawn(unitType, { x: 300, y: 500 }, 'A');
    store.spawn('rifleman', { x: 800, y: 500 }, 'A');
    combat.update(0.05, 0.05);
    return zombie.position.x - 300;
  };
  assert.ok(distanceAfterStep('normal_zombie') > distanceAfterStep('fat_zombie'));
});

for (const rescue of [false, true]) {
  for (const type of ['rifleman', 'flamethrower', 'shield', 'sniper', 'engineer'] as const) {
    test(`mother melee damages ${type} without changing faction in ${rescue ? 'rescue' : 'normal'} combat`, () => {
      const store = new UnitStore();
      const combat = new CombatSystem(store, openMap(), undefined, rescue ? new CivilianStore() : undefined);
      const soldier = store.spawn(type, { x: 425, y: 500 }, 'A');
      soldier.state = 'Moving';
      const mother = store.spawn('zombie_mother', { x: 400, y: 500 }, 'A');
      const events = Array.from({ length: 24 }, (_, tick) => combat.update(.05, (tick + 1) * .05)).flat();
      assert.equal(store.get(soldier.id), soldier);
      assert.equal(soldier.unitType, type);
      assert.equal(soldier.faction, 'human');
      assert.ok(soldier.hp > 0 && soldier.hp < soldier.maxHp);
      assert.ok(events.some(event => event.type === 'damage' &&
        (event.data as { sourceId: string }).sourceId === mother.id));
      assert.ok(!events.some(event => event.type === 'unit_infected'));
    });
  }
}

test('civilian infection is still separate from soldier damage', () => {
  const store = new UnitStore(), civilians = new CivilianStore();
  const civilian = civilians.spawn({ x: 425, y: 500 });
  store.spawn('zombie_mother', { x: 400, y: 500 }, 'A');
  const combat = new CombatSystem(store, openMap(), undefined, civilians);
  const events = Array.from({ length: 12 }, (_, tick) => combat.update(.05, (tick + 1) * .05)).flat();
  assert.equal(civilian.state, 'transforming');
  const started = events.find(event => event.type === 'civilian_transform_started')!.time_s;
  const transformed = civilians.update(.8, started + .8, position => store.spawn('normal_zombie', position, 'A').id);
  assert.equal(transformed[0].type, 'civilian_transformed');
  assert.equal(store.all().length, 2);
});
