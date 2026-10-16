import unitConfig from '../../config/units.json' with { type: 'json' };
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent } from './types.js';

export class MovementSystem {
  public constructor(private readonly store: UnitStore) {}

  public update(seconds: number, time_s: number): BattleEvent[] {
    const events: BattleEvent[] = [];
    if (!Number.isFinite(seconds) || seconds < 0) return events;
    const tolerance = unitConfig.movement.arrival_tolerance_px;
    for (const unit of this.store.living()) {
      if (unit.state !== 'Moving' || !unit.moveTarget) continue;
      const dx = unit.moveTarget.x - unit.position.x;
      const dy = unit.moveTarget.y - unit.position.y;
      const distance = Math.hypot(dx, dy);
      const step = distance <= tolerance ? 0 : Math.min(distance, seconds * unit.speed_px_per_s);
      unit.targetId = null;
      if (distance > 0 && step > 0) {
        unit.position.x += dx / distance * step;
        unit.position.y += dy / distance * step;
        unit.velocity = { x: dx / distance * unit.speed_px_per_s,
          y: dy / distance * unit.speed_px_per_s };
      }
      if (distance - step <= tolerance) {
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
