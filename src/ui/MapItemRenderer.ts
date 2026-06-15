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

export type ProgressBadgeVariant = 'acquisition' | 'build' | 'siege' | 'recruit';

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
      fontSize: '10px',
      fontStyle: '700',
      backgroundColor: '#2b332b',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5);
    container.add(text);

    return container;
  }
}
