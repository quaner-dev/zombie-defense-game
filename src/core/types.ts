export type BattleResult = 'running' | 'win' | 'lose';

export interface BattleConfig {
  deploymentDuration_s: number;
  initialHumans: number;
}

export interface BattleSnapshot {
  time_s: number;
  aliveHumans: number;
  aliveZombies: number;
  spawnedZombies: number;
  waveIndex: number;
  breachedRoutes: string[];
  result: BattleResult;
}

export interface BattleEvent {
  type: string;
  time_s: number;
  data: unknown;
}
