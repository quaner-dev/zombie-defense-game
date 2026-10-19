import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { MapModel } from '../../src/core/MapModel.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { CivilianStore } from '../../src/core/CivilianStore.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { SpawnSystem } from '../../src/core/SpawnSystem.js';
import { ResultSystem } from '../../src/core/ResultSystem.js';
import { BattleSession } from '../../src/adapter/BattleSession.js';
import { getScene } from '../../src/scenes/index.js';
import type { BattleEvent } from '../../src/core/types.js';

const level = 'LV03_villa_rescue';

test('villa starts with six stationary civilians and the correct seven-person protection ring', () => {
  const session = new BattleSession(); session.startScene('villa-rescue');
  assert.equal(session.deploymentRemaining, 0);
  assert.equal(session.initialHumans, 7);
  assert.equal(session.snapshot.aliveHumans, 7);
  const civilians = session.battle.getCivilians();
  assert.equal(civilians.length, 6);
  const soldiers = session.battle.getUnits().filter(u => u.faction === 'human');
  for (const [type, count] of [['rifleman', 4], ['flamethrower', 2], ['shield', 1]] as const) {
    assert.equal(soldiers.filter(u => u.unitType === type).length, count);
  }
  assert.deepEqual(soldiers.filter(u => u.unitType === 'flamethrower').map(u => u.position), [{x:405,y:1170},{x:675,y:1170}]);
  assert.equal(session.moveGroup(civilians.map(c => c.id), 600, 1300), false);
  const copy = session.battle.getCivilians(); copy[0].position.x = -1;
  session.tick(.5);
  assert.deepEqual(session.battle.getCivilians(), civilians);
  assert.equal(session.waveCount, 0);
  assert.equal(session.snapshot.generationComplete, false, 'an empty legacy wave list cannot complete continuous generation');
});

test('compact perimeter is closed at every corner, with four windows and a southeast door', () => {
  const map = MapModel.load(level);
  assert.deepEqual(map.interior_bounds, {left:244,top:784,right:836,bottom:1576});
  const entrances = map.getEntranceStates();
  assert.equal(entrances.filter(e => e.kind === 'window').length, 4);
  assert.equal(entrances.filter(e => e.kind === 'door').length, 1);
  for (const [start,end] of [
    [{x:200,y:740},{x:260,y:800}], [{x:880,y:740},{x:820,y:800}],
    [{x:200,y:1620},{x:260,y:1560}], [{x:880,y:1620},{x:820,y:1560}],
  ]) assert.ok(map.firstBlockingTerrain(start,end,16), 'corners remain solid');
  assert.ok(map.firstBlockingTerrain({x:540,y:740},{x:540,y:800},16));
  map.damageDoor('villa-window-north', 180);
  assert.equal(map.firstBlockingTerrain({x:540,y:740},{x:540,y:800},16), null);
  assert.ok(map.firstBlockingTerrain({x:400,y:740},{x:400,y:800},16), 'the adjacent wall remains');
});

