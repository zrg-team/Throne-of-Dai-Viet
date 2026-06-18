/**
 * Isometric building renderer for settlements, farms, and mines.
 *
 * All house shapes share the same isometric hip-roof geometry from drawHouse,
 * varied by proportion parameters (wallFactor / roofFactor) and optional detail
 * layers drawn on top of the base shape:
 *
 *   hall      – đình: wider (×1.4) + squat walls + timber column marks
 *   shophouse – phố: small low shop + front awning
 *   standard  – nhà gỗ: normal single-floor proportions
 *   stilted   – nhà sàn: three poles + cross-brace + standard house body
 *
 * IMPORTANT – loft implementation: the old "draw a full house on top" approach
 * created an ugly box-on-box look.  The new pagoda tier draws only the roof
 * triangles (no wall box) centered on the main apex, matching real East-Asian
 * tiered-roof architecture.
 */
import Phaser from 'phaser';
import { INK, shade } from './inkTheme';
import type { LandBuildingType } from '../state/types';

export interface IsoHouseStyle { roof: number; wall: number }

export const CITY_HOUSE_STYLE:    IsoHouseStyle = { roof: 0x6a5530, wall: 0xe4d7b8 };
export const VILLAGE_HOUSE_STYLE: IsoHouseStyle = { roof: 0x8a7442, wall: 0xd2b987 };

type HouseVariant = 'hall' | 'shophouse' | 'standard' | 'stilted' | 'stall';
type SettlementKind = 'city' | 'market' | 'shrine';

// Hall (đình) — one larger single-floor communal house.
const HALL_ROOFS = [0x5a4528, 0x6a5530, 0x746038, 0x4f3c26, 0x7c6942];
const HALL_WALLS = [0xe4d7b8, 0xd7c493, 0xeadfc4, 0xcdb176, 0xdfc992];

// Market shops — low stalls with cloth/wood color, not multi-floor houses.
const SHOP_ROOFS = [0x7a5a2f, 0x8a7442, 0x9a7a3d, 0x6b5030, 0xa58a4d];
const SHOP_WALLS = [0xf0e7cf, 0xd7c99a, 0xc8d6b0, 0xd8b17a, 0xd9c48d, 0xe4d8ba, 0xc4b48a];

// Standard residential — full range
const CITY_ROOFS = [0x5a4528, 0x6a5530, 0x746038, 0x806b42, 0x5f5138, 0x4f3c26];
const CITY_WALLS = [0xf0e7cf, 0xe4d7b8, 0xe8d7ac, 0xd1c298, 0xb89d6a, 0xcaa67a, 0xd4c7ad];

// Village
const VILLAGE_ROOFS = [0x725b2e, 0x8a7442, 0x9b834b, 0x5f4827, 0x80663a, 0xa68c50];
const VILLAGE_WALLS = [0xb28b56, 0xd2b987, 0xddc592, 0xb89b60, 0xc8ad68, 0xa87842];

const STONE_GROUND = 0xd2c39c;
const LANE_COLOUR  = 0xbca87a;
const TIMBER = 0x4d341f;

interface Point { x: number; y: number }

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function hash(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(hash(seed) * arr.length) % arr.length];
}

/**
 * 15 ring slots in three rings so a dense cluster of 14+ buildings fits cleanly.
 * Negative dy = further back (drawn first), positive dy = closer (drawn last).
 */
const RING_SLOTS: ReadonlyArray<[number, number]> = [
  // inner ring — 4 slots
  [-18, -8], [ 18, -8], [-17,  9], [ 17,  9],
  // mid ring — 5 slots
  [  0, -25], [-29, -12], [ 29, -12], [-28,  14], [ 28,  14],
  // outer ring — 4 slots
  [ -14, -34], [  14, -34], [-22, 25], [ 22, 25],
  // extended — 2 slots
  [-36,  0], [ 36,  0],
];

interface HouseSpec {
  px: number; py: number; width: number;
  style: IsoHouseStyle; loft: boolean; variant: HouseVariant;
}

export class IsoBuildingRenderer {
  constructor(private readonly scene: Phaser.Scene) {}

  // ─────────────────────────────────────────────────────────────────────────
  //  Core hip-roof house
  // ─────────────────────────────────────────────────────────────────────────

