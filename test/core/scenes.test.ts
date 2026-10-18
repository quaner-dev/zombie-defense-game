import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, getScene } from '../../src/scenes/index.js';
import { MapModel } from '../../src/core/MapModel.js';
import { WaveManager } from '../../src/core/WaveManager.js';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { BattleSession } from '../../src/adapter/BattleSession.js';

test('both scene modules resolve their geometry and exactly three complete waves', () => {
  assert.deepEqual(SCENES.map(scene => scene.id), ['cabin', 'courtyard']);
  for (const scene of SCENES) {
    const map = MapModel.load(scene.mapId), waves = WaveManager.load(scene.levelId);
    assert.equal(waves.getWaveCount(), 3);
    waves.validateMap(map);
    assert.deepEqual(map.terrain, scene.map.terrain);
    assert.deepEqual(waves.update(100).map(event => event.time_s), scene.level.waves.map(wave => wave.battleTime_s));
    assert.equal(waves.allWavesSpawned(), true);
    assert.deepEqual(waves.update(100), []);
    const battle = new BattleTestHarness();battle.start(scene.levelId, 1);
    assert.deepEqual(battle.getMapModel().terrain, map.terrain);
    for (const unit of battle.getUnits()) {
      assert.ok(map.terrain.every(wall => !map.terrainContains(unit.position, wall, unit.radius_px)), `${scene.id}: initial unit outside walls`);
    }
    for (const wave of scene.level.waves) for (const spawn of wave.spawns) {
      for (const position of map.spawnPositions(spawn.route, spawn.count, spawn.spawnPoint)) {
        assert.ok(map.terrain.every(wall => !map.terrainContains(position, wall, 8)), `${scene.id}: spawn outside walls`);
      }
    }
  }
  assert.throws(() => getScene('missing'), /Unknown scene/);
});

test('large rectangular building walls block movement and sight while routes remain reachable', () => {
  const map = MapModel.load(getScene('courtyard').mapId);
  const original = MapModel.load().terrain.find(wall => wall.id === 'west-barricade')!.bounds;
  for (const wall of map.terrain) {
    const b = wall.bounds;
    assert.ok(b.right-b.left > original.right-original.left);
    assert.ok(b.bottom-b.top > original.bottom-original.top);
    assert.notEqual(b.right-b.left, b.bottom-b.top);
  }
  const start = {x:120, y:800}, target = {x:540, y:800};
  assert.equal(map.firstBlockingTerrain(start, target)?.terrain.id, 'northwest-building');
  assert.equal(map.firstBlockingTerrain(start, target, 8)?.terrain.id, 'northwest-building');
  const waypoint = map.nextWaypoint(start, target, 8);
  assert.ok(waypoint, 'a visible corner provides a route around the building');
  assert.equal(map.firstBlockingTerrain(start, waypoint, 8), null);
  assert.equal(map.firstBlockingTerrain({x:540,y:300}, {x:540,y:2040}, 8), null, 'central street remains open');
  assert.equal(map.firstBlockingTerrain({x:80,y:1280}, {x:1000,y:1280}, 8), null, 'cross street remains open');
});

test('entry screens freeze time and reject commands; practice replays the chosen scene', () => {
  const session = new BattleSession();
  assert.equal(session.screen, 'menu');session.tick(30);
  assert.equal(session.deploymentRemaining, 3);
  assert.equal(session.snapshot.spawnedZombies, 0);
  assert.equal(session.move(540,1280,600,1300), false);
  session.showSceneSelection();session.tick(10);
  assert.equal(session.screen, 'scenes');assert.equal(session.deploymentRemaining, 3);
  assert.throws(() => session.startScene('missing'), /Unknown scene/);
  session.startScene('courtyard');
  assert.equal(session.screen, 'battle');assert.equal(session.mode, 'practice');
  assert.equal(session.activeScene.id, 'courtyard');assert.equal(session.waveCount, 3);
  assert.equal(session.map.terrain[0].id, 'northwest-building');
  session.tick(3);assert.equal(session.snapshot.waveIndex, 1);
  assert.ok(session.events.some(event => event.type === 'wave_spawn'));
  session.paused = true;session.restart();
  assert.equal(session.activeScene.id, 'courtyard');assert.equal(session.paused, false);
  assert.equal(session.snapshot.time_s, 0);assert.equal(session.deploymentRemaining, 3);
  assert.deepEqual(session.events, []);assert.equal(session.snapshot.spawnedZombies, 0);
  session.returnToMenu();const before = session.snapshot;session.paused = false;session.tick(100);
  assert.deepEqual(session.snapshot, before);assert.equal(session.moveGroup(['missing'],1,1), false);
});

