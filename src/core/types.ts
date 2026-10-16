export type BattleResult = 'running' | 'win' | 'lose';

export interface Point { x: number; y: number }
export type UnitType = 'rifleman' | 'normal_zombie';
export type UnitState = 'Idle' | 'Moving' | 'Aiming' | 'Firing' |
  'Advancing' | 'Breached' | 'Attacking' | 'Dead';

export interface Unit {
  id: string;
  unitType: UnitType;
  faction: 'human' | 'zombie';
  position: Point;
  velocity: Point;
  hp: number;
  maxHp: number;
  speed_px_per_s: number;
  state: UnitState;
  routeId: string;
  targetId: string | null;
  moveTarget: Point | null;
  attackElapsed_s: number;
  breached: boolean;
  active: boolean;
}

export interface MoveGroupCommand {
  unitIds: string[];
  target: Point;
  issuedAt_s: number;
}

export interface GroupCommandEvent extends BattleEvent {
  type: 'group_command';
  data: MoveGroupCommand;
}

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
