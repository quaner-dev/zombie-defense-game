import { cloneData } from './cloneData.js';
import config from '../../config/units.json' with { type: 'json' };
import type { MapModel, TerrainDefinition, Waypoint } from './MapModel.js';
import type { UnitStore } from './UnitStore.js';
import type { BattleEvent, Point, Unit, UnitState, ZombieUnitType } from './types.js';
import { getUnitModule, getZombieModule, type AttackProfile, type ProjectileKind } from './units/index.js';
import type { CombatStats } from './CombatStats.js';
import type { DamageKind } from './types.js';
import type { CivilianStore } from './CivilianStore.js';

export interface Projectile {
  id: string;
  sourceId: string;
  targetId: string;
  origin: Point;
  destination: Point;
  position: Point;
  damage: number;
  splashRadius_px: number;
  projectileKind: ProjectileKind;
  speed_px_per_s: number;
  max_flight_time_s: number;
  /** When set, the flame remains active after reaching its tip and ticks damage. */
  continuous_duration_s?: number;
  damage_tick_interval_s?: number;
  damage_elapsed_s: number;
  spawnedAt_s: number;
  elapsed_s: number;
  penetrationCount?: number;
  penetrationDamageMultiplier?: number;
  hitTargetIds?: string[];
}

/** The sole authority for damage/death; visuals only request validated hits. */
export class CombatSystem {
  private nextProjectileId = 1;
  private shots: Projectile[] = [];
  private frameUnits: Unit[] = [];
  private humans: Unit[] = [];
  private zombies: Unit[] = [];

  public constructor(private readonly store: UnitStore, private readonly map: MapModel,
    private readonly stats?: CombatStats, private readonly civilians?: CivilianStore) {}

  public createProjectile(source: Unit, target: Unit, time_s: number, continuous = true): BattleEvent {
    const profile = getUnitModule(source.unitType).getAttackProfile();
    if (!profile) throw new Error(`Unit ${source.unitType} cannot create a projectile`);
    const shot: Projectile = {
      id: `projectile-${this.nextProjectileId++}`, sourceId: source.id, targetId: target.id,
      origin: { ...source.position }, destination: { ...target.position },
      position: { ...source.position }, damage: profile.damage, splashRadius_px: profile.splashRadius_px,
      projectileKind: profile.projectileKind,
      speed_px_per_s: profile.projectileSpeed_px_per_s ?? config.projectile.speed_px_per_s,
      max_flight_time_s: profile.projectileMaxFlightTime_s ?? config.projectile.max_flight_time_s,
      continuous_duration_s: continuous && profile.projectileKind === 'flame' ? profile.continuousDuration_s : undefined,
      damage_tick_interval_s: continuous && profile.projectileKind === 'flame' ? profile.damageTickInterval_s : undefined,
      damage_elapsed_s: 0,
      spawnedAt_s: time_s, elapsed_s: 0,
      penetrationCount: profile.projectileKind === 'sniper' ? (getUnitModule(source.unitType).getStats().penetration_count ?? 3) : undefined,
      penetrationDamageMultiplier: profile.projectileKind === 'sniper' ? (getUnitModule(source.unitType).getStats().penetration_damage_multiplier ?? 0.8) : undefined,
      hitTargetIds: [],
    };
    this.shots.push(shot);
    return { type: 'projectile_spawned', time_s, data: cloneData(shot) };
  }

  public drainShots(): Projectile[] {
    const shots = this.shots;
    this.shots = [];
    return shots;
  }

