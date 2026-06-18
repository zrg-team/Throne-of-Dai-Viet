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

export type ProgressBadgeVariant = 'acquisition' | 'build' | 'siege' | 'recruit';
type PlayerFlagStyle = 'yellow-seal' | 'red-moon' | 'layered-square' | 'red-fringe-yellow' | 'yellow-red-medallion';

const PLAYER_FLAG_STYLES: PlayerFlagStyle[] = [
  'yellow-seal',
  'red-moon',
  'layered-square',
  'red-fringe-yellow',
  'yellow-red-medallion',
];

export class InkMapItemRenderer {
  private readonly buildings: IsoBuildingRenderer;
  private readonly soldiers: SoldierRenderer;

  constructor(private readonly scene: Phaser.Scene) {
    this.buildings = new IsoBuildingRenderer(scene);
    this.soldiers = new SoldierRenderer(scene);
  }

  /** A cluster of isometric houses at a single city/shrine hex. */
  addBuildingGroup(cluster: Phaser.GameObjects.Container, x: number, y: number, isShrine: boolean, houseCount: number): void {
    this.buildings.addBuildingGroup(cluster, x, y, isShrine, houseCount);
  }

  /** Unified city cluster: all hex centers rendered as one globally Y-sorted pass with connector buildings. */
  addCityCluster(
    cluster: Phaser.GameObjects.Container,
    centers: ReadonlyArray<{ x: number; y: number }>,
    isShrine: boolean,
    kind?: 'city' | 'market' | 'shrine',
  ): void {
    this.buildings.addCityCluster(cluster, centers, isShrine, kind);
  }

  /** Ink brush-stroke wall outline around a city's contiguous hex cluster. */
  drawCityWall(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>): void {
    for (const [x1, y1, x2, y2] of edges) {
      const seed = Math.round(x1 + y1 * 3 + x2 * 7 + y2 * 11);
      brushStroke(graphics, [{ x: x1, y: y1 }, { x: x2, y: y2 }], 3.5, INK.ink, 0.8, seed);
    }
  }

  /** Small isometric cottage. */
  addCottage(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    this.buildings.addCottage(cluster, x, y, scale);
  }

