import type { MapDefinition } from '../core/MapModel.js';
import type { LevelDefinition } from '../core/WaveManager.js';

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
  level: LevelDefinition;
  presentation: {
    floorColor: string;
    wallColor: string;
    wallOutlineColor: string;
    decorations: SceneDecoration[];
  };
}