  drawHouse(
    g: Phaser.GameObjects.Graphics,
    cx: number, groundY: number, width: number,
    style: IsoHouseStyle,
    finialColor?: number,
    loft = false,
    wallFactor = 0.48,
    roofFactor = 0.44,
  ): void {
    const hw    = width / 2;
    const hh    = width / 4;
    const wallH = width * wallFactor;
    const roofH = width * roofFactor;

    const right    = { x: cx + hw, y: groundY };
    const front    = { x: cx,      y: groundY + hh };
    const left     = { x: cx - hw, y: groundY };
    const rightTop = { x: right.x, y: right.y - wallH };
    const frontTop = { x: front.x, y: front.y - wallH };
    const leftTop  = { x: left.x,  y: left.y  - wallH };
    const apex     = { x: cx,      y: groundY - wallH - roofH };

    // Walls
    g.fillStyle(shade(style.wall, 1.08), 1);
    g.fillPoints([front, left, leftTop, frontTop], true);
    g.fillStyle(shade(style.wall, 0.82), 1);
    g.fillPoints([front, right, rightTop, frontTop], true);
    g.lineStyle(1, INK.ink, 0.55);
    g.strokePoints([front, left, leftTop, frontTop], true);
    g.strokePoints([front, right, rightTop, frontTop], true);

    g.lineStyle(Math.max(1, width * 0.055), TIMBER, 0.72);
    g.lineBetween(front.x, front.y, frontTop.x, frontTop.y);
    for (const t of [0.36, 0.72]) {
      const lb = lerp(front, left, t);
      const lt = lerp(frontTop, leftTop, t);
      const rb = lerp(front, right, t);
      const rt = lerp(frontTop, rightTop, t);
      g.lineBetween(lb.x, lb.y, lt.x, lt.y);
      g.lineBetween(rb.x, rb.y, rt.x, rt.y);
    }

    g.fillStyle(TIMBER, 0.58);
    g.fillEllipse(cx, groundY + hh * 0.88, width * 0.34, width * 0.13);

    // Roof faces
    g.fillStyle(shade(style.roof, 1.08), 1);
    g.fillPoints([frontTop, leftTop, apex], true);
    g.fillStyle(shade(style.roof, 0.80), 1);
    g.fillPoints([frontTop, rightTop, apex], true);
    g.lineStyle(1, INK.ink, 0.70);
    g.strokePoints([frontTop, leftTop, apex], true);
    g.strokePoints([frontTop, rightTop, apex], true);

    g.lineStyle(Math.max(1, width * 0.06), shade(style.roof, 0.46), 0.82);
    g.lineBetween(leftTop.x - width * 0.05, leftTop.y, frontTop.x, frontTop.y);
    g.lineBetween(frontTop.x, frontTop.y, rightTop.x + width * 0.05, rightTop.y);

    // Tile-row texture
    g.lineStyle(1, shade(style.roof, 0.62), 0.58);
    for (let t = 0.22; t < 1; t += 0.22) {
      const la = lerp(frontTop, apex, t); const lb = lerp(leftTop,  apex, t);
      g.lineBetween(la.x, la.y, lb.x, lb.y);
      const ra = lerp(frontTop, apex, t); const rb = lerp(rightTop, apex, t);
      g.lineBetween(ra.x, ra.y, rb.x, rb.y);
    }

    this.drawEaveTips(g, frontTop, leftTop, rightTop, width, style.roof);

    // Ridge cap
    g.lineStyle(1.5, shade(style.roof, 0.45), 0.65);
    g.lineBetween(apex.x - hw * 0.12, apex.y, apex.x + hw * 0.12, apex.y);

    // Finial
    if (finialColor !== undefined) {
      const r = Math.max(2, width * 0.052);
      g.fillStyle(finialColor, 0.95);
      g.fillCircle(apex.x, apex.y, r);
      g.fillStyle(shade(finialColor, 1.3), 0.75);
      g.fillCircle(apex.x - r * 0.85, apex.y + r * 0.40, r * 0.62);
      g.fillCircle(apex.x + r * 0.85, apex.y + r * 0.40, r * 0.62);
    }

    // Pagoda tier: roof-only second layer (no wall box) centered on main apex.
    // Draws two triangular faces that rise above the main apex — proper East-Asian
    // tiered-roof look without the ugly "house on top of house" box effect.
    if (loft) {
      const tw   = width * 0.52;
      const thw  = tw / 2;
      const th   = tw * 0.42;
      // Tier base sits just below main apex so it appears to spring from there.
      const tBase  = { x: cx,       y: apex.y + tw * 0.07 };
      const tLeft  = { x: cx - thw, y: apex.y };
      const tRight = { x: cx + thw, y: apex.y };
      const tApex  = { x: cx,       y: apex.y - th };

      g.fillStyle(shade(style.roof, 1.06), 1);
      g.fillPoints([tBase, tLeft, tApex], true);
      g.fillStyle(shade(style.roof, 0.76), 1);
      g.fillPoints([tBase, tRight, tApex], true);
      g.lineStyle(1, INK.ink, 0.65);
      g.strokePoints([tBase, tLeft, tApex], true);
      g.strokePoints([tBase, tRight, tApex], true);

      g.lineStyle(1, shade(style.roof, 0.58), 0.42);
      const tMid = lerp(tBase, tApex, 0.50);
      const tML  = lerp(tLeft,  tApex, 0.50);
      const tMR  = lerp(tRight, tApex, 0.50);
      g.lineBetween(tMid.x, tMid.y, tML.x, tML.y);
      g.lineBetween(tMid.x, tMid.y, tMR.x, tMR.y);

      this.drawEaveTips(g, tBase, tLeft, tRight, tw * 0.80, style.roof);

      g.lineStyle(1.2, shade(style.roof, 0.42), 0.60);
      g.lineBetween(tApex.x - thw * 0.10, tApex.y, tApex.x + thw * 0.10, tApex.y);

      if (finialColor !== undefined) {
        g.fillStyle(finialColor, 0.92);
        g.fillCircle(tApex.x, tApex.y, Math.max(1.5, tw * 0.048));
      }
    }
  }

