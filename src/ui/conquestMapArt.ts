import type Phaser from 'phaser';
import type { ArmyWardrobe } from '../state/types';
import type { Stamp, StampBox } from './ink/stamp';

export type ConquestArtFamily =
  | 'flora' | 'settlements' | 'buildings' | 'terrain' | 'life' | 'markers' | 'figures';
export type ConquestArtSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type ConquestArtProjection =
  | 'isometric-30' | 'front-orthographic-30' | 'character-facing' | 'flat-overlay';
export type ConquestArtCamera =
  | 'southwest-dimetric-30' | 'front-centered-elevation-30' | 'character-facing' | 'screen-space';

export type ConquestArtScaleClass =
  | 'small-prop' | 'house' | 'civic-building' | 'tower' | 'industry'
  | 'rural-settlement' | 'village' | 'town' | 'citadel';

/**
 * A semantic world-size contract for authored art.
 *
 * Fitting every PNG into the same rectangle made a shallow farmstead larger than a tall citadel:
 * the transparent crop and aspect ratio, rather than the depicted architecture, chose the scale.
 * A reviewed asset now states how tall it is on the map. The source aspect ratio still decides its
 * width, and `maxWorldWidth` is only a safety rail for unusually wide masters.
 */
export interface ConquestArtScaleContract {
  class: ConquestArtScaleClass;
  worldHeight: number;
  maxWorldWidth?: number;
}

export interface ConquestArtAsset {
  id: string;
  family: ConquestArtFamily;
  /** Path below `public/`; omitted when the procedural fallback won review. */
  path?: string;
  textureKey?: string;
  /** Normalised authored-image anchor. World props use bottom-centre foot contact. */
  anchor: Readonly<{ x: number; y: number }>;
  /** Intended footprint around the world anchor, in design units. */
  designBounds: Readonly<StampBox>;
  runtimeScale: number;
  /** Fixed semantic display size for structures; dynamic terrain continues to fit caller geometry. */
  scaleContract?: Readonly<ConquestArtScaleContract>;
  projection: ConquestArtProjection;
  /** Camera contract used to author world-space sprites; prevents mixed frontal/isometric art. */
  cameraView: ConquestArtCamera;
  /** Buildings/settlements contain no baked people or tile surfaces. */
  contentPolicy?: 'structure-only-transparent';
  bakedPeople?: false;
  bakedTerrain?: false;
  /** Character sheets are authored facing viewer-right; opposing hosts mirror at runtime. */
  nativeFacing?: -1 | 1;
  season?: ConquestArtSeason;
  state?: string;
  theme?: ArmyWardrobe | string;
  proceduralFallback: string;
  accepted: boolean;
}

