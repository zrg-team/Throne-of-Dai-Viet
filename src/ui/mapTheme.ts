import type { HexTerrainType } from '../map/terrainTypes';
import { INK } from './inkTheme';
import { PIGMENT } from './ink/palette';

export type MapThemeId = 'illustrated-atlas' | 'ink-wash' | 'dong-ho';
export type MapThemeRendererId = 'atlas' | 'ink' | 'dongho';

export interface MapThemePalette {
  paper: number;
  paperLight: number;
  paperShade: number;
  ink: number;
  inkSoft: number;
  terrain: Record<HexTerrainType, number>;
  water: number;
  waterDeep: number;
  waterHighlight: number;
  shore: number;
  fog: number;
  cityRoad: { bed: number; track: number };
  borders: { neutralAlpha: number; ownedAlpha: number };
  minimap: { background: number; border: number; player: number; neutral: number; rival: number; playerArmy: number; rivalArmy: number; viewport: number };
  mapObjects: {
    player: number;
    rival: number;
    selected: number;
    stone: number;
    forest: number;
    roof: number;
    pagodaRoof: number;
    wall: number;
    pagodaWall: number;
    timber: number;
    market: number;
    foliageHighlight: number;
    trunk: number;
  };
}

export interface MapThemeDefinition {
  id: MapThemeId;
  labelKey: 'menu.mapTheme.atlas' | 'menu.mapTheme.ink' | 'menu.mapTheme.dongHo';
  renderers: { environment: MapThemeRendererId; items: MapThemeRendererId; menu: MapThemeRendererId };
  palette: MapThemePalette;
}

export const MAP_THEME_STORAGE_KEY = 'mandate:map-theme:v1';

export const ILLUSTRATED_ATLAS_THEME: MapThemeDefinition = {
  id: 'illustrated-atlas',
  labelKey: 'menu.mapTheme.atlas',
  renderers: { environment: 'atlas', items: 'atlas', menu: 'atlas' },
  palette: {
    paper: 0xe9d8ac,
    paperLight: 0xf4e8c6,
    paperShade: 0xd2bc84,
    ink: 0x33271b,
    inkSoft: 0x6a5a42,
    terrain: {
      plains: 0xadba78,
      fields: 0xc6b974,
      riceFields: 0xbcc684,
      forest: 0x6f8a52,
      mountains: 0x9a8d72,
      hills: 0xa99c70,
      water: 0x60b9d6,
      fortress: 0xb6a78a,
      shrine: 0xf2e6c3,
    },
    water: 0x60b9d6,
    waterDeep: 0x3686a8,
    waterHighlight: 0xa8dde8,
    shore: 0xd9c184,
    fog: 0xe7dfbf,
    cityRoad: { bed: 0xf2e6c3, track: 0x9c7548 },
    borders: { neutralAlpha: 0.018, ownedAlpha: 0.76 },
    minimap: { background: 0xe6d6a7, border: 0x34291d, player: 0xc84a2d, neutral: 0x675842, rival: 0x3f4c50, playerArmy: 0xf2e6c3, rivalArmy: 0x3f4c50, viewport: 0x34291d },
    mapObjects: {
      player: 0xc8542d, rival: 0x40484c, selected: 0xf0b948, stone: 0xb6a78a, forest: 0x6f8a52,
      roof: 0x8a5a3b, pagodaRoof: 0x5a4432, wall: 0xd9c79c, pagodaWall: 0xe0cea0,
      timber: 0x9c6e40, market: 0xd89b43, foliageHighlight: 0x8aa566, trunk: 0x6c5134,
    },
  },
};

export const INK_WASH_THEME: MapThemeDefinition = {
  id: 'ink-wash',
  labelKey: 'menu.mapTheme.ink',
  renderers: { environment: 'ink', items: 'ink', menu: 'ink' },
  palette: {
    paper: INK.sea,
    paperLight: INK.cloud,
    paperShade: INK.seaDeep,
    ink: INK.ink,
    inkSoft: INK.inkSoft,
    terrain: {
      plains: INK.landPlains,
      fields: INK.landFields,
      riceFields: INK.landRice,
      forest: INK.landForest,
      mountains: INK.mountain,
      hills: INK.hills,
      water: INK.sea,
      fortress: 0xd4c8a4,
      shrine: INK.cloud,
    },
    water: INK.sea,
    waterDeep: INK.seaDeep,
    waterHighlight: INK.waterLine,
    shore: 0xd8c27a,
    fog: 0xd7e4ea,
    cityRoad: { bed: 0xc4b890, track: 0xa89870 },
    borders: { neutralAlpha: 0.12, ownedAlpha: 0.9 },
    minimap: { background: 0x0d0a05, border: 0xd9b35a, player: 0x6f8f64, neutral: 0x6b5e3a, rival: 0xaa3a2c, playerArmy: 0xffffff, rivalArmy: 0xff4422, viewport: 0xffffff },
    mapObjects: {
      player: INK.sealRed, rival: INK.ink, selected: 0xf4cf27, stone: 0xd4c8a4, forest: INK.landForest,
      roof: 0x8a6a3f, pagodaRoof: INK.ink, wall: 0xd4c8a4, pagodaWall: INK.cloud,
      timber: 0x8a6a3f, market: 0xc9a37a, foliageHighlight: INK.landForest, trunk: INK.inkSoft,
    },
  },
};

