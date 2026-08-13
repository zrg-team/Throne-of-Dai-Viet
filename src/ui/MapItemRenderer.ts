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
import type { LandBuildingType } from '../state/types';
import { UI_FONT } from './fonts';
import { AtlasMapItemRenderer } from './AtlasMapItemRenderer';
import { DongHoMapItemRenderer } from './DongHoMapItemRenderer';
import { InkMapItemRenderer } from './InkMapItemRenderer';
import { createPlayerLandFlag } from './playerFlag';
import { getActiveMapTheme, type MapThemeDefinition, type MapThemeRendererId } from './mapTheme';

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
  createArmyMarker(total: number, isPlayer: boolean, kingdomColor?: number): Phaser.GameObjects.Container;
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
