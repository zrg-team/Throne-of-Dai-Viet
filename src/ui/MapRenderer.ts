/**
 * Ink-wash rendering for the map's terrain, background, and environment layers.
 * Pairs with `MapItemRenderer` (settlements, armies, badges) and shared helpers in
 * `inkTheme`. The standalone `decorate*` functions are consumed directly by
 * `terrainTypes.ts` for per-hex/per-region terrain decoration.
 */
import Phaser from 'phaser';
import type { PixelPoint } from '../map/hex';
import type { HexTerrainType } from '../map/terrainTypes';
import { MAP_VISUAL_CONFIG } from '../game/gameplayConfig';
import { INK, brushStroke, inkOutline, shade, washFill, waveLine, cloudMotif } from './inkTheme';
import { AtlasMapRenderer } from './AtlasMapRenderer';
import { getActiveMapTheme, type MapThemeDefinition, type MapThemePalette, type MapThemeRendererId } from './mapTheme';

export interface MapRenderer {
  readonly theme: MapThemeDefinition;
  readonly palette: MapThemePalette;
  drawBackground(worldWidth: number, worldHeight: number): Phaser.GameObjects.Graphics;
  drawHexFill(graphics: Phaser.GameObjects.Graphics, corners: PixelPoint[], color: number): void;
  decorateTerrain(graphics: Phaser.GameObjects.Graphics, terrain: HexTerrainType, centers: PixelPoint[], size: number, rng: () => number): void;
  drawCloud(graphics: Phaser.GameObjects.Graphics, x: number, y: number, baseRadius: number, seed: number, alpha?: number): void;
  drawZoneBorder(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>, color: number, alpha?: number): void;
  drawRoad(graphics: Phaser.GameObjects.Graphics, points: PixelPoint[], widthFrom: number, widthTo: number): void;
}

export function createMapRenderer(scene: Phaser.Scene): MapRenderer {
  const theme = getActiveMapTheme();
  return environmentRendererFactories[theme.renderers.environment](scene, theme);
}

const environmentRendererFactories: Record<MapThemeRendererId, (scene: Phaser.Scene, theme: MapThemeDefinition) => MapRenderer> = {
  atlas: (scene, theme) => new AtlasMapRenderer(scene, theme),
  ink: (scene, theme) => new InkMapRenderer(scene, theme),
};

