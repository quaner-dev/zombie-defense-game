import { DEFAULT_BATTLE_CONFIG } from './config.js';
import type { BattleConfig, BattleEvent, BattleSnapshot } from './types.js';

export class BattleTestHarness {
  private readonly config: BattleConfig;
  private snapshot: BattleSnapshot;
  private events: BattleEvent[] = [];
  private deploymentTime_s = 0;
  private started = false;

  public constructor(config: BattleConfig = DEFAULT_BATTLE_CONFIG) {
    this.config = config;
    this.snapshot = this.initialSnapshot();
  }

  public start(_levelId: string, _seed: number): void {
    this.snapshot = this.initialSnapshot();
    this.events = [];
    this.deploymentTime_s = 0;
    this.started = true;
  }

  public advance(seconds: number): void {
    if (!this.started || seconds <= 0 || this.snapshot.result !== 'running') return;
    const remainingDeployment = this.config.deploymentDuration_s - this.deploymentTime_s;
    this.deploymentTime_s += Math.min(seconds, Math.max(0, remainingDeployment));
    // Battle simulation begins in a later task. Deployment does not advance battle time.
  }

  public issueMoveAt(_x: number, _y: number, _targetX: number, _targetY: number): void {
    // Movement commands are implemented in a later task.
  }

  public getSnapshot(): BattleSnapshot {
    return { ...this.snapshot, breachedRoutes: [...this.snapshot.breachedRoutes] };
  }

  public getEvents(): BattleEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  private initialSnapshot(): BattleSnapshot {
    return {
      time_s: 0,
      aliveHumans: this.config.initialHumans,
      aliveZombies: 0,
      spawnedZombies: 0,
      waveIndex: 0,
      breachedRoutes: [],
      result: 'running',
    };
  }
}
