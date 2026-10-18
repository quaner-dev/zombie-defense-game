import type { UnitModule } from './UnitModule.js';
import { fatZombieModule } from './FatZombieModule.js';
import { normalZombieModule } from './NormalZombieModule.js';
import { zombieMotherModule } from './ZombieMotherModule.js';
import type { UnitType } from '../types.js';

const modules = {
  normal_zombie: normalZombieModule,
  fat_zombie: fatZombieModule,
  zombie_mother: zombieMotherModule,
};

/** Compatibility dispatcher; behavior and stats live in dedicated modules. */
export function enemyModule(unitType: Extract<UnitType, 'normal_zombie' | 'fat_zombie' | 'zombie_mother'>): UnitModule {
  return modules[unitType];
}
