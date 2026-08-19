/**
 * Ink-wash rendering for items drawn on top of the map: settlements, resource
 * clusters (farms/mines), and army/progress badges. Pairs with `MapRenderer` for
 * terrain/background and `inkTheme` for shared palette/brush helpers.
 */
import Phaser from 'phaser';
import { COLORS } from '../game/constants';
import { INK, brushStroke } from './inkTheme';
import { compactNumber } from '../utils/format';
import { IsoBuildingRenderer } from './IsoBuildingRenderer';
import { SoldierRenderer } from './SoldierRenderer';
import type { HostKit } from './ink/devices';
import type { LandBuildingType } from '../state/types';
import { UI_FONT } from './fonts';
import { AtlasMapItemRenderer } from './AtlasMapItemRenderer';
import { DongHoMapItemRenderer } from './DongHoMapItemRenderer';
import { InkMapItemRenderer } from './InkMapItemRenderer';
import { createPlayerLandFlag } from './playerFlag';
import { getActiveMapTheme, type MapThemeDefinition, type MapThemeRendererId } from './mapTheme';

/**
 * The strip under a settlement that its name plate occupies, in node-local units.
 *
 * Shared because both halves of the collision need it: `MapScene` places the plate here, and the
 * item renderer claims the same ground so no roof, tree or buffalo is dealt it. A name plate
 * printed across the village it names was the most common overlap on the map, and neither side
 * could fix it alone.
 */
export const LABEL_KEEP_OUT = { y: 48, rx: 52, ry: 11 };


export type ProgressBadgeVariant = 'acquisition' | 'build' | 'siege' | 'recruit';
export interface MapItemRenderer {
  addBuildingGroup(cluster: Phaser.GameObjects.Container, x: number, y: number, isShrine: boolean, houseCount: number): void;
  addCityCluster(cluster: Phaser.GameObjects.Container, centers: ReadonlyArray<{ x: number; y: number }>, isShrine: boolean, kind?: 'city' | 'market' | 'shrine'): void;
  drawCityWall(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>): void;
  /**
   * The lanes inside a walled town. Optional: a renderer that does not implement it gets the
   * default brush track between every pair of adjacent seat hexes.
   */
  drawCityRoad?(graphics: Phaser.GameObjects.Graphics, segments: Array<[number, number, number, number]>): void;
  addCottage(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void;
  addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void;
  createFarmCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container;
  createMineCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container;
  createBuildingGlyph(building: LandBuildingType, x: number, y: number): Phaser.GameObjects.GameObject[];
  createTraveler(): Phaser.GameObjects.Container;
  createCart(): Phaser.GameObjects.Container;
  /** `kingdomColor` distinguishes one rival empire's host from another's. */
  /**
   * A host on the map. `flagSeed` picks the standard the host carries: the player's realm seed
   * (the same standard its provinces fly) or a stable per-kingdom seed for a rival — a host used
   * to be seeded by its own headcount, so its banner changed style as it took casualties.
   */
  /**
   * `kit` is what the host is wearing and carrying — its era, its elite tier and its real
   * composition. Optional, so a renderer or caller that does not care still gets a soldier.
   */
  /**
   * `drawScale` overrides the one scale the map draws everything at.
   *
   * The battle screen is not the map. It is a set piece two hundred and sixty units wide with
   * nothing else in it, and drawing its hosts at the map's `GROUND_SCALE` put six-pixel soldiers
   * in the middle of it — which is why the field read as empty paper with two smudges on it. The
   * default is still the map's scale, so every other call site is unchanged.
   */
  createArmyMarker(
    total: number, isPlayer: boolean, kingdomColor?: number, flagSeed?: number, kit?: HostKit,
    drawScale?: number,
  ): Phaser.GameObjects.Container;
  createSelectionFlag(): Phaser.GameObjects.Container;
  createPlayerLandFlag(isCapital?: boolean, styleSeed?: number): Phaser.GameObjects.Container;
  createCapitalHighlight(): Phaser.GameObjects.Graphics;
  createDestinationArrow(): Phaser.GameObjects.Container;
  createProgressBadge(x: number, y: number, progress: number, required: number, variant: ProgressBadgeVariant): Phaser.GameObjects.Container;
}

export function createMapItemRenderer(scene: Phaser.Scene): MapItemRenderer {
  const theme = getActiveMapTheme();
  return itemRendererFactories[theme.renderers.items](scene, theme);
}

const itemRendererFactories: Record<MapThemeRendererId, (scene: Phaser.Scene, theme: MapThemeDefinition) => MapItemRenderer> = {
  atlas: (scene, theme) => new AtlasMapItemRenderer(scene, theme),
  ink: (scene) => new InkMapItemRenderer(scene),
  dongho: (scene) => new DongHoMapItemRenderer(scene),
};

export { InkMapItemRenderer };
