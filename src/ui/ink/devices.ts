import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { inkPath, mulberry32, printedShape, type Pt } from './stroke';
import { UNIT } from './proportion';

/**
 * Đông Sơn bronze — the narrator's register, kept deliberately distinct from the world's.
 *
 * The rule that resolves the anachronism: **drum in the chrome, dynasty in the world.** The Ngọc Lũ
 * drum is 2,500 years old and predates every dynasty in the game by fifteen centuries, so using it
 * as world decoration would simply be wrong. But the game's frame is a modern retelling, and the
 * frame is allowed to speak in the oldest Vietnamese visual language there is.
 *
 * Also here: the host, whose block is sized by the number of men in it, and the seal, which carries
 * a **drawn device** and never a written character — the game ships in English and quốc ngữ, and a
 * Hán glyph is decoration pretending to be information.
 */

type G = Phaser.GameObjects.Graphics;

// ── the host ──────────────────────────────────────────────────────────────────

/** One drawn figure stands for about this many men. Nobody counts them; the eye compares blocks. */
export const MEN_PER_MARK = 55;
/** Past this, density stops adding information and starts costing frames — ranks deepen instead. */
export const HOST_MARK_CAP = 420;

/**
 * Ground between one man and the next, along the file and back through the ranks.
 *
 * **These carry `UNIT.figure`, and that is the whole point of them existing as named constants.**
 * The living exaggeration was applied inside `figure()` and nowhere else, while the spacing stayed
 * on the raw caller scale — so when people were made 1.8x life size the ranks did not open up to
 * make room. Each man ended up 2.4 rank-pitches tall with a spear 2.9 files long, and a host read as
 * a smudge of overlapping strokes rather than as a block of soldiers. That was the "army renders
 * badly" complaint, in one missing multiplication.
 *
 * Files are wider than ranks are deep, so a host is wider than it is deep the way one on the march
 * is. The rank shear is what stops the block reading as a grid.
 */
const FILE_PITCH = 4.6 * UNIT.figure;
const RANK_PITCH = 4.0 * UNIT.figure;
const RANK_SHEAR = 1.2 * UNIT.figure;

export interface HostShape {
  marks: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
}

/**
 * The block's AREA tracks the count, so a nine-thousand-man army is visibly a different object from
 * a two-thousand-man one without anybody reading a label. Formation is wider than deep, the way a
 * host on the march actually is.
 */
export function hostShape(men: number, markSpacing = FILE_PITCH, rankSpacing = RANK_PITCH): HostShape {
  const marks = Math.max(4, Math.min(HOST_MARK_CAP, Math.round(men / MEN_PER_MARK)));
  const cols = Math.max(3, Math.round(Math.sqrt(marks * 2.6)));
  const rows = Math.ceil(marks / cols);
  return { marks, cols, rows, width: cols * markSpacing, height: rows * rankSpacing };
}

/**
 * The block a host of this many men fills at drawing scale `s` — the shape `drawHost` will produce.
 *
 * Callers want this rather than `hostShape` directly: it is the only place that knows the pitch is
 * `FILE_PITCH`/`RANK_PITCH` and not some other pair of numbers. A caller that spells the
 * multiplication out itself is a caller that will still be spelling out the old one after the
 * spacing changes, which is precisely how the marker, its shadow and its standard came to disagree.
 */
export function hostShapeAt(men: number, s = 1): HostShape {
  return hostShape(men, FILE_PITCH * s, RANK_PITCH * s);
}

/**
 * One soldier: a body, a nón, and usually a spear. Five marks of information.
 *
 * Drawn through `inkPath` like every other living thing on the map. It used to be the sole
 * exception — a ruled `lineBetween`, a `fillCircle` and a second ruled line — while the farmer
 * standing forty pixels away went through the full two-pass soaked-underlay treatment. At a
 * distance that difference reads exactly as the complaint it drew: the villagers look printed and
 * the army looks like tally marks someone left on the paper.
 *
 * Kept to five strokes, because this runs up to `HOST_MARK_CAP` times per host and several hosts
 * can be on screen. The cost is paid once when the marker is built, not per frame — each rank is
 * its own `Graphics` that is tweened rather than redrawn.
 */
