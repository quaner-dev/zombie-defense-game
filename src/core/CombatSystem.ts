import { cloneData } from './cloneData.js';
import config from '../../config/units.json' with { type: 'json' };
import type { MapModel } from './MapModel.js';
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, Point, Unit, UnitState } from './types.js';

export interface Projectile {
  id: string;
  sourceId: string;
  targetId: string;
  origin: Point;
  destination: Point;
  position: Point;
  damage: number;
  spawnedAt_s: number;
  elapsed_s: number;
}

/** The sole authority for damage/death; visuals only request validated hits. */
export class CombatSystem {
  private nextProjectileId = 1;
  private shots: Projectile[] = [];

  public constructor(private readonly store: UnitStore, private readonly map: MapModel) {}

  public createProjectile(source: Unit, target: Unit, time_s: number): BattleEvent {
    const shot: Projectile = {
      id: `projectile-${this.nextProjectileId++}`, sourceId: source.id, targetId: target.id,
      origin: { ...source.position }, destination: { ...target.position },
      position: { ...source.position }, damage: config.rifleman.damagePerHit,
      spawnedAt_s: time_s, elapsed_s: 0,
    };
    this.shots.push(shot);
    return { type: 'projectile_spawned', time_s, data: cloneData(shot) };
  }

  public drainShots(): Projectile[] {
    const shots = this.shots;
    this.shots = [];
    return shots;
  }

  public applyDamage(targetId: string, amount: number, sourceId: string, time_s: number): BattleEvent[] {
    const target = this.store.get(targetId);
    if (!target || !target.active || target.hp <= 0 || target.state === 'Dead' ||
        !Number.isFinite(amount) || amount <= 0) return [];
    target.hp = Math.max(0, target.hp - amount);
    const events: BattleEvent[] = [{ type: 'damage', time_s,
      data: { sourceId, targetId, amount, hp: target.hp } }];
    if (target.hp === 0 && this.store.kill(targetId)) {
      events.push({ type: 'unit_died', time_s, data: { unitId: targetId, faction: target.faction } });
    }
    return events;
  }

  public update(seconds: number, time_s: number): BattleEvent[] {
    if (!Number.isFinite(seconds) || seconds < 0) return [];
    const dt = Math.min(seconds, 0.05);
    const events: BattleEvent[] = [];
    // Generate attacks before projectile damage and final result evaluation.
    for (const unit of this.store.living()) {
      // Earlier melee attacks may have killed a unit in this living snapshot.
      if (!unit.active || unit.hp <= 0 || unit.state === 'Dead') continue;
      if (unit.unitType === 'rifleman') this.rifle(unit, dt, time_s, events);
      else {
        this.zombie(unit, dt, time_s, events);
        // Crossing is a one-time spatial warning, never a combat phase/gate.
        if (!unit.breached && unit.position.y >= this.map.defense_line_y) {
          unit.breached = true;
          events.push({ type: 'route_breached', time_s, data: { routeId: unit.routeId, unitId: unit.id } });
        }
      }
    }
    return events;
  }

  private nearest(unit: Unit, faction: Unit['faction'], range = Infinity): Unit | undefined {
    return this.store.living().filter(target => target.faction === faction &&
      this.distance(unit, target) <= range).sort((a, b) =>
      this.distance(unit, a) - this.distance(unit, b) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  }

  private distance(a: Unit, b: Unit): number {
    return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
  }

  private state(unit: Unit, to: UnitState, time_s: number, events: BattleEvent[]): void {
    if (unit.state === to) return;
    const from = unit.state;
    unit.state = to;
    events.push({ type: 'unit_state_changed', time_s, data: { unitId: unit.id, from, to } });
  }

  private rifle(unit: Unit, dt: number, time_s: number, events: BattleEvent[]): void {
    if (unit.state === 'Moving') {
      unit.targetId = null;
      unit.attackElapsed_s = 0;
      return;
    }
    const target = this.nearest(unit, 'zombie', config.rifleman.attack_range_px);
    unit.targetId = target?.id ?? null;
    if (!target) {
      unit.attackElapsed_s = 0;
      this.state(unit, 'Idle', time_s, events);
      return;
    }
    this.state(unit, 'Aiming', time_s, events);
    unit.attackElapsed_s += dt;
    if (unit.attackElapsed_s + 1e-9 >= config.rifleman.attack_interval_s) {
      unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - config.rifleman.attack_interval_s);
      this.state(unit, 'Firing', time_s, events);
      events.push(this.createProjectile(unit, target, time_s));
      this.state(unit, 'Aiming', time_s, events);
    }
  }

  private zombie(unit: Unit, dt: number, time_s: number, events: BattleEvent[]): void {
    const target = this.nearest(unit, 'human');
    unit.targetId = target?.id ?? null;
    unit.velocity = { x: 0, y: 0 };
    if (!target) {
      unit.attackElapsed_s = 0;
      this.state(unit, 'Idle', time_s, events);
      return;
    }
    const distance = this.distance(unit, target);
    // Normalize roundoff from diagonal stop-at-range movement, not gameplay range.
    if (distance > config.normal_zombie.attack_range_px + 1e-9) {
      unit.attackElapsed_s = 0;
      this.state(unit, 'Advancing', time_s, events);
      const step = Math.min(distance - config.normal_zombie.attack_range_px, unit.speed_px_per_s * dt);
      const dx = (target.position.x - unit.position.x) / distance;
      const dy = (target.position.y - unit.position.y) / distance;
      unit.position.x += dx * step;
      unit.position.y += dy * step;
      unit.velocity = { x: dx * unit.speed_px_per_s, y: dy * unit.speed_px_per_s };
      return;
    }
    this.state(unit, 'Attacking', time_s, events);
    unit.attackElapsed_s += dt;
    if (unit.attackElapsed_s + 1e-9 >= config.normal_zombie.attack_interval_s) {
      unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - config.normal_zombie.attack_interval_s);
      events.push(...this.applyDamage(target.id, config.normal_zombie.damagePerHit, unit.id, time_s));
    }
  }
}
