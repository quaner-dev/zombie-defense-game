import { cabin } from './cabin.js';
import { courtyard } from './courtyard.js';
import { villaRescue } from './villaRescue.js';
export type { SceneDefinition, SceneDecoration } from './types.js';

/** Registration order is the story order and the scene selection order. */
export const SCENES = [cabin, courtyard, villaRescue] as const;
export const ALL_SCENES = SCENES;

export function getScene(id: string) {
  const scene = ALL_SCENES.find(scene => scene.id === id);
  if (!scene) throw new Error(`Unknown scene: ${id}`);
  return scene;
}

export function sceneForLevel(levelId: string) {
  return ALL_SCENES.find(scene => scene.levelId === levelId);
}
