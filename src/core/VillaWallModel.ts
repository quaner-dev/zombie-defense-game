import type { Point, WallSide, WallSnapshot } from './types.js';

export class VillaWallModel {
  private walls = new Map<WallSide, WallSnapshot>();
  constructor() {
    const defs: [WallSide, string, Point][] = [
      ['north', 'villa-wall-north', { x: 540, y: 424 }], ['east', 'villa-wall-east', { x: 956, y: 1212 }],
      ['south', 'villa-wall-south', { x: 540, y: 2000 }], ['west', 'villa-wall-west', { x: 124, y: 1212 }],
    ];
    for (const [side, id] of defs) this.walls.set(side, { id, side, hp: 1800, maxHp: 1800, status: 'intact', breachCenter: null, breachWidth_px: 0 });
  }
  public snapshots(): WallSnapshot[] { return [...this.walls.values()].map(w => ({ ...w, breachCenter: w.breachCenter && { ...w.breachCenter } })); }
  public damage(side: WallSide, amount: number, point: Point): WallSnapshot | null {
    const wall = this.walls.get(side); if (!wall || wall.status === 'breached' || amount <= 0) return null;
    wall.hp = Math.max(0, wall.hp - amount); wall.status = wall.hp === 0 ? 'breached' : 'damaged';
    if (wall.hp === 0) { wall.breachCenter = { ...point }; wall.breachWidth_px = 120; }
    return { ...wall, breachCenter: wall.breachCenter && { ...wall.breachCenter } };
  }
}
