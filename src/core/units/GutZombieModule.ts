import type { ZombieModule } from './UnitModule.js';
import { meleeAttack, readUnitStats } from './UnitModule.js';

export const gutZombieModule: ZombieModule = {
  unitType: 'gut_zombie',
  faction: 'zombie',
  initialState: 'Advancing',
  getStats: () => readUnitStats('gut_zombie'),
  getAttackProfile: () => null,
  getMeleeAttackProfile: () => meleeAttack(readUnitStats('gut_zombie')),
};
