import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { hatchPoly, inkPath, mulberry32, printedShape, washFill, type Pt } from './stroke';
import { areca, bamboo, banyan, dinh, groundShadow, hayStack, house, thap, tree } from './props';

/**
 * Places people live, and the fields that feed them.
 *
 * A village is an **arrangement**, not a scatter: pond in front, houses in a row facing it across
 * the swept yard, bamboo hedge closing the back, areca down one side. Throwing the same parts
 * around at random — which the first pass did — reads as clutter, which is what a village is the
 * opposite of.
 */

type G = Phaser.GameObjects.Graphics;

export type Era = 'ly' | 'tran' | 'le' | 'nguyen';

/** A knot of roofs at slightly different angles, packed the way houses that grew up together sit. */
export function hamlet(g: G, x: number, y: number, s: number, seed: number, count = 6): void {
  const rand = mulberry32(seed);
  const homes: Array<{ x: number; y: number; s: number; seed: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rand() * Math.PI * 2;
    const distance = Math.sqrt(rand()) * 44 * s;
    homes.push({
      x: x + Math.cos(angle) * distance * 1.4,
      y: y + Math.sin(angle) * distance * 0.55,
      s: s * (0.92 + rand() * 0.2),
      seed: seed + index * 37,
    });
  }
  homes.sort((a, b) => a.y - b.y);
  for (const home of homes) {
    groundShadow(g, home.x + 13 * home.s, home.y + 1, 17 * home.s, 0.08);
    house(g, home.x, home.y, home.s, home.seed);
  }
  for (let index = 0; index < 3; index += 1) {
    tree(g, x + (rand() - 0.5) * 104 * s, y + (rand() - 0.5) * 38 * s, s * (0.85 + rand() * 0.35), seed + 500 + index);
  }
  hayStack(g, x - 58 * s, y + 10 * s, s * 0.9, seed + 600);
}

/**
 * Làng — the village as an arrangement, with its lũy tre: the bamboo hedge round the settlement,
 * the single most defining silhouette in the north.
 */
export function village(g: G, x: number, y: number, s: number, seed: number): void {
  const rand = mulberry32(seed);
  for (let index = 0; index < 5; index += 1) {
    bamboo(g, x - 62 * s + index * 31 * s, y - 26 * s + (index % 2) * 5 * s, 0.72 * s, seed + 20 + index);
  }
  const baseY = y + 7 * s;
  for (let index = 0; index < 3; index += 1) {
    house(g, x - 34 * s + index * 34 * s, baseY + (index === 1 ? 3 * s : 0), 1 * s, seed + 10 + index);
  }
  const yard: Pt[] = [
    { x: x - 27 * s, y: baseY + 3 * s }, { x: x + 27 * s, y: baseY + 2 * s },
    { x: x + 24 * s, y: baseY + 13 * s }, { x: x - 24 * s, y: baseY + 14 * s },
  ];
  washFill(g, yard, PIGMENT.diepLo, seed + 2, 0.4);
  inkPath(g, yard, seed + 3, { width: 0.6, alpha: 0.28, wobble: 0.5, step: 10, closed: true });

  const pond: Pt[] = [];
  for (let index = 0; index <= 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    pond.push({
      x: x - 2 * s + Math.cos(angle) * 17 * s * (0.9 + rand() * 0.2),
      y: y + 25 * s + Math.sin(angle) * 7 * s,
    });
  }
  printedShape(g, pond, PIGMENT.chamWash, seed + 4, {
    width: 0.75, alpha: 0.5, colour: PIGMENT.cham, wobble: 0.4, step: 7, fillAlpha: 0.62,
  });
  for (let index = 0; index < 3; index += 1) {
    areca(g, x + 46 * s + index * 7 * s, y + 24 * s - index * 9 * s, 0.72 * s, seed + 30 + index);
  }
  hayStack(g, x - 50 * s, y + 24 * s, 0.9 * s, seed + 40);
  if (rand() > 0.5) {
    banyan(g, x + 54 * s, y - 7 * s, 0.85 * s, seed + 50);
  }
}

