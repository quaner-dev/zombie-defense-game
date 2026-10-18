import mapJson from '../../config/map.json' with { type: 'json' };
import { SCENES } from '../scenes/index.js';

export interface Waypoint {
  x: number;
  y: number;
}

export interface RouteDefinition {
  id: string;
  waypoints: Waypoint[];
  spawn: Waypoint;
  defend: Waypoint;
  width: number;
  spawn_layout?: { columns: number; spacing_px: number };
}

export interface SpawnPointDefinition {
  id: string;
  x: number;
  y: number;
  side?: 'north' | 'south' | 'east' | 'west';
  width?: number;
  /** A bounded admission area; later batches reuse its slots instead of extending into rooms. */
  spawnArea?: MapDefinition['battle_bounds'];
}

export interface MapDefinition {
  design_size?: { width: number; height: number };
  unit_selection_radius?: number;
  battle_bounds: { left: number; top: number; right: number; bottom: number };
  spawn_bounds?: { top: number };
  defense_line_y: number;
  routes: RouteDefinition[];
  spawnPoints: SpawnPointDefinition[];
  spawn_layout?: { columns: number; spacing_px: number };
  /** Terrain rectangles used by rendering and movement collision. */
  terrain?: TerrainDefinition[];
}

export interface TerrainDefinition {
  id: string;
  kind: string;
  bounds: { left: number; top: number; right: number; bottom: number };
  blocksMovement?: boolean;
  speedMultiplier?: number;
  stackRequired?: number;
  maxHp?: number;
}

export interface DoorState { id: string; hp: number; maxHp: number; destroyed: boolean }

export interface TerrainHit {
  terrain: TerrainDefinition;
  fraction: number;
  point: Waypoint;
}

interface NavigationGraph {
  corners: Waypoint[];
  edges: { index: number; distance: number }[][];
  destinations: Map<string, number[]>;
}

const MAP_DEFINITIONS: Record<string, MapDefinition> = {
  default: mapJson as unknown as MapDefinition,
  ...Object.fromEntries(SCENES.map(scene => [scene.mapId, scene.map])),
};

/** Loads and exposes map configuration, spawn edges and movement blockers. */
export class MapModel {
  private readonly routes = new Map<string, RouteDefinition>();
  private readonly spawnPoints = new Map<string, SpawnPointDefinition>();
  private readonly navigation = new Map<string, NavigationGraph>();
  private readonly doors = new Map<string, DoorState>();

  public readonly battle_bounds: MapDefinition['battle_bounds'];
  public readonly defense_line_y: number;
  public readonly spawn_top: number;
  public readonly terrain: readonly TerrainDefinition[];
  public readonly design_size: { width: number; height: number };
  public readonly unit_selection_radius: number;

