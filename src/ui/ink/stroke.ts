import Phaser from 'phaser';
import { inkWeight } from '../../game/graphicsQuality';
import { PIGMENT } from './palette';

/**
 * The five drawing primitives the whole art direction is made of.
 *
 * A Đông Hồ print is pulled in two passes: the colour blocks first, the black contour block last,
 * and hand registration is never quite perfect — so colour sits a hair outside its own outline.
 * That misregistration is the fingerprint of the medium, and `washFill` is where it lives.
 *
 * These operate on plain `Phaser.GameObjects.Graphics`, so they compose with everything already in
 * `MapScene`'s bake band and cost nothing extra at runtime.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Deterministic, cheap, and identical across reloads — a province must wobble the same way twice. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface InkOptions {
  /**
   * Line width in SCREEN pixels.
   *
   * Pass `zoom` alongside it. Ink that scales with the world thickens as the player zooms in and
   * turns the map to mud — the single easiest way to lose this look.
   */
  width?: number;
  alpha?: number;
  colour?: number;
  zoom?: number;
  /** Perpendicular jitter amplitude, in world units. 0 draws a ruled line. */
  wobble?: number;
  /** World distance between wobble nodes. Larger = calmer line. */
  step?: number;
  closed?: boolean;
}

/** Subdivides a path and pushes each node off the true line by a seeded amount. */
function wobblePath(pts: Pt[], seed: number, amp: number, step: number): Pt[] {
  if (amp <= 0) {
    return pts;
  }
  const rand = mulberry32(seed);
  const out: Pt[] = [];
  for (let index = 0; index < pts.length - 1; index += 1) {
    const a = pts[index];
    const b = pts[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nodes = Math.max(1, Math.round(length / step));
    const nx = -dy / length;
    const ny = dx / length;
    for (let node = 0; node < nodes; node += 1) {
      const t = node / nodes;
      const push = (rand() - 0.5) * 2 * amp;
      out.push({ x: a.x + dx * t + nx * push, y: a.y + dy * t + ny * push });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * A hand-pulled contour: a soaked, wider underlay pass and then the crisp block on top.
 * Two passes is what stops a vector line from reading as a vector line.
 */
export function inkPath(
  graphics: Phaser.GameObjects.Graphics,
  points: Pt[],
  seed: number,
  options: InkOptions = {},
): void {
  if (points.length < 2) {
    return;
  }
  // `INK_WEIGHT` is the whole game's contour weight in one place — see `graphicsQuality`. Every
  // line in this file was tuned against a 390-wide buffer stretched to the panel, which fattens a
  // stroke considerably; drawn into a full-resolution buffer the same number arrives thin, and the
  // higher quality settings looked *worse* because the outlines went away. Applied here rather than
  // at the call sites so the map, the props and the chrome all keep step with each other.
  const width = (options.width ?? 1.4) * inkWeight();
  const alpha = options.alpha ?? 0.92;
  const colour = options.colour ?? PIGMENT.muc;
  const zoom = options.zoom ?? 1;
  const path = options.closed ? [...points, points[0]] : points;
  const drawn = wobblePath(path, seed, options.wobble ?? 0.75, options.step ?? 9);

  // The soaked underlay, wider and much fainter than the block on top. Widened and lightened
  // together: at 2x/0.26 it read as a second hard line just outside the first, which is what made a
  // crisp contour look harsh rather than printed. Ink soaking into paper spreads *further* and
  // *weaker* than this pass used to, and the softness is most of what the low-resolution blur was
  // supplying for free.
  graphics.lineStyle((width * 2.6) / zoom, colour, alpha * 0.14);
  graphics.strokePoints(drawn, false, false);
  graphics.lineStyle((width * 1.5) / zoom, colour, alpha * 0.2);
  graphics.strokePoints(drawn, false, false);
  graphics.lineStyle(width / zoom, colour, alpha * 0.88);
  graphics.strokePoints(drawn, false, false);
}

/**
 * The colour block, pulled before the ink block and registered by hand.
 *
 * The offset is the whole trick: at zero it reads as clip-art, at 1.5–2 px it reads as printed.
 */
export function washFill(
  graphics: Phaser.GameObjects.Graphics,
  points: Pt[],
  colour: number,
  seed: number,
  alpha = 1,
  registration = 1.6,
): void {
  if (points.length < 3) {
    return;
  }
  const rand = mulberry32(seed);
  const dx = (rand() - 0.35) * registration * 1.6;
  const dy = (rand() - 0.35) * registration * 1.6;
  graphics.translateCanvas(dx, dy);
  graphics.fillStyle(colour, alpha);
  graphics.fillPoints(points, true);
  graphics.translateCanvas(-dx, -dy);
}

/**
 * Ownership without hue: parallel rules clipped to a region, with the ANGLE carrying the faction.
 * Direction is a second channel, so the map still reads in greyscale and to a colourblind player.
 */
export function hatchPoly(
  graphics: Phaser.GameObjects.Graphics,
  points: Pt[],
  angle: number,
  gap: number,
  colour: number,
  alpha: number,
  width = 0.85,
): void {
  if (points.length < 3) {
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const reach = Math.hypot(maxX - minX, maxY - minY);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Phaser Graphics has no clip, so the rules are trimmed against the polygon analytically —
  // which is also cheaper than a mask, and works inside the static bake.
  const polygon = new Phaser.Geom.Polygon(points.flatMap((p) => [p.x, p.y]));
  graphics.lineStyle(width, colour, alpha);
  for (let offset = -reach; offset <= reach; offset += gap) {
    const ax = cx + cos * -reach - sin * offset;
    const ay = cy + sin * -reach + cos * offset;
    const bx = cx + cos * reach - sin * offset;
    const by = cy + sin * reach + cos * offset;
    for (const [sx, sy, ex, ey] of clipSegment(polygon, ax, ay, bx, by)) {
      graphics.lineBetween(sx, sy, ex, ey);
    }
  }
}

/** Returns the spans of a segment that fall inside a polygon, as [x1,y1,x2,y2] tuples. */
function clipSegment(
  polygon: Phaser.Geom.Polygon,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Array<[number, number, number, number]> {
  const hits: number[] = [0, 1];
  const points = polygon.points;
  for (let index = 0; index < points.length; index += 1) {
    const p1 = points[index];
    const p2 = points[(index + 1) % points.length];
    const denominator = (bx - ax) * (p2.y - p1.y) - (by - ay) * (p2.x - p1.x);
    if (Math.abs(denominator) < 1e-9) {
      continue;
    }
    const t = ((p1.x - ax) * (p2.y - p1.y) - (p1.y - ay) * (p2.x - p1.x)) / denominator;
    const u = ((p1.x - ax) * (by - ay) - (p1.y - ay) * (bx - ax)) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      hits.push(t);
    }
  }
  hits.sort((a, b) => a - b);

  const spans: Array<[number, number, number, number]> = [];
  for (let index = 0; index < hits.length - 1; index += 1) {
    const mid = (hits[index] + hits[index + 1]) / 2;
    const mx = ax + (bx - ax) * mid;
    const my = ay + (by - ay) * mid;
    if (!Phaser.Geom.Polygon.Contains(polygon, mx, my)) {
      continue;
    }
    spans.push([
      ax + (bx - ax) * hits[index],
      ay + (by - ay) * hits[index],
      ax + (bx - ax) * hits[index + 1],
      ay + (by - ay) * hits[index + 1],
    ]);
  }
  return spans;
}

/**
 * Offsets a polyline into a closed shape of varying width.
 * What turns a stroke into a limb, a horn, a leaf, or a raised bund with real volume.
 */
export function thickPath(points: Pt[], widths: number[]): Pt[] {
  const near: Pt[] = [];
  const far: Pt[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const width = widths[index];
    near.push({ x: points[index].x + nx * width, y: points[index].y + ny * width });
    far.push({ x: points[index].x - nx * width, y: points[index].y - ny * width });
  }
  return near.concat(far.reverse());
}

/**
 * Soft, edgeless ground tone.
 *
 * Drawn as concentric rings of falling alpha rather than one disc, so that neighbouring cells
 * overlap into a single continuous field of colour with no seam to find. This is the routine that
 * stops a hex grid leaking back into the picture.
 */
export function groundTone(
  graphics: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  radius: number,
  colour: number,
  alpha: number,
  rings = 4,
): void {
  for (let ring = rings; ring >= 1; ring -= 1) {
    const t = ring / rings;
    graphics.fillStyle(colour, (alpha / rings) * (1.35 - t * 0.7));
    graphics.fillCircle(cx, cy, radius * (0.45 + t * 0.85));
  }
}

/** Convenience: a closed polygon washed and then contoured, the commonest pairing. */
export function printedShape(
  graphics: Phaser.GameObjects.Graphics,
  points: Pt[],
  colour: number,
  seed: number,
  options: InkOptions & { fillAlpha?: number } = {},
): void {
  washFill(graphics, points, colour, seed, options.fillAlpha ?? 0.9);
  inkPath(graphics, points, seed + 1, { ...options, closed: true });
}