/**
 * Thành — a walled seat in oblique. The dynasties do not differ by a label:
 *
 *  · Lý and Trần raise **rammed-earth** ramparts with a tower over the gate
 *  · Lê builds a **brick** rectangle with a two-tier gatehouse
 *  · Nguyễn builds **Huế** — a low, broad Vauban work with an angled bastion and the long,
 *    three-arched Ngọ Môn carrying a pavilion
 *
 * If the four read the same, the drawing has failed.
 */
export function citadel(g: G, x: number, y: number, s: number, era: Era, seed: number): void {
  const brick = era === 'le' || era === 'nguyen';
  const w = (era === 'nguyen' ? 104 : era === 'le' ? 86 : 74) * s;
  const depth = 30 * s;
  const wallH = (era === 'nguyen' ? 8 : era === 'tran' ? 14 : 11) * s;
  const dx = depth * 0.62;
  const dy = depth * -0.42;
  const faceLight = brick ? PIGMENT.diepLo : PIGMENT.diepHi;
  const faceDark = brick ? PIGMENT.nau : PIGMENT.diepLo;
  const hatchGap = brick ? 3.4 : 5;

  groundShadow(g, x + w * 0.5, y + 3 * s, w * 0.62, 0.09);

  // what stands inside, drawn first so the rampart is in front of it
  if (era === 'ly') {
    thap(g, x + w * 0.5, y + dy * 0.4 - wallH * 0.1, s * 1.15, seed + 300, 7);
  } else if (era === 'nguyen') {
    dinh(g, x + w * 0.16, y + dy * 0.55 - wallH * 0.3, s * 0.52, seed + 300);
    house(g, x + w * 0.62, y + dy * 0.5 - wallH * 0.3, s * 0.5, seed + 310, true);
  } else {
    dinh(g, x + w * 0.2, y + dy * 0.55 - wallH * 0.4, s * 0.6, seed + 300);
    house(g, x + w * 0.66, y + dy * 0.5 - wallH * 0.4, s * 0.44, seed + 310, true);
  }

  const side: Pt[] = [
    { x: x + w, y }, { x: x + w + dx, y: y + dy },
    { x: x + w + dx, y: y + dy - wallH }, { x: x + w, y: y - wallH },
  ];
  washFill(g, side, faceDark, seed + 1, 0.9);
  hatchPoly(g, side, 0.95, hatchGap, PIGMENT.mucSoft, brick ? 0.2 : 0.13, 0.55);
  inkPath(g, side, seed + 2, { width: 1.0 * s, alpha: 0.68, wobble: 0.12 * s, step: 7, closed: true });

  if (era === 'nguyen') {
    const bastion: Pt[] = [
      { x: x - 1 * s, y }, { x: x - 15 * s, y: y - 6 * s },
      { x: x - 15 * s, y: y - 6 * s - wallH }, { x: x - 1 * s, y: y - wallH },
    ];
    washFill(g, bastion, faceLight, seed + 5, 0.94);
    hatchPoly(g, bastion, 0.95, 3.4, PIGMENT.mucSoft, 0.18, 0.55);
    inkPath(g, bastion, seed + 6, { width: 1.1 * s, alpha: 0.82, wobble: 0.14 * s, step: 7, closed: true });
  }

  const front: Pt[] = [{ x, y }, { x: x + w, y }, { x: x + w, y: y - wallH }, { x, y: y - wallH }];
  washFill(g, front, faceLight, seed + 3, 0.95);
  hatchPoly(g, front, 0.95, hatchGap, PIGMENT.mucSoft, brick ? 0.17 : 0.11, 0.55);
  inkPath(g, front, seed + 4, { width: 1.2 * s, alpha: 0.85, wobble: 0.16 * s, step: 9, closed: true });
  inkPath(g, [{ x: x + 1 * s, y: y - wallH * 0.28 }, { x: x + w - 1 * s, y: y - wallH * 0.3 }], seed + 7, {
    width: 0.7 * s, alpha: 0.3, wobble: 0.1 * s, step: 9,
  });

  const rand = mulberry32(seed + 90);
  const merlons = Math.max(3, Math.round(w / (7.5 * s)));
  for (let index = 0; index < merlons; index += 1) {
    const mx = x + 3 * s + (index * (w - 6 * s)) / (merlons - 1);
    const mh = (2.2 + rand() * 0.9) * s;
    inkPath(
      g,
      [
        { x: mx - 1.7 * s, y: y - wallH }, { x: mx - 1.7 * s, y: y - wallH - mh },
        { x: mx + 1.7 * s, y: y - wallH - mh }, { x: mx + 1.7 * s, y: y - wallH },
      ],
      seed + 20 + index, { width: 0.7 * s, alpha: 0.62, wobble: 0.08 * s, step: 4 },
    );
  }

  const towerW = (era === 'tran' ? 15 : 11) * s;
  const towerH = (era === 'nguyen' ? 8 : era === 'tran' ? 18 : 13) * s;
  for (const px of [x - (era === 'nguyen' ? 12 : 2) * s, x + w - towerW + 2 * s]) {
    const body: Pt[] = [
      { x: px, y: y + 1 * s }, { x: px + towerW, y: y + 1 * s },
      { x: px + towerW, y: y - wallH - towerH }, { x: px, y: y - wallH - towerH },
    ];
    washFill(g, body, faceLight, seed + 60 + px, 0.96);
    hatchPoly(g, body, 0.95, hatchGap, PIGMENT.mucSoft, brick ? 0.16 : 0.1, 0.5);
    inkPath(g, body, seed + 61 + px, { width: 1.0 * s, alpha: 0.8, wobble: 0.12 * s, step: 7, closed: true });
    const ry = y - wallH - towerH;
    printedShape(
      g,
      [
        { x: px - 3 * s, y: ry }, { x: px + towerW + 3 * s, y: ry },
        { x: px + towerW * 0.72, y: ry - 4.6 * s }, { x: px + towerW * 0.28, y: ry - 4.6 * s },
      ],
      PIGMENT.mucSoft, seed + 62 + px, { width: 0.9 * s, alpha: 0.8, wobble: 0.1 * s, step: 5, fillAlpha: 0.92 },
    );
  }

  const gateW = (era === 'nguyen' ? 44 : era === 'le' ? 24 : 20) * s;
  const gateH = (era === 'le' ? 20 : era === 'nguyen' ? 12 : 15) * s;
  const gx = x + w * 0.42 - gateW * 0.2;
  const gate: Pt[] = [
    { x: gx, y: y + 1 * s }, { x: gx + gateW, y: y + 1 * s },
    { x: gx + gateW, y: y - wallH - gateH }, { x: gx, y: y - wallH - gateH },
  ];
  washFill(g, gate, faceLight, seed + 80, 0.97);
  hatchPoly(g, gate, 0.95, hatchGap, PIGMENT.mucSoft, brick ? 0.15 : 0.09, 0.5);
  inkPath(g, gate, seed + 81, { width: 1.15 * s, alpha: 0.86, wobble: 0.14 * s, step: 8, closed: true });

  const arches = era === 'nguyen' ? 3 : 1;
  for (let index = 0; index < arches; index += 1) {
    const ax = gx + gateW * (arches === 1 ? 0.5 : 0.22 + index * 0.28);
    const aw = gateW * (arches === 1 ? 0.3 : 0.15);
    const arch: Pt[] = [];
    for (let step = 0; step <= 12; step += 1) {
      const angle = Math.PI + (step / 12) * Math.PI;
      arch.push({ x: ax + Math.cos(angle) * aw * 0.5, y: y - 3.5 * s + Math.sin(angle) * aw * 0.6 });
    }
    arch.push({ x: ax + aw * 0.5, y: y + 1 * s }, { x: ax - aw * 0.5, y: y + 1 * s });
    printedShape(g, arch, PIGMENT.muc, seed + 82 + index, {
      width: 0.8 * s, alpha: 0.7, wobble: 0.1 * s, step: 5, fillAlpha: 0.72,
    });
  }

  const gy = y - wallH - gateH;
  if (era === 'ly') {
    printedShape(
      g,
      [
        { x: gx - 4 * s, y: gy }, { x: gx + gateW + 4 * s, y: gy },
        { x: gx + gateW * 0.72, y: gy - 4.4 * s }, { x: gx + gateW * 0.28, y: gy - 4.4 * s },
      ],
      PIGMENT.mucSoft, seed + 91, { width: 1.0 * s, alpha: 0.82, wobble: 0.1 * s, step: 5, fillAlpha: 0.92 },
    );
  } else if (era === 'tran') {
    printedShape(
      g,
      [{ x: gx - 6 * s, y: gy }, { x: gx + gateW + 6 * s, y: gy }, { x: gx + gateW * 0.5, y: gy - 10 * s }],
      PIGMENT.mucSoft, seed + 91, { width: 1.15 * s, alpha: 0.84, wobble: 0.12 * s, step: 5, fillAlpha: 0.92 },
    );
  } else if (era === 'le') {
    for (let tier = 0; tier < 2; tier += 1) {
      const ry = gy - tier * 8 * s;
      const rw = gateW * (1 - tier * 0.22);
      printedShape(
        g,
        [
          { x: gx + (gateW - rw) / 2 - 5 * s, y: ry }, { x: gx + (gateW + rw) / 2 + 5 * s, y: ry },
          { x: gx + (gateW + rw) / 2 - 1.5 * s, y: ry - 5.4 * s }, { x: gx + (gateW - rw) / 2 + 1.5 * s, y: ry - 5.4 * s },
        ],
        PIGMENT.mucSoft, seed + 93 + tier, { width: 1.0 * s, alpha: 0.82, wobble: 0.1 * s, step: 5, fillAlpha: 0.92 },
      );
    }
  } else {
    dinh(g, gx + 1 * s, gy, s * 0.62, seed + 96);
  }
}

