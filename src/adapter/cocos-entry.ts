export { BattleSession } from './BattleSession.js';
export type { Unit, Point, BattleSnapshot, BattleEvent } from '../core/types.js';
export type { MapModel } from '../core/MapModel.js';
export { default as mapConfig } from '../../config/map.json' with { type: 'json' };
export { default as unitConfig } from '../../config/units.json' with { type: 'json' };
