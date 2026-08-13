import Phaser from 'phaser';
import { PIGMENT, shadePigment } from './palette';
import { inkPath, mulberry32, printedShape, thickPath, washFill, type Pt } from './stroke';
import { UNIT } from './proportion';

/**
 * The vocabulary — every silhouette that makes a landscape read as Đại Việt rather than as nowhere.
 *
 * Two rules govern the whole file, both learned the hard way:
 *
 *  1. **Nothing is clipped to a cell.** A tree placed from one hex hangs over three; a hamlet
 *     spills past its own boundary. The grid decides *where*; it never decides *what shape*.
 *  2. **Draw the thing the country already pictures, not the thing from life.** The buffalo drawn
 *     from anatomy failed three times; drawn after the Đông Hồ print "Chăn trâu thổi sáo" it worked
 *     first time.
 *
 * Buildings are drawn in oblique with two faces visible. That is what makes a roof sit on the land
 * instead of floating over it, and it is what the reference does on every single building.
 */

type G = Phaser.GameObjects.Graphics;

/** The depth vector every building shares, so the whole map agrees on one oblique. */
const OBLIQUE = { x: 0.62, y: -0.42 };

/** A soft ellipse under anything that stands up, so it sits on the land instead of over it. */
export function groundShadow(g: G, x: number, y: number, width: number, alpha = 0.09): void {
  g.fillStyle(PIGMENT.muc, alpha);
  g.fillEllipse(x, y, width * 2, width * 0.6);
}

// ── vegetation ────────────────────────────────────────────────────────────────

/**
 * Cây — a bushy canopy: scalloped, sage, with a dark rim and one or two interior scallops for
 * volume. Scattered in drifts of varying size, never as one symbol repeated on a grid.
 */
export function tree(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = scale * UNIT.tree;
  const rand = mulberry32(seed);
  const radius = 7 * s;
  inkPath(g, [{ x, y }, { x: x - 0.6 * s, y: y - radius }], seed, {
    width: 1.2 * s, alpha: 0.55, colour: PIGMENT.nau, wobble: 0.12 * s, step: 4,
  });

  const lobes = 6 + Math.floor(rand() * 4);
  const canopy: Pt[] = [];
  for (let index = 0; index <= lobes * 5; index += 1) {
    const t = index / (lobes * 5);
    const angle = t * Math.PI * 2 - Math.PI / 2;
    const rr = radius * (1 + 0.09 * Math.cos(t * Math.PI * 2 * lobes)) * (0.9 + rand() * 0.18);
    canopy.push({ x: x + Math.cos(angle) * rr * 1.06, y: y - radius * 1.15 + Math.sin(angle) * rr * 0.9 });
  }
  const pale = rand() > 0.62;
  printedShape(g, canopy, pale ? PIGMENT.giDongPale : PIGMENT.giDong, seed + 1, {
    width: 0.72 * s, alpha: 0.72, wobble: 0.16 * s, step: 4, fillAlpha: 0.85,
  });

  // A shaded crescent along the lower-right of the crown, and a lit lobe up-left of the centre.
  //
  // A single scalloped ring reads as a flat green stamp however nicely its edge wobbles, which is
  // what a whole hillside of these looked like. What the woodcut reference does — and what costs
  // two shapes — is give the canopy a light side and a dark side, so the crown reads as a ball of
  // leaves with the sun on one shoulder.
  const crownY = y - radius * 1.15;
  const shade: Pt[] = [];
  for (let index = 0; index <= 9; index += 1) {
    const angle = -0.35 + (index / 9) * 2.1;
    shade.push({ x: x + Math.cos(angle) * radius * 1.0, y: crownY + Math.sin(angle) * radius * 0.86 });
  }
  for (let index = 9; index >= 0; index -= 1) {
    const angle = -0.35 + (index / 9) * 2.1;
    const lobe = 0.52 + 0.06 * Math.cos(index * 2.1);
    shade.push({ x: x + Math.cos(angle) * radius * lobe, y: crownY + Math.sin(angle) * radius * lobe * 0.88 });
  }
  g.fillStyle(pale ? PIGMENT.giDong : shadePigment(PIGMENT.giDong, 0.78), 0.5);
  g.fillPoints(shade, true);

  const lit: Pt[] = [];
  for (let index = 0; index <= 11; index += 1) {
    const t = index / 11;
    const angle = t * Math.PI * 2;
    const rr = radius * 0.46 * (1 + 0.12 * Math.cos(t * Math.PI * 2 * 3));
    lit.push({ x: x - radius * 0.3 + Math.cos(angle) * rr, y: crownY - radius * 0.26 + Math.sin(angle) * rr * 0.82 });
  }
  g.fillStyle(pale ? PIGMENT.diepHi : PIGMENT.giDongPale, 0.34);
  g.fillPoints(lit, true);

  for (let pass = 0; pass < 2; pass += 1) {
    const start = 0.5 + pass * 1.7;
    const arc: Pt[] = [];
    for (let index = 0; index <= 7; index += 1) {
      const angle = start + (index / 7) * 1.5;
      arc.push({ x: x + Math.cos(angle) * radius * 0.5, y: crownY + Math.sin(angle) * radius * 0.45 });
    }
    inkPath(g, arc, seed + 5 + pass, { width: 0.55 * s, alpha: 0.3, wobble: 0.12 * s, step: 4 });
  }
}

export function grassTuft(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = scale * UNIT.grassTuft;
  const rand = mulberry32(seed);
  for (let blade = 0; blade < 3; blade += 1) {
    inkPath(
      g,
      [
        { x: x + blade * 1.6 * s, y },
        { x: x + blade * 1.6 * s + (rand() - 0.5) * 2 * s, y: y - (3 + rand() * 2.5) * s },
      ],
      seed + blade,
      { width: 0.5 * s, alpha: 0.35, wobble: 0.1 * s, step: 4 },
    );
  }
}

