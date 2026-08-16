import Phaser from 'phaser';
import { PIGMENT, mixPigment, shadePigment } from './palette';
import { inkPath, mulberry32, printedShape, thickPath, washFill, type Pt } from './stroke';
import { unitScale } from './proportion';
import { foliagePalette, type SeasonPalette } from './season';

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
 *
 * **This is where the year is read.** The crown is drawn four different ways — in flower, in full
 * leaf, gold with limbs showing through, and as bare branches under snow — because at map zoom four
 * shades of the same scalloped stamp are four smudges, and the version of this that only changed hue
 * had to be propped up by a full-screen colour filter to be legible at all. See `ink/season.ts`.
 */
export function tree(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = unitScale('tree', scale);
  const rand = mulberry32(seed);
  const radius = 7 * s;
  const palette = foliagePalette();
  // The seasonal decisions draw from their OWN stream, so that turning the year does not shift the
  // main sequence and replant the country: a tree keeps its lobes, its wobble and its size from
  // spring to winter, and only its crown changes.
  const seasonal = mulberry32(seed + 977);
  const stripped = seasonal() < palette.bareChance;

  inkPath(g, [{ x, y }, { x: x - 0.6 * s, y: y - radius }], seed, {
    width: 1.2 * s, alpha: 0.55, colour: PIGMENT.nau, wobble: 0.12 * s, step: 4,
  });

  // The one seasonal change that is a change of SHAPE rather than colour, so the one that genuinely
  // cannot be done above the bake: no crown at all, just forking branches over the same trunk.
  // Winter takes it outright; autumn takes it for a third of the wood, which is what makes a hillside
  // read as half-dropped rather than as a hillside someone tinted gold.
  if (palette.canopy === 'bare' || stripped) {
    bareCrown(g, x, y - radius, s, radius, rand, seed);
    if (palette.canopy === 'turning') {
      clingingLeaves(g, x, y - radius, s, radius, palette, seasonal);
      leafLitter(g, x, y, s, radius, palette, seasonal);
    }
    if (palette.snow) {
      snowOnBranches(g, x, y, s, radius, seasonal);
    }
    return;
  }

  const lobes = 6 + Math.floor(rand() * 4);
  const canopy: Pt[] = [];
  for (let index = 0; index <= lobes * 5; index += 1) {
    const t = index / (lobes * 5);
    const angle = t * Math.PI * 2 - Math.PI / 2;
    const rr = radius * (1 + 0.09 * Math.cos(t * Math.PI * 2 * lobes)) * (0.9 + rand() * 0.18);
    canopy.push({ x: x + Math.cos(angle) * rr * 1.06, y: y - radius * 1.15 + Math.sin(angle) * rr * 0.9 });
  }
  const pale = rand() > 0.62;
  printedShape(g, canopy, pale ? palette.foliagePale : palette.foliage, seed + 1, {
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
  g.fillStyle(pale ? palette.foliage : shadePigment(palette.foliage, 0.78), 0.5);
  g.fillPoints(shade, true);

  const lit: Pt[] = [];
  for (let index = 0; index <= 11; index += 1) {
    const t = index / 11;
    const angle = t * Math.PI * 2;
    const rr = radius * 0.46 * (1 + 0.12 * Math.cos(t * Math.PI * 2 * 3));
    lit.push({ x: x - radius * 0.3 + Math.cos(angle) * rr, y: crownY - radius * 0.26 + Math.sin(angle) * rr * 0.82 });
  }
  g.fillStyle(pale ? PIGMENT.diepHi : palette.foliagePale, 0.34);
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

  // What the leafed crown wears on top of the green.
  if (palette.canopy === 'blossom') {
    blossomOnCrown(g, x, crownY, s, radius, palette, seasonal);
  } else if (palette.canopy === 'turning') {
    // A turning tree that kept its whole crown still has to say it is *dropping*: two bare limb tips
    // pushing out past the gold, and the leaves it has already lost lying at its foot.
    bareTips(g, x, crownY, s, radius, seed, seasonal);
    leafLitter(g, x, y, s, radius, palette, seasonal);
  }
}

/**
 * Đào and mai in flower: flecks of blossom over the crown, and the first of them on the ground.
 *
 * Weighted to the outside of the crown — flowers sit at the ends of the twigs, and a disc of petals
 * spread evenly over the middle reads as a diseased tree rather than a flowering one. Two tones,
 * because one is a stamp and two is a tree.
 */
function blossomOnCrown(
  g: G, x: number, crownY: number, s: number, radius: number, palette: SeasonPalette, rand: () => number,
): void {
  const flowers = 10 + Math.floor(rand() * 7);
  for (let index = 0; index < flowers; index += 1) {
    const angle = rand() * Math.PI * 2;
    // sqrt-biased *outward*: 1 - (1-u)^2 crowds the samples toward the rim.
    const reach = (1 - (1 - rand()) ** 2) * 0.98;
    g.fillStyle(rand() > 0.42 ? palette.blossom : palette.blossomAlt, 0.85);
    g.fillCircle(
      x + Math.cos(angle) * radius * reach * 1.02,
      crownY + Math.sin(angle) * radius * reach * 0.86,
      s * (0.62 + rand() * 0.5),
    );
  }
  // Petals down. Kept to the ground ellipse the scatter already draws under a tree, so they read as
  // fallen rather than as flecks floating on the field.
  for (let index = 0; index < 3; index += 1) {
    g.fillStyle(palette.blossom, 0.4);
    g.fillCircle(x + (rand() - 0.5) * radius * 1.7, crownY + radius * (1.15 + rand() * 0.35), s * 0.45);
  }
}

/** Two bare limb tips pushing out through a crown that is still mostly gold. */
function bareTips(g: G, x: number, crownY: number, s: number, radius: number, seed: number, rand: () => number): void {
  for (let tip = 0; tip < 2; tip += 1) {
    const angle = -Math.PI + 0.5 + rand() * (Math.PI - 1);
    inkPath(
      g,
      [
        { x: x + Math.cos(angle) * radius * 0.5, y: crownY + Math.sin(angle) * radius * 0.45 },
        { x: x + Math.cos(angle) * radius * 1.35, y: crownY + Math.sin(angle) * radius * 1.15 },
      ],
      seed + 60 + tip,
      { width: 0.5 * s, alpha: 0.5, colour: PIGMENT.nauDark, wobble: 0.14 * s, step: 3 },
    );
  }
}

/** The leaves a turning tree has already dropped, lying in its own shadow. */
function leafLitter(
  g: G, x: number, y: number, s: number, radius: number, palette: SeasonPalette, rand: () => number,
): void {
  const leaves = 5 + Math.floor(rand() * 5);
  for (let index = 0; index < leaves; index += 1) {
    const angle = rand() * Math.PI * 2;
    const reach = Math.sqrt(rand()) * radius * 1.5;
    g.fillStyle(rand() > 0.5 ? palette.litter : palette.foliagePale, 0.5 + rand() * 0.25);
    g.fillEllipse(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach * 0.35, s * 1.5, s * 0.7);
  }
}

/**
 * The leaves still hanging on a tree that has otherwise dropped.
 *
 * Generous, and deliberately so: a bare autumn tree with three flecks on it is indistinguishable
 * from a dead one, which is exactly how the first pass of this read at zoom. Enough gold to fringe
 * the limbs is what separates *dropping* from *dead*, and the season from winter.
 */
function clingingLeaves(
  g: G, x: number, topY: number, s: number, radius: number, palette: SeasonPalette, rand: () => number,
): void {
  const left = 7 + Math.floor(rand() * 5);
  for (let index = 0; index < left; index += 1) {
    const angle = -Math.PI + 0.35 + rand() * (Math.PI - 0.7);
    // Out along the limbs rather than in around the trunk — the last leaves to go are at the tips.
    const reach = radius * (0.75 + rand() * 0.75);
    g.fillStyle(rand() > 0.4 ? palette.foliage : palette.foliagePale, 0.8);
    g.fillEllipse(x + Math.cos(angle) * reach, topY + Math.sin(angle) * reach, s * 2.1, s * 1.3);
  }
}

/**
 * Snow lying on a bare tree, and a drift at its foot.
 *
 * Winter's colour is a *muted* green — on its own it says "a bit tired", not "cold". The white is
 * what actually carries the season down at prop scale, which is why it is drawn on the branches and
 * not left to the weather overhead: falling motes are behind the camera half the time, and a tree
 * with snow on it is not.
 */
function snowOnBranches(g: G, x: number, y: number, s: number, radius: number, rand: () => number): void {
  const caps = 3 + Math.floor(rand() * 3);
  for (let index = 0; index < caps; index += 1) {
    const angle = -Math.PI + 0.45 + rand() * (Math.PI - 0.9);
    const reach = radius * (0.55 + rand() * 0.75);
    g.fillStyle(PIGMENT.diepHi, 0.9);
    g.fillEllipse(
      x + Math.cos(angle) * reach,
      y - radius + Math.sin(angle) * reach - s * 0.3,
      s * (1.6 + rand() * 1.1),
      s * 0.75,
    );
  }
  // The drift the tree stands in, wider than the trunk and flat to the ground plane.
  g.fillStyle(PIGMENT.diepHi, 0.55);
  g.fillEllipse(x, y, radius * 1.5, radius * 0.36);
}

/**
 * A winter crown: forking bare branches where the canopy would be.
 *
 * Drawn as ink only, with no colour block behind it — a leafless tree in the reference prints is a
 * line drawing, and filling it would put a ghost of the summer canopy back on the paper.
 */
function bareCrown(g: G, x: number, topY: number, s: number, radius: number, rand: () => number, seed: number): void {
  const limbs = 4 + Math.floor(rand() * 3);
  for (let limb = 0; limb < limbs; limb += 1) {
    const angle = -Math.PI + 0.35 + (limb / (limbs - 1)) * (Math.PI - 0.7) + (rand() - 0.5) * 0.22;
    const reach = radius * (0.85 + rand() * 0.7);
    const midX = x + Math.cos(angle) * reach * 0.55;
    const midY = topY + Math.sin(angle) * reach * 0.55;
    const tipX = x + Math.cos(angle) * reach;
    const tipY = topY + Math.sin(angle) * reach;
    inkPath(g, [{ x, y: topY + radius * 0.25 }, { x: midX, y: midY }, { x: tipX, y: tipY }], seed + limb * 13, {
      width: 0.62 * s, alpha: 0.62, colour: PIGMENT.nauDark, wobble: 0.14 * s, step: 4,
    });
    // One twig off each limb, so the silhouette breaks up instead of reading as a bare fork.
    const twigAngle = angle + (rand() - 0.5) * 0.9;
    inkPath(
      g,
      [{ x: midX, y: midY }, { x: midX + Math.cos(twigAngle) * reach * 0.4, y: midY + Math.sin(twigAngle) * reach * 0.4 }],
      seed + limb * 13 + 7,
      { width: 0.4 * s, alpha: 0.44, colour: PIGMENT.nauDark, wobble: 0.12 * s, step: 3 },
    );
  }
}

/**
 * Cỏ — a tuft of grass, in the season's own green.
 *
 * Drawn in ink at a third alpha this was a grey tick that read as hatching, which is why open
 * ground looked like bare paper next to the paddy however many tufts were scattered on it. Grass is
 * a growing thing, so it takes the foliage pigment like every other growing thing, and the blades
 * fan rather than standing parallel.
 *
 * Grass is also the most *numerous* thing on the map — plains carry twice the tufts they used to —
 * so it is doing more of the work of stating the season than any single tree can.
 */
export function grassTuft(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = unitScale('grassTuft', scale);
  const rand = mulberry32(seed);
  const palette = foliagePalette();
  const blades = 4 + Math.floor(rand() * 2);
  for (let blade = 0; blade < blades; blade += 1) {
    // Splayed from a common root rather than offset sideways, so a tuft reads as one plant.
    const lean = (blade / (blades - 1) - 0.5) * 2;
    inkPath(
      g,
      [
        { x: x + lean * 0.7 * s, y },
        // Winter grass is cut back to two thirds: dead grass lies down, and the shorter blade is
        // what stops a snowed field reading as a green one someone put a pale rectangle over.
        { x: x + lean * 3.2 * s, y: y - (3.4 + rand() * 2.6) * s * (palette.snow ? 0.66 : 1) },
      ],
      seed + blade,
      { width: 0.55 * s, alpha: 0.62, colour: palette.foliage, wobble: 0.12 * s, step: 4 },
    );
  }
  if (palette.snow) {
    g.fillStyle(PIGMENT.diepHi, 0.7);
    g.fillEllipse(x, y - 0.4 * s, 4.4 * s, 1.5 * s);
  }
}

/** Tre — bamboo. Tall arching culms from one clump; the village's own wall. */
export function bamboo(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = unitScale('bamboo', scale);
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
        foliagePalette().evergreen,
        seed + index * 11 + leaf,
        { width: 0.5 * s, alpha: 0.5, wobble: 0.15 * s, step: 5, fillAlpha: 0.65 },
      );
    }
  }
}