/** Where the gate's standard should be planted, so a caller can hang a live flag off it. */
export function citadelStandardAnchor(x: number, y: number, s: number, era: Era): Pt {
  const w = (era === 'nguyen' ? 104 : era === 'le' ? 86 : 74) * s;
  const wallH = (era === 'nguyen' ? 8 : era === 'tran' ? 14 : 11) * s;
  const gateW = (era === 'nguyen' ? 44 : era === 'le' ? 24 : 20) * s;
  const gateH = (era === 'le' ? 20 : era === 'nguyen' ? 12 : 15) * s;
  return { x: x + w * 0.42 - gateW * 0.2 + gateW * 0.5, y: y - wallH - gateH - 4 * s };
}

// ── fields ────────────────────────────────────────────────────────────────────

export interface FieldPlot {
  points: Pt[];
  /** 0–1. Below 0.32 flooded, below 0.68 transplanted, above that ripe. */
  stage: number;
  seed: number;
}

/**
 * Ruộng — wet paddy.
 *
 * What makes a delta beautiful from above is that the plots are at different **stages**: some
 * flooded and holding the sky, some green with transplanted rows, some gold and ready. Flat washes
 * of one colour, which the first pass drew, look like a patchwork blanket.
 *
 * The bund is drawn as **two lines**, because a raised path has two edges.
 */
