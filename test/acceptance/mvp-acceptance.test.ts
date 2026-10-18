import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import type { MoveGroupCommand } from '../../src/core/types.js';

const level = 'LV01_zombie_wave';
function start() {
  const h = new BattleTestHarness();
  h.start(level, 1);
  h.advance(3);
  return h;
}

// Catches early, late, misrouted, type-changing or clear-gated wave scheduling.
for (const [id, time, count, routes] of [
  ['W1', 0.1, 10, { B: 10 }],
  ['W2', 6.99, 100, { B: 100 }],
  ['W3', 7, 110, { A: 8, B: 100, C: 2 }],
  ['W4', 19.99, 300, { A: 100, B: 100, C: 100 }],
  ['W5', 20, 310, { A: 106, B: 104, C: 100 }],
  ['W7', 20.1, 310, { A: 106, B: 104, C: 100 }],
] as const) {
  test(`${id}: exact cumulative counts at battle ${time}s`, () => {
    const h = start();
    h.advance(time);
    assert.equal(h.getSnapshot().spawnedZombies, count);
    const zombies = h.getUnits().filter(u => u.faction === 'zombie');
    assert.equal(zombies.length, count);
    assert.deepEqual(Object.fromEntries(Object.keys(routes).map(route =>
      [route, zombies.filter(u => u.routeId === route).length])), routes);
    assert.ok(zombies.every(u => u.unitType === 'normal_zombie' ||
      u.unitType === 'fat_zombie' || u.unitType === 'zombie_mother'));
  });
}

test('W6: surviving earlier waves never delay 7s and 20s spawns', () => {
  const h = start();
  h.advance(7);
  assert.ok(h.getUnits().some(u => u.routeId === 'B' && u.faction === 'zombie' && u.active));
  h.advance(13);
  assert.equal(h.getSnapshot().spawnedZombies, 310);
  assert.deepEqual(h.getEvents().filter(e => e.type === 'wave_spawn').map(e => e.time_s), [0, 7, 20]);
});

test('frame boundaries: off-grid calls cannot postpone a scheduled wave', () => {
  const h = start();
  h.advance(6.99);
  h.advance(0.1);
  assert.equal(h.getEvents().filter(e => e.type === 'wave_spawn')[1].time_s, 7);
  // Only completed 50ms ticks advance systems: total 7.09s publishes 7.05s.
  assert.equal(h.getSnapshot().time_s, 7.05);
  const exact = start();
  exact.advance(7.05);
  assert.deepEqual(h.getSnapshot(), exact.getSnapshot());
  assert.deepEqual(h.getUnits(), exact.getUnits(), 'off-grid calls preserve the same spawn slots and first movement step');
});

test('M1-M6/C8: single-soldier replacement, moving fire, arrival, empty selection and bounds', () => {
  const h = start();
  const soldier = h.getUnits().find(u => u.faction === 'human')!;
  h.issueMoveAt(soldier.position.x, soldier.position.y, 180, 1470);
  let commands = h.getEvents().filter(e => e.type === 'group_command');
  const ids = (commands[0].data as MoveGroupCommand).unitIds;
  assert.equal(ids.length, 1);
  h.issueMoveGroup(ids, 360, 1560);
  commands = h.getEvents().filter(e => e.type === 'group_command');
  assert.equal(commands.length, 2);
  assert.deepEqual((commands[1].data as MoveGroupCommand).target, { x: 360, y: 1560 });
  h.advance(1);
  assert.ok(h.getUnits().filter(u => ids.includes(u.id)).every(u => u.state === 'Moving' || u.state === 'Idle'));
  // Arrival clears movement targets while automatic fire continues during the walk.
  h.advance(30);
  assert.ok(h.getUnits().filter(u => ids.includes(u.id)).every(u => u.moveTarget === null));
  assert.ok(h.getEvents().some(e => e.type === 'projectile_spawned' && ids.includes((e.data as { sourceId: string }).sourceId)), 'soldier fires while moving or after arrival');
  h.issueMoveAt(60, 180, 0, 0);
  assert.equal(h.getEvents().filter(e => e.type === 'group_command').length, 2);
  const current = h.getUnits().find(u => u.id === soldier.id)!;
  h.issueMoveAt(current.position.x, current.position.y, 10000, 10000);
  h.advance(10);
  assert.ok(h.getUnits().filter(u => u.faction === 'human').every(u =>
    u.position.x >= 60 && u.position.x <= 1020 && u.position.y >= 180 && u.position.y <= 2160));
});

