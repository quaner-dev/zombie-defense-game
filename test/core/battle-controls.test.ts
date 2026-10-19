import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { BattleSession } from '../../src/adapter/BattleSession.js';
import { defaultRoster, rosterTypes } from '../../src/core/Roster.js';
import { SCENES } from '../../src/scenes/index.js';
import { MapModel } from '../../src/core/MapModel.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { SquadSystem } from '../../src/core/SquadSystem.js';
import { CommandSystem } from '../../src/core/CommandSystem.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { MovementSystem } from '../../src/core/MovementSystem.js';
import { SpawnSystem } from '../../src/core/SpawnSystem.js';
import { WaveManager } from '../../src/core/WaveManager.js';
import { HUMAN_UNIT_TYPES } from '../../src/core/units/index.js';

for (const scene of SCENES) for (const count of [1,7,9,15]) {
  for (const type of count===15?HUMAN_UNIT_TYPES:['engineer'] as const) {
  test(`${scene.id}: exact roster ${count} ${type}, safe positions and preview agree`,()=>{
    const session=new BattleSession();session.startScene(scene.id);
    session.roster={rifleman:0,flamethrower:0,shield:0,sniper:0,engineer:0,[type]:count};
    const preview=session.rosterPreview();assert.equal(session.confirmRoster(),true);
    const humans=session.battle.getUnits().filter(u=>u.faction==='human');
    assert.equal(humans.length,count);assert.equal(session.initialHumans,count);
    assert.equal(session.snapshot.aliveHumans,count);assert.equal(session.snapshot.stats.byUnitType[type].spawned,count);
    humans.forEach((u,i)=>{
      assert.equal(u.unitType,type);assert.deepEqual(u.position,preview[i].position);
      assert.deepEqual(session.map.walkablePoint(u.position,u.radius_px),u.position);
      for(const v of humans.slice(i+1))assert.ok(Math.hypot(u.position.x-v.position.x,u.position.y-v.position.y)>=u.radius_px+v.radius_px);
      for(const c of session.battle.getCivilians())assert.ok(Math.hypot(u.position.x-c.position.x,u.position.y-c.position.y)>=55);
    });
    assert.equal(session.deploymentRemaining,scene.scenarioKind==='villa_rescue'?0:3);
  });
  }
}
test('invalid rosters are rejected before replacing a running battle',()=>{
  const roster=defaultRoster(SCENES[0]),battle=new BattleTestHarness();battle.start(SCENES[0].levelId,1,roster);
  for(const value of [0,16,-1,1.5,NaN,Infinity]){
    assert.throws(()=>battle.start(SCENES[0].levelId,1,{rifleman:value,flamethrower:0,shield:0,sniper:0,engineer:0}));
    assert.equal(battle.getInitialHumans(),9);
  }
  assert.throws(()=>rosterTypes({...roster,alien:1} as any));
});
test('selection freezes the battle and remembers exact counts separately per scene',()=>{
  const s=new BattleSession();s.startStory();s.tick(99);assert.equal(s.screen,'roster');assert.equal(s.snapshot.time_s,0);
  assert.equal(s.moveGroup(['unknown'],500,500),false);s.changeRoster('rifleman',6);assert.equal(s.rosterTotal,15);
  assert.equal(s.changeRoster('shield',1),false);assert.equal(s.confirmRoster(),true);s.tick(4);
  s.restart();const time=s.snapshot.time_s;s.tick(9);assert.equal(s.snapshot.time_s,time);assert.equal(s.rosterTotal,15);
  s.startScene('villa-rescue');assert.equal(s.rosterTotal,7);s.confirmRoster();
  s.startStory();assert.equal(s.rosterTotal,15);
});
function squadFixture(terrain:any[]=[]){
  const scene=SCENES[0],map=new MapModel({...structuredClone(scene.map),terrain} as any),store=new UnitStore();
  const squads=new SquadSystem(store,map),commands=new CommandSystem(store,map,()=>{},squads);
  return {map,store,squads,commands,movement:new MovementSystem(store,map,squads),combat:new CombatSystem(store,map)};
}
test('squads use connected proximity, hysteresis and blocking entrances',()=>{
  const f=squadFixture([{id:'door',kind:'door',maxHp:10,blocksMovement:true,bounds:{left:450,right:460,top:300,bottom:700}}]);
  const a=f.store.spawn('rifleman',{x:200,y:500},'A'),b=f.store.spawn('rifleman',{x:310,y:500},'A');
  const c=f.store.spawn('rifleman',{x:420,y:500},'A'),d=f.store.spawn('rifleman',{x:480,y:500},'A');
  assert.deepEqual(f.squads.members(a.id,0),[a.id,b.id,c.id]);assert.deepEqual(f.squads.members(d.id,0),[d.id]);
  b.position.x=340;assert.equal(f.squads.members(a.id,.2).length,3);
  a.position.x=170;assert.deepEqual(f.squads.members(a.id,.4),[a.id]);
  f.map.damageDoor('door',10);assert.equal(f.squads.members(b.id,.6).length,3);
});
test('a squad waits for transitions, preserves offsets, moves at slowest speed, and permits single detachment',()=>{
  const f=squadFixture(),a=f.store.spawn('rifleman',{x:300,y:500},'A'),b=f.store.spawn('shield',{x:350,y:500},'A');
  const flame=f.store.spawn('flamethrower',{x:400,y:500},'A'),engineer=f.store.spawn('engineer',{x:450,y:500},'A');
  flame.state='Firing';flame.flameLength_px=220;engineer.state='Deployed';
  const units=[a,b,flame,engineer],starts=units.map(u=>({...u.position}));
  f.commands.issueMoveGroup(units.map(u=>u.id),600,600,0);
  assert.equal(a.moveTarget!.x-b.moveTarget!.x,-50);
  for(let tick=1;tick<=29;tick++){f.combat.update(.05,tick*.05);f.movement.update(.05,tick*.05);}
  units.forEach((u,i)=>assert.deepEqual(u.position,starts[i]));
  f.combat.update(.05,1.5);f.movement.update(.05,1.5);
  units.forEach((u,i)=>assert.ok(Math.abs(Math.hypot(u.position.x-starts[i].x,u.position.y-starts[i].y)-2)<1e-8));
  const oldTarget={...b.moveTarget!};f.commands.issueMoveGroup([a.id],300,800,1.5);
  assert.deepEqual(b.moveTarget,oldTarget);assert.deepEqual(f.squads.members(a.id,1.5),[a.id]);
  f.store.kill(engineer.id);f.combat.update(.05,1.55);f.movement.update(.05,1.55);
  assert.ok(b.velocity.x>0);
});
for(const scene of SCENES)test(`${scene.id}: configured shared admission budget, no catch-up burst, exact total`,()=>{
  const map=MapModel.load(scene.mapId),store=new UnitStore(),spawn=new SpawnSystem(store,map),waves=WaveManager.load(scene.levelId);
  spawn.configureLimits(waves.getSpawnLimits());if(waves.getContinuousSpawn())spawn.configureContinuous(waves.getContinuousSpawn()!);
  const admit=(time:number)=>{
    if(!spawn.isContinuous())for(const e of waves.update(time))spawn.enqueue(e.data as any);
    const before=spawn.spawnedCount,events=spawn.update(time);
    assert.ok(spawn.spawnedCount-before<=scene.level.spawnLimits!.maxBatchSize);
    return events;
  };
  const first=admit(0);assert.ok(first.length>0);
  const count=spawn.spawnedCount;admit(0);assert.equal(spawn.spawnedCount,count);
  admit(30);assert.equal(spawn.spawnedCount,count+scene.level.spawnLimits!.maxBatchSize);
  admit(30);assert.equal(spawn.spawnedCount,count+scene.level.spawnLimits!.maxBatchSize);
  let last=30;
  for(let tick=601;tick<5000;tick++){
    const time=tick/20,before=spawn.spawnedCount;admit(time);
    if(before!==spawn.spawnedCount){assert.ok(time-last+1e-9>=scene.level.spawnLimits!.minInterval_s);last=time;}
    if(spawn.isContinuous()?spawn.isGenerationComplete():waves.allWavesSpawned()&&!spawn.hasPending())break;
  }
  assert.equal(spawn.spawnedCount,scene.level.continuousSpawn?.totalTarget??700);
});

