import type { HumanUnitType, UnitType, ZombieUnitType } from '../types.js';
import { flamethrowerModule } from './FlamethrowerModule.js';
import { fatZombieModule } from './FatZombieModule.js';
import { normalZombieModule } from './NormalZombieModule.js';
import { riflemanModule } from './RiflemanModule.js';
import { shieldModule } from './ShieldModule.js';
import { zombieMotherModule } from './ZombieMotherModule.js';
import type { HumanModule, UnitModule, ZombieModule } from './UnitModule.js';
export const UNIT_MODULES: Record<UnitType, UnitModule> = {
  rifleman: riflemanModule, flamethrower: flamethrowerModule, shield: shieldModule,
  normal_zombie: normalZombieModule, fat_zombie: fatZombieModule, zombie_mother: zombieMotherModule,
};
export const HUMAN_UNIT_TYPES: readonly HumanUnitType[] = Object.freeze(Object.values(UNIT_MODULES)
  .filter((module): module is HumanModule => module.faction === 'human')
  .map(module => module.unitType));
export function getUnitModule(unitType: UnitType): UnitModule { return UNIT_MODULES[unitType]; }
export function getHumanModule(unitType: HumanUnitType): HumanModule {
  const module = UNIT_MODULES[unitType]; if (module.faction !== 'human') throw new Error(`Unit ${unitType} is not human`); return module as HumanModule;
}
export function getZombieModule(unitType: ZombieUnitType): ZombieModule {
  const module = UNIT_MODULES[unitType];
  if (!module.getMeleeAttackProfile) throw new Error(`Unit ${unitType} has no zombie melee profile`);
  return module as ZombieModule;
}
export type { AttackProfile, HumanModule, MeleeAttackProfile, ProjectileKind, UnitModule, UnitStats, ZombieModule } from './UnitModule.js';