  /** Small ink rice-paddy patch: wash-fill rect with furrow lines. */
  addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    this.buildings.addCropPatch(cluster, x, y, scale);
  }

  /** Farm village: surrounding crop patches, a barn, and a handful of cottages. */
  createFarmCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    return this.buildings.createFarmCluster(scale, upgradeLevel);
  }

  /** Iron mine village: an ink mound with a dark entrance, a cart, and cottages. */
  createMineCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    return this.buildings.createMineCluster(scale, upgradeLevel);
  }

  /** Small house glyphs for each constructed farm/mine/market building, used as settlement satellites. */
  createBuildingGlyph(building: LandBuildingType, x: number, y: number): Phaser.GameObjects.GameObject[] {
    return this.buildings.createBuildingGlyph(building, x, y);
  }

  /** Tiny ink traveler glyph, used to populate roads between connected settlements. */
  createTraveler(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();

    graphics.fillStyle(INK.ink, 0.8);
    graphics.fillRect(-0.6, -2.2, 1.2, 2.6);

    graphics.fillStyle(0xc9a37a, 1);
    graphics.fillCircle(0, -3, 1.1);

    container.add(graphics);
    return container;
  }

  /** Small ox-cart glyph, used for supply runs travelling roads between farms and cities. */
  createCart(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();

    graphics.fillStyle(INK.ink, 0.85);
    graphics.fillCircle(-3, 3, 2.2);
    graphics.fillCircle(3, 3, 2.2);

    graphics.fillStyle(0x8a6a3f, 0.95);
    graphics.fillRect(-5, -2, 10, 4);
    graphics.lineStyle(0.6, INK.ink, 0.5);
    graphics.strokeRect(-5, -2, 10, 4);

    graphics.fillStyle(0xe3d3a8, 1);
    graphics.fillCircle(-2, -4, 2.4);
    graphics.fillCircle(1.5, -4.2, 2.6);
    graphics.lineStyle(0.5, INK.ink, 0.35);
    graphics.strokeCircle(-2, -4, 2.4);
    graphics.strokeCircle(1.5, -4.2, 2.6);

    container.add(graphics);
    return container;
  }

  /** Red ink seal-stamp army marker with a troop-count glyph and a small marching soldier formation. */
  createArmyMarker(total: number, isPlayer: boolean): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const sealColor = isPlayer ? INK.sealRed : INK.ink;

    const seal = this.scene.add.rectangle(0, -18, 42, 26, sealColor, 0.92).setStrokeStyle(2, INK.inkSoft, 0.9);
    const text = this.scene.add.text(0, -18, compactNumber(total), {
      color: '#f3ede0',
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: '700',
    }).setOrigin(0.5);
    container.add([seal, text]);

    const formation = this.soldiers.createFormation(isPlayer, 12);
    container.add(formation);

    return container;
  }

  /**
   * Gold command-pennant planted beside a selected army's seal marker. Reuses the
   * same gold (`COLORS.selected`) as the map's drag/march indicators so "selected"
   * reads consistently across the UI, and a swallowtail shape keeps it visually
   * distinct from the red destination pennant (`createDestinationArrow`).
   */
  createSelectionFlag(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();

    const poleX = -18;
    const poleTop = -58;
    const poleBottom = -26;

    graphics.lineStyle(2, INK.ink, 0.9);
    graphics.lineBetween(poleX, poleBottom, poleX, poleTop);

    graphics.fillStyle(COLORS.selected, 0.95);
    graphics.beginPath();
    graphics.moveTo(poleX, poleTop);
    graphics.lineTo(poleX + 18, poleTop + 4);
    graphics.lineTo(poleX + 10, poleTop + 9);
    graphics.lineTo(poleX + 18, poleTop + 14);
    graphics.lineTo(poleX, poleTop + 18);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(0.8, INK.ink, 0.6);
    graphics.strokePath();

    container.add(graphics);
    return container;
  }

  /** Seeded dynastic standard marking land owned by the player. */
  createPlayerLandFlag(isCapital = false, styleSeed = 0): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const pole = this.scene.add.graphics();
    const cloth = this.scene.add.graphics();
    const scale = isCapital ? 1.22 : 1;
    const style = pickFlagStyle(styleSeed);
    const poleX = 0;
    const poleTop = -46 * scale;
    const poleBottom = 8 * scale;
    const flagW = (style === 'layered-square' ? 28 : style === 'red-fringe-yellow' ? 29 : 25) * scale;
    const flagH = (style === 'layered-square' ? 22 : style === 'red-fringe-yellow' ? 18 : 17) * scale;

    pole.lineStyle(2.2 * scale, INK.ink, 0.85);
    pole.lineBetween(poleX, poleBottom, poleX, poleTop);
    pole.fillStyle(INK.ink, 0.24);
    pole.fillEllipse(poleX, poleBottom + 2 * scale, 12 * scale, 4 * scale);

    drawPlayerFlagCloth(cloth, style, poleX, poleTop, flagW, flagH, scale, styleSeed);

    this.scene.tweens.add({
      targets: cloth,
      scaleX: { from: 0.96, to: 1.08 },
      skewX: { from: -0.05, to: 0.05 },
      duration: 900 + (isCapital ? 120 : 0),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    container.add([pole, cloth]);
    return container;
  }

  /** Gold ink-wash base behind the player capital so it reads as the seat of power. */
  createCapitalHighlight(): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0xf4cf27, 0.18);
    graphics.fillEllipse(0, 4, 88, 44);
    graphics.lineStyle(2, 0xf4cf27, 0.65);
    graphics.strokeEllipse(0, 4, 92, 48);
    graphics.lineStyle(1.2, INK.sealRed, 0.45);
    graphics.strokeEllipse(0, 4, 72, 34);
    return graphics;
  }

  /** Small ink pennant/flag, planted on a selected army's march destination. */
  createDestinationArrow(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();

    graphics.lineStyle(2, INK.ink, 0.9);
    graphics.lineBetween(0, 6, 0, -16);

    graphics.fillStyle(INK.sealRed, 0.95);
    graphics.beginPath();
    graphics.moveTo(0, -16);
    graphics.lineTo(13, -11);
    graphics.lineTo(0, -6);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(0.6, INK.ink, 0.5);
    graphics.strokePath();

    container.add(graphics);
    return container;
  }

  /** Circular red ink seal with a brush-stroke progress ring, for acquisition/build orders. */
  createProgressBadge(x: number, y: number, progress: number, required: number, variant: ProgressBadgeVariant): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const ratio = Phaser.Math.Clamp(progress / required, 0, 1);
    const ringColor = variant === 'acquisition' || variant === 'siege' ? INK.sealRed : INK.landForest;

    const back = this.scene.add.circle(0, 0, 17, INK.ink, 0.78).setStrokeStyle(2, ringColor, 0.95);
    const wedge = this.scene.add.graphics();
    wedge.fillStyle(ringColor, 0.88);
    wedge.slice(0, 0, 13, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + ratio * 360), false);
    wedge.fillPath();

    container.add([back, wedge]);

    if (variant === 'acquisition') {
      const coin = this.scene.add.circle(0, 0, 6, INK.sealRed, 1).setStrokeStyle(1, INK.cloud, 0.8);
      container.add(coin);
    } else if (variant === 'siege') {
      const swords = this.scene.add.graphics();
      swords.lineStyle(2, INK.cloud, 0.95);
      swords.lineBetween(-6, -6, 6, 6);
      swords.lineBetween(-6, 6, 6, -6);
      container.add(swords);
    } else if (variant === 'recruit') {
      const flag = this.scene.add.graphics();
      flag.lineStyle(2, INK.cloud, 0.95);
      flag.lineBetween(-4, 7, -4, -7);
      flag.fillStyle(INK.cloud, 0.95);
      flag.fillTriangle(-4, -7, -4, -1, 6, -4);
      container.add(flag);
    } else {
      const head = this.scene.add.rectangle(0, -2, 10, 5, INK.cloud, 1).setStrokeStyle(1, INK.ink, 0.8);
      const handle = this.scene.add.rectangle(0, 3, 3, 9, INK.inkSoft, 1);
      container.add([head, handle]);
    }

    const text = this.scene.add.text(0, 23, `${progress}/${required}`, {
      color: '#f3ede0',
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: '700',
      backgroundColor: '#2b332b',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5);
    container.add(text);

    return container;
  }
}

