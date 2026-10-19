import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { CommandSystem, formationPositions } from '../../src/core/CommandSystem.js';
import { MovementSystem } from '../../src/core/MovementSystem.js';
import { MapModel } from '../../src/core/MapModel.js';

test('identity commands filter dead, missing, enemy and duplicate IDs and accept a living soldier', () => {
  const {store,commands}=setup();
  const a=store.spawn('rifleman',{x:300,y:400},'A');
  const b=store.spawn('rifleman',{x:320,y:400},'A');
  const dead=store.spawn('rifleman',{x:310,y:400},'A');store.kill(dead.id);
  const enemy=store.spawn('normal_zombie',{x:300,y:400},'A');
  const ids=[a.id,a.id,dead.id,'missing',enemy.id];
  assert.deepEqual(commands.issueMoveGroup(ids,600,800,1)?.data.unitIds,[a.id]);
  assert.equal(a.state,'Moving');
  assert.equal(commands.issueMoveGroup([a.id,b.id],NaN,800,1),null);
  const event=commands.issueMoveGroup([...ids,b.id],600,800,1)!;
  assert.deepEqual(event.data.unitIds,[a.id,b.id]);
  assert.equal(dead.state,'Dead');assert.equal(enemy.state,'Advancing');
  store.kill(b.id);assert.deepEqual(commands.issueMoveGroup([a.id,b.id],800,900,2)?.data.unitIds,[a.id]);
});

function setup() {
  const store = new UnitStore();
  const commands = new CommandSystem(store, MapModel.load());
  const movement = new MovementSystem(store);
  return { store, commands, movement };
}

test('radius selects only the nearest living human through 112px', () => {
  const { store, commands } = setup();
  const a = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  const b = store.spawn('rifleman', { x: 372, y: 400 }, 'A');
  const outside = store.spawn('rifleman', { x: 380, y: 480 }, 'A');
  const dead = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  store.kill(dead.id);
  const zombie = store.spawn('normal_zombie', { x: 300, y: 400 }, 'A');
  const event = commands.issueMoveAt(300, 400, 600, 800, 2)!;
  assert.equal(event.type, 'group_command');
  assert.equal(event.time_s, 2);
  assert.deepEqual(event.data.unitIds, [a.id]);
  assert.deepEqual(event.data.target, { x: 600, y: 800 });
  assert.deepEqual([a.state, b.state, outside.state, dead.state, zombie.state],
    ['Moving', 'Idle', 'Idle', 'Dead', 'Advancing']);
});

test('blank area produces no command while an isolated individual can be moved', () => {
  const { store, commands } = setup();
  const a = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  assert.equal(commands.issueMoveAt(800, 800, 600, 800, 0), null);
  assert.equal(commands.issueMoveAt(300, 400, 600, 800, 0)?.data.unitIds[0], a.id);
  assert.equal(a.state, 'Moving');
  assert.ok(a.moveTarget);
});

test('formation is deterministic, loosely scattered around its target, clamped and replaceable', () => {
  const { store, commands } = setup();
  const a = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  const b = store.spawn('rifleman', { x: 320, y: 400 }, 'A');
  a.targetId = b.id;
  commands.issueMoveGroup([a.id, b.id], 600, 800, 0);
  const destinations = [a.moveTarget!, b.moveTarget!];
  assert.notDeepEqual(destinations[0], destinations[1]);
  assert.ok(Math.abs(destinations.reduce((sum,p)=>sum+p.x,0)/2-600)<1e-9);
  assert.ok(Math.abs(destinations.reduce((sum,p)=>sum+p.y,0)/2-800)<1e-9);
  assert.equal(a.targetId, null);
  commands.issueMoveGroup([a.id, b.id], 600, 800, 1);
  assert.notDeepEqual(a.moveTarget, b.moveTarget);
  for (const [x, y] of [[-100, -100], [2000, 3000]]) {
    commands.issueMoveGroup([a.id, b.id], x, y, 2);
    for (const unit of [a, b]) {
      assert.ok(unit.moveTarget!.x >= 60 && unit.moveTarget!.x <= 1020);
      assert.ok(unit.moveTarget!.y >= 180 && unit.moveTarget!.y <= 2160);
    }
  }
  assert.notDeepEqual(a.moveTarget, b.moveTarget);
});

test('soldiers translate their original shape toward the finger', () => {
  const { store, commands, movement } = setup();
  const a = store.spawn('rifleman', { x: 100, y: 400 }, 'A');
  const b = store.spawn('rifleman', { x: 900, y: 400 }, 'C');
  commands.issueMoveGroup([a.id, b.id], 540, 800, 0);
  assert.equal(b.moveTarget!.x-a.moveTarget!.x,800);
  assert.equal((a.moveTarget!.x+b.moveTarget!.x)/2,540);
  movement.update(.5, .5);
  assert.ok(a.velocity.x > 0 && b.velocity.x > 0, 'soldiers retain parallel movement vectors');
  assert.ok(a.velocity.y > 0 && b.velocity.y > 0);
});

test('a finger landing on a wall assigns walkable personal destinations', () => {
  const store = new UnitStore(), map = MapModel.load(), commands = new CommandSystem(store, map);
  const soldiers = Array.from({ length: 8 }, (_, i) => store.spawn('rifleman', { x: 520 + i, y: 1300 }, 'B'));
  commands.issueMoveGroup(soldiers.map(soldier => soldier.id), 540, 1080, 0);
  for (const soldier of soldiers) {
    assert.ok(!map.terrain.some(wall => wall.blocksMovement && map.terrainContains(soldier.moveTarget!, wall, 7)));
  }
});

