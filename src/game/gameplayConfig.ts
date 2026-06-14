import type { MapGenConfig } from '../map/hexMapGenerator';

export interface GameplayMapConfig extends MapGenConfig {
  neutralDistrictTarget: number;
}

export const GAMEPLAY_MAP_CONFIG: GameplayMapConfig = {
  cols: 30,
  rows: 52,
  hexSize: 18,
  seed: 1337,
  riverHexCount: 92,
  neutralDistrictTarget: 40,
};

export const ACQUISITION_TICKS_REQUIRED = 3;
export const BUILD_TICKS_REQUIRED = 2;
