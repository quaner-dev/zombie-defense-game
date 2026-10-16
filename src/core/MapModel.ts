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

  public constructor(definition: MapDefinition) {
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
      const end = route.waypoints.at(-1);
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

  public getRoute(id: string): RouteDefinition | undefined {
    return this.routes.get(id);
  }

  public getSpawnPoint(id: string): SpawnPointDefinition | undefined {
    return this.spawnPoints.get(id);
  }
}
