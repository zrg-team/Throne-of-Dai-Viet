/**
 * The handful of things the film needs that the map has never had to draw.
 *
 * `src/ui/ink/` supplies the country — houses, đình, tháp, trees, buffalo, farmers, soldiers,
 * seals, herons — and everything here is built on the same five primitives so it sits in the same
 * print. Nothing in this file invents a colour: every pigment comes out of `PIGMENT`, and the
 * scarcity law holds, so sỏi son appears on Đại Việt's own banners, on fire, and nowhere else.
 *
 * A war junk is the one shape a Đông Hồ block-cutter never had to cut, so it is drawn the way this
 * game draws a building — an oblique with two faces showing, a flat colour block, a soot contour
 * over it — rather than in the profile a ship is usually given.
 */
import { PIGMENT, shadePigment } from '../../src/ui/ink/palette';
import { inkPath, mulberry32, printedShape, washFill, type Pt } from '../../src/ui/ink/stroke';
import type { G } from './inkCanvas';
import { clamp01, lerp } from './ease';

/** The depth vector every building on the map shares. Ships obey it too, so they sit in the same world. */
const OBLIQUE = { x: 0.62, y: -0.42 };

// ── ground and sky ────────────────────────────────────────────────────────────

/**
 * A horizon: the land as one colour block with a wobbled top edge, and no line under the sky.
 *
 * A ruled horizon is the fastest way to make this look like a chart. The edge is drawn as ink only
 * where the land meets the sky, and the block is pulled a hair proud of it, as a colour block is.
 */
export function horizon(
  g: G, y: number, x0: number, x1: number, bottom: number, colour: number, seed: number, alpha = 0.85,
): void {
  const rand = mulberry32(seed);
  const edge: Pt[] = [];
  const steps = 26;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    edge.push({ x: lerp(x0, x1, t), y: y + Math.sin(t * 7.1 + seed) * 5 + (rand() - 0.5) * 4 });
  }
  washFill(g, [...edge, { x: x1, y: bottom }, { x: x0, y: bottom }], colour, seed, alpha, 2.2);
  inkPath(g, edge, seed + 1, { width: 1.3, alpha: 0.5, wobble: 1.4, step: 22 });
}

/**
 * The sky as a wash that only exists near the top of it.
 *
 * On điệp paper the sky is normally the paper. It is given a colour here only when the hour
 * demands one — the northern army arriving, and the night on the river.
 */
export function skyWash(g: G, x0: number, x1: number, y0: number, y1: number, colour: number, alpha: number): void {
  if (alpha <= 0.002) return;
  const bands = 7;
  for (let index = 0; index < bands; index += 1) {
    const a = y0 + ((y1 - y0) * index) / bands;
    const b = y0 + ((y1 - y0) * (index + 1)) / bands;
    g.fillStyle(colour, alpha * (1 - index / bands) ** 1.5);
    g.fillPoints([{ x: x0, y: a }, { x: x1, y: a }, { x: x1, y: b }, { x: x0, y: b }], true);
  }
}

// ── water ─────────────────────────────────────────────────────────────────────

/**
 * Open water: a chàm block with the surface written on it in short strokes.
 *
 * The strokes drift with `phase` and that drift is the only thing that says the river is moving.
 * They are struck in **rows that do not line up** — a grid of dashes reads as corduroy, which is
 * the mistake the first version of this made.
 */
