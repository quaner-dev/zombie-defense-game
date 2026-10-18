import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, BattleResult } from './types.js';
import type { CombatStats } from './CombatStats.js';
import type { ScenarioKind } from './types.js';
import type { CivilianStore } from './CivilianStore.js';

export class ResultSystem {
  private result: BattleResult = 'running';

  public constructor(private readonly store: UnitStore, private readonly stats?: CombatStats) {}

  public getStats() { return this.stats?.snapshot(this.store.all()); }

  public getResult(): BattleResult { return this.result; }

  public update(allWavesSpawned: boolean, time_s: number, context?: { scenarioKind?: ScenarioKind; civilians?: CivilianStore }): BattleEvent[] {
    if (this.result !== 'running') return [];
    const living = this.store.living();
    if (context?.scenarioKind === 'villa_rescue') {
      const civilians = context.civilians;
      if (civilians?.all().some(c => c.state === 'transformed')) this.result = 'lose';
      else if (allWavesSpawned && !living.some(unit => unit.faction === 'zombie') && civilians &&
        civilians.all().length === 6 && civilians.all().every(c => c.state === 'idle')) this.result = 'win';
    } else if (!living.some(unit => unit.faction === 'human')) this.result = 'lose';
    else if (allWavesSpawned && !living.some(unit => unit.faction === 'zombie')) this.result = 'win';
    if (this.result === 'running') return [];
    return [{ type: this.result, time_s, data: { result: this.result } }];
  }
}
