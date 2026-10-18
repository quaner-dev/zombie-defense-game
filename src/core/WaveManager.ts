import levelsJson from '../../config/levels.json' with { type: 'json' };
import { SCENES } from '../scenes/index.js';
import type { BattleEvent, WaveSpawnEventData } from './types.js';
import type { MapModel } from './MapModel.js';
import type { ZombieUnitType } from './types.js';

export interface WaveSpawn {
  unitType: ZombieUnitType;
  route: string;
  count: number;
  spawnPoint?: string;
}

export interface WaveDefinition {
  battleTime_s: number;
  batchSize?: number;
  batchInterval_s?: number;
  spawns: WaveSpawn[];
}

export interface LevelDefinition {
  mapId: string;
  waves: WaveDefinition[];
}

/**
 * Scheduling boundary for level content. The MVP implementation below is a
 * fixed-time wave list; a future interval or continuous-spawn scheduler can
 * preserve the same update/allWavesSpawned contract without touching combat.
 */
export interface WaveScheduler {
  update(battleTime: number): BattleEvent[];
  allWavesSpawned(): boolean;
  getMapId(): string;
  getWaveCount(): number;
  validateMap(map: MapModel): void;
}

export type { WaveSpawnEventData } from './types.js';

const LEVEL_DEFINITIONS: Record<string, LevelDefinition> = {
  ...levelsJson as unknown as Record<string, LevelDefinition>,
  ...Object.fromEntries(SCENES.map(scene => [scene.levelId, scene.level])),
};

/**
 * Emits each scheduled wave exactly once when battle time reaches its time.
 * Previously spawned waves do not need to be cleared for later waves to fire.
 */
export class WaveManager implements WaveScheduler {
  private nextWaveIndex = 0;

  public constructor(private readonly level: LevelDefinition) {}

  /** Emits all waves whose battle time is due at or before battleTime. */
  public update(battleTime: number): BattleEvent[] {
    const events: BattleEvent[] = [];
    while (this.nextWaveIndex < this.level.waves.length) {
      const wave = this.level.waves[this.nextWaveIndex];
      if (wave.battleTime_s > battleTime) break;
      events.push({
        type: 'wave_spawn',
        time_s: wave.battleTime_s,
        data: {
          waveIndex: this.nextWaveIndex,
          battleTime_s: wave.battleTime_s,
          batchSize: wave.batchSize ?? Number.MAX_SAFE_INTEGER,
          batchInterval_s: wave.batchInterval_s ?? 0,
          spawns: wave.spawns.map((spawn) => ({ ...spawn })),
        } satisfies WaveSpawnEventData,
      });
      this.nextWaveIndex += 1;
    }
    return events;
  }

  public getMapId(): string {
    return this.level.mapId;
  }

  public validateMap(map: MapModel): void {
    for (const wave of this.level.waves) {
      if (wave.batchSize !== undefined && (!Number.isInteger(wave.batchSize) || wave.batchSize < 1)) {
        throw new Error('Wave batch size must be a positive integer');
      }
      if (wave.batchInterval_s !== undefined && (!Number.isFinite(wave.batchInterval_s) || wave.batchInterval_s < 0)) {
        throw new Error('Wave batch interval must be finite and non-negative');
      }
      for (const spawn of wave.spawns) {
        if (!map.getRoute(spawn.route)) throw new Error(`Unknown spawn route: ${spawn.route}`);
        if (spawn.spawnPoint && !map.getSpawnPoint(spawn.spawnPoint)) {
          throw new Error(`Unknown spawn point: ${spawn.spawnPoint}`);
        }
      }
    }
  }

  public allWavesSpawned(): boolean {
    return this.nextWaveIndex === this.level.waves.length;
  }

  public getWaveIndex(): number {
    return this.nextWaveIndex;
  }

  public getWaveCount(): number { return this.level.waves.length; }

  public static load(levelId: string): WaveManager {
    return new WaveManager(LEVEL_DEFINITIONS[levelId] ?? LEVEL_DEFINITIONS['LV01_zombie_wave']);
  }

  public static register(levelId: string, definition: LevelDefinition): void {
    if (!levelId.trim()) throw new Error('Level ID must not be empty');
    LEVEL_DEFINITIONS[levelId] = definition;
  }
}