/** Tre — bamboo. Tall arching culms from one clump; the village's own wall. */
export function bamboo(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = scale * UNIT.bamboo;
  const rand = mulberry32(seed);
  const culms = 5 + Math.floor(rand() * 3);
  for (let index = 0; index < culms; index += 1) {
    const lean = (index / (culms - 1) - 0.5) * 2;
    const height = (24 + rand() * 14) * s;
    const tipX = x + lean * height * 0.4;
    const tipY = y - height;
    inkPath(
      g,
      [{ x: x + lean * 2 * s, y }, { x: x + lean * height * 0.18, y: y - height * 0.55 }, { x: tipX, y: tipY }],
      seed + index,
      { width: 0.85 * s, alpha: 0.7, wobble: 0.25 * s, step: 7 },
    );
    for (let leaf = 0; leaf < 4; leaf += 1) {
      const angle = -2.4 + leaf * 0.55 + rand() * 0.3;
      printedShape(
        g,
        thickPath(
          [
            { x: tipX, y: tipY + 2 * s },
            { x: tipX + Math.cos(angle) * 5 * s, y: tipY + Math.sin(angle) * 5 * s },
            { x: tipX + Math.cos(angle) * 10 * s, y: tipY + Math.sin(angle) * 10 * s + 1.5 * s },
          ],
          [1.4 * s, 1.0 * s, 0.2 * s],
        ),
        PIGMENT.giDong,
        seed + index * 11 + leaf,
        { width: 0.5 * s, alpha: 0.5, wobble: 0.15 * s, step: 5, fillAlpha: 0.65 },
      );
    }
  }
}

/** Chuối — banana. Big torn paddle leaves off a short trunk. */
export function banana(g: G, x: number, y: number, s: number, seed: number): void {
  const rand = mulberry32(seed);
  inkPath(g, [{ x, y }, { x, y: y - 7 * s }], seed, { width: 2.2 * s, alpha: 0.6, wobble: 0.2 * s, step: 4 });
  for (let blade = 0; blade < 5; blade += 1) {
    const angle = -2.85 + blade * 0.62 + (rand() - 0.5) * 0.2;
    const length = (12 + rand() * 6) * s;
    const bx = x + Math.cos(angle) * length;
    const by = y - 7 * s + Math.sin(angle) * length * 0.8;
    printedShape(
      g,
      thickPath(
        [{ x, y: y - 7 * s }, { x: (x + bx) / 2, y: (y - 7 * s + by) / 2 - 1.5 * s }, { x: bx, y: by }],
        [1.2 * s, 4.0 * s, 0.6 * s],
      ),
      PIGMENT.giDong,
      seed + 10 + blade,
      { width: 0.6 * s, alpha: 0.55, wobble: 0.3 * s, step: 5, fillAlpha: 0.7 },
    );
    inkPath(g, [{ x, y: y - 7 * s }, { x: bx, y: by }], seed + 20 + blade, {
      width: 0.5 * s, alpha: 0.4, wobble: 0.2 * s, step: 5,
    });
  }
}

/** Cau — areca palm. A very tall bare trunk with a small crown; lines a village yard. */
export function areca(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = scale * UNIT.areca;
  const rand = mulberry32(seed);
  const height = (28 + rand() * 12) * s;
  inkPath(g, [{ x, y }, { x: x + 1.5 * s, y: y - height * 0.5 }, { x, y: y - height }], seed, {
    width: 1.5 * s, alpha: 0.7, wobble: 0.22 * s, step: 8,
  });
  for (let frond = 0; frond < 6; frond += 1) {
    const angle = -2.9 + frond * 0.5;
    printedShape(
      g,
      thickPath(
        [
          { x, y: y - height },
          { x: x + Math.cos(angle) * 5 * s, y: y - height + Math.sin(angle) * 4 * s },
          { x: x + Math.cos(angle) * 10 * s, y: y - height + Math.sin(angle) * 8 * s + 2 * s },
        ],
        [1.3 * s, 1.4 * s, 0.2 * s],
      ),
      PIGMENT.giDong,
      seed + 30 + frond,
      { width: 0.5 * s, alpha: 0.5, wobble: 0.2 * s, step: 4, fillAlpha: 0.65 },
    );
  }
}

/** Cây đa — the banyan at the village gate, with its hanging aerial roots. */
export function banyan(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = scale * UNIT.banyan;
  const rand = mulberry32(seed);
  const canopy: Pt[] = [];
  const lobes = 8;
  for (let index = 0; index <= lobes * 6; index += 1) {
    const t = index / (lobes * 6);
    const angle = t * Math.PI * 2 - Math.PI / 2;
    const rr = 15 * s * (1 + 0.15 * Math.cos(t * Math.PI * 2 * lobes)) * (0.9 + rand() * 0.16);
    canopy.push({ x: x + Math.cos(angle) * rr * 1.2, y: y - 16 * s + Math.sin(angle) * rr * 0.78 });
  }
  printedShape(g, canopy, PIGMENT.giDong, seed, { width: 0.85 * s, alpha: 0.7, wobble: 0.22 * s, step: 5, fillAlpha: 0.85 });
  printedShape(
    g,
    thickPath([{ x, y }, { x: x - 1 * s, y: y - 7 * s }, { x, y: y - 12 * s }], [3.2 * s, 2.4 * s, 2.0 * s]),
    PIGMENT.nau,
    seed + 2,
    { width: 0.7 * s, alpha: 0.62, wobble: 0.16 * s, step: 5, fillAlpha: 0.75 },
  );
  for (let root = 0; root < 5; root += 1) {
    const rx = x + (rand() - 0.5) * 24 * s;
    inkPath(g, [{ x: rx, y: y - 13 * s }, { x: rx + (rand() - 0.5) * 2 * s, y: y - 2 * s - rand() * 4 * s }], seed + 10 + root, {
      width: 0.55 * s, alpha: 0.4, wobble: 0.25 * s, step: 6,
    });
  }
}

// ── buildings, in oblique ─────────────────────────────────────────────────────

/**
 * Nhà ba gian hai chái — three bays and two lean-tos, earth walls packed over a bamboo lattice,
 * rice-straw thatch. Wide and low, and **the roof is most of it**.
 */