function pickFlagStyle(seed: number): PlayerFlagStyle {
  const index = Math.abs(seed) % PLAYER_FLAG_STYLES.length;
  return PLAYER_FLAG_STYLES[index];
}

function drawPlayerFlagCloth(
  graphics: Phaser.GameObjects.Graphics,
  style: PlayerFlagStyle,
  poleX: number,
  poleTop: number,
  flagW: number,
  flagH: number,
  scale: number,
  seed: number,
): void {
  if (style === 'yellow-seal') {
    drawWavingRect(graphics, poleX, poleTop, flagW, flagH, 0xf4cf27, 0.98, scale);
    graphics.lineStyle(2.2 * scale, INK.ink, 0.62);
    graphics.strokePath();
    graphics.fillStyle(INK.sealRed, 0.94);
    graphics.fillCircle(poleX + flagW * 0.56, poleTop + flagH * 0.5, flagH * 0.32);
    drawPseudoGlyph(graphics, poleX + flagW * 0.56, poleTop + flagH * 0.52, scale * 0.46, INK.ink, seed);
    return;
  }

  if (style === 'red-moon') {
    drawWavingRect(graphics, poleX, poleTop, flagW, flagH, INK.sealRed, 0.98, scale);
    graphics.lineStyle(2.4 * scale, 0xf4cf27, 0.98);
    graphics.strokePath();
    graphics.fillStyle(0xf8f2df, 0.96);
    graphics.fillCircle(poleX + flagW * 0.55, poleTop + flagH * 0.52, flagH * 0.36);
    drawPseudoGlyph(graphics, poleX + flagW * 0.55, poleTop + flagH * 0.55, scale * 0.5, INK.ink, seed + 1);
    return;
  }

  if (style === 'layered-square') {
    drawScallopedFringe(graphics, poleX, poleTop, flagW, flagH, scale, INK.sealRed);
    graphics.fillStyle(0x3c9ced, 0.96);
    graphics.fillRect(poleX + flagW * 0.08, poleTop + flagH * 0.12, flagW * 0.82, flagH * 0.76);
    graphics.fillStyle(0xf4f327, 0.98);
    graphics.fillRect(poleX + flagW * 0.18, poleTop + flagH * 0.22, flagW * 0.62, flagH * 0.56);
    graphics.fillStyle(0x0a6b2f, 0.98);
    graphics.fillRect(poleX + flagW * 0.28, poleTop + flagH * 0.32, flagW * 0.42, flagH * 0.36);
    graphics.fillStyle(INK.sealRed, 0.98);
    graphics.fillRect(poleX + flagW * 0.37, poleTop + flagH * 0.4, flagW * 0.24, flagH * 0.2);
    drawPseudoGlyph(graphics, poleX + flagW * 0.49, poleTop + flagH * 0.52, scale * 0.36, 0xf4f327, seed + 2);
    return;
  }

  if (style === 'red-fringe-yellow') {
    drawScallopedFringe(graphics, poleX, poleTop, flagW, flagH, scale, 0xd4142f);
    graphics.fillStyle(0xf4c50f, 0.98);
    graphics.fillRect(poleX + flagW * 0.08, poleTop + flagH * 0.14, flagW * 0.76, flagH * 0.7);
    if (seed % 2 === 0) {
      graphics.lineStyle(1.7 * scale, 0xd4142f, 0.94);
      graphics.strokeCircle(poleX + flagW * 0.47, poleTop + flagH * 0.49, flagH * 0.28);
      drawPseudoGlyph(graphics, poleX + flagW * 0.47, poleTop + flagH * 0.5, scale * 0.44, INK.ink, seed + 3);
    } else {
      drawPseudoGlyph(graphics, poleX + flagW * 0.48, poleTop + flagH * 0.52, scale * 0.5, 0xd4142f, seed + 4);
    }
    return;
  }

  drawWavingRect(graphics, poleX, poleTop, flagW, flagH, 0xf4cf27, 0.98, scale);
  graphics.lineStyle(2.2 * scale, INK.sealRed, 0.95);
  graphics.strokePath();
  graphics.fillStyle(INK.sealRed, 0.94);
  graphics.fillCircle(poleX + flagW * 0.55, poleTop + flagH * 0.5, flagH * 0.34);
  drawPseudoGlyph(graphics, poleX + flagW * 0.55, poleTop + flagH * 0.53, scale * 0.48, INK.ink, seed + 5);
}