test('C1-C7/B1-B4/B6: full battle emits paired flight, valid damage, unique deaths/breaches and freezes', () => {
  const h = start();
  h.advance(120);
  const snapshot = h.getSnapshot();
  assert.notEqual(snapshot.result, 'running');
  const events = h.getEvents();
  const shots = events.filter(e => e.type === 'projectile_spawned');
  assert.ok(shots.length > 0);
  for (const shot of shots) {
    const id = (shot.data as { id: string }).id;
    assert.ok(events.some(e => e.type === 'projectile_expired' && (e.data as { projectileId: string }).projectileId === id));
    assert.ok(events.filter(e => e.type === 'projectile_hit' && (e.data as { projectileId: string }).projectileId === id).length <= 1);
  }
  const deaths = events.filter(e => e.type === 'unit_died').map(e => (e.data as { unitId: string }).unitId);
  assert.equal(new Set(deaths).size, deaths.length);
  const breaches = events.filter(e => e.type === 'route_breached');
  assert.equal(new Set(breaches.map(e => (e.data as { unitId: string }).unitId)).size, breaches.length);
  assert.ok(events.filter(e => e.type === 'damage').every(e =>
    [8, 10, 18, 20, 24, 30].includes((e.data as { amount: number }).amount)));
  if (snapshot.result === 'win') {
    assert.equal(snapshot.aliveZombies, 0);
    assert.equal(snapshot.spawnedZombies, 700);
    assert.ok(snapshot.aliveHumans > 0);
  } else assert.equal(snapshot.aliveHumans, 0);
  h.advance(120);
  assert.deepEqual(h.getSnapshot(), snapshot);
  assert.deepEqual(h.getEvents(), events);
});

