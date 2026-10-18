import test from 'node:test';
import assert from 'node:assert/strict';
import units from '../../config/units.json' with { type: 'json' };
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { MapModel, type MapDefinition } from '../../src/core/MapModel.js';
import mapConfig from '../../config/map.json' with { type: 'json' };
import { UnitStore } from '../../src/core/UnitStore.js';
import { getZombieModule } from '../../src/core/units/index.js';

function openMap(): MapModel {
  return new MapModel({ ...structuredClone(mapConfig), terrain: [] } as unknown as MapDefinition);
}

test('zombie modules keep independent stats and mother infection behavior', () => {
  assert.ok(units.normal_zombie.hitPoints < units.zombie_mother.hitPoints);
  assert.ok(units.zombie_mother.hitPoints < units.fat_zombie.hitPoints);
  assert.ok(units.fat_zombie.speed_px_per_s < units.normal_zombie.speed_px_per_s);
  assert.equal(getZombieModule('normal_zombie').getMeleeAttackProfile().infectsOnHit, false);
  assert.equal(getZombieModule('fat_zombie').getMeleeAttackProfile().infectsOnHit, false);
  assert.equal(getZombieModule('zombie_mother').getMeleeAttackProfile().infectsOnHit, true);
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

test('a zombie mother converts a soldier into a normal zombie on melee contact', () => {
  const store = new UnitStore();
  const combat = new CombatSystem(store, openMap());
  const soldier = store.spawn('rifleman', { x: 425, y: 500 }, 'A');
  soldier.state = 'Moving';
  const mother = store.spawn('zombie_mother', { x: 400, y: 500 }, 'A');
  let events = [] as ReturnType<CombatSystem['update']>;
  for (let tick = 1; tick <= 12 && soldier.faction === 'human'; tick++) {
    events = combat.update(0.05, tick * 0.05);
  }
  assert.equal(store.get(soldier.id), soldier);
  assert.equal(soldier.unitType, 'normal_zombie');
  assert.equal(soldier.faction, 'zombie');
  assert.equal(soldier.hp, units.normal_zombie.hitPoints);
  assert.ok(events.some(event => event.type === 'unit_infected' &&
    (event.data as { humanId?: string; zombieId?: string }).humanId === soldier.id &&
    (event.data as { zombieId?: string }).zombieId === soldier.id));
  assert.equal(mother.faction, 'zombie');
});