/** Chuối — banana. Big torn paddle leaves off a short trunk. */
export function banana(g: G, x: number, y: number, s: number, seed: number): void {
  s = unitScale('banana', s);
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
      foliagePalette().evergreen,
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
  const s = unitScale('areca', scale);
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
      foliagePalette().evergreen,
      seed + 30 + frond,
      { width: 0.5 * s, alpha: 0.5, wobble: 0.2 * s, step: 4, fillAlpha: 0.65 },
    );
  }
}

/** Cây đa — the banyan at the village gate, with its hanging aerial roots. */
export function banyan(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = unitScale('banyan', scale);
  const rand = mulberry32(seed);
  const canopy: Pt[] = [];
  const lobes = 8;
  for (let index = 0; index <= lobes * 6; index += 1) {
    const t = index / (lobes * 6);
    const angle = t * Math.PI * 2 - Math.PI / 2;
    const rr = 15 * s * (1 + 0.15 * Math.cos(t * Math.PI * 2 * lobes)) * (0.9 + rand() * 0.16);
    canopy.push({ x: x + Math.cos(angle) * rr * 1.2, y: y - 16 * s + Math.sin(angle) * rr * 0.78 });
  }
  printedShape(g, canopy, foliagePalette().evergreen, seed, { width: 0.85 * s, alpha: 0.7, wobble: 0.22 * s, step: 5, fillAlpha: 0.85 });
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
  // The banyan holds its leaves through the cold, so winter states itself on top of them instead:
  // snow lying along the upper shoulder of the crown. It is the largest tree on the map and the one
  // at every village gate — leaving it plain green was the loudest thing arguing against the season.
  if (foliagePalette().snow) {
    for (let cap = 0; cap < 3; cap += 1) {
      const angle = -Math.PI + 0.6 + cap * 0.85;
      g.fillStyle(PIGMENT.diepHi, 0.8);
      g.fillEllipse(x + Math.cos(angle) * 13 * s, y - 16 * s + Math.sin(angle) * 10 * s, 9 * s, 3 * s);
    }
  }
}

// ── buildings, in oblique ─────────────────────────────────────────────────────

/**
 * Nhà ba gian hai chái — three bays and two lean-tos, earth walls packed over a bamboo lattice,
 * rice-straw thatch. Wide and low, and **the roof is most of it**.
 */
