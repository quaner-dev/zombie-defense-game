export { BattleSession } from './BattleSession.js';
export { SCENES } from '../scenes/index.js';
export type { SceneDefinition } from '../scenes/types.js';
export type { Unit, HumanUnitType, Point, BattleSnapshot, BattleEvent, CivilianEntity } from '../core/types.js';
export type { MapModel } from '../core/MapModel.js';
export { default as mapConfig } from '../../config/map.json' with { type: 'json' };
export { default as unitConfig } from '../../config/units.json' with { type: 'json' };

export { MAX_HUMANS } from '../core/config.js';
export { SOLDIER_NAMES } from '../core/Roster.js';
export { HUMAN_UNIT_TYPES } from '../core/units/index.js';
export type { SoldierRoster } from '../core/Roster.js';
