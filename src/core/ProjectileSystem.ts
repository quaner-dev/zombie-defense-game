import { cloneData } from './cloneData.js';
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
    // This public helper remains a one-shot fixture primitive. Runtime combat
    // owns anchored flame cones directly, without travelling flame projectiles.
    return this.combat.createProjectile(source, target, time_s, false);
  }

  public getProjectiles(): Projectile[] {
    return cloneData(Array.from(this.projectiles.values()));
  }

  /** A terminal battle cancels in-flight shots without applying later damage. */
  public expireAll(time_s: number): BattleEvent[] {
    const events = Array.from(this.projectiles.keys(), projectileId => ({
      type: 'projectile_expired', time_s, data: { projectileId },
    }));
    this.projectiles.clear();
    return events;
  }

  public update(seconds: number, time_s: number): BattleEvent[] {
    if (!Number.isFinite(seconds) || seconds < 0) return [];
    for (const shot of this.combat.drainShots()) this.projectiles.set(shot.id, shot);
    const events: BattleEvent[] = [];
    for (const shot of Array.from(this.projectiles.values())) {
      const previous = { ...shot.position }, previousElapsed = shot.elapsed_s;
      const distance = Math.hypot(shot.destination.x - shot.origin.x, shot.destination.y - shot.origin.y);
      const flightDuration = Math.min(distance / shot.speed_px_per_s, shot.max_flight_time_s);
      const duration = shot.continuous_duration_s === undefined ? flightDuration :
        Math.max(flightDuration, shot.continuous_duration_s);
      // Respect launch time and stop at arrival/lifetime even for oversized updates.
      shot.elapsed_s = Math.min(duration, shot.elapsed_s + Math.min(seconds,
        Math.max(0, time_s - shot.spawnedAt_s - shot.elapsed_s)));
      const fraction = distance === 0 ? 1 : Math.min(1,
        Math.min(shot.elapsed_s, flightDuration) * shot.speed_px_per_s / distance);
      shot.position = {
        x: shot.origin.x + (shot.destination.x - shot.origin.x) * fraction,
        y: shot.origin.y + (shot.destination.y - shot.origin.y) * fraction,
      };
      // Sweep the entire step so even a thin wall or a large update stops the
      // bullet at its first contact, before any target damage is considered.
      const wall = shot.continuous_duration_s === undefined || shot.elapsed_s <= flightDuration + 1e-9
        ? this.map.firstBlockingTerrain(previous, shot.position, 0, true) : null;
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
      const target = this.store.get(shot.targetId);
      const impactUntil = shot.continuous_duration_s === undefined ? duration : shot.elapsed_s;
      const tick = shot.damage_tick_interval_s ?? duration;
      const applyFlameTick = (at: number): void => {
        if (shot.splashRadius_px <= 0) return;
        // A spray burns the widening path it traveled, independently of the
        // original target surviving or moving away before the flame arrives.
        const dx = shot.position.x - shot.origin.x, dy = shot.position.y - shot.origin.y;
        const length = Math.hypot(dx, dy);
        const impacted = this.store.living().filter(candidate => candidate.faction === 'zombie' &&
          (shot.projectileKind === 'flame' ? (() => {
            const x = candidate.position.x - shot.origin.x, y = candidate.position.y - shot.origin.y;
            if (length < 1e-9) return Math.hypot(x, y) <= shot.splashRadius_px;
            const along = (x * dx + y * dy) / length;
            const fraction = Math.max(0, Math.min(1, along / length));
            return along >= 0 && Math.hypot(x - dx * fraction, y - dy * fraction) <= shot.splashRadius_px * fraction;
          })() : Math.hypot(candidate.position.x - shot.position.x, candidate.position.y - shot.position.y) <= shot.splashRadius_px) &&
          !this.map.firstBlockingTerrain(shot.origin, candidate.position, 0, true) &&
          !this.map.firstBlockingTerrain(shot.position, candidate.position, 0, true));
        for (const candidate of impacted) {
          events.push(...this.combat.applyDamage(candidate.id, shot.damage, shot.sourceId, at, 'flame', shot.origin));
        }
      };
      if (shot.continuous_duration_s !== undefined) {
        while (shot.damage_elapsed_s + tick <= impactUntil + 1e-9) {
          shot.damage_elapsed_s += tick;
          applyFlameTick(shot.spawnedAt_s + shot.damage_elapsed_s);
        }
      } else if (shot.elapsed_s + 1e-9 >= duration) {
        const terminalTime_s = shot.spawnedAt_s + duration;
        events.push({ type: 'projectile_hit', time_s: terminalTime_s,
          data: { projectileId: shot.id, targetId: shot.targetId, position: { ...shot.position } } });
        // A target that moved behind cover during flight cannot receive a remote
        // hit through a wall when the projectile reaches its captured destination.
        if (shot.splashRadius_px > 0) applyFlameTick(terminalTime_s);
        else if (shot.projectileKind === 'sniper') {
          const dx = shot.destination.x - shot.origin.x, dy = shot.destination.y - shot.origin.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          const maxTargets = shot.penetrationCount ?? 3;
          const hitTargets = this.store.living().filter(candidate => candidate.faction === 'zombie' &&
            !this.map.firstBlockingTerrain(shot.origin, candidate.position, 0, true) &&
            Math.abs((candidate.position.x - shot.origin.x) * dy - (candidate.position.y - shot.origin.y) * dx) / length <= Math.max(10, candidate.radius_px) &&
            ((candidate.position.x - shot.origin.x) * dx + (candidate.position.y - shot.origin.y) * dy) >= 0 &&
            ((candidate.position.x - shot.origin.x) * dx + (candidate.position.y - shot.origin.y) * dy) <= length * length)
            .sort((a, b) => Math.hypot(a.position.x - shot.origin.x, a.position.y - shot.origin.y) - Math.hypot(b.position.x - shot.origin.x, b.position.y - shot.origin.y) || (a.id < b.id ? -1 : 1))
            .slice(0, maxTargets);
          const multiplier = shot.penetrationDamageMultiplier ?? 0.8;
          hitTargets.forEach((candidate, index) => {
            events.push(...this.combat.applyDamage(candidate.id, shot.damage * Math.pow(multiplier, index), shot.sourceId, terminalTime_s, 'sniper', shot.origin));
          });
        }
        else if (target && !this.map.firstBlockingTerrain(shot.origin, target.position, 0, true) &&
            !this.map.firstBlockingTerrain(shot.position, target.position, 0, true)) {
          events.push(...this.combat.applyDamage(shot.targetId, shot.damage, shot.sourceId, terminalTime_s, shot.projectileKind === 'machine_gun' ? 'machine_gun' : 'bullet', shot.origin));
        }
      }
      if (shot.elapsed_s + 1e-9 >= duration) {
        const terminalTime_s = shot.spawnedAt_s + duration;
        if (shot.continuous_duration_s !== undefined) events.push({ type: 'projectile_hit', time_s: terminalTime_s,
          data: { projectileId: shot.id, targetId: shot.targetId, position: { ...shot.position } } });
        events.push({ type: 'projectile_expired', time_s: terminalTime_s, data: { projectileId: shot.id } });
        this.projectiles.delete(shot.id);
      }
    }
    return events;
  }
}