let generatedReport: any;
let generatedStatus: number | null;
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;
function scenarioReport() {
  if (generatedReport) return generatedReport;
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'acceptance-'));
  try {
    const output = join(dir, 'report.json');
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-acceptance.mjs', '--output', output], { encoding: 'utf8', env: childEnv });
    assert.ok(run.status === 0 || run.status === 1, run.stderr);
    generatedReport = JSON.parse(readFileSync(output, 'utf8'));
    generatedStatus = run.status;
    return generatedReport;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('idle seeds 1..10 reach a consistent terminal result within the bounded simulation', () => {
  const idle = scenarioReport().idle;
  for (const entry of idle) {
    assert.deepEqual(entry.assertions_failed, [], `seed ${entry.seed}`);
    assert.ok(entry.result === 'win' || entry.result === 'lose');
    assert.ok(entry.zombie_alive_at_end >= 0);
    assert.ok(entry.game_time_s >= 30 && entry.game_time_s <= 120);
    if (entry.result === 'win') assert.equal(entry.zombie_alive_at_end, 0);
    else assert.equal(entry.human_alive_at_end, 0);
  }
  assert.ok(idle.every((entry: any) => entry.result === idle[0].result), 'fixed content has a stable idle outcome');
});

test('opening micro-control commands win with survivors', () => {
  const scripted = scenarioReport().scripted;
  assert.equal(scripted.result, 'win');
  assert.ok(scripted.human_alive_at_end > 0);
  assert.deepEqual(scripted.assertions_failed, []);
});
test('report CLI runs ten idle seeds and fixed commands, preserves deterministic fields, and fails truthfully', t => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'acceptance-'));
  try {
    const output = join(dir, 'report.json');
    const report = scenarioReport();
    t.diagnostic(JSON.stringify({ idle: report.idle.map((entry: any) => ({ seed: entry.seed,
      first_casualty_time_s: entry.first_casualty_time_s, game_time_s: entry.game_time_s,
      zombie_alive_at_end: entry.zombie_alive_at_end, assertions_failed: entry.assertions_failed })),
      scripted: { result: report.scripted.result, game_time_s: report.scripted.game_time_s,
        human_alive_at_end: report.scripted.human_alive_at_end, zombie_alive_at_end: report.scripted.zombie_alive_at_end,
        commands: report.scripted.commands, assertions_failed: report.scripted.assertions_failed } }));
    const failures = [...report.idle, report.scripted].flatMap(r => r.assertions_failed);
    assert.equal(generatedStatus, failures.length ? 1 : 0);
    assert.equal(report.idle.length, 10);
    assert.deepEqual(report.idle.map((r: { seed: number }) => r.seed), [1,2,3,4,5,6,7,8,9,10]);
    for (const entry of [...report.idle, report.scripted]) {
      assert.equal(entry.level_id, level);
      assert.deepEqual(entry.wave_spawn_times_s, [0, 7, 20]);
      assert.ok(Array.isArray(entry.assertions_failed));
      assert.ok(Number.isFinite(entry.game_time_s));
      assert.ok(entry.real_runtime_ms >= 0);
    }
    const deterministic = ({ seed, real_runtime_ms, ...fields }: any) => fields;
    for (const entry of report.idle) assert.deepEqual(deterministic(entry), deterministic(report.idle[0]));
    assert.equal(report.scripted.policy, 'micro-control');
    assert.deepEqual(report.scripted.commands.map((c: any) => c.time_s), [0,0,0]);
    assert.deepEqual(report.scripted.commands.map((c: any) => c.source_route), ['B','B','B']);
    assert.deepEqual(report.scripted.commands.map((c: any) => c.target),
      [{ x: 330, y: 1560 }, { x: 330, y: 1620 }, { x: 375, y: 1590 }]);
    const decision = start();
    const humans = decision.getUnits().filter(u => u.faction === 'human');
    const soldiers = [...humans.filter(u => u.unitType === 'flamethrower'), ...humans.filter(u => u.unitType === 'shield')];
    for (const [i, command] of report.scripted.commands.entries()) {
      const { x, y } = soldiers[i].position;
      const ids = [soldiers[i].id];
      assert.deepEqual([...command.unit_ids].sort(), ids);
      assert.deepEqual(command.intended_ids, ids);
      assert.equal(command.event_time_s, 0);
      assert.equal(command.issued_at_s, 0);
      assert.equal(command.selection_verified, true);
      assert.deepEqual(command.pressed_at, {x,y});
      decision.issueMoveAt(x,y,command.target.x,command.target.y);
      const event = decision.getEvents().filter(e => e.type === 'group_command').at(-1)!;
      assert.deepEqual([...(event.data as MoveGroupCommand).unitIds].sort(), ids);
    }
    decision.advance(120);
    assert.equal(decision.getSnapshot().result, 'win');
    assert.equal(report.scripted.config.normal_zombie.speed_px_per_s, 41.9);
    assert.equal(report.scripted.config.normal_zombie.attack_interval_s, 0.13);
    assert.equal(report.scripted.config.rifleman.attack_range_px, 260);
    assert.equal(report.scripted.config.rifleman.damagePerHit, 30);
    assert.equal(report.scripted.config.rifleman.diameter_px, 28);
    assert.equal(report.scripted.config.normal_zombie.diameter_px, 32);
    assert.deepEqual(report.scripted.config.spawn_layout, {columns:4,spacing_px:42});
    for (const entry of [...report.idle, report.scripted]) {
      const diagnostics = entry.combat_diagnostics;
      assert.ok(Object.values(diagnostics).every(n => Number.isInteger(n) && (n as number) >= 0));
      assert.ok(diagnostics.effective_rifle_hits + diagnostics.rifle_hits_without_damage <= diagnostics.rifle_shots);
    }
    assert.ok(report.scripted.commands.every((c: any) => c.unit_ids.length >= 1));
    const template = JSON.parse(readFileSync('docs/testing/mvp-test-report-template.json', 'utf8'));
    for (const entry of [...report.idle, report.scripted]) {
      for (const key of Object.keys(template)) assert.ok(key in entry, `missing report field ${key}`);
    }
    const rerun = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-acceptance.mjs', '--output', output], { encoding: 'utf8', env: childEnv });
    assert.equal(rerun.status, generatedStatus, rerun.stdout + rerun.stderr);
    const again = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(again.idle.map(deterministic), report.idle.map(deterministic));
    assert.deepEqual(deterministic(again.scripted), deterministic(report.scripted));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