  private drawEaveTips(
    g: Phaser.GameObjects.Graphics,
    frontTop: Point, leftTop: Point, rightTop: Point,
    tipWidth: number, roofColor: number,
  ): void {
    const sweep = tipWidth * 0.10;
    const ext   = tipWidth * 0.08;
    g.fillStyle(shade(roofColor, 1.15), 0.80);
    g.fillTriangle(
      frontTop.x - ext * 0.38, frontTop.y + ext * 0.12,
      frontTop.x + ext * 0.38, frontTop.y + ext * 0.12,
      frontTop.x,              frontTop.y - sweep * 0.65,
    );
    g.fillStyle(shade(roofColor, 1.12), 0.80);
    g.fillTriangle(
      leftTop.x,               leftTop.y,
      leftTop.x - ext * 0.88,  leftTop.y - sweep * 0.42,
      leftTop.x - ext * 0.44,  leftTop.y - sweep,
    );
    g.fillStyle(shade(roofColor, 0.87), 0.80);
    g.fillTriangle(
      rightTop.x,              rightTop.y,
      rightTop.x + ext * 0.88, rightTop.y - sweep * 0.42,
      rightTop.x + ext * 0.44, rightTop.y - sweep,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Hall (đình): wider + squat + timber columns
  // ─────────────────────────────────────────────────────────────────────────

  private drawHall(
    g: Phaser.GameObjects.Graphics,
    cx: number, groundY: number, width: number,
    style: IsoHouseStyle,
    finialColor?: number, loft = false,
  ): void {
    const hallW = width * 1.40;
    this.drawHouse(g, cx, groundY, hallW, style, finialColor, loft, 0.38, 0.36);

    // Timber column marks on wall faces
    const hw     = hallW / 2;
    const hh     = hallW / 4;
    const wallH  = hallW * 0.38;
    const front    = { x: cx,      y: groundY + hh };
    const left     = { x: cx - hw, y: groundY };
    const right    = { x: cx + hw, y: groundY };
    const frontTop = { x: cx,      y: groundY + hh - wallH };
    const leftTop  = { x: cx - hw, y: groundY - wallH };
    const rightTop = { x: cx + hw, y: groundY - wallH };

    g.lineStyle(Math.max(1.5, width * 0.034), shade(style.wall, 0.52), 0.55);
    for (const t of [0.28, 0.72]) {
      const bL = lerp(front, left,  t); const tL = lerp(frontTop, leftTop,  t);
      g.lineBetween(bL.x, bL.y, tL.x, tL.y);
      const bR = lerp(front, right, t); const tR = lerp(frontTop, rightTop, t);
      g.lineBetween(bR.x, bR.y, tR.x, tR.y);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Shophouse (phố): low single-floor shop + front awning
  // ─────────────────────────────────────────────────────────────────────────

  private drawShophouse(
    g: Phaser.GameObjects.Graphics,
    cx: number, groundY: number, width: number,
    style: IsoHouseStyle,
    finialColor?: number,
  ): void {
    const shopW = width * 0.82;
    this.drawHouse(g, cx, groundY, shopW, style, finialColor, false, 0.34, 0.32);

    const hw   = shopW / 2;
    const hh   = shopW / 4;
    const wallH = shopW * 0.34;
    const awnY  = groundY + hh - wallH * 0.35;

    // Front awning
    const awW = hw * 0.95;
    const awD = hh * 0.72;
    g.fillStyle(shade(style.wall, 0.92), 0.78);
    g.fillTriangle(cx - awW, awnY, cx + awW, awnY, cx, awnY + awD);
    g.lineStyle(1, INK.ink, 0.45);
    g.strokePoints([{ x: cx - awW, y: awnY }, { x: cx + awW, y: awnY }, { x: cx, y: awnY + awD }], true);

    // Open shop front.
    const left  = { x: cx - hw, y: groundY };
    const right = { x: cx + hw, y: groundY };
    const front = { x: cx,      y: groundY + hh };
    g.lineStyle(1.2, shade(style.wall, 0.55), 0.60);
    g.lineBetween(front.x, awnY + awD * 0.2, left.x, left.y - wallH * 0.32);
    g.lineBetween(front.x, awnY + awD * 0.2, right.x, right.y - wallH * 0.32);
  }

  private drawMarketStall(
    g: Phaser.GameObjects.Graphics,
    cx: number, groundY: number, width: number,
    style: IsoHouseStyle,
  ): void {
    const w = width;
    const hw = w / 2;
    const h = w * 0.34;
    const topY = groundY - h;
    const cloth = style.wall;

    g.fillStyle(shade(style.roof, 0.92), 0.92);
    g.fillPoints([
      { x: cx, y: topY - h * 0.45 },
      { x: cx - hw, y: topY },
      { x: cx, y: topY + h * 0.28 },
      { x: cx + hw, y: topY },
    ], true);
    g.lineStyle(1, INK.ink, 0.58);
    g.strokePoints([
      { x: cx, y: topY - h * 0.45 },
      { x: cx - hw, y: topY },
      { x: cx, y: topY + h * 0.28 },
      { x: cx + hw, y: topY },
    ], true);

    g.fillStyle(shade(cloth, 1.04), 0.92);
    g.fillPoints([
      { x: cx - hw * 0.88, y: topY + h * 0.15 },
      { x: cx, y: topY + h * 0.46 },
      { x: cx, y: groundY + h * 0.18 },
      { x: cx - hw * 0.88, y: groundY - h * 0.10 },
    ], true);
    g.fillStyle(shade(cloth, 0.82), 0.92);
    g.fillPoints([
      { x: cx + hw * 0.88, y: topY + h * 0.15 },
      { x: cx, y: topY + h * 0.46 },
      { x: cx, y: groundY + h * 0.18 },
      { x: cx + hw * 0.88, y: groundY - h * 0.10 },
    ], true);
    g.lineStyle(1, INK.ink, 0.42);
    g.lineBetween(cx - hw * 0.88, topY + h * 0.15, cx - hw * 0.88, groundY - h * 0.10);
    g.lineBetween(cx + hw * 0.88, topY + h * 0.15, cx + hw * 0.88, groundY - h * 0.10);

    g.fillStyle(0x8a6a3f, 0.88);
    g.fillEllipse(cx, groundY + h * 0.22, w * 0.72, h * 0.42);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Stilt house (nhà sàn)
  // ─────────────────────────────────────────────────────────────────────────

  private drawStiltHouse(
    g: Phaser.GameObjects.Graphics,
    cx: number, groundY: number, width: number,
    style: IsoHouseStyle,
    finialColor?: number,
  ): void {
    const stiltH    = width * 0.38;
    const poleColor = shade(style.wall, 0.45);
    const poleW     = Math.max(2, width * 0.07);

    g.lineStyle(poleW, poleColor, 0.90);
    g.lineBetween(cx - width * 0.28, groundY, cx - width * 0.28, groundY - stiltH);
    g.lineBetween(cx,                groundY, cx,                groundY - stiltH * 0.88);
    g.lineBetween(cx + width * 0.28, groundY, cx + width * 0.28, groundY - stiltH);
    g.lineStyle(Math.max(1.5, width * 0.04), poleColor, 0.50);
    g.lineBetween(cx - width * 0.28, groundY - stiltH * 0.50, cx + width * 0.28, groundY - stiltH * 0.50);

    this.drawHouse(g, cx, groundY - stiltH, width, style, finialColor);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Urban ground + connecting lanes
  // ─────────────────────────────────────────────────────────────────────────

  private drawUrbanGround(g: Phaser.GameObjects.Graphics, x: number, y: number, count: number): void {
    const rw = 20 + count * 4;
    const rh = rw * 0.52;
    g.fillStyle(shade(STONE_GROUND, 0.88), 0.18);
    g.fillEllipse(x, y + 3, rw * 2.5, rh * 2.5);
    g.fillStyle(STONE_GROUND, 0.20);
    g.fillEllipse(x, y + 2, rw * 2.1, rh * 2.1);
    g.lineStyle(1, shade(STONE_GROUND, 0.68), 0.14);
    for (let row = -1; row <= 1; row++) {
      const ry = y + row * rh * 0.36;
      g.lineBetween(x - rw * 0.82, ry, x + rw * 0.82, ry);
    }
    for (let col = -1; col <= 1; col++) {
      const cx2 = x + col * rw * 0.36;
      g.lineBetween(cx2, y - rh * 0.72, cx2, y + rh * 0.72);
    }
  }

  private drawLane(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, seed: number): void {
    const midX = (x1 + x2) / 2 + (hash(seed)     - 0.5) * 5;
    const midY = (y1 + y2) / 2 + (hash(seed + 1) - 0.5) * 3;
    g.lineStyle(3.5, LANE_COLOUR, 0.16);
    g.lineBetween(x1, y1 + 2, midX, midY);
    g.lineBetween(midX, midY, x2, y2 + 1.5);
    g.lineStyle(2, LANE_COLOUR, 0.28);
    g.lineBetween(x1, y1 + 2, midX, midY);
    g.lineBetween(midX, midY, x2, y2 + 1.5);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  City / shrine cluster
  // ─────────────────────────────────────────────────────────────────────────

  addBuildingGroup(
    cluster: Phaser.GameObjects.Container,
    x: number, y: number,
    isShrine: boolean,
    houseCount: number,
  ): void {
    const count = isShrine ? 1 : houseCount;
    const seed0 = x * 0.071 + y * 0.133;
    const g     = this.scene.add.graphics();

    const houses: HouseSpec[] = [];

    // Landmark — hall (70%) or large standard (30%)
    const isHall = hash(seed0 + 12) > 0.30;
    houses.push({
      px:      x + (hash(seed0 + 8) - 0.5) * 2,
      py:      y + (hash(seed0 + 9) - 0.5) * 2,
      width:   24 + hash(seed0 + 10) * 6,
      style:   { roof: pick(isHall ? HALL_ROOFS : CITY_ROOFS, seed0), wall: pick(isHall ? HALL_WALLS : CITY_WALLS, seed0 + 0.5) },
      loft:    false,
      variant: isHall ? 'hall' : 'standard',
    });

    // Ring buildings
    for (let index = 1; index < count; index += 1) {
      const seed          = seed0 + index * 7.91;
      const [slotX, slotY] = RING_SLOTS[(index - 1) % RING_SLOTS.length];
      const rv            = hash(seed + 22);
      const variant: HouseVariant =
        rv > 0.60 ? 'shophouse' : 'standard';
      const isShop = variant === 'shophouse';
      houses.push({
        px:      x + slotX + (hash(seed + 1) - 0.5) * 3,
        py:      y + slotY + (hash(seed + 2) - 0.5) * 3,
        width:   16  + hash(seed + 3) * 6,
        style:   { roof: pick(isShop ? SHOP_ROOFS : CITY_ROOFS, seed + 4), wall: pick(isShop ? SHOP_WALLS : CITY_WALLS, seed + 5) },
        loft:    false,
        variant,
      });
    }

    // Ground + lanes first
    this.drawUrbanGround(g, x, y, count);
    const lm = houses[0];
    for (let i = 1; i < houses.length; i += 1) {
      this.drawLane(g, lm.px, lm.py, houses[i].px, houses[i].py, seed0 + i * 3.7);
    }

    // Back-to-front
    houses.sort((a, b) => a.py - b.py);
    const finial = undefined;
    for (const { px, py, width, style, loft, variant } of houses) {
      switch (variant) {
        case 'hall':      this.drawHall(g, px, py, width, style, finial, loft); break;
        case 'shophouse': this.drawShophouse(g, px, py, width, style, finial);  break;
        case 'stilted':   this.drawStiltHouse(g, px, py, width, style, finial); break;
        default:          this.drawHouse(g, px, py, width, style, finial, loft);
      }
    }

    cluster.add(g);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Unified city cluster — all hexes in one pass, globally Y-sorted
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Renders a whole city as one Graphics object with a globally Y-sorted building list.
   *
   * DESIGN: NO per-hex landmark. In a real city there is no "big building at each
   * zone center" — buildings grow organically. This renderer:
   *   1. Places at most ONE hall near the overall city centroid (not at any hex center).
   *   2. Scatters ALL other buildings randomly across the city footprint.
   *   3. Building size is random throughout (no center-biased sizing).
   *   4. "In city" = within hexRadius of ANY hex center, so adjacent hexes share
   *      the overlap zone and the settlement reads as one continuous place.
   */
  addCityCluster(
    cluster: Phaser.GameObjects.Container,
    centers: ReadonlyArray<{ x: number; y: number }>,
    isShrine: boolean,
    kind: SettlementKind = isShrine ? 'shrine' : 'city',
  ): void {
    if (centers.length === 0) return;
    const g = this.scene.add.graphics();
    const N = centers.length;

    // City centroid — the "heart" of the settlement
    const cx0 = centers.reduce((s, c) => s + c.x, 0) / N;
    const cy0 = centers.reduce((s, c) => s + c.y, 0) / N;

    // Hex footprint radius: 0.58× min inter-hex distance ensures adjacent hexes
    // overlap so the gap between them is always "in city".
    let hexRadius = 30;
    if (N > 1) {
      let minD = Infinity;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const d = Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y);
          if (d < minD) minD = d;
        }
      }
      hexRadius = minD * 0.58;
    }

    const inCity = (px: number, py: number): boolean =>
      centers.some(c => Math.hypot(px - c.x, py - c.y) < hexRadius);

    const isMarket = kind === 'market';
    const sizeScale   = isMarket ? (N === 1 ? 1.2 : 1.3) : N === 1 ? 1.18 : N === 2 ? 1.28 : 1.36;
    const totalTarget = isMarket
      ? (N === 1 ? 4 : N === 2 ? 8 : N * 4)
      : (N === 1 ? 3 : N === 2 ? 7 : N * 4);
    const allowHall   = !isMarket && N >= 2;
    const minSp       = (isMarket ? 15 : 17) * sizeScale;

    // Ground pads first
    for (const { x, y } of centers) {
      this.drawUrbanGround(g, x, y, Math.ceil(totalTarget / N));
    }

    const allSpecs: HouseSpec[] = [];
    const globalSeed = cx0 * 0.071 + cy0 * 0.133;

    // --- Optional hall near city centroid (NOT at a hex center) ---
    if (allowHall) {
      const hs   = globalSeed + 999;
      // Random offset within ¼ of hexRadius so it's near the heart but not exactly centred
      const hPx  = cx0 + (hash(hs)     - 0.5) * hexRadius * 0.45;
      const hPy  = cy0 + (hash(hs + 1) - 0.5) * hexRadius * 0.22;
      if (inCity(hPx, hPy)) {
        allSpecs.push({
          px:    hPx,
          py:    hPy,
          width: (24 + hash(hs + 2) * 7) * sizeScale,
          style: { roof: pick(HALL_ROOFS, hs + 3), wall: pick(HALL_WALLS, hs + 4) },
          loft:    false,
          variant: 'hall',
        });
      }
    }

    // --- Scatter fill across the full city footprint ---
    // Every building is randomly sized (6–12 px) — no center-bias, no per-hex focal point.
    let placed   = allSpecs.length;
    let attempts = 0;

    while (placed < totalTarget && attempts < totalTarget * 30) {
      const seed      = globalSeed + attempts * 7.91;
      // Anchor to a random hex center so buildings fill the whole footprint, not just centroid
      const anchorIdx = Math.floor(hash(seed) * N) % N;
      const { x: ax, y: ay } = centers[anchorIdx];

      const angle = hash(seed + 0.5) * Math.PI * 2;
      const r     = hash(seed + 0.7) * hexRadius;
      const px    = ax + Math.cos(angle) * r;
      const py    = ay + Math.sin(angle) * r * 0.55; // Y-compress for isometric feel

      attempts += 1;
      if (!inCity(px, py)) continue;

      let tooClose = false;
      for (const s of allSpecs) {
        if (Math.hypot(s.px - px, s.py - py) < minSp) { tooClose = true; break; }
      }
      if (tooClose) continue;

      const rv      = hash(seed + 22);
      const variant: HouseVariant = isMarket
        ? (rv > 0.28 ? 'stall' : 'shophouse')
        : (rv > 0.78 ? 'shophouse' : 'standard');
      const isShop  = variant === 'shophouse' || variant === 'stall';
      allSpecs.push({
        px, py,
        width: (isMarket ? 13 + hash(seed + 3) * 6 : 14 + hash(seed + 3) * 7) * sizeScale,
        style: {
          roof: pick(isShop ? SHOP_ROOFS : CITY_ROOFS, seed + 4),
          wall: pick(isShop ? SHOP_WALLS : CITY_WALLS, seed + 5),
        },
        loft:    false,
        variant,
      });
      placed += 1;
    }

    // --- Lanes between nearby building pairs (sparse street network feel) ---
    for (let i = 0; i < allSpecs.length; i++) {
      const a = allSpecs[i];
      let lanesDone = 0;
      for (let j = i + 1; j < allSpecs.length && lanesDone < 2; j++) {
        const b = allSpecs[j];
        if (Math.hypot(a.px - b.px, a.py - b.py) < hexRadius * 0.52) {
          this.drawLane(g, a.px, a.py, b.px, b.py, i * 31 + j * 17);
          lanesDone += 1;
        }
      }
    }

    // --- Global Y-sort and render all buildings in one pass ---
    allSpecs.sort((a, b) => a.py - b.py);
    const finial = undefined;
    for (const { px, py, width, style, loft, variant } of allSpecs) {
      switch (variant) {
        case 'hall':      this.drawHall(g, px, py, width, style, finial, loft); break;
        case 'shophouse': this.drawShophouse(g, px, py, width, style, finial);  break;
        case 'stall':     this.drawMarketStall(g, px, py, width, style);        break;
        default:          this.drawHouse(g, px, py, width, style, finial, loft);
      }
    }

    cluster.add(g);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Village cottage
  // ─────────────────────────────────────────────────────────────────────────

  addCottage(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const seed  = x * 0.091 + y * 0.157;
    const width = (14 + hash(seed) * 7) * scale;
    const style: IsoHouseStyle = { roof: pick(VILLAGE_ROOFS, seed + 1), wall: pick(VILLAGE_WALLS, seed + 2) };
    const g = this.scene.add.graphics();
    this.drawHouse(g, x, y, width, style);
    cluster.add(g);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Rice paddy patch
  // ─────────────────────────────────────────────────────────────────────────

  addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const g = this.scene.add.graphics();
    const w = 34 * scale;
    const h = 20 * scale;
    const left = { x: x - w / 2, y };
    const top = { x, y: y - h / 2 };
    const right = { x: x + w / 2, y };
    const bottom = { x, y: y + h / 2 };

    g.fillStyle(0xb9c97a, 0.58);
    g.fillPoints([top, right, bottom, left], true);
    g.lineStyle(1, shade(0x8e9f55, 0.82), 0.55);
    g.strokePoints([top, right, bottom, left], true);

    g.lineStyle(1, 0x6f8146, 0.42);
    for (let row = 1; row <= 4; row += 1) {
      const t = row / 5;
      const a = lerp(left, top, t);
      const b = lerp(bottom, right, t);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    g.lineStyle(1, 0xe6d7a8, 0.36);
    for (let col = 1; col <= 3; col += 1) {
      const t = col / 4;
      const a = lerp(top, right, t);
      const b = lerp(left, bottom, t);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    cluster.add(g);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Farm cluster
  // ─────────────────────────────────────────────────────────────────────────

  createFarmCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    const cluster = this.scene.add.container(0, 0);
    const seed    = scale * 17.3;

    const paths = this.scene.add.graphics();
    paths.lineStyle(3.2 * scale, 0xc9b681, 0.42);
    paths.lineBetween(-34 * scale, -3 * scale, 34 * scale, 3 * scale);
    paths.lineBetween(-2 * scale, -26 * scale, 4 * scale, 25 * scale);
    paths.lineStyle(1.2 * scale, 0x8f7a4e, 0.28);
    paths.lineBetween(-34 * scale, -3 * scale, 34 * scale, 3 * scale);
    paths.lineBetween(-2 * scale, -26 * scale, 4 * scale, 25 * scale);
    cluster.add(paths);

    for (const [px, py] of [[-28, -20], [25, -19], [-29, 15], [27, 16]] as const) {
      this.addCropPatch(cluster, px * scale, py * scale, scale);
    }

    interface Entry { py: number; add: () => void }
    const entries: Entry[] = [];

    const barnPy    = -4 * scale;
    const barnStyle: IsoHouseStyle = { roof: pick(VILLAGE_ROOFS, seed + 3.1), wall: pick(VILLAGE_WALLS, seed + 5.7) };
    entries.push({
      py:  barnPy,
      add: () => {
        const g = this.scene.add.graphics();
        this.drawHouse(g, 0, barnPy, 24 * scale, barnStyle, undefined, false, 0.34, 0.42);
        cluster.add(g);
      },
    });

    const cottagePositions: Array<[number, number]> = [[-24, 2], [26, 0], [-22, 22]];
    const cottageCount = Math.min(cottagePositions.length, 1 + upgradeLevel);
    for (const [cx, cy] of cottagePositions.slice(0, cottageCount)) {
      const cPy = cy * scale;
      entries.push({ py: cPy, add: () => this.addCottage(cluster, cx * scale, cPy, scale) });
    }

    entries.sort((a, b) => a.py - b.py);
    for (const { add } of entries) add();
    return cluster;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Mine cluster
  // ─────────────────────────────────────────────────────────────────────────

  createMineCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    const cluster = this.scene.add.container(0, 0);
    const mound    = this.scene.add.triangle(0, 4 * scale, -16 * scale, 8 * scale, 16 * scale, 8 * scale, 0, -12 * scale, INK.mountain, 0.85).setStrokeStyle(1, INK.ink, 0.55);
    const entrance = this.scene.add.rectangle(0, 6 * scale, 8 * scale, 8 * scale, INK.ink, 0.85);
    const cart     = this.scene.add.rectangle(15 * scale, 11 * scale, 7 * scale, 4 * scale, INK.cloud, 0.92).setStrokeStyle(1, INK.ink, 0.60);
    cluster.add([mound, entrance, cart]);

    const cottagePositions: Array<[number, number]> = [[-18, 10], [18, -2], [-20, -4]];
    for (let i = 0; i < Math.min(cottagePositions.length, 1 + upgradeLevel); i += 1) {
      const [cx, cy] = cottagePositions[i];
      this.addCottage(cluster, cx * scale, cy * scale, scale);
    }
    return cluster;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Satellite building glyphs
  // ─────────────────────────────────────────────────────────────────────────

  createBuildingGlyph(building: LandBuildingType, x: number, y: number): Phaser.GameObjects.GameObject[] {
    const g = this.scene.add.graphics();

    if (building === 'farm') {
      const seed  = x * 0.083 + y * 0.149;
      const style: IsoHouseStyle = { roof: pick(VILLAGE_ROOFS, seed), wall: pick(VILLAGE_WALLS, seed + 1) };
      const w = 20;
      const h = 12;
      const top = { x, y: y - h * 0.55 };
      const right = { x: x + w * 0.5, y };
      const bottom = { x, y: y + h * 0.55 };
      const left = { x: x - w * 0.5, y };
      g.fillStyle(0xb9c97a, 0.46);
      g.fillPoints([top, right, bottom, left], true);
      g.lineStyle(1, 0x6f8146, 0.36);
      g.strokePoints([top, right, bottom, left], true);
      for (let row = 1; row <= 3; row += 1) {
        const t = row / 4;
        const a = lerp(left, top, t);
        const b = lerp(bottom, right, t);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      this.drawHouse(g, x, y + 7, 12, style, undefined, false, 0.34, 0.4);
      return [g];
    }
    if (building === 'mine') {
      const mound    = this.scene.add.triangle(x, y + 4, x - 8.8, y + 9.6, x + 8.8, y + 9.6, x, y - 2.4, INK.mountain, 0.85).setStrokeStyle(1, INK.ink, 0.50);
      const entrance = this.scene.add.rectangle(x, y + 5, 5, 5, INK.ink, 0.90);
      return [mound, entrance];
    }
    if (building === 'market') {
      const seed = x * 0.083 + y * 0.149;
      for (const [index, offset] of [-7, 0, 7].entries()) {
        this.drawMarketStall(g, x + offset, y + 6 + (index % 2) * 2, 10, {
          roof: pick(SHOP_ROOFS, seed + index),
          wall: pick(SHOP_WALLS, seed + index + 0.5),
        });
      }
      return [g];
    }
    if (building === 'barracks') {
      this.drawHouse(g, x, y + 4, 14, CITY_HOUSE_STYLE);
      g.lineStyle(1.5, INK.ink, 0.80);
      g.lineBetween(x + 8, y - 2, x + 8, y - 14);
      g.fillStyle(0xd0bc86, 0.95);
      g.fillTriangle(x + 8, y - 14, x + 8, y - 8, x + 15, y - 11);
      return [g];
    }
    if (building === 'communalHall') {
      const seed = x * 0.083 + y * 0.149;
      this.drawHall(g, x, y + 6, 15, {
        roof: pick(HALL_ROOFS, seed),
        wall: pick(HALL_WALLS, seed + 1),
      });
      return [g];
    }
    this.drawHouse(g, x, y + 4, 14, CITY_HOUSE_STYLE);
    return [g];
  }
}
