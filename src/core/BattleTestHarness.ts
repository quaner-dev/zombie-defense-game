import { cloneData } from './cloneData.js';
import { DEFAULT_BATTLE_CONFIG, MAX_HUMANS } from './config.js';
import { MapModel } from './MapModel.js';
import { WaveManager, type WaveScheduler, type WaveSpawnEventData } from './WaveManager.js';
import { UnitStore } from './UnitStore.js';
import { CommandSystem, formationPositions } from './CommandSystem.js';
import { MovementSystem } from './MovementSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { ProjectileSystem } from './ProjectileSystem.js';
import { ResultSystem } from './ResultSystem.js';
import { SpawnSystem } from './SpawnSystem.js';
import { CombatStats } from './CombatStats.js';
import type { BattleConfig, BattleEvent, BattleSnapshot, HumanUnitType, Unit } from './types.js';
import { HUMAN_UNIT_TYPES } from './units/index.js';
import { CivilianStore } from './CivilianStore.js';
import { VillaWallModel } from './VillaWallModel.js';
import { SCENES } from '../scenes/index.js';
import type { ScenarioKind } from './types.js';

export class BattleTestHarness {
  private readonly config: BattleConfig;
  private readonly initialHumanCount: number;
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
  private movement: MovementSystem;
  private commands: CommandSystem | null = null;
  private combat: CombatSystem | null = null;
  private projectiles: ProjectileSystem | null = null;
  private results: ResultSystem | null = null;
  private spawnSystem: SpawnSystem | null = null;
  private readonly stats = new CombatStats();
  private readonly civilians = new CivilianStore();
  private villaWalls: VillaWallModel | null = null;
  private scenarioKind: ScenarioKind = 'legacy';

  public constructor(
    config: BattleConfig = DEFAULT_BATTLE_CONFIG,
    private readonly createWaveScheduler: (levelId: string) => WaveScheduler = WaveManager.load,
  ) {
    this.config = config;
    this.initialHumanCount = Number.isFinite(config.initialHumans)
      ? Math.min(MAX_HUMANS, Math.max(0, Math.floor(config.initialHumans))) : 0;
    this.snapshot = this.initialSnapshot();
    this.movement = new MovementSystem(this.units);
  }

  public start(levelId: string, _seed: number): void {
    this.started = false;
    this.snapshot = this.initialSnapshot();
    this.events = [];
    this.deploymentTime_s = 0;
    this.battleTime_s = 0;
    this.pendingTime_s = 0;
    this.battleTick = 0;
    this.deploymentTick = 0;
    // Load level config; battle time stays at zero until deployment ends.
    this.waveManager = this.createWaveScheduler(levelId);
    this.scenarioKind = levelId === 'LV03_villa_rescue' ? 'villa_rescue' : 'legacy';
    this.civilians.clear(); this.villaWalls = this.scenarioKind === 'villa_rescue' ? new VillaWallModel() : null;
    this.mapModel = MapModel.load(this.waveManager.getMapId());
    this.movement = new MovementSystem(this.units, this.mapModel);
    this.spawnSystem = new SpawnSystem(this.units, this.mapModel);
    if (this.scenarioKind === 'villa_rescue') {
      this.spawnSystem.configureContinuous({ totalTarget: 240, interval_s: 1.2, initialInterval_s: 1.2, minInterval_s: 0.45, rampDuration_s: 120, batchSize: 2, spawnPoints: ['north', 'east', 'south', 'west'], distribution: { north: .25, east: .25, south: .25, west: .25 } });
    } else if (this.waveManager.getMapId() === 'LV02_building_courtyard') {
      this.spawnSystem.configureContinuous({
        totalTarget: 720, interval_s: 0.35, batchSize: 10,
        spawnPoints: ['north', 'south', 'east', 'west'],
        distribution: { north: 0.3, south: 0.3, east: 0.2, west: 0.2 },
        specialRatios: { gut_zombie: 0.05 },
      });
    }
    this.waveManager.validateMap(this.mapModel);
    this.units.clear();
    this.stats.reset();
    this.combat = new CombatSystem(this.units, this.mapModel, this.stats);
    this.projectiles = new ProjectileSystem(this.units, this.combat, this.mapModel);
    this.results = new ResultSystem(this.units);
    this.commands = new CommandSystem(this.units, this.mapModel, event => this.events.push(event));
    const routes = this.mapModel.routeIds();
    if (!routes.length) throw new Error(`Level ${levelId} map ${this.waveManager.getMapId()} must define at least one route`);
    const villaScene = SCENES.find(scene => scene.levelId === levelId);
    const humanTypes = this.scenarioKind === 'villa_rescue' ? (villaScene?.level.initialSoldiers ?? ['rifleman','rifleman','rifleman','rifleman','flamethrower','flamethrower','shield']) : this.humanSpawnTypes(this.initialHumanCount);
    // Deploy one squad around the middle route instead of splitting it across lanes.
    const routeId = routes[Math.floor(routes.length / 2)];
    const route = this.mapModel.getRoute(routeId);
    if (!route) {
      throw new Error(`Level ${levelId} map ${this.waveManager.getMapId()} references missing deployment route ${routeId}`);
    }
    if (!route.defend || !Number.isFinite(route.defend.x) || !Number.isFinite(route.defend.y)) {
      throw new Error(`Level ${levelId} map ${this.waveManager.getMapId()} route ${routeId} is missing a valid defend point`);
    }
    const positions = this.scenarioKind === 'villa_rescue' ? [{x:540,y:1400},{x:405,y:1170},{x:675,y:1170},{x:450,y:970},{x:630,y:970},{x:420,y:1420},{x:660,y:1420}] : formationPositions(this.initialHumanCount, route.defend, this.mapModel);
    for (let index = 0; index < positions.length; index++) {
      const position = positions[index];
      const unit = this.units.spawn(humanTypes[index % humanTypes.length], position, routeId);
      this.stats.register(unit);
      unit.position = this.mapModel.walkablePoint(unit.position, unit.radius_px);
    }
    if (this.scenarioKind === 'villa_rescue') {
      for (const civilian of villaScene?.level.civilians ?? []) this.civilians.spawn(civilian.position);
      this.deploymentTime_s = this.config.deploymentDuration_s;
      this.runWaves();
    }
    this.started = true;
  }

