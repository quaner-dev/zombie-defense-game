import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, BattleResult } from './types.js';
import type { CombatStats } from './CombatStats.js';

export class ResultSystem {
  private result: BattleResult = 'running';

  public constructor(private readonly store: UnitStore, private readonly stats?: CombatStats) {}

  public getStats() { return this.stats?.snapshot(this.store.all()); }

  public getResult(): BattleResult { return this.result; }

  public update(allWavesSpawned: boolean, time_s: number): BattleEvent[] {
    if (this.result !== 'running') return [];
    const living = this.store.living();
    if (!living.some(unit => unit.faction === 'human')) this.result = 'lose';
    else if (allWavesSpawned && !living.some(unit => unit.faction === 'zombie')) this.result = 'win';
    if (this.result === 'running') return [];
    return [{ type: this.result, time_s, data: { result: this.result } }];
  }
}
