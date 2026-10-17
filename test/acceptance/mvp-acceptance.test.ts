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
  ['W1', 0.1, 50, { B: 50 }],
  ['W2', 6.99, 50, { B: 50 }],
  ['W3', 7, 150, { A: 50, B: 50, C: 50 }],
  ['W4', 19.99, 150, { A: 50, B: 50, C: 50 }],
  ['W5', 20, 350, { A: 110, B: 130, C: 110 }],
  ['W7', 20.1, 350, { A: 110, B: 130, C: 110 }],
] as const) {
  test(`${id}: exact cumulative counts at battle ${time}s`, () => {
    const h = start();
    h.advance(time);
    assert.equal(h.getSnapshot().spawnedZombies, count);
    const zombies = h.getUnits().filter(u => u.faction === 'zombie');
    assert.equal(zombies.length, count);
    assert.deepEqual(Object.fromEntries(Object.keys(routes).map(route =>
      [route, zombies.filter(u => u.routeId === route).length])), routes);
    assert.ok(zombies.every(u => u.unitType === 'normal_zombie'));
  });
}

test('W6: surviving earlier waves never delay 7s and 20s spawns', () => {
  const h = start();
  h.issueMoveAt(540, 1370, 540, 2160);
  h.advance(7);
  assert.ok(h.getUnits().some(u => u.routeId === 'B' && u.faction === 'zombie' && u.active));
  h.advance(13);
  assert.equal(h.getSnapshot().spawnedZombies, 350);
  assert.deepEqual(h.getEvents().filter(e => e.type === 'wave_spawn').map(e => e.time_s), [0, 7, 20]);
});

test('frame boundaries: off-grid calls cannot postpone a scheduled wave', () => {
  const h = start();
  h.advance(6.99);
  h.advance(0.1);
  assert.equal(h.getEvents().filter(e => e.type === 'wave_spawn')[1].time_s, 7);
  // Only completed 50ms ticks advance systems: total 7.09s publishes 7.05s.
  assert.equal(h.getSnapshot().time_s, 7.05);
  const left = h.getUnits().find(u => u.faction === 'zombie' && u.routeId === 'A')!;
  assert.ok(Math.abs(Math.hypot(left.position.x - 160, left.position.y - (-40)) - 41.9 * 0.05) < 1e-8, `late wave position ${left.position.y}`);
});

test('M1-M6/C8: group replacement, movement suppression, arrival, empty selection and bounds', () => {
  const h = start();
  h.issueMoveAt(540, 1370, 180, 1370);
  let commands = h.getEvents().filter(e => e.type === 'group_command');
  const ids = (commands[0].data as MoveGroupCommand).unitIds;
  assert.equal(ids.length, 17);
  h.issueMoveAt(540, 1370, 900, 1370);
  commands = h.getEvents().filter(e => e.type === 'group_command');
  assert.equal(commands.length, 2);
  assert.deepEqual((commands[1].data as MoveGroupCommand).target, { x: 900, y: 1370 });
  h.advance(1);
  assert.ok(h.getUnits().filter(u => ids.includes(u.id)).every(u => u.state === 'Moving' && u.targetId === null));
  assert.ok(!h.getEvents().some(e => ['projectile_spawned', 'damage'].includes(e.type) &&
    ids.includes((e.data as { sourceId: string }).sourceId)));
  // With the current off-screen spawn, the moved group needs a few more
  // seconds before zombies enter its 400px firing range.
  h.advance(30);
  assert.ok(h.getUnits().filter(u => ids.includes(u.id)).every(u => u.moveTarget === null));
  assert.ok(h.getEvents().some(e => e.type === 'projectile_spawned' && ids.includes((e.data as { sourceId: string }).sourceId)), 'arrived group resumes firing');
  h.issueMoveAt(60, 180, 0, 0);
  assert.equal(h.getEvents().filter(e => e.type === 'group_command').length, 2);
  h.issueMoveAt(900, 1370, 10000, 10000);
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
  assert.ok(events.filter(e => e.type === 'damage').every(e => (e.data as { amount: number }).amount === 10));
  if (snapshot.result === 'win') {
    assert.equal(snapshot.aliveZombies, 0);
    assert.equal(snapshot.spawnedZombies, 350);
    assert.ok(snapshot.aliveHumans > 0);
  } else assert.equal(snapshot.aliveHumans, 0);
  h.advance(120);
  assert.deepEqual(h.getSnapshot(), snapshot);
  assert.deepEqual(h.getEvents(), events);
});

