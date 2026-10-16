import config from '../../config/units.json' with { type: 'json' };
import type { CombatSystem, Projectile } from './CombatSystem.js';
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, Unit } from './types.js';

/** Visual flight retains launch coordinates, not mutable target references. */
export class ProjectileSystem {
  private readonly projectiles = new Map<string, Projectile>();

  public constructor(_store: UnitStore, private readonly combat: CombatSystem) {}

  public spawn(source: Unit, target: Unit, time_s: number): BattleEvent {
    return this.combat.createProjectile(source, target, time_s);
  }

  public getProjectiles(): Projectile[] {
    return structuredClone([...this.projectiles.values()]);
  }

  public update(seconds: number, time_s: number): BattleEvent[] {
    if (!Number.isFinite(seconds) || seconds < 0) return [];
    for (const shot of this.combat.drainShots()) this.projectiles.set(shot.id, shot);
    const events: BattleEvent[] = [];
    for (const shot of this.projectiles.values()) {
      // A shot launched at this frame's end must not receive a full frame of flight.
      shot.elapsed_s += Math.min(seconds, Math.max(0, time_s - shot.spawnedAt_s - shot.elapsed_s));
      const distance = Math.hypot(shot.destination.x - shot.origin.x, shot.destination.y - shot.origin.y);
      const duration = Math.min(distance / config.projectile.speed_px_per_s,
        config.projectile.max_flight_time_s);
      const fraction = distance === 0 ? 1 : Math.min(1,
        shot.elapsed_s * config.projectile.speed_px_per_s / distance);
      shot.position = {
        x: shot.origin.x + (shot.destination.x - shot.origin.x) * fraction,
        y: shot.origin.y + (shot.destination.y - shot.origin.y) * fraction,
      };
      if (shot.elapsed_s + 1e-9 < duration) continue;
      events.push({ type: 'projectile_hit', time_s,
        data: { projectileId: shot.id, targetId: shot.targetId, position: { ...shot.position } } });
      events.push(...this.combat.applyDamage(shot.targetId, shot.damage, shot.sourceId, time_s));
      events.push({ type: 'projectile_expired', time_s, data: { projectileId: shot.id } });
      this.projectiles.delete(shot.id);
    }
    return events;
  }
}