function randomIndex(rng: () => number, length: number): number {
  return Math.floor(rng() * length);
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(rng, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/** Ink-brush grass ticks scattered across a plains hex. */
export function decoratePlains(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number): void {
  graphics.lineStyle(1, INK.inkSoft, 0.35);
  for (let index = 0; index < 5; index += 1) {
    const px = center.x + (rng() - 0.5) * size * 1.1;
    const py = center.y + (rng() - 0.5) * size * 1.1;
    graphics.lineBetween(px, py + 2, px, py - 2);
  }
}

/** Ink furrow lines across a tilled-field hex. */
export function decorateFields(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number): void {
  graphics.lineStyle(1, INK.inkSoft, 0.3);
  for (let row = -1; row <= 1; row += 1) {
    const y = center.y + row * size * 0.32;
    graphics.lineBetween(center.x - size * 0.6, y, center.x + size * 0.6, y);
  }
  void rng;
}

/** Gentle wave-line texture across a rice-field hex. */
export function decorateRiceFields(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number): void {
  for (let row = -1; row <= 1; row += 1) {
    const y = center.y + row * size * 0.3;
    waveLine(graphics, center.x - size * 0.55, y, center.x + size * 0.55, y, size * 0.06, 6, INK.inkSoft, 0.35);
  }
  void rng;
}

/** Scatters dense ink pine-silhouette clumps (a tall canopy plus a smaller inner one) across a merged forest patch. */
export function decorateForest(graphics: Phaser.GameObjects.Graphics, centers: PixelPoint[], size: number, rng: () => number): void {
  const treeCount = Math.round(centers.length * 6);
  for (let index = 0; index < treeCount; index += 1) {
    const anchor = centers[randomIndex(rng, centers.length)];
    const px = anchor.x + (rng() - 0.5) * size * 1.3;
    const py = anchor.y + (rng() - 0.5) * size * 1.3;
    const scale = 0.6 + rng() * 0.7;
    const height = size * 0.45 * scale;
    const base = size * 0.14 * scale;

    graphics.fillStyle(shade(INK.landForest, 0.65), 0.7);
    graphics.fillTriangle(px, py - height, px - size * 0.16 * scale, py + base, px + size * 0.16 * scale, py + base);

    graphics.fillStyle(shade(INK.landForest, 0.82), 0.6);
    graphics.fillTriangle(px, py - height * 0.65, px - size * 0.12 * scale, py + base * 0.4, px + size * 0.12 * scale, py + base * 0.4);

    graphics.lineStyle(1, INK.ink, 0.45);
    graphics.lineBetween(px, py + base, px, py + base + height * 0.25);
  }
}

/**
 * Shoulder-silhouette mountain: a 7-point polygon with a secondary shoulder peak,
 * inner ridge stroke for depth, snow cap at the summit, and a mist band across the
 * mid-slopes. Matches the style used on the main menu landscape.
 */
export function decorateMountains(graphics: Phaser.GameObjects.Graphics, centers: PixelPoint[], size: number, rng: () => number): void {
  const peakCount = Math.max(1, Math.round(centers.length * 0.9));
  const peaks = shuffle(centers, rng).slice(0, peakCount);
  const opacity = MAP_VISUAL_CONFIG.mountainOpacity;

  // Resolve geometry up front, then draw back-to-front so nearer peaks overlap.
  const drawables = peaks.map((peak) => {
    const scale = 2.0 + rng() * 1.8;
    const px = peak.x + (rng() - 0.5) * size * 0.65;
    const py = peak.y + (rng() - 0.5) * size * 0.35;
    const halfW = size * 0.46 * scale;
    const h    = size * 0.56 * scale;
    const jx   = (rng() - 0.5) * halfW * 0.26;
    return { px, py, halfW, h, jx, seed: Math.round(px * 3 + py * 7) };
  });
  drawables.sort((a, b) => a.py - b.py);

  for (const { px, py, halfW, h, jx, seed } of drawables) {
    // Main silhouette with a secondary shoulder on the right flank
    const pts = [
      { x: px - halfW,               y: py },
      { x: px - halfW * 0.54,        y: py - h * 0.52 },
      { x: px - halfW * 0.15 + jx,   y: py - h * 0.80 },
      { x: px + jx,                   y: py - h },
      { x: px + halfW * 0.22 + jx,   y: py - h * 0.84 },
      { x: px + halfW * 0.50,         y: py - h * 0.48 },
      { x: px + halfW,                y: py },
    ];
    washFill(graphics, pts, shade(INK.mountain, 0.88), opacity.fill);
    inkOutline(graphics, pts, INK.ink, opacity.outline, false, seed);

    // Fainter inner ridge echoing the outer silhouette for layered depth
    const innerPts = [
      { x: px - halfW * 0.52,        y: py - 2 },
      { x: px - halfW * 0.18 + jx,   y: py - h * 0.74 },
      { x: px + jx,                   y: py - h * 0.96 },
      { x: px + halfW * 0.24 + jx,   y: py - h * 0.76 },
      { x: px + halfW * 0.50,         y: py - 2 },
    ];
    inkOutline(graphics, innerPts, INK.inkSoft, opacity.innerRidge, false, seed + 11);

    // Snow cap at the summit
    graphics.fillStyle(INK.mountainMist, Math.min(1, opacity.mist * 1.6));
    graphics.fillTriangle(
      px + jx,                   py - h,
      px + jx - halfW * 0.20,   py - h * 0.72,
      px + jx + halfW * 0.18,   py - h * 0.68,
    );

    // Pale mist band across the mid-slopes
    graphics.fillStyle(INK.cloud, opacity.mist * 0.55);
    graphics.fillEllipse(px, py - h * 0.38, halfW * 1.5, h * 0.20);
  }
}

/**
 * Natural ink-wash hill mounds: each hill uses an asymmetric 7-point polygon
 * (peak offset, unequal slopes) so no two look alike. Horizontal contour strokes
 * inside the body follow the terrain surface in the Chinese ink-wash tradition.
 * Geometry is pre-computed so mounds draw back-to-front for correct overlap.
 */
export function decorateHills(graphics: Phaser.GameObjects.Graphics, centers: PixelPoint[], size: number, rng: () => number): void {
  const moundCount = Math.max(1, Math.round(centers.length * 0.80));
  const selected   = shuffle(centers, rng).slice(0, moundCount);

  const drawables = selected.map((center) => {
    const scale  = 0.70 + rng() * 0.84;
    const px     = center.x + (rng() - 0.5) * size * 0.72;
    const py     = center.y + (rng() - 0.5) * size * 0.44;
    const halfW  = size * (0.44 + rng() * 0.34) * scale;
    const h      = size * (0.24 + rng() * 0.18) * scale;
    const jxPeak = (rng() - 0.5) * halfW * 0.36;  // peak shifted left or right
    const slopeL = 0.68 + rng() * 0.64;            // left slope steepness factor
    const slopeR = 0.68 + rng() * 0.64;            // right slope steepness factor
    const bump   = (rng() - 0.5) * h * 0.22;       // shoulder irregularity
    const jxBg   = (rng() - 0.5) * halfW * 0.52;   // background hill lateral offset
    const hBg    = 0.66 + rng() * 0.24;             // background hill height ratio
    // Two horizontal contour stroke heights (normalised 0–1 within hill height)
    const texH   = [0.34 + rng() * 0.14, 0.56 + rng() * 0.14] as const;
    const seed   = Math.round(px * 3 + py * 7);
    return { px, py, halfW, h, jxPeak, slopeL, slopeR, bump, jxBg, hBg, texH, seed };
  });
  drawables.sort((a, b) => a.py - b.py);

  for (const { px, py, halfW, h, jxPeak, slopeL, slopeR, bump, jxBg, hBg, texH, seed } of drawables) {
    // ── Background hill – paler, laterally offset, sits behind ───────────
    const bgPts = [
      { x: px + jxBg - halfW * 1.20,       y: py },
      { x: px + jxBg - halfW * 0.50,       y: py - h * 0.56 * hBg },
      { x: px + jxBg + jxPeak * 0.4,       y: py - h * hBg },
      { x: px + jxBg + halfW * 0.54,       y: py - h * 0.52 * hBg },
      { x: px + jxBg + halfW * 1.20,       y: py },
    ];
    washFill(graphics, bgPts, shade(INK.hills, 0.96), 0.18);
    inkOutline(graphics, bgPts, INK.inkFaint, 0.13, false, seed + 77);

    // ── Primary hill – asymmetric silhouette with shoulder irregularity ───
    const pts = [
      { x: px - halfW,                  y: py },
      { x: px - halfW * 0.58,           y: py - h * 0.42 * slopeL },
      { x: px - halfW * 0.18 + jxPeak, y: py - h * 0.80 + bump },
      { x: px + jxPeak,                 y: py - h },
      { x: px + halfW * 0.26 + jxPeak, y: py - h * 0.78 + bump * 0.5 },
      { x: px + halfW * 0.58,           y: py - h * 0.38 * slopeR },
      { x: px + halfW,                  y: py },
    ];
    washFill(graphics, pts, shade(INK.hills, 0.82), 0.52);
    inkOutline(graphics, pts, INK.inkSoft, 0.44, false, seed);

    // ── Horizontal contour strokes – ink-wash surface texture ────────────
    for (const tH of texH) {
      const wAtH = halfW * Math.sqrt(Math.max(0, 1 - tH * tH));
      const ty   = py - tH * h;
      waveLine(graphics, px + jxPeak - wAtH * 0.74, ty, px + jxPeak + wAtH * 0.70, ty, h * 0.028, 5, INK.inkSoft, 0.22);
    }

    // ── Soft base shadow ──────────────────────────────────────────────────
    graphics.fillStyle(INK.ink, 0.06);
    graphics.fillEllipse(px, py + 2, halfW * 1.72, h * 0.24);
  }
}

/** Pale wave-line texture across a water hex. */
export function decorateWater(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number): void {
  waveLine(graphics, center.x - size * 0.5, center.y, center.x + size * 0.5, center.y, size * 0.08, 6, INK.waterLine, 0.5);
  void rng;
}

/**
 * Warm-stone paving texture for fortress/city hexes: a subtle grid of mortar seams
 * that reads as a paved city platform beneath the building clusters.
 */
export function decorateFortress(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number): void {
  const stoneColor = 0xa89e82;
  graphics.lineStyle(1, stoneColor, 0.28);
  // Horizontal seam rows.
  for (let row = -1; row <= 1; row += 1) {
    const y = center.y + row * size * 0.3;
    graphics.lineBetween(center.x - size * 0.55, y, center.x + size * 0.55, y);
  }
  // Staggered vertical joints (brickwork pattern).
  const offsets = [-0.27, 0, 0.27];
  for (let col = 0; col < offsets.length; col += 1) {
    const x = center.x + offsets[col] * size;
    const rowShift = (col % 2) * size * 0.15;
    graphics.lineBetween(x, center.y - size * 0.42 + rowShift, x, center.y + size * 0.42 + rowShift);
  }
  void rng;
}

/** Encapsulates ink-wash background, terrain fill, fog, borders, and road rendering. */
export class InkMapRenderer implements MapRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    readonly theme: MapThemeDefinition,
  ) {}

  get palette(): MapThemePalette {
    return this.theme.palette;
  }

  decorateTerrain(graphics: Phaser.GameObjects.Graphics, terrain: HexTerrainType, centers: PixelPoint[], size: number, rng: () => number): void {
    if (centers.length === 0) return;
    switch (terrain) {
      case 'plains':
        centers.forEach((center) => decoratePlains(graphics, center, size, rng));
        return;
      case 'fields':
        centers.forEach((center) => decorateFields(graphics, center, size, rng));
        return;
      case 'riceFields':
        centers.forEach((center) => decorateRiceFields(graphics, center, size, rng));
        return;
      case 'forest':
        decorateForest(graphics, centers, size, rng);
        return;
      case 'mountains':
        decorateMountains(graphics, centers, size, rng);
        return;
      case 'hills':
        decorateHills(graphics, centers, size, rng);
        return;
      case 'water':
        centers.forEach((center) => decorateWater(graphics, center, size, rng));
        return;
      case 'fortress':
        centers.forEach((center) => decorateFortress(graphics, center, size, rng));
        return;
      default:
        return;
    }
  }

  /** Dark teal sea wash covering the whole world, textured with scattered wave-line strokes. */
  drawBackground(worldWidth: number, worldHeight: number): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    graphics.fillGradientStyle(INK.sea, INK.sea, INK.seaDeep, INK.seaDeep, 1);
    graphics.fillRect(0, 0, worldWidth, worldHeight);

    for (let index = 0; index < 80; index += 1) {
      const seed = index * 53 + 7;
      const x = (seed * 19) % worldWidth;
      const y = (seed * 37) % worldHeight;
      const length = 50 + (seed % 5) * 22;
      waveLine(graphics, x, y, x + length, y, 4 + (seed % 4), 6, INK.waterLine, 0.1);
    }

    return graphics;
  }

  /** Fills a hex polygon with its ink-wash terrain color and faint mottling. */
  drawHexFill(graphics: Phaser.GameObjects.Graphics, corners: PixelPoint[], color: number): void {
    washFill(graphics, corners, color, 1);
  }

  /** Stylized curling cloud motif for a hidden district's fog of war. */
  drawCloud(graphics: Phaser.GameObjects.Graphics, x: number, y: number, baseRadius: number, seed: number, alpha = 0.9): void {
    cloudMotif(graphics, x, y, baseRadius, seed, alpha);
  }

  /** Ink brush-stroke border: a soft dark underlay pass plus a colored ownership pass per edge. */
  drawZoneBorder(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>, color: number, alpha = 0.95): void {
    for (const [x1, y1, x2, y2] of edges) {
      const seed = Math.round(x1 + y1 * 3 + x2 * 7 + y2 * 11);
      const points: PixelPoint[] = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      brushStroke(graphics, points, 4, INK.ink, 0.3 * alpha, seed);
      brushStroke(graphics, points, 1.8, color, alpha, seed + 97);
    }
  }

  /** Thin tapering ink-brush line connecting two settlements. */
  drawRoad(graphics: Phaser.GameObjects.Graphics, points: PixelPoint[], widthFrom: number, widthTo: number): void {
    for (let index = 0; index < points.length - 1; index += 1) {
      const t = index / (points.length - 1);
      const width = Math.max(0.8, Phaser.Math.Linear(widthFrom, widthTo, t) * 0.35);
      brushStroke(graphics, [points[index], points[index + 1]], width, INK.inkSoft, 0.4, index * 17);
    }
  }
}
