/**
 * Chim Lạc — the bird of the Đông Sơn drum, flying.
 *
 * Drawn from the Ngọc Lũ drum face rather than from an idea of a bird. The first pass here was a
 * white egret invented from the phrase "cò bay lả bay la", and it failed twice over: a white bird
 * on điệp paper is a wire outline with nothing inside it, and nothing about the shape said Vietnam.
 * The drum's bird is the opposite of both — it is the most recognisable image in Vietnamese art, it
 * is *solid*, and it was designed by people casting it a centimetre across in bronze, which is
 * almost exactly the size this map needs it at.
 *
 * What the drum draws, and what this keeps:
 *
 *  · a **needle beak**, longer than the head and neck together. This is the identifying mark;
 *    without it the silhouette is a gull.
 *  · a small head with a **crest** sweeping back off the crown.
 *  · a long, slim, nearly level **body wedge** — four or five times as long as it is deep, which is
 *    why the motif reads as a dart rather than a blob.
 *  · a **wing swept back and up** and a **tail swept back and down**, each ending in a fringe of
 *    parallel strokes. The pair of backward blades is the signature of the thing.
 *  · solid ink, not outline. On the drum it is bronze against a light ground; here it is `muc`
 *    against paper, which is what makes a twelve-unit bird visible at all.
 *
 * The drum's own feather-bar hatching is dropped: at this size the bars close into a smudge and
 * take the silhouette with them. Everything above survives; the hatching is the one thing that
 * cannot.
 *
 * Drawn facing +x. `ink/life.ts` handles turning it round.
 */
import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { inkPath, mulberry32, washFill, type Pt } from './stroke';
import { bakeProp, type BakedProp } from './sprites';

type G = Phaser.GameObjects.Graphics;

/** Wing position. A skein alternates between the two. */
export type WingBeat = 'down' | 'up';

/** Body unit in design units. The whole bird spans about 2.4 of these, and stands 0.9 tall. */
export const LAC_BIRD_UNIT = 5;

/**
 * One chim Lạc, shoulder at (x, y), flying to the right.
 */
