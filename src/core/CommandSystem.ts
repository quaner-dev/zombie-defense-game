import unitConfig from '../../config/units.json' with { type: 'json' };
import type { SquadSystem } from './SquadSystem.js';
import type { MapModel } from './MapModel.js';
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, GroupCommandEvent, Point } from './types.js';

/** Deterministic irregular deployment, without rows or shared destinations. */
export function formationPositions(count: number, target: Point, map: MapModel,
  spacing = unitConfig.movement.formation_spacing_px): Point[] {
  const points = Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963229728653 + Math.sin(index * 7.13) * .12;
    const radius = Math.sqrt(index) * spacing * .68;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return translatedPositions(points, target, map);
}

/** Center a placement layout at the target while keeping all its points in bounds. */
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
    private readonly emit: (event: BattleEvent) => void = () => {},
    private readonly squads?: SquadSystem) {}

  public issueMoveAt(x: number, y: number, targetX: number, targetY: number,
    time_s: number): GroupCommandEvent | null {
    if (![x, y, targetX, targetY, time_s].every(Number.isFinite)) return null;
    // A tap controls one soldier. Choose the closest living human inside the
    // touch tolerance so a dense formation can still be micro-managed without
    // accidentally redirecting the whole squad.
    const selected = this.store.living()
      .filter(unit => unit.faction === 'human' &&
        Math.hypot(unit.position.x - x, unit.position.y - y) <= this.map.unit_selection_radius)
      .sort((a, b) => Math.hypot(a.position.x - x, a.position.y - y) -
        Math.hypot(b.position.x - x, b.position.y - y) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return this.issueMoveGroup(selected.length ? [selected[0].id] : [], targetX, targetY, time_s);
  }

  /** Only unique living human soldiers from the captured selection may receive a replacement. */
  public issueMoveGroup(unitIds: readonly string[], targetX: number, targetY: number,
    time_s: number): GroupCommandEvent | null {
    if (![targetX, targetY, time_s].every(Number.isFinite)) return null;
    const ids = new Set(unitIds);
    const selected = this.store.living().filter(unit => unit.faction === 'human' && ids.has(unit.id));
    // A captured single survivor remains controllable after the rest of the selection dies.
    if (selected.length < 1) return null;
    const { left, top, right, bottom } = this.map.battle_bounds;
    const target = {
      x: Math.max(left, Math.min(right, targetX)),
      y: Math.max(top, Math.min(bottom, targetY)),
    };
    const positions = translatedPositions(selected.map(unit => unit.position), target, this.map)
      .map((point, index) => this.map.walkablePoint(point, selected[index].radius_px ?? 7));
    this.squads?.command(selected);
    selected.forEach((unit, i) => {
      // Replacing a command during a transition changes only its destination.
      if ((unit.unitType === 'engineer' && unit.state === 'Dismantling') ||
          (unit.unitType === 'flamethrower' && unit.state === 'RetractingFlame')) {
        unit.moveTarget = positions[i]; return;
      }
      if (unit.unitType === 'engineer' && (unit.state === 'Deploying' || unit.state === 'Deployed' || unit.state === 'Cooling' || unit.state === 'Overheated')) {
        const from = unit.state;
        unit.moveTarget = positions[i];
        unit.state = 'Dismantling'; unit.stateElapsed_s = 0; unit.targetId = null;
        unit.attackElapsed_s = 0; unit.velocity = { x: 0, y: 0 };
        this.emit({ type: 'unit_state_changed', time_s,
          data: { unitId: unit.id, from, to: 'Dismantling' } });
        return;
      }
      if (unit.unitType === 'flamethrower' && (unit.state === 'Firing' || unit.state === 'Aiming' || unit.state === 'ReleasingFlame')) {
        const from = unit.state;
        unit.state = 'RetractingFlame'; unit.stateElapsed_s = 0; unit.targetId = null;
        unit.moveTarget = positions[i]; unit.attackElapsed_s = 0; unit.velocity = { x: 0, y: 0 };
        this.emit({ type: 'unit_state_changed', time_s,
          data: { unitId: unit.id, from, to: 'RetractingFlame' } });
        return;
      }
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

  public toggleEngineerDeployment(unitId: string): boolean {
    const unit = this.store.get(unitId);
    if (!unit || unit.faction !== 'human' || unit.unitType !== 'engineer' || !unit.active) return false;
    if (unit.state === 'Idle' || unit.state === 'Moving') {
      unit.state = 'Deploying'; unit.stateElapsed_s = 0; unit.moveTarget = null; unit.targetId = null; return true;
    }
    if (unit.state === 'Deployed' || unit.state === 'Cooling') {
      unit.state = 'Dismantling'; unit.stateElapsed_s = 0; unit.targetId = null; return true;
    }
    return false;
  }
}
