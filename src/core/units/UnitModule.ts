import config from '../../../config/units.json' with { type: 'json' };
import type { HumanUnitType, UnitState, UnitType, ZombieUnitType } from '../types.js';

export type ProjectileKind = 'bullet' | 'flame';

export interface UnitStats {
  hitPoints: number;
  speed_px_per_s: number;
  diameter_px: number;
  damagePerHit?: number;
  attack_interval_s?: number;
  attack_range_px?: number;
  area_radius_px?: number;
  projectile_speed_px_per_s?: number;
  projectile_max_flight_time_s?: number;
  infectsSoldiers?: boolean;
}

export interface AttackProfile {
  damage: number;
  interval_s: number;
  range_px: number;
  projectileKind: ProjectileKind;
  splashRadius_px: number;
  projectileSpeed_px_per_s?: number;
  projectileMaxFlightTime_s?: number;
}

export interface MeleeAttackProfile {
  damage: number;
  interval_s: number;
  range_px: number;
  infectsOnHit: boolean;
}

export interface UnitModule {
  readonly unitType: UnitType;
  readonly faction: 'human' | 'zombie';
  readonly initialState: UnitState;
  getStats(): UnitStats;
  getAttackProfile(): AttackProfile | null;
  getMeleeAttackProfile?(): MeleeAttackProfile;
}

export function readUnitStats(unitType: UnitType): UnitStats {
  return config[unitType as keyof typeof config] as unknown as UnitStats;
}

export function rangedAttack(stats: UnitStats, projectileKind: ProjectileKind, splashRadius_px = 0): AttackProfile {
  if (stats.damagePerHit === undefined || stats.attack_interval_s === undefined || stats.attack_range_px === undefined) {
    throw new Error(`Unit ${projectileKind} is missing ranged attack stats`);
  }
  return { damage: stats.damagePerHit, interval_s: stats.attack_interval_s, range_px: stats.attack_range_px,
    projectileKind, splashRadius_px, projectileSpeed_px_per_s: stats.projectile_speed_px_per_s,
    projectileMaxFlightTime_s: stats.projectile_max_flight_time_s };
}

export function meleeAttack(stats: UnitStats, infectsOnHit = false): MeleeAttackProfile {
  if (stats.damagePerHit === undefined || stats.attack_interval_s === undefined || stats.attack_range_px === undefined) {
    throw new Error('Zombie is missing melee attack stats');
  }
  return { damage: stats.damagePerHit, interval_s: stats.attack_interval_s,
    range_px: stats.attack_range_px, infectsOnHit };
}

export type HumanModule = UnitModule & { readonly unitType: HumanUnitType };
export type ZombieModule = UnitModule & { readonly unitType: ZombieUnitType; getMeleeAttackProfile(): MeleeAttackProfile };