export function figure(g: G, x: number, y: number, scale: number, colour: number, spear: boolean): void {
  const s = scale * UNIT.figure;
  const seed = Math.round(x * 31 + y * 17);
  const ink = { colour, wobble: 0.16 * s, step: 2.2 };

  // Body: hem to shoulder. Slightly off vertical, so a rank is people standing rather than a comb.
  const lean = ((seed % 7) - 3) * 0.055 * s;
  inkPath(g, [{ x, y }, { x: x + lean, y: y - 3.0 * s }], seed, { width: 0.85 * s, alpha: 0.8, ...ink });
  // Shoulders — the one mark that separates a man from a stick at this size.
  inkPath(
    g,
    [{ x: x - 0.95 * s + lean, y: y - 2.85 * s }, { x: x + 0.95 * s + lean, y: y - 3.05 * s }],
    seed + 1,
    { width: 0.6 * s, alpha: 0.62, ...ink },
  );

  // Head, then the nón over it: a cone, not a disc. A filled circle at this size is a pinhead.
  g.fillStyle(colour, 0.8);
  g.fillCircle(x + lean, y - 3.65 * s, 0.62 * s);
  inkPath(
    g,
    [
      { x: x - 1.15 * s + lean, y: y - 3.75 * s },
      { x: x + lean, y: y - 4.9 * s },
      { x: x + 1.15 * s + lean, y: y - 3.75 * s },
    ],
    seed + 2,
    { width: 0.55 * s, alpha: 0.72, ...ink },
  );

  if (spear) {
    // Held upright and close in. The old spear ran 8.5 units — nearly three files — so every
    // soldier's weapon crossed the men beside him.
    inkPath(
      g,
      [{ x: x + 1.15 * s + lean, y: y - 0.7 * s }, { x: x + 1.3 * s + lean, y: y - 6.2 * s }],
      seed + 3,
      { width: 0.45 * s, alpha: 0.5, ...ink },
    );
  }
}

/**
 * Draws a host sized by `men`, anchored at its top-left. Returns the block it filled.
 *
 * `rankTarget` lets a caller collect each rank into its own object — which is what a host needs to
 * be able to move at all, since one `Graphics` holding the whole block can only ever stand still.
 * The figures, their jitter and their order are identical either way.
 */
export function drawHost(
  g: G,
  x: number,
  y: number,
  men: number,
  seed: number,
  colour: number,
  s = 1,
  spear = true,
  rankTarget?: (rank: number) => G,
): HostShape {
  const rand = mulberry32(seed);
  const shape = hostShapeAt(men, s);
  let drawn = 0;
  for (let rank = 0; rank < shape.rows && drawn < shape.marks; rank += 1) {
    const target = rankTarget?.(rank) ?? g;
    for (let file = 0; file < shape.cols && drawn < shape.marks; file += 1) {
      figure(
        target,
        // Jitter scaled by `s` like everything else. It used to be absolute, so at the marker's
        // 0.82 it was a third of a file wide and at menu scale it was half of one — a formation
        // whose raggedness changed with how far away you were standing.
        x + file * FILE_PITCH * s + (rand() - 0.5) * 0.32 * FILE_PITCH * s + rank * RANK_SHEAR * s,
        y + rank * RANK_PITCH * s + (rand() - 0.5) * 0.3 * RANK_PITCH * s,
        s,
        colour,
        spear && rand() > 0.25,
      );
      drawn += 1;
    }
  }
  return shape;
}

/**
 * The ground a host stands on. Takes the **same `x, y` and `s` as the `drawHost` call it belongs
 * to** — one anchoring convention, because two is how the shadow drifted off the men twice.
 *
 * Computed from where the feet actually land, not from `shape.width/height`. Those are the block's
 * *pitch* (`cols × spacing`), which overshoots the outermost figure by a full spacing in each axis,
 * and `y` is the BACK rank — the front rank's feet are a spacing short of `y + height`. Sizing the
 * ellipse off them put it a spacing low and, once an `x`-offset convention slipped, most of a block
 * to the left as well: a puddle beside the men rather than the ground under them.
 *
 * A round `groundShadow` cannot do this job at all — its height is tied to its width, and these
 * blocks are wide, shallow and sheared.
 */
export function hostFootprint(g: G, x: number, y: number, shape: HostShape, s = 1, alpha = 0.07): void {
  const { spanX, spanY } = hostSpan(shape, s);
  g.fillStyle(PIGMENT.muc, alpha);
  g.fillEllipse(x + spanX / 2, y + spanY / 2 + 1.1 * s, spanX + 9 * s, spanY + 6 * s);
}