  public applyDamage(targetId: string, amount: number, sourceId: string, time_s: number,
    damageKind: DamageKind = 'bullet', sourcePosition?: Point): BattleEvent[] {
    const target = this.store.get(targetId);
    if (!target || !target.active || target.hp <= 0 || target.state === 'Dead' || target.state === 'StoredInGut' ||
        !Number.isFinite(amount) || amount <= 0) return [];
    let adjustedAmount = amount;
    if (target.unitType === 'shield' && sourcePosition && damageKind !== 'flame' && damageKind !== 'explosion') {
      const incomingX = sourcePosition.x - target.position.x;
      const incomingY = sourcePosition.y - target.position.y;
      const incomingLength = Math.hypot(incomingX, incomingY);
      const facingLength = Math.hypot(target.facing.x, target.facing.y);
      if (incomingLength > 1e-6 && facingLength > 1e-6) {
        const cos = (incomingX * target.facing.x + incomingY * target.facing.y) / (incomingLength * facingLength);
        if (cos >= Math.cos(Math.PI / 3)) adjustedAmount *= 0.4;
      }
    }
    const appliedAmount = Math.min(adjustedAmount, target.hp);
    target.hp = Math.max(0, target.hp - appliedAmount);
    const events: BattleEvent[] = [{ type: 'damage', time_s,
      data: { sourceId, targetId, amount, appliedAmount, hp: target.hp, damageKind } }];
    const source = this.store.get(sourceId);
    this.stats?.recordDamage(sourceId, source?.unitType ?? 'rifleman', appliedAmount);
    if (target.unitType === 'gut_zombie' && target.storedGutUnitIds.length && target.weaponCooldown_s <= 0) {
      const thrownId = target.storedGutUnitIds.shift()!;
      const thrown = this.store.get(thrownId);
      if (thrown) {
        thrown.state = 'Suicidal'; thrown.storedInGutById = null; thrown.stateElapsed_s = 0;
        thrown.suicideTriggerId = target.id;
        thrown.position = sourcePosition ? { ...sourcePosition } : { ...target.position };
        target.weaponCooldown_s = 1.2;
        events.push({ type: 'gut_thrown', time_s, data: { gutId: target.id, zombieId: thrown.id,
          targetPosition: { ...thrown.position } } });
      }
    }
    if (target.hp === 0) {
      // Release before kill() clears the gut inventory. Released zombies remain real
      // units and are intentionally not credited as kills.
      if (target.unitType === 'gut_zombie') events.push(...this.releaseGut(target, time_s));
      if (!this.store.kill(targetId)) return events;
      this.stats?.recordKill(sourceId, source?.unitType ?? 'rifleman');
      events.push({ type: 'unit_died', time_s, data: {
        unitId: targetId, faction: target.faction, killerId: sourceId,
        killerUnitType: source?.unitType ?? null, damageKind,
      } });
    }
    return events;
  }

  private releaseGut(gut: Unit, time_s: number): BattleEvent[] {
    const events: BattleEvent[] = [];
    const ids = [...gut.storedGutUnitIds];
    gut.storedGutUnitIds = [];
    for (const [index, id] of ids.entries()) {
      const unit = this.store.get(id);
      if (!unit) continue;
      unit.state = 'Advancing'; unit.storedInGutById = null; unit.hp = unit.maxHp;
      const angle = index * 2.399963229728653;
      unit.position = { x: gut.position.x + Math.cos(angle) * 18, y: gut.position.y + Math.sin(angle) * 18 };
    }
    if (ids.length) events.push({ type: 'gut_released', time_s, data: { gutId: gut.id, zombieIds: ids } });
    return events;
  }

  public update(seconds: number, time_s: number): BattleEvent[] {
    if (!Number.isFinite(seconds) || seconds < 0) return [];
    const dt = Math.min(seconds, 0.05);
    const events: BattleEvent[] = [];
    this.frameUnits = this.store.living();
    this.humans = this.frameUnits.filter(unit => unit.faction === 'human');
    this.zombies = this.frameUnits.filter(unit => unit.faction === 'zombie');
    // Generate attacks before projectile damage and final result evaluation.
    for (const unit of this.frameUnits) {
      // Earlier actions can kill or swallow a unit in this living snapshot.
      if (!unit.active || unit.hp <= 0 || unit.state === 'Dead' || unit.state === 'StoredInGut') continue;
      if (unit.faction === 'human') {
        if (unit.unitType === 'flamethrower') this.updateFlamethrower(unit, dt, time_s, events);
        else if (unit.unitType === 'engineer') this.updateEngineer(unit, dt, time_s, events);
        else this.rangedHuman(unit, dt, time_s, events);
      }
      else {
        if (unit.unitType === 'gut_zombie') this.gutBehavior(unit, dt, time_s, events);
        if (unit.state === 'Suicidal') {
          this.updateSuicidal(unit, dt, time_s, events);
          // An explosion may kill this unit. Never let ordinary zombie AI
          // overwrite Dead with an attack/movement state in the same frame.
          continue;
        }
        if (this.civilians) this.rescueZombie(unit, dt, time_s, events);
        else this.zombie(unit, dt, time_s, events);
        // Crossing is a one-time spatial warning, never a combat phase/gate.
        const side = unit.spawnPointId ? this.map.getSpawnPoint(unit.spawnPointId)?.side ?? null : null;
        if (!unit.breached && this.map.hasCrossedDefense(unit.position, side)) {
          unit.breached = true;
          events.push({ type: 'route_breached', time_s, data: { routeId: unit.routeId, unitId: unit.id } });
        }
      }
    }
    // Zombies are intentionally allowed to overlap as a crowd. Keep wall and
    // map-boundary collision in their navigation, but do not apply an entity
    // separation impulse that turns the horde into a mutually exclusive queue.
    return events;
  }

