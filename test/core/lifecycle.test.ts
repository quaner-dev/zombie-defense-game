import test from 'node:test';
import config from '../../config/units.json' with { type: 'json' };
import assert from 'node:assert/strict';
import { UnitStore } from '../../src/core/UnitStore.js';
import { MovementSystem } from '../../src/core/MovementSystem.js';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { MapModel } from '../../src/core/MapModel.js';
import { SpawnSystem } from '../../src/core/SpawnSystem.js';
import { WaveManager, type WaveSpawnEventData } from '../../src/core/WaveManager.js';

test('death is idempotent, excludes dead units, and freezes their movement', () => {
  const store = new UnitStore();
  const unit = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  unit.state = 'Moving';
  unit.moveTarget = { x: 800, y: 400 };
  unit.targetId = 'enemy';
  unit.velocity = { x: 120, y: 0 };
  assert.equal(store.kill(unit.id), true);
  assert.equal(store.kill(unit.id), false);
  assert.equal(store.kill('missing'), false);
  assert.equal(unit.hp, 0);
  assert.equal(unit.state, 'Dead');
  assert.equal(unit.moveTarget, null);
  assert.equal(unit.targetId, null);
  assert.deepEqual(unit.velocity, { x: 0, y: 0 });
  assert.deepEqual(store.living(), []);
  new MovementSystem(store).update(2, 2);
  assert.deepEqual(unit.position, { x: 300, y: 400 });
});

test('pool reuse resets every field and assigns a new identity to prevent stale references', () => {
  const store = new UnitStore();
  const unit = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  const oldId = unit.id;
  unit.hp = 1;
  unit.state = 'Firing';
  unit.moveTarget = { x: 900, y: 900 };
  unit.targetId = 'enemy';
  unit.velocity = { x: 10, y: 20 };
  unit.attackElapsed_s = 0.49;
  unit.breached = true;
  unit.spawnPointId = 'west';
  unit.climbingWallId = 'wall';
  unit.climbTarget = { x: 600, y: 600 };
  unit.stackLevel = 3;
  assert.equal(store.remove(oldId), true);
  assert.equal(store.remove(oldId), false);
  assert.equal(unit.active, false);
  assert.equal(store.get(oldId), undefined);
  const reused = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  assert.equal(reused, unit);
  assert.notEqual(reused.id, oldId);
  assert.equal(store.kill(oldId), false);
  assert.equal(reused.unitType, 'normal_zombie');
  assert.equal(reused.faction, 'zombie');
  // Task 4 reconciles ordinary zombie defaults with the authoritative combat spec.
  assert.equal(reused.hp, 60);
  assert.equal(reused.maxHp, 60);
  assert.equal(reused.speed_px_per_s, config.normal_zombie.speed_px_per_s);
  assert.equal(reused.state, 'Advancing');
  assert.equal(reused.routeId, 'B');
  assert.deepEqual(reused.position, { x: 540, y: 260 });
  assert.deepEqual(reused.velocity, { x: 0, y: 0 });
  assert.equal(reused.moveTarget, null);
  assert.equal(reused.targetId, null);
  assert.equal(reused.attackElapsed_s, 0);
  assert.equal(reused.breached, false);
  assert.equal(reused.spawnPointId, null);
  assert.equal(reused.climbingWallId, null);
  assert.equal(reused.climbTarget, null);
  assert.equal(reused.stackLevel, 0);
  assert.equal(reused.active, true);
  assert.equal(store.living().length, 1);
});

test('clear removes all active units and reuse restores human config without resetting IDs', () => {
  const store = new UnitStore();
  const zombie = store.spawn('normal_zombie', { x: 540, y: 260 }, 'B');
  const oldId = zombie.id;
  store.clear();
  assert.deepEqual(store.all(), []);
  assert.equal(zombie.active, false);
  const human = store.spawn('rifleman', { x: 180, y: 1370 }, 'A');
  assert.notEqual(human.id, oldId);
  assert.equal(human.hp, 100);
  assert.equal(human.speed_px_per_s, 48);
  assert.equal(human.state, 'Idle');
});

test('spawn system admits all 700 configured zombies on the scheduled route and batch layout', () => {
  const waves = WaveManager.load('LV01_zombie_wave');
  const map = MapModel.load(waves.getMapId());
  const store = new UnitStore();
  const spawns = new SpawnSystem(store, map);
  for (const event of waves.update(100)) spawns.enqueue(event.data as WaveSpawnEventData);
  spawns.update(100);

  const zombies = store.living();
  const spawnedByRoute = new Map<string, number>();
  const spawnedTypes = new Set<string>();
  for (const unit of zombies) {
    spawnedByRoute.set(unit.routeId, (spawnedByRoute.get(unit.routeId) ?? 0) + 1);
    spawnedTypes.add(unit.unitType);
  }
  assert.equal(spawns.spawnedCount, 700);
  assert.equal(zombies.length, 700);
  assert.deepEqual(Object.fromEntries(spawnedByRoute), { B: 260, A: 220, C: 220 });
  assert.ok(spawnedTypes.has('fat_zombie'));
  assert.ok(spawnedTypes.has('zombie_mother'));
  assert.ok(zombies.every(unit => unit.unitType === 'normal_zombie' ||
    unit.unitType === 'fat_zombie' || unit.unitType === 'zombie_mother'));
});

test('the seven-soldier cap is enforced and surviving soldiers persist when a new wave starts', () => {
  const harness = new BattleTestHarness({ deploymentDuration_s: 3, initialHumans: 50 }, () => new WaveManager({
    mapId: 'LV01_cabin_rooms', waves: [{ battleTime_s: 0, spawns: [] }, { battleTime_s: 7, spawns: [] }],
  }));
  harness.start('LV01_zombie_wave', 1);
  const soldiers = harness.getUnits().filter(unit => unit.faction === 'human');
  assert.equal(soldiers.length, 7);
  const survivor = soldiers[0];
  const originalType = survivor.unitType;
  const originalPosition = { ...survivor.position };
  // getUnits() is intentionally detached; injure the authoritative unit so
  // the regression covers health persistence rather than a copied snapshot.
  const authoritative = (harness as any).units.get(survivor.id);
  authoritative.hp = 63;

  harness.advance(7);

  const afterWave = harness.getUnits().filter(unit => unit.faction === 'human');
  assert.equal(afterWave.length, 7);
  const sameSoldier = afterWave.find(unit => unit.id === survivor.id);
  assert.ok(sameSoldier, 'the original soldier identity remains in the battle');
  assert.equal(sameSoldier.unitType, originalType);
  assert.deepEqual(sameSoldier.position, originalPosition, 'wave arrival does not redeploy the soldier');
  assert.ok(sameSoldier.hp < sameSoldier.maxHp, 'the original soldier remains in its current health state');
  assert.equal(harness.getSnapshot().spawnedZombies, 0);
});
