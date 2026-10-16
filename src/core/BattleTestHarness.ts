import { DEFAULT_BATTLE_CONFIG } from './config.js';
import { MapModel } from './MapModel.js';
import { WaveManager, type WaveSpawnEventData } from './WaveManager.js';
import type { BattleConfig, BattleEvent, BattleSnapshot } from './types.js';

export class BattleTestHarness {
  private readonly config: BattleConfig;
  private snapshot: BattleSnapshot;
  private events: BattleEvent[] = [];
  private deploymentTime_s = 0;
  private battleTime_s = 0;
  private started = false;
  private waveManager: WaveManager | null = null;
  private mapModel: MapModel | null = null;

  public constructor(config: BattleConfig = DEFAULT_BATTLE_CONFIG) {
    this.config = config;
    this.snapshot = this.initialSnapshot();
  }

  public start(levelId: string, _seed: number): void {
    this.snapshot = this.initialSnapshot();
    this.events = [];
    this.deploymentTime_s = 0;
    this.battleTime_s = 0;
    // Load level config; battle time stays at zero until deployment ends.
    this.waveManager = WaveManager.load(levelId);
    this.mapModel = MapModel.load(this.waveManager.getMapId());
    this.waveManager.validateMap(this.mapModel);
    this.started = true;
  }

  public endDeployment(): void {
    if (!this.started || this.snapshot.result !== 'running') return;
    this.deploymentTime_s = this.config.deploymentDuration_s;
    this.runWaves();
  }

  public advance(seconds: number): void {
    if (!this.started || seconds < 0 || this.snapshot.result !== 'running') return;

    // Deployment consumes time first; battle time only starts once it ends.
    const remainingDeployment = this.config.deploymentDuration_s - this.deploymentTime_s;
    if (remainingDeployment > 0) {
      const consumed = Math.min(seconds, remainingDeployment);
      this.deploymentTime_s += consumed;
      if (this.deploymentTime_s < this.config.deploymentDuration_s) return;
      // Deployment has just ended; battle time starts at zero.
      seconds -= consumed;
    }

    this.battleTime_s += seconds;
    this.snapshot.time_s = this.battleTime_s;
    this.runWaves();
  }

  public issueMoveAt(_x: number, _y: number, _targetX: number, _targetY: number): void {
    // Movement commands are implemented in a later task.
  }

  public getSnapshot(): BattleSnapshot {
    return { ...this.snapshot, breachedRoutes: [...this.snapshot.breachedRoutes] };
  }

  public getMapModel(): MapModel {
    if (!this.mapModel) throw new Error('Battle has not started');
    return this.mapModel;
  }

  public getEvents(): BattleEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  private runWaves(): void {
    if (!this.waveManager) return;
    for (const event of this.waveManager.update(this.battleTime_s)) {
      this.events.push(event);
      const data = event.data as WaveSpawnEventData;
      for (const spawn of data.spawns) {
        this.snapshot.spawnedZombies += spawn.count;
        this.snapshot.aliveZombies += spawn.count;
      }
      this.snapshot.waveIndex = data.waveIndex + 1;
    }
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