let generatedReport: any;
function scenarioReport() {
  if (generatedReport) return generatedReport;
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'acceptance-'));
  try {
    const output = join(dir, 'report.json');
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-acceptance.mjs', '--output', output], { encoding: 'utf8' });
    assert.ok(run.status === 0 || run.status === 1, run.stderr);
    generatedReport = JSON.parse(readFileSync(output, 'utf8'));
    return generatedReport;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('idle seeds 1..10 meet casualty and annihilation target ranges', () => {
  const idle = scenarioReport().idle;
  for (const entry of idle) {
    assert.deepEqual(entry.assertions_failed, [], `seed ${entry.seed}`);
    assert.equal(entry.result, 'lose');
    assert.equal(entry.zombie_alive_at_end, 17);
    assert.ok(entry.first_casualty_time_s >= 25 && entry.first_casualty_time_s <= 35);
    assert.ok(entry.game_time_s >= 65 && entry.game_time_s <= 72);
  }
});

test('local fallback scenario wins with human survivors', () => {
  const scripted = scenarioReport().scripted;
  assert.equal(scripted.result, 'win');
  assert.ok(scripted.human_alive_at_end > 0);
  assert.deepEqual(scripted.assertions_failed, []);
});
test('report CLI runs ten idle seeds and fixed commands, preserves deterministic fields, and fails truthfully', t => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'acceptance-'));
  try {
    const output = join(dir, 'report.json');
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-acceptance.mjs', '--output', output], { encoding: 'utf8' });
    assert.ok(run.status === 0 || run.status === 1, run.stdout + run.stderr);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    generatedReport = report;
    t.diagnostic(JSON.stringify({ idle: report.idle.map((entry: any) => ({ seed: entry.seed,
      first_casualty_time_s: entry.first_casualty_time_s, game_time_s: entry.game_time_s,
      zombie_alive_at_end: entry.zombie_alive_at_end, assertions_failed: entry.assertions_failed })),
      scripted: { result: report.scripted.result, game_time_s: report.scripted.game_time_s,
        human_alive_at_end: report.scripted.human_alive_at_end, zombie_alive_at_end: report.scripted.zombie_alive_at_end,
        commands: report.scripted.commands, assertions_failed: report.scripted.assertions_failed } }));
    const failures = [...report.idle, report.scripted].flatMap(r => r.assertions_failed);
    assert.equal(run.status, failures.length ? 1 : 0);
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
    assert.equal(report.scripted.policy, 'local-fallback');
    assert.deepEqual(report.scripted.commands.map((c: any) => c.time_s), [28,28,28,52,52,52]);
    assert.deepEqual(report.scripted.commands.map((c: any) => c.source_route), ['A','B','C','A','B','C']);
    assert.deepEqual(report.scripted.commands.map((c: any) => c.target),
      [{ x: 180, y: 1550 }, { x: 540, y: 1550 }, { x: 900, y: 1550 },
        { x: 180, y: 1750 }, { x: 540, y: 1750 }, { x: 900, y: 1750 }]);
    const decision = start();
    decision.advance(28);
    for (const command of report.scripted.commands.slice(0,3)) {
      const group = decision.getUnits().filter(u => u.faction === 'human' && u.routeId === command.source_route && u.active && u.hp > 0 && u.state !== 'Dead');
      const ids = group.map(u => u.id).sort();
      assert.deepEqual([...command.unit_ids].sort(), ids);
      assert.deepEqual(command.intended_ids, ids);
      assert.equal(command.event_time_s, 28);
      assert.equal(command.issued_at_s, 28);
      assert.equal(command.selection_verified, true);
      const x = group.reduce((sum,u) => sum + u.position.x,0) / group.length;
      const y = group.reduce((sum,u) => sum + u.position.y,0) / group.length;
      assert.deepEqual(command.centroid, {x,y});
      decision.issueMoveAt(x,y,command.target.x,command.target.y);
      const event = decision.getEvents().filter(e => e.type === 'group_command').at(-1)!;
      assert.deepEqual([...(event.data as MoveGroupCommand).unitIds].sort(), ids);
    }
    decision.advance(24);
    for (const command of report.scripted.commands.slice(3)) {
      const group = decision.getUnits().filter(u => u.faction === 'human' && u.routeId === command.source_route && u.active && u.hp > 0 && u.state !== 'Dead');
      const ids = group.map(u => u.id).sort();
      assert.deepEqual([...command.unit_ids].sort(), ids);
      const x = group.reduce((sum,u) => sum + u.position.x,0) / group.length;
      const y = group.reduce((sum,u) => sum + u.position.y,0) / group.length;
      assert.deepEqual(command.centroid, {x,y});
      decision.issueMoveAt(x,y,command.target.x,command.target.y);
    }
    decision.advance(85);
    assert.equal(decision.getSnapshot().result, 'win');
    assert.ok(decision.getSnapshot().aliveHumans > 0);
    assert.equal(report.scripted.config.normal_zombie.speed_px_per_s, 41.9);
    assert.equal(report.scripted.config.normal_zombie.attack_interval_s, 0.13);
    assert.equal(report.scripted.config.rifleman.attack_range_px, 400);
    assert.deepEqual(report.scripted.config.spawn_layout, {columns:9,spacing_px:5});
    for (const entry of [...report.idle, report.scripted]) {
      const diagnostics = entry.combat_diagnostics;
      assert.ok(Object.values(diagnostics).every(n => Number.isInteger(n) && (n as number) >= 0));
      assert.ok(diagnostics.effective_rifle_hits + diagnostics.rifle_hits_without_damage <= diagnostics.rifle_shots);
    }
    assert.ok(report.scripted.commands.every((c: any) => c.unit_ids.length >= 2));
    const template = JSON.parse(readFileSync('docs/testing/mvp-test-report-template.json', 'utf8'));
    for (const entry of [...report.idle, report.scripted]) {
      for (const key of Object.keys(template)) assert.ok(key in entry, `missing report field ${key}`);
      assert.ok(entry.human_losses_before_wave_3 <= 2);
    }
    const rerun = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-acceptance.mjs', '--output', output], { encoding: 'utf8' });
    assert.equal(rerun.status, run.status, rerun.stdout + rerun.stderr);
    const again = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(again.idle.map(deterministic), report.idle.map(deterministic));
    assert.deepEqual(deterministic(again.scripted), deterministic(report.scripted));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