export function house(g: G, x: number, y: number, scale: number, seed: number, tiled = false): void {
  const s = scale * UNIT.house;
  const w = 26 * s;
  const d = 13 * s;
  const wallH = 7 * s;
  const roofH = 8.5 * s;
  const dx = d * OBLIQUE.x;
  const dy = d * OBLIQUE.y;
  const eave = 2.2 * s;
  const roofLight = tiled ? PIGMENT.mucSoft : PIGMENT.nau;
  const roofDark = tiled ? PIGMENT.muc : PIGMENT.nauDark;

  printedShape(
    g,
    [{ x: x + w, y }, { x: x + w + dx, y: y + dy }, { x: x + w + dx, y: y + dy - wallH }, { x: x + w, y: y - wallH }],
    PIGMENT.diepLo, seed + 1, { width: 0.8 * s, alpha: 0.6, wobble: 0.15 * s, step: 6, fillAlpha: 0.9 },
  );
  printedShape(
    g,
    [{ x, y }, { x: x + w, y }, { x: x + w, y: y - wallH }, { x, y: y - wallH }],
    PIGMENT.diepHi, seed + 3, { width: 0.85 * s, alpha: 0.72, wobble: 0.15 * s, step: 7, fillAlpha: 0.95 },
  );
  inkPath(
    g,
    [
      { x: x + w * 0.42, y }, { x: x + w * 0.42, y: y - wallH * 0.72 },
      { x: x + w * 0.6, y: y - wallH * 0.72 }, { x: x + w * 0.6, y },
    ],
    seed + 5, { width: 0.7 * s, alpha: 0.5, wobble: 0.1 * s, step: 5 },
  );

  const ridgeY = y - wallH - roofH + dy / 2;
  const ridgeL = { x: x + dx / 2, y: ridgeY };
  const ridgeR = { x: x + w + dx / 2, y: ridgeY };
  printedShape(
    g,
    [ridgeL, ridgeR, { x: x + w + dx + eave * 0.4, y: y + dy - wallH + eave * 0.2 }, { x: x + dx - eave * 0.4, y: y + dy - wallH + eave * 0.2 }],
    roofDark, seed + 6, { width: 0.85 * s, alpha: 0.7, wobble: 0.18 * s, step: 7, fillAlpha: 0.92 },
  );
  printedShape(
    g,
    [{ x: x - eave, y: y - wallH + eave * 0.5 }, { x: x + w + eave, y: y - wallH + eave * 0.5 }, ridgeR, ridgeL],
    roofLight, seed + 8, { width: 0.9 * s, alpha: 0.8, wobble: 0.18 * s, step: 7, fillAlpha: 0.95 },
  );
  for (let course = 1; course < 7; course += 1) {
    const t = course / 7;
    inkPath(
      g,
      [{ x: x - eave + (w + 2 * eave) * t, y: y - wallH + eave * 0.5 }, { x: ridgeL.x + w * t, y: ridgeY }],
      seed + 20 + course, { width: 0.45 * s, alpha: 0.3, wobble: 0.12 * s, step: 8 },
    );
  }
  inkPath(g, [ridgeL, ridgeR], seed + 30, { width: 1.1 * s, alpha: 0.8, wobble: 0.12 * s, step: 8 });
  printedShape(
    g,
    [{ x: x + w + eave, y: y - wallH + eave * 0.5 }, { x: x + w + dx + eave * 0.4, y: y + dy - wallH + eave * 0.2 }, ridgeR],
    roofDark, seed + 31, { width: 0.8 * s, alpha: 0.65, wobble: 0.14 * s, step: 6, fillAlpha: 0.85 },
  );
}

/**
 * Đình làng — the communal house. Its enormous tiled roof curves down and out and lifts into four
 * đầu đao spurs at the corners. The roof is the building.
 */
export function dinh(g: G, x: number, y: number, s: number, seed: number): void {
  const w = 44 * s;
  const d = 20 * s;
  const wallH = 9 * s;
  const roofH = 15 * s;
  const dx = d * OBLIQUE.x;
  const dy = d * OBLIQUE.y;
  const eave = 5 * s;

  printedShape(
    g,
    [{ x: x + w, y }, { x: x + w + dx, y: y + dy }, { x: x + w + dx, y: y + dy - wallH }, { x: x + w, y: y - wallH }],
    PIGMENT.diepLo, seed + 1, { width: 0.85 * s, alpha: 0.6, wobble: 0.14 * s, step: 7, fillAlpha: 0.9 },
  );
  printedShape(
    g,
    [{ x, y }, { x: x + w, y }, { x: x + w, y: y - wallH }, { x, y: y - wallH }],
    PIGMENT.diepHi, seed + 3, { width: 0.9 * s, alpha: 0.72, wobble: 0.14 * s, step: 8, fillAlpha: 0.95 },
  );
  for (let bay = 1; bay < 5; bay += 1) {
    inkPath(g, [{ x: x + (w / 5) * bay, y }, { x: x + (w / 5) * bay, y: y - wallH }], seed + 5 + bay, {
      width: 0.6 * s, alpha: 0.42, wobble: 0.1 * s, step: 5,
    });
  }

  const ridgeY = y - wallH - roofH + dy / 2;
  const ridgeL = { x: x + dx / 2, y: ridgeY };
  const ridgeR = { x: x + w + dx / 2, y: ridgeY };
  printedShape(
    g,
    [ridgeL, ridgeR, { x: x + w + dx + eave, y: y + dy - wallH + eave * 0.3 }, { x: x + dx - eave, y: y + dy - wallH + eave * 0.3 }],
    PIGMENT.muc, seed + 10, { width: 0.9 * s, alpha: 0.7, wobble: 0.16 * s, step: 7, fillAlpha: 0.85 },
  );
  // The near slope sags in the middle the way a heavy tiled đình roof does.
  printedShape(
    g,
    [
      { x: x - eave, y: y - wallH + eave * 0.4 },
      { x: x + w * 0.5, y: y - wallH + eave * 0.9 },
      { x: x + w + eave, y: y - wallH + eave * 0.4 },
      ridgeR,
      { x: ridgeL.x + w * 0.5, y: ridgeY - 1.4 * s },
      ridgeL,
    ],
    PIGMENT.mucSoft, seed + 12, { width: 1.0 * s, alpha: 0.8, wobble: 0.2 * s, step: 7, fillAlpha: 0.92 },
  );
  for (let course = 1; course < 9; course += 1) {
    const t = course / 9;
    inkPath(
      g,
      [
        { x: x - eave + (w + 2 * eave) * t, y: y - wallH + eave * (0.4 + 0.5 * Math.sin(t * Math.PI)) },
        { x: ridgeL.x + w * t, y: ridgeY - 1.4 * s * Math.sin(t * Math.PI) },
      ],
      seed + 40 + course, { width: 0.45 * s, alpha: 0.26, wobble: 0.12 * s, step: 8 },
    );
  }
  inkPath(g, [ridgeL, { x: ridgeL.x + w * 0.5, y: ridgeY - 1.4 * s }, ridgeR], seed + 50, {
    width: 1.5 * s, alpha: 0.82, wobble: 0.12 * s, step: 8,
  });
  // đầu đao — the corner spurs
  for (const corner of [
    { x: x - eave, y: y - wallH + eave * 0.4, f: -1 },
    { x: x + w + eave, y: y - wallH + eave * 0.4, f: 1 },
  ]) {
    inkPath(
      g,
      [
        { x: corner.x, y: corner.y },
        { x: corner.x + corner.f * 4 * s, y: corner.y - 2.5 * s },
        { x: corner.x + corner.f * 5.4 * s, y: corner.y - 7 * s },
      ],
      seed + 60 + corner.f, { width: 1.0 * s, alpha: 0.78, wobble: 0.12 * s, step: 4 },
    );
  }
}