  public constructor(private readonly definition: MapDefinition) {
    this.design_size = { ...(definition.design_size ?? { width: 1080, height: 2400 }) };
    this.unit_selection_radius = definition.unit_selection_radius ?? 112;
    this.battle_bounds = { ...definition.battle_bounds };
    this.defense_line_y = definition.defense_line_y;
    this.spawn_top = definition.spawn_bounds === undefined ? this.battle_bounds.top : definition.spawn_bounds.top;
    this.terrain = (definition.terrain ?? []).map(item => ({...item,bounds:{...item.bounds}}));
    const { left, top, right, bottom } = this.battle_bounds;
    if (!Number.isFinite(this.spawn_top) || this.spawn_top > top) {
      throw new Error('Map spawn bounds top must be finite and at or above battlefield top');
    }
    const validatePoint = (point: Waypoint, spawn = false): void => {
      const minimumY = spawn ? this.spawn_top : top;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < left || point.x > right || point.y < minimumY || point.y > bottom) {
        throw new Error(spawn
          ? 'Map spawn point outside battlefield bounds or configured spawn bounds'
          : 'Map point outside battlefield bounds');
      }
    };
    for (const route of definition.routes) {
      for (const [index, point] of route.waypoints.entries()) {
        validatePoint(point, index === 0);
      }
      validatePoint(route.spawn, true);
      validatePoint(route.defend);
      const end = route.waypoints[route.waypoints.length - 1];
      if (!end || end.y < this.defense_line_y) {
        throw new Error(`Route ${route.id} must reach the defense line`);
      }
      this.routes.set(route.id, route);
    }
    for (const point of definition.spawnPoints) {
      validatePoint(point, true);
      if (point.width !== undefined && (!Number.isFinite(point.width) || point.width < 0)) {
        throw new Error(`Map spawn point ${point.id} has invalid width`);
      }
      if (point.spawnArea) {
        const area = point.spawnArea;
        validatePoint({ x: area.left, y: area.top });
        validatePoint({ x: area.right, y: area.bottom });
        if (area.left > area.right || area.top > area.bottom) throw new Error('Invalid spawn area');
      }
      this.spawnPoints.set(point.id, point);
    }
    for (const terrain of this.terrain) {
      const b = terrain.bounds;
      if (![b.left, b.top, b.right, b.bottom].every(Number.isFinite) ||
          b.left > b.right || b.top > b.bottom || b.left < left || b.right > right ||
          b.top < top || b.bottom > bottom ||
          (terrain.stackRequired !== undefined && (!Number.isInteger(terrain.stackRequired) || terrain.stackRequired < 1))) {
        throw new Error(`Map terrain ${terrain.id} has invalid bounds or stack requirement`);
      }
      if (terrain.kind === 'door') {
        if (!Number.isFinite(terrain.maxHp) || terrain.maxHp! <= 0) throw new Error(`Door ${terrain.id} needs positive durability`);
        this.doors.set(terrain.id, { id: terrain.id, hp: terrain.maxHp!, maxHp: terrain.maxHp!, destroyed: false });
      }
    }
  }

  public getDoorStates(): DoorState[] { return [...this.doors.values()].map(door => ({ ...door })); }

  public damageDoor(id: string, damage: number): DoorState | null {
    const door = this.doors.get(id);
    if (!door || door.destroyed || !Number.isFinite(damage) || damage <= 0) return null;
    door.hp = Math.max(0, door.hp - damage);
    door.destroyed = door.hp === 0;
    if (door.destroyed) this.navigation.clear();
    return { ...door };
  }

  public isBlocking(terrain: TerrainDefinition, ignoreDoors = false): boolean {
    return !!terrain.blocksMovement && (terrain.kind !== 'door' ||
      (!ignoreDoors && !this.doors.get(terrain.id)?.destroyed));
  }

  public static load(mapId: string = 'default'): MapModel {
    return new MapModel(MAP_DEFINITIONS[mapId] ?? MAP_DEFINITIONS['default']);
  }

  public static register(mapId: string, definition: MapDefinition): void {
    if (!mapId.trim()) throw new Error('Map ID must not be empty');
    MAP_DEFINITIONS[mapId] = definition;
  }

  public spawnPositions(routeId: string, count: number, spawnPointId?: string, startIndex?: number): Waypoint[] {
    const stableLayout = startIndex !== undefined;
    startIndex ??= 0;
    if (!Number.isInteger(startIndex) || startIndex < 0) throw new Error('Spawn start index must be a non-negative integer');
    if (spawnPointId) {
      const point = this.spawnPoints.get(spawnPointId);
      if (!point) throw new Error(`Unknown spawn point: ${spawnPointId}`);
      return this.edgeSpawnPositions(point, count, startIndex, stableLayout);
    }
    const route = this.routes.get(routeId)!;
    const layout = route.spawn_layout ?? this.definition.spawn_layout ?? { columns: 1, spacing_px: 0 };
    const columns = stableLayout ? Math.max(1, Math.floor(layout.columns))
      : Math.min(count, Math.max(1, Math.floor(layout.columns)));
    const spacing = Math.min(Math.max(0, layout.spacing_px), columns > 1 ? route.width / (columns - 1) : Infinity);
    const { left, top, right, bottom } = this.battle_bounds;
    return Array.from({ length: count }, (_, i) => {
      const index = i + startIndex;
      return {
        x: Math.max(left, Math.min(right, route.spawn.x + (index % columns - (columns - 1) / 2) * spacing)),
        // Offscreen entries fan upward; legacy in-bounds entries retain downward rows.
        y: route.spawn.y < top
          ? Math.max(this.spawn_top, Math.min(bottom, route.spawn.y - Math.floor(index / columns) * spacing))
          : Math.max(top, Math.min(bottom, route.spawn.y + Math.floor(index / columns) * spacing)),
      };
    });
  }

  private edgeSpawnPositions(point: SpawnPointDefinition, count: number, startIndex: number, stableLayout: boolean): Waypoint[] {
    const layout = this.definition.spawn_layout ?? { columns: 1, spacing_px: 0 };
    const side = point.side ?? this.inferSpawnSide(point);
    if (point.spawnArea) {
      const b = point.spawnArea, spacing = Math.max(1, layout.spacing_px);
      const horizontal = side === 'north' || side === 'south';
      const across = horizontal ? b.right - b.left : b.bottom - b.top;
      const depth = horizontal ? b.bottom - b.top : b.right - b.left;
      const columns = Math.max(1, Math.min(layout.columns, Math.floor(across / spacing) + 1));
      const rows = Math.max(1, Math.floor(depth / spacing) + 1);
      return Array.from({ length: count }, (_, i) => {
        const index = (i + startIndex) % (columns * rows);
        const column = index % columns, row = Math.floor(index / columns);
        const offset = (column - (columns - 1) / 2) * spacing;
        const inset = row * spacing;
        if (side === 'north') return { x: (b.left + b.right) / 2 + offset, y: b.top + inset };
        if (side === 'south') return { x: (b.left + b.right) / 2 + offset, y: b.bottom - inset };
        if (side === 'west') return { x: b.left + inset, y: (b.top + b.bottom) / 2 + offset };
        return { x: b.right - inset, y: (b.top + b.bottom) / 2 + offset };
      });
    }
    const { left, top, right, bottom } = this.battle_bounds;
    const available = side === 'north' || side === 'south' ? right - left : bottom - top;
    const width = Math.min(point.width ?? available, available);
    const columns = stableLayout ? Math.max(1, Math.floor(layout.columns))
      : Math.min(count, Math.max(1, Math.floor(layout.columns)));
    const spacing = Math.min(Math.max(0, layout.spacing_px), columns > 1 ? width / (columns - 1) : Infinity);
    return Array.from({ length: count }, (_, index) => {
      const slot = index + startIndex;
      const offset = (slot % columns - (columns - 1) / 2) * spacing;
      const depth = Math.floor(slot / columns) * spacing;
      if (side === 'north') return {
        x: Math.max(left, Math.min(right, point.x + offset)),
        y: Math.max(top, Math.min(bottom, point.y + depth)),
      };
      if (side === 'south') return {
        x: Math.max(left, Math.min(right, point.x + offset)),
        y: Math.max(top, Math.min(bottom, point.y - depth)),
      };
      if (side === 'west') return {
        x: Math.max(left, Math.min(right, point.x + depth)),
        y: Math.max(top, Math.min(bottom, point.y + offset)),
      };
      return {
        x: Math.max(left, Math.min(right, point.x - depth)),
        y: Math.max(top, Math.min(bottom, point.y + offset)),
      };
    });
  }

  private inferSpawnSide(point: SpawnPointDefinition): NonNullable<SpawnPointDefinition['side']> {
    const { left, top, right, bottom } = this.battle_bounds;
    const distances: [NonNullable<SpawnPointDefinition['side']>, number][] = [
      ['west', Math.abs(point.x - left)], ['east', Math.abs(point.x - right)],
      ['north', Math.abs(point.y - top)], ['south', Math.abs(point.y - bottom)],
    ];
    return distances.sort((a, b) => a[1] - b[1])[0][0];
  }

  /** First terrain rectangle crossed by a swept circular unit. */
  public firstBlockingTerrain(start: Waypoint, end: Waypoint, radius = 0, ignoreDoors = false): TerrainHit | null {
    let first: TerrainHit | null = null;
    for (const terrain of this.terrain) {
      if (!this.isBlocking(terrain, ignoreDoors)) continue;
      const b = terrain.bounds;
      const bounds = { left: b.left - radius, top: b.top - radius,
        right: b.right + radius, bottom: b.bottom + radius };
      const startsInside = start.x >= bounds.left && start.x <= bounds.right &&
        start.y >= bounds.top && start.y <= bounds.bottom;
      const endsInside = end.x >= bounds.left && end.x <= bounds.right &&
        end.y >= bounds.top && end.y <= bounds.bottom;
      if (startsInside) {
        // A unit resting against the boundary may retreat, but a long step must
        // never cross the wall from one side to the opposite side.
        const exits = [
          { distance: start.x - bounds.left, outward: end.x < start.x },
          { distance: bounds.right - start.x, outward: end.x > start.x },
          { distance: start.y - bounds.top, outward: end.y < start.y },
          { distance: bounds.bottom - start.y, outward: end.y > start.y },
        ];
        const closest = Math.min(...exits.map(exit => exit.distance));
        if (!exits.some(exit => exit.distance <= closest + 1e-8 && exit.outward)) {
          if (!first || first.fraction > 0) first = { terrain, fraction: 0, point: { ...start } };
        } else if (endsInside && closest > 1e-8) {
          if (!first || first.fraction > 0) first = { terrain, fraction: 0, point: { ...start } };
        }
        continue;
      }
      const hit = this.segmentRectFraction(start, end, bounds);
      if (hit === null || (first && hit >= first.fraction)) continue;
      first = { terrain, fraction: hit, point: {
        x: start.x + (end.x - start.x) * hit,
        y: start.y + (end.y - start.y) * hit,
      } };
    }
    return first;
  }

  public terrainContains(point: Waypoint, terrain: TerrainDefinition, radius = 0): boolean {
    const b = terrain.bounds;
    return point.x >= b.left - radius && point.x <= b.right + radius &&
      point.y >= b.top - radius && point.y <= b.bottom + radius;
  }

  /** Keep a commanded destination outside walls, including the unit's radius. */
  public walkablePoint(point: Waypoint, radius = 0): Waypoint {
    const { left, top, right, bottom } = this.battle_bounds;
    const clamp = (p: Waypoint): Waypoint => ({
      x: Math.max(left, Math.min(right, p.x)), y: Math.max(top, Math.min(bottom, p.y)),
    });
    const target = clamp(point);
    const blockers = this.terrain.filter(terrain => this.isBlocking(terrain));
    if (!blockers.some(wall => this.terrainContains(target, wall, radius))) return target;
    const candidates = blockers.flatMap(wall => {
      const b = wall.bounds, padding = radius + 1;
      return [
        { x: b.left - padding, y: target.y }, { x: b.right + padding, y: target.y },
        { x: target.x, y: b.top - padding }, { x: target.x, y: b.bottom + padding },
        ...this.wallCorners(wall, padding),
      ].map(clamp);
    }).filter(p => !blockers.some(wall => this.terrainContains(p, wall, radius)));
    candidates.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) -
      Math.hypot(b.x - target.x, b.y - target.y));
    return candidates[0] ?? target;
  }

  /** Shortest visible corner to follow around rectangular walls; null means unreachable. */
  public nextWaypoint(start: Waypoint, target: Waypoint, radius = 0, ignoreDoors = false): Waypoint | null {
    if (!this.firstBlockingTerrain(start, target, radius, ignoreDoors)) return { ...target };
    const graph = this.navigationGraph(radius, ignoreDoors);
    const key = `${target.x},${target.y}`;
    let distances = graph.destinations.get(key);
    if (!distances) {
      // Distances to this moving target are shared by all pursuing units.
      distances = graph.corners.map(corner => this.firstBlockingTerrain(corner, target, radius, ignoreDoors)
        ? Infinity : Math.hypot(corner.x - target.x, corner.y - target.y));
      const visited = new Set<number>();
      for (let pass = 0; pass < graph.corners.length; pass++) {
        let closest = -1;
        for (let i = 0; i < distances.length; i++) {
          if (!visited.has(i) && distances[i] < (closest < 0 ? Infinity : distances[closest])) closest = i;
        }
        if (closest < 0) break;
        visited.add(closest);
        for (const edge of graph.edges[closest]) {
          distances[edge.index] = Math.min(distances[edge.index], distances[closest] + edge.distance);
        }
      }
      if (graph.destinations.size >= 64) graph.destinations.delete(graph.destinations.keys().next().value!);
      graph.destinations.set(key, distances);
    }
    let best: Waypoint | null = null, length = Infinity;
    for (const [i, corner] of graph.corners.entries()) {
      const approach = Math.hypot(corner.x - start.x, corner.y - start.y);
      if (approach < 1e-6 || approach + distances[i] >= length ||
          this.firstBlockingTerrain(start, corner, radius, ignoreDoors)) continue;
      best = corner;
      length = approach + distances[i];
    }
    return best ? { ...best } : null;
  }

  private wallCorners(wall: TerrainDefinition, padding: number): Waypoint[] {
    const b = wall.bounds;
    return [
      { x: b.left - padding, y: b.top - padding }, { x: b.right + padding, y: b.top - padding },
      { x: b.left - padding, y: b.bottom + padding }, { x: b.right + padding, y: b.bottom + padding },
    ];
  }

  private navigationGraph(radius: number, ignoreDoors: boolean): NavigationGraph {
    const key = `${radius}:${ignoreDoors}`;
    const cached = this.navigation.get(key);
    if (cached) return cached;
    const { left, top, right, bottom } = this.battle_bounds;
    const blockers = this.terrain.filter(wall => this.isBlocking(wall, ignoreDoors));
    const corners = blockers.flatMap(wall => this.wallCorners(wall, radius + 1)).filter(p =>
      p.x >= left && p.x <= right && p.y >= top && p.y <= bottom &&
      !blockers.some(wall => this.terrainContains(p, wall, radius)));
    const graph: NavigationGraph = { corners, edges: corners.map(() => []), destinations: new Map() };
    for (let i = 0; i < corners.length; i++) {
      for (let j = i + 1; j < corners.length; j++) {
        if (this.firstBlockingTerrain(corners[i], corners[j], radius, ignoreDoors)) continue;
        const distance = Math.hypot(corners[i].x - corners[j].x, corners[i].y - corners[j].y);
        graph.edges[i].push({ index: j, distance });graph.edges[j].push({ index: i, distance });
      }
    }
    this.navigation.set(key, graph);
    return graph;
  }

  public hasCrossedDefense(point: Waypoint, side: string | null): boolean {
    const centerX = (this.battle_bounds.left + this.battle_bounds.right) / 2;
    if (side === 'north') return point.y >= this.defense_line_y;
    if (side === 'south') return point.y <= this.defense_line_y;
    if (side === 'west') return point.x >= centerX;
    if (side === 'east') return point.x <= centerX;
    return point.y >= this.defense_line_y;
  }

  private segmentRectFraction(start: Waypoint, end: Waypoint,
    bounds: { left: number; top: number; right: number; bottom: number }): number | null {
    let enter = 0;
    let exit = 1;
    for (const [origin, delta, minimum, maximum] of [
      [start.x, end.x - start.x, bounds.left, bounds.right],
      [start.y, end.y - start.y, bounds.top, bounds.bottom],
    ]) {
      if (Math.abs(delta) < 1e-12) {
        if (origin < minimum || origin > maximum) return null;
        continue;
      }
      let near = (minimum - origin) / delta;
      let far = (maximum - origin) / delta;
      if (near > far) [near, far] = [far, near];
      enter = Math.max(enter, near);
      exit = Math.min(exit, far);
      if (enter > exit) return null;
    }
    return enter >= 0 && enter <= 1 ? enter : null;
  }

  public getRoute(id: string): RouteDefinition | undefined {
    return this.routes.get(id);
  }

  public routeIds(): string[] { return [...this.routes.keys()]; }

  public getSpawnPoint(id: string): SpawnPointDefinition | undefined {
    return this.spawnPoints.get(id);
  }
}
