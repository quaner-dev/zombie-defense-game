export { BattleSession } from './BattleSession.js';
export { SCENES } from '../scenes/index.js';
export type { SceneDefinition } from '../scenes/types.js';
export type { Unit, HumanUnitType, Point, BattleSnapshot, BattleEvent, CivilianEntity } from '../core/types.js';
export type { MapModel } from '../core/MapModel.js';
export { default as mapConfig } from '../../config/map.json' with { type: 'json' };
export { default as unitConfig } from '../../config/units.json' with { type: 'json' };
