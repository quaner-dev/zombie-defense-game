import type { UnitStore } from './UnitStore.js';
import type { MapModel } from './MapModel.js';
import type { Unit } from './types.js';

/** Proximity membership is separate from the fixed membership of a move command. */
export class SquadSystem {
  private edges = new Set<string>();
  private squads = new Map<string, string[]>();
  private nextReview = -Infinity;
  private orders: { ids: Set<string>; speed: number; departed: boolean }[] = [];
  public constructor(private readonly store: UnitStore, private readonly map: MapModel) {}
  private key(a: string, b: string): string { return [a, b].sort().join('|'); }
  public update(time: number): void {
    const humans = this.store.living().filter(u => u.faction === 'human');
    const living = new Map(humans.map(u => [u.id, u]));
    for (const order of this.orders) {
      for (const id of Array.from(order.ids)) if (!living.get(id)?.moveTarget) order.ids.delete(id);
      if (!order.departed && Array.from(order.ids).every(id => living.get(id)?.state === 'Moving')) order.departed = true;
    }
    this.orders = this.orders.filter(order => order.ids.size > 0);
    if (time + 1e-9 < this.nextReview) return;
    this.nextReview = time + .2;
    const edges = new Set<string>(), adjacency = new Map(humans.map(u => [u.id, [] as string[]]));
    for (let i = 0; i < humans.length; i++) for (let j = i + 1; j < humans.length; j++) {
      const a = humans[i], b = humans[j], key = this.key(a.id, b.id);
      // A moving command has captured its membership. In particular a detached
      // single soldier cannot collect the squad it is leaving behind.
      const orderA = this.orders.find(o => o.ids.has(a.id)), orderB = this.orders.find(o => o.ids.has(b.id));
      if (orderA !== orderB) continue;
      if (Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) > (this.edges.has(key) ? 160 : 120) ||
          this.map.firstBlockingTerrain(a.position, b.position)) continue;
      edges.add(key); adjacency.get(a.id)!.push(b.id); adjacency.get(b.id)!.push(a.id);
    }
    this.edges = edges; this.squads.clear();
    for (const human of humans) {
      if (this.squads.has(human.id)) continue;
      const ids: string[] = [], pending = [human.id], visited = new Set<string>();
      while (pending.length) {
        const id = pending.pop()!; if (visited.has(id)) continue;
        visited.add(id); ids.push(id); pending.push(...adjacency.get(id)!);
      }
      ids.sort(); for (const id of ids) this.squads.set(id, ids);
    }
  }
  public members(id: string, time: number): string[] {
    this.update(time);
    const order = this.orders.find(o => o.ids.has(id));
    return Array.from(order ? order.ids : this.squads.get(id) ?? []);
  }
  public command(units: Unit[]): void {
    const ids = new Set(units.map(u => u.id));
    for (const order of this.orders) for (const id of Array.from(ids)) order.ids.delete(id);
    this.orders.push({ ids, speed: Math.min(...units.map(u => u.speed_px_per_s)), departed: false });
    this.nextReview = -Infinity;
  }
  public speed(unit: Unit): number {
    const order = this.orders.find(o => o.ids.has(unit.id));
    return order ? order.departed ? order.speed : 0 : unit.speed_px_per_s;
  }
}