test('overlapping waves share one budget and retain every pending zombie',()=>{
  const map=MapModel.load(SCENES[0].mapId),spawn=new SpawnSystem(new UnitStore(),map);
  spawn.configureLimits({maxBatchSize:3,minInterval_s:.6});
  for(const waveIndex of [1,2])spawn.enqueue({waveIndex,battleTime_s:0,batchSize:10,batchInterval_s:.1,
    spawns:[{unitType:'normal_zombie',route:'B',spawnPoint:'corridor-north',count:7}]});
  const first=spawn.update(0);assert.equal((first[0].data as any).batchSize,3);
  assert.equal(spawn.update(.1).length,0);assert.equal(spawn.spawnedCount,3);
  const delayed=spawn.update(10);assert.equal(delayed.length,1);assert.equal(spawn.spawnedCount,6);
  assert.equal(spawn.update(10).length,0);
  for(const time of [10.6,11.2,11.8,12.4])spawn.update(time);
  assert.equal(spawn.spawnedCount,14);assert.equal(spawn.hasPending(),false);
});
test('capped continuous batches have consecutive indices including a partial final batch',()=>{
  const spawn=new SpawnSystem(new UnitStore(),MapModel.load(SCENES[0].mapId));
  spawn.configureLimits({maxBatchSize:2,minInterval_s:.2});
  spawn.configureContinuous({totalTarget:7,batchSize:5,interval_s:.2,spawnPoints:['corridor-north'],distribution:{'corridor-north':1}});
  const events=[0,.2,.4,.6].flatMap(time=>spawn.update(time));
  const batches=events.filter(e=>e.type==='zombie_batch_spawn').map(e=>e.data as any);
  assert.deepEqual(batches.map(b=>b.batchIndex),[0,1,2,3]);
  assert.deepEqual(batches.map(b=>b.batchSize),[2,2,2,1]);
  assert.equal(spawn.spawnedCount,7);assert.equal(spawn.isGenerationComplete(),true);
  assert.equal(events.filter(e=>e.type==='generation_complete').length,1);
});
