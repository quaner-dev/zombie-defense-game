import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { MapModel, type MapDefinition } from '../../src/core/MapModel.js';
import mapConfig from '../../config/map.json' with { type: 'json' };
import config from '../../config/units.json' with { type: 'json' };
import { mapToScreen } from '../../assets/scripts/adapter/contracts.js';

test('all five soldier bodies have distinct colors, including orange engineer', () => {
  const f = fixture(), store = new UnitStore();
  const colors = new Set<string>();
  for (const [type, expected] of [
    ['rifleman', '#63D68F'], ['flamethrower', '#F04438'], ['shield', '#B9D7E8'],
    ['sniper', '#55C5F4'], ['engineer', '#F59E0B'],
  ] as const) {
    const unit = store.spawn(type, { x: 300, y: 500 }, 'A');
    f.unitView.render([unit], null, 1);
    const body = f.unitView.g.calls.find((call: any) => call.kind === 'circle' && call.args[2] === unit.radius_px);
    assert.equal(body.fill.hex, expected); colors.add(body.fill.hex);
  }
  assert.equal(colors.size, 5);
});

test('flames are flickering fans anchored to the nozzle and clipped by terrain', () => {
  const f = fixture(true), pool = f.controller.projectiles, store = new UnitStore();
  const flame = store.spawn('flamethrower', { x: 300, y: 500 }, 'A');
  flame.state = 'Firing'; flame.flameLength_px = 220; flame.facing = { x: 1, y: 0 };
  pool.render([], 1, [flame]);
  const first = pool.g.calls;
  const origins = first.filter((call: any) => call.kind === 'moveTo');
  const tips = first.filter((call: any) => call.kind === 'lineTo');
  assert.equal(origins.length, 3); assert.equal(tips.length, 39);
  assert.ok(origins.every((call: any) => call.args[0] === 309.75 && call.args[1] === -500));
  assert.ok(Math.max(...tips.map((call: any) => call.args[0])) > 500, 'flame extends beyond old 110px range');
  assert.ok(!first.some((call: any) => call.kind === 'circle' || call.kind === 'stroke'), 'no flying shell or bullet trail');
  pool.render([], 1.05, [flame]);
  assert.notDeepEqual(pool.g.calls.filter((call: any) => call.kind === 'lineTo'), tips, 'flame silhouette flickers');
  assert.deepEqual(pool.g.calls.filter((call: any) => call.kind === 'moveTo'), origins, 'nozzle stays fixed');
  const map = new MapModel({ ...structuredClone(mapConfig), terrain: [{ id: 'wall', kind: 'wall', blocksMovement: true,
    bounds: { left: 400, right: 410, top: 400, bottom: 600 } }] } as unknown as MapDefinition);
  pool.render([], 1, [flame], map);
  assert.ok(pool.g.calls.filter((call: any) => call.kind === 'lineTo').every((call: any) => call.args[0] <= 400));
  flame.state = 'RetractingFlame'; flame.flameLength_px = 55;
  pool.render([], 1, [flame]);
  assert.ok(Math.max(...pool.g.calls.filter((call: any) => call.kind === 'lineTo').map((call: any) => call.args[0])) <= 355);
  for (const state of ['Moving', 'Cooling', 'Overheated', 'Dead'] as const) {
    flame.state = state; pool.render([], 1, [flame]); assert.equal(pool.g.calls.length, 0);
  }
  pool.clear(); pool.render([], 2); assert.equal(pool.g.calls.length, 0);
  f.controller.onDestroy();
});

test('swallowed zombies stay hidden until released back onto the battlefield', () => {
  const f = fixture(), store = new UnitStore();
  const zombie = store.spawn('normal_zombie', { x: 300, y: 500 }, 'A');
  zombie.state = 'StoredInGut';
  f.unitView.render([zombie], null, 1);
  assert.equal(f.unitView.g.calls.length, 0);
  zombie.state = 'Advancing';
  f.unitView.render([zombie], null, 1.05);
  assert.ok(f.unitView.g.calls.some((call: any) => call.kind === 'circle'));
});

