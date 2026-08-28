/**
 * The country, as a shape.
 *
 * Two outlines, and the difference between them is the point of the bookend scenes. `REALM` is
 * Đại Việt as it actually stood in 1288 — the delta, the northern mountains, and a southern gate at
 * the Hoành Sơn — and it is the land the film's story is fought over. `SEABOARD` is the whole S of
 * the coast, which in 1288 was not Đại Việt at all and is drawn faint: the country the game's four
 * centuries of nam tiến arrive at, and never a claim about the century being shown.
 *
 * Coordinates are real degrees, projected once. Writing them as lon/lat rather than as
 * hand-nudged canvas points is what keeps the drawing from drifting into a shape that is merely
 * Vietnam-ish — every control point below can be checked against an atlas.
 */
import type { Pt } from '../../src/ui/ink/stroke';

/**
 * Degrees to world units. A latitude degree and a longitude degree at 15°N are within 4% here.
 *
 * The number is large because ink width in `src/ui/ink/` is in **screen** pixels unless the caller
 * passes `zoom`, and nothing in this film does. So the world is drawn at roughly 1:1 with the
 * output and a contour asked for at 1.9 arrives at 1.9. The first cut of this used K = 22, the map
 * plates ran at a camera scale of six, and the coastline came out as a rope.
 */
const K = 132;
const LON0 = 102;
const LAT0 = 24;

export const project = (lon: number, lat: number): Pt => ({ x: (lon - LON0) * K, y: (LAT0 - lat) * K });

type Deg = [number, number];

const path = (degrees: ReadonlyArray<Deg>): Pt[] => degrees.map(([lon, lat]) => project(lon, lat));

/**
 * Đại Việt under the Trần, closed.
 *
 * The coast runs from Móng Cái down to the Hoành Sơn, the pass that was the realm's southern gate
 * until Chế Mân's wedding gift of Ô and Lý in 1306 moved it to the Thu Bồn. The western edge is the
 * Annamite range, which is a watershed rather than a surveyed line and is drawn as one.
 */
export const REALM: Pt[] = path([
  // The northern frontier, west to east.
  [102.15, 22.40], [102.55, 22.75], [103.20, 22.85], [103.95, 22.65], [104.65, 22.85],
  [105.32, 23.35], [105.90, 22.95], [106.60, 22.90], [107.35, 22.45], [107.95, 21.65],
  // The coast, north to south. The delta's mouths are the densest part of the outline because
  // they are the densest part of the country.
  [107.40, 21.20], [106.95, 20.95], [106.75, 20.72], [106.55, 20.55], [106.30, 20.30],
  [106.10, 20.05], [105.95, 19.60], [105.85, 19.00], [105.78, 18.50], [106.00, 18.25],
  [106.35, 18.05], [106.60, 17.92],
  // The Annamite watershed, south to north — a range rather than a surveyed line.
  [106.05, 18.05], [105.50, 18.35], [104.95, 18.90], [104.55, 19.50], [104.10, 20.15],
  [103.70, 20.60], [103.15, 20.95], [102.85, 21.40], [102.45, 21.90],
]);

/**
 * The whole seaboard, for the last shot only. Not Đại Việt — the Chăm ports and the Khmer delta are
 * most of it, and the game's own timeline is how they stop being that.
 */
export const SEABOARD: Pt[] = path([
  [106.55, 17.9], [107.6, 16.55], [108.25, 16.05], [109.2, 13.8], [109.35, 12.2],
  [109.0, 11.3], [107.1, 10.35], [106.7, 9.6], [105.0, 8.6], [104.9, 9.6],
  [104.55, 10.4], [105.8, 11.0], [106.8, 11.6], [107.55, 12.3], [107.65, 14.7],
  [106.6, 16.4], [105.9, 17.4],
]);

/** Sông Hồng — the river the whole delta and the whole game are arranged around. */
export const RED_RIVER: Pt[] = path([
  [103.15, 22.6], [104.0, 22.15], [104.8, 21.7], [105.35, 21.35], [105.85, 21.03],
  [106.25, 20.7], [106.55, 20.35], [106.62, 20.15],
]);

/** Sông Đà, joining above Thăng Long. */
export const BLACK_RIVER: Pt[] = path([
  [102.85, 22.3], [103.6, 21.7], [104.4, 21.35], [105.05, 21.25], [105.4, 21.3],
]);

/** Sông Mã, the second delta. */
export const MA_RIVER: Pt[] = path([
  [104.6, 20.4], [105.2, 20.1], [105.75, 19.85], [105.95, 19.75],
]);

/**
 * Sông Bạch Đằng. Short, tidal, and the reason there is a country to draw.
 *
 * Three fleets have been destroyed in this estuary — Ngô Quyền's in 938, Lê Hoàn's in 981 and Trần
 * Hưng Đạo's in 1288 — every one of them by the same trick, and it is the tide that does the work.
 */
export const BACH_DANG: Pt[] = path([
  [106.55, 21.05], [106.72, 20.95], [106.85, 20.86], [106.98, 20.79],
]);

/** Thăng Long. */
export const THANG_LONG = project(105.85, 21.03);

/** Where the fleet died. */
export const BACH_DANG_MOUTH = project(106.9, 20.83);

/** The delta the middle of the film sits in. */
export const DELTA = project(106.1, 20.7);

// ── path work ─────────────────────────────────────────────────────────────────

/** Catmull-Rom through the control points, so a twenty-point coastline draws as a coastline. */
export function smoothPath(points: ReadonlyArray<Pt>, closed = false, per = 6): Pt[] {
  const source = closed ? [points[points.length - 1], ...points, points[0], points[1]] : [points[0], ...points, points[points.length - 1]];
  const out: Pt[] = [];
  for (let index = 0; index < source.length - 3; index += 1) {
    const p0 = source[index];
    const p1 = source[index + 1];
    const p2 = source[index + 2];
    const p3 = source[index + 3];
    for (let step = 0; step < per; step += 1) {
      const t = step / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(closed ? out[0] : points[points.length - 1]);
  return out;
}

/**
 * The first `fraction` of a path, measured along its own length.
 *
 * This is what makes a coastline *draw* rather than fade in, and it has to be by arc length rather
 * than by point count — the control points are far denser round the delta than along the mountain
 * border, so trimming by index would race across the west and crawl through the east.
 */
export function trimPath(points: ReadonlyArray<Pt>, fraction: number): Pt[] {
  if (fraction >= 1) return [...points];
  if (fraction <= 0) return [];
  let total = 0;
  const legs: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    legs.push(length);
    total += length;
  }
  const want = total * fraction;
  const out: Pt[] = [points[0]];
  let walked = 0;
  for (let index = 0; index < legs.length; index += 1) {
    if (walked + legs[index] >= want) {
      const t = legs[index] === 0 ? 0 : (want - walked) / legs[index];
      out.push({
        x: points[index].x + (points[index + 1].x - points[index].x) * t,
        y: points[index].y + (points[index + 1].y - points[index].y) * t,
      });
      return out;
    }
    walked += legs[index];
    out.push(points[index + 1]);
  }
  return out;
}

/** Point on a path at `fraction` along it — where the brush tip is, and where a fleet has got to. */
export function pointAt(points: ReadonlyArray<Pt>, fraction: number): Pt {
  const trimmed = trimPath(points, Math.max(0.0001, fraction));
  return trimmed[trimmed.length - 1] ?? points[0];
}

/** Bounds, for framing a camera on a shape rather than on numbers typed in by hand. */
export function boundsOf(points: ReadonlyArray<Pt>): { cx: number; cy: number; w: number; h: number } {
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
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}