/** Tháp — the Lý brick tower, tiers shrinking as they rise, in the same oblique. */
export function thap(g: G, x: number, y: number, s: number, seed: number, tiers = 6): void {
  let w = 20 * s;
  let d = 9 * s;
  let yy = y;
  for (let tier = 0; tier < tiers; tier += 1) {
    const dx = d * OBLIQUE.x;
    const dy = d * OBLIQUE.y;
    printedShape(
      g,
      [{ x: x - w / 2, y: yy }, { x: x + w / 2, y: yy }, { x: x + w / 2, y: yy - 5 * s }, { x: x - w / 2, y: yy - 5 * s }],
      PIGMENT.diepHi, seed + tier, { width: 0.8 * s, alpha: 0.66, wobble: 0.14 * s, step: 6, fillAlpha: 0.92 },
    );
    const eaveW = w / 2 + 2.6 * s;
    printedShape(
      g,
      [
        { x: x - eaveW, y: yy - 5 * s }, { x: x + eaveW, y: yy - 5 * s },
        { x: x + eaveW * 0.82 + dx, y: yy - 7.4 * s + dy * 0.4 }, { x: x - eaveW * 0.82 + dx, y: yy - 7.4 * s + dy * 0.4 },
      ],
      PIGMENT.mucSoft, seed + 40 + tier, { width: 0.9 * s, alpha: 0.78, wobble: 0.14 * s, step: 5, fillAlpha: 0.9 },
    );
    for (const side of [-1, 1]) {
      inkPath(g, [{ x: x + side * eaveW, y: yy - 5 * s }, { x: x + side * (eaveW + 1.8 * s), y: yy - 7.2 * s }], seed + 60 + tier + side, {
        width: 0.8 * s, alpha: 0.7, wobble: 0,
      });
    }
    yy -= 7.4 * s;
    w *= 0.87;
    d *= 0.87;
  }
  inkPath(g, [{ x, y: yy }, { x, y: yy - 5 * s }], seed + 99, { width: 1 * s, alpha: 0.72, wobble: 0.12 * s, step: 4 });
}

/** Cây rơm — the straw stack built round a pole, in every yard after harvest. */
export function hayStack(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = scale * UNIT.hayStack;
  const cone: Pt[] = [];
  for (let index = 0; index <= 18; index += 1) {
    const t = index / 18;
    const angle = Math.PI + t * Math.PI;
    cone.push({ x: x + Math.cos(angle) * 7 * s, y: y - 11 * s - Math.sin(angle) * 11 * s });
  }
  cone.push({ x: x + 7 * s, y }, { x: x - 7 * s, y });
  printedShape(g, cone, PIGMENT.hoePale, seed, { width: 0.8 * s, alpha: 0.7, wobble: 0.3 * s, step: 5, fillAlpha: 0.8 });
  inkPath(g, [{ x, y: y - 20 * s }, { x, y: y - 26 * s }], seed + 2, { width: 0.7 * s, alpha: 0.6, wobble: 0.2 * s, step: 4 });
}