  private humanSpawnTypes(count: number): HumanUnitType[] {
    const weights = this.config.initialHumanTypeWeights ?? { rifleman: 1 };
    const types = HUMAN_UNIT_TYPES
      .filter(type => Number.isFinite(weights[type]) && (weights[type] ?? 0) > 0);
    if (!types.length) return ['rifleman'];
    const pattern = types.flatMap(type => Array(Math.max(1, Math.floor(weights[type] ?? 0))).fill(type));
    return Array.from({ length: Math.max(1, count) }, (_, i) => pattern[i % pattern.length]);
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
      this.events.push(...this.civilians.update(step, this.battleTime_s, position => this.units.spawn('normal_zombie', position, 'civilian').id));
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

  public toggleEngineerDeployment(unitId: string): boolean {
    if (!this.started || this.snapshot.result !== 'running') return false;
    return this.commands?.toggleEngineerDeployment(unitId) ?? false;
  }

  public getUnits(): Unit[] {
    return cloneData(this.units.all());
  }

  public getSnapshot(): BattleSnapshot {
    return {
      ...this.snapshot,
      breachedRoutes: [...this.snapshot.breachedRoutes],
      stats: { byUnitType: Object.fromEntries(Object.entries(this.snapshot.stats.byUnitType).map(([key, value]) => [key, { ...value }])) as BattleSnapshot['stats']['byUnitType'] },
      civiliansRemaining: this.civilians.living().length,
      civiliansTransforming: this.civilians.all().filter(c => c.state === 'transforming').length,
      civilianTransformed: this.civilians.all().some(c => c.state === 'transformed'),
      civilianCount: this.civilians.all().length,
      scenarioKind: this.scenarioKind,
      walls: this.villaWalls?.snapshots(),
    };
  }

  public getMapModel(): MapModel {
    if (!this.mapModel) throw new Error('Battle has not started');
    return this.mapModel;
  }

  public getWaveCount(): number { return this.waveManager?.getWaveCount() ?? 0; }

  public getInitialHumans(): number { return this.initialHumanCount; }

  public hitCivilian(civilianId: string, sourceId = 'zombie', amount = 1): void {
    this.events.push(...this.civilians.hit(civilianId, sourceId, amount, this.battleTime_s));
  }

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
    if (this.spawnSystem?.isGenerationComplete()) return;
    for (const event of this.spawnSystem?.isContinuous() ? [] : this.waveManager.update(this.battleTime_s)) {
      this.events.push(event);
      const data = event.data as WaveSpawnEventData;
      this.spawnSystem?.enqueue(data);
      this.snapshot.waveIndex = data.waveIndex + 1;
    }
    const batchEvents = this.spawnSystem?.update(this.battleTime_s) ?? [];
    this.events.push(...batchEvents);
    this.snapshot.spawnedZombies = this.spawnSystem?.spawnedCount ?? this.snapshot.spawnedZombies;
  }

  private allZombieBatchesSpawned(): boolean {
    return this.spawnSystem?.isGenerationComplete() === true ||
      (this.waveManager?.allWavesSpawned() === true && !this.spawnSystem?.hasPending());
  }

  private resolveFrame(): void {
    const living = this.units.living();
    this.snapshot.aliveHumans = living.filter(unit => unit.faction === 'human').length;
    this.snapshot.aliveZombies = living.filter(unit => unit.faction === 'zombie').length;
    this.snapshot.generationComplete = this.allZombieBatchesSpawned();
    this.snapshot.stats = this.stats.snapshot(this.units.all());
    for (const unit of this.units.all()) {
      if (unit.breached && !this.snapshot.breachedRoutes.includes(unit.routeId)) {
        this.snapshot.breachedRoutes.push(unit.routeId);
      }
    }
    this.events.push(...this.results!.update(this.allZombieBatchesSpawned(), this.battleTime_s, { scenarioKind: this.scenarioKind, civilians: this.civilians }));
    this.snapshot.result = this.results!.getResult();
    if (this.snapshot.result !== 'running') this.events.push(...this.projectiles!.expireAll(this.battleTime_s));
  }

  private initialSnapshot(): BattleSnapshot {
    return {
      time_s: 0,
      aliveHumans: this.initialHumanCount,
      aliveZombies: 0,
      spawnedZombies: 0,
      waveIndex: 0,
      breachedRoutes: [],
      result: 'running',
      stats: this.stats.snapshot(this.units.all()),
      generationComplete: false,
      scenarioKind: 'legacy', civilianCount: 0, civiliansRemaining: 0, civiliansTransforming: 0, civilianTransformed: false,
    };
  }
}