/**
 * The ground the men's feet actually cover, measured from the same anchor `drawHost` is given.
 *
 * Deliberately **not** `shape.width`/`shape.height`: those are the block's *pitch*, `cols × spacing`,
 * which overshoots the outermost figure by a full spacing on each axis. Sizing anything off them
 * puts it a spacing too low and too wide. The shadow learned this the hard way (see
 * `hostFootprint`'s history); the standard then made the identical mistake independently, planting
 * itself a constant ~9 px in front of the men and ~2 px outside the shadow's left edge, at every
 * army size. Exported so there is exactly one answer to "where is this host standing".
 */
export function hostSpan(shape: HostShape, s = 1): { spanX: number; spanY: number } {
  return {
    // The rank shear pushes each rank right, so the feet span wider than the files alone.
    spanX: (shape.cols - 1) * FILE_PITCH * s + (shape.rows - 1) * RANK_SHEAR * s,
    spanY: (shape.rows - 1) * RANK_PITCH * s,
  };
}

/**
 * The cadence of a standing host: each rank shifts on its own phase, front rank first, so the block
 * breathes instead of sitting there as a printed stamp.
 *
 * Per *rank* rather than per figure on purpose. A busy map carries dozens of these markers, and four
 * tweens per host instead of forty is the difference between free and a frame budget.
 */
