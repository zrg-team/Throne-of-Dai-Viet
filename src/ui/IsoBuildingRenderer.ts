/**
 * Isometric hip-roof house rendering for settlements, farms, and mines. Pairs with
 * `MapItemRenderer` (army/progress badges, city walls) and shared helpers in `inkTheme`.
 * Houses are drawn as small 2:1 isometric blocks (two shaded wall faces + a two-sided
 * tiled hip roof), in a "city" (sage-green tile roofs) or "village" (terracotta tile
 * roofs) palette, with an ink outline to stay consistent with the map's brush-line style.
 */
import Phaser from 'phaser';
import { INK, shade } from './inkTheme';
import type { LandBuildingType } from '../state/types';

export interface IsoHouseStyle {
  roof: number;
  wall: number;
}

/** Sage-green tiled roofs over cream walls, for city/temple/shrine settlements. */
export const CITY_HOUSE_STYLE: IsoHouseStyle = { roof: 0x6f7d52, wall: 0xe6dcc0 };
/** Terracotta tiled roofs over cream walls, for farm/mine villages and satellites. */
export const VILLAGE_HOUSE_STYLE: IsoHouseStyle = { roof: 0xb5572f, wall: 0xe6dcc0 };

/** Roof/wall color variants so neighboring houses don't all look identical. */
const CITY_ROOFS = [0x6f7d52, 0x7e8c5e, 0x5f6f47, 0x8a8a5a, 0x4f6b40];
const CITY_WALLS = [0xe6dcc0, 0xded2ae, 0xe9e0cb, 0xd8cdb0];
const VILLAGE_ROOFS = [0xb5572f, 0xc2693c, 0xa14a28, 0x9c5a2e, 0xcf7a3f];
const VILLAGE_WALLS = [0xe6dcc0, 0xddcfa8, 0xe3d6b8, 0xd2c4a0];