function drawWavingRect(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha: number,
  scale: number,
): void {
  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(x, y);
  graphics.lineTo(x + width * 0.44, y + 1.5 * scale);
  graphics.lineTo(x + width, y);
  graphics.lineTo(x + width, y + height);
  graphics.lineTo(x + width * 0.46, y + height - 1.3 * scale);
  graphics.lineTo(x, y + height);
  graphics.closePath();
  graphics.fillPath();
}

function drawScallopedFringe(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  color: number,
): void {
  graphics.fillStyle(color, 0.96);
  graphics.fillRect(x, y, width, height);
  graphics.lineStyle(1.1 * scale, INK.ink, 0.32);
  graphics.strokeRect(x, y, width, height);
}

function drawPseudoGlyph(
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  scale: number,
  color: number,
  seed: number,
): void {
  const variant = Math.abs(seed) % 5;
  graphics.lineStyle(Math.max(0.75, 1.55 * scale), color, 0.95);

  if (variant === 0) {
    graphics.lineBetween(centerX - 5 * scale, centerY - 6 * scale, centerX + 5 * scale, centerY - 6 * scale);
    graphics.lineBetween(centerX, centerY - 8 * scale, centerX, centerY + 8 * scale);
    graphics.lineBetween(centerX - 6 * scale, centerY + 1 * scale, centerX + 6 * scale, centerY + 1 * scale);
    graphics.lineBetween(centerX - 3 * scale, centerY + 6 * scale, centerX + 5 * scale, centerY + 10 * scale);
    return;
  }

  if (variant === 1) {
    graphics.lineBetween(centerX - 6 * scale, centerY - 7 * scale, centerX + 6 * scale, centerY - 7 * scale);
    graphics.lineBetween(centerX - 2 * scale, centerY - 9 * scale, centerX - 2 * scale, centerY + 9 * scale);
    graphics.lineBetween(centerX - 7 * scale, centerY + 1 * scale, centerX + 7 * scale, centerY + 1 * scale);
    graphics.lineBetween(centerX + 4 * scale, centerY - 7 * scale, centerX + 4 * scale, centerY + 8 * scale);
    return;
  }

  if (variant === 2) {
    graphics.lineBetween(centerX - 7 * scale, centerY - 4 * scale, centerX + 7 * scale, centerY - 4 * scale);
    graphics.lineBetween(centerX - 3 * scale, centerY - 9 * scale, centerX - 3 * scale, centerY + 8 * scale);
    graphics.lineBetween(centerX - 6 * scale, centerY + 5 * scale, centerX + 7 * scale, centerY + 5 * scale);
    graphics.lineBetween(centerX + 5 * scale, centerY - 2 * scale, centerX + 1 * scale, centerY + 9 * scale);
    return;
  }

  if (variant === 3) {
    graphics.lineBetween(centerX - 5 * scale, centerY - 7 * scale, centerX + 6 * scale, centerY - 8 * scale);
    graphics.lineBetween(centerX, centerY - 7 * scale, centerX, centerY + 6 * scale);
    graphics.lineBetween(centerX - 5 * scale, centerY + 3 * scale, centerX + 6 * scale, centerY + 3 * scale);
    graphics.lineBetween(centerX - 2 * scale, centerY + 8 * scale, centerX + 3 * scale, centerY + 5 * scale);
    return;
  }

  graphics.lineBetween(centerX - 6 * scale, centerY - 8 * scale, centerX + 7 * scale, centerY - 6 * scale);
  graphics.lineBetween(centerX - 2 * scale, centerY - 6 * scale, centerX - 2 * scale, centerY + 8 * scale);
  graphics.lineBetween(centerX - 7 * scale, centerY, centerX + 5 * scale, centerY);
  graphics.lineBetween(centerX + 3 * scale, centerY - 5 * scale, centerX + 3 * scale, centerY + 9 * scale);
}
