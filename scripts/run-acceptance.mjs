import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BattleTestHarness } from '../src/core/BattleTestHarness.ts';
import units from '../config/units.json' with { type: 'json' };
import map from '../config/map.json' with { type: 'json' };

const level = 'LV01_zombie_wave';
const routeIds = ['A', 'B', 'C'];

function run(seed, scripted) {
  const started = performance.now();
  const h = new BattleTestHarness();
  h.start(level, seed);
  h.advance(3);
  const commands = [];
  if (scripted) {
    for (const stage of [{ time_s: 28, y: 1550 }, { time_s: 52, y: 1750 }]) {
      h.advance(stage.time_s - h.getSnapshot().time_s);
      for (const source of routeIds) {
        const group = h.getUnits().filter(u => u.faction === 'human' && u.active && u.hp > 0 && u.state !== 'Dead' && u.routeId === source);
        const centroid = group.length ? { x: group.reduce((s,u) => s + u.position.x,0) / group.length,
          y: group.reduce((s,u) => s + u.position.y,0) / group.length } : null;
        const destination = { x: h.getMapModel().getRoute(source).defend.x, y: stage.y };
        const previous = h.getEvents().filter(e => e.type === 'group_command').length;
        if (centroid) h.issueMoveAt(centroid.x,centroid.y,destination.x,destination.y);
        const events = h.getEvents().filter(e => e.type === 'group_command');
        const event = events.length > previous ? events.at(-1) : null;
        const intended = group.map(u => u.id).sort();
        const selected = [...(event?.data.unitIds ?? [])].sort();
        commands.push({ time_s: stage.time_s, event_time_s: event?.time_s ?? null,
          issued_at_s: event?.data.issuedAt_s ?? null, source_route: source, target_route: source,
          centroid, target: destination, intended_ids: intended, unit_ids: selected,
          selection_verified: !!event && event.time_s === stage.time_s && event.data.issuedAt_s === stage.time_s &&
            JSON.stringify(intended) === JSON.stringify(selected) });
      }
    }
  }
  h.advance(120 - h.getSnapshot().time_s);
  const s = h.getSnapshot();
  const events = h.getEvents();
  const first = events.find(e => e.type === 'unit_died' && e.data.faction === 'human');
  const failed = [];
  if (s.result === 'running') failed.push('result: battle exceeded 120s');
  const firstTwoLosses = events.filter(e => e.type === 'unit_died' && e.data.faction === 'human' && e.time_s < 20).length;
  if (s.spawnedZombies !== 350) failed.push('wave: expected 350 spawned zombies');
  if (!scripted) {
    if (s.result !== 'lose') failed.push('result: idle must lose');
    if (s.aliveZombies !== 17) failed.push('result: current viewport idle baseline must leave 17 zombies');
    if (firstTwoLosses > 2) failed.push('damage: waves 1/2 human losses exceed 2');
    if (!first || first.time_s < 25 || first.time_s > 35) failed.push('damage: first casualty outside 25..35s');
    if (s.time_s < 65 || s.time_s > 72) failed.push('result: current viewport idle end outside 65..72s');
  }
  if (scripted && (s.result !== 'win' || s.aliveHumans <= 0)) failed.push('result: fixed command scenario must win with survivors');
  if (scripted && (commands.length !== 6 || commands.some(c => c.unit_ids.length < 2 || !c.selection_verified))) failed.push('movement: six staged commands must select living groups');
  const factions = new Map(h.getUnits().map(u => [u.id, u.faction]));
  const effectiveRifleHits = events.filter(e => e.type === 'damage' &&
    factions.get(e.data.sourceId) === 'human' && factions.get(e.data.targetId) === 'zombie').length;
  const rifleShots = events.filter(e => e.type === 'projectile_spawned').length;
  const rifleHitsWithoutDamage = events.filter(e => e.type === 'projectile_hit').length - effectiveRifleHits;
  const report = {
    level_id: level, seed, result: s.result,
    policy: scripted ? 'local-fallback' : 'idle',
    config: { ...structuredClone(units), spawn_layout: structuredClone(map.spawn_layout) },
    first_casualty_time_s: first?.time_s ?? null,
    human_alive_at_end: s.aliveHumans, zombie_alive_at_end: s.aliveZombies,
    wave_spawn_times_s: events.filter(e => e.type === 'wave_spawn').map(e => e.time_s),
    breached_routes: s.breachedRoutes, assertions_failed: failed,
    game_time_s: s.time_s, real_runtime_ms: performance.now() - started,
    human_losses_before_wave_3: firstTwoLosses,
    combat_diagnostics: { rifle_shots: rifleShots, effective_rifle_hits: effectiveRifleHits,
      rifle_hits_without_damage: rifleHitsWithoutDamage },
  };
  if (scripted) report.commands = commands;
  return report;
}

const outputIndex = process.argv.indexOf('--output');
const output = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : 'docs/testing/mvp-test-report.json');
const report = { idle: Array.from({ length: 10 }, (_, i) => run(i + 1, false)), scripted: run(1, true) };
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Acceptance report: ${output}`);
console.log(JSON.stringify({ idle: report.idle[0], scripted: report.scripted }, null, 2));
if ([...report.idle, report.scripted].some(r => r.assertions_failed.length)) process.exitCode = 1;
