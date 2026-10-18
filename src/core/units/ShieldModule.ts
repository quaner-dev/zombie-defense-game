import type { HumanModule } from './UnitModule.js';
import { rangedAttack, readUnitStats } from './UnitModule.js';
export const shieldModule: HumanModule = { unitType: 'shield', faction: 'human', initialState: 'Idle',
  getStats: () => readUnitStats('shield'), getAttackProfile: () => rangedAttack(readUnitStats('shield'), 'bullet') };