test('external waiting bars progress through setup, dismantle, release and retraction', () => {
  const f = fixture(), store = new UnitStore();
  for (const [type, state, duration] of [
    ['engineer', 'Deploying', config.engineer.deploy_duration_s],
    ['engineer', 'Dismantling', config.engineer.dismantle_duration_s],
    ['flamethrower', 'ReleasingFlame', config.flamethrower.release_duration_s],
    ['flamethrower', 'RetractingFlame', config.flamethrower.retract_duration_s],
  ] as const) {
    const unit = store.spawn(type, { x: 300, y: 500 }, 'A'); unit.state = state;
    unit.stateElapsed_s = duration / 4; f.unitView.render([unit], null, 1);
    const early = f.unitView.g.calls.filter((call: any) => call.kind === 'rect').at(-1);
    unit.stateElapsed_s = duration * .75; f.unitView.render([unit], null, 1.1);
    const late = f.unitView.g.calls.filter((call: any) => call.kind === 'rect').at(-1);
    assert.ok(early.args[2] > 0); assert.equal(late.args[2], early.args[2] * 3);
    assert.ok(late.args[1] + late.args[3] < -unit.position.y - unit.radius_px, 'bar stays outside body');
    unit.state = 'Idle'; f.unitView.render([unit], null, 2);
    assert.ok(!f.unitView.g.calls.some((call: any) => call.kind === 'rect'));
  }
});

test('overheat waiting bars advance continuously into cooling for both weapons', () => {
  const f = fixture(), store = new UnitStore();
  for (const type of ['engineer', 'flamethrower'] as const) {
    const unit = store.spawn(type, { x: 300, y: 500 }, 'A');
    const cooling = 75 / 45, lock = type === 'engineer' ? 2.5 : 2;
    const widths: number[] = [];
    for (const remaining of [lock + cooling, cooling + .05, cooling - .05, .05]) {
      unit.weaponCooldown_s = remaining; unit.state = remaining > cooling ? 'Overheated' : 'Cooling';
      f.unitView.render([unit], null, 1);
      const fill = f.unitView.g.calls.filter((call: any) => call.kind === 'rect').at(-1);
      widths.push(fill.args[2]);
      assert.equal(fill.color.hex, remaining > cooling ? '#E06E88' : '#6ED4DB');
    }
    assert.equal(widths[0], 0);
    assert.ok(widths.every((width, index) => index === 0 || width > widths[index - 1]));
    unit.state = 'Moving'; unit.weaponCooldown_s = .5; f.unitView.render([unit], null, 2);
    assert.ok(f.unitView.g.calls.some((call: any) => call.kind === 'rect'), 'moving does not hide outstanding cooldown');
    unit.state = 'Dead'; unit.hp = 0; f.unitView.render([unit], null, 3);
    assert.ok(!f.unitView.g.calls.some((call: any) => call.kind === 'rect'));
  }
});

test('rifle and machine gun trajectories remain thick in flight and after impact', () => {
  const f = fixture(true), pool = f.controller.projectiles;
  for (const [kind, broad, tail] of [['bullet', 4.5, 6], ['machine_gun', 5, 7]] as const) {
    pool.clear();
    const spawn = { type: 'projectile_spawned', time_s: 1, data: { id: kind,
      origin: { x: 100, y: 200 }, destination: { x: 280, y: 200 }, projectileKind: kind, speed_px_per_s: 900 } };
    pool.render([spawn], 1.05);
    const widths = pool.g.calls.filter((call: any) => call.kind === 'stroke').map((call: any) => call.width);
    assert.deepEqual([...widths], [broad, tail]);
    pool.render([{ type: 'projectile_hit', time_s: 1.1, data: { projectileId: kind, position: { x: 190, y: 200 } } }], 1.1);
    assert.equal(pool.g.calls.find((call: any) => call.kind === 'stroke').width, tail);
  }
  f.controller.onDestroy();
});

