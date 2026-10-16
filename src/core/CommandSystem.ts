import mapConfig from '../../config/map.json' with { type: 'json' };
import unitConfig from '../../config/units.json' with { type: 'json' };
import type { MapModel } from './MapModel.js';
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, GroupCommandEvent, Point } from './types.js';

/** Deterministic centered rows; translate the whole formation inside bounds. */
export function formationPositions(count: number, target: Point, map: MapModel): Point[] {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const spacing = unitConfig.movement.formation_spacing_px;
  const { left, top, right, bottom } = map.battle_bounds;
  const width = Math.min((columns - 1) * spacing, right - left);
  const height = Math.min((rows - 1) * spacing, bottom - top);
  const centerX = Math.max(left + width / 2, Math.min(right - width / 2, target.x));
  const centerY = Math.max(top + height / 2, Math.min(bottom - height / 2, target.y));
  return Array.from({ length: count }, (_, i) => ({
    x: centerX - width / 2 + (columns > 1 ? (i % columns) * width / (columns - 1) : 0),
    y: centerY - height / 2 + (rows > 1 ? Math.floor(i / columns) * height / (rows - 1) : 0),
  }));
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
    // Preserve the public group-only rule after deaths/invalid IDs are removed.
    if (selected.length < 2) return null;
    const { left, top, right, bottom } = this.map.battle_bounds;
    const target = {
      x: Math.max(left, Math.min(right, targetX)),
      y: Math.max(top, Math.min(bottom, targetY)),
    };
    const positions = formationPositions(selected.length, target, this.map);
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
