import type { BattleConfig } from './types.js';

/** Hard cap for the human squad in every mode and scene. */
export const MAX_HUMANS = 15;

export const DEFAULT_BATTLE_CONFIG: BattleConfig = {
  deploymentDuration_s: 3,
  initialHumans: 15,
  initialHumanTypeWeights: { rifleman: 3, flamethrower: 1, shield: 1 },
};
