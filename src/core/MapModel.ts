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

  public constructor(private readonly definition: MapDefinition) {
    this.battle_bounds = { ...definition.battle_bounds };
    this.defense_line_y = definition.defense_line_y;
    const { left, top, right, bottom } = this.battle_bounds;
    const validatePoint = (point: Waypoint): void => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < left || point.x > right || point.y < top || point.y > bottom) {
        throw new Error('Map point outside battlefield bounds');
      }
    };
    for (const route of definition.routes) {
      for (const point of [...route.waypoints, route.spawn, route.defend]) validatePoint(point);
      const end = route.waypoints[route.waypoints.length - 1];
      if (!end || end.y < this.defense_line_y) {
        throw new Error(`Route ${route.id} must reach the defense line`);
      }
      this.routes.set(route.id, route);
    }
    for (const point of definition.spawnPoints) {
      validatePoint(point);
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
      y: Math.max(top, Math.min(bottom, route.spawn.y + Math.floor(i / columns) * spacing)),
    }));
  }

  public getRoute(id: string): RouteDefinition | undefined {
    return this.routes.get(id);
  }

  public getSpawnPoint(id: string): SpawnPointDefinition | undefined {
    return this.spawnPoints.get(id);
  }
}
