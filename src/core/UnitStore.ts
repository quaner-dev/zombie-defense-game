import type { Point, Unit, UnitType } from './types.js';
import { getUnitModule } from './units/index.js';

/** IDs belong to a spawn lifetime, never to a pooled object slot. */
export class UnitStore {
  private readonly units = new Map<string, Unit>();
  private readonly pool: Unit[] = [];
  private nextId = 1;

  public spawn(unitType: UnitType, position: Point, routeId: string, spawnPointId: string | null = null): Unit {
    const module = getUnitModule(unitType);
    const config = module.getStats();
    const fresh: Unit = {
      id: `unit-${this.nextId++}`, unitType,
      faction: module.faction,
      position: { ...position }, velocity: { x: 0, y: 0 },
      hp: config.hitPoints, maxHp: config.hitPoints,
      radius_px: (config.diameter_px ?? (module.faction === 'human' ? 14 : 16)) / 2,
      speed_px_per_s: config.speed_px_per_s,
      state: module.initialState,
      routeId, targetId: null, moveTarget: null,
      attackElapsed_s: 0, breached: false, spawnPointId, climbingWallId: null,
      climbTarget: null, stackLevel: 0, active: true,
    };
    const unit = Object.assign(this.pool.pop() ?? {}, fresh) as Unit;
    this.units.set(unit.id, unit);
    return unit;
  }

  public get(id: string): Unit | undefined { return this.units.get(id); }
  public all(): Unit[] { return [...this.units.values()]; }
  public living(): Unit[] {
    return this.all().filter(unit => unit.active && unit.hp > 0 && unit.state !== 'Dead');
  }

  public transform(id: string, unitType: UnitType): Unit | undefined {
    const unit = this.units.get(id);
    if (!unit || !unit.active || unit.hp <= 0 || unit.state === 'Dead') return undefined;
    const module = getUnitModule(unitType);
    const stats = module.getStats();
    unit.unitType = unitType;
    unit.faction = module.faction;
    unit.hp = stats.hitPoints;
    unit.maxHp = stats.hitPoints;
    unit.radius_px = (stats.diameter_px ?? (module.faction === 'human' ? 14 : 16)) / 2;
    unit.speed_px_per_s = stats.speed_px_per_s;
    unit.velocity = { x: 0, y: 0 };
    unit.state = module.initialState;
    unit.targetId = null;
    unit.moveTarget = null;
    unit.attackElapsed_s = 0;
    unit.climbingWallId = null;
    unit.climbTarget = null;
    unit.stackLevel = 0;
    return unit;
  }

  public kill(id: string): boolean {
    const unit = this.units.get(id);
    if (!unit || unit.state === 'Dead') return false;
    unit.hp = 0;
    unit.state = 'Dead';
    unit.velocity = { x: 0, y: 0 };
    unit.targetId = null;
    unit.moveTarget = null;
    unit.climbingWallId = null;
    unit.climbTarget = null;
    unit.stackLevel = 0;
    return true;
  }

  public remove(id: string): boolean {
    const unit = this.units.get(id);
    if (!unit) return false;
    this.kill(id);
    unit.active = false;
    this.units.delete(id);
    this.pool.push(unit);
    return true;
  }

  public clear(): void {
    for (const id of this.units.keys()) this.remove(id);
  }
}