test('an initially deployed squad retains its spread', () => {
  const store = new UnitStore(), map = MapModel.load(), commands = new CommandSystem(store, map);
  const soldiers = formationPositions(17, { x: 540, y: 1370 }, map)
    .map(position => store.spawn('rifleman', position, 'B'));
  commands.issueMoveGroup(soldiers.map(soldier => soldier.id), 700, 1800, 0);
  const initialSpread = Math.max(...soldiers.map(soldier => Math.hypot(soldier.position.x - 540, soldier.position.y - 1370)));
  const finalSpread = Math.max(...soldiers.map(soldier => Math.hypot(soldier.moveTarget!.x - 700, soldier.moveTarget!.y - 1800)));
  assert.ok(Math.abs(finalSpread-initialSpread)<1e-8);
});

test('movement uses configured speed, clears combat targets, and stops at inclusive 12px tolerance', () => {
  const { store, movement } = setup();
  const a = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  a.state = 'Moving';
  a.moveTarget = { x: 360, y: 400 };
  movement.update(0.5, 0.5);
  assert.deepEqual(a.position, { x: 324, y: 400 });
  assert.equal(a.state, 'Moving');
  const events = movement.update(0.5, 1);
  assert.deepEqual(a.position, { x: 348, y: 400 });
  assert.equal(a.state, 'Idle');
  assert.equal(a.moveTarget, null);
  assert.equal(events[0].type, 'unit_state_changed');
  assert.deepEqual(a.velocity, { x: 0, y: 0 });
  movement.update(100, 101);
  assert.deepEqual(a.position, { x: 348, y: 400 });
});

test('already within tolerance stops without movement and large steps never overshoot', () => {
  const { store, movement } = setup();
  const a = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  a.state = 'Moving';
  a.moveTarget = { x: 312, y: 400 };
  movement.update(0, 0);
  assert.equal(a.state, 'Idle');
  assert.equal(a.position.x, 300);
  a.state = 'Moving';
  a.moveTarget = { x: 500, y: 400 };
  movement.update(10, 10);
  assert.equal(a.position.x, 500);
  assert.equal(a.state, 'Idle');
});

test('a soldier walks around a wall and resumes idle on the other side', () => {
  const store = new UnitStore(), map = MapModel.load(), movement = new MovementSystem(store, map);
  const human = store.spawn('rifleman', { x: 540, y: 1040 }, 'B');
  human.state = 'Moving';human.moveTarget = { x: 540, y: 1150 };
  const events = [];
  for (let i = 0; i < 200 && human.state === 'Moving'; i++) {
    const before = { ...human.position };
    events.push(...movement.update(.05, (i + 1) * .05));
    assert.equal(map.firstBlockingTerrain(before, human.position, 7), null, 'no movement segment crosses a wall');
  }
  assert.equal(human.state, 'Idle');
  assert.equal(human.moveTarget, null);
  assert.ok(Math.hypot(human.position.x - 540, human.position.y - 1150) <= 12);
  assert.equal(events[0].type, 'unit_state_changed');
});

test('harness publishes a Moving transition for the nearest selected unit and redirects it', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.endDeployment();
  const beforeCommand = harness.getUnits().filter(u => u.faction === 'human');
  const selected = beforeCommand[0];
  harness.issueMoveAt(selected.position.x, selected.position.y, 180, 1470);
  const transitions = harness.getEvents().filter(e => e.type === 'unit_state_changed');
  assert.equal(transitions.length, 1);
  assert.ok(transitions.every(e => (e.data as { to: string }).to === 'Moving'));
  harness.advance(0.1);
  const before = harness.getUnits().find(u => u.id === selected.id)!;
  harness.issueMoveGroup([selected.id], 370, 1470);
  harness.advance(0.1);
  const after = harness.getUnits().find(u => u.id === before.id)!;
  assert.ok(Math.hypot(after.position.x - 370, after.position.y - 1470) < Math.hypot(before.position.x - 370, before.position.y - 1470));
  assert.equal(after.state, 'Moving');
  assert.equal(harness.getEvents().filter(e => e.type === 'group_command').length, 2);
});

test('harness deploys its configured soldiers, moves one, preserves the snapshot, and resets on restart', () => {
  const harness = new BattleTestHarness();
  harness.issueMoveAt(540, 1370, 180, 1370);
  harness.start('LV01_zombie_wave', 1);
  const initialHumans = harness.getUnits().filter(u => u.faction === 'human');
  assert.equal(initialHumans.length, harness.getInitialHumans());
  const first = initialHumans[0];
  harness.issueMoveAt(first.position.x, first.position.y, 180, 1470);
  const command = harness.getEvents().filter(e => e.type === 'group_command');
  assert.equal(command.length, 1);
  const moving = harness.getUnits().filter(u => u.state === 'Moving');
  assert.equal(moving.length, 1);
  harness.advance(1);
  const movingAfterAdvance = harness.getUnits().find(u => u.id === moving[0].id);
  assert.ok(movingAfterAdvance && movingAfterAdvance.state === 'Moving' && movingAfterAdvance.position.x < first.position.x);
  assert.equal(harness.getSnapshot().time_s, 0);
  harness.advance(20);
  assert.ok(harness.getUnits().filter(u => u.faction === 'human').every(u => u.state !== 'Moving' && u.moveTarget === null));
  harness.start('LV01_zombie_wave', 1);
  assert.equal(harness.getUnits().filter(u => u.faction === 'human').length, harness.getInitialHumans());
  assert.deepEqual(harness.getEvents(), []);
  assert.ok(harness.getUnits().every(u => u.state === 'Idle' && u.moveTarget === null));
  const copy = harness.getUnits();
  copy[0].position.x = -999;
  assert.notEqual(harness.getUnits()[0].position.x, -999);
});
