import { cabin } from './cabin.js';
import { courtyard } from './courtyard.js';
export type { SceneDefinition, SceneDecoration } from './types.js';

/** Registration order is the story order and the scene selection order. */
export const SCENES = [cabin, courtyard] as const;

export function getScene(id: string) {
  const scene = SCENES.find(scene => scene.id === id);
  if (!scene) throw new Error(`Unknown scene: ${id}`);
  return scene;
}

export function sceneForLevel(levelId: string) {
  return SCENES.find(scene => scene.levelId === levelId);
}