export function house(g: G, x: number, y: number, scale: number, seed: number, tiled = false): void {
  const s = unitScale('house', scale);
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
  s = unitScale('dinh', s);
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
  s = unitScale('thap', s);
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
  const s = unitScale('hayStack', scale);
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

/** A farmer under a nón lá, readable as one person even at the map's resting zoom. */
export function farmer(g: G, x: number, y: number, scale: number, seed: number): void {
  const s = unitScale('farmer', scale);
  const rand = mulberry32(seed);
  const poseRoll = rand();
  const pose: 'planting' | 'carrying' | 'standing' = poseRoll < 0.34 ? 'planting' : poseRoll < 0.68 ? 'carrying' : 'standing';
  // Which way they face. A row of figures all facing the same way reads as printed wallpaper.
  const dir = rand() < 0.5 ? 1 : -1;
  // Áo nâu or indigo — working dress, and the only colour on the figure.
  const cloth = rand() < 0.6 ? PIGMENT.nau : PIGMENT.cham;
  // Bent double over the water when planting; upright otherwise.
  // Keep the planter's head above their hips. A deeper bow is anatomically possible, but at ten
  // screen pixels it turns the person into two crossing strokes instead of a human silhouette.
  const bend = pose === 'planting' ? 0.32 : 0;

  const HIP = -5.2;
  /**
   * Design point to world. Everything above the hip leans forward by `bend`, so one set of
   * coordinates serves the upright poses and the bent one.
   */
  const at = (dx: number, dy: number): Pt => {
    const above = Math.max(0, HIP - dy);
    return {
      x: x + (dx + bend * above * 0.92) * dir * s,
      y: y + (dy + bend * above * 0.3) * s,
    };
  };

  groundShadow(g, x + 0.3 * dir * s, y + 0.5 * s, 2.4 * s, 0.09);

  /**
   * The body as ONE silhouette — head to hem to heels, with the gap between the legs cut out of
   * it — and not as an assembly of parts.
   *
   * The previous figure drew a torso and four limbs as separate filled quads, each with its own
   * dark outline. At the size the map actually draws a person that is five outlined boxes
   * overlapping inside eight pixels: it read as scaffolding, and the bent pose read as a broken
   * deck chair. A single closed outline can carry a pose at any size, which is exactly what the
   * woodcut figures do.
   */
  const body: Pt[] = [
    at(-1.15, -11.4), at(-2.15, -10.1), at(-1.6, -5.0), at(-1.95, 0),
    at(-0.62, 0), at(-0.42, -4.3), at(0.42, -4.3), at(0.62, 0),
    at(1.95, 0), at(1.6, -5.0), at(2.15, -10.1), at(1.15, -11.4),
  ];
  printedShape(g, body, PIGMENT.muc, seed + 1, {
    width: 0.42 * s, alpha: 0.85, wobble: 0.05 * s, step: 4, fillAlpha: 0.9,
  });

  // The áo over the top half, inset so the silhouette shows as a rim rather than a second outline.
  // Dark legs, coloured body, pale hat: three bands, which is what makes a six-pixel person read.
  g.fillStyle(cloth, 0.95);
  g.fillPoints([at(-1.75, -10.0), at(1.75, -10.0), at(1.4, -5.4), at(-1.4, -5.4)], true);

  if (pose === 'planting') {
    // One arm down into the water, and the seedlings in that hand.
    inkPath(g, [at(1.4, -9.2), at(3.0, -3.4), at(3.2, -1.0)], seed + 4, {
      width: 0.8 * s, alpha: 0.85, colour: PIGMENT.muc, wobble: 0.04 * s, step: 4,
    });
    g.fillStyle(PIGMENT.giDong, 0.9);
    for (let blade = 0; blade < 3; blade += 1) {
      const tip = at(2.5 + blade * 0.6, -1.4 - blade * 0.3);
      g.fillRect(tip.x, tip.y - 1.8 * s, 0.5 * s, 1.8 * s);
    }
  } else if (pose === 'carrying') {
    // Đòn gánh — the shoulder pole, a basket swinging at each end.
    const left = at(-5.6, -10.6);
    const right = at(5.6, -10.2);
    inkPath(g, [left, right], seed + 5, {
      width: 0.5 * s, alpha: 0.85, colour: PIGMENT.nau, wobble: 0.04 * s, step: 5,
    });
    for (const end of [left, right]) {
      inkPath(g, [end, { x: end.x, y: end.y + 2.2 * s }], seed + 6 + end.x, {
        width: 0.35 * s, alpha: 0.6, colour: PIGMENT.nau, wobble: 0, step: 3,
      });
      printedShape(
        g,
        [
          { x: end.x - 1.5 * s, y: end.y + 2.2 * s }, { x: end.x + 1.5 * s, y: end.y + 2.2 * s },
          { x: end.x + 1.0 * s, y: end.y + 4.1 * s }, { x: end.x - 1.0 * s, y: end.y + 4.1 * s },
        ],
        PIGMENT.hoePale, seed + 8 + end.x,
        { width: 0.4 * s, alpha: 0.8, wobble: 0.04 * s, step: 3, fillAlpha: 0.92 },
      );
    }
    // One arm hooks visibly over the pole; without it the baskets look suspended beside a post.
    inkPath(g, [at(-1.5, -9.6), at(-2.7, -11.0), at(-3.5, -10.8)], seed + 11, {
      width: 0.65 * s, alpha: 0.86, colour: PIGMENT.muc, wobble: 0.03 * s, step: 3,
    });
  } else {
    // Standing, one hand on a hoe planted in the ground.
    inkPath(g, [at(2.6, 0), at(3.0, -9.4)], seed + 9, {
      width: 0.45 * s, alpha: 0.8, colour: PIGMENT.nau, wobble: 0.04 * s, step: 5,
    });
    g.fillStyle(PIGMENT.mucSoft, 0.9);
    g.fillPoints([at(2.4, -9.4), at(4.6, -9.2), at(4.4, -7.9), at(2.5, -8.1)], true);
    inkPath(g, [at(1.9, -9.0), at(2.9, -8.6)], seed + 10, {
      width: 0.6 * s, alpha: 0.8, colour: PIGMENT.muc, wobble: 0, step: 3,
    });
  }

  // Head, then the nón lá over it. The hat is the whole recognition at this size, so it is the one
  // element that keeps a crisp rim — but it is barely wider than the shoulders, because a brim that
  // overhangs the body detaches from it and the figure becomes a mushroom.
  const head = at(0.2, -12.5);
  g.fillStyle(PIGMENT.nauDark, 0.92);
  g.fillCircle(head.x, head.y, 1.15 * s);

  const brim = 2.7 * s;
  const peak = at(0.2, -15.0);
  const hat = [
    { x: head.x - brim, y: head.y + 0.5 * s },
    { x: head.x - brim * 0.5, y: head.y - 1.1 * s },
    { x: peak.x, y: peak.y },
    { x: head.x + brim * 0.5, y: head.y - 1.1 * s },
    { x: head.x + brim, y: head.y + 0.5 * s },
  ];
  // Props normally carry a generous hand-registered colour offset. On a hat only five pixels
  // wide that offset becomes a second hat, so retain a subtler woodblock registration here.
  washFill(g, hat, PIGMENT.hoePale, seed + 12, 0.96, 0.45 * s);
  inkPath(g, hat, seed + 13, {
    width: 0.42 * s, alpha: 0.9, wobble: 0.04 * s, step: 4, closed: true,
  });
}

// ── landform ──────────────────────────────────────────────────────────────────

/**
 * Núi đá vôi — karst. Vietnam's mountains are limestone towers with near-vertical flanks and
 * rounded, broken tops rising straight out of flat paddy: Ninh Bình, Tam Cốc, Hạ Long.
 *
 * Three things make a field of them read as karst, and only the third is about a single tower:
 *
 *  1. **Depth is value, not overlap.** A karst basin is layers of silhouette at receding tones —
 *     the far rank a flat pale wash with no contour at all, the front rank warm and fully inked.
 *     Drawn at one value they interlock into a tangle of outlines whatever each one looks like,
 *     which is what a row of forty identically-toned towers had become.
 *  2. **The towers differ in KIND, not in scale.** One profile function scaled up and down is one
 *     object repeated, and repetition at this density reads as teeth. There are five forms here —
 *     loaf, fang, saddle, cliff-and-ramp, anvil — with their own aspect ratios and their own
 *     skylines, and the flanks of every one are two independent curves rather than a mirror.
 *  3. **Texture belongs to the form.** Every bed, flute and clump is placed through `at(t, u)`,
 *     which is the silhouette's own parametrisation, so nothing can be drawn outside the rock. The
 *     version this replaces computed a stroke's width at one height and drew it at another, and
 *     hung its flutes in mid-air; its scrub was placed across 1.4× the tower's half-width and so
 *     stood off the wall as floating caps.
 */

/** Half-width at height `t` up a tower, as a fraction of its nominal half-width. */
type Flank = (t: number) => number;

/** A flank sampled as keyframes: `[t, half-width fraction]`, smoothed between. */
type Keys = ReadonlyArray<readonly [number, number]>;

/** One rounded knuckle of a summit: where across the crown, how high, how wide. */
interface Knuckle {
  readonly at: number;
  readonly amp: number;
  readonly width: number;
}

interface KarstForm {
  readonly left: Keys;
  readonly right: Keys;
  /** Height of the crown above the walls, as a fraction of the tower. */
  readonly rise: number;
  readonly caps: ReadonlyArray<Knuckle>;
  /** Height ÷ width this form wants. A fang rolled at a loaf's aspect is just a loaf. */
  readonly aspect: readonly [number, number];
}

/**
 * The five towers.
 *
 * Every one is undercut at the foot — the first keyframe is always below the second — because
 * standing water eats limestone at the waterline, and that overhang is the single most recognisable
 * thing about the Ninh Bình and Hạ Long towers this map is set among.
 */
const KARST_FORMS: Record<string, KarstForm> = {
  /** Thumb of rock: broad, near-vertical, one summit and a lower shoulder off it. */
  loaf: {
    // The wall holds its width to five-sixths of the way up and the CROWN does all the turning.
    // Tapered from halfway and capped with a shallow arc it is an egg, which is what a rank of
    // these came out as: a tháp is a wall with a cap on it, and the break between the two is the
    // whole silhouette.
    left: [[0, 0.87], [0.10, 1.00], [0.62, 1.02], [0.86, 0.96], [1, 0.68]],
    right: [[0, 0.84], [0.11, 0.99], [0.64, 1.03], [0.88, 0.94], [1, 0.62]],
    rise: 0.13,
    caps: [{ at: 0.38, amp: 1, width: 0.72 }, { at: 0.84, amp: 0.55, width: 0.40 }],
    aspect: [2.00, 3.00],
  },
  /** Needle: the one that carries the skyline, and the reason a range has a top edge worth reading. */
  fang: {
    left: [[0, 0.91], [0.08, 1.00], [0.32, 0.95], [0.66, 0.64], [1, 0.17]],
    right: [[0, 0.89], [0.09, 1.00], [0.36, 0.97], [0.69, 0.60], [1, 0.15]],
    rise: 0.15,
    caps: [{ at: 0.46, amp: 1, width: 0.95 }],
    aspect: [2.90, 4.00],
  },
  /** Twin summits over one massif, with a real col between them rather than a nick. */
  saddle: {
    left: [[0, 0.88], [0.10, 1.00], [0.52, 1.02], [0.84, 0.97], [1, 0.88]],
    right: [[0, 0.86], [0.11, 0.99], [0.55, 1.03], [0.86, 0.95], [1, 0.84]],
    rise: 0.22,
    caps: [{ at: 0.26, amp: 1, width: 0.40 }, { at: 0.74, amp: 0.74, width: 0.38 }],
    aspect: [1.45, 2.05],
  },
  /**
   * Sheer on the left, a long talus ramp falling away right. The most photographic of the five and
   * the only one whose summit is not near its own centre.
   */
  cliff: {
    left: [[0, 0.93], [0.06, 1.00], [0.78, 1.02], [0.92, 0.92], [1, 0.34]],
    right: [[0, 0.88], [0.10, 1.00], [0.38, 0.74], [0.72, 0.44], [1, 0.18]],
    rise: 0.14,
    caps: [{ at: 0.18, amp: 1, width: 0.46 }, { at: 0.66, amp: 0.32, width: 0.42 }],
    aspect: [2.00, 3.00],
  },
  /** Pinched at the waist and overhanging at the shoulder — Hạ Long's wave-cut form. */
  anvil: {
    left: [[0, 0.85], [0.11, 0.97], [0.46, 0.81], [0.82, 1.07], [1, 0.60]],
    right: [[0, 0.83], [0.12, 0.96], [0.49, 0.83], [0.84, 1.08], [1, 0.55]],
    rise: 0.15,
    caps: [{ at: 0.58, amp: 1, width: 0.64 }, { at: 0.17, amp: 0.46, width: 0.36 }],
    aspect: [1.90, 2.70],
  },
};

export type KarstKind = keyof typeof KARST_FORMS;

/** How far back a tower stands. Depth in this landscape is carried by tone, so it is a draw mode. */
export type KarstPlane = 'haze' | 'mid' | 'near';

/** Smoothstep between keyframes, so a wall never shows the corner between two of them. */
function keyedFlank(keys: Keys, jitter: number): Flank {
  return (t) => {
    let index = 0;
    while (index < keys.length - 2 && t > keys[index + 1][0]) {
      index += 1;
    }
    const [t0, w0] = keys[index];
    const [t1, w1] = keys[index + 1];
    const span = t1 - t0;
    const u = span <= 0 ? 0 : Math.max(0, Math.min(1, (t - t0) / span));
    return Math.max(0.03, (w0 + (w1 - w0) * (u * u * (3 - 2 * u))) * jitter);
  };
}

/**
 * Height of the summit at `u` across the crown, in [0, 1].
 *
 * The knuckles are combined with `max` rather than summed: overlapping caps merge into one worn
 * cap, distant ones leave a real col between them, and either way the curve returns to zero where
 * it meets the wall, so the crown never joins the flank at a corner.
 */
function crownAt(caps: ReadonlyArray<Knuckle>, u: number): number {
  // A shallow dome under everything, so that where two knuckles fall apart the crown drops to a col
  // and not to the wall top. Without it the gap between two caps cuts the full depth of the crown
  // and a twin summit comes out as a hard V — a pair of wings rather than a saddle.
  let top = Math.pow(Math.sin(u * Math.PI), 0.75) * 0.19;
  for (const cap of caps) {
    const d = Math.abs(u - cap.at) / cap.width;
    if (d >= 1) {
      continue;
    }
    // Flattened toward the apex rather than a pure cosine: rock worn round, not struck with a
    // compass.
    top = Math.max(top, cap.amp * Math.pow(Math.cos((d * Math.PI) / 2), 1.55));
  }
  return top;
}

/** A lobed, bottom-flattened blob — the shape all rock vegetation on this map is drawn from. */
function scrubBlob(cx: number, cy: number, rx: number, ry: number, seed: number): Pt[] {
  const rand = mulberry32(seed);
  const lobes = 3 + Math.floor(rand() * 3);
  const phase = rand() * Math.PI * 2;
  const points: Pt[] = [];
  const STEPS = 16;
  for (let step = 0; step <= STEPS; step += 1) {
    const angle = Math.PI + (step / STEPS) * Math.PI * 2;
    const bump = 1 + Math.sin(angle * lobes + phase) * 0.17 + (rand() - 0.5) * 0.08;
    points.push({
      x: cx + Math.cos(angle) * rx * bump,
      // Squashed under the horizontal, so the clump sits on what it grows out of instead of
      // hovering as a disc.
      y: cy + Math.sin(angle) * ry * bump * (Math.sin(angle) > 0 ? 0.45 : 1),
    });
  }
  return points;
}

export interface KarstOptions {
  plane?: KarstPlane;
  kind?: KarstKind;
  /**
   * How far forward inside its own rank this tower stands, 0 to 1.
   *
   * Contour weight and shadow strength ride on it. A rank whose towers all carry the same contour
   * is twelve equally loud outlines and no hierarchy — a colouring book — which is the single thing
   * that kept the front rank reading as cut paper after its silhouettes were already right.
   */
  front?: number;
}

export function karst(
  g: G,
  x: number,
  baseY: number,
  w: number,
  h: number,
  seed: number,
  options: KarstOptions = {},
): void {
  const plane = options.plane ?? 'near';
  const kind = options.kind ?? 'loaf';
  const front = options.front ?? 1;
  const rand = mulberry32(seed);
  const form = KARST_FORMS[kind] ?? KARST_FORMS.loaf;
  const mirrored = rand() > 0.5;
  const half = w / 2;
  const lean = (rand() - 0.5) * 0.14;
  const wallTop = h * (1 - form.rise);

  // Each flank carries its own ±5%, so two towers of the same form are never the same tower, and
  // no tower is symmetrical about its own spine.
  const leftKeys = mirrored ? form.right : form.left;
  const rightKeys = mirrored ? form.left : form.right;
  const leftCurve = keyedFlank(leftKeys, 0.95 + rand() * 0.1);
  const rightCurve = keyedFlank(rightKeys, 0.95 + rand() * 0.1);

  /**
   * Facets: the wall stepped into flat faces instead of run as one curve.
   *
   * A dissolved limestone wall is not smooth. It is a stack of flat faces meeting at breaks, and a
   * silhouette without a single straight run in it anywhere is the reason the towers kept coming
   * back as loaves however their proportions were tuned. Held constant across a band of height and
   * then stepped, the profile picks up those breaks for the cost of an array lookup.
   */
  const faceted = (curve: Flank, offset: number): Flank => {
    const roll = mulberry32(seed + offset);
    const BANDS = 5;
    const steps = Array.from({ length: BANDS }, () => 1 + (roll() - 0.5) * 0.07);
    return (t) => curve(t) * steps[Math.max(0, Math.min(BANDS - 1, Math.floor(t * BANDS)))];
  };
  const left = faceted(leftCurve, 131);
  const right = faceted(rightCurve, 577);

  /**
   * The silhouette's own coordinates: `t` up the wall, `u` across it from -1 (lit edge) to +1
   * (shaded edge).
   *
   * Every mark below is placed through this, which is why none of them can escape the rock. It is
   * the single structural fix in this rewrite.
   */
  const at = (t: number, u: number): Pt => {
    const drift = lean * h * t;
    const l = x - half * left(t) + drift;
    const r = x + half * right(t) + drift;
    return { x: (l + r) / 2 + ((r - l) / 2) * u, y: baseY - wallTop * t };
  };

  const RIB = plane === 'near' ? 11 : 7;
  const leftWall: Pt[] = [];
  const rightWall: Pt[] = [];
  for (let rib = 0; rib <= RIB; rib += 1) {
    const t = rib / RIB;
    leftWall.push(at(t, -1));
    rightWall.push(at(t, 1));
  }

  // The crown, sampled across the gap the walls leave at the top.
  const crown: Pt[] = [];
  const capLeft = leftWall[RIB];
  const capRight = rightWall[RIB];
  const span = capRight.x - capLeft.x;
  const CROWN_STEPS = plane === 'near' ? 15 : 9;
  const caps = mirrored
    ? form.caps.map((cap) => ({ ...cap, at: 1 - cap.at }))
    : form.caps;
  /**
   * The cap is set a little wider than the wall it stands on, and its corners hang a little below
   * the wall top.
   *
   * That overhanging brow is what makes a summit turn over. Sprung exactly off the wall tops the
   * crown continues the taper it inherits and the tower comes out as a bowling pin — a shape that
   * has no break in it anywhere, which is the one thing a dissolved rock is never short of.
   */
  const brow = span * 0.035;
  for (let step = 0; step <= CROWN_STEPS; step += 1) {
    const u = step / CROWN_STEPS;
    const shoulder = Math.min(1, Math.sin(u * Math.PI) * 5);
    crown.push({
      x: capLeft.x - brow + (span + brow * 2) * u,
      // A hair of roughness on the skyline, which is where a clean curve is most obviously a curve.
      y: capLeft.y + h * 0.008 * (1 - shoulder)
        - h * form.rise * crownAt(caps, u) * shoulder
        + (rand() - 0.5) * h * 0.010,
    });
  }

  const outline: Pt[] = [
    { x: leftWall[0].x, y: baseY },
    ...leftWall,
    ...crown,
    ...[...rightWall].reverse(),
    { x: rightWall[0].x, y: baseY },
  ];
  const skirted: Pt[] = [
    ...outline,
    { x: rightWall[0].x, y: baseY + 1.5 },
    { x: leftWall[0].x, y: baseY + 1.5 },
  ];

  // ── The colour block, and the plane it stands on ──
  //
  // The far rank is a flat wash carried toward indigo and given no contour at all. A pale tower
  // with a black outline does not read as distant however pale it is — the outline is the thing the
  // eye measures distance by, and dropping it is what turns a silhouette into haze.
  if (plane === 'haze') {
    // Carried toward indigo but kept in the shell tone's own family. Mixed from the paper white
    // instead, the far rank came out a cold neutral grey and read as somebody else's mountains
    // printed behind these ones.
    washFill(g, skirted, mixPigment(PIGMENT.diepDeep, PIGMENT.cham, 0.40), seed, 0.44, 0.4);
    return;
  }

  if (plane === 'mid') {
    washFill(g, skirted, mixPigment(PIGMENT.diepLo, PIGMENT.chamPale, 0.30), seed, 0.92, 0.7);
    // Contoured in a grey carried most of the way to indigo, never in the ink itself. A middle
    // distance drawn with the same black as the front rank is tracing paper: the contour is the one
    // mark the eye measures distance by, and at full strength it drags the whole rank forward.
    inkPath(g, outline, seed + 3, {
      colour: mixPigment(PIGMENT.mucSoft, PIGMENT.cham, 0.45), width: 0.55, alpha: 0.34, wobble: 0.4, step: 11,
    });
    // One soft turn of shade, so the middle rank has volume without competing with the front for
    // contrast.
    const midShade: Pt[] = [];
    for (let rib = RIB; rib >= 0; rib -= 1) {
      midShade.push(rightWall[rib]);
    }
    for (let rib = 0; rib <= RIB; rib += 1) {
      midShade.push(at(rib / RIB, 0.34));
    }
    washFill(g, midShade, mixPigment(PIGMENT.diepDeep, PIGMENT.cham, 0.30), seed + 7, 0.28, 0);
    karstGreen(g, crown, at, h, seed, rand, 'mid');
    return;
  }

  // ── The front rank, and the value it is owed ──
  //
  // In an ink landscape the nearest rock is the DARKEST and most worked thing in the picture, and
  // the distance behind it is what stays pale. Filled in the paper's own light shell tone and then
  // ringed in black, this rank came out the palest thing on the sheet with the loudest contour on
  // it — inverted, which is a cutout of a mountain rather than a mountain. So the block is laid in
  // the deep shell tone and the LIT face is lifted off it, instead of the other way round.
  //
  // Each tower also takes its own place on that mix. A rank cut from one flat tan is a rank of
  // paper dolls however well each one is modelled; limestone weathers at its own rate and no two
  // towers in a basin are the same colour.
  washFill(
    g,
    skirted,
    mixPigment(PIGMENT.diepLo, PIGMENT.diepDeep, Math.min(1, 0.45 + front * 0.35 + rand() * 0.3)),
    seed,
    1,
    0.9,
  );

  // Below roughly a finger's width on screen — map zoom, where a range is a few tiles wide — the
  // texture below stops being texture and becomes dirt. Everything after this is rationed by it.
  const detail = Math.max(0, Math.min(1, (h - 16) / 34));

  // ── The turn of the light ──
  //
  // Light from the upper left. Three bands each way from a terminator that slides inward as the
  // tower rises, so the flank narrows with the shoulder rather than cutting a translucent rectangle
  // down the middle of the rock — which is exactly what one pass at a fixed offset read as.
  // Registration is zero throughout: these are faces *of* the tower, and letting them take the
  // print's usual hand offset pushed them out past the silhouette as a grey fringe.
  // Kept deliberately low. Lifted hard enough to read as a light source, the lit half bleaches out
  // to bare paper and the tower turns into a candle — the same flatness as before, arrived at from
  // the other end. The turn wants to be felt, not seen.
  // Several thin passes rather than two fat ones: each polygon has a hard edge at its terminator,
  // and too few of them leaves those steps legible as pale vertical seams down the rock.
  //
  // Sampled at BAND ribs rather than the silhouette's own. These are soft washes with no contour on
  // them, so the extra vertices buy nothing visible and every one of them is paid twice — once in
  // the polygon and once in the triangulation, on a prop the map draws a few hundred of.
  const BAND = 6;
  const bandOf = (edge: Pt[], terminator: (t: number) => number): Pt[] => {
    const band: Pt[] = [];
    for (let rib = 0; rib <= BAND; rib += 1) {
      band.push(edge[Math.round((rib / BAND) * RIB)]);
    }
    for (let rib = BAND; rib >= 0; rib -= 1) {
      const t = rib / BAND;
      band.push(at(t, terminator(t)));
    }
    return band;
  };

  const lit = mixPigment(PIGMENT.diepHi, PIGMENT.diepLo, 0.35);
  for (const [to, alpha] of [[0.30, 0.11], [-0.02, 0.10], [-0.34, 0.09], [-0.66, 0.08]] as const) {
    washFill(g, bandOf(leftWall, (t) => Math.max(-0.98, to - t * 0.16)), lit, seed + 5, alpha, 0);
  }

  const shadeTone = mixPigment(PIGMENT.diepDeep, PIGMENT.muc, 0.26);
  for (const [from, alpha] of [[0.14, 0.13 + front * 0.09], [0.40, 0.12], [0.64, 0.11], [0.86, 0.10]] as const) {
    washFill(g, bandOf(rightWall, (t) => Math.min(0.98, from + t * 0.18)), shadeTone, seed + 7, alpha, 0);
  }

  // ── The arête ──
  //
  // The interior edge where the lit face and the turned-away face meet. One drawn line down from
  // the summit is the single mark that converts a flat silhouette into a solid — everything before
  // it describes the tower's outline, and an outline with nothing inside it is a shape. Strongest
  // under the crown where the break is sharpest, fading out before it reaches the foot, because a
  // ridge carried all the way down splits the tower into two towers.
  if (detail > 0.4) {
    inkPath(g, [at(0.97, 0.30), at(0.82, 0.24), at(0.66, 0.19)], seed + 91,
      { width: 0.7, alpha: 0.24 * front, wobble: 0.35, step: 7 });
    inkPath(g, [at(0.66, 0.19), at(0.50, 0.16), at(0.36, 0.14)], seed + 92,
      { width: 0.55, alpha: 0.11 * front, wobble: 0.4, step: 8 });
  }

  // The contour last, so it sits over its own colour blocks, and at a weight that falls off with
  // depth inside the rank.
  // Wobble kept low: a limestone wall is straight, and a contour that wanders reads as cloth. The
  // hand belongs in the line's weight and its ends, not in its course.
  inkPath(g, outline, seed + 3, {
    width: 0.72 + front * 0.5, alpha: 0.40 + front * 0.30, wobble: 0.26, step: 9,
  });

  // ── Bedding ──
  //
  // Limestone is laid down in beds and the strata run across the tower, but a bed drawn from edge
  // to edge on every tower in a crowded range lines up with its neighbours' into one continuous
  // rule across the whole picture — graph paper, which is what the range had become. So: one or
  // two, short, and always ending inside the rock.
  // Bedding lives on the LIT flank and the runnels below live on the shaded one, and neither ever
  // enters the other's half. Sharing the wall, a horizontal tick and a vertical tick cross into a
  // small plus sign — a mark the eye reads as a symbol rather than as rock, and there were dozens
  // of them.
  const beds = Math.round((0.6 + rand() * 1.2) * detail * front);
  for (let bed = 0; bed < beds; bed += 1) {
    const t = 0.30 + rand() * 0.40;
    const u0 = -0.88 + rand() * 0.20;
    const u1 = u0 + 0.40 + rand() * 0.30;
    const a = at(t, u0);
    const b = at(t + 0.012, (u0 + u1) / 2);
    const c = at(t + 0.03, Math.min(-0.06, u1));
    inkPath(g, [a, b, c], seed + 80 + bed, { width: 0.5, alpha: 0.12, wobble: 0.45, step: 9 });
  }

  // ── Flutes ──
  //
  // Rain dissolves limestone into vertical runnels. They live on the turned-away flank — the lit
  // wall is described by its edge and by the light on it, never by lines — and they hang from under
  // the shoulder rather than floating at an arbitrary height, which is what the fall of water down a
  // wall actually does.
  //
  // One to three, at a twelfth of the contour's weight. Four or five of them at a quarter of it is
  // not texture, it is a row of parallel pencil scratches, which is the corduroy this whole prop has
  // been talked out of twice already.
  const flutes = Math.round((0.8 + rand() * 1.9) * detail * front);
  for (let flute = 0; flute < flutes; flute += 1) {
    const u = 0.34 + rand() * 0.48;
    const top = 0.56 + rand() * 0.26;
    const drop = 0.12 + rand() * 0.20;
    const a = at(top, u);
    const b = at(Math.max(0.04, top - drop * 0.55), u + 0.03);
    const c = at(Math.max(0.02, top - drop), u + 0.05);
    inkPath(g, [a, b, c], seed + 20 + flute, { width: 0.5, alpha: 0.15, wobble: 0.3, step: 8 });
  }

  // ── The cave mouth ──
  //
  // Tam Cốc is named for three of them and Trang An is a boat ride through them. A dark arch bitten
  // out of the foot is the cheapest mark on this whole tower and the one that says limestone
  // loudest — no other rock in the country is hollow at the waterline.
  if (detail > 0.55 && rand() < 0.42) {
    const u = -0.55 + rand() * 0.55;
    const mouthW = 0.20 + rand() * 0.12;
    const mouthH = 0.07 + rand() * 0.05;
    const mouth: Pt[] = [];
    for (let step = 0; step <= 9; step += 1) {
      const angle = Math.PI + (step / 9) * Math.PI;
      mouth.push({
        x: at(0.02, u + Math.cos(angle) * mouthW).x,
        y: baseY + Math.sin(angle) * h * mouthH,
      });
    }
    washFill(g, mouth, PIGMENT.muc, seed + 61, 0.42, 0);
    inkPath(g, mouth, seed + 62, { width: 0.5, alpha: 0.3, wobble: 0.25, step: 5 });
  }

  // Rubble at the foot, as a few strokes rather than a filled skirt. Filled, it read as a pale box
  // under every tower — a flat trapezoid is a plinth, and a plinth is the one thing a karst tower
  // must not appear to stand on.
  const screes = Math.round(2 * detail);
  for (let scree = 0; scree < screes; scree += 1) {
    const side = scree % 2 === 0 ? -1 : 1;
    const foot = at(0.01, side).x;
    const reach = half * (0.16 + rand() * 0.2);
    inkPath(
      g,
      [
        { x: foot - side * reach * 0.2, y: baseY - h * (0.02 + rand() * 0.03) },
        { x: foot + side * reach * 0.6, y: baseY - h * 0.008 },
        { x: foot + side * reach, y: baseY + 0.6 },
      ],
      seed + 71 + scree,
      { width: 0.55, alpha: 0.22, wobble: 0.35, step: 6 },
    );
  }

  karstGreen(g, crown, at, h, seed, rand, detail > 0.55 ? 'near' : 'mid');
}

/**
 * What grows on a tower.
 *
 * On limestone this is not scattered bushes on the wall — the wall is bare rock and nothing holds
 * on it. Growth sits in exactly three places: as a fur along the skyline where soil catches in the
 * broken cap, as clumps hanging off the *edge* of a ledge, and as a skirt of jungle drowning the
 * foot. Drawn anywhere else it reads as what it read as before: floating caps.
 */
function karstGreen(
  g: G,
  crown: Pt[],
  at: (t: number, u: number) => Pt,
  h: number,
  seed: number,
  rand: () => number,
  mode: 'mid' | 'near',
): void {
  const green = foliagePalette().evergreen;

  // ── Fur along the crown ──
  //
  // Two or three runs of it, never the whole skyline: an unbroken fringe turns the summit into
  // moss, and bare rock between the runs is what makes the runs read as growth.
  const runs = mode === 'near' ? 2 + Math.floor(rand() * 2) : 1;
  for (let run = 0; run < runs; run += 1) {
    const from = Math.floor(rand() * (crown.length - 4));
    const to = Math.min(crown.length - 1, from + 3 + Math.floor(rand() * 5));
    if (to - from < 2) {
      continue;
    }
    const segment = crown.slice(from, to + 1);
    const fur: Pt[] = segment.map((point, index) => {
      const edge = Math.sin((index / (segment.length - 1)) * Math.PI);
      return { x: point.x, y: point.y - h * (0.008 + 0.018 * edge) * (0.7 + rand() * 0.6) };
    });
    // Thin and translucent. Given real thickness and a contour of its own it stops being growth on
    // a skyline and becomes a dark green eyebrow laid across the summit.
    washFill(g, [...fur, ...[...segment].reverse()], green, seed + 300 + run, 0.34, 0.25);
    inkPath(g, fur, seed + 320 + run, { width: 0.35, alpha: 0.16, wobble: 0.5, step: 3 });
  }

  if (mode !== 'near') {
    return;
  }

  // ── Nothing on the wall ──
  //
  // There is no third place. Clumps hung on the flank — even anchored exactly on the silhouette, at
  // the shoulder, at half the size — came out as green pills stuck to the rock, because at this
  // scale a blob on a vertical face has no way to say which way it is growing. A tháp karst is bare
  // rock between its green top and its green foot, and drawing it that way is both truer and the
  // only version that has ever read.

  // ── The skirt at the foot ──
  //
  // Jungle drowns the bottom of every one of these towers, and it is also what stops the base
  // reading as a cut: a tower that ends on a ruled line ends like a stamp, and a tower that ends in
  // scrub ends like rock going into ground.
  const foot: Pt[] = [];
  const backing: Pt[] = [];
  const SKIRT = 7;
  for (let step = 0; step <= SKIRT; step += 1) {
    const u = -1.05 + (step / SKIRT) * 2.1;
    const point = at(0.01, Math.max(-1, Math.min(1, u)));
    foot.push({ x: point.x, y: point.y - h * (0.02 + Math.abs(Math.sin(step * 2.1)) * 0.035) });
    backing.push({ x: point.x, y: point.y + 1.5 });
  }
  washFill(g, [...foot, ...backing.reverse()], green, seed + 500, 0.34, 0.3);
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
    // The shaded flank, on the same upper-left light as the karst towers. A hill described only by
    // its outline is a bump; the thing that makes it ground you could walk over is that one side of
    // it is turned away from the sun.
    const shade: Pt[] = [];
    for (let step = 0; step <= 8; step += 1) {
      const t = step / 8;
      shade.push({
        x: peak.x + (peak.w * 0.5) * t,
        y: peak.y + peak.h * Math.pow(t, 1.35),
      });
    }
    const shadeBack: Pt[] = [];
    for (let index = shade.length - 1; index >= 0; index -= 1) {
      const point = shade[index];
      shadeBack.push({ x: point.x - peak.w * 0.16, y: Math.min(baseY, point.y + peak.h * 0.06) });
    }
    washFill(g, [...shade, ...shadeBack], PIGMENT.diepDeep, seed + Math.round(peak.x) + 5, 0.34);

    // The ridgeline falling off the summit, at a weight that reads.
    inkPath(
      g,
      [
        { x: peak.x, y: peak.y + 2 },
        { x: peak.x - peak.w * 0.1 - rand() * 4, y: peak.y + peak.h * 0.45 },
        { x: peak.x - peak.w * 0.15 - rand() * 6, y: peak.y + peak.h * 0.8 },
      ],
      seed + Math.round(peak.x), { width: 0.7, alpha: 0.4, wobble: 0.4, step: 8 },
    );
  }
}