interface Point {
  x: number;
  y: number;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Deterministic pseudo-random in [0, 1) derived from a numeric seed. */
function hash(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function pick<T>(items: T[], seed: number): T {
  return items[Math.floor(hash(seed) * items.length) % items.length];
}

export class IsoBuildingRenderer {
  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Draws one isometric hip-roof house into `graphics`, sitting on the ground at
   * (`cx`, `groundY`). `width` is the footprint width; depth/height scale with it.
   */
  drawHouse(
    graphics: Phaser.GameObjects.Graphics,
    cx: number,
    groundY: number,
    width: number,
    style: IsoHouseStyle,
    finialColor?: number,
    loft = false,
  ): void {
    const hw = width / 2;
    const hh = width / 4;
    const wallH = width * 0.42;
    const roofH = width * 0.46;

    const right: Point = { x: cx + hw, y: groundY };
    const front: Point = { x: cx, y: groundY + hh };
    const left: Point = { x: cx - hw, y: groundY };

    const rightTop: Point = { x: right.x, y: right.y - wallH };
    const frontTop: Point = { x: front.x, y: front.y - wallH };
    const leftTop: Point = { x: left.x, y: left.y - wallH };
    const apex: Point = { x: cx, y: groundY - wallH - roofH };

    // Walls: left face lit, right face in shadow.
    graphics.fillStyle(shade(style.wall, 1.08), 1);
    graphics.fillPoints([front, left, leftTop, frontTop], true);
    graphics.fillStyle(shade(style.wall, 0.82), 1);
    graphics.fillPoints([front, right, rightTop, frontTop], true);

    graphics.lineStyle(1, INK.ink, 0.55);
    graphics.strokePoints([front, left, leftTop, frontTop], true);
    graphics.strokePoints([front, right, rightTop, frontTop], true);

    // Hip roof: two visible tiled faces meeting at the ridge/apex.
    graphics.fillStyle(shade(style.roof, 1.08), 1);
    graphics.fillPoints([frontTop, leftTop, apex], true);
    graphics.fillStyle(shade(style.roof, 0.8), 1);
    graphics.fillPoints([frontTop, rightTop, apex], true);

    graphics.lineStyle(1, INK.ink, 0.7);
    graphics.strokePoints([frontTop, leftTop, apex], true);
    graphics.strokePoints([frontTop, rightTop, apex], true);

    // Tile-row texture lines, parallel to the eaves, raking up toward the ridge.
    graphics.lineStyle(1, shade(style.roof, 0.6), 0.5);
    for (let t = 0.3; t < 1; t += 0.3) {
      const leftA = lerp(frontTop, apex, t);
      const leftB = lerp(leftTop, apex, t);
      graphics.lineBetween(leftA.x, leftA.y, leftB.x, leftB.y);

      const rightA = lerp(frontTop, apex, t);
      const rightB = lerp(rightTop, apex, t);
      graphics.lineBetween(rightA.x, rightA.y, rightB.x, rightB.y);
    }

    if (finialColor !== undefined) {
      graphics.fillStyle(finialColor, 0.95);
      graphics.fillCircle(apex.x, apex.y, Math.max(2, width * 0.05));
    }

    // Smaller second-story block set back on the roof, for a layered compound look.
    if (loft) {
      const loftWidth = width * 0.55;
      this.drawHouse(graphics, cx, apex.y + width * 0.08, loftWidth, style, finialColor);
    }
  }

  /** A cluster of isometric houses at a single city/shrine hex, arranged in a small grid. */
  addBuildingGroup(cluster: Phaser.GameObjects.Container, x: number, y: number, isShrine: boolean, houseCount: number): void {
    const count = isShrine ? 1 : houseCount;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const colSpacing = 16;
    const rowSpacing = 9;

    const graphics = this.scene.add.graphics();
    const houses: Array<{ px: number; py: number; width: number; style: IsoHouseStyle; loft: boolean }> = [];
    for (let index = 0; index < count; index += 1) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const seed = x * 0.071 + y * 0.133 + index * 7.91;
      houses.push({
        px: x + (col - (cols - 1) / 2) * colSpacing + (hash(seed + 1) - 0.5) * 4,
        py: y + (row - (cols - 1) / 2) * rowSpacing + (hash(seed + 2) - 0.5) * 3,
        width: 13 + hash(seed + 3) * 6,
        style: { roof: pick(CITY_ROOFS, seed + 4), wall: pick(CITY_WALLS, seed + 5) },
        loft: hash(seed + 6) > 0.72,
      });
    }

    // Back-to-front so nearer (lower) houses overlap ones behind them.
    houses.sort((a, b) => a.py - b.py);
    for (const { px, py, width, style, loft } of houses) {
      this.drawHouse(graphics, px, py, width, style, isShrine ? INK.sealRed : undefined, loft);
    }

    cluster.add(graphics);
  }

  /** Small isometric cottage, used to dress out farm/mine villages. */
  addCottage(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const seed = x * 0.091 + y * 0.157;
    const width = (13 + hash(seed) * 6) * scale;
    const style: IsoHouseStyle = { roof: pick(VILLAGE_ROOFS, seed + 1), wall: pick(VILLAGE_WALLS, seed + 2) };
    const graphics = this.scene.add.graphics();
    this.drawHouse(graphics, x, y, width, style);
    cluster.add(graphics);
  }

  /** Small ink furrow-line crop patch. */
  addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(INK.landFields, 0.35);
    graphics.fillRect(x - 9 * scale, y - 6 * scale, 18 * scale, 12 * scale);
    graphics.lineStyle(1, INK.inkSoft, 0.35);
    for (let row = -1; row <= 1; row += 1) {
      const rowY = y + row * 3 * scale;
      graphics.lineBetween(x - 8 * scale, rowY, x + 8 * scale, rowY);
    }
    cluster.add(graphics);
  }