export function drawFieldPlot(g: G, plot: FieldPlot): void {
  const fill = plot.stage < 0.32 ? PIGMENT.chamWash : plot.stage < 0.68 ? PIGMENT.giDongPale : PIGMENT.hoePale;
  washFill(g, plot.points, fill, plot.seed, plot.stage < 0.32 ? 0.6 : 0.78);
  inkPath(g, plot.points, plot.seed + 1, { width: 0.7, alpha: 0.52, wobble: 0.5, step: 12, closed: true });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of plot.points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  if (plot.stage < 0.32) {
    for (let line = 0; line < 2; line += 1) {
      const wy = minY + (maxY - minY) * (0.38 + line * 0.28);
      inkPath(g, [{ x: minX + 3, y: wy }, { x: minX + 3 + (maxX - minX) * 0.5, y: wy }], plot.seed + 2 + line, {
        width: 0.6, alpha: 0.42, colour: PIGMENT.cham, wobble: 0.2, step: 7,
      });
    }
    return;
  }

  // Transplanted rice stands in ordered rows, not scattered.
  const columns = Math.max(3, Math.round((maxX - minX) / 5));
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const px = minX + 3 + ((maxX - minX - 6) / Math.max(1, columns - 1)) * column;
      const py = minY + ((maxY - minY) / 4) * (row + 1);
      inkPath(g, [{ x: px, y: py }, { x: px + 0.3, y: py - (plot.stage > 0.68 ? 2.8 : 2.1) }], plot.seed + column * 7 + row, {
        width: 0.5, alpha: plot.stage > 0.68 ? 0.55 : 0.44, wobble: 0,
      });
    }
  }
}
