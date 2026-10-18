import type { HumanModule } from './UnitModule.js';
import { rangedAttack, readUnitStats } from './UnitModule.js';
export const flamethrowerModule: HumanModule = { unitType: 'flamethrower', faction: 'human', initialState: 'Idle',
  getStats: () => readUnitStats('flamethrower'), getAttackProfile: () => {
    const stats = readUnitStats('flamethrower'); return rangedAttack(stats, 'flame', stats.area_radius_px ?? 0);
  } };