export function water(
  g: G, x0: number, x1: number, surface: number, floor: number, seed: number, phase: number, alpha = 0.62,
): void {
  const rand = mulberry32(seed);
  const edge: Pt[] = [];
  const steps = 30;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = lerp(x0, x1, t);
    edge.push({ x, y: surface + Math.sin(t * 11 + phase * 2.2) * 1.6 + Math.sin(t * 27 - phase * 3.1) * 0.8 });
  }
  washFill(g, [...edge, { x: x1, y: floor }, { x: x0, y: floor }], PIGMENT.cham, seed, alpha, 2.4);
  inkPath(g, edge, seed + 3, { width: 1.1, alpha: 0.42, colour: PIGMENT.cham, wobble: 0.9, step: 18 });

  const rows = Math.max(3, Math.round((floor - surface) / 26));
  for (let row = 0; row < rows; row += 1) {
    const y = surface + 14 + row * ((floor - surface - 14) / rows);
    const drift = (phase * (14 + row * 5)) % 90;
    for (let dash = -1; ; dash += 1) {
      const x = x0 + dash * 90 + drift + rand() * 8;
      if (x > x1) break;
      if (x < x0 - 40) continue;
      const length = 16 + rand() * 22;
      const lift = Math.sin(x * 0.03 + phase * 2 + row) * 2;
      inkPath(g, [
        { x, y: y + lift },
        { x: x + length * 0.45, y: y + lift - 1.6 },
        { x: x + length, y: y + lift },
      ], row * 31 + dash, { width: 0.85, alpha: 0.3, colour: PIGMENT.chamPale, wobble: 0.4, step: 9 });
    }
  }
}

/** The line where water meets land or hull, struck bright so the eye finds the tide. */
export function tideLine(g: G, x0: number, x1: number, y: number, seed: number, alpha = 0.5): void {
  const points: Pt[] = [];
  for (let index = 0; index <= 24; index += 1) {
    const t = index / 24;
    points.push({ x: lerp(x0, x1, t), y: y + Math.sin(t * 13 + seed) * 1.4 });
  }
  inkPath(g, points, seed, { width: 1.5, alpha, colour: PIGMENT.diepHi, wobble: 0.5, step: 14 });
}

// ── the stakes ────────────────────────────────────────────────────────────────

/**
 * A cọc: an ironwood pile the length of a man and a half, iron-shod, driven into the bed leaning
 * downstream so a hull rides up onto it rather than shouldering it aside.
 *
 * `driven` runs 0 → 1 as it goes in. `bite` is how far it stands proud of the water, which is not
 * a property of the stake at all — it is the tide, and the whole battle is in that number.
 */
export function stake(g: G, x: number, bedY: number, length: number, lean: number, seed: number, driven = 1): void {
  const sunk = lerp(-length * 0.5, 0, clamp01(driven));
  const tip: Pt = { x: x + Math.sin(lean) * length, y: bedY - Math.cos(lean) * length + sunk };
  const foot: Pt = { x, y: bedY + sunk + 3 };
  const width = Math.max(1.6, length * 0.055);
  const across = { x: Math.cos(lean) * width, y: Math.sin(lean) * width };

  printedShape(g, [
    { x: foot.x - across.x, y: foot.y - across.y },
    { x: tip.x - across.x * 0.45, y: tip.y - across.y * 0.45 },
    { x: tip.x + across.x * 0.45, y: tip.y + across.y * 0.45 },
    { x: foot.x + across.x, y: foot.y + across.y },
  ], PIGMENT.nauDark, seed, { width: 1.05, alpha: 0.8, wobble: 0.5, step: 10, fillAlpha: 0.9 });

  // The iron shoe. Small, and the only cold colour on the stake — it is what does the damage.
  const shoe = length * 0.14;
  const back: Pt = { x: tip.x - Math.sin(lean) * shoe, y: tip.y + Math.cos(lean) * shoe };
  printedShape(g, [
    { x: back.x - across.x * 0.5, y: back.y - across.y * 0.5 },
    { x: tip.x, y: tip.y },
    { x: back.x + across.x * 0.5, y: back.y + across.y * 0.5 },
  ], PIGMENT.mucSoft, seed + 5, { width: 0.9, alpha: 0.9, wobble: 0.2, step: 6, fillAlpha: 0.95 });
}

