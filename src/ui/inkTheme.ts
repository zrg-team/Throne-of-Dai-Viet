/**
 * Ink-wash palette and brush-drawing helpers shared by `MapRenderer` and `MapItemRenderer`.
 * These operate on plain `Phaser.GameObjects.Graphics` instances so they can be reused for
 * both terrain decoration (called from `terrainTypes.ts`) and map-item rendering.
 */
import Phaser from 'phaser';

export interface PointLike {
  x: number;
  y: number;
}

/** Chinese ink-wash scroll palette: dark teal sea, jade-green land, ink outlines, red seals. */
export const INK = {
  ink: 0x20261f,
  inkSoft: 0x47553f,
  inkFaint: 0x6c7a63,

  sea: 0x3f5e5c,
  seaDeep: 0x294845,

  landPlains: 0x9bb98a,
  landFields: 0xc4cf8e,
  landRice: 0xacc991,
  landForest: 0x6f8f64,

  mountain: 0x8a9883,
  mountainDark: 0x687560,
  mountainMist: 0xeef1e9,

  hills: 0x96a482,

  cloud: 0xeef1e9,
  cloudShadow: 0xb9c4b8,

  sealRed: 0xaa3a2c,
  sealRedDark: 0x7d2a20,

  waterLine: 0xd7e6e1,
};

/** Deterministic pseudo-random in [0, 1) derived from a numeric seed. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Darkens (factor < 1) or lightens (factor > 1) a 0xRRGGBB color. */
export function shade(color: number, factor: number): number {
  const r = Phaser.Math.Clamp(Math.round(((color >> 16) & 0xff) * factor), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(((color >> 8) & 0xff) * factor), 0, 255);
  const b = Phaser.Math.Clamp(Math.round((color & 0xff) * factor), 0, 255);
  return (r << 16) | (g << 8) | b;
}

function jitteredSegments(g: Phaser.GameObjects.Graphics, points: PointLike[], seed: number, jitter: number): void {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const jitterA = (pseudoRandom(seed + index) - 0.5) * 2 * jitter;
    const jitterB = (pseudoRandom(seed + index + 1) - 0.5) * 2 * jitter;
    g.lineBetween(a.x + nx * jitterA, a.y + ny * jitterA, b.x + nx * jitterB, b.y + ny * jitterB);
  }
}

/**
 * Draws a hand-brushed ink stroke along `points`: a soft, wider underlay pass plus a
 * crisper top pass, each with small perpendicular jitter so the line reads as a brush
 * stroke rather than a ruled line.
 */
export function brushStroke(
  g: Phaser.GameObjects.Graphics,
  points: PointLike[],
  width: number,
  color: number,
  alpha: number,
  seed = 0,
): void {
  if (points.length < 2) {
    return;
  }

  g.lineStyle(width * 1.6, color, alpha * 0.35);
  jitteredSegments(g, points, seed, width * 0.4);

  g.lineStyle(width, color, alpha);
  jitteredSegments(g, points, seed + 97, width * 0.25);
}

/** Double-pass ink outline (soft wide pass + crisp pass) around a closed or open shape. */
export function inkOutline(
  g: Phaser.GameObjects.Graphics,
  points: PointLike[],
  color: number = INK.ink,
  alpha = 0.85,
  closed = true,
  seed = 0,
): void {
  const path = closed ? [...points, points[0]] : points;
  brushStroke(g, path, 1.8, color, alpha, seed);
}

/** Fills a polygon and adds a few low-alpha mottling ellipses to suggest ink-wash texture. */
export function washFill(
  g: Phaser.GameObjects.Graphics,
  points: PointLike[],
  color: number,
  alpha = 1,
  rng?: () => number,
): void {
  g.fillStyle(color, alpha);
  g.fillPoints(points, true);

  if (!rng) {
    return;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  g.fillStyle(shade(color, 0.85), alpha * 0.18);
  for (let index = 0; index < 2; index += 1) {
    const px = minX + rng() * (maxX - minX);
    const py = minY + rng() * (maxY - minY);
    g.fillEllipse(px, py, (maxX - minX) * 0.4, (maxY - minY) * 0.3);
  }
}

/** Gentle sine-wave stroke between two points, used for ocean/water texture. */
export function waveLine(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amplitude: number,
  segments: number,
  color: number,
  alpha: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;

  g.lineStyle(1, color, alpha);
  let prevX = x1;
  let prevY = y1;
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const wobble = Math.sin(t * Math.PI * 2) * amplitude;
    const px = x1 + dx * t + nx * wobble;
    const py = y1 + dy * t + ny * wobble;
    g.lineBetween(prevX, prevY, px, py);
    prevX = px;
    prevY = py;
  }
}

/**
 * Soft cloud-puff cluster for fog of war: a darker shadow layer beneath, bright body
 * circles, and small highlight circles on top so the fog reads as a cottony cloud.
 */
export function cloudMotif(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  baseRadius: number,
  seed: number,
  alpha = 0.9,
): void {
  const puffCount = 6;
  const puffs: Array<{ x: number; y: number; radius: number }> = [];
  for (let index = 0; index < puffCount; index += 1) {
    const angle = ((seed + index * 67) % 360) * Phaser.Math.DEG_TO_RAD;
    const distance = baseRadius * (0.2 + (((seed >> (index * 3)) & 7) / 14));
    const radius = baseRadius * (0.45 + (((seed >> (index * 5)) & 3) * 0.14));
    puffs.push({
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance * 0.7,
      radius,
    });
  }

  g.fillStyle(0xb9c7cd, alpha * 0.55);
  for (const puff of puffs) {
    g.fillCircle(puff.x, puff.y + puff.radius * 0.22, puff.radius * 0.96);
  }

  g.fillStyle(0xf3f8fb, alpha);
  for (const puff of puffs) {
    g.fillCircle(puff.x, puff.y, puff.radius);
  }

  g.fillStyle(0xffffff, Math.min(1, alpha + 0.1));
  for (const puff of puffs) {
    g.fillCircle(puff.x - puff.radius * 0.28, puff.y - puff.radius * 0.32, puff.radius * 0.55);
  }
}
