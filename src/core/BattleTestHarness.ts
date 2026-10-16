import { DEFAULT_BATTLE_CONFIG } from './config.js';
import { MapModel } from './MapModel.js';
import { WaveManager, type WaveSpawnEventData } from './WaveManager.js';
import { UnitStore } from './UnitStore.js';
import { CommandSystem, formationPositions } from './CommandSystem.js';
import { MovementSystem } from './MovementSystem.js';
import type { BattleConfig, BattleEvent, BattleSnapshot, Unit, UnitType } from './types.js';

export class BattleTestHarness {
  private readonly config: BattleConfig;
  private snapshot: BattleSnapshot;
  private events: BattleEvent[] = [];
  private deploymentTime_s = 0;
  private battleTime_s = 0;
  private started = false;
  private waveManager: WaveManager | null = null;
  private mapModel: MapModel | null = null;
  private readonly units = new UnitStore();
  private readonly movement = new MovementSystem(this.units);
  private commands: CommandSystem | null = null;

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
    this.units.clear();
    this.commands = new CommandSystem(this.units, this.mapModel, event => this.events.push(event));
    const routes = ['A', 'B', 'C'];
    for (const [index, routeId] of routes.entries()) {
      const count = Math.floor(this.config.initialHumans / 3) +
        (index < this.config.initialHumans % 3 ? 1 : 0);
      const route = this.mapModel.getRoute(routeId)!;
      for (const position of formationPositions(count, route.defend, this.mapModel)) {
        this.units.spawn('rifleman', position, routeId);
      }
    }
    this.started = true;
  }

  public endDeployment(): void {
    if (!this.started || this.snapshot.result !== 'running') return;
    this.deploymentTime_s = this.config.deploymentDuration_s;
    this.runWaves();
  }

  public advance(seconds: number): void {
    if (!this.started || !Number.isFinite(seconds) || seconds < 0 || this.snapshot.result !== 'running') return;

    // Deployment consumes time first; battle time only starts once it ends.
    const remainingDeployment = this.config.deploymentDuration_s - this.deploymentTime_s;
    if (remainingDeployment > 0) {
      const consumed = Math.min(seconds, remainingDeployment);
      this.deploymentTime_s += consumed;
      this.events.push(...this.movement.update(consumed, 0));
      if (this.deploymentTime_s < this.config.deploymentDuration_s) return;
      // Deployment has just ended; battle time starts at zero.
      seconds -= consumed;
    }

    this.battleTime_s += seconds;
    this.snapshot.time_s = this.battleTime_s;
    this.events.push(...this.movement.update(seconds, this.battleTime_s));
    this.runWaves();
  }

  public issueMoveAt(x: number, y: number, targetX: number, targetY: number): void {
    if (!this.started || this.snapshot.result !== 'running') return;
    const event = this.commands?.issueMoveAt(x, y, targetX, targetY, this.battleTime_s);
    if (event) this.events.push(event);
  }

  public getUnits(): Unit[] {
    return structuredClone(this.units.all());
  }

  public getSnapshot(): BattleSnapshot {
    return { ...this.snapshot, breachedRoutes: [...this.snapshot.breachedRoutes] };
  }

  public getMapModel(): MapModel {
    if (!this.mapModel) throw new Error('Battle has not started');
    return this.mapModel;
  }

  public getEvents(): BattleEvent[] {
    return structuredClone(this.events);
  }

  private runWaves(): void {
    if (!this.waveManager) return;
    for (const event of this.waveManager.update(this.battleTime_s)) {
      this.events.push(event);
      const data = event.data as WaveSpawnEventData;
      for (const spawn of data.spawns) {
        const route = this.mapModel!.getRoute(spawn.route)!;
        for (let i = 0; i < spawn.count; i++) {
          this.units.spawn(spawn.unitType as UnitType, route.spawn, spawn.route);
        }
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
