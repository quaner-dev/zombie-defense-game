import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { CommandSystem } from '../../src/core/CommandSystem.js';
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

test('radius selects every living rifleman through 112px, not nearest or diagonal outsiders', () => {
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
  assert.deepEqual(event.data.unitIds, [a.id, b.id]);
  assert.deepEqual(event.data.target, { x: 600, y: 800 });
  assert.deepEqual([a.state, b.state, outside.state, dead.state, zombie.state],
    ['Moving', 'Moving', 'Idle', 'Dead', 'Advancing']);
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
  commands.issueMoveAt(300, 400, 600, 800, 0);
  const destinations = [a.moveTarget!, b.moveTarget!];
  assert.notDeepEqual(destinations[0], destinations[1]);
  assert.ok(Math.abs(destinations.reduce((sum,p)=>sum+p.x,0)/2-600)<1e-9);
  assert.ok(Math.abs(destinations.reduce((sum,p)=>sum+p.y,0)/2-800)<1e-9);
  assert.equal(a.targetId, null);
  commands.issueMoveAt(300, 400, 600, 800, 1);
  assert.notDeepEqual(a.moveTarget, b.moveTarget);
  for (const [x, y] of [[-100, -100], [2000, 3000]]) {
    commands.issueMoveAt(300, 400, x, y, 2);
    for (const unit of [a, b]) {
      assert.ok(unit.moveTarget!.x >= 60 && unit.moveTarget!.x <= 1020);
      assert.ok(unit.moveTarget!.y >= 180 && unit.moveTarget!.y <= 2160);
    }
  }
  assert.notDeepEqual(a.moveTarget, b.moveTarget);
});

test('movement uses configured speed, clears combat targets, and stops at inclusive 12px tolerance', () => {
  const { store, movement } = setup();
  const a = store.spawn('rifleman', { x: 300, y: 400 }, 'A');
  a.state = 'Moving';
  a.moveTarget = { x: 432, y: 400 };
  movement.update(0.5, 0.5);
  assert.deepEqual(a.position, { x: 360, y: 400 });
  assert.equal(a.state, 'Moving');
  const events = movement.update(0.5, 1);
  assert.deepEqual(a.position, { x: 420, y: 400 });
  assert.equal(a.state, 'Idle');
  assert.equal(a.moveTarget, null);
  assert.equal(events[0].type, 'unit_state_changed');
  assert.deepEqual(a.velocity, { x: 0, y: 0 });
  movement.update(100, 101);
  assert.deepEqual(a.position, { x: 420, y: 400 });
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

test('human movement stops at a configured wall instead of crossing it', () => {
  const store = new UnitStore(), map = MapModel.load(), movement = new MovementSystem(store, map);
  const human = store.spawn('rifleman', { x: 540, y: 1040 }, 'B');
  human.state = 'Moving';human.moveTarget = { x: 540, y: 1150 };
  const events = movement.update(1, 1);
  assert.equal(human.state, 'Idle');
  assert.equal(human.moveTarget, null);
  assert.ok(human.position.y < 1060);
  assert.equal(events[0].type, 'unit_state_changed');
});

test('harness publishes Moving transitions for each selected unit and replacement actually redirects movement', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.endDeployment();
  harness.issueMoveAt(540, 1370, 180, 1370);
  const transitions = harness.getEvents().filter(e => e.type === 'unit_state_changed');
  assert.equal(transitions.length, 17);
  assert.ok(transitions.every(e => (e.data as { to: string }).to === 'Moving'));
  harness.advance(0.1);
  const before = harness.getUnits().find(u => u.routeId === 'B')!;
  harness.issueMoveAt(530, 1370, 900, 1370);
  harness.advance(0.1);
  const after = harness.getUnits().find(u => u.id === before.id)!;
  assert.ok(after.position.x > before.position.x);
  assert.equal(after.state, 'Moving');
  assert.equal(harness.getEvents().filter(e => e.type === 'group_command').length, 2);
});

test('harness deploys 50 riflemen, moves a group, preserves public snapshot, and resets on restart', () => {
  const harness = new BattleTestHarness();
  harness.issueMoveAt(540, 1370, 180, 1370);
  harness.start('LV01_zombie_wave', 1);
  assert.equal(harness.getUnits().length, 50);
  harness.issueMoveAt(540, 1370, 180, 1370);
  const command = harness.getEvents().filter(e => e.type === 'group_command');
  assert.equal(command.length, 1);
  const moving = harness.getUnits().filter(u => u.state === 'Moving');
  assert.equal(moving.length, 17);
  harness.advance(1);
  assert.ok(harness.getUnits().some(u => u.state === 'Moving' && u.position.x < 500));
  assert.equal(harness.getSnapshot().time_s, 0);
  harness.advance(20);
  assert.ok(harness.getUnits().filter(u => u.faction === 'human').every(u => u.state !== 'Moving' && u.moveTarget === null));
  harness.start('LV01_zombie_wave', 1);
  assert.equal(harness.getUnits().length, 50);
  assert.deepEqual(harness.getEvents(), []);
  assert.ok(harness.getUnits().every(u => u.state === 'Idle' && u.moveTarget === null));
  const copy = harness.getUnits();
  copy[0].position.x = -999;
  assert.notEqual(harness.getUnits()[0].position.x, -999);
});
