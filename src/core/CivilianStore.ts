import type { BattleEvent, CivilianEntity, Point } from './types.js';

export class CivilianStore {
  private civilians = new Map<string, CivilianEntity>();
  private nextId = 1;
  private readonly transformStarted = new Map<string, number>();
  public clear(): void { this.civilians.clear(); this.transformStarted.clear(); this.nextId = 1; }
  public spawn(position: Point, id = `civilian-${this.nextId++}`): CivilianEntity {
    const civilian: CivilianEntity = { id, position: { ...position }, state: 'idle', transformElapsed_s: 0, active: true };
    this.civilians.set(id, civilian); return civilian;
  }
  public all(): CivilianEntity[] { return [...this.civilians.values()]; }
  public living(): CivilianEntity[] { return this.all().filter(c => c.active && c.state !== 'transformed'); }
  public get(id: string): CivilianEntity | undefined { return this.civilians.get(id); }
  public hit(id: string, sourceId: string, amount: number, time_s: number): BattleEvent[] {
    const c = this.civilians.get(id); if (!c || c.state !== 'idle' || !Number.isFinite(amount) || amount <= 0) return [];
    c.state = 'transforming'; c.transformElapsed_s = 0;
    this.transformStarted.set(id, time_s);
    return [
      { type: 'civilian_hit', time_s, data: { civilianId: id, sourceId, amount } },
      { type: 'civilian_transform_started', time_s, data: { civilianId: id, duration_s: 0.8 } },
    ];
  }
  public update(_dt: number, time_s: number, spawnZombie: (position: Point) => string): BattleEvent[] {
    const events: BattleEvent[] = [];
    for (const c of this.civilians.values()) if (c.state === 'transforming') {
      c.transformElapsed_s = Math.max(0, time_s - this.transformStarted.get(c.id)!);
      if (c.transformElapsed_s + 1e-9 >= 0.8) {
        c.state = 'transformed'; const zombieId = spawnZombie(c.position);
        events.push({ type: 'civilian_transformed', time_s, data: { civilianId: c.id, zombieId } });
      }
    }
    return events;
  }
}
