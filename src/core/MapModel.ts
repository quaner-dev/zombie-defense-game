import mapJson from '../../config/map.json' with { type: 'json' };

export interface Waypoint {
  x: number;
  y: number;
}

export interface RouteDefinition {
  id: string;
  waypoints: Waypoint[];
}

export interface SpawnPointDefinition {
  id: string;
  x: number;
  y: number;
}

export interface MapDefinition {
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

  public constructor(definition: MapDefinition) {
    for (const route of definition.routes) this.routes.set(route.id, route);
    for (const point of definition.spawnPoints) this.spawnPoints.set(point.id, point);
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
