import unitConfig from '../../config/units.json' with { type: 'json' };
import type { Point, Unit, UnitType } from './types.js';

/** IDs belong to a spawn lifetime, never to a pooled object slot. */
export class UnitStore {
  private readonly units = new Map<string, Unit>();
  private readonly pool: Unit[] = [];
  private nextId = 1;

  public spawn(unitType: UnitType, position: Point, routeId: string, spawnPointId: string | null = null): Unit {
    const config = unitConfig[unitType];
    const fresh: Unit = {
      id: `unit-${this.nextId++}`, unitType,
      faction: unitType === 'rifleman' ? 'human' : 'zombie',
      position: { ...position }, velocity: { x: 0, y: 0 },
      hp: config.hitPoints, maxHp: config.hitPoints,
      speed_px_per_s: config.speed_px_per_s,
      state: unitType === 'rifleman' ? 'Idle' : 'Advancing',
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
