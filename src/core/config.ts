import type { BattleConfig } from './types.js';

/** Hard cap for the human squad in every mode and scene. */
export const MAX_HUMANS = 9;

export const DEFAULT_BATTLE_CONFIG: BattleConfig = {
  deploymentDuration_s: 3,
  initialHumans: 9,
  initialHumanTypeWeights: { rifleman: 4, flamethrower: 2, shield: 1, sniper: 1, engineer: 1 },
};
