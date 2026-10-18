import test from 'node:test';
import assert from 'node:assert/strict';
import { UnitStore } from '../../src/core/UnitStore.js';
import { MapModel, type TerrainDefinition } from '../../src/core/MapModel.js';
import { CombatSystem } from '../../src/core/CombatSystem.js';
import { ProjectileSystem } from '../../src/core/ProjectileSystem.js';

function setup(distance = 180, terrain?: TerrainDefinition[]) {
  const store = new UnitStore();
  const map = terrain ? new MapModel({
    battle_bounds: {left: 0, top: 0, right: 2000, bottom: 2400},
    defense_line_y: 2000, routes: [], spawnPoints: [], terrain,
  }) : MapModel.load();
  const combat = new CombatSystem(store, map);
  const projectiles = new ProjectileSystem(store, combat, map);
  const human = store.spawn('rifleman', { x: 540, y: 1370 }, 'B');
  const zombie = store.spawn('normal_zombie', { x: 540 + distance, y: 1370 }, 'B');
  return { store, combat, projectiles, human, zombie, map };
}

test('projectile flies at 900px/s to captured target point before authoritative damage', () => {
  const { projectiles, human, zombie } = setup();
  const event = projectiles.spawn(human, zombie, 0);
  assert.equal(event.type, 'projectile_spawned');
  zombie.position.y += 50;
  projectiles.update(0.1, 0.1);
  assert.deepEqual(projectiles.getProjectiles()[0].position, { x: 630, y: 1370 });
  assert.equal(zombie.hp, 60);
  const events = projectiles.update(0.1, 0.2);
  assert.equal(zombie.hp, 30);
  assert.equal(events.filter(e => e.type === 'projectile_hit').length, 1);
  assert.equal(events.filter(e => e.type === 'projectile_expired').length, 1);
  assert.deepEqual(projectiles.getProjectiles(), []);
  assert.deepEqual(projectiles.update(1, 1.2), []);
});

test('maximum flight time is 0.35s and resolves exactly once even short of target point', () => {
  const { projectiles, human, zombie } = setup(900);
  projectiles.spawn(human, zombie, 0);
  projectiles.update(0.349, 0.349);
  assert.equal(zombie.hp, 60);
  const events = projectiles.update(0.001, 0.35);
  assert.equal(zombie.hp, 30);
  assert.equal(events.filter(e => e.type === 'projectile_hit').length, 1);
  assert.equal(events.filter(e => e.type === 'projectile_expired').length, 1);
  assert.deepEqual(projectiles.update(10, 10.35), []);
});

for (const { distance, terminalX, terminalTime } of [
  { distance: 900, terminalX: 855, terminalTime: 2.35 },
  { distance: 180, terminalX: 720, terminalTime: 2.2 },
]) {
  test(`large updates stop flight at the earlier arrival/lifetime boundary for ${distance}px shots`, () => {
    const { projectiles, human, zombie } = setup(distance);
    projectiles.spawn(human, zombie, 2);
    projectiles.update(0.1, 2.1);
    const events = projectiles.update(0.9, 3);
    const hit = events.find(e => e.type === 'projectile_hit');
    assert.deepEqual((hit?.data as { position: { x: number; y: number } }).position,
      { x: terminalX, y: 1370 });
    assert.equal(hit?.time_s, terminalTime);
    assert.equal(events.filter(e => e.type === 'projectile_hit').length, 1);
    assert.equal(events.filter(e => e.type === 'projectile_expired').length, 1);
    assert.ok(events.every(e => e.time_s === terminalTime));
    assert.equal(zombie.hp, 30);
    assert.deepEqual(projectiles.getProjectiles(), []);
    assert.deepEqual(projectiles.update(1, 4), []);
  });
}

test('dead targets still produce visual arrival but no further authoritative damage', () => {
  const { store, projectiles, human, zombie } = setup();
  projectiles.spawn(human, zombie, 0);
  store.kill(zombie.id);
  const events = projectiles.update(0.2, 0.2);
  assert.equal(events.filter(e => e.type === 'projectile_hit').length, 1);
  assert.equal(events.filter(e => e.type === 'damage' || e.type === 'unit_died').length, 0);
  assert.equal(zombie.hp, 0);
});

