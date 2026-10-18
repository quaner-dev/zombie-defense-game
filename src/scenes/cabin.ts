import map from '../../config/map.json' with { type: 'json' };
import levels from '../../config/levels.json' with { type: 'json' };
import type { SceneDefinition } from './types.js';

/** Keep the original cabin geometry and spawn settings as the first chapter. */
export const cabin: SceneDefinition = {
  id: 'cabin',
  title: '小屋突围',
  subtitle: '第一幕 · 小屋内部',
  briefing: '尸潮正在逼近。利用屋内隔墙收拢队伍，守住三波进攻，寻找离开小屋的机会。',
  objective: '抵御 3 波尸潮，至少一名士兵存活',
  mapId: 'LV01_four_sides',
  levelId: 'LV01_zombie_wave',
  map: map as SceneDefinition['map'],
  level: levels.LV01_zombie_wave as SceneDefinition['level'],
  presentation: {
    floorColor: '#17191E', wallColor: '#7A7A85', wallOutlineColor: '#A4A4AF',
    decorations: [
      { kind: 'floor', color: '#24262C', bounds: { left: 120, top: 800, right: 960, bottom: 1800 } },
    ],
  },
};
