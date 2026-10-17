import unitConfig from '../../config/units.json' with { type: 'json' };
import type { MapModel } from './MapModel.js';
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent } from './types.js';

export class MovementSystem {
  public constructor(private readonly store: UnitStore, private readonly map?: MapModel) {}

  public update(seconds: number, time_s: number): BattleEvent[] {
    const events: BattleEvent[] = [];
    if (!Number.isFinite(seconds) || seconds < 0) return events;
    const tolerance = unitConfig.movement.arrival_tolerance_px;
    for (const unit of this.store.living()) {
      if (unit.state !== 'Moving' || !unit.moveTarget) continue;
      const remaining = Math.hypot(unit.moveTarget.x - unit.position.x, unit.moveTarget.y - unit.position.y);
      const waypoint = this.map ? this.map.nextWaypoint(unit.position, unit.moveTarget, 7) : unit.moveTarget;
      if (!waypoint) {
        unit.state = 'Idle';unit.moveTarget = null;unit.velocity = { x: 0, y: 0 };unit.targetId = null;
        events.push({ type: 'unit_state_changed', time_s,
          data: { unitId: unit.id, from: 'Moving', to: 'Idle' } });
        continue;
      }
      const dx = waypoint.x - unit.position.x;
      const dy = waypoint.y - unit.position.y;
      const distance = Math.hypot(dx, dy);
      const step = remaining <= tolerance ? 0 : Math.min(distance, seconds * unit.speed_px_per_s);
      unit.targetId = null;
      if (distance > 0 && step > 0) {
        const destination = { x: unit.position.x + dx / distance * step,
          y: unit.position.y + dy / distance * step };
        const wall = this.map?.firstBlockingTerrain(unit.position, destination, 7);
        if (wall) {
          unit.position = wall.point;
          unit.state = 'Idle';
          unit.moveTarget = null;
          unit.velocity = { x: 0, y: 0 };
          events.push({ type: 'unit_state_changed', time_s,
            data: { unitId: unit.id, from: 'Moving', to: 'Idle' } });
          continue;
        }
        unit.position = destination;
        unit.velocity = { x: dx / distance * unit.speed_px_per_s,
          y: dy / distance * unit.speed_px_per_s };
      }
      if (Math.hypot(unit.moveTarget.x - unit.position.x, unit.moveTarget.y - unit.position.y) <= tolerance) {
        unit.state = 'Idle';
        unit.moveTarget = null;
        unit.velocity = { x: 0, y: 0 };
        events.push({ type: 'unit_state_changed', time_s,
          data: { unitId: unit.id, from: 'Moving', to: 'Idle' } });
      }
    }
    return events;
  }
}
