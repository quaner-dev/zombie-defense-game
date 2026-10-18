import type { ZombieModule } from './UnitModule.js';
import { meleeAttack, readUnitStats } from './UnitModule.js';

export const fatZombieModule: ZombieModule = {
  unitType: 'fat_zombie', faction: 'zombie', initialState: 'Advancing',
  getStats: () => readUnitStats('fat_zombie'),
  getAttackProfile: () => null,
  getMeleeAttackProfile: () => meleeAttack(readUnitStats('fat_zombie')),
};
