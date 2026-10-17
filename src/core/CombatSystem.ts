import { cloneData } from './cloneData.js';
import config from '../../config/units.json' with { type: 'json' };
import type { MapModel, TerrainDefinition, Waypoint } from './MapModel.js';
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
        const side = unit.spawnPointId ? this.map.getSpawnPoint(unit.spawnPointId)?.side ?? null : null;
        if (!unit.breached && this.map.hasCrossedDefense(unit.position, side)) {
          unit.breached = true;
          events.push({ type: 'route_breached', time_s, data: { routeId: unit.routeId, unitId: unit.id } });
        }
      }
    }
    this.separateZombies();
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
    if (unit.climbingWallId && unit.climbTarget) {
      this.climb(unit, dt, time_s, events);
      return;
    }
    const target = this.nearest(unit, 'human');
    unit.targetId = target?.id ?? null;
    unit.velocity = { x: 0, y: 0 };
    if (!target) {
      unit.attackElapsed_s = 0;
      this.state(unit, 'Idle', time_s, events);
      return;
    }
    const distance = this.distance(unit, target);
    const meleeBlocked = this.map.firstBlockingTerrain(unit.position, target.position, 0);
    if (distance <= config.normal_zombie.attack_range_px + 1e-9 && meleeBlocked && !unit.climbingWallId) {
      unit.attackElapsed_s = 0;
      this.state(unit, 'Advancing', time_s, events);
      return;
    }
    // Normalize roundoff from diagonal stop-at-range movement, not gameplay range.
    if (distance > config.normal_zombie.attack_range_px + 1e-9) {
      unit.attackElapsed_s = 0;
      const step = Math.min(distance - config.normal_zombie.attack_range_px, unit.speed_px_per_s * dt);
      const dx = (target.position.x - unit.position.x) / distance;
      const dy = (target.position.y - unit.position.y) / distance;
      const destination = { x: unit.position.x + dx * step, y: unit.position.y + dy * step };
      const hit = this.map.firstBlockingTerrain(unit.position, destination, 8);
      if (hit) {
        const stack = this.wallStack(unit, target, hit.terrain, hit.point);
        const required = hit.terrain.stackRequired ?? Number.POSITIVE_INFINITY;
        if (stack.length >= required) {
          stack.forEach((member, index) => {
            const b = hit.terrain.bounds;
            const vertical = b.bottom - b.top >= b.right - b.left;
            member.climbingWallId = hit.terrain.id;
            member.stackLevel = index % required + 1;
            member.climbTarget = vertical
              ? { x: member.position.x < (b.left + b.right) / 2 ? b.right + 10 : b.left - 10,
                y: Math.max(b.top, Math.min(b.bottom, member.position.y)) }
              : { x: Math.max(b.left, Math.min(b.right, member.position.x)),
                y: member.position.y < (b.top + b.bottom) / 2 ? b.bottom + 10 : b.top - 10 };
            this.state(member, 'Climbing', time_s, events);
          });
          events.push({ type: 'wall_climb_started', time_s, data: {
            wallId: hit.terrain.id, stackCount: stack.length,
            requiredStack: required, unitIds: stack.map(member => member.id),
          } });
          this.climb(unit, dt, time_s, events);
        } else {
          unit.position = hit.point;
          unit.velocity = { x: 0, y: 0 };
          this.state(unit, 'Advancing', time_s, events);
        }
      } else {
        this.move(unit, destination, dx, dy);
        this.state(unit, 'Advancing', time_s, events);
      }
      return;
    }
    this.state(unit, 'Attacking', time_s, events);
    unit.attackElapsed_s += dt;
    if (unit.attackElapsed_s + 1e-9 >= config.normal_zombie.attack_interval_s) {
      unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - config.normal_zombie.attack_interval_s);
      events.push(...this.applyDamage(target.id, config.normal_zombie.damagePerHit, unit.id, time_s));
    }
  }

  private climb(unit: Unit, dt: number, time_s: number, events: BattleEvent[]): void {
    const target = unit.climbTarget!;
    const dx = target.x - unit.position.x, dy = target.y - unit.position.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(distance, unit.speed_px_per_s * dt);
    unit.attackElapsed_s = 0;
    unit.targetId = null;
    unit.velocity = distance > 0
      ? { x: dx / distance * unit.speed_px_per_s, y: dy / distance * unit.speed_px_per_s }
      : { x: 0, y: 0 };
    if (distance > 0) {
      unit.position.x += dx / distance * step;
      unit.position.y += dy / distance * step;
    }
    if (distance - step > 1e-6) return;
    events.push({ type: 'wall_climbed', time_s, data: { unitId: unit.id, wallId: unit.climbingWallId } });
    unit.climbingWallId = null;
    unit.climbTarget = null;
    unit.stackLevel = 0;
    this.state(unit, 'Advancing', time_s, events);
  }

  private move(unit: Unit, destination: Waypoint, dx: number, dy: number): void {
    unit.position.x = destination.x;
    unit.position.y = destination.y;
    unit.velocity = { x: dx * unit.speed_px_per_s, y: dy * unit.speed_px_per_s };
  }

  private wallStack(unit: Unit, target: Unit, wall: TerrainDefinition, contact: Waypoint): Unit[] {
    const bounds = wall.bounds;
    const vertical = bounds.bottom - bounds.top >= bounds.right - bounds.left;
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const side = vertical ? Math.sign(unit.position.x - centerX) : Math.sign(unit.position.y - centerY);
    const targetSide = vertical ? Math.sign(target.position.x - centerX) : Math.sign(target.position.y - centerY);
    if (!side || side === targetSide) return [];
    return this.store.living().filter(candidate => {
      if (candidate.faction !== 'zombie' || candidate.climbingWallId || candidate.id === unit.id) return false;
      const candidateSide = vertical
        ? Math.sign(candidate.position.x - centerX) : Math.sign(candidate.position.y - centerY);
      if (candidateSide !== side) return false;
      const across = vertical
        ? Math.sign(target.position.x - centerX) !== candidateSide
        : Math.sign(target.position.y - centerY) !== candidateSide;
      if (!across) return false;
      const along = vertical
        ? Math.abs(candidate.position.y - contact.y)
        : Math.abs(candidate.position.x - contact.x);
      const edgeDistance = vertical
        ? candidate.position.x < centerX ? bounds.left - candidate.position.x : candidate.position.x - bounds.right
        : candidate.position.y < centerY ? bounds.top - candidate.position.y : candidate.position.y - bounds.bottom;
      return along <= 36 && edgeDistance <= 40;
    }).concat(unit).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  private separateZombies(): void {
    const zombies = this.store.living().filter(unit => unit.faction === 'zombie');
    const minDistance = 17;
    const { left, top, right, bottom } = this.map.battle_bounds;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < zombies.length; i++) {
        const a = zombies[i];
        for (let j = i + 1; j < zombies.length; j++) {
          const b = zombies[j];
          let dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
          let distance = Math.hypot(dx, dy);
          if (distance >= minDistance) continue;
          if (distance < 1e-6) {
            const angle = ((i + 1) * 2.399963229728653 + (j + 1) * 0.7548776662466927) % (Math.PI * 2);
            dx = Math.cos(angle); dy = Math.sin(angle); distance = 1;
          } else { dx /= distance; dy /= distance; }
          const push = (minDistance - distance) * 0.5;
          a.position = this.separatedPosition(a, { x: -dx * push, y: -dy * push }, left, top, right, bottom);
          b.position = this.separatedPosition(b, { x: dx * push, y: dy * push }, left, top, right, bottom);
        }
      }
    }
  }

  private separatedPosition(unit: Unit, offset: Waypoint,
    left: number, top: number, right: number, bottom: number): Waypoint {
    let point = { x: Math.max(left, Math.min(right, unit.position.x + offset.x)),
      y: Math.max(top, Math.min(bottom, unit.position.y + offset.y)) };
    const collision = this.map.terrain.find(terrain => terrain.blocksMovement &&
      this.map.terrainContains(point, terrain, 8));
    if (!collision) return point;
    if (!this.map.terrainContains(unit.position, collision, 8)) return { ...unit.position };
    const vertical = collision.bounds.bottom - collision.bounds.top >= collision.bounds.right - collision.bounds.left;
    point = vertical
      ? { x: unit.position.x, y: Math.max(top, Math.min(bottom, unit.position.y + offset.y)) }
      : { x: Math.max(left, Math.min(right, unit.position.x + offset.x)), y: unit.position.y };
    return point;
  }
}