/** The ring a pile-driver leaves on the water. Reads as sound, which is the job. */
export function ripple(g: G, x: number, y: number, radius: number, alpha: number): void {
  if (alpha <= 0.01) return;
  const points: Pt[] = [];
  for (let index = 0; index <= 22; index += 1) {
    const a = (index / 22) * Math.PI * 2;
    points.push({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius * 0.3 });
  }
  inkPath(g, points, 77, { width: 1.2, alpha, colour: PIGMENT.diepHi, wobble: 0.6, step: 10, closed: true });
}

// ── ships ─────────────────────────────────────────────────────────────────────

export interface ShipPose {
  /** Radians. Positive heels the ship away from the viewer — what a hull on a stake does. */
  heel?: number;
  /** 0 → 1. Sail furled to full. */
  sail?: number;
  /** 0 → 1. How far the ship has come apart. */
  wreck?: number;
  accent?: number;
}

/**
 * A war junk of the Yuan fleet: blunt raked bow, a sheer that lifts aft, a high square transom, and
 * one battened lug sail on a mast stepped well forward.
 *
 * The first cut of this drew the hull as a lozenge with a rectangle floating over it, which is what
 * a ship becomes when it is drawn as a list of parts. What makes it read is the **sheer** — the
 * curve of the deck edge, rising from bow to stern — and the fact that the sail is attached to a
 * mast you can see, with its foot down at deck level rather than hovering above it.
 *
 * Drawn in the map's own oblique with the deck showing, because a ship in flat profile beside
 * buildings drawn in oblique reads as a cut-out laid on the picture rather than as something
 * floating in it.
 */
