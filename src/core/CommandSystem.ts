import mapConfig from '../../config/map.json' with { type: 'json' };
import unitConfig from '../../config/units.json' with { type: 'json' };
import type { MapModel } from './MapModel.js';
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, GroupCommandEvent, Point } from './types.js';

/** Deterministic irregular deployment, without rows or shared destinations. */
export function formationPositions(count: number, target: Point, map: MapModel): Point[] {
  const spacing = unitConfig.movement.formation_spacing_px;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963229728653 + Math.sin(index * 7.13) * .12;
    const radius = Math.sqrt(index) * spacing * .68;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return translatedPositions(points, target, map);
}

/** Move the captured shape as a whole, including when constrained at an edge. */
export function translatedPositions(points: readonly Point[], target: Point, map: MapModel): Point[] {
  if (!points.length) return [];
  const center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
  const { left, top, right, bottom } = map.battle_bounds;
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const dx = Math.max(left - minX, Math.min(right - maxX, target.x - center.x));
  const dy = Math.max(top - minY, Math.min(bottom - maxY, target.y - center.y));
  return points.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

export class CommandSystem {
  public constructor(private readonly store: UnitStore, private readonly map: MapModel,
    private readonly emit: (event: BattleEvent) => void = () => {}) {}

  public issueMoveAt(x: number, y: number, targetX: number, targetY: number,
    time_s: number): GroupCommandEvent | null {
    if (![x, y, targetX, targetY, time_s].every(Number.isFinite)) return null;
    const selected = this.store.living().filter(unit => unit.unitType === 'rifleman' &&
      Math.hypot(unit.position.x - x, unit.position.y - y) <= mapConfig.unit_selection_radius);
    return this.issueMoveGroup(selected.map(unit => unit.id), targetX, targetY, time_s);
  }

  /** Only unique living riflemen from the captured selection may receive a replacement. */
  public issueMoveGroup(unitIds: readonly string[], targetX: number, targetY: number,
    time_s: number): GroupCommandEvent | null {
    if (![targetX, targetY, time_s].every(Number.isFinite)) return null;
    const ids = new Set(unitIds);
    const selected = this.store.living().filter(unit => unit.unitType === 'rifleman' && ids.has(unit.id));
    // A captured single survivor remains controllable after the rest of the selection dies.
    if (selected.length < 1) return null;
    const { left, top, right, bottom } = this.map.battle_bounds;
    const target = {
      x: Math.max(left, Math.min(right, targetX)),
      y: Math.max(top, Math.min(bottom, targetY)),
    };
    const positions = translatedPositions(selected.map(unit => unit.position), target, this.map);
    selected.forEach((unit, i) => {
      const from = unit.state;
      unit.moveTarget = positions[i];
      unit.targetId = null;
      unit.attackElapsed_s = 0;
      unit.velocity = { x: 0, y: 0 };
      unit.state = 'Moving';
      if (from !== 'Moving') this.emit({ type: 'unit_state_changed', time_s,
        data: { unitId: unit.id, from, to: 'Moving' } });
    });
    return {
      type: 'group_command', time_s,
      data: { unitIds: selected.map(unit => unit.id), target, issuedAt_s: time_s },
    };
  }
}
