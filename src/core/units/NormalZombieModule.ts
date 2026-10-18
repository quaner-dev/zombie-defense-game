import type { ZombieModule } from './UnitModule.js';
import { meleeAttack, readUnitStats } from './UnitModule.js';

export const normalZombieModule: ZombieModule = {
  unitType: 'normal_zombie', faction: 'zombie', initialState: 'Advancing',
  getStats: () => readUnitStats('normal_zombie'),
  getAttackProfile: () => null,
  getMeleeAttackProfile: () => meleeAttack(readUnitStats('normal_zombie')),
};