const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
const flora = ['tree', 'grass', 'bamboo', 'banana', 'areca', 'banyan'] as const;
const authoredTreeVariants = ['tree-jackfruit', 'tree-lychee', 'tree-pomelo', 'tree-silk-cotton'] as const;
const authoredKarstVariants = [
  'karst-classic', 'karst-three-spire', 'karst-seven-spire', 'karst-stepped', 'karst-tower',
] as const;
const settlements = [
  'hamlet', 'village', 'market-town', 'shrine-village', 'farmstead', 'mine-camp',
  'citadel-dinh', 'citadel-ly', 'citadel-tran', 'citadel-le', 'citadel-nguyen',
] as const;
const buildings = [
  'thatched-house', 'tiled-house', 'communal-hall', 'pagoda-tower', 'swept-yard', 'village-pond',
  'bamboo-hedge', 'kitchen', 'buffalo-byre', 'grain-bin', 'well', 'haystack',
  'mine-bank', 'mine-adit', 'mine-timbers', 'spoil-heap', 'baskets', 'mine-worker',
  'improvement-farm', 'improvement-mine', 'improvement-market', 'improvement-wall',
  'improvement-tower', 'improvement-barracks', 'improvement-communal-hall',
  'improvement-harbor', 'improvement-workshop', 'improvement-guild', 'improvement-university',
] as const;
const terrain = [
  'diep-paper', 'plains', 'dry-fields', 'forest-floor', 'fortress-ground', 'shrine-ground',
  'paddy-flooded', 'paddy-fallow', 'paddy-transplanted', 'paddy-ripe', 'paddy-nursery',
  'paddy-system-flooded', 'paddy-system-fallow', 'paddy-system-transplanted',
  'paddy-system-ripe', 'paddy-system-nursery',
  'water-surface', 'shoreline-brush', 'water-flow', 'karst-range', 'soft-ridge', 'road-brush',
  'town-lane', 'timber-bridge', 'fog-cloud', 'distant-haze', 'winter-mist', 'spring-blossom',
] as const;
const life = [
  'farmer', 'traveler', 'buffalo', 'buffalo-rider', 'calf', 'ox-cart', 'egret-up', 'egret-down',
  'spring-petal', 'autumn-leaf', 'winter-snow',
] as const;
const markers = [
  'flag-yellow-seal', 'flag-red-moon', 'flag-layered-square', 'flag-red-fringe-yellow',
  'flag-yellow-medallion', 'flag-ngu-sac', 'rival-flag-yellow-seal', 'rival-flag-red-moon',
  'rival-flag-layered-square', 'rival-flag-red-fringe-yellow', 'rival-flag-yellow-medallion',
  'rival-flag-ngu-sac', 'capital-standard', 'destination-standard', 'selection-seal',
  'capital-highlight', 'acquisition', 'build', 'recruit', 'siege', 'battle', 'march-dust',
  'route-brush',
] as const;
const themes: readonly ArmyWardrobe[] = [
  'dinh', 'ly', 'tran', 'le', 'trinh', 'nguyenLord', 'tayson', 'nguyen',
  'song', 'yuan', 'ming', 'qing', 'champa',
];
const tiers = ['levy', 'trained', 'royal'] as const;
// The game has two ranged composition slots for backwards compatibility. Both deliberately use
// the single reviewed third-column ranged pose from the four-visual army contract.
const arms = ['spear', 'sword', 'skirmish', 'bow', 'mounted'] as const;
const rejectedTerrain = new Set<(typeof terrain)[number]>([
  'diep-paper', 'plains', 'dry-fields', 'forest-floor', 'fortress-ground', 'shrine-ground',
  // The single rectangular plates read as loose UI tiles at wide zoom.  They remain in review,
  // but the connected shared-bund field systems below are the accepted runtime family.
  'paddy-flooded', 'paddy-fallow', 'paddy-transplanted', 'paddy-ripe', 'paddy-nursery',
  'water-surface', 'shoreline-brush', 'water-flow', 'road-brush', 'town-lane',
  'fog-cloud', 'distant-haze', 'winter-mist', 'spring-blossom',
]);
const rejectedBuildings = new Set<(typeof buildings)[number]>(['mine-worker']);

const foot = { left: -16, right: 16, top: -48, bottom: 4 } as const;
// A pony is wider and the rider taller than the foot box. Keeping foot-sized metadata here hid
// the extraction mistake: the source PNG had already lost everything outside its nominal cell.
const mounted = { left: -28, right: 34, top: -79, bottom: 5 } as const;
const settlementBounds = { left: -90, right: 90, top: -76, bottom: 24 } as const;
const buildingBounds = { left: -28, right: 28, top: -46, bottom: 6 } as const;
const terrainBounds = { left: -48, right: 48, top: -42, bottom: 42 } as const;
const markerBounds = { left: -18, right: 18, top: -42, bottom: 5 } as const;

function acceptedAsset(
  id: string,
  family: ConquestArtFamily,
  designBounds: StampBox,
  extra: Partial<Pick<
    ConquestArtAsset,
    'season' | 'state' | 'theme' | 'runtimeScale' | 'scaleContract' | 'anchor' | 'projection'
  >> = {},
  accepted = true,
): ConquestArtAsset {
  return {
    id,
    family,
    path: accepted ? `art/conquest-dongho/${id.replaceAll('.', '/')}.png` : undefined,
    textureKey: accepted ? `conquest-art:${id}` : undefined,
    anchor: extra.anchor ?? { x: 0.5, y: family === 'terrain' ? 0.5 : 0.96 },
    designBounds,
    runtimeScale: extra.runtimeScale ?? 1,
    scaleContract: extra.scaleContract,
    projection: extra.projection ?? 'flat-overlay',
    cameraView: (extra.projection ?? 'flat-overlay') === 'front-orthographic-30'
      ? 'front-centered-elevation-30'
      : (extra.projection ?? 'flat-overlay') === 'isometric-30'
        ? 'southwest-dimetric-30'
        : (extra.projection ?? 'flat-overlay') === 'character-facing'
          ? 'character-facing'
          : 'screen-space',
    contentPolicy: family === 'settlements' || family === 'buildings'
      ? 'structure-only-transparent'
      : undefined,
    bakedPeople: family === 'settlements' || family === 'buildings' ? false : undefined,
    bakedTerrain: family === 'settlements' || family === 'buildings' ? false : undefined,
    nativeFacing: family === 'figures' ? 1 : undefined,
    season: extra.season,
    state: extra.state,
    theme: extra.theme,
    proceduralFallback: accepted
      ? `current procedural ${family} renderer when missing, corrupt, unloaded, or overridden`
      : 'current procedural renderer (generated review limit exhausted)',
    accepted,
  };
}

