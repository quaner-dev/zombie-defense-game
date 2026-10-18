import type { ZombieModule } from './UnitModule.js';
import { meleeAttack, readUnitStats } from './UnitModule.js';

export const zombieMotherModule: ZombieModule = {
  unitType: 'zombie_mother', faction: 'zombie', initialState: 'Advancing',
  getStats: () => readUnitStats('zombie_mother'),
  getAttackProfile: () => null,
  getMeleeAttackProfile: () => {
    const stats = readUnitStats('zombie_mother');
    return meleeAttack(stats, stats.infectsSoldiers ?? false);
  },
};
