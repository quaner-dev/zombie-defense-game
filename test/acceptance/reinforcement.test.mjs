import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseReinforcement } from '../../scripts/reinforcement.mjs';

test('reinforcement excludes its safe source and counts living units only', () => {
  const units = [
    ...Array.from({ length: 17 }, () => ({ faction: 'human', routeId: 'A' })),
    ...Array.from({ length: 16 }, () => ({ faction: 'human', routeId: 'C' })),
    ...Array.from({ length: 10 }, () => ({ faction: 'zombie', routeId: 'A' })),
    ...Array.from({ length: 9 }, () => ({ faction: 'zombie', routeId: 'B' })),
    ...Array.from({ length: 8 }, () => ({ faction: 'zombie', routeId: 'C' })),
  ].map(u => ({ ...u, active: true, hp: 100, state: 'Idle', breached: false }));
  units.push(...Array.from({ length: 20 }, () => ({ faction: 'zombie', routeId: 'C', active: true, hp: 0, state: 'Dead', breached: true })));
  assert.deepEqual(chooseReinforcement(units), { source: 'A', target: 'B' });
});

test('safe ranking prefers most humans, deterministic route ties, and rejects breached sources', () => {
  const units = ['A', 'B', 'C'].map(routeId => ({ faction: 'human', routeId, active: true, hp: 100, state: 'Idle' }));
  units.push({ faction: 'zombie', routeId: 'A', active: true, hp: 40, state: 'Breached', breached: true });
  assert.deepEqual(chooseReinforcement(units), { source: 'B', target: 'A' });
  assert.deepEqual(chooseReinforcement([]), { source: null, target: null });
});

test('equal human and zombie counts use route order regardless of input order', () => {
  const units = ['C', 'B', 'A'].flatMap(routeId => [
    { faction: 'human', routeId, active: true, hp: 100, state: 'Idle' },
    { faction: 'zombie', routeId, active: true, hp: 40, state: 'Idle' },
  ]);
  assert.deepEqual(chooseReinforcement(units), { source: 'A', target: 'B' });
});

test('inactive, zero-hp and Dead units cannot affect source safety or target counts', () => {
  const units = [{ faction: 'human', routeId: 'C', active: true, hp: 100, state: 'Idle' }];
  for (const invalid of [{ active: false }, { hp: 0 }, { state: 'Dead' }]) {
    for (const faction of ['human', 'zombie']) {
      units.push({ faction, routeId: 'C', active: true, hp: 100, state: 'Idle', breached: true, ...invalid });
      units.push({ faction, routeId: 'B', active: true, hp: 100, state: 'Idle', ...invalid });
    }
  }
  assert.deepEqual(chooseReinforcement(units), { source: 'C', target: 'A' });
});

test('no reinforcement is chosen when every occupied human route is breached', () => {
  const units = ['A', 'B', 'C'].flatMap(routeId => [
    { faction: 'human', routeId, active: true, hp: 100, state: 'Idle' },
    { faction: 'zombie', routeId, active: true, hp: 40, state: 'Breached', breached: true },
  ]);
  assert.deepEqual(chooseReinforcement(units), { source: null, target: null });
});