export function marchInPlace(scene: Phaser.Scene, ranks: Phaser.GameObjects.Graphics[], s = 1): void {
  ranks.forEach((rank, index) => {
    scene.tweens.add({
      targets: rank,
      y: rank.y - 0.29 * RANK_PITCH * s,
      duration: 900 + index * 80,
      delay: index * 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  });
}

// ── seals ─────────────────────────────────────────────────────────────────────

export type SealMotif = 'star' | 'lotus' | 'bird' | 'stakes';

/**
 * A stamped seal. The device is drawn, never written: the drum sun, a lotus, a Lạc bird, or the
 * Bạch Đằng stakes. Slightly crooked, because a seal pressed by hand is.
 */
export function seal(g: G, x: number, y: number, size: number, motif: SealMotif = 'star'): void {
  const half = size / 2;
  const unit = size * 0.28;
  const rotate = -0.06;
  const at = (dx: number, dy: number): Pt => ({
    x: x + dx * Math.cos(rotate) - dy * Math.sin(rotate),
    y: y + dx * Math.sin(rotate) + dy * Math.cos(rotate),
  });

  g.fillStyle(PIGMENT.son, 0.9);
  g.fillPoints([at(-half, -half), at(half, -half), at(half, half), at(-half, half)], true);
  g.lineStyle(1.1, 0xfbf2df, 0.42);
  g.strokePoints(
    [at(-half + 2.5, -half + 2.5), at(half - 2.5, -half + 2.5), at(half - 2.5, half - 2.5), at(-half + 2.5, half - 2.5), at(-half + 2.5, -half + 2.5)],
    false,
    false,
  );

  g.lineStyle(Math.max(1, size * 0.055), 0xfbf2df, 0.95);
  if (motif === 'lotus') {
    for (let petal = -2; petal <= 2; petal += 1) {
      const angle = -Math.PI / 2 + petal * 0.52;
      g.strokePoints(
        [at(0, unit * 0.9), at(Math.cos(angle) * unit * 1.1, Math.sin(angle) * unit * 0.9), at(Math.cos(angle) * unit * 0.6, -unit * 0.9)],
        false,
        false,
      );
    }
  } else if (motif === 'stakes') {
    for (let stake = -2; stake <= 2; stake += 1) {
      g.strokePoints([at(stake * unit * 0.52, unit), at(stake * unit * 0.52 + (stake % 2 ? 1.5 : -1.5), -unit)], false, false);
    }
    g.lineStyle(Math.max(1, size * 0.045), 0xfbf2df, 0.6);
    g.strokePoints([at(-unit * 1.3, unit * 0.2), at(unit * 1.3, unit * 0.05)], false, false);
  } else if (motif === 'bird') {
    heron(g, x, y, size * 0.11, true, 0xfbf2df);
  } else {
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = (ray / 12) * Math.PI * 2;
      g.strokePoints(
        [at(Math.cos(angle) * unit * 0.32, Math.sin(angle) * unit * 0.32), at(Math.cos(angle) * unit * 1.15, Math.sin(angle) * unit * 1.15)],
        false,
        false,
      );
    }
    g.fillStyle(0xfbf2df, 0.95);
    g.fillCircle(x, y, unit * 0.3);
  }
}

// ── the drum, unrolled ────────────────────────────────────────────────────────

/**
 * Răng cưa — the sawtooth band. The commonest geometric register on a drum, and the one that still
 * reads at seven pixels tall. A Greek-key meander at that size renders, unmistakably, as the letter
 * P repeated ninety times; this does not.
 */
export function sawtoothBand(g: G, x: number, y: number, width: number, height: number, alpha = 0.42): void {
  g.lineStyle(0.75, PIGMENT.muc, alpha);
  g.lineBetween(x, y, x + width, y);
  g.lineBetween(x, y + height, x + width, y + height);
  const step = height * 1.05;
  g.lineStyle(0.75, PIGMENT.muc, alpha * 1.2);
  for (let index = 0; x + index * step < x + width - step; index += 1) {
    const px = x + 1 + index * step;
    g.strokePoints(
      [
        { x: px, y: y + height - 0.5 },
        { x: px + step * 0.5, y: y + 0.5 },
        { x: px + step, y: y + height - 0.5 },
      ],
      false,
      false,
    );
  }
}

/**
 * Chim Lạc — the long-billed water bird of the tympanum. At meter size the bill is the only
 * recognisable part, so it gets 40% of the length.
 */
export function heron(g: G, x: number, y: number, s: number, filled: boolean, colour: number = PIGMENT.muc): void {
  const points: Pt[] = [
    { x: x - 10.5 * s, y: y - 0.2 * s }, { x: x - 4.0 * s, y: y - 1.6 * s }, { x: x - 2.0 * s, y: y - 2.4 * s },
    { x: x + 1.2 * s, y: y - 2.0 * s }, { x: x + 4.0 * s, y: y - 5.0 * s }, { x: x + 7.4 * s, y: y - 4.2 * s },
    { x: x + 6.0 * s, y: y - 1.6 * s }, { x: x + 10.6 * s, y: y - 2.4 * s }, { x: x + 10.2 * s, y: y + 0.6 * s },
    { x: x + 5.6 * s, y: y + 1.6 * s }, { x: x + 6.2 * s, y: y + 4.6 * s }, { x: x + 4.8 * s, y: y + 4.4 * s },
    { x: x + 3.4 * s, y: y + 1.8 * s }, { x: x - 2.6 * s, y: y + 1.0 * s }, { x: x - 4.4 * s, y: y - 0.2 * s },
  ];
  if (filled) {
    g.fillStyle(colour, 0.8);
    g.fillPoints(points, true);
  }
  inkPath(g, points, 5, {
    width: 0.55 * Math.max(1, s * 0.5), alpha: filled ? 0.6 : 0.3, colour, wobble: 0.15, step: 3.5, closed: true,
  });
}

/**
 * The wave meter: herons ink in as the wave approaches. A bar chart from 500 BCE.
 *
 * Many small birds, not few large ones — at frieze density the eye reads the rhythm and supplies
 * the bird, exactly as it does on the drum itself. The opposite instinct produces a row of blobs.
 */
export function heronMeter(
  g: G,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  onDark = false,
): void {
  // On paper the birds are ink on a pale plate; on the dark chrome band the plate would read as a
  // grey placeholder, so there the birds are light and the ground is left alone.
  const flown = onDark ? PIGMENT.hoePale : PIGMENT.muc;
  const waiting = onDark ? PIGMENT.mucFaint : PIGMENT.muc;
  if (!onDark) {
    printedShape(
      g,
      [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
      PIGMENT.diepLo, 904, { width: 0.8, alpha: 0.45, wobble: 0.3, step: 9, fillAlpha: 0.4 },
    );
  } else {
    g.lineStyle(0.8, PIGMENT.mucFaint, 0.35);
    g.lineBetween(x, y + height, x + width, y + height);
  }
  const count = Math.max(8, Math.round(width / (height * 1.05)));
  const gap = (width - height * 0.7) / count;
  for (let index = 0; index < count; index += 1) {
    const done = index / count < progress;
    heron(g, x + height * 0.6 + index * gap, y + height * 0.5, height * 0.05, done, done ? flown : waiting);
  }
}

/** A cleared plate of paper for text to sit on. Type never sits on hatching. */
export function clearPlate(g: G, x: number, y: number, width: number, height: number, seed: number): void {
  const points: Pt[] = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  g.fillStyle(PIGMENT.diepHi, 0.88);
  g.fillPoints(points, true);
  inkPath(g, points, seed, { width: 0.9, alpha: 0.4, wobble: 0.5, step: 12, closed: true });
}
