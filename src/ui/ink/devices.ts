import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { inkPath, mulberry32, printedShape, type Pt } from './stroke';

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
export function hostShape(men: number, markSpacing = 4.6, rankSpacing = 4): HostShape {
  const marks = Math.max(4, Math.min(HOST_MARK_CAP, Math.round(men / MEN_PER_MARK)));
  const cols = Math.max(3, Math.round(Math.sqrt(marks * 2.6)));
  const rows = Math.ceil(marks / cols);
  return { marks, cols, rows, width: cols * markSpacing, height: rows * rankSpacing };
}

/** One soldier: a stroke, a head, and sometimes a spear. Four pixels of information. */
export function figure(g: G, x: number, y: number, s: number, colour: number, spear: boolean): void {
  g.lineStyle(0.9 * s, colour, 0.85);
  g.lineBetween(x, y, x, y - 3.1 * s);
  g.fillStyle(colour, 0.85);
  g.fillCircle(x, y - 4.2 * s, 1.05 * s);
  if (spear) {
    g.lineStyle(0.6 * s, colour, 0.6);
    g.lineBetween(x + 1.4 * s, y - 1 * s, x + 1.4 * s, y - 8.5 * s);
  }
}

/** Draws a host sized by `men`, anchored at its top-left. Returns the block it filled. */
export function drawHost(
  g: G,
  x: number,
  y: number,
  men: number,
  seed: number,
  colour: number,
  s = 1,
  spear = true,
): HostShape {
  const rand = mulberry32(seed);
  const shape = hostShape(men, 4.6 * s, 4 * s);
  let drawn = 0;
  for (let rank = 0; rank < shape.rows && drawn < shape.marks; rank += 1) {
    for (let file = 0; file < shape.cols && drawn < shape.marks; file += 1) {
      figure(
        g,
        x + file * 4.6 * s + (rand() - 0.5) * 1.5 + rank * 1.2 * s,
        y + rank * 4 * s + (rand() - 0.5) * 1.2,
        s,
        colour,
        spear && rand() > 0.25,
      );
      drawn += 1;
    }
  }
  return shape;
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
export function heronMeter(g: G, x: number, y: number, width: number, height: number, progress: number): void {
  printedShape(
    g,
    [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
    PIGMENT.diepLo, 904, { width: 0.8, alpha: 0.45, wobble: 0.3, step: 9, fillAlpha: 0.4 },
  );
  const count = Math.max(8, Math.round(width / (height * 1.05)));
  const gap = (width - height * 0.7) / count;
  for (let index = 0; index < count; index += 1) {
    heron(g, x + height * 0.6 + index * gap, y + height * 0.5, height * 0.05, index / count < progress);
  }
}

/** A cleared plate of paper for text to sit on. Type never sits on hatching. */
export function clearPlate(g: G, x: number, y: number, width: number, height: number, seed: number): void {
  const points: Pt[] = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  g.fillStyle(PIGMENT.diepHi, 0.88);
  g.fillPoints(points, true);
  inkPath(g, points, seed, { width: 0.9, alpha: 0.4, wobble: 0.5, step: 12, closed: true });
}
