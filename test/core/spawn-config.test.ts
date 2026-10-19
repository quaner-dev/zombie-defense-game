import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { MapModel } from '../../src/core/MapModel.js';
import { SpawnSystem, type ContinuousSpawnDefinition } from '../../src/core/SpawnSystem.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { WaveManager } from '../../src/core/WaveManager.js';
import { getScene } from '../../src/scenes/index.js';

test('a registered level controls its spawn timing and weighted custom entrances without map-specific code', () => {
  const mapId = 'test-configured-spawn-map', levelId = 'test-configured-spawn-level';
  const definition = structuredClone(getScene('courtyard').map);
  definition.spawnPoints = [
    { ...definition.spawnPoints.find(point => point.id === 'north')!, id: 'entry-top' },
    { ...definition.spawnPoints.find(point => point.id === 'east')!, id: 'entry-right' },
  ];
  MapModel.register(mapId, definition);
  WaveManager.register(levelId, { mapId, waves: [], continuousSpawn: {
    totalTarget: 8, interval_s: .25, batchSize: 2,
    spawnPoints: ['entry-top', 'entry-right'], distribution: { 'entry-top': 3, 'entry-right': 1 },
  } });
  const battle = new BattleTestHarness({ deploymentDuration_s: 0, initialHumans: 1 });
  battle.start(levelId, 1);
  battle.advance(0);
  const firstBatch = battle.getUnits().filter(unit => unit.faction === 'zombie');
  assert.equal(firstBatch.length, 2);
  assert.equal(battle.getWaveCount(), 0);
  battle.advance(.2);
  assert.equal(battle.getSnapshot().spawnedZombies, 2);
  battle.advance(.05);
  assert.equal(battle.getSnapshot().spawnedZombies, 4);
  battle.advance(.5);
  assert.equal(battle.getSnapshot().spawnedZombies, 8);
  assert.equal(battle.getSnapshot().generationComplete, true);
  const zombies = battle.getUnits().filter(unit => unit.faction === 'zombie');
  assert.equal(zombies.filter(unit => unit.spawnPointId === 'entry-top').length, 6);
  assert.equal(zombies.filter(unit => unit.spawnPointId === 'entry-right').length, 2);
  assert.deepEqual(battle.getEvents().filter(event => event.type === 'zombie_batch_spawn').map(event => event.time_s),
    [0, .25, .5, .75]);
  assert.ok(battle.getEvents().every(event => event.type !== 'wave_spawn'));
  battle.advance(1);
  assert.equal(battle.getSnapshot().spawnedZombies, 8);
  assert.equal(battle.getEvents().filter(event => event.type === 'generation_complete').length, 1);
  battle.start(levelId, 1);
  battle.advance(0);
  assert.deepEqual(battle.getUnits().filter(unit => unit.faction === 'zombie').map(unit => ({
    position: unit.position, spawnPointId: unit.spawnPointId, unitType: unit.unitType,
  })), firstBatch.map(unit => ({ position: unit.position, spawnPointId: unit.spawnPointId, unitType: unit.unitType })));
  assert.equal(battle.getSnapshot().generationComplete, false);
});

test('villa ramps up faster, reaches its configured minimum, and finishes within 80 seconds', () => {
  const definition = getScene('villa-rescue').level.continuousSpawn!;
  const spawn = new SpawnSystem(new UnitStore(), MapModel.load(getScene('villa-rescue').mapId));
  spawn.configureContinuous(definition);
  const oldSpawn = new SpawnSystem(new UnitStore(), MapModel.load(getScene('villa-rescue').mapId));
  oldSpawn.configureContinuous({ ...definition, interval_s: 1.2, minInterval_s: .45, rampDuration_s: 120 });
  const initial = spawn.update(0);
  assert.deepEqual(initial.map(event => event.time_s), [0]);
  assert.deepEqual(spawn.update(.599), []);
  assert.deepEqual(spawn.update(.6).map(event => event.time_s), [.6]);
  spawn.update(30);
  oldSpawn.update(30);
  assert.ok(spawn.spawnedCount >= oldSpawn.spawnedCount * 2);
  const later = spawn.update(80).filter(event => event.type === 'continuous_zombie_spawn');
  const atMinimum = later.filter(event => event.time_s >= 60);
  assert.ok(atMinimum.length > 2);
  for (let index = 1; index < atMinimum.length; index++) {
    assert.ok(Math.abs(atMinimum[index].time_s - atMinimum[index - 1].time_s - .2) < 1e-9);
  }
  assert.equal(spawn.spawnedCount, 240);
  assert.equal(spawn.isGenerationComplete(), true);
  oldSpawn.update(80);
  assert.equal(oldSpawn.isGenerationComplete(), false);
});

test('courtyard retains its fixed rate, directional weights and special zombie ratio', () => {
  const scene = getScene('courtyard'), units = new UnitStore();
  const spawn = new SpawnSystem(units, MapModel.load(scene.mapId));
  spawn.configureContinuous(scene.level.continuousSpawn!);
  spawn.update(0);
  assert.equal(spawn.spawnedCount, 10);
  spawn.update(.349);
  assert.equal(spawn.spawnedCount, 10);
  spawn.update(.35);
  assert.equal(spawn.spawnedCount, 20);
  spawn.update(30);
  assert.equal(spawn.spawnedCount, 720);
  assert.equal(units.all().filter(unit => unit.unitType === 'gut_zombie').length, 36);
  for (const [point, count] of [['north', 216], ['south', 216], ['east', 144], ['west', 144]] as const) {
    assert.equal(units.all().filter(unit => unit.spawnPointId === point).length, count);
  }
});

test('continuous spawn configuration rejects invalid rates, batches and entrances before scheduling', () => {
  const map = MapModel.load(getScene('courtyard').mapId);
  const base = getScene('courtyard').level.continuousSpawn!;
  const invalid: [Partial<ContinuousSpawnDefinition>, RegExp][] = [
    [{ totalTarget: -1 }, /target/],
    [{ totalTarget: 1.5 }, /target/],
    [{ batchSize: 0 }, /batch size/],
    [{ batchSize: 1.5 }, /batch size/],
    [{ interval_s: 0 }, /intervals/],
    [{ initialInterval_s: -1 }, /intervals/],
    [{ minInterval_s: NaN }, /intervals/],
    [{ rampDuration_s: Infinity }, /ramp duration/],
    [{ spawnPoints: [] }, /spawn points/],
    [{ spawnPoints: ['north', 'north'] }, /spawn points/],
    [{ spawnPoints: ['missing'] }, /spawn point: missing/],
    [{ distribution: { missing: 1 } }, /distribution/],
    [{ distribution: { north: -1 } }, /distribution/],
    [{ specialRatios: { gut_zombie: 1.1 } }, /ratio/],
  ];
  for (const [override, message] of invalid) {
    const spawn = new SpawnSystem(new UnitStore(), map);
    assert.throws(() => spawn.configureContinuous({ ...base, ...override }), message);
    assert.equal(spawn.isContinuous(), false);
    assert.equal(spawn.spawnedCount, 0);
  }
});
