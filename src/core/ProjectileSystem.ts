import { cloneData } from './cloneData.js';
import config from '../../config/units.json' with { type: 'json' };
import type { CombatSystem, Projectile } from './CombatSystem.js';
import type { MapModel } from './MapModel.js';
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, Unit } from './types.js';

/** Visual flight retains launch coordinates, not mutable target references. */
export class ProjectileSystem {
  private readonly projectiles = new Map<string, Projectile>();

  public constructor(private readonly store: UnitStore, private readonly combat: CombatSystem,
    private readonly map: MapModel) {}

  public spawn(source: Unit, target: Unit, time_s: number): BattleEvent {
    return this.combat.createProjectile(source, target, time_s);
  }

  public getProjectiles(): Projectile[] {
    return cloneData([...this.projectiles.values()]);
  }

  /** A terminal battle cancels in-flight shots without applying later damage. */
  public expireAll(time_s: number): BattleEvent[] {
    const events = [...this.projectiles.keys()].map(projectileId => ({
      type: 'projectile_expired', time_s, data: { projectileId },
    }));
    this.projectiles.clear();
    return events;
  }

  public update(seconds: number, time_s: number): BattleEvent[] {
    if (!Number.isFinite(seconds) || seconds < 0) return [];
    for (const shot of this.combat.drainShots()) this.projectiles.set(shot.id, shot);
    const events: BattleEvent[] = [];
    for (const shot of this.projectiles.values()) {
      const previous = { ...shot.position }, previousElapsed = shot.elapsed_s;
      const distance = Math.hypot(shot.destination.x - shot.origin.x, shot.destination.y - shot.origin.y);
      const duration = Math.min(distance / config.projectile.speed_px_per_s,
        config.projectile.max_flight_time_s);
      // Respect launch time and stop at arrival/lifetime even for oversized updates.
      shot.elapsed_s = Math.min(duration, shot.elapsed_s + Math.min(seconds,
        Math.max(0, time_s - shot.spawnedAt_s - shot.elapsed_s)));
      const fraction = distance === 0 ? 1 : Math.min(1,
        shot.elapsed_s * config.projectile.speed_px_per_s / distance);
      shot.position = {
        x: shot.origin.x + (shot.destination.x - shot.origin.x) * fraction,
        y: shot.origin.y + (shot.destination.y - shot.origin.y) * fraction,
      };
      // Sweep the entire step so even a thin wall or a large update stops the
      // bullet at its first contact, before any target damage is considered.
      const wall = this.map.firstBlockingTerrain(previous, shot.position);
      if (wall) {
        const impactTime_s = shot.spawnedAt_s + previousElapsed +
          (shot.elapsed_s - previousElapsed) * wall.fraction;
        events.push({ type: 'projectile_blocked', time_s: impactTime_s, data: {
          projectileId: shot.id, wallId: wall.terrain.id, position: { ...wall.point },
        } });
        events.push({ type: 'projectile_expired', time_s: impactTime_s, data: { projectileId: shot.id } });
        this.projectiles.delete(shot.id);
        continue;
      }
      if (shot.elapsed_s + 1e-9 < duration) continue;
      const terminalTime_s = shot.spawnedAt_s + duration;
      events.push({ type: 'projectile_hit', time_s: terminalTime_s,
        data: { projectileId: shot.id, targetId: shot.targetId, position: { ...shot.position } } });
      const target = this.store.get(shot.targetId);
      // A target that moved behind cover during flight cannot receive a remote
      // hit through the wall when the bullet reaches its captured destination.
      if (target && !this.map.firstBlockingTerrain(shot.origin, target.position) &&
          !this.map.firstBlockingTerrain(shot.position, target.position)) {
        events.push(...this.combat.applyDamage(shot.targetId, shot.damage, shot.sourceId, terminalTime_s));
      }
      events.push({ type: 'projectile_expired', time_s: terminalTime_s, data: { projectileId: shot.id } });
      this.projectiles.delete(shot.id);
    }
    return events;
  }
}