test('sniper shots have cyan flight, lingering impact and visible rifle recoil', () => {
  const f = fixture(true), pool = f.controller.projectiles, store = new UnitStore();
  const sniper = store.spawn('sniper', { x: 100, y: 200 }, 'A');
  sniper.facing = { x: 1, y: 0 };
  const spawn = { type: 'projectile_spawned', time_s: 1, data: { id: 'sniper-shot', sourceId: sniper.id,
    origin: { x: 100, y: 200 }, destination: { x: 400, y: 200 }, projectileKind: 'sniper', speed_px_per_s: 1200 } };
  pool.render([spawn], 1.05);
  assert.ok(pool.g.calls.some((call: any) => call.kind === 'stroke' && call.color.hex === '#7BE7FF' && call.width === 4));
  assert.ok(pool.g.calls.filter((call: any) => call.kind === 'lineTo').every((call: any) => call.args[0] <= 160 + 1e-8));
  f.unitView.render([sniper], null, 1);
  const restingTip = f.unitView.g.calls.find((call: any) => call.kind === 'lineTo' && call.args[1] === -200).args[0];
  f.unitView.render([sniper], null, 1.05, [spawn]);
  const recoilTip = f.unitView.g.calls.find((call: any) => call.kind === 'lineTo' && call.args[1] === -200).args[0];
  assert.ok(recoilTip < restingTip);
  f.unitView.render([sniper], null, 1.3);
  assert.equal(f.unitView.g.calls.find((call: any) => call.kind === 'lineTo' && call.args[1] === -200).args[0], restingTip);
  pool.render([{ type: 'projectile_hit', time_s: 1.25, data: { projectileId: 'sniper-shot', position: { x: 400, y: 200 } } }], 1.4);
  assert.ok(pool.g.calls.some((call: any) => call.kind === 'stroke' && call.color.hex === '#7BE7FF'));
  assert.ok(pool.g.calls.some((call: any) => call.kind === 'circle' && call.args[0] === 400));
  pool.render([], 1.5);
  assert.equal(pool.g.calls.length, 0);
  f.controller.onDestroy();
});

test('engineer tripod unfolds and folds with progress, with a packed walking animation', () => {
  const f = fixture(), store = new UnitStore();
  const engineer = store.spawn('engineer', { x: 300, y: 500 }, 'A');
  engineer.facing = { x: 1, y: 0 };
  const tripodSpread = () => Math.max(...f.unitView.g.calls.filter((call: any) => call.kind === 'lineTo').slice(0, 6).map((call: any) => Math.abs(call.args[1] + 500)));
  engineer.state = 'Deploying'; engineer.stateElapsed_s = .5;
  f.unitView.render([engineer], null, 1);
  const folded = tripodSpread();
  engineer.stateElapsed_s = 1.5; f.unitView.render([engineer], null, 2);
  assert.ok(tripodSpread() > folded);
  const deployingFill = f.unitView.g.calls.filter((call: any) => call.kind === 'rect').at(-1);
  assert.equal(deployingFill.args[2], 48); assert.equal(deployingFill.color.hex, '#F59E0B');
  engineer.state = 'Dismantling'; engineer.stateElapsed_s = .375; f.unitView.render([engineer], null, 3);
  const extended = tripodSpread();
  engineer.stateElapsed_s = 1.125; f.unitView.render([engineer], null, 4);
  assert.ok(tripodSpread() < extended);
  assert.equal(f.unitView.g.calls.filter((call: any) => call.kind === 'rect').at(-1).color.hex, '#6ED4DB');
  engineer.state = 'Moving'; engineer.velocity = { x: 42, y: 0 }; engineer.moveTarget = { x: 400, y: 500 };
  f.unitView.render([engineer], null, 5);
  assert.ok(!f.unitView.g.calls.some((call: any) => call.kind === 'stroke' && call.color.hex === '#B7C2C6'));
  const feet = f.unitView.g.calls.filter((call: any) => call.kind === 'circle' && call.args[2] === 4);
  f.unitView.render([engineer], null, 5.1);
  assert.notDeepEqual(f.unitView.g.calls.filter((call: any) => call.kind === 'circle' && call.args[2] === 4), feet);
});

