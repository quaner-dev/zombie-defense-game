import mapJson from '../../config/map.json' with { type: 'json' };

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
}

export interface MapDefinition {
  battle_bounds: { left: number; top: number; right: number; bottom: number };
  spawn_bounds?: { top: number };
  defense_line_y: number;
  routes: RouteDefinition[];
  spawnPoints: SpawnPointDefinition[];
  spawn_layout?: { columns: number; spacing_px: number };
}

const MAP_DEFINITIONS: Record<string, MapDefinition> = {
  default: mapJson as unknown as MapDefinition,
};

/** Loads and exposes map configuration (routes and spawn points). */
export class MapModel {
  private readonly routes = new Map<string, RouteDefinition>();
  private readonly spawnPoints = new Map<string, SpawnPointDefinition>();

  public readonly battle_bounds: MapDefinition['battle_bounds'];
  public readonly defense_line_y: number;
  public readonly spawn_top: number;

  public constructor(private readonly definition: MapDefinition) {
    this.battle_bounds = { ...definition.battle_bounds };
    this.defense_line_y = definition.defense_line_y;
    this.spawn_top = definition.spawn_bounds === undefined ? this.battle_bounds.top : definition.spawn_bounds.top;
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
      this.spawnPoints.set(point.id, point);
    }
  }

  public static load(mapId: string = 'default'): MapModel {
    return new MapModel(MAP_DEFINITIONS[mapId] ?? MAP_DEFINITIONS['default']);
  }

  public spawnPositions(routeId: string, count: number): Waypoint[] {
    const route = this.routes.get(routeId)!;
    const layout = route.spawn_layout ?? this.definition.spawn_layout ?? { columns: 1, spacing_px: 0 };
    const columns = Math.min(count, Math.max(1, Math.floor(layout.columns)));
    const spacing = Math.min(Math.max(0, layout.spacing_px), columns > 1 ? route.width / (columns - 1) : Infinity);
    const { left, top, right, bottom } = this.battle_bounds;
    return Array.from({ length: count }, (_, i) => ({
      x: Math.max(left, Math.min(right, route.spawn.x + (i % columns - (columns - 1) / 2) * spacing)),
      // Offscreen entries fan upward; legacy in-bounds entries retain downward rows.
      y: route.spawn.y < top
        ? Math.max(this.spawn_top, Math.min(bottom, route.spawn.y - Math.floor(i / columns) * spacing))
        : Math.max(top, Math.min(bottom, route.spawn.y + Math.floor(i / columns) * spacing)),
    }));
  }

  public getRoute(id: string): RouteDefinition | undefined {
    return this.routes.get(id);
  }

  public getSpawnPoint(id: string): SpawnPointDefinition | undefined {
    return this.spawnPoints.get(id);
  }
}