  /** Farm village: surrounding crop patches, a barn, and a handful of cottages. */
  createFarmCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    const cluster = this.scene.add.container(0, 0);

    for (const [px, py] of [[-22, -10], [22, -8], [-20, 14], [20, 14]] as const) {
      this.addCropPatch(cluster, px * scale, py * scale, scale);
    }

    const barnStyle: IsoHouseStyle = { roof: pick(VILLAGE_ROOFS, scale * 3.1), wall: pick(VILLAGE_WALLS, scale * 5.7) };
    const graphics = this.scene.add.graphics();
    this.drawHouse(graphics, 0, 6 * scale, 22 * scale, barnStyle, undefined, true);
    cluster.add(graphics);

    const cottagePositions: Array<[number, number]> = [
      [-15, -2],
      [15, -2],
      [-17, 13],
      [17, 13],
      [0, -14],
    ];
    const cottageCount = Math.min(cottagePositions.length, 2 + upgradeLevel);
    const cottages = cottagePositions.slice(0, cottageCount).sort((a, b) => a[1] - b[1]);
    for (const [px, py] of cottages) {
      this.addCottage(cluster, px * scale, py * scale, scale);
    }

    return cluster;
  }

  /** Iron mine village: an ink mound with a dark entrance, a cart, and cottages. */
  createMineCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    const cluster = this.scene.add.container(0, 0);

    const mound = this.scene.add
      .triangle(0, 4 * scale, -16 * scale, 8 * scale, 16 * scale, 8 * scale, 0, -12 * scale, INK.mountain, 0.85)
      .setStrokeStyle(1, INK.ink, 0.55);
    const entrance = this.scene.add.rectangle(0, 6 * scale, 8 * scale, 8 * scale, INK.ink, 0.85);
    const cart = this.scene.add.rectangle(15 * scale, 11 * scale, 7 * scale, 4 * scale, INK.cloud, 0.92).setStrokeStyle(1, INK.ink, 0.6);
    cluster.add([mound, entrance, cart]);

    const cottagePositions: Array<[number, number]> = [
      [-18, 10],
      [18, -2],
      [-20, -4],
    ];
    const cottageCount = Math.min(cottagePositions.length, 1 + upgradeLevel);
    for (let index = 0; index < cottageCount; index += 1) {
      const [px, py] = cottagePositions[index];
      this.addCottage(cluster, px * scale, py * scale, scale);
    }

    return cluster;
  }

  /** Small house glyphs for each constructed farm/mine/market building, used as settlement satellites. */
  createBuildingGlyph(building: LandBuildingType, x: number, y: number): Phaser.GameObjects.GameObject[] {
    const graphics = this.scene.add.graphics();

    if (building === 'farm') {
      const seed = x * 0.083 + y * 0.149;
      const style: IsoHouseStyle = { roof: pick(VILLAGE_ROOFS, seed), wall: pick(VILLAGE_WALLS, seed + 1) };
      graphics.fillStyle(INK.landFields, 0.35);
      graphics.fillRect(x - 9 * 0.85, y - 6 * 0.85, 18 * 0.85, 12 * 0.85);
      this.drawHouse(graphics, x, y + 5, 13, style);
      return [graphics];
    }

    if (building === 'mine') {
      const mound = this.scene.add
        .triangle(x, y + 4, x - 11 * 0.8, y + 7 * 0.8 + 4, x + 11 * 0.8, y + 7 * 0.8 + 4, x, y - 8 * 0.8 + 4, INK.mountain, 0.85)
        .setStrokeStyle(1, INK.ink, 0.5);
      const entrance = this.scene.add.rectangle(x, y + 5, 5, 5, INK.ink, 0.9);
      return [mound, entrance];
    }

    // market
    this.drawHouse(graphics, x, y + 4, 14, CITY_HOUSE_STYLE, INK.sealRed);
    return [graphics];
  }
}