const floraBounds: Record<(typeof flora)[number], StampBox> = {
  tree: { left: -13, right: 13, top: -25, bottom: 3 },
  grass: { left: -3, right: 3, top: -3, bottom: 1 },
  bamboo: { left: -11, right: 11, top: -25, bottom: 3 },
  banana: { left: -8, right: 8, top: -13, bottom: 2 },
  areca: { left: -7, right: 7, top: -31, bottom: 3 },
  banyan: { left: -25, right: 25, top: -43, bottom: 4 },
};

const lifeBounds: Record<(typeof life)[number], StampBox> = {
  farmer: { left: -6, right: 6, top: -12, bottom: 2 },
  traveler: { left: -10, right: 10, top: -31, bottom: 4 },
  buffalo: { left: -23, right: 23, top: -25, bottom: 5 },
  'buffalo-rider': { left: -24, right: 24, top: -34, bottom: 5 },
  calf: { left: -14, right: 14, top: -17, bottom: 4 },
  'ox-cart': { left: -29, right: 29, top: -29, bottom: 6 },
  'egret-up': { left: -15, right: 15, top: -10, bottom: 10 },
  'egret-down': { left: -15, right: 15, top: -10, bottom: 10 },
  'spring-petal': { left: -4, right: 4, top: -4, bottom: 4 },
  'autumn-leaf': { left: -4, right: 4, top: -4, bottom: 4 },
  'winter-snow': { left: -4, right: 4, top: -4, bottom: 4 },
};

const floraRuntimeScale: Record<(typeof flora)[number], number> = {
  tree: 0.86,
  grass: 0.72,
  bamboo: 0.90,
  banana: 0.85,
  areca: 0.92,
  banyan: 0.94,
};

const BUILDING_SCALE: Record<(typeof buildings)[number], ConquestArtScaleContract> = {
  'thatched-house': { class: 'house', worldHeight: 15 },
  'tiled-house': { class: 'house', worldHeight: 15 },
  'communal-hall': { class: 'civic-building', worldHeight: 18 },
  'pagoda-tower': { class: 'tower', worldHeight: 36, maxWorldWidth: 20 },
  'swept-yard': { class: 'small-prop', worldHeight: 7 },
  'village-pond': { class: 'small-prop', worldHeight: 8 },
  'bamboo-hedge': { class: 'small-prop', worldHeight: 9 },
  kitchen: { class: 'house', worldHeight: 13 },
  'buffalo-byre': { class: 'house', worldHeight: 12 },
  'grain-bin': { class: 'small-prop', worldHeight: 13, maxWorldWidth: 13 },
  well: { class: 'small-prop', worldHeight: 9, maxWorldWidth: 10 },
  haystack: { class: 'small-prop', worldHeight: 8, maxWorldWidth: 10 },
  'mine-bank': { class: 'industry', worldHeight: 14 },
  'mine-adit': { class: 'industry', worldHeight: 14 },
  'mine-timbers': { class: 'industry', worldHeight: 12 },
  'spoil-heap': { class: 'small-prop', worldHeight: 7 },
  baskets: { class: 'small-prop', worldHeight: 6 },
  'mine-worker': { class: 'small-prop', worldHeight: 10 },
  'improvement-farm': { class: 'industry', worldHeight: 12 },
  'improvement-mine': { class: 'industry', worldHeight: 16 },
  'improvement-market': { class: 'civic-building', worldHeight: 13 },
  // A completed wall is fitted around its settlement by the caller. This value is the standalone
  // fallback size used by galleries and any future non-enclosure placement.
  'improvement-wall': { class: 'civic-building', worldHeight: 16 },
  'improvement-tower': { class: 'tower', worldHeight: 22, maxWorldWidth: 16 },
  'improvement-barracks': { class: 'civic-building', worldHeight: 14 },
  'improvement-communal-hall': { class: 'civic-building', worldHeight: 17 },
  'improvement-harbor': { class: 'industry', worldHeight: 17 },
  'improvement-workshop': { class: 'industry', worldHeight: 15 },
  'improvement-guild': { class: 'civic-building', worldHeight: 17 },
  'improvement-university': { class: 'civic-building', worldHeight: 17 },
};

/**
 * Total compound heights are deliberately hierarchical. Individual roofs inside the rural
 * composites land near the procedural 11–15 px house height; citadels retain monumental mass.
 */
