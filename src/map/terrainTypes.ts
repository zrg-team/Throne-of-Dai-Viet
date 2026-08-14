import type { LandType } from '../state/types';
import { INK } from '../ui/inkTheme';
import { terrainColor } from '../ui/mapTheme';

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
}

const ALL_LAND_TYPES: LandType[] = ['castle', 'farm', 'market', 'iron', 'temple', 'enemyCastle', 'wilderness'];

/**
 * Weights are the only terrain-mix tuning surface there is — there is no map config for this.
 *
 * A farm province used to draw from plains 2 / fields 3 / riceFields 2 / forest 1, which made it
 * **62.5% paddy**. Paddy is also the only high-frequency texture on the map (about eight inked plots
 * per hex against one or two props on open ground), and provinces are contiguous blobs, so those
 * tiles landed as a few large solid patches and the whole country read as farmland. Cutting both
 * paddy weights to 1 puts a farm province at 40% paddy / 40% plains / 20% forest.
 *
 * `plains` is deliberately left at 2 rather than raised: it is shared by every land type, and
 * raising it would thin the limestone out of the iron provinces as a side effect.
 */
export const TERRAIN_REGISTRY: Record<HexTerrainType, TerrainDef> = {
  plains: {
    color: INK.landPlains,
    preferredFor: ALL_LAND_TYPES,
    weight: 2,
  },
  fields: {
    color: INK.landFields,
    preferredFor: ['farm'],
    weight: 1,
  },
  riceFields: {
    color: INK.landRice,
    preferredFor: ['farm'],
    weight: 1,
  },
  forest: {
    color: INK.landForest,
    preferredFor: ['farm', 'wilderness'],
    weight: 1,
  },
  mountains: {
    color: INK.mountain,
    preferredFor: ['iron', 'wilderness'],
    weight: 2,
  },
  hills: {
    color: INK.hills,
    preferredFor: ['iron', 'wilderness'],
    weight: 2,
  },
  water: {
    color: INK.sea,
    preferredFor: [],
    weight: 0,
  },
  fortress: {
    color: 0xd4c8a4, // warm limestone / paved-stone platform
    preferredFor: [],
    weight: 0,
  },
  shrine: {
    color: INK.cloud,
    preferredFor: [],
    weight: 0,
  },
};

/** Theme-aware terrain palette while retaining the registry for generation weights. */
export function getTerrainColor(terrain: HexTerrainType): number {
  return terrainColor(terrain, TERRAIN_REGISTRY[terrain].color);
}
