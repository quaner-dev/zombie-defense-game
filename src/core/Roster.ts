import { MAX_HUMANS } from './config.js';
import { HUMAN_UNIT_TYPES } from './units/index.js';
import { formationPositions } from './CommandSystem.js';
import type { HumanUnitType, Point } from './types.js';
import type { MapModel } from './MapModel.js';
import type { SceneDefinition } from '../scenes/types.js';

export type SoldierRoster = Record<HumanUnitType, number>;
export const SOLDIER_NAMES: Record<HumanUnitType, string> = {
  rifleman: '步枪兵', flamethrower: '喷火兵', shield: '盾兵', sniper: '狙击兵', engineer: '工兵',
};
export function rosterTypes(roster: SoldierRoster): HumanUnitType[] {
  if (!roster || Object.keys(roster).some(key => !HUMAN_UNIT_TYPES.includes(key as HumanUnitType)))
    throw new Error('Unknown soldier type');
  const types: HumanUnitType[] = [];
  for (const type of HUMAN_UNIT_TYPES) {
    const count = roster[type];
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_HUMANS) throw new Error('Invalid soldier count');
    for (let i = 0; i < count; i++) types.push(type);
  }
  if (types.length < 1 || types.length > MAX_HUMANS) throw new Error(`Choose 1–${MAX_HUMANS} soldiers`);
  return types;
}
export function defaultRoster(scene: SceneDefinition): SoldierRoster {
  return scene.scenarioKind === 'villa_rescue'
    ? { rifleman: 4, flamethrower: 2, shield: 1, sniper: 0, engineer: 0 }
    : { rifleman: 4, flamethrower: 2, shield: 1, sniper: 1, engineer: 1 };
}

/** Used by both the selection preview and the actual deployment. */
export function soldierPositions(scene: SceneDefinition | undefined, map: MapModel, count: number, defend: Point): Point[] {
  if (scene?.scenarioKind !== 'villa_rescue') return formationPositions(count, defend, map, 60);
  const candidates = scene.level.soldierPositions ?? [];
  const positions: Point[] = [];
  for (const candidate of candidates) {
    const point = map.walkablePoint(candidate, 19);
    if (positions.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 50) ||
        scene.level.civilians?.some(c => Math.hypot(c.position.x - point.x, c.position.y - point.y) < 55)) continue;
    positions.push(point);
    if (positions.length === count) break;
  }
  if (positions.length !== count) throw new Error('Not enough safe deployment positions');
  return positions;
}