for (const [side,position,entranceId,kind] of [
  ['north',{x:540,y:204},'villa-window-north','window'],
  ['east',{x:996,y:1170},'villa-window-east','window'],
  ['south',{x:730,y:2136},'villa-door-southeast','door'],
  ['west',{x:84,y:1170},'villa-window-west','window'],
] as const) {
  test(`${side} zombie breaks ${kind}, enters, then attacks a civilian without wall clipping`, () => {
    const map = MapModel.load(level), units = new UnitStore(), civilians = new CivilianStore();
    const civilian = civilians.spawn({x:540,y:1170});
    const zombie = units.spawn('normal_zombie', position, 'villa', side);
    const combat = new CombatSystem(units,map,undefined,civilians);
    const events: BattleEvent[] = [];
    for (let i=1;i<=1200&&civilian.state==='idle';i++) {
      const before = {...zombie.position};
      events.push(...combat.update(.05,i/20));
      assert.equal(map.firstBlockingTerrain(before,zombie.position,zombie.radius_px),null,'movement never crosses a solid segment');
      if (!map.getEntranceStates().find(e=>e.id===entranceId)!.destroyed) {
        assert.equal(civilian.state,'idle','closed entrance protects the civilian');
      }
    }
    const broken = events.findIndex(e=>e.type===`${kind}_destroyed`);
    const hit = events.findIndex(e=>e.type==='civilian_hit');
    assert.ok(broken>=0 && hit>broken);
    assert.equal(civilian.state,'transforming');
    assert.ok(zombie.position.x>244 && zombie.position.x<836 && zombie.position.y>784 && zombie.position.y<1576);
    const start = events[hit].time_s;
    assert.deepEqual(civilians.update(.75,start+.75,p=>units.spawn('normal_zombie',p,'villa').id),[]);
    const transformed = civilians.update(.05,start+.8,p=>units.spawn('normal_zombie',p,'villa').id);
    assert.equal(transformed.length,1);
    assert.equal(units.all().length,2);
    const result = new ResultSystem(units);
    assert.equal(result.update(false,start+.8,{scenarioKind:'villa_rescue',civilians})[0].type,'lose');
    assert.deepEqual(civilians.hit(civilian.id,zombie.id,10,start+.9),[]);
    assert.deepEqual(civilians.update(1,start+2,p=>units.spawn('normal_zombie',p,'villa').id),[]);
  });
}

test('all 240 admissions reuse bounded edge slots and never spawn within the villa', () => {
  const map=MapModel.load(level), units=new UnitStore(), spawn=new SpawnSystem(units,map);
  const definition=getScene('villa-rescue').level.continuousSpawn!;
  spawn.configureContinuous(definition);
  const events=spawn.update(1000);
  assert.equal(units.all().length,240);
  assert.equal(events.filter(e=>e.type==='generation_complete').length,1);
  assert.ok(events.every(e=>e.type!=='wave_spawn' && e.type!=='zombie_batch_spawn'));
  for(const unit of units.all()) {
    const area=map.getSpawnPoint(unit.spawnPointId!)!.spawnArea!;
    assert.ok(unit.position.x>=area.left&&unit.position.x<=area.right&&unit.position.y>=area.top&&unit.position.y<=area.bottom);
    assert.equal(map.terrain.some(t=>map.terrainContains(unit.position,t,unit.radius_px)),false);
  }
  for(const side of ['north','east','south','west'])assert.equal(units.all().filter(u=>u.spawnPointId===side).length,60);
  assert.deepEqual(spawn.update(2000),[]);
});

test('full default battle clears continuous generation and restart restores every entrance and civilian', () => {
  const battle=new BattleTestHarness();battle.start(level,1);
  for(let i=0;i<5000 && battle.getSnapshot().result==='running';i++)battle.advance(.05);
  const snapshot=battle.getSnapshot();
  assert.equal(snapshot.result,'win');assert.equal(snapshot.spawnedZombies,240);
  assert.equal(snapshot.civiliansRemaining,6);
  assert.ok(battle.getEvents().some(e=>e.type==='window_destroyed'));
  assert.equal(battle.getEvents().filter(e=>e.type==='generation_complete').length,1);
  battle.start(level,1);
  assert.ok(battle.getMapModel().getEntranceStates().every(e=>e.hp===e.maxHp&&!e.destroyed));
  assert.ok(battle.getCivilians().every(c=>c.state==='idle'));
  assert.equal(battle.getSnapshot().result,'running');
});

test('a civilian transformation cannot be cancelled by clearing the last zombie', () => {
  const units=new UnitStore(), civilians=new CivilianStore();
  for(let i=0;i<6;i++)civilians.spawn({x:540,y:1170});
  civilians.hit('civilian-1','zombie',10,0);
  const results=new ResultSystem(units);
  assert.deepEqual(results.update(true,.5,{scenarioKind:'villa_rescue',civilians}),[]);
  civilians.update(.8,.8,p=>units.spawn('normal_zombie',p,'villa').id);
  for(const u of units.all())units.kill(u.id);
  assert.equal(results.update(true,.8,{scenarioKind:'villa_rescue',civilians})[0].type,'lose');
});