/** A farmer under a nón lá — the fastest two strokes in the vocabulary. */
export function farmer(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = scale * UNIT.farmer;
  const rand = mulberry32(seed);
  // Three things a person in a field is doing. Chosen by seed so a paddy holds a scene rather
  // than the same silhouette repeated.
  const pose: 'planting' | 'carrying' | 'standing' = rand() < 0.5 ? 'planting' : rand() < 0.6 ? 'carrying' : 'standing';
  // Which way they face. A row of figures all facing the same way reads as printed wallpaper.
  const dir = rand() < 0.5 ? 1 : -1;
  // Áo nâu or indigo — working dress. The cloth has to be lighter than the limbs or the whole
  // figure merges into one dark blob, which is what a single ink tone gave.
  const cloth = rand() < 0.6 ? PIGMENT.nau : PIGMENT.cham;
  const at = (dx: number, dy: number): Pt => ({ x: x + dx * dir * s, y: y + dy * s });

  groundShadow(g, x + 0.4 * dir * s, y + 0.6 * s, 2.6 * s, 0.08);

  const limb = (from: Pt, to: Pt, width: number, colour: number, alpha = 0.85): void => {
    printedShape(g, thickPath([from, to], [width * s, width * 0.7 * s]), colour, seed + from.x + to.y, {
      width: 0.45 * s, alpha, wobble: 0.05 * s, step: 3, fillAlpha: 0.9,
    });
  };

  // Lean: bent double over the water when planting, upright otherwise.
  const bend = pose === 'planting' ? 0.62 : 0;
  const hipY = -6.4;
  const shoulder = at(bend * 5.2, hipY - 4.6 + bend * 2.2);
  const hip = at(0, hipY);

  // Legs. The forward one is planted, the back one trails — a figure with both legs together
  // reads as a post with a hat on it, which is what this was.
  limb(hip, at(1.9, -0.3), 1.5, PIGMENT.muc, 0.85);
  limb(hip, at(-1.7, -0.2), 1.3, PIGMENT.mucSoft, 0.75);

  // Áo — the tunic, drawn as a body rather than a stroke, so the figure has shoulders.
  printedShape(
    g,
    [
      at(-1.7, hipY + 0.6), at(-2.1 + bend * 4.4, hipY - 4.4 + bend * 2.1),
      at(2.1 + bend * 5.6, hipY - 4.8 + bend * 2.3), at(1.9, hipY + 0.4),
    ],
    cloth, seed + 3, { width: 0.5 * s, alpha: 0.8, wobble: 0.07 * s, step: 3, fillAlpha: 0.9 },
  );

  if (pose === 'planting') {
    // Both arms down into the water, and the seedling bundle in one hand.
    limb(shoulder, at(bend * 5.2 + 2.6, -1.2), 1.1, PIGMENT.muc, 0.8);
    limb(shoulder, at(bend * 5.2 + 1.2, -0.9), 1, PIGMENT.mucSoft, 0.65);
    g.fillStyle(PIGMENT.giDong, 0.85);
    for (let blade = 0; blade < 3; blade += 1) {
      const tip = at(bend * 5.2 + 2.4 + blade * 0.5, -2.4 - blade * 0.4);
      g.fillRect(tip.x, tip.y, 0.45 * s, 1.7 * s);
    }
  } else if (pose === 'carrying') {
    // Đòn gánh — the shoulder pole, a basket swinging at each end. The pose that tells you the
    // harvest is in.
    const poleY = shoulder.y - 0.4 * s;
    inkPath(g, [{ x: shoulder.x - 6 * s, y: poleY + 0.5 * s }, { x: shoulder.x + 6 * s, y: poleY - 0.5 * s }], seed + 5, {
      width: 0.55 * s, alpha: 0.8, colour: PIGMENT.nau, wobble: 0.06 * s, step: 4,
    });
    for (const side of [-1, 1] as const) {
      const bx = shoulder.x + side * 5.6 * s;
      const by = poleY + side * -0.4 * s;
      inkPath(g, [{ x: bx, y: by }, { x: bx, y: by + 2 * s }], seed + 6 + side, {
        width: 0.4 * s, alpha: 0.6, colour: PIGMENT.nau, wobble: 0, step: 3,
      });
      printedShape(
        g,
        [
          { x: bx - 1.6 * s, y: by + 2 * s }, { x: bx + 1.6 * s, y: by + 2 * s },
          { x: bx + 1.1 * s, y: by + 3.9 * s }, { x: bx - 1.1 * s, y: by + 3.9 * s },
        ],
        PIGMENT.hoePale, seed + 8 + side, { width: 0.45 * s, alpha: 0.75, wobble: 0.06 * s, step: 3, fillAlpha: 0.9 },
      );
    }
    limb(shoulder, at(bend * 5.2 + 1.4, hipY - 1.4), 1, PIGMENT.muc, 0.75);
  } else {
    // Standing, one hand resting on a hoe.
    limb(shoulder, at(2.4, hipY - 0.4), 1, PIGMENT.muc, 0.75);
    inkPath(g, [at(2.8, 0), at(3.2, -8.6)], seed + 9, {
      width: 0.5 * s, alpha: 0.8, colour: PIGMENT.nau, wobble: 0.05 * s, step: 4,
    });
    printedShape(
      g,
      [at(2.4, -8.6), at(4.4, -8.4), at(4.2, -7.2), at(2.5, -7.4)],
      PIGMENT.mucSoft, seed + 10, { width: 0.4 * s, alpha: 0.7, wobble: 0.05 * s, step: 3, fillAlpha: 0.85 },
    );
  }

  // The head, and over it the nón lá — the one silhouette that says where this is. A shallow
  // cone with a real brim, drawn as a filled shape rather than a bare triangle.
  const headX = shoulder.x + (pose === 'planting' ? 1.4 * dir * s : 0);
  const headY = shoulder.y - 1.5 * s;
  g.fillStyle(PIGMENT.nauDark, 0.9);
  g.fillCircle(headX, headY, 1.25 * s);

  const brim = 2.9 * s;
  printedShape(
    g,
    [
      { x: headX - brim, y: headY + 0.5 * s },
      { x: headX - brim * 0.55, y: headY - 1 * s },
      { x: headX, y: headY - 2.5 * s },
      { x: headX + brim * 0.55, y: headY - 1 * s },
      { x: headX + brim, y: headY + 0.5 * s },
      { x: headX + brim * 0.5, y: headY + 1.1 * s },
      { x: headX - brim * 0.5, y: headY + 1.1 * s },
    ],
    PIGMENT.hoePale, seed + 12, { width: 0.5 * s, alpha: 0.85, wobble: 0.06 * s, step: 4, fillAlpha: 0.95 },
  );
  // One rib down the cone, which is what stops it reading as a mushroom.
  inkPath(g, [{ x: headX, y: headY - 2.3 * s }, { x: headX + brim * 0.42, y: headY + 0.6 * s }], seed + 13, {
    width: 0.35 * s, alpha: 0.4, colour: PIGMENT.nau, wobble: 0, step: 3,
  });
}

// ── landform ──────────────────────────────────────────────────────────────────

/**
 * Núi đá vôi — karst. Vietnam's mountains are limestone towers with near-vertical flanks and
 * rounded, broken tops rising straight out of flat paddy: Ninh Bình, Tam Cốc, Hạ Long.
 *
 * Drawn as smooth domes they become sand dunes; drawn with a jagged crown they become teeth. What
 * they actually are is a thumb of rock — a wall that turns over at the top.
 */