const SETTLEMENT_SCALE: Record<(typeof settlements)[number], ConquestArtScaleContract> = {
  hamlet: { class: 'rural-settlement', worldHeight: 38 },
  village: { class: 'village', worldHeight: 44 },
  'market-town': { class: 'town', worldHeight: 48 },
  'shrine-village': { class: 'town', worldHeight: 52 },
  farmstead: { class: 'rural-settlement', worldHeight: 34 },
  'mine-camp': { class: 'rural-settlement', worldHeight: 38 },
  'citadel-dinh': { class: 'citadel', worldHeight: 76 },
  'citadel-ly': { class: 'citadel', worldHeight: 78 },
  'citadel-tran': { class: 'citadel', worldHeight: 78 },
  'citadel-le': { class: 'citadel', worldHeight: 86 },
  'citadel-nguyen': { class: 'citadel', worldHeight: 82, maxWorldWidth: 116 },
};

const lifeRuntimeScale: Record<(typeof life)[number], number> = {
  farmer: 0.82,
  traveler: 0.42,
  buffalo: 0.90,
  'buffalo-rider': 0.88,
  calf: 0.72,
  'ox-cart': 0.70,
  'egret-up': 0.90,
  'egret-down': 0.90,
  'spring-petal': 0.55,
  'autumn-leaf': 0.55,
  'winter-snow': 0.55,
};

function markerRuntimeScale(state: (typeof markers)[number]): number {
  if (state === 'selection-seal' || state === 'capital-highlight') return 0.85;
  if (['acquisition', 'build', 'recruit', 'siege', 'battle', 'march-dust', 'route-brush'].includes(state)) {
    return 0.68;
  }
  return 0.72;
}

export const CONQUEST_MAP_ART: readonly ConquestArtAsset[] = [
  ...seasons.flatMap((season) => flora.map((plant) => acceptedAsset(
    `flora.${plant}.${season}`, 'flora', floraBounds[plant], {
      season, runtimeScale: floraRuntimeScale[plant], projection: 'isometric-30',
    },
  ))),
  ...seasons.flatMap((season) => authoredTreeVariants.map((variant) => acceptedAsset(
    `flora.${variant}.${season}`, 'flora', floraBounds.tree, {
      season, state: variant, runtimeScale: floraRuntimeScale.tree, projection: 'isometric-30',
    },
  ))),
  ...settlements.map((state) => acceptedAsset(
    `settlement.${state}`, 'settlements', settlementBounds,
    {
      state,
      theme: state.startsWith('citadel-') ? state.slice('citadel-'.length) : undefined,
      scaleContract: SETTLEMENT_SCALE[state],
      projection: 'front-orthographic-30',
    },
  )),
  ...buildings.map((state) => acceptedAsset(`building.${state}`, 'buildings', buildingBounds, {
    state, scaleContract: BUILDING_SCALE[state], projection: 'front-orthographic-30',
  }, !rejectedBuildings.has(state))),
  ...terrain.map((state) => acceptedAsset(`terrain.${state}`, 'terrain', terrainBounds, {
    state,
    anchor: { x: 0.5, y: 0.5 },
    projection: state.startsWith('paddy-') || state === 'timber-bridge'
      ? 'front-orthographic-30'
      : 'isometric-30',
  }, !rejectedTerrain.has(state))),
  ...authoredKarstVariants.map((state) => acceptedAsset(`terrain.${state}`, 'terrain', terrainBounds, {
    state, anchor: { x: 0.5, y: 0.96 }, projection: 'isometric-30',
  })),
  ...life.map((state) => acceptedAsset(`life.${state}`, 'life', lifeBounds[state], {
    state,
    runtimeScale: lifeRuntimeScale[state],
    // Egrets cross the sky rather than stand on the ground. Both wing frames share a centred
    // transparent canvas, so a centred anchor keeps the body level throughout the wingbeat.
    anchor: state.startsWith('egret-') ? { x: 0.5, y: 0.5 } : undefined,
    projection: state.endsWith('petal') || state.endsWith('leaf') || state.endsWith('snow')
      ? 'flat-overlay'
      : 'character-facing',
  })),
  ...markers.map((state) => acceptedAsset(`marker.${state}`, 'markers', markerBounds, {
    state, runtimeScale: markerRuntimeScale(state), projection: 'flat-overlay',
  })),
  ...themes.flatMap((theme) => tiers.flatMap((tier) => arms.map((arm) => acceptedAsset(
    `figure.${theme}.${tier}.${arm}`, 'figures', arm === 'mounted' ? mounted : foot,
    {
      state: `${tier}.${arm}`, theme, projection: 'character-facing',
      // Mounted sprites use a 432-unit normalization board instead of the nominal 384-unit cell
      // so the full pony fits. This reciprocal compensation preserves rider/body height.
      runtimeScale: arm === 'mounted' ? 1.33 : 1.51,
    },
  )))),
] as const;