test('stale projectile target ID cannot damage a pooled replacement', () => {
  const { store, projectiles, human, zombie } = setup();
  projectiles.spawn(human, zombie, 0);
  store.remove(zombie.id);
  const replacement = store.spawn('normal_zombie', { x: 720, y: 1370 }, 'B');
  assert.equal(projectiles.update(0.2, 0.2).filter(e => e.type === 'damage').length, 0);
  assert.equal(replacement.hp, 60);
});

test('combat shots are consumed once by projectile simulation', () => {
  const { combat, projectiles, zombie } = setup();
  for (let i = 0; i < 10; i++) combat.update(0.05, (i + 1) * 0.05);
  assert.equal(zombie.hp, 60);
  projectiles.update(0.05, 0.55);
  assert.equal(projectiles.getProjectiles().length, 1);
  projectiles.update(0.3, 0.85);
    assert.equal(zombie.hp, 30);
  assert.deepEqual(projectiles.update(1, 1.85), []);
});

test('a swept shot stops at the first thin wall, even during an oversized update', () => {
  const { projectiles, human, zombie } = setup(180, [
    {id:'far',kind:'wall',blocksMovement:true,bounds:{left:675,right:680,top:1360,bottom:1380}},
    {id:'near',kind:'wall',blocksMovement:true,bounds:{left:630,right:631,top:1360,bottom:1380}},
  ]);
  projectiles.spawn(human,zombie,2);
  assert.deepEqual(projectiles.update(.05,2.05),[]);
  const events=projectiles.update(.95,3);
  const blocked=events.find(e=>e.type==='projectile_blocked')!;
  assert.deepEqual(blocked.data,{projectileId:'projectile-1',wallId:'near',position:{x:630,y:1370}});
  assert.ok(Math.abs(blocked.time_s-2.1)<1e-9);
  assert.deepEqual(events.map(e=>e.type),['projectile_blocked','projectile_expired']);
  assert.equal(zombie.hp,60);
  assert.deepEqual(projectiles.getProjectiles(),[]);
  assert.deepEqual(projectiles.update(1,4),[]);
});

test('wall collision is checked during flight, rather than only at launch', () => {
  const { projectiles, human, zombie, map } = setup(180,[
    {id:'wall',kind:'wall',blocksMovement:false,bounds:{left:630,right:640,top:1360,bottom:1380}},
  ]);
  projectiles.spawn(human,zombie,0);
  projectiles.update(.05,.05);
  map.terrain[0].blocksMovement=true;
  const events=projectiles.update(.15,.2);
  assert.equal(events.filter(e=>e.type==='projectile_blocked').length,1);
  assert.equal(events.filter(e=>e.type==='damage').length,0);
  assert.equal(zombie.hp,60);
});

for(const {name,wall,target} of [
  {name:'launch-to-target',wall:{left:650,right:660,top:1390,bottom:1460},target:{x:720,y:1430}},
  {name:'arrival-to-target',wall:{left:680,right:690,top:1380,bottom:1400},target:{x:650,y:1430}},
]){
  test(`a target moving behind cover cannot take remote damage across the ${name} segment`,()=>{
    const {projectiles,human,zombie}=setup(180,[{id:'cover',kind:'wall',blocksMovement:true,bounds:wall}]);
    projectiles.spawn(human,zombie,0);
    projectiles.update(.1,.1);
    zombie.position={...target};
    const events=projectiles.update(.1,.2);
    assert.equal(zombie.hp,60);
    assert.equal(events.filter(e=>e.type==='damage').length,0);
    assert.deepEqual((events.find(e=>e.type==='projectile_hit')!.data as any).position,{x:720,y:1370});
  });
}

test('decorative nonblocking terrain permits flight and damage',()=>{
  const {projectiles,human,zombie}=setup(180,[
    {id:'ground',kind:'ground',blocksMovement:false,bounds:{left:630,right:640,top:1360,bottom:1380}},
  ]);
  projectiles.spawn(human,zombie,0);
  const events=projectiles.update(.2,.2);
  assert.equal(zombie.hp,30);
  assert.equal(events.filter(e=>e.type==='damage').length,1);
  assert.equal(events.filter(e=>e.type==='projectile_blocked').length,0);
});