export function junk(g: G, x: number, y: number, s: number, seed: number, pose: ShipPose = {}): void {
  const heel = pose.heel ?? 0;
  const sail = clamp01(pose.sail ?? 1);
  const wreck = clamp01(pose.wreck ?? 0);
  const rand = mulberry32(seed);

  const cos = Math.cos(heel);
  const sin = Math.sin(heel);
  /** Ship space: `dx` runs bow (negative) to stern, `dy` up from the waterline. */
  const P = (dx: number, dy: number): Pt => ({
    x: x + (dx * cos - dy * sin) * s,
    y: y + (dx * sin + dy * cos) * s,
  });

  // The rudder first — it hangs off the transom and belongs behind the hull.
  printedShape(g, [P(44, -4), P(52, -2), P(50, 12), P(42, 9)], PIGMENT.nauDark, seed + 30,
    { width: 1.1, alpha: 0.8, wobble: 0.4, step: 8, fillAlpha: 0.9 });

  const sheer: Pt[] = [
    P(-44, -9), P(-32, -15), P(-12, -16.5), P(8, -17), P(24, -18.5), P(34, -24), P(45, -27),
  ];
  const hull: Pt[] = [
    ...sheer,
    P(46, -7), P(43, 3), P(26, 9), P(4, 11), P(-18, 8.5), P(-34, 2.5),
  ];
  printedShape(g, hull, PIGMENT.nau, seed, { width: 1.6, alpha: 0.88, wobble: 0.8, step: 12, fillAlpha: 0.92 });

  // The deck, one shade up and offset along the oblique. This is what gives the hull a top rather
  // than a colour.
  washFill(g, [
    ...sheer.map((point) => ({ x: point.x + OBLIQUE.x * 3.2 * s, y: point.y + OBLIQUE.y * 3.2 * s })),
    P(43, -25), P(22, -16.5), P(6, -15), P(-12, -14.5), P(-32, -13),
  ], shadePigment(PIGMENT.nau, 1.3), seed + 1, 0.8, 1.4);

  // Two strakes, never more — a hull ruled like graph paper stops being a printed shape.
  for (let strake = 0; strake < 2; strake += 1) {
    inkPath(g, [P(-36, -3 + strake * 5), P(0, -7 + strake * 6), P(40, -12 + strake * 6)], seed + 10 + strake, {
      width: 0.9, alpha: 0.32, colour: PIGMENT.nauDark, wobble: 0.5, step: 14,
    });
  }

  // The transom, and the stern gallery over it. Between them they are the shape that says junk from
  // any distance at all.
  printedShape(g, [P(34, -24), P(45, -27), P(50, -42), P(36, -39)], shadePigment(PIGMENT.nau, 0.84), seed + 2,
    { width: 1.2, alpha: 0.85, wobble: 0.5, step: 8, fillAlpha: 0.92 });
  inkPath(g, [P(37, -32), P(48, -35)], seed + 3, { width: 1, alpha: 0.45, colour: PIGMENT.nauDark, wobble: 0.3, step: 7 });

  // Mast and sail. The mast goes before the hull is lost, so `wreck` takes it down first.
  const fall = wreck * 1.2;
  const mastFoot = P(-6, -16);
  // Shorter than the first cut's 82. A lug sail is roughly as tall as the hull is long, and at 82
  // the cloth came out taller than the ship and read as a pale flag hung over a boat.
  const head = 66;
  const mastTop = P(-6 + Math.sin(fall) * head, -16 - Math.cos(fall) * head);
  inkPath(g, [mastFoot, mastTop], seed + 4,
    { width: 2.2, alpha: 0.9, colour: PIGMENT.nauDark, wobble: 0.3, step: 26 });

  // The sail goes early and completely. Held to the end of `wreck` it swings round on the falling
  // mast as a large pale quadrilateral and reads as a ghost pasted over the far bank.
  if (sail > 0.02 && wreck < 0.5) {
    const along = (k: number): Pt => ({
      x: mastFoot.x + (mastTop.x - mastFoot.x) * k,
      y: mastFoot.y + (mastTop.y - mastFoot.y) * k,
    });
    const throat = along(0.94);
    const tack = along(0.06);
    const belly = 1 + 0.16 * sail;
    // The leech runs aft of the mast, bellied by the wind coming over the quarter. It carries a
    // mid-point pushed further out than either end: a lug sail under way is a curve, and four
    // straight sides is a signboard.
    const peak = { x: throat.x + 33 * s * cos * belly, y: throat.y + 33 * s * sin * belly - 3 * s };
    const clew = { x: tack.x + 29 * s * cos * belly, y: tack.y + 29 * s * sin * belly - 4 * s };
    const bow = {
      x: (peak.x + clew.x) / 2 + 7 * s * cos * belly,
      y: (peak.y + clew.y) / 2 + 7 * s * sin * belly,
    };
    const cloth: Pt[] = [tack, clew, bow, peak, throat];
    const standing = clamp01(1 - wreck * 2);
    washFill(g, cloth, shadePigment(PIGMENT.diepDeep, 0.94), seed + 5, 0.88 * standing, 2);
    inkPath(g, cloth, seed + 6, { width: 1.3, alpha: 0.75 * standing, wobble: 0.8, step: 14, closed: true });
    // Battens: the horizontal ribs that make a lug sail a lug sail, each running to the bellied
    // leech rather than to a straight one.
    for (let batten = 1; batten < 6; batten += 1) {
      const k = batten / 6;
      const outer = k < 0.5
        ? { x: clew.x + (bow.x - clew.x) * (k * 2), y: clew.y + (bow.y - clew.y) * (k * 2) }
        : { x: bow.x + (peak.x - bow.x) * ((k - 0.5) * 2), y: bow.y + (peak.y - bow.y) * ((k - 0.5) * 2) };
      inkPath(g, [
        { x: tack.x + (throat.x - tack.x) * k, y: tack.y + (throat.y - tack.y) * k },
        outer,
      ], seed + 20 + batten, { width: 0.9, alpha: 0.46 * standing, colour: PIGMENT.nauDark, wobble: 0.4, step: 13 });
    }
  }

  // Coming apart: planks let go off the bow and drift.
  if (wreck > 0.3) {
    const shed = Math.round((wreck - 0.3) * 10);
    for (let plank = 0; plank < shed; plank += 1) {
      const px = x - (30 + plank * 11 + rand() * 14) * s;
      const py = y + (2 + rand() * 7) * s;
      const angle = (rand() - 0.5) * 1.4;
      const length = (5 + rand() * 8) * s;
      inkPath(g, [
        { x: px - Math.cos(angle) * length, y: py - Math.sin(angle) * length },
        { x: px + Math.cos(angle) * length, y: py + Math.sin(angle) * length },
      ], seed + 40 + plank, { width: 2.2, alpha: 0.7, colour: PIGMENT.nauDark, wobble: 0.4, step: 10 });
    }
  }
}

