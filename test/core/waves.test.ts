import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BattleTestHarness } from '../../src/core/BattleTestHarness.js';
import { MapModel } from '../../src/core/MapModel.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface SpawnDetail {
  unitType: string;
  route: string;
  count: number;
}

function spawnsAt(harness: BattleTestHarness, waveBattleTime: number): SpawnDetail[] {
  const details: SpawnDetail[] = [];
  for (const event of harness.getEvents()) {
    if (event.type === 'wave_spawn') {
      const data = event.data as { battleTime_s: number; spawns: SpawnDetail[] };
      if (data.battleTime_s !== waveBattleTime) continue;
      for (const spawn of data.spawns) details.push(spawn);
    }
  }
  return details;
}

test('does not spawn zombies during deployment', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(1); // mid-deployment
  harness.advance(1.9);
  assert.equal(harness.getSnapshot().time_s, 0);
  assert.equal(harness.getSnapshot().spawnedZombies, 0);
  assert.equal(harness.getSnapshot().aliveZombies, 0);
  assert.equal(harness.getSnapshot().waveIndex, 0);
  assert.deepEqual(spawnsAt(harness, 0), []);
});

test('spawns 50 center zombies at battle time 0s', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(3); // end deployment, battle time starts at 0
  const centerSpawns = spawnsAt(harness, 0).filter((s) => s.route === 'center');
  assert.equal(centerSpawns.reduce((n, s) => n + s.count, 0), 50);
  assert.equal(harness.getSnapshot().spawnedZombies, 50);
});

test('spawns 100 zombies at 7s split across routes A and C', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(3 + 7);
  const spawns = spawnsAt(harness, 7);
  const byRoute = new Map<string, number>();
  for (const s of spawns) byRoute.set(s.route, (byRoute.get(s.route) ?? 0) + s.count);
  assert.equal((byRoute.get('A') ?? 0) + (byRoute.get('C') ?? 0), 100);
  assert.ok(byRoute.has('A'), 'wave at 7s must include route A');
  assert.ok(byRoute.has('C'), 'wave at 7s must include route C');
  assert.ok(!byRoute.has('B'), 'wave at 7s must not use route B');
  assert.equal(harness.getSnapshot().spawnedZombies, 150);
});

test('spawns 200 zombies at 20s split across routes A, B and C', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(3 + 20);
  const spawns = spawnsAt(harness, 20);
  const byRoute = new Map<string, number>();
  for (const s of spawns) byRoute.set(s.route, (byRoute.get(s.route) ?? 0) + s.count);
  assert.equal((byRoute.get('A') ?? 0) + (byRoute.get('B') ?? 0) + (byRoute.get('C') ?? 0), 200);
  assert.ok(byRoute.has('A'), 'wave at 20s must include route A');
  assert.ok(byRoute.has('B'), 'wave at 20s must include route B');
  assert.ok(byRoute.has('C'), 'wave at 20s must include route C');
  assert.equal(harness.getSnapshot().spawnedZombies, 350);
});

test('all spawned zombies are normal_zombie', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(3 + 20);
  for (const spawn of spawnsAt(harness, 20)) {
    assert.equal(spawn.unitType, 'normal_zombie');
  }
});

test('previous waves need not be cleared for later waves to spawn', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(3 + 20); // no clearing in between; all waves still spawn
  assert.equal(harness.getSnapshot().spawnedZombies, 350);
  assert.equal(harness.getSnapshot().result, 'running');
});

test('each wave is emitted only once even if update runs repeatedly', () => {
  const harness = new BattleTestHarness();
  harness.start('LV01_zombie_wave', 1);
  harness.advance(3 + 20);
  const spawned = harness.getSnapshot().spawnedZombies;
  harness.advance(1);
  harness.advance(1);
  assert.equal(harness.getSnapshot().spawnedZombies, spawned);
});

test('map config defines routes A, B, C and a center spawn', () => {
  const map = JSON.parse(readFileSync(join(root, 'config', 'map.json'), 'utf8')) as {
    routes: { id: string }[];
    spawnPoints: { id: string }[];
  };
  const mapModel = new MapModel(map as never);
  for (const id of ['A', 'B', 'C']) {
    assert.ok(mapModel.getRoute(id), `route ${id} must exist`);
  }
  assert.ok(
    map.spawnPoints.some((p) => p.id === 'center'),
    'center spawn point must exist',
  );
});

test('map model returns undefined for unknown route', () => {
  const map = JSON.parse(readFileSync(join(root, 'config', 'map.json'), 'utf8'));
  const mapModel = new MapModel(map as never);
  assert.equal(mapModel.getRoute('Z'), undefined);
});