/** How often each form is rolled. Loaf and cliff are the body of a range; a fang is the accent. */
const KARST_MIX: ReadonlyArray<readonly [KarstKind, number]> = [
  ['cliff', 3.0], ['loaf', 2.2], ['anvil', 1.9], ['saddle', 1.7], ['fang', 1.6],
];

function rollKarstKind(roll: number): KarstKind {
  const total = KARST_MIX.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = roll * total;
  for (const [kind, weight] of KARST_MIX) {
    cursor -= weight;
    if (cursor <= 0) {
      return kind;
    }
  }
  return 'loaf';
}

/**
 * What each rank of the range is: how far behind the front it stands, how tall, how far apart.
 *
 * The baseline climbs as the rank recedes, which is the whole of perspective on a flat sheet, and
 * the far rank is deliberately *taller* and thinner — distance in an ink landscape is drawn as
 * higher, paler and steeper, never as smaller.
 */
const KARST_RANKS: ReadonlyArray<{
  plane: KarstPlane;
  lift: number;
  height: readonly [number, number];
  /**
   * Exponent on the height roll. Above 1 the rank runs mostly short with the odd tall one, which is
   * what a karst field does and what stops a rank topping out along one line — the picket the front
   * rank kept coming back to even after its silhouettes were right.
   */
  bias: number;
  gap: readonly [number, number];
  overhang: number;
}> = [
  { plane: 'haze', lift: 0.42, height: [0.62, 1.30], bias: 0.80, gap: [0.82, 1.20], overhang: 0.16 },
  { plane: 'mid', lift: 0.20, height: [0.50, 1.05], bias: 0.95, gap: [0.70, 1.10], overhang: 0.09 },
  { plane: 'near', lift: -0.04, height: [0.28, 1.15], bias: 1.35, gap: [0.54, 0.96], overhang: 0.05 },
];