/**
 * A Việt skiff — the thuyền nhẹ that did the baiting. Two men, no deck, and it can turn inside its
 * own length, which is the whole reason the trap worked.
 */
export function skiff(g: G, x: number, y: number, s: number, seed: number, facing: 1 | -1 = 1, accent = PIGMENT.son): void {
  const P = (dx: number, dy: number): Pt => ({ x: x + dx * facing * s, y: y + dy * s });
  const hull: Pt[] = [P(-13, 0), P(-9, -3.6), P(0, -4.6), P(9, -3.4), P(13, 0.4), P(7, 2.6), P(-6, 2.6)];
  printedShape(g, hull, PIGMENT.nau, seed, { width: 1.2, alpha: 0.85, wobble: 0.5, step: 8, fillAlpha: 0.9 });

  // Two oarsmen as masses, not as figures — at skiff scale a drawn soldier is a smudge, and the
  // silhouette of a man leaning on an oar carries more than six wobbled limbs would.
  for (let man = 0; man < 2; man += 1) {
    const mx = -4 + man * 8;
    printedShape(g, [P(mx - 2.2, -4.4), P(mx + 2.2, -4.4), P(mx + 1.8, -10.5), P(mx - 1.8, -10.5)],
      PIGMENT.mucSoft, seed + man, { width: 0.9, alpha: 0.8, wobble: 0.3, step: 6, fillAlpha: 0.85 });
    g.fillStyle(PIGMENT.diepLo, 0.9);
    g.fillCircle(P(mx, -12).x, P(mx, -12).y, 2.1 * s);
    inkPath(g, [P(mx + 2, -8), P(mx + 9, -1.5)], seed + 30 + man, { width: 1, alpha: 0.6, colour: PIGMENT.nauDark, wobble: 0.3, step: 7 });
  }

  // The pennant. Sỏi son, because this boat is the player's.
  inkPath(g, [P(-9, -3.6), P(-10, -15)], seed + 8, { width: 1.1, alpha: 0.7, colour: PIGMENT.nauDark, wobble: 0.3, step: 8 });
  printedShape(g, [P(-10, -15), P(-3, -13.6), P(-9.6, -11.4)], accent, seed + 9,
    { width: 0.9, alpha: 0.85, wobble: 0.4, step: 5, fillAlpha: 0.95 });
}

// ── fire, smoke, banners ──────────────────────────────────────────────────────

/**
 * Fire, as a woodblock cuts it: three or four tongues in flat colour, no gradient and no glow.
 *
 * Sỏi son is spent here on purpose. The one place in the film a fire is *not* the player's is the
 * burning of Thăng Long, which the player's own side lit.
 */
export function fire(g: G, x: number, y: number, s: number, seed: number, life: number): void {
  const alive = clamp01(life);
  if (alive <= 0.01) return;
  const rand = mulberry32(seed);
  const tongues = 4 + Math.floor(rand() * 3);
  for (let tongue = 0; tongue < tongues; tongue += 1) {
    const lean = (rand() - 0.5) * 0.9;
    const height = (18 + rand() * 22) * s * alive;
    const base = x + (rand() - 0.5) * 9 * s;
    const shape: Pt[] = [
      { x: base - 3.4 * s, y },
      { x: base - 1.6 * s + lean * height * 0.3, y: y - height * 0.55 },
      { x: base + lean * height, y: y - height },
      { x: base + 2.4 * s + lean * height * 0.42, y: y - height * 0.5 },
      { x: base + 3.6 * s, y },
    ];
    const hot = tongue % 2 === 0;
    washFill(g, shape, hot ? PIGMENT.son : PIGMENT.hoe, seed + tongue, 0.86, 1.8);
    inkPath(g, shape, seed + tongue + 1, { width: 1, alpha: 0.5, colour: PIGMENT.sonDeep, wobble: 0.8, step: 7, closed: true });
  }
}