export function karst(g: G, x: number, baseY: number, w: number, h: number, seed: number, far = false): void {
  const rand = mulberry32(seed);
  const lean = (rand() - 0.5) * 0.22;
  const half = w / 2;
  const outline: Pt[] = [{ x: x - half, y: baseY }];

  for (let step = 1; step <= 7; step += 1) {
    const t = step / 7;
    const inset = half * (0.18 + 0.16 * t) * Math.pow(t, 0.55);
    outline.push({ x: x - half + inset + lean * h * t, y: baseY - h * 0.86 * t });
  }
  for (let step = 0; step <= 5; step += 1) {
    const t = step / 5;
    const angle = Math.PI - t * Math.PI;
    const notch = step > 0 && step < 5 && rand() > 0.55 ? h * 0.055 : 0;
    outline.push({
      x: x + Math.cos(angle) * half * 0.5 + lean * h,
      y: baseY - h * (0.86 + Math.sin(angle) * 0.14) + notch,
    });
  }
  for (let step = 7; step >= 1; step -= 1) {
    const t = step / 7;
    const inset = half * (0.18 + 0.16 * t) * Math.pow(t, 0.55);
    outline.push({ x: x + half - inset + lean * h * t, y: baseY - h * 0.86 * t });
  }
  outline.push({ x: x + half, y: baseY });

  if (!far) {
    washFill(g, [...outline, { x: x + half, y: baseY + 5 }, { x: x - half, y: baseY + 5 }], PIGMENT.diepLo, seed, 1);
  }
  inkPath(g, far ? outline.slice(1, outline.length - 1) : outline, seed + 3, {
    width: far ? 0.8 : 1.35, alpha: far ? 0.3 : 0.86, wobble: far ? 0.3 : 0.5, step: far ? 12 : 8,
  });
  if (far) {
    return;
  }

  // Vertical fissures down the rock face, then scrub clinging to the crown.
  for (let fissure = 0; fissure < 4; fissure += 1) {
    const t = 0.2 + fissure * 0.2;
    const sx = x - half * 0.62 + w * 0.55 * t;
    const top = baseY - h * (0.68 + rand() * 0.2);
    inkPath(g, [{ x: sx, y: top }, { x: sx + (rand() - 0.5) * 2.5, y: top + h * (0.34 + rand() * 0.3) }], seed + 20 + fissure, {
      width: 0.6, alpha: 0.26, wobble: 0.3, step: 9,
    });
  }
  for (let bush = 0; bush < 3; bush += 1) {
    const sx = x - half * 0.42 + rand() * w * 0.42;
    const sy = baseY - h * (0.82 + rand() * 0.14);
    const tuft: Pt[] = [];
    for (let index = 0; index <= 10; index += 1) {
      const angle = Math.PI + (index / 10) * Math.PI;
      tuft.push({ x: sx + Math.cos(angle) * 3.2, y: sy + Math.sin(angle) * 2.1 });
    }
    printedShape(g, tuft, PIGMENT.giDong, seed + 40 + bush, { width: 0.5, alpha: 0.4, wobble: 0.2, step: 4, fillAlpha: 0.5 });
  }
}

/**
 * Đồi — low earth hills. Rounded, overlapping, with a ridgeline falling off each summit.
 * Karst is a mountain form; using it for hills gives a row of teeth.
 */
export function softRidge(g: G, x0: number, x1: number, baseY: number, height: number, seed: number): void {
  const rand = mulberry32(seed);
  const outline: Pt[] = [{ x: x0, y: baseY }];
  const peaks: Array<{ x: number; y: number; h: number; w: number }> = [];
  let x = x0;
  while (x < x1) {
    const w = height * (2.0 + rand() * 1.4);
    const h = height * (0.6 + rand() * 0.7);
    const apex = x + w * (0.4 + rand() * 0.2);
    peaks.push({ x: apex, y: baseY - h, h, w });
    for (let step = 1; step <= 12; step += 1) {
      const t = step / 12;
      outline.push({ x: x + (apex - x) * t, y: baseY - h * Math.pow(Math.sin(t * Math.PI / 2), 1.35) + (rand() - 0.5) });
    }
    for (let step = 1; step <= 12; step += 1) {
      const t = step / 12;
      outline.push({ x: apex + (x + w - apex) * t, y: baseY - h * Math.pow(Math.cos(t * Math.PI / 2), 1.35) + (rand() - 0.5) });
    }
    x += w * (0.72 + rand() * 0.2);
  }
  outline.push({ x: x1, y: baseY });
  washFill(g, [...outline, { x: x1, y: baseY + 6 }, { x: x0, y: baseY + 6 }], PIGMENT.diepLo, seed, 1);
  inkPath(g, outline, seed + 3, { width: 1.2, alpha: 0.8, wobble: 0.55, step: 10 });
  for (const peak of peaks) {
    inkPath(
      g,
      [
        { x: peak.x, y: peak.y + 2 },
        { x: peak.x - peak.w * 0.1 - rand() * 4, y: peak.y + peak.h * 0.45 },
        { x: peak.x - peak.w * 0.15 - rand() * 6, y: peak.y + peak.h * 0.8 },
      ],
      seed + Math.round(peak.x), { width: 0.65, alpha: 0.28, wobble: 0.4, step: 8 },
    );
  }
}

/** A range: karst towers clustered, taller ones behind, bases staggered so it is not a fence. */
export function karstRange(g: G, x0: number, x1: number, baseY: number, height: number, seed: number, far = false): void {
  const rand = mulberry32(seed);
  const towers: Array<{ x: number; w: number; h: number; drop: number }> = [];
  let x = x0;
  while (x < x1) {
    const w = height * (far ? 1.5 + rand() * 0.9 : 0.55 + rand() * 0.75);
    towers.push({
      x: x + w * 0.5,
      w,
      h: height * (far ? 0.5 + rand() * 0.4 : 0.34 + Math.pow(rand(), 0.7) * 1.15),
      drop: far ? 0 : rand() * height * 0.34,
    });
    x += w * (far ? 0.8 : 0.5 + rand() * 0.4);
  }
  towers.sort((a, b) => b.h - a.h);
  towers.forEach((tower, index) => {
    karst(g, tower.x, baseY + tower.drop, tower.w, tower.h, seed + index * 37, far);
  });
}

// ── the buffalo ───────────────────────────────────────────────────────────────

/**
 * Con trâu, after the Đông Hồ print "Chăn trâu thổi sáo".
 *
 * Not drawn from anatomy — three attempts at that failed. What the print gets right: the head is a
 * separate, neat shape with a **blunt muzzle**; the horns spring from the **crown**, run about one
 * head-length, and sweep **back** over the neck with near and far drawn apart; the back has a
 * shoulder hump and a dip behind it; the legs bend and have hooves and the animal is **walking**;
 * the hide is near-black so the cream horns and the green lotus leaf carry all the colour.
 */
