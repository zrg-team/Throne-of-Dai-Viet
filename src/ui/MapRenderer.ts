/**
 * Ink-wash rendering for the map's terrain, background, and environment layers.
 * Pairs with `MapItemRenderer` (settlements, armies, badges) and shared helpers in
 * `inkTheme`. The standalone `decorate*` functions are consumed directly by
 * `terrainTypes.ts` for per-hex/per-region terrain decoration.
 */
import Phaser from 'phaser';
import type { PixelPoint } from '../map/hex';
import { INK, brushStroke, inkOutline, shade, washFill, waveLine, cloudMotif } from './inkTheme';

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
 * Builds a jagged ridge silhouette: a row of `peakCount` irregular peaks separated by
 * shallow valleys, running from the left base point to the right base point. Open shape -
 * the base edge is intentionally omitted so the silhouette fades into the terrain.
 */
function jaggedRidge(px: number, py: number, halfWidth: number, height: number, peakCount: number, size: number, rng: () => number): PixelPoint[] {
  const points: PixelPoint[] = [{ x: px - halfWidth, y: py }];
  const span = halfWidth * 2;
  for (let index = 0; index < peakCount; index += 1) {
    const peakT = (index + 0.5) / peakCount;
    const peakX = px - halfWidth + peakT * span + (rng() - 0.5) * size * 0.15;
    const dominant = index === Math.floor((peakCount - 1) / 2) ? 1 : 0.65 + rng() * 0.25;
    const peakHeight = height * (0.55 + rng() * 0.45) * dominant;
    points.push({ x: peakX, y: py - peakHeight });

    if (index < peakCount - 1) {
      const valleyT = (index + 1) / peakCount;
      const valleyX = px - halfWidth + valleyT * span;
      const valleyHeight = peakHeight * (0.25 + rng() * 0.25);
      points.push({ x: valleyX, y: py - valleyHeight });
    }
  }
  points.push({ x: px + halfWidth, y: py });
  return points;
}

/**
 * Layered ink-brush mountain silhouettes: jagged multi-peak ridgelines in a few varied
 * styles (tall single peak, rolling ridge, low hill cluster), each with a fainter inner
 * ridge stroke for depth and a pale mist band weaving across the lower slopes.
 */
export function decorateMountains(graphics: Phaser.GameObjects.Graphics, centers: PixelPoint[], size: number, rng: () => number): void {
  const peakCount = Math.max(1, Math.round(centers.length * 0.9));
  const peaks = shuffle(centers, rng).slice(0, peakCount);

  // Compute each peak's geometry up front, then draw back-to-front (by vertical position)
  // so nearer peaks (lower on screen) overlap and sit in front of ones behind them.
  const drawables = peaks.map((peak) => {
    const style = Math.floor(rng() * 3);
    const scale = style === 2 ? 1.6 + rng() * 1.2 : 2.4 + rng() * 2;
    const px = peak.x + (rng() - 0.5) * size * 0.7;
    const py = peak.y + (rng() - 0.5) * size * 0.4;
    const height = size * 0.6 * scale;
    const halfWidth = size * 0.5 * scale;
    const ridgePeaks = style === 0 ? 1 + Math.floor(rng() * 2) : style === 1 ? 3 + Math.floor(rng() * 2) : 2;
    return { px, py, height, halfWidth, style, ridgePeaks, seed: Math.round(px + py) };
  });
  drawables.sort((a, b) => a.py - b.py);

  for (const { px, py, height, halfWidth, style, ridgePeaks, seed } of drawables) {
    const points = jaggedRidge(px, py, halfWidth, height, ridgePeaks, size, rng);
    const fillColor = style === 2 ? shade(INK.mountain, 1.05) : shade(INK.mountain, 0.9 - style * 0.08);

    washFill(graphics, points, fillColor, 0.8);
    inkOutline(graphics, points, INK.ink, 0.8, false, seed);

    // Fainter inner ridge for layered depth, echoing the outer silhouette.
    if (style !== 2) {
      const innerPoints = jaggedRidge(px, py - height * 0.05, halfWidth * 0.6, height * 0.55, ridgePeaks, size, rng);
      inkOutline(graphics, innerPoints, INK.inkSoft, 0.5, false, seed + 11);
    }

    // Pale mist band weaving across the lower slopes.
    const mistY = py - height * (0.12 + rng() * 0.22);
    graphics.fillStyle(INK.cloud, 0.55);
    graphics.fillEllipse(px + (rng() - 0.5) * halfWidth * 0.5, mistY, halfWidth * (1.1 + rng() * 0.4), size * (0.16 + rng() * 0.1));
  }
}

/** Soft ink-wash ridgelines across a merged hills patch. */
export function decorateHills(graphics: Phaser.GameObjects.Graphics, centers: PixelPoint[], size: number, rng: () => number): void {
  const ridgeCount = Math.max(1, Math.round(centers.length * 0.7));
  const ridges = shuffle(centers, rng).slice(0, ridgeCount);

  for (const ridge of ridges) {
    const scale = 1.1 + rng() * 0.6;
    const px = ridge.x + (rng() - 0.5) * size * 0.7;
    const py = ridge.y + size * 0.2 + (rng() - 0.5) * size * 0.3;
    graphics.fillStyle(shade(INK.hills, 0.85), 0.32);
    graphics.fillEllipse(px, py, size * 0.9 * scale, size * 0.5 * scale);
    graphics.lineStyle(1, INK.inkSoft, 0.3);
    graphics.strokeEllipse(px, py, size * 0.9 * scale, size * 0.5 * scale);
  }
}

/** Pale wave-line texture across a water hex. */
export function decorateWater(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number): void {
  waveLine(graphics, center.x - size * 0.5, center.y, center.x + size * 0.5, center.y, size * 0.08, 6, INK.waterLine, 0.5);
  void rng;
}

/** Encapsulates ink-wash background, terrain fill, fog, borders, and road rendering. */
export class InkMapRenderer {
  constructor(private readonly scene: Phaser.Scene) {}

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