/**
 * Đông Hồ — the woodblock treatment.
 *
 * Every colour is a pigment a Đông Hồ printer actually ground rather than a screen value picked to
 * look pleasant, and the terrain entries are deliberately close together: roughly two-thirds of the
 * map is meant to be bare paper, with sỏi son reserved for the player alone. The saturated per-land
 * ownership fills of the other two themes are replaced by hatching, whose *angle* carries the
 * faction — a second channel, so the map still reads in greyscale.
 */
export const DONG_HO_THEME: MapThemeDefinition = {
  id: 'dong-ho',
  labelKey: 'menu.mapTheme.dongHo',
  renderers: { environment: 'dongho', items: 'dongho', menu: 'dongho' },
  palette: {
    paper: PIGMENT.diep,
    paperLight: PIGMENT.diepHi,
    paperShade: PIGMENT.diepLo,
    ink: PIGMENT.muc,
    inkSoft: PIGMENT.mucSoft,
    terrain: {
      plains: PIGMENT.giDongPale,
      fields: PIGMENT.hoePale,
      riceFields: PIGMENT.giDongPale,
      forest: PIGMENT.giDong,
      mountains: PIGMENT.diepLo,
      hills: PIGMENT.diepLo,
      water: PIGMENT.chamWash,
      fortress: PIGMENT.diepLo,
      shrine: PIGMENT.diepHi,
    },
    water: PIGMENT.chamWash,
    waterDeep: PIGMENT.cham,
    waterHighlight: PIGMENT.chamPale,
    shore: PIGMENT.diepDeep,
    fog: PIGMENT.diepHi,
    // The bed must be DARKER than the paper it crosses. Near-white here drew a pale ribbon
    // through every town that read as a highlight rather than as a beaten track.
    cityRoad: { bed: PIGMENT.diepDeep, track: PIGMENT.nau },
    borders: { neutralAlpha: 0.05, ownedAlpha: 0.55 },
    minimap: {
      background: PIGMENT.diep, border: PIGMENT.muc, player: PIGMENT.son, neutral: PIGMENT.mucFaint,
      rival: PIGMENT.mucSoft, playerArmy: PIGMENT.son, rivalArmy: PIGMENT.muc, viewport: PIGMENT.muc,
    },
    mapObjects: {
      player: PIGMENT.son, rival: PIGMENT.mucSoft, selected: PIGMENT.hoe, stone: PIGMENT.diepLo,
      forest: PIGMENT.giDong, roof: PIGMENT.nau, pagodaRoof: PIGMENT.mucSoft, wall: PIGMENT.diepHi,
      pagodaWall: PIGMENT.diepHi, timber: PIGMENT.nauDark, market: PIGMENT.hoe,
      foliageHighlight: PIGMENT.giDongPale, trunk: PIGMENT.nau,
    },
  },
};

export const MAP_THEMES: Record<MapThemeId, MapThemeDefinition> = {
  'dong-ho': DONG_HO_THEME,
  'illustrated-atlas': ILLUSTRATED_ATLAS_THEME,
  'ink-wash': INK_WASH_THEME,
};

export const MAP_THEME_OPTIONS = Object.values(MAP_THEMES);

/** Đông Hồ is the default for new devices; the chosen style is an application preference, not save data. */
export function getMapTheme(): MapThemeId {
  if (typeof localStorage === 'undefined') return 'dong-ho';
  const stored = localStorage.getItem(MAP_THEME_STORAGE_KEY);
  return stored === 'ink-wash' || stored === 'illustrated-atlas' || stored === 'dong-ho' ? stored : 'dong-ho';
}

export function getActiveMapTheme(): MapThemeDefinition {
  return MAP_THEMES[getMapTheme()];
}

export function setMapTheme(theme: MapThemeId): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(MAP_THEME_STORAGE_KEY, theme);
}

export function terrainColor(terrain: HexTerrainType, fallback: number): number {
  return getActiveMapTheme().palette.terrain[terrain] ?? fallback;
}
