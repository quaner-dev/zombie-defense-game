import type { HumanModule } from './UnitModule.js';
import { rangedAttack, readUnitStats } from './UnitModule.js';

export const sniperModule: HumanModule = {
  unitType: 'sniper',
  faction: 'human',
  initialState: 'Idle',
  getStats: () => readUnitStats('sniper'),
  getAttackProfile: () => rangedAttack(readUnitStats('sniper'), 'sniper'),
};
