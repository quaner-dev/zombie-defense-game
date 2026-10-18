import type { HumanModule } from './UnitModule.js';
import { rangedAttack, readUnitStats } from './UnitModule.js';
export const riflemanModule: HumanModule = { unitType: 'rifleman', faction: 'human', initialState: 'Idle',
  getStats: () => readUnitStats('rifleman'), getAttackProfile: () => rangedAttack(readUnitStats('rifleman'), 'bullet') };