const TREE_ART_IDS = ['tree', ...authoredTreeVariants] as const;

/** Five reviewed silhouettes, selected from the fixed scatter seed so repainting never replants. */
export function conquestTreeArtId(season: ConquestArtSeason, seed: number): string {
  const index = Math.abs(Math.trunc(seed)) % TREE_ART_IDS.length;
  return `flora.${TREE_ART_IDS[index]}.${season}`;
}

/** Five normalized limestone silhouettes; all share a 240×160 bottom-centred runtime canvas. */
export function conquestKarstArtId(seed: number): string {
  const index = Math.abs(Math.trunc(seed)) % authoredKarstVariants.length;
  return `terrain.${authoredKarstVariants[index]}`;
}

const byId = new Map(CONQUEST_MAP_ART.map((asset) => [asset.id, asset] as const));

export function conquestArtAsset(id: string): ConquestArtAsset | undefined {
  return byId.get(id);
}

/** `?mapart=procedural` is the baseline and emergency rollback switch. */
export function proceduralConquestArtForced(): boolean {
  try {
    const query = new URLSearchParams(window.location.search).get('mapart');
    if (query) return query === 'procedural';
    return localStorage.getItem('mandate:conquest-map-art:v1') === 'procedural';
  } catch {
    return false;
  }
}

export function preloadConquestMapArt(scene: Phaser.Scene, baseUrl: string): void {
  if (proceduralConquestArtForced()) return;
  for (const asset of CONQUEST_MAP_ART) {
    if (asset.accepted && asset.path && asset.textureKey) {
      scene.load.image(asset.textureKey, `${baseUrl}${asset.path}`);
    }
  }
}

export function hasConquestMapArt(scene: Phaser.Scene, id: string): boolean {
  const asset = byId.get(id);
  return !proceduralConquestArtForced()
    && asset?.accepted === true
    && asset.textureKey !== undefined
    && scene.textures.exists(asset.textureKey);
}

export interface ConquestArtDisplayMetrics {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  scale: number;
}

export interface ConquestArtStampOptions {
  /** Bypass a fixed semantic contract for geometry that must fit a caller-owned enclosure. */
  sizing?: 'contract' | 'fit-bounds';
}

function displayScale(
  asset: ConquestArtAsset,
  source: { width: number; height: number },
  bounds: StampBox,
  options: ConquestArtStampOptions,
): number {
  const contract = options.sizing === 'fit-bounds' ? undefined : asset.scaleContract;
  if (contract) {
    let scale = contract.worldHeight / source.height;
    if (contract.maxWorldWidth !== undefined) {
      scale = Math.min(scale, contract.maxWorldWidth / source.width);
    }
    return scale * asset.runtimeScale;
  }
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  return Math.min(width / source.width, height / source.height) * asset.runtimeScale;
}

/** Adapts one authored PNG to the existing stamp contract without changing any caller geometry. */
export function conquestArtStamp(
  scene: Phaser.Scene,
  id: string,
  box?: StampBox,
  options: ConquestArtStampOptions = {},
): Stamp | undefined {
  const asset = byId.get(id);
  if (!asset?.textureKey || !hasConquestMapArt(scene, id)) return undefined;
  const source = scene.textures.get(asset.textureKey).getSourceImage() as { width: number; height: number };
  if (!source?.width || !source?.height) return undefined;
  const bounds = box ?? asset.designBounds;
  const scale = displayScale(asset, source, bounds, options);
  return {
    key: `generated:${id}`,
    texture: asset.textureKey,
    originX: asset.anchor.x,
    originY: asset.anchor.y,
    scale,
    width: source.width,
    height: source.height,
  };
}

/** Exact world rectangle a placed authored image occupies, shared by rendering and collision. */
export function conquestArtDisplayMetrics(
  scene: Phaser.Scene,
  id: string,
  box?: StampBox,
  options: ConquestArtStampOptions = {},
): ConquestArtDisplayMetrics | undefined {
  const asset = byId.get(id);
  const stamp = conquestArtStamp(scene, id, box, options);
  if (!asset || !stamp) return undefined;
  const width = stamp.width * stamp.scale;
  const height = stamp.height * stamp.scale;
  return {
    width,
    height,
    left: -asset.anchor.x * width,
    right: (1 - asset.anchor.x) * width,
    top: -asset.anchor.y * height,
    bottom: (1 - asset.anchor.y) * height,
    scale: stamp.scale,
  };
}
