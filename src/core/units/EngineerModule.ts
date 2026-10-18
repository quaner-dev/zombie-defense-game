import type { HumanModule } from './UnitModule.js';
import { rangedAttack, readUnitStats } from './UnitModule.js';

export const engineerModule: HumanModule = {
  unitType: 'engineer',
  faction: 'human',
  initialState: 'Idle',
  getStats: () => readUnitStats('engineer'),
  getAttackProfile: () => rangedAttack({
    ...readUnitStats('engineer'),
    damagePerHit: readUnitStats('engineer').gun_damage ?? 4,
    attack_interval_s: 1 / (readUnitStats('engineer').gun_rate_per_s ?? 10),
    attack_range_px: readUnitStats('engineer').gun_range_px ?? 300,
  }, 'machine_gun'),
};