export function lacBird(g: G, x: number, y: number, s: number, seed: number, beat: WingBeat): void {
  const rand = mulberry32(seed);
  const ink = PIGMENT.muc;
  // The upstroke throws the wing up and folds the tail in; the downstroke lays the wing back along
  // the body. Two poses rather than a tween: at this size a wingbeat is a change of shape.
  const up = beat === 'up';
  const w = s / LAC_BIRD_UNIT;

  // ── body: a long slim wedge, nearly level ──
  washFill(g, [
    { x: x + 0.46 * s, y: y - 0.04 * s },
    { x: x + 0.12 * s, y: y - 0.15 * s },
    { x: x - 0.46 * s, y: y - 0.05 * s },
    { x: x - 0.62 * s, y: y + 0.06 * s },
    { x: x - 0.05 * s, y: y + 0.15 * s },
    { x: x + 0.4 * s, y: y + 0.07 * s },
  ], ink, seed, 0.92);

  // ── wing, swept back and up, ending in a fringe ──
  const tip = up
    ? { x: x - 0.5 * s, y: y - 0.72 * s }
    : { x: x - 0.68 * s, y: y - 0.26 * s };
  washFill(g, [
    { x: x + 0.2 * s, y: y - 0.08 * s },
    { x: x - 0.08 * s, y: (y + tip.y) / 2 - 0.06 * s },
    tip,
    { x: tip.x - 0.16 * s, y: tip.y + 0.12 * s },
    { x: x - 0.22 * s, y: y - 0.1 * s },
  ], ink, seed + 1, 0.92);

  // ── tail, swept back and down: the second blade ──
  const tailTip = { x: x - 1.06 * s, y: y + (up ? 0.34 : 0.46) * s };
  washFill(g, [
    { x: x - 0.34 * s, y: y + 0.02 * s },
    { x: x - 0.86 * s, y: y + (up ? 0.2 : 0.3) * s },
    tailTip,
    { x: tailTip.x + 0.1 * s, y: tailTip.y + 0.1 * s },
    { x: x - 0.4 * s, y: y + 0.14 * s },
  ], ink, seed + 2, 0.92);

  /**
   * The fringe of primaries at a blade's end.
   *
   * Drawn as teeth ON the blade, each one a triangle whose base sits on the blade's own end edge,
   * so the fringe is part of the shape. Drawn as separate strokes — which is what the drum's
   * engraver did, and what the first pass copied — they arrive at this size as a row of little
   * bars floating just off the wing, and the bird looks like it is shedding parts.
   */
  const fringe = (from: Pt, to: Pt, reach: number, drop: number, key: number): void => {
    for (let feather = 0; feather < 3; feather += 1) {
      const t0 = feather / 3;
      const t1 = (feather + 1) / 3;
      const at = (t: number): Pt => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      const base = at(t0);
      washFill(g, [
        base,
        at(t1),
        { x: base.x - reach, y: base.y + drop + feather * 0.05 * s },
      ], ink, key + feather, 0.9);
    }
  };

  fringe(
    { x: tip.x + 0.02 * s, y: tip.y + 0.02 * s },
    { x: tip.x - 0.14 * s, y: tip.y + 0.14 * s },
    0.2 * s,
    0.1 * s,
    seed + 10,
  );
  fringe(
    { x: tailTip.x + 0.06 * s, y: tailTip.y - 0.02 * s },
    { x: tailTip.x + 0.12 * s, y: tailTip.y + 0.1 * s },
    0.18 * s,
    0.04 * s,
    seed + 20,
  );

  // ── head, crest, beak ──
  const headX = x + 0.52 * s;
  const headY = y - 0.13 * s;
  washFill(g, [
    { x: headX - 0.1 * s, y: headY - 0.09 * s },
    { x: headX + 0.11 * s, y: headY - 0.06 * s },
    { x: headX + 0.12 * s, y: headY + 0.08 * s },
    { x: headX - 0.1 * s, y: headY + 0.1 * s },
  ], ink, seed + 3, 0.94);
  // The crest, as one swept horn off the crown rather than two loose lines — same reason as the
  // fringe: a stroke that starts at the head still reads as detached once it is three pixels long.
  washFill(g, [
    { x: headX + 0.06 * s, y: headY - 0.08 * s },
    { x: headX - 0.32 * s, y: headY - 0.3 * s },
    { x: headX - 0.06 * s, y: headY - 0.02 * s },
  ], ink, seed + 30, 0.9);
  // The beak carries the whole identity: longer than head and neck together, a tapering wedge
  // rather than a line so it keeps its weight at the face and comes to a real point.
  washFill(g, [
    { x: headX + 0.08 * s, y: headY - 0.07 * s },
    { x: headX + 0.66 * s, y: headY + 0.04 * s },
    { x: headX + 0.08 * s, y: headY + 0.07 * s },
  ], ink, seed + 4, 0.94);

  // Legs, tucked and trailing. Barely there, and the silhouette is wrong without them.
  inkPath(g, [
    { x: x - 0.24 * s, y: y + 0.13 * s },
    { x: x - 0.52 * s + rand() * 0.05 * s, y: y + 0.24 * s },
  ], seed + 5, { width: 0.45 * w, alpha: 0.7, colour: ink, wobble: 0.05 * w, step: 3 * w });
}

/** Both poses, baked once per run. */
export function bakeLacBirds(scene: Phaser.Scene): Record<WingBeat, BakedProp> {
  const S = LAC_BIRD_UNIT;
  // Wide and shallow, like the bird: the box holds the beak in front, the tail fringe behind and
  // the upstroke's wing tip above.
  const box = { left: -S * 1.5, right: S * 1.3, top: -S * 1.0, bottom: S * 0.75 };
  return {
    down: bakeProp(scene, 'lac:down', box, (g, x, y, raster) => lacBird(g, x, y, S * raster, 913, 'down')),
    up: bakeProp(scene, 'lac:up', box, (g, x, y, raster) => lacBird(g, x, y, S * raster, 913, 'up')),
  };
}