/**
 * Smoke: soot, drifting, and printed rather than airbrushed.
 *
 * Soft radial ellipses were the first attempt and they arrive as grey discs pasted on the sky —
 * there is no such thing as a gradient in a woodblock print, and the eye reads one instantly as not
 * belonging. A lumpy closed contour with a flat fill is what a block-cutter would cut, and it sits
 * in the same picture as everything else.
 */
export function smoke(g: G, x: number, y: number, s: number, seed: number, rise: number, alpha = 0.3): void {
  if (alpha <= 0.01) return;
  const rand = mulberry32(seed);
  for (let puff = 0; puff < 10; puff += 1) {
    const t = (rise + puff * 0.1) % 1;
    const py = y - t * 96 * s;
    const px = x + Math.sin(t * 3.4 + puff) * 14 * s * t + t * 18 * s;
    // Small. The first version of this grew a puff to forty units at s = 1 and the sky filled with
    // grey continents; smoke reads by having a *column* of small marks leaning one way, not by
    // being large.
    const radius = (2.6 + puff * 1.2 + t * 8) * s;
    const lobes: Pt[] = [];
    for (let node = 0; node < 12; node += 1) {
      const a = (node / 12) * Math.PI * 2;
      const r = radius * (0.84 + rand() * 0.3);
      lobes.push({ x: px + Math.cos(a) * r * 1.2, y: py + Math.sin(a) * r * 0.76 });
    }
    // No contour. A soot puff given a soot outline reads as a stone; ten flat overlapping blocks
    // with none read as smoke, because what the eye is following is the column, not the puff.
    const fade = alpha * (1 - t) * 0.42;
    washFill(g, lobes, PIGMENT.mucFaint, seed + puff, fade, 1.6);
  }
}

/**
 * A war banner on its pole.
 *
 * `mutePigment` is not used on the northern one — the game's rule is that a rival flies the *same*
 * standards desaturated, and `accent` is where the caller decides which side this is.
 */
export function banner(g: G, x: number, footY: number, s: number, seed: number, accent: number, wave: number, height = 46): void {
  const top = footY - height * s;
  inkPath(g, [{ x, y: footY }, { x, y: top }], seed, { width: 1.6, alpha: 0.8, colour: PIGMENT.nauDark, wobble: 0.3, step: 14 });
  const flap = Math.sin(wave * 3.1) * 3.2 * s;
  const cloth: Pt[] = [
    { x, y: top + 2 * s },
    { x: x + 26 * s, y: top + 1 * s + flap },
    { x: x + 22 * s, y: top + 9 * s + flap * 0.6 },
    { x: x + 27 * s, y: top + 17 * s + flap },
    { x, y: top + 18 * s },
  ];
  washFill(g, cloth, accent, seed + 1, 0.88, 2);
  inkPath(g, cloth, seed + 2, { width: 1.1, alpha: 0.6, wobble: 0.6, step: 8, closed: true });
  // The finial: a small ball, which is all a pole top ever reads as at this size.
  g.fillStyle(PIGMENT.hoe, 0.9);
  g.fillCircle(x, top - 1.5 * s, 2.4 * s);
}

/**
 * The march bob.
 *
 * A rank of soldiers standing perfectly still is a fence; the same rank with each man lifted by a
 * pixel and a half on his own phase is an army walking. It is the cheapest animation in the film
 * and does more than any other.
 */
export const bob = (t: number, index: number, amount = 1.6): number =>
  Math.sin(t * 7.2 + index * 1.7) * amount;
