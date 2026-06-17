import type Phaser from 'phaser';
import type { LandType } from '../state/types';
import type { PixelPoint } from './hex';
import { INK } from '../ui/inkTheme';
import {
  decorateFields,
  decorateFortress,
  decorateForest,
  decorateHills,
  decorateMountains,
  decoratePlains,
  decorateRiceFields,
  decorateWater,
} from '../ui/MapRenderer';

export type HexTerrainType =
  | 'plains'
  | 'fields'
  | 'riceFields'
  | 'forest'
  | 'mountains'
  | 'hills'
  | 'water'
  | 'fortress'
  | 'shrine';

export interface TerrainDef {
  color: number;
  /** Land types that prefer this terrain when filling a zone's interior hexes. */
  preferredFor: LandType[];
  /** Relative chance of being picked among matching preferredFor candidates. */
  weight: number;
  /** Optional decorative drawing for a single hex, drawn into the shared terrain Graphics. */
  decorate?: (graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number) => void;
  /**
   * Optional decorative drawing for a contiguous group of same-terrain hexes, drawn once per
   * group instead of once per hex so adjacent tiles read as one merged feature (e.g. a single
   * mountain range instead of repeated identical peaks). Takes priority over `decorate`.
   */
  decorateRegion?: (
    graphics: Phaser.GameObjects.Graphics,
    centers: PixelPoint[],
    size: number,
    rng: () => number,
  ) => void;
}

const ALL_LAND_TYPES: LandType[] = ['castle', 'farm', 'market', 'iron', 'temple', 'enemyCastle', 'wilderness'];

export const TERRAIN_REGISTRY: Record<HexTerrainType, TerrainDef> = {
  plains: {
    color: INK.landPlains,
    preferredFor: ALL_LAND_TYPES,
    weight: 2,
    decorate: decoratePlains,
  },
  fields: {
    color: INK.landFields,
    preferredFor: ['farm'],
    weight: 3,
    decorate: decorateFields,
  },
  riceFields: {
    color: INK.landRice,
    preferredFor: ['farm'],
    weight: 2,
    decorate: decorateRiceFields,
  },
  forest: {
    color: INK.landForest,
    preferredFor: ['farm', 'wilderness'],
    weight: 1,
    decorateRegion: decorateForest,
  },
  mountains: {
    color: INK.mountain,
    preferredFor: ['iron', 'wilderness'],
    weight: 2,
    decorateRegion: decorateMountains,
  },
  hills: {
    color: INK.hills,
    preferredFor: ['iron', 'wilderness'],
    weight: 2,
    decorateRegion: decorateHills,
  },
  water: {
    color: INK.sea,
    preferredFor: [],
    weight: 0,
    decorate: decorateWater,
  },
  fortress: {
    color: 0xd4c8a4, // warm limestone / paved-stone platform
    preferredFor: [],
    weight: 0,
    decorate: decorateFortress,
  },
  shrine: {
    color: INK.cloud,
    preferredFor: [],
    weight: 0,
  },
};
