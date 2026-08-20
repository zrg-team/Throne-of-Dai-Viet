import type { MapGenConfig } from '../map/hexMapGenerator';

export interface GameplayMapConfig extends MapGenConfig {
  neutralDistrictTarget: number;
}

export const GAMEPLAY_MAP_CONFIG: GameplayMapConfig = {
  cols: 30,
  rows: 52,
  hexSize: 18,
  seed: 1337,
  neutralDistrictTarget: 40,
  // Water is left on `DRAINAGE_DEFAULTS`. The realm is a delta country, so this is a dial worth
  // knowing about: `trunks` and `widenChance` between them decide how wet the sheet reads.
};

export const MOUNTAIN_OPACITY_PRESETS = {
  light: {
    fill: 0.45,
    outline: 0.5,
    innerRidge: 0.3,
    mist: 0.42,
  },
  balanced: {
    fill: 0.6,
    outline: 0.62,
    innerRidge: 0.38,
    mist: 0.5,
  },
  strong: {
    fill: 1,
    outline: 1,
    innerRidge: 0.85,
    mist: 0.85,
  },
} as const;

export type MountainOpacityPreset = keyof typeof MOUNTAIN_OPACITY_PRESETS;
export const ACTIVE_MOUNTAIN_OPACITY_PRESET: MountainOpacityPreset = 'balanced';

export const MAP_VISUAL_CONFIG = {
  mountainOpacity: MOUNTAIN_OPACITY_PRESETS[ACTIVE_MOUNTAIN_OPACITY_PRESET],
} as const;

export const BUILD_TICKS_REQUIRED = 3;
export const UPGRADE_TICKS_REQUIRED = 4;
export const MAX_BUILDING_LEVEL = 5;

/** Soldiers gathered per tick during recruitment with no barracks. */
export const RECRUIT_BASE_PER_TICK = 150;
/** Extra fraction of the base gather rate added per cumulative barracks level. */
export const RECRUIT_BARRACKS_BONUS = 0.5;

/** Food consumed per tick per 100 soldiers (rounded up, min 1). */
export const ARMY_RATION_USE_PER_100 = 1;
/** Supplies consumed per tick per 150 soldiers (rounded up, min 1). */
export const ARMY_PROVISION_USE_PER_150 = 1;
/** Below this many ticks of rations remaining, morale erodes slowly. */
export const ARMY_LOW_RATION_TICKS = 3;
export const ARMY_MORALE_LOSS_LOW_RATIONS = 2;
export const ARMY_MORALE_LOSS_NO_RATIONS = 8;
export const ARMY_MORALE_LOSS_NO_PROVISIONS = 3;
/** Fraction of each unit type lost per tick while starving (no rations). */
export const ARMY_STARVATION_ATTRITION = 0.05;
/** March-speed multiplier applied while an army has 0 provisions. */
export const ARMY_NO_PROVISION_SPEED_PENALTY = 0.7;

/** Default/step values for the "send with army" sliders in the Army screen. */
export const ARMY_LOGISTICS_STEP = 50;
export const ARMY_DEFAULT_RATIONS = 300;
export const ARMY_DEFAULT_PROVISIONS = 200;