/**
 * A range: three ranks of towers standing at receding tones, the near one overlapping the far.
 *
 * `flat` collapses it to a single inked rank — for callers that already own the depth around it and
 * only want the rock.
 */
export function karstRange(
  g: G,
  x0: number,
  x1: number,
  baseY: number,
  height: number,
  seed: number,
  flat = false,
): void {
  const ranks = flat ? KARST_RANKS.slice(2) : KARST_RANKS;

  for (const [rankIndex, rank] of ranks.entries()) {
    // Each rank draws from its own stream, so tuning one does not replant the others.
    const rand = mulberry32(seed + rankIndex * 7919);
    const rankBase = baseY - height * rank.lift;
    // A rank that begins and ends where its neighbours do puts three towers on the same vertical
    // and stacks the range into a column. Each is spread a little wider than the last and started
    // off-phase.
    //
    // The spill is small on purpose. Run out four times as far, two ranges laid side by side — which
    // the menu does, and the map does for two massifs in adjacent rows — overlapped across a third
    // of their width, and every wash in the overlap was laid twice: a tall grey column with vertical
    // edges standing in the middle of the range.
    const from = x0 - height * rank.overhang - rand() * height * 0.12;
    const to = x1 + height * rank.overhang;

    const towers: Array<{ x: number; w: number; h: number; drop: number; kind: KarstKind }> = [];
    let x = from;
    while (x < to) {
      // Height first, then a width the FORM asks for. Rolling both freely is what produced towers
      // wider than they were tall, and a squat karst is a boulder.
      const kind = rollKarstKind(rand());
      const [aspectLo, aspectHi] = KARST_FORMS[kind].aspect;
      const h = height * (rank.height[0] + Math.pow(rand(), rank.bias) * (rank.height[1] - rank.height[0]));
      const w = h / (aspectLo + rand() * (aspectHi - aspectLo));
      towers.push({
        x: x + w * 0.5,
        w,
        h,
        // Only the front rank staggers its feet; the ranks behind stand on their own haze line, and
        // a stepped base back there just reads as a broken horizon.
        drop: rank.plane === 'near' ? Math.pow(rand(), 0.8) * height * 0.30 : rand() * height * 0.05,
        kind,
      });
      // Overlapping on purpose: a karst field is towers standing in front of towers, and a row of
      // separated ones reads as a fence however well each one is drawn.
      x += w * (rank.gap[0] + rand() * (rank.gap[1] - rank.gap[0]));
    }

    // **Sorted by where the foot stands, not by height.** Height is not depth: sorting by it drew
    // every tall thin tower first and then buried it under the loaves in front, so each fang came
    // out as a black wire between two slabs. Which tower is nearer is decided by whose base is
    // lower down the sheet, which is also the cue the eye is already reading.
    towers.sort((a, b) => (a.drop - b.drop) || (b.h - a.h));
    const deepest = towers[towers.length - 1]?.drop ?? 1;
    towers.forEach((tower, index) => {
      karst(g, tower.x, rankBase + tower.drop, tower.w, tower.h, seed + rankIndex * 977 + index * 37, {
        plane: rank.plane,
        kind: tower.kind,
        // Within the rank too, contour and shadow fall off with distance. Without this the front
        // rank is a dozen outlines of identical weight and the eye has nothing to order them by.
        front: deepest <= 0 ? 1 : 0.35 + 0.65 * (tower.drop / deepest),
      });
    });

    // ── The haze the next rank stands in front of ──
    //
    // Karst basins are read through standing morning mist, and drawing it is not decoration: it is
    // what dissolves the feet of the rank behind so the rank in front can stand clear of them.
    // Without it every tower in the picture ends on the same ruled line and the whole range flattens
    // into one plane again.
    if (rank.plane !== 'near') {
      // A lozenge, not a band. Drawn as a rectangle the veil ends on two hard vertical edges, and
      // where a caller lays two ranges side by side — which the menu does, and the map does for
      // every row of a massif — those edges land next to each other as a visible seam of paper
      // straight down the picture. Tapering the top edge into the bottom one at both ends means the
      // veil has no edge to see.
      const veil: Pt[] = [];
      const back: Pt[] = [];
      const STEPS = 16;
      const floor = rankBase + height * 0.3;
      for (let step = 0; step <= STEPS; step += 1) {
        const u = step / STEPS;
        const taper = Math.min(1, Math.sin(u * Math.PI) * 3.2);
        veil.push({
          x: from + (to - from) * u,
          y: floor - (floor - (rankBase - height * (0.16 + Math.sin(u * 5.4 + rankIndex) * 0.05))) * taper,
        });
        back.push({ x: from + (to - from) * u, y: floor });
      }
      washFill(
        g,
        [...veil, ...back.reverse()],
        PIGMENT.diep,
        seed + 4400 + rankIndex,
        rank.plane === 'haze' ? 0.58 : 0.42,
        0.5,
      );
    }
  }
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
  const s = unitScale('buffalo', scale);
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

  // Start the legs high inside the body and leave a long, clean section below the belly. The old
  // geometry exposed only three design units between belly and hoof, so four legs became stubs.
  leg(-9, -11, -9 - 2.2 * step, -5.1, -9 - 3.2 * step, -0.9, false);
  leg(10, -11.2, 10 + 2.2 * step, -5.3, 10 + 3.2 * step, -0.9, false);

  printedShape(
    g,
    [
      { x: x - 16 * s, y: y - 12.5 * s }, { x: x - 14.5 * s, y: y - 17.5 * s }, { x: x - 11 * s, y: y - 19.6 * s },
      { x: x - 5 * s, y: y - 18.2 * s }, { x: x + 3 * s, y: y - 18.6 * s }, { x: x + 11 * s, y: y - 18 * s },
      { x: x + 16 * s, y: y - 15 * s }, { x: x + 17.5 * s, y: y - 11 * s }, { x: x + 15 * s, y: y - 8.2 * s },
      { x: x + 7 * s, y: y - 7 * s }, { x: x - 3 * s, y: y - 6.8 * s }, { x: x - 11 * s, y: y - 8.2 * s },
    ],
    PIGMENT.hide, seed, { width: 1.15 * s, alpha: 0.9, wobble: 0.14 * s, step: 5, fillAlpha: 0.95 },
  );
  washFill(
    g,
    [
      { x: x - 10 * s, y: y - 8.5 * s }, { x: x - 2 * s, y: y - 7.3 * s }, { x: x + 8 * s, y: y - 7.4 * s },
      { x: x + 13 * s, y: y - 9.1 * s }, { x: x + 7 * s, y: y - 10.1 * s }, { x: x - 4 * s, y: y - 10 * s },
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
    // One compact crescent from the crown to just over the shoulder. The previous endpoint was
    // nearly a full body-third behind the head, which made the horn longer than the animal's legs.
    const p0 = { x: x - 22 * s, y: y + (-22.4 - lift) * s };
    const p1 = { x: x + (-19 + back) * s, y: y + (-27.2 - lift) * s };
    const p2 = { x: x + (-13.2 + back) * s, y: y + (-26.4 - lift) * s };
    for (let index = 0; index <= 14; index += 1) {
      const t = index / 14;
      const u = 1 - t;
      points.push({
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      });
    }
    return thickPath(points, points.map((_, index) => (2.25 - (index / 14) * 1.85) * s * wide));
  };
  printedShape(g, hornArc(1.3, 0.8, 0.88), PIGMENT.hideLo, seed + 10, {
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

  leg(-11, -10.5, -11 + 2.3 * step, -4.8, -11 + 3.5 * step, -0.8, true);
  leg(12, -10.8, 12 - 2.3 * step, -5.1, 12 - 3.5 * step, -0.8, true);

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

  // The boy is one readable body with two straddling legs. The old rider was a red bar, one leg
  // and a diamond around the head; at resting zoom those unrelated shapes did not resolve as a
  // single person.
  const bx = x + 1.5 * s;
  const by = y - 19.2 * s;
  inkPath(g, [{ x: bx + 1.2 * s, y: by }, { x: bx + 3.2 * s, y: by + 4.8 * s }, { x: bx + 3.5 * s, y: by + 7.2 * s }], seed + 31, {
    width: 1.15 * s, alpha: 0.58, colour: PIGMENT.mucSoft, wobble: 0.06 * s, step: 4,
  });
  inkPath(g, [{ x: bx - 1.2 * s, y: by }, { x: bx - 2.8 * s, y: by + 4.8 * s }, { x: bx - 2.1 * s, y: by + 7.4 * s }], seed + 32, {
    width: 1.3 * s, alpha: 0.86, colour: PIGMENT.muc, wobble: 0.06 * s, step: 4,
  });
  printedShape(g, [
    { x: bx - 2.4 * s, y: by - 0.2 * s }, { x: bx - 1.8 * s, y: by - 6.7 * s },
    { x: bx + 1.8 * s, y: by - 6.7 * s }, { x: bx + 2.4 * s, y: by - 0.2 * s },
  ], PIGMENT.son, seed + 33, {
    width: 0.6 * s, alpha: 0.84, wobble: 0.05 * s, step: 3, fillAlpha: 0.95,
  });
  g.fillStyle(PIGMENT.hoePale, 0.98);
  g.fillCircle(bx, by - 9.3 * s, 2.05 * s);
  g.fillStyle(PIGMENT.muc, 0.9);
  g.fillEllipse(bx - 0.25 * s, by - 10.5 * s, 4.1 * s, 1.7 * s);
  g.fillCircle(bx + 0.65 * s, by - 11.7 * s, 0.75 * s);
  g.fillCircle(bx - 1.4 * s, by - 9.2 * s, 0.38 * s);

  // Flute crosses the mouth; each forearm visibly joins shoulder to instrument.
  inkPath(g, [{ x: bx - 5.5 * s, y: by - 8.8 * s }, { x: bx + 4.2 * s, y: by - 9.7 * s }], seed + 36, {
    width: 0.85 * s, alpha: 0.9, colour: PIGMENT.nau, wobble: 0,
  });
  inkPath(g, [{ x: bx - 1.5 * s, y: by - 5.8 * s }, { x: bx - 3.9 * s, y: by - 8.7 * s }], seed + 37, {
    width: 0.75 * s, alpha: 0.88, colour: PIGMENT.nauDark, wobble: 0.04 * s, step: 3,
  });
  inkPath(g, [{ x: bx + 1.5 * s, y: by - 5.8 * s }, { x: bx + 2.5 * s, y: by - 9.5 * s }], seed + 38, {
    width: 0.75 * s, alpha: 0.88, colour: PIGMENT.nauDark, wobble: 0.04 * s, step: 3,
  });

  // and the lotus leaf held over him — the stem reaches his hand
  inkPath(
    g,
    [{ x: bx + 2.5 * s, y: by - 9.5 * s }, { x: bx + 4.4 * s, y: by - 13.5 * s }, { x: bx + 4.8 * s, y: by - 17.2 * s }],
    seed + 39, { width: 0.7 * s, alpha: 0.8, colour: PIGMENT.giDong, wobble: 0.08 * s, step: 4 },
  );
  const shade: Pt[] = [];
  for (let index = 0; index <= 20; index += 1) {
    const t = index / 20;
    const angle = Math.PI + t * Math.PI;
    const rr = 7.4 * s * (1 + 0.08 * Math.cos(t * Math.PI * 2 * 7));
    shade.push({ x: bx + 4.8 * s + Math.cos(angle) * rr, y: by - 17.7 * s + Math.sin(angle) * rr * 0.4 });
  }
  printedShape(g, shade, PIGMENT.giDong, seed + 41, { width: 0.7 * s, alpha: 0.75, wobble: 0.1 * s, step: 4, fillAlpha: 0.88 });
  for (let vein = 0; vein < 5; vein += 1) {
    const angle = 3.36 + vein * 0.61;
    inkPath(
      g,
      [
        { x: bx + 4.8 * s, y: by - 17.7 * s },
        { x: bx + 4.8 * s + Math.cos(angle) * 6.6 * s, y: by - 17.7 * s + Math.sin(angle) * 2.8 * s },
      ],
      seed + 43 + vein, { width: 0.45 * s, alpha: 0.35, wobble: 0.06 * s, step: 3 },
    );
  }
}
