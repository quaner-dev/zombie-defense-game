import { cloneData } from './cloneData.js';
import { DEFAULT_BATTLE_CONFIG } from './config.js';
import { MapModel } from './MapModel.js';
import { WaveManager, type WaveScheduler, type WaveSpawnEventData } from './WaveManager.js';
import { UnitStore } from './UnitStore.js';
import { CommandSystem, formationPositions } from './CommandSystem.js';
import { MovementSystem } from './MovementSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { ProjectileSystem } from './ProjectileSystem.js';
import { ResultSystem } from './ResultSystem.js';
import type { BattleConfig, BattleEvent, BattleSnapshot, Unit, UnitType } from './types.js';

export class BattleTestHarness {
  private readonly config: BattleConfig;
  private snapshot: BattleSnapshot;
  private events: BattleEvent[] = [];
  private deploymentTime_s = 0;
  private battleTime_s = 0;
  private pendingTime_s = 0;
  private battleTick = 0;
  private deploymentTick = 0;
  private static readonly STEP = 0.05;
  private started = false;
  private waveManager: WaveScheduler | null = null;
  private mapModel: MapModel | null = null;
  private readonly units = new UnitStore();
  private readonly movement = new MovementSystem(this.units);
  private commands: CommandSystem | null = null;
  private combat: CombatSystem | null = null;
  private projectiles: ProjectileSystem | null = null;
  private results: ResultSystem | null = null;

  public constructor(
    config: BattleConfig = DEFAULT_BATTLE_CONFIG,
    private readonly createWaveScheduler: (levelId: string) => WaveScheduler = WaveManager.load,
  ) {
    this.config = config;
    this.snapshot = this.initialSnapshot();
  }

  public start(levelId: string, _seed: number): void {
    this.snapshot = this.initialSnapshot();
    this.events = [];
    this.deploymentTime_s = 0;
    this.battleTime_s = 0;
    this.pendingTime_s = 0;
    this.battleTick = 0;
    this.deploymentTick = 0;
    // Load level config; battle time stays at zero until deployment ends.
    this.waveManager = this.createWaveScheduler(levelId);
    this.mapModel = MapModel.load(this.waveManager.getMapId());
    this.waveManager.validateMap(this.mapModel);
    this.units.clear();
    this.combat = new CombatSystem(this.units, this.mapModel);
    this.projectiles = new ProjectileSystem(this.units, this.combat);
    this.results = new ResultSystem(this.units);
    this.commands = new CommandSystem(this.units, this.mapModel, event => this.events.push(event));
    const routes = this.mapModel.routeIds();
    if (!routes.length) throw new Error('Map must define at least one route');
    for (const [index, routeId] of routes.entries()) {
      const count = Math.floor(this.config.initialHumans / routes.length) +
        (index < this.config.initialHumans % routes.length ? 1 : 0);
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

    // Caller intervals only add elapsed time. Systems observe identical 50ms ticks,
    // including deployment movement; no caller endpoint creates a partial frame.
    this.pendingTime_s += seconds;
    const step = BattleTestHarness.STEP;
    while (this.snapshot.result === 'running') {
      const deploying = this.deploymentTime_s < this.config.deploymentDuration_s;
      const dt = deploying ? Math.min(step, this.config.deploymentDuration_s - this.deploymentTime_s) : step;
      // This epsilon only absorbs accumulator roundoff, never changes system dt.
      if (this.pendingTime_s + 1e-10 < dt) break;
      this.pendingTime_s = Math.max(0, this.pendingTime_s - dt);
      if (deploying) {
        this.deploymentTick++;
        this.deploymentTime_s = Math.min(this.config.deploymentDuration_s, this.deploymentTick / 20);
        this.events.push(...this.movement.update(dt, 0));
        if (this.deploymentTime_s === this.config.deploymentDuration_s) this.runWaves();
        continue;
      }
      this.runWaves();
      this.battleTime_s = ++this.battleTick / 20;
      this.snapshot.time_s = this.battleTime_s;
      this.events.push(...this.combat!.update(step, this.battleTime_s));
      this.events.push(...this.movement.update(step, this.battleTime_s));
      this.events.push(...this.projectiles!.update(step, this.battleTime_s));
      this.runWaves();
      this.resolveFrame();
    }
    if (this.deploymentTime_s >= this.config.deploymentDuration_s) {
      this.runWaves();
      this.resolveFrame();
    }
  }

  public issueMoveAt(x: number, y: number, targetX: number, targetY: number): void {
    if (!this.started || this.snapshot.result !== 'running') return;
    const event = this.commands?.issueMoveAt(x, y, targetX, targetY, this.battleTime_s);
    if (event) this.events.push(event);
  }

  public issueMoveGroup(unitIds: readonly string[], targetX: number, targetY: number): boolean {
    if (!this.started || this.snapshot.result !== 'running') return false;
    const event = this.commands?.issueMoveGroup(unitIds, targetX, targetY, this.battleTime_s);
    if (!event) return false;
    this.events.push(event);
    return true;
  }

  public getUnits(): Unit[] {
    return cloneData(this.units.all());
  }

  public getSnapshot(): BattleSnapshot {
    return { ...this.snapshot, breachedRoutes: [...this.snapshot.breachedRoutes] };
  }

  public getMapModel(): MapModel {
    if (!this.mapModel) throw new Error('Battle has not started');
    return this.mapModel;
  }

  public getWaveCount(): number { return this.waveManager?.getWaveCount() ?? 0; }

  public getEvents(): BattleEvent[] {
    return cloneData(this.events);
  }

  /** Cursor is scoped to this battle lifetime. Copies only unseen events. */
  public readEvents(cursor: number): { cursor: number; events: BattleEvent[] } {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.events.length) {
      throw new RangeError('Invalid battle event cursor');
    }
    return { cursor: this.events.length, events: cloneData(this.events.slice(cursor)) };
  }

  private runWaves(): void {
    if (!this.waveManager) return;
    for (const event of this.waveManager.update(this.battleTime_s)) {
      this.events.push(event);
      const data = event.data as WaveSpawnEventData;
      for (const spawn of data.spawns) {
        for (const position of this.mapModel!.spawnPositions(spawn.route, spawn.count)) {
          this.units.spawn(spawn.unitType as UnitType, position, spawn.route);
        }
        this.snapshot.spawnedZombies += spawn.count;
        this.snapshot.aliveZombies += spawn.count;
      }
      this.snapshot.waveIndex = data.waveIndex + 1;
    }
  }

  private resolveFrame(): void {
    const living = this.units.living();
    this.snapshot.aliveHumans = living.filter(unit => unit.faction === 'human').length;
    this.snapshot.aliveZombies = living.filter(unit => unit.faction === 'zombie').length;
    for (const unit of this.units.all()) {
      if (unit.breached && !this.snapshot.breachedRoutes.includes(unit.routeId)) {
        this.snapshot.breachedRoutes.push(unit.routeId);
      }
    }
    this.events.push(...this.results!.update(this.waveManager!.allWavesSpawned(), this.battleTime_s));
    this.snapshot.result = this.results!.getResult();
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
