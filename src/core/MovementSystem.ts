import unitConfig from '../../config/units.json' with { type: 'json' };
import type { MapModel } from './MapModel.js';
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, Point, Unit } from './types.js';

export class MovementSystem {
  public constructor(private readonly store: UnitStore, private readonly map?: MapModel) {}

  public update(seconds: number, time_s: number): BattleEvent[] {
    const events: BattleEvent[] = [];
    if (!Number.isFinite(seconds) || seconds < 0) return events;
    const humans = this.store.living().filter(unit => unit.faction === 'human');
    const starts = new Map(humans.map(unit => [unit.id, { ...unit.position }]));
    const tolerance = unitConfig.movement.arrival_tolerance_px;
    for (const unit of this.store.living()) {
      if (unit.state !== 'Moving' || !unit.moveTarget || unit.state === 'Dismantling' || unit.state === 'Deploying' || unit.state === 'Deployed' || unit.state === 'RetractingFlame' || unit.state === 'ReleasingFlame' || unit.state === 'Overheated' || unit.state === 'Cooling') continue;
      const remaining = Math.hypot(unit.moveTarget.x - unit.position.x, unit.moveTarget.y - unit.position.y);
      const radius = unit.radius_px ?? 7;
      const waypoint = this.map ? this.map.nextWaypoint(unit.position, unit.moveTarget, radius) : unit.moveTarget;
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
      // Combat may have acquired a target during this frame. Keep that lock
      // while the soldier advances so moving fire and its visual feedback stay
      // available; CombatSystem clears it when the target leaves range.
      if (distance > 0 && step > 0) {
        const destination = { x: unit.position.x + dx / distance * step,
          y: unit.position.y + dy / distance * step };
        const wall = this.map?.firstBlockingTerrain(unit.position, destination, radius);
        if (wall) {
          unit.position = wall.point;
          unit.state = 'Idle';
          unit.moveTarget = null;
          unit.velocity = { x: 0, y: 0 };
          unit.targetId = null;
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
    if (seconds > 0) this.separateSoldiers(humans, starts);
    return events;
  }

  /** Moving soldiers push resting neighbours; constrained neighbours push back. */
  private separateSoldiers(humans: Unit[], starts: Map<string, Point>): void {
    const advancing = new Set(humans.filter(unit => {
      const start = starts.get(unit.id)!;
      return Math.hypot(unit.position.x - start.x, unit.position.y - start.y) > 1e-6;
    }).map(unit => unit.id));
    // Revisit contacts so a push can travel through the whole seven-person squad.
    for (let pass = 0; pass < 512; pass++) {
      let largestOverlap = 0;
      for (let i = 0; i < humans.length; i++) for (let j = i + 1; j < humans.length; j++) {
        const a = humans[i], b = humans[j];
        const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
        const distance = Math.hypot(dx, dy);
        const overlap = a.radius_px + b.radius_px + 2 - distance;
        if (overlap <= 1e-5) continue;
        largestOverlap = Math.max(largestOverlap, overlap);
        // Exact coincidence uses the previous contact direction, then a stable fallback.
        const oldA = starts.get(a.id)!, oldB = starts.get(b.id)!;
        const axis = distance > 1e-6 ? { x: dx / distance, y: dy / distance }
          : this.contactAxis(oldB.x - oldA.x, oldB.y - oldA.y);
        const shareA = advancing.has(a.id) === advancing.has(b.id) ? .5 : advancing.has(a.id) ? 0 : 1;
        const movedA = this.pushSoldier(a, -axis.x, -axis.y, overlap * shareA);
        const movedB = this.pushSoldier(b, axis.x, axis.y, overlap - movedA);
        // At a wall or edge, give the unused displacement back to the pusher.
        this.pushSoldier(a, -axis.x, -axis.y, Math.max(0, overlap - movedA - movedB));
      }
      if (largestOverlap <= 1e-5) break;
    }
  }

  private contactAxis(dx: number, dy: number): Point {
    const distance = Math.hypot(dx, dy);
    return distance > 1e-6 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
  }

  /** Sweep each correction to avoid pushing a soldier through terrain. */
  private pushSoldier(unit: Unit, dx: number, dy: number, distance: number): number {
    if (distance <= 0) return 0;
    const start = unit.position;
    let target = { x: start.x + dx * distance, y: start.y + dy * distance };
    if (this.map) {
      const bounds = this.map.battle_bounds, radius = unit.radius_px;
      target = { x: Math.max(bounds.left + radius, Math.min(bounds.right - radius, target.x)),
        y: Math.max(bounds.top + radius, Math.min(bounds.bottom - radius, target.y)) };
      const hit = this.map.firstBlockingTerrain(start, target, radius);
      if (hit) {
        const fraction = Math.max(0, hit.fraction - 1e-5);
        target = { x: start.x + (target.x - start.x) * fraction,
          y: start.y + (target.y - start.y) * fraction };
      }
    }
    unit.position = target;
    return Math.max(0, (target.x - start.x) * dx + (target.y - start.y) * dy);
  }
}