test('the production controller shows automatic setup and touch-drag dismantling before moving', () => {
  const f = fixture(true), c = f.controller, s = c.session;
  for (let i = 0; i < 61; i++) c.update(.05);
  const current = () => s.battle.getUnits().find((unit: any) => unit.unitType === 'engineer');
  let engineer = current();
  assert.equal(engineer.state, 'Deploying');
  for (let i = 0; i < 20; i++) c.update(.05);
  assert.ok(c.units.g.calls.some((call: any) => call.kind === 'rect' && call.color.hex === '#F59E0B' && call.args[2] > 0));
  for (let i = 0; i < 20; i++) c.update(.05);
  engineer = current(); assert.equal(engineer.state, 'Deployed');
  const start = { ...engineer.position };
  const press = mapToScreen(engineer.position, c.frame), target = { x: start.x, y: start.y + 100 };
  const release = mapToScreen(target, c.frame);
  f.touch('start', 1, press.x, press.y); f.touch('move', 1, release.x, release.y); f.touch('end', 1, release.x, release.y);
  assert.equal(current().state, 'Dismantling');
  for (let i = 0; i < 20; i++) c.update(.05);
  assert.deepEqual({ ...current().position }, start);
  assert.ok(c.units.g.calls.some((call: any) => call.kind === 'rect' && call.color.hex === '#6ED4DB' && call.args[2] > 0));
  for (let i = 0; i < 10; i++) c.update(.05);
  assert.equal(current().state, 'Moving'); assert.ok(current().position.y > start.y);
  s.paused = true; const pausedPosition = { ...current().position }; c.update(.05);
  assert.deepEqual({ ...current().position }, pausedPosition);
  s.paused = false;
  for (let i = 0; i < 100 && current().state === 'Moving'; i++) c.update(.05);
  c.update(.05); assert.equal(current().state, 'Deploying');
  f.controller.onDestroy();
});

test('real sniper combat events drive rifle feedback, cyan bullets and impact effects', () => {
  const f = fixture(true), c = f.controller, s = c.session;
  s.battle.units.clear();
  const sniper = s.battle.units.spawn('sniper', { x: 500, y: 1370 }, 'B');
  const zombie = s.battle.units.spawn('normal_zombie', { x: 700, y: 1370 }, 'B');
  zombie.speed_px_per_s = 0; zombie.hp = zombie.maxHp = 1000;
  for (let i = 0; i < 100; i++) {
    c.update(.05);
    if (s.events.some((event: any) => event.type === 'projectile_spawned' && event.data.sourceId === sniper.id)) break;
  }
  assert.ok(s.events.some((event: any) => event.type === 'projectile_spawned' && event.data.projectileKind === 'sniper'));
  assert.ok(c.projectiles.g.calls.some((call: any) => call.kind === 'stroke' && call.color.hex === '#7BE7FF'));
  assert.ok(c.units.g.calls.some((call: any) => call.kind === 'circle' && call.fill.hex === '#B8F3FF'));
  for (let i = 0; i < 4; i++) c.update(.05);
  assert.equal(zombie.hp, 850);
  assert.ok(c.projectiles.g.calls.some((call: any) => call.kind === 'circle' && call.args[0] === 700 && call.args[1] === -1370));
  for (let i = 0; i < 5; i++) c.update(.05);
  assert.equal(c.projectiles.counts.active, 0); assert.equal(c.projectiles.counts.hits, 0);
  f.controller.onDestroy();
});