test('story startup reports malformed deployment geometry clearly', () => {
  const scene = SCENES[0];
  const malformed = structuredClone(scene.map);
  delete (malformed.routes[1] as { defend?: unknown }).defend;
  MapModel.register('test-malformed-map', malformed);
  const harness = new BattleTestHarness(undefined, levelId => {
    assert.equal(levelId, scene.levelId);
    return new WaveManager({ mapId: 'test-malformed-map', waves: [] });
  });
  assert.throws(() => harness.start(scene.levelId, 1), /missing a valid defend point|missing deployment route/);
});

test('startup identifies the level and map when no deployment routes exist', () => {
  const mapId = 'test-no-deployment-routes';
  const malformed = structuredClone(SCENES[0].map);
  malformed.routes = [];
  MapModel.register(mapId, malformed);
  const harness = new BattleTestHarness(undefined, () => new WaveManager({ mapId, waves: [] }));
  assert.throws(() => harness.start('test-level', 1),
    /Level test-level map test-no-deployment-routes must define at least one route/);
});

// Real result resolution and session progression, with short, empty waves so
// this regression tests chapter lifecycle independently of balance tuning.
function shortBattle(initialHumans = 3) {
  return new BattleTestHarness({deploymentDuration_s:3, initialHumans}, levelId => {
    const scene = SCENES.find(scene => scene.levelId === levelId)!;
    return new WaveManager({mapId:scene.mapId, waves:[0,.05,.1].map(battleTime_s => ({battleTime_s,spawns:[]}))});
  });
}

test('story advances only after victory, resets the new battle, and stops at the last scene', () => {
  const session = new BattleSession(shortBattle());session.startStory();
  assert.equal(session.activeScene.id, 'cabin');assert.equal(session.advanceScene(), false);
  session.tick(3.05);assert.equal(session.snapshot.result, 'running');
  session.tick(.05);assert.equal(session.snapshot.result, 'win');assert.equal(session.canAdvance, true);
  session.paused = true;assert.equal(session.advanceScene(), true);
  assert.equal(session.activeScene.id, 'courtyard');assert.equal(session.mode, 'story');
  assert.equal(session.deploymentRemaining, 3);assert.equal(session.paused, false);
  assert.equal(session.snapshot.waveIndex, 0);assert.equal(session.snapshot.result, 'running');assert.deepEqual(session.events, []);
  session.tick(3.1);session.tick(.05);assert.equal(session.snapshot.result, 'win');
  assert.equal(session.nextScene, undefined);assert.equal(session.canAdvance, false);assert.equal(session.advanceScene(), false);
  session.restart();assert.equal(session.activeScene.id, 'courtyard');
  session.startStory();assert.equal(session.activeScene.id, 'cabin');
});

test('defeat and practice victory cannot advance story chapters', () => {
  const loss = new BattleSession(shortBattle(0));loss.startStory();loss.tick(3.05);
  assert.equal(loss.snapshot.result, 'lose');assert.equal(loss.advanceScene(), false);
  assert.equal(loss.activeScene.id, 'cabin');
  const practice = new BattleSession(shortBattle());practice.startScene('cabin');practice.tick(3.1);
  assert.equal(practice.snapshot.result, 'win');assert.equal(practice.nextScene, undefined);
  assert.equal(practice.canAdvance, false);assert.equal(practice.advanceScene(), false);
});