  private updateSuicidal(unit: Unit, dt: number, time_s: number, events: BattleEvent[]): void {
    unit.stateElapsed_s += dt;
    if (unit.stateElapsed_s < 0.8) return;
    const radius = 72;
    const sourceId = unit.suicideTriggerId ?? unit.id;
    for (const target of this.store.living()) {
      if (target.id === unit.id) continue;
      const distance = Math.hypot(target.position.x - unit.position.x, target.position.y - unit.position.y);
      if (distance > radius) continue;
      const amount = target.faction === 'human' ? 60 : 30;
      events.push(...this.applyDamage(target.id, amount, sourceId, time_s, 'explosion', unit.position));
    }
    this.store.kill(unit.id);
    events.push({ type: 'zombie_exploded', time_s, data: { zombieId: unit.id, sourceGutId: sourceId, position: { ...unit.position } } });
  }

  private updateFlamethrower(unit: Unit, dt: number, time_s: number, events: BattleEvent[]): void {
    const stats = getUnitModule('flamethrower').getStats();
    const range = stats.attack_range_px!;
    const maxHeat = stats.heat_max ?? 100;
    const lock = stats.overheat_lock_s ?? 2;
    const rate = stats.cooling_rate_s ?? 45;
    const threshold = stats.cooling_threshold ?? 25;
    // Recovery is independent of movement/animation. Replacing a move command
    // cannot cancel an overheat lock or reset a waiting progress bar.
    this.coolWeapon(unit, dt, maxHeat, rate, threshold);
    if (unit.state === 'RetractingFlame') {
      unit.stateElapsed_s += dt;
      unit.flameLength_px = Math.max(0, unit.flameLength_px - range * dt / (stats.retract_duration_s ?? .3));
      if (unit.stateElapsed_s + 1e-9 >= (stats.retract_duration_s ?? .3)) {
        unit.flameLength_px = 0;
        this.state(unit, unit.moveTarget ? 'Moving' : 'Idle', time_s, events);
        unit.stateElapsed_s = 0;
      }
      return;
    }
    if (unit.state === 'Moving') { unit.flameLength_px = 0; unit.targetId = null; return; }
    if (unit.weaponCooldown_s > 0) {
      unit.flameLength_px = 0;
      unit.targetId = null;
      this.state(unit, unit.weaponCooldown_s > (maxHeat - threshold) / rate + 1e-9 ? 'Overheated' : 'Cooling', time_s, events);
      return;
    }
    const target = this.humanTarget(unit, getUnitModule('flamethrower').getAttackProfile());
    if (!target) {
      unit.targetId = null; unit.attackElapsed_s = 0;
      this.state(unit, unit.flameLength_px > 0 ? 'RetractingFlame' : 'Idle', time_s, events);
      unit.stateElapsed_s = 0;
      return;
    }
    unit.targetId = target.id;
    unit.facing = { x: target.position.x - unit.position.x, y: target.position.y - unit.position.y };
    if (unit.state !== 'Firing' && unit.state !== 'ReleasingFlame') {
      this.state(unit, 'ReleasingFlame', time_s, events);
      unit.stateElapsed_s = 0; unit.attackElapsed_s = 0; unit.flameLength_px = 0;
      return;
    }
    if (unit.state === 'ReleasingFlame') {
      unit.stateElapsed_s += dt;
      unit.flameLength_px = range * Math.min(1, unit.stateElapsed_s / (stats.release_duration_s ?? .25));
      if (unit.stateElapsed_s + 1e-9 >= (stats.release_duration_s ?? .25)) {
        this.state(unit, 'Firing', time_s, events); unit.stateElapsed_s = 0;
      }
      return;
    }
    unit.flameLength_px = range;
    unit.attackElapsed_s += dt;
    const tick = stats.damage_tick_interval_s ?? .15;
    if (unit.attackElapsed_s + 1e-9 < tick) return;
    unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - tick);
    const length = Math.hypot(unit.facing.x, unit.facing.y);
    const dx = length > 1e-9 ? unit.facing.x / length : 0;
    const dy = length > 1e-9 ? unit.facing.y / length : -1;
    // One anchored cone, one damage application per target per tick. There are
    // no travelling fire shells or overlapping lingering damage projectiles.
    for (const candidate of this.zombies) {
      if (!candidate.active || candidate.hp <= 0 || candidate.state === 'Dead' || candidate.state === 'StoredInGut') continue;
      const x = candidate.position.x - unit.position.x, y = candidate.position.y - unit.position.y;
      const along = x * dx + y * dy;
      const across = Math.abs(x * dy - y * dx);
      if (along < 0 || along > range || across > (stats.area_radius_px ?? 42) * along / range) continue;
      if (this.map.firstBlockingTerrain(unit.position, candidate.position)) continue;
      events.push(...this.applyDamage(candidate.id, stats.damagePerHit!, unit.id, time_s, 'flame', unit.position));
    }
    unit.weaponHeat = Math.min(maxHeat, unit.weaponHeat + (stats.heat_per_tick ?? 8));
    if (unit.weaponHeat >= maxHeat) {
      unit.weaponCooldown_s = lock + (maxHeat - threshold) / rate;
      unit.flameLength_px = 0; unit.stateElapsed_s = 0;
      this.state(unit, 'Overheated', time_s, events);
    }
  }

  private coolWeapon(unit: Unit, dt: number, maxHeat: number, rate: number, threshold: number): void {
    if (unit.weaponCooldown_s <= 0) return;
    const previous = unit.weaponCooldown_s;
    unit.weaponCooldown_s = Math.max(0, previous - dt);
    if (unit.weaponCooldown_s < 1e-9) unit.weaponCooldown_s = 0;
    const coolingDuration = (maxHeat - threshold) / rate;
    const cooledFor = Math.min(previous, coolingDuration) - Math.min(unit.weaponCooldown_s, coolingDuration);
    unit.weaponHeat = unit.weaponCooldown_s === 0 ? threshold : Math.max(threshold, unit.weaponHeat - cooledFor * rate);
  }

  private updateEngineer(unit: Unit, dt: number, time_s: number, events: BattleEvent[]): void {
    const stats = getUnitModule('engineer').getStats();
    this.coolWeapon(unit, dt, stats.gun_heat_max ?? 100, stats.gun_cooling_rate_s ?? 45, stats.gun_cooling_threshold ?? 25);
    if (unit.state === 'Deploying' || unit.state === 'Dismantling') {
      unit.stateElapsed_s += dt;
      const duration = unit.state === 'Deploying' ? (stats.deploy_duration_s ?? 2) : (stats.dismantle_duration_s ?? 1.5);
      if (unit.stateElapsed_s + 1e-9 >= duration) {
        if (unit.state === 'Deploying') unit.state = 'Deployed';
        else unit.state = unit.moveTarget ? 'Moving' : 'Idle';
        unit.stateElapsed_s = 0; unit.targetId = null;
      }
      return;
    }
    if (unit.state === 'Overheated' || unit.state === 'Cooling' || (unit.state === 'Deployed' && unit.weaponCooldown_s > 0)) {
      if (unit.weaponCooldown_s <= 0) {
        this.state(unit, unit.moveTarget ? 'Dismantling' : 'Deployed', time_s, events);
        unit.stateElapsed_s = 0;
      } else {
        const coolingDuration = ((stats.gun_heat_max ?? 100) - (stats.gun_cooling_threshold ?? 25)) / (stats.gun_cooling_rate_s ?? 45);
        this.state(unit, unit.weaponCooldown_s > coolingDuration + 1e-9 ? 'Overheated' : 'Cooling', time_s, events);
      }
      return;
    }
    if (unit.state !== 'Deployed') return;
    const target = this.humanTarget(unit, { damage: stats.gun_damage ?? 4, interval_s: 1 / (stats.gun_rate_per_s ?? 10), range_px: stats.gun_range_px ?? 300, projectileKind: 'machine_gun', splashRadius_px: 0 });
    unit.targetId = target?.id ?? null;
    if (!target) return;
    unit.facing = { x: target.position.x - unit.position.x, y: target.position.y - unit.position.y };
    unit.stateElapsed_s += dt;
    unit.attackElapsed_s += dt;
    if (unit.stateElapsed_s < (stats.target_refresh_s ?? 0.15) && unit.attackElapsed_s < 1 / (stats.gun_rate_per_s ?? 10)) return;
    unit.stateElapsed_s = 0;
    if (unit.attackElapsed_s >= 1 / (stats.gun_rate_per_s ?? 10)) {
      unit.attackElapsed_s = 0;
      events.push(this.createProjectile(unit, target, time_s));
      unit.weaponHeat = Math.min(stats.gun_heat_max ?? 100, unit.weaponHeat + (stats.gun_heat_per_shot ?? 3.3));
      if (unit.weaponHeat >= (stats.gun_heat_max ?? 100)) {
        unit.weaponCooldown_s = (stats.gun_overheat_lock_s ?? 2.5) +
          ((stats.gun_heat_max ?? 100) - (stats.gun_cooling_threshold ?? 25)) / (stats.gun_cooling_rate_s ?? 45);
        this.state(unit, 'Overheated', time_s, events); unit.stateElapsed_s = 0;
      }
    }
  }

  private gutBehavior(unit: Unit, dt: number, time_s: number, events: BattleEvent[]): void {
    if (unit.state === 'StoredInGut' || unit.state === 'Suicidal') return;
    unit.weaponCooldown_s = Math.max(0, unit.weaponCooldown_s - dt);
    const candidates = this.zombies.filter(candidate => candidate.id !== unit.id && candidate.unitType === 'normal_zombie' &&
      candidate.active && candidate.hp > 0 && candidate.state !== 'Dead' && candidate.state !== 'StoredInGut' &&
      candidate.state !== 'Suicidal' && !candidate.climbingWallId && !candidate.storedInGutById &&
      Math.hypot(candidate.position.x - unit.position.x, candidate.position.y - unit.position.y) <= 180)
      .sort((a, b) => this.distance(unit, a) - this.distance(unit, b) || (a.id < b.id ? -1 : 1));
    while (unit.storedGutUnitIds.length < 5 && candidates.length) {
      const target = candidates.shift()!;
      target.state = 'StoredInGut'; target.storedInGutById = unit.id; target.active = true;
      unit.storedGutUnitIds.push(target.id);
      events.push({ type: 'gut_swallowed', time_s, data: { gutId: unit.id, zombieId: target.id } });
    }
  }

  private nearest(unit: Unit, faction: Unit['faction'], range = Infinity, clearShot = false): Unit | undefined {
    let nearest: Unit | undefined;
    let bestDistance = range * range;
    for (const target of faction === 'human' ? this.humans : this.zombies) {
      // Earlier actions can change these references within this frame.
      if (target.faction !== faction || !target.active || target.hp <= 0 || target.state === 'Dead' || target.state === 'StoredInGut') continue;
      const distance = (target.position.x - unit.position.x) ** 2 + (target.position.y - unit.position.y) ** 2;
      if (distance > bestDistance || (distance === bestDistance && nearest && target.id >= nearest.id)) continue;
      // Doors stop bodies, but a closed door still has a firing slit/vision
      // line for the defenders. Solid walls remain opaque to every shot.
      if (clearShot && this.map.firstBlockingTerrain(unit.position, target.position, 0, true)) continue;
      nearest = target;
      bestDistance = distance;
    }
    return nearest;
  }

  private humanTarget(unit: Unit, profile: AttackProfile | null): Unit | undefined {
    if (!profile) return undefined;
    const candidates = this.zombies.filter(target => target.active && target.hp > 0 && target.state !== 'Dead' && target.state !== 'StoredInGut' &&
      Math.hypot(target.position.x - unit.position.x, target.position.y - unit.position.y) <= profile.range_px &&
      !this.map.firstBlockingTerrain(unit.position, target.position, 0, profile.projectileKind !== 'flame'));
    if (unit.unitType === 'sniper') {
      const special = candidates.filter(target => target.unitType === 'gut_zombie');
      if (special.length) return special.sort((a, b) => this.distance(unit, a) - this.distance(unit, b) || (a.id < b.id ? -1 : 1))[0];
    }
    return candidates.sort((a, b) => this.distance(unit, a) - this.distance(unit, b) || (a.id < b.id ? -1 : 1))[0];
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

  private rangedHuman(unit: Unit, dt: number, time_s: number, events: BattleEvent[]): void {
    const moving = unit.state === 'Moving';
    const profile = getUnitModule(unit.unitType).getAttackProfile();
    if (!profile) return;
    const target = this.humanTarget(unit, profile);
    unit.targetId = target?.id ?? null;
    if (!target) {
      unit.attackElapsed_s = 0;
      // Movement owns the Moving → Idle transition. Changing state here would
      // make MovementSystem skip the unit for the rest of this frame.
      if (!moving) this.state(unit, 'Idle', time_s, events);
      return;
    }
    if (moving) {
      // A moving soldier keeps its movement state while independently firing.
      // Briefly publishing Firing preserves the muzzle/animation event
      // contract without preventing MovementSystem from advancing it.
      unit.attackElapsed_s += dt;
      if (unit.attackElapsed_s + 1e-9 >= profile.interval_s) {
        unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - profile.interval_s);
        this.state(unit, 'Firing', time_s, events);
        events.push(this.createProjectile(unit, target, time_s));
        this.state(unit, 'Moving', time_s, events);
      }
      return;
    }
    this.state(unit, 'Aiming', time_s, events);
    unit.attackElapsed_s += dt;
    if (unit.attackElapsed_s + 1e-9 >= profile.interval_s) {
      unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - profile.interval_s);
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
    let target = this.nearest(unit, 'human');
    unit.velocity = { x: 0, y: 0 };
    if (!target) {
      unit.attackElapsed_s = 0;
      unit.targetId = null;
      this.state(unit, 'Idle', time_s, events);
      return;
    }
    const radius = unit.radius_px ?? 8;
    // Recover safely if an older spawn, crowd push or climb left a body embedded.
    if (this.map.terrain.some(terrain => this.map.isBlocking(terrain) &&
      this.map.terrainContains(unit.position, terrain, radius))) {
      unit.position = this.map.walkablePoint(unit.position, radius);
    }
    const obstruction = this.map.firstBlockingTerrain(unit.position, target.position, radius);
    const required = obstruction?.terrain.stackRequired ?? Infinity;
    const stack = obstruction && Number.isFinite(required) &&
      Math.hypot(obstruction.point.x - unit.position.x, obstruction.point.y - unit.position.y) <= 40
      ? this.wallStack(unit, target, obstruction.terrain, obstruction.point) : [];
    // Nearby crowds may still climb; lone zombies immediately take a route
    // around the wall instead of waiting forever for reinforcements.
    // Unit-specific collision radii keep enlarged bodies clear of walls while
    // still allowing them to route around or climb a barricade.
    let approach = this.map.walkablePoint(target.position, radius);
    let waypoint = stack.length >= required ? target.position
      : this.map.nextWaypoint(unit.position, approach, radius, true);
    if (!waypoint) {
      const blockedTargetId = target.id;
      const alternatives = this.humans.filter(candidate => candidate.faction === 'human' &&
        candidate.active && candidate.hp > 0 && candidate.state !== 'Dead' && candidate.id !== blockedTargetId)
        .sort((a, b) => this.distance(unit, a) - this.distance(unit, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const candidate of alternatives) {
        const candidateApproach = this.map.walkablePoint(candidate.position, radius);
        waypoint = this.map.nextWaypoint(unit.position, candidateApproach, radius, true);
        if (waypoint) { target = candidate;approach = candidateApproach;break; }
      }
    }
    unit.targetId = target.id;
    const distance = this.distance(unit, target);
    const meleeBlocked = this.map.firstBlockingTerrain(unit.position, target.position);
    // Normalize roundoff from diagonal stop-at-range movement, not gameplay range.
    const attack = getZombieModule(unit.unitType as ZombieUnitType).getMeleeAttackProfile();
    // Navigation plans through doorways, while physical collision keeps a closed
    // door solid. Attack the first door on that route before pursuing its occupant.
    const door = waypoint && this.map.firstBlockingTerrain(unit.position, waypoint, radius);
    if (door?.terrain.kind === 'door' &&
        Math.hypot(door.point.x - unit.position.x, door.point.y - unit.position.y) <= attack.range_px) {
      unit.targetId = door.terrain.id;
      this.state(unit, 'Attacking', time_s, events);
      unit.attackElapsed_s += dt;
      if (unit.attackElapsed_s + 1e-9 >= attack.interval_s) {
        unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - attack.interval_s);
        const damaged = this.map.damageDoor(door.terrain.id, attack.damage);
        if (damaged) {
          events.push({ type: 'door_damaged', time_s, data: { ...damaged, sourceId: unit.id, amount: attack.damage } });
          if (damaged.destroyed) events.push({ type: 'door_destroyed', time_s, data: { doorId: damaged.id, sourceId: unit.id } });
        }
      }
      return;
    }
    if (distance > attack.range_px + 1e-9 || meleeBlocked) {
      unit.attackElapsed_s = 0;
      this.state(unit, 'Advancing', time_s, events);
      if (!waypoint) return;
      const pathDistance = Math.hypot(waypoint.x - unit.position.x, waypoint.y - unit.position.y);
      if (pathDistance < 1e-9) return;
      const direct = waypoint.x === approach.x && waypoint.y === approach.y && !meleeBlocked;
      const step = Math.min(pathDistance, direct ? Math.max(0, distance - attack.range_px) : Infinity,
        unit.speed_px_per_s * dt);
      const dx = (waypoint.x - unit.position.x) / pathDistance;
      const dy = (waypoint.y - unit.position.y) / pathDistance;
      const destination = { x: unit.position.x + dx * step, y: unit.position.y + dy * step };
      const hit = this.map.firstBlockingTerrain(unit.position, destination, radius);
      if (hit) {
        if (stack.length >= required) {
          stack.forEach((member, index) => {
            const b = hit.terrain.bounds;
            const vertical = b.bottom - b.top >= b.right - b.left;
            member.climbingWallId = hit.terrain.id;
            member.stackLevel = index % required + 1;
            member.climbTarget = vertical
              ? { x: member.position.x < (b.left + b.right) / 2 ? b.right + member.radius_px + 1 : b.left - member.radius_px - 1,
                y: Math.max(b.top, Math.min(b.bottom, member.position.y)) }
              : { x: Math.max(b.left, Math.min(b.right, member.position.x)),
                y: member.position.y < (b.top + b.bottom) / 2 ? b.bottom + member.radius_px + 1 : b.top - member.radius_px - 1 };
            member.climbTarget = this.map.walkablePoint(member.climbTarget, member.radius_px);
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
    if (unit.attackElapsed_s + 1e-9 >= attack.interval_s) {
      unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - attack.interval_s);
      events.push(...this.applyDamage(target.id, attack.damage, unit.id, time_s, 'melee', unit.position));
    }
  }

  /** Plan through entrances, collide with closed leaves, and break them before entering. */
  private rescueZombie(unit: Unit, dt: number, time_s: number, events: BattleEvent[]): void {
    const radius = unit.radius_px;
    unit.velocity = { x: 0, y: 0 };
    if (this.map.terrain.some(t => this.map.isBlocking(t) && this.map.terrainContains(unit.position, t, radius))) {
      unit.position = this.map.walkablePoint(unit.position, radius);
    }
    const attack = getZombieModule(unit.unitType as ZombieUnitType).getMeleeAttackProfile();
    // A defender in melee reach can intercept the approach to a civilian.
    const defender = this.nearest(unit, 'human', attack.range_px);
    const reachableDefender = defender && !this.map.firstBlockingTerrain(unit.position, defender.position) ? defender : undefined;
    const civilians = this.civilians!.living().sort((a, b) =>
      Math.hypot(a.position.x - unit.position.x, a.position.y - unit.position.y) -
      Math.hypot(b.position.x - unit.position.x, b.position.y - unit.position.y));
    const civilian = civilians[0];
    const target = reachableDefender ?? civilian ?? this.nearest(unit, 'human');
    if (!target) { unit.targetId = null; this.state(unit, 'Idle', time_s, events); return; }
    const waypoint = this.map.nextWaypoint(unit.position, target.position, radius, true);
    if (!waypoint) { unit.targetId = null; unit.attackElapsed_s = 0; return; }
    const obstruction = this.map.firstBlockingTerrain(unit.position, waypoint, radius);
    if (obstruction && (obstruction.terrain.kind === 'door' || obstruction.terrain.kind === 'window') &&
        Math.hypot(obstruction.point.x - unit.position.x, obstruction.point.y - unit.position.y) <= attack.range_px) {
      const entrance = obstruction.terrain;
      if (unit.targetId !== entrance.id) unit.attackElapsed_s = 0;
      unit.targetId = entrance.id;
      this.state(unit, 'Attacking', time_s, events);
      unit.attackElapsed_s += dt;
      if (unit.attackElapsed_s + 1e-9 >= attack.interval_s) {
        unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - attack.interval_s);
        const damaged = this.map.damageDoor(entrance.id, attack.damage);
        if (damaged) {
          events.push({ type: entrance.kind === 'door' ? 'door_damaged' : 'window_damaged', time_s,
            data: { ...damaged, sourceId: unit.id, amount: attack.damage } });
          if (damaged.destroyed) events.push({ type: entrance.kind === 'door' ? 'door_destroyed' : 'window_destroyed', time_s,
            data: entrance.kind === 'door' ? { doorId: entrance.id, sourceId: unit.id } : { windowId: entrance.id, sourceId: unit.id } });
        }
      }
      return;
    }
    if (unit.targetId !== target.id) unit.attackElapsed_s = 0;
    unit.targetId = target.id;
    const distance = Math.hypot(target.position.x - unit.position.x, target.position.y - unit.position.y);
    const blocked = this.map.firstBlockingTerrain(unit.position, target.position);
    if (distance <= attack.range_px + 1e-9 && !blocked) {
      this.state(unit, 'Attacking', time_s, events);
      unit.attackElapsed_s += dt;
      if (unit.attackElapsed_s + 1e-9 >= attack.interval_s) {
        unit.attackElapsed_s = Math.max(0, unit.attackElapsed_s - attack.interval_s);
        if (this.civilians!.get(target.id)) events.push(...this.civilians!.hit(target.id, unit.id, attack.damage, time_s));
        else events.push(...this.applyDamage(target.id, attack.damage, unit.id, time_s, 'melee', unit.position));
      }
      return;
    }
    unit.attackElapsed_s = 0;
    this.state(unit, 'Advancing', time_s, events);
    const pathDistance = Math.hypot(waypoint.x - unit.position.x, waypoint.y - unit.position.y);
    if (pathDistance < 1e-9) return;
    const step = Math.min(pathDistance, unit.speed_px_per_s * dt, blocked ? Infinity : Math.max(0, distance - attack.range_px));
    const dx = (waypoint.x - unit.position.x) / pathDistance, dy = (waypoint.y - unit.position.y) / pathDistance;
    const destination = { x: unit.position.x + dx * step, y: unit.position.y + dy * step };
    const hit = this.map.firstBlockingTerrain(unit.position, destination, radius);
    const fraction = hit ? Math.max(0, hit.fraction - 1e-5) : 1;
    this.move(unit, { x: unit.position.x + dx * step * fraction, y: unit.position.y + dy * step * fraction }, dx, dy);
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
    return this.zombies.filter(candidate => {
      if (!candidate.active || candidate.hp <= 0 || candidate.state === 'Dead') return false;
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

  private separateZombies(frameStarts: ReadonlyMap<string, Waypoint>): void {
    // Climbers intentionally overlap in a stack. Crowd pushes during the
    // crossing can otherwise keep them orbiting a shared exit indefinitely.
    const zombies = this.zombies.filter(unit => unit.active && unit.hp > 0 &&
      unit.state !== 'Dead' && !unit.climbingWallId);
    const { left, top, right, bottom } = this.map.battle_bounds;
    const maxRadius = Math.max(8, ...zombies.map(unit => unit.radius_px ?? 8));
    const cellSize = maxRadius * 2 + 1;
    for (let pass = 0; pass < 2; pass++) {
      const cells = new Map<string, Set<number>>();
      const key = (unit: Unit): string => `${Math.floor(unit.position.x / cellSize)},${Math.floor(unit.position.y / cellSize)}`;
      const insert = (index: number): void => {
        const cell = key(zombies[index]);
        if (!cells.has(cell)) cells.set(cell, new Set());
        cells.get(cell)!.add(index);
      };
      const relocate = (index: number, previousCell: string): void => {
        if (key(zombies[index]) === previousCell) return;
        cells.get(previousCell)?.delete(index);
        insert(index);
      };
      const neighbors = (a: Unit, after: number): number[] => {
        const x = Math.floor(a.position.x / cellSize), y = Math.floor(a.position.y / cellSize);
        const result: number[] = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          for (const index of cells.get(`${x + dx},${y + dy}`) ?? []) {
            if (index > after) result.push(index);
          }
        }
        return result.sort((a, b) => a - b);
      };
      zombies.forEach((_, index) => insert(index));
      for (let i = 0; i < zombies.length; i++) {
        const a = zombies[i];
        let nearby = neighbors(a, i);
        for (let cursor = 0; cursor < nearby.length; cursor++) {
          const j = nearby[cursor];
          const b = zombies[j];
          let dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
          let distance = Math.hypot(dx, dy);
          const minDistance = (a.radius_px ?? 8) + (b.radius_px ?? 8) + 1;
          if (distance >= minDistance) continue;
          if (distance < 1e-6) {
            const angle = ((i + 1) * 2.399963229728653 + (j + 1) * 0.7548776662466927) % (Math.PI * 2);
            dx = Math.cos(angle); dy = Math.sin(angle); distance = 1;
          } else { dx /= distance; dy /= distance; }
          const push = (minDistance - distance) * 0.5;
          const aCell = key(a), bCell = key(b);
          a.position = this.separatedPosition(a, { x: -dx * push, y: -dy * push }, left, top, right, bottom, frameStarts.get(a.id));
          b.position = this.separatedPosition(b, { x: dx * push, y: dy * push }, left, top, right, bottom, frameStarts.get(b.id));
          relocate(i, aCell);relocate(j, bCell);
          // A push may bring new bodies into range. Preserve store order and
          // revisit the neighborhood after each displacement for deterministic replay.
          nearby = neighbors(a, j);
          cursor = -1;
        }
      }
    }
  }

  private separatedPosition(unit: Unit, offset: Waypoint,
    left: number, top: number, right: number, bottom: number, frameStart?: Waypoint): Waypoint {
    const point = { x: Math.max(left, Math.min(right, unit.position.x + offset.x)),
      y: Math.max(top, Math.min(bottom, unit.position.y + offset.y)) };
    const radius = unit.radius_px ?? 8;
    // Sweep crowd displacement too: checking only its endpoint lets dense crowds
    // push one another through thin walls and into inaccessible corners.
    for (const candidate of [point, { x: point.x, y: unit.position.y }, { x: unit.position.x, y: point.y }]) {
      if (!this.map.firstBlockingTerrain(unit.position, candidate, radius) &&
          (!frameStart || !this.map.firstBlockingTerrain(frameStart, candidate, radius))) return candidate;
    }
    return { ...unit.position };
  }
}
