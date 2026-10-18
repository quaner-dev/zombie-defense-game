import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BattleTestHarness } from '../src/core/BattleTestHarness.ts';
import units from '../config/units.json' with { type: 'json' };
import cabin from '../config/scenes/cabin.json' with { type: 'json' };

const level = 'LV01_zombie_wave';
const configuredZombieCount = cabin.level.waves.reduce((sum, wave) =>
  sum + wave.spawns.reduce((waveSum, spawn) => waveSum + spawn.count, 0), 0);

function run(seed, scripted) {
  const started = performance.now();
  const h = new BattleTestHarness();
  h.start(level, seed);
  h.advance(3);
  const initialHumans = h.getUnits().filter(u => u.faction === 'human');
  const commands = [];
  if (scripted) {
    const soldiers = [...initialHumans.filter(u => u.unitType === 'flamethrower'),
      ...initialHumans.filter(u => u.unitType === 'shield')];
    const destinations = [{ x: 330, y: 1560 }, { x: 330, y: 1620 }, { x: 375, y: 1590 }];
    for (const [index, soldier] of soldiers.entries()) {
      const destination = destinations[index];
      const pressedAt = { ...soldier.position };
      const previous = h.getEvents().filter(e => e.type === 'group_command').length;
      h.issueMoveAt(pressedAt.x, pressedAt.y, destination.x, destination.y);
      const events = h.getEvents().filter(e => e.type === 'group_command');
      const event = events.length > previous ? events.at(-1) : null;
      const intended = [soldier.id];
      const selected = [...(event?.data.unitIds ?? [])].sort();
      commands.push({ time_s: 0, event_time_s: event?.time_s ?? null,
        issued_at_s: event?.data.issuedAt_s ?? null, source_route: soldier.routeId, target_route: soldier.routeId,
        pressed_at: pressedAt, target: destination, intended_ids: intended, unit_ids: selected,
        selection_verified: !!event && event.time_s === 0 && event.data.issuedAt_s === 0 &&
          JSON.stringify(intended) === JSON.stringify(selected) });
    }
  }
  h.advance(120 - h.getSnapshot().time_s);
  const s = h.getSnapshot();
  const events = h.getEvents();
  const first = events.find(e => e.type === 'unit_died' && e.data.faction === 'human');
  const failed = [];
  if (s.result === 'running') failed.push('result: battle exceeded 120s');
  const firstTwoLosses = events.filter(e => e.type === 'unit_died' && e.data.faction === 'human' && e.time_s < 20).length;
  if (s.spawnedZombies > configuredZombieCount) failed.push('wave: spawned more zombies than configured');
  if (!scripted) {
    if (s.result !== 'win' && s.result !== 'lose') failed.push('result: idle battle did not resolve');
    if (s.time_s < 30 || s.time_s > 120) failed.push('result: idle end outside 30..120s');
    if (s.result === 'win' && (s.aliveZombies !== 0 || s.aliveHumans === 0 || s.spawnedZombies !== configuredZombieCount)) failed.push('result: idle victory counters disagree');
    if (s.result === 'lose' && s.aliveHumans !== 0) failed.push('result: idle defeat counters disagree');
  }
  if (scripted && (s.result !== 'win' || s.aliveHumans < 1)) failed.push('result: micro-control run must win with survivors');
  if (scripted && (commands.length !== 3 || commands.some(c => c.unit_ids.length < 1 || !c.selection_verified))) failed.push('movement: three opening commands must select living units');
  const rifleIds = new Set(initialHumans.filter(u => u.unitType === 'rifleman').map(u => u.id));
  const flameIds = new Set(initialHumans.filter(u => u.unitType === 'flamethrower').map(u => u.id));
  const zombieIds = new Set(h.getUnits().filter(u => u.faction === 'zombie').map(u => u.id));
  const rifleShots = events.filter(e => e.type === 'projectile_spawned' &&
    e.data.projectileKind === 'bullet' && rifleIds.has(e.data.sourceId));
  const rifleShotIds = new Set(rifleShots.map(e => e.data.id));
  const effectiveRifleHits = events.filter(e => e.type === 'damage' &&
    rifleIds.has(e.data.sourceId) && zombieIds.has(e.data.targetId)).length;
  const rifleHitsWithoutDamage = events.filter(e => e.type === 'projectile_hit' &&
    rifleShotIds.has(e.data.projectileId)).length - effectiveRifleHits;
  const report = {
    level_id: level, seed, result: s.result,
    policy: scripted ? 'micro-control' : 'idle',
    scene_id: cabin.id, map_id: cabin.mapId,
    initial_humans: initialHumans.length, configured_zombies: configuredZombieCount,
    spawned_zombies: s.spawnedZombies, doors_at_end: h.getMapModel().getDoorStates(),
    config: { ...structuredClone(units), spawn_layout: structuredClone(cabin.map.spawn_layout) },
    first_casualty_time_s: first?.time_s ?? null,
    human_alive_at_end: s.aliveHumans, zombie_alive_at_end: s.aliveZombies,
    wave_spawn_times_s: events.filter(e => e.type === 'wave_spawn').map(e => e.time_s),
    breached_routes: s.breachedRoutes, assertions_failed: failed,
    game_time_s: s.time_s, real_runtime_ms: performance.now() - started,
    human_losses_before_wave_3: firstTwoLosses,
    combat_diagnostics: { rifle_shots: rifleShots.length, effective_rifle_hits: effectiveRifleHits,
      rifle_hits_without_damage: rifleHitsWithoutDamage,
      flame_shots: events.filter(e => e.type === 'projectile_spawned' && e.data.projectileKind === 'flame').length,
      flame_damage_events: events.filter(e => e.type === 'damage' && flameIds.has(e.data.sourceId) && zombieIds.has(e.data.targetId)).length },
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
