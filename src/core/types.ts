export type BattleResult = 'running' | 'win' | 'lose';

export interface Point { x: number; y: number }
export type HumanUnitType = 'rifleman' | 'flamethrower' | 'shield' | 'sniper' | 'engineer';
export type ZombieUnitType = 'normal_zombie' | 'fat_zombie' | 'zombie_mother' | 'gut_zombie';
export type UnitType = HumanUnitType | ZombieUnitType;
export type UnitState = 'Idle' | 'Moving' | 'Aiming' | 'Firing' | 'Deploying' | 'Deployed' |
  'Dismantling' | 'RetractingFlame' | 'ReleasingFlame' | 'Overheated' | 'Cooling' |
  'Suicidal' | 'StoredInGut' | 'Advancing' | 'Climbing' | 'Breached' | 'Attacking' | 'Dead';

export interface Unit {
  id: string;
  unitType: UnitType;
  faction: 'human' | 'zombie';
  position: Point;
  velocity: Point;
  hp: number;
  maxHp: number;
  radius_px: number;
  speed_px_per_s: number;
  state: UnitState;
  routeId: string;
  targetId: string | null;
  moveTarget: Point | null;
  attackElapsed_s: number;
  breached: boolean;
  spawnPointId: string | null;
  climbingWallId: string | null;
  climbTarget: Point | null;
  stackLevel: number;
  weaponHeat: number;
  weaponCooldown_s: number;
  stateElapsed_s: number;
  facing: Point;
  storedGutUnitIds: string[];
  storedInGutById: string | null;
  suicideTriggerId: string | null;
  active: boolean;
}

export interface MoveGroupCommand {
  unitIds: string[];
  target: Point;
  issuedAt_s: number;
}

export interface GroupCommandEvent {
  type: 'group_command';
  time_s: number;
  data: MoveGroupCommand;
}

export interface BattleConfig {
  deploymentDuration_s: number;
  initialHumans: number;
  /** Relative weights used to compose the initial human squad. */
  initialHumanTypeWeights?: Partial<Record<HumanUnitType, number>>;
}

export interface BattleSnapshot {
  time_s: number;
  aliveHumans: number;
  aliveZombies: number;
  spawnedZombies: number;
  waveIndex: number;
  breachedRoutes: string[];
  result: BattleResult;
  stats: CombatStatsSnapshot;
  generationComplete: boolean;
}

export interface CombatStat {
  unitType: HumanUnitType;
  spawned: number;
  aliveAtEnd: number;
  kills: number;
  damage: number;
}

export interface CombatStatsSnapshot {
  byUnitType: Record<HumanUnitType, CombatStat>;
}

export type DamageKind = 'bullet' | 'sniper' | 'flame' | 'melee' | 'machine_gun' | 'explosion';

export type BattleEvent =
  | GroupCommandEvent
  | TimedEvent<'wave_spawn', WaveSpawnEventData>
  | TimedEvent<'zombie_batch_spawn', ZombieBatchSpawnEventData>
  | TimedEvent<'projectile_spawned', ProjectileEventData>
  | TimedEvent<'projectile_hit', ProjectileImpactData>
  | TimedEvent<'projectile_blocked', ProjectileBlockedData>
  | TimedEvent<'projectile_expired', { projectileId: string }>
  | TimedEvent<'damage', DamageEventData>
  | TimedEvent<'door_damaged', { id: string; hp: number; maxHp: number; destroyed: boolean; sourceId: string; amount: number }>
  | TimedEvent<'door_destroyed', { doorId: string; sourceId: string }>
  | TimedEvent<'unit_died', { unitId: string; faction: Unit['faction']; killerId: string | null; killerUnitType: UnitType | null; damageKind: DamageKind | null }>
  | TimedEvent<'unit_state_changed', { unitId: string; from: UnitState; to: UnitState }>
  | TimedEvent<'route_breached', { routeId: string; unitId: string }>
  | TimedEvent<'wall_climb_started', { wallId: string; stackCount: number; requiredStack: number; unitIds: string[] }>
  | TimedEvent<'wall_climbed', { unitId: string; wallId: string | null }>
  | TimedEvent<'unit_infected', { sourceId: string; humanId: string; zombieId: string }>
  | TimedEvent<'weapon_state_changed', { unitId: string; from: UnitState; to: UnitState; heat: number }>
  | TimedEvent<'generation_complete', { generated: number; target: number }>
  | TimedEvent<'gut_swallowed', { gutId: string; zombieId: string }>
  | TimedEvent<'gut_thrown', { gutId: string; zombieId: string; targetPosition: Point }>
  | TimedEvent<'gut_released', { gutId: string; zombieIds: string[] }>
  | TimedEvent<'zombie_exploded', { zombieId: string; sourceGutId: string; position: Point }>
  | TimedEvent<string, unknown>
  | TimedEvent<'running' | 'win' | 'lose', { result: BattleResult }>;

export interface TimedEvent<T extends string, D> { type: T; time_s: number; data: D }
export interface WaveSpawn { unitType: ZombieUnitType; route: string; count: number; spawnPoint?: string }
export interface WaveSpawnEventData {
  waveIndex: number; battleTime_s: number; batchSize: number; batchInterval_s: number; spawns: WaveSpawn[];
}
export interface ZombieBatchSpawnEventData { waveIndex: number; batchIndex: number; batchSize: number; spawns: WaveSpawn[] }
export interface ProjectileEventData {
  id: string;
  sourceId: string;
  targetId: string;
  origin: Point;
  destination: Point;
  position: Point;
  damage: number;
  /** Visual and simulation identity of the projectile. */
  projectileKind: 'bullet' | 'flame';
  /** Zero means a single-target hit; positive values are splash radii. */
  splashRadius_px: number;
  speed_px_per_s: number;
  max_flight_time_s: number;
  continuous_duration_s?: number;
  damage_tick_interval_s?: number;
  damage_elapsed_s?: number;
  spawnedAt_s: number;
  elapsed_s: number;
}
export interface ProjectileImpactData { projectileId: string; targetId: string; position: Point }
export interface ProjectileBlockedData { projectileId: string; wallId: string; position: Point }
export interface DamageEventData {
  sourceId: string;
  targetId: string;
  amount: number;
  appliedAmount: number;
  hp: number;
  damageKind: DamageKind;
}
