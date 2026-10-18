import type { MapDefinition } from '../core/MapModel.js';
import type { LevelDefinition } from '../core/WaveManager.js';
import type { ScenarioKind, HumanUnitType, WallSide } from '../core/types.js';

export interface SceneDecoration {
  kind: 'floor' | 'stripe';
  bounds: { left: number; top: number; right: number; bottom: number };
  color: string;
}

/** A location owns its geometry, waves, copy and appearance, independent of Cocos. */
export interface SceneDefinition {
  id: string;
  title: string;
  subtitle: string;
  briefing: string;
  objective: string;
  mapId: string;
  levelId: string;
  map: MapDefinition;
  scenarioKind?: ScenarioKind;
  level: LevelDefinition & { continuousSpawn?: { totalTarget: number; initialInterval_s: number; minInterval_s: number; rampDuration_s: number; batchSize: number; spawnPoints: WallSide[] }; initialSoldiers?: HumanUnitType[]; soldierPositions?: { x: number; y: number }[]; civilians?: { position: { x: number; y: number } }[] };
  presentation: {
    floorColor: string;
    wallColor: string;
    wallOutlineColor: string;
    decorations: SceneDecoration[];
  };
}