export function buffalo(g: G, x: number, y: number, scale: number, seed: number, rider = false): void {
  const s = scale * UNIT.buffalo;
  const rand = mulberry32(seed);
  const step = rand() > 0.5 ? 1 : -1;

  const leg = (hx: number, hy: number, kx: number, ky: number, fx: number, fy: number, near: boolean) => {
    printedShape(
      g,
      thickPath(
        [{ x: x + hx * s, y: y + hy * s }, { x: x + kx * s, y: y + ky * s }, { x: x + fx * s, y: y + fy * s }],
        [near ? 2.6 * s : 2.2 * s, near ? 1.5 * s : 1.3 * s, near ? 1.1 * s : 0.95 * s],
      ),
      near ? PIGMENT.hide : PIGMENT.hideLo,
      seed + 40 + hx,
      { width: 0.8 * s, alpha: near ? 0.85 : 0.55, wobble: 0.08 * s, step: 4, fillAlpha: 0.92 },
    );
    printedShape(
      g,
      [
        { x: x + (fx - 1.5) * s, y: y + (fy - 1.2) * s }, { x: x + (fx + 1.5) * s, y: y + (fy - 1.2) * s },
        { x: x + (fx + 1.3) * s, y }, { x: x + (fx - 1.3) * s, y },
      ],
      PIGMENT.muc, seed + 50 + hx,
      { width: 0.6 * s, alpha: near ? 0.7 : 0.4, wobble: 0.06 * s, step: 3, fillAlpha: near ? 0.85 : 0.5 },
    );
  };

  leg(-9, -8, -9 - 2 * step, -4, -9 - 3 * step, -1.4, false);
  leg(10, -8.5, 10 + 2 * step, -4.4, 10 + 3 * step, -1.4, false);

  printedShape(
    g,
    [
      { x: x - 16 * s, y: y - 12.5 * s }, { x: x - 14.5 * s, y: y - 17.5 * s }, { x: x - 11 * s, y: y - 19.6 * s },
      { x: x - 5 * s, y: y - 18.2 * s }, { x: x + 3 * s, y: y - 18.6 * s }, { x: x + 11 * s, y: y - 18 * s },
      { x: x + 16 * s, y: y - 15 * s }, { x: x + 17.5 * s, y: y - 10 * s }, { x: x + 15 * s, y: y - 6 * s },
      { x: x + 7 * s, y: y - 4.4 * s }, { x: x - 3 * s, y: y - 4.2 * s }, { x: x - 11 * s, y: y - 6 * s },
    ],
    PIGMENT.hide, seed, { width: 1.15 * s, alpha: 0.9, wobble: 0.14 * s, step: 5, fillAlpha: 0.95 },
  );
  washFill(
    g,
    [
      { x: x - 10 * s, y: y - 6.4 * s }, { x: x - 2 * s, y: y - 5 * s }, { x: x + 8 * s, y: y - 5.2 * s },
      { x: x + 13 * s, y: y - 7.4 * s }, { x: x + 7 * s, y: y - 8.6 * s }, { x: x - 4 * s, y: y - 8.4 * s },
    ],
    PIGMENT.hideLo, seed + 2, 0.42,
  );
  inkPath(g, [{ x: x - 11 * s, y: y - 18 * s }, { x: x - 12.5 * s, y: y - 12 * s }, { x: x - 10 * s, y: y - 7 * s }], seed + 3, {
    width: 0.7 * s, alpha: 0.34, wobble: 0.1 * s, step: 4,
  });
  inkPath(g, [{ x: x + 11 * s, y: y - 17.6 * s }, { x: x + 13.5 * s, y: y - 12 * s }, { x: x + 11 * s, y: y - 7 * s }], seed + 4, {
    width: 0.7 * s, alpha: 0.34, wobble: 0.1 * s, step: 4,
  });

  printedShape(
    g,
    [
      { x: x - 15.5 * s, y: y - 12 * s }, { x: x - 14 * s, y: y - 18.6 * s }, { x: x - 19 * s, y: y - 21.5 * s },
      { x: x - 22 * s, y: y - 20 * s }, { x: x - 21 * s, y: y - 13.5 * s },
    ],
    PIGMENT.hide, seed + 5, { width: 1.0 * s, alpha: 0.82, wobble: 0.12 * s, step: 4, fillAlpha: 0.95 },
  );

  const hornArc = (lift: number, back: number, wide: number): Pt[] => {
    const points: Pt[] = [];
    const p0 = { x: x - 22 * s, y: y - 22.4 * s - lift };
    const p1 = { x: x - 19 * s + back, y: y - 30 * s - lift };
    const p2 = { x: x - 8 * s + back, y: y - 28.5 * s - lift };
    for (let index = 0; index <= 14; index += 1) {
      const t = index / 14;
      const u = 1 - t;
      points.push({
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      });
    }
    return thickPath(points, points.map((_, index) => (2.7 - (index / 14) * 2.2) * s * wide));
  };
  printedShape(g, hornArc(1.8 * s, 1.2 * s, 0.9), PIGMENT.hideLo, seed + 10, {
    width: 0.5 * s, alpha: 0.42, wobble: 0.05 * s, step: 4, fillAlpha: 0.9,
  });

  printedShape(
    g,
    [
      { x: x - 20 * s, y: y - 22.5 * s }, { x: x - 26 * s, y: y - 23 * s }, { x: x - 31 * s, y: y - 21.5 * s },
      { x: x - 33.6 * s, y: y - 18.6 * s }, { x: x - 32 * s, y: y - 16.2 * s }, { x: x - 27 * s, y: y - 16.4 * s },
      { x: x - 21.5 * s, y: y - 18.6 * s },
    ],
    PIGMENT.hide, seed + 12, { width: 1.0 * s, alpha: 0.9, wobble: 0.1 * s, step: 4, fillAlpha: 0.96 },
  );
  printedShape(
    g,
    [
      { x: x - 33.6 * s, y: y - 18.6 * s }, { x: x - 32 * s, y: y - 16.2 * s },
      { x: x - 28.5 * s, y: y - 16.6 * s }, { x: x - 29.5 * s, y: y - 19.6 * s },
    ],
    PIGMENT.hideLo, seed + 14, { width: 0.6 * s, alpha: 0.45, wobble: 0.08 * s, step: 3, fillAlpha: 0.85 },
  );
  g.fillStyle(PIGMENT.muc, 0.8);
  g.fillEllipse(x - 31.6 * s, y - 18.2 * s, 1.8 * s, 1.2 * s);
  g.fillStyle(PIGMENT.muc, 0.9);
  g.fillCircle(x - 27 * s, y - 20.8 * s, 0.85 * s);
  inkPath(g, [{ x: x - 28.6 * s, y: y - 21.8 * s }, { x: x - 25.6 * s, y: y - 22 * s }], seed + 60, {
    width: 0.5 * s, alpha: 0.6, wobble: 0,
  });
  printedShape(
    g,
    thickPath([{ x: x - 21.5 * s, y: y - 21 * s }, { x: x - 17.5 * s, y: y - 22.6 * s }], [1.7 * s, 0.4 * s]),
    PIGMENT.hideLo, seed + 16, { width: 0.6 * s, alpha: 0.7, wobble: 0.06 * s, step: 3, fillAlpha: 0.9 },
  );
  printedShape(g, hornArc(0, 0, 1), PIGMENT.horn, seed + 18, {
    width: 0.5 * s, alpha: 0.72, wobble: 0.05 * s, step: 4, fillAlpha: 0.96,
  });

  leg(-11, -7.5, -11 + 2 * step, -4, -11 + 3.4 * step, -1.4, true);
  leg(12, -8, 12 - 2 * step, -4.4, 12 - 3.4 * step, -1.4, true);

  inkPath(
    g,
    [{ x: x + 16.5 * s, y: y - 14.5 * s }, { x: x + 19.5 * s, y: y - 10 * s }, { x: x + 18.5 * s, y: y - 6 * s }],
    seed + 20, { width: 0.85 * s, alpha: 0.8, colour: PIGMENT.hide, wobble: 0.1 * s, step: 4 },
  );
  printedShape(
    g,
    thickPath([{ x: x + 18.5 * s, y: y - 6 * s }, { x: x + 18 * s, y: y - 2.6 * s }], [1.4 * s, 0.5 * s]),
    PIGMENT.muc, seed + 21, { width: 0.55 * s, alpha: 0.75, wobble: 0.08 * s, step: 3, fillAlpha: 0.85 },
  );

  if (!rider) {
    return;
  }

  // lá sen — the lotus leaf laid on the back for a saddle
  const saddle: Pt[] = [];
  for (let index = 0; index <= 16; index += 1) {
    const t = index / 16;
    const angle = Math.PI + t * Math.PI;
    const rr = 8.5 * s * (1 + 0.07 * Math.cos(t * Math.PI * 2 * 6));
    saddle.push({ x: x + 2 * s + Math.cos(angle) * rr, y: y - 19 * s + Math.sin(angle) * rr * 0.34 });
  }
  printedShape(g, saddle, PIGMENT.giDong, seed + 30, { width: 0.6 * s, alpha: 0.6, wobble: 0.12 * s, step: 4, fillAlpha: 0.85 });

  // the boy: legs over the near flank, torso, two arms up to the flute
  const bx = x + 2 * s;
  const by = y - 20 * s;
  inkPath(g, [{ x: bx - 1 * s, y: by }, { x: bx - 3 * s, y: by + 5 * s }, { x: bx - 2 * s, y: by + 8 * s }], seed + 32, {
    width: 1.5 * s, alpha: 0.8, colour: PIGMENT.muc, wobble: 0.08 * s, step: 4,
  });
  printedShape(
    g,
    thickPath(
      [{ x: bx, y: by - 0.5 * s }, { x: bx + 0.4 * s, y: by - 5 * s }, { x: bx + 0.2 * s, y: by - 8.5 * s }],
      [3.4 * s, 3.0 * s, 2.2 * s],
    ),
    PIGMENT.son, seed + 33, { width: 0.65 * s, alpha: 0.8, wobble: 0.08 * s, step: 3, fillAlpha: 0.92 },
  );
  g.fillStyle(PIGMENT.hoePale, 0.96);
  g.fillCircle(bx + 0.4 * s, by - 11 * s, 2.5 * s);
  inkPath(
    g,
    [
      { x: bx - 2.1 * s, y: by - 11 * s }, { x: bx + 0.4 * s, y: by - 13.5 * s },
      { x: bx + 2.9 * s, y: by - 11 * s }, { x: bx + 0.4 * s, y: by - 8.5 * s },
    ],
    seed + 35, { width: 0.6 * s, alpha: 0.8, wobble: 0.06 * s, step: 3, closed: true },
  );
  g.fillStyle(PIGMENT.muc, 0.85);
  g.fillCircle(bx + 0.9 * s, by - 13.4 * s, 1.4 * s);
  g.fillEllipse(bx - 0.4 * s, by - 12.2 * s, 4.8 * s, 2.8 * s);
  g.fillCircle(bx - 0.6 * s, by - 11.4 * s, 0.5 * s);
  inkPath(g, [{ x: bx - 6 * s, y: by - 9.4 * s }, { x: bx + 4 * s, y: by - 10.6 * s }], seed + 36, {
    width: 0.85 * s, alpha: 0.9, colour: PIGMENT.nau, wobble: 0,
  });
  inkPath(g, [{ x: bx - 1 * s, y: by - 5 * s }, { x: bx - 4.4 * s, y: by - 8.6 * s }], seed + 37, {
    width: 0.8 * s, alpha: 0.85, colour: PIGMENT.son, wobble: 0.06 * s, step: 3,
  });
  inkPath(g, [{ x: bx + 1.4 * s, y: by - 5 * s }, { x: bx + 2.4 * s, y: by - 9.4 * s }], seed + 38, {
    width: 0.8 * s, alpha: 0.85, colour: PIGMENT.son, wobble: 0.06 * s, step: 3,
  });

  // and the lotus leaf held over him — the stem reaches his hand
  inkPath(
    g,
    [{ x: bx + 2.4 * s, y: by - 9.4 * s }, { x: bx + 5 * s, y: by - 14 * s }, { x: bx + 5.6 * s, y: by - 18 * s }],
    seed + 39, { width: 0.7 * s, alpha: 0.8, colour: PIGMENT.giDong, wobble: 0.08 * s, step: 4 },
  );
  const shade: Pt[] = [];
  for (let index = 0; index <= 20; index += 1) {
    const t = index / 20;
    const angle = Math.PI + t * Math.PI;
    const rr = 8.5 * s * (1 + 0.08 * Math.cos(t * Math.PI * 2 * 7));
    shade.push({ x: bx + 5.6 * s + Math.cos(angle) * rr, y: by - 18.6 * s + Math.sin(angle) * rr * 0.4 });
  }
  printedShape(g, shade, PIGMENT.giDong, seed + 41, { width: 0.7 * s, alpha: 0.75, wobble: 0.1 * s, step: 4, fillAlpha: 0.88 });
  for (let vein = 0; vein < 5; vein += 1) {
    const angle = 3.36 + vein * 0.61;
    inkPath(
      g,
      [
        { x: bx + 5.6 * s, y: by - 18.6 * s },
        { x: bx + 5.6 * s + Math.cos(angle) * 7.6 * s, y: by - 18.6 * s + Math.sin(angle) * 3.2 * s },
      ],
      seed + 43 + vein, { width: 0.45 * s, alpha: 0.35, wobble: 0.06 * s, step: 3 },
    );
  }
}
