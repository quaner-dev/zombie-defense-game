import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';
import { UnitStore } from '../../src/core/UnitStore.js';
import { MapModel, type MapDefinition } from '../../src/core/MapModel.js';
import mapConfig from '../../config/map.json' with { type: 'json' };
import config from '../../config/units.json' with { type: 'json' };

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
