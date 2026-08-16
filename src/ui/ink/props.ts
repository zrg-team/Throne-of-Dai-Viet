import Phaser from 'phaser';
import { PIGMENT, shadePigment } from './palette';
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

  // Vertical fissures down the rock face.
  for (let fissure = 0; fissure < 4; fissure += 1) {
    const t = 0.2 + fissure * 0.2;
    const sx = x - half * 0.62 + w * 0.55 * t;
    const top = baseY - h * (0.68 + rand() * 0.2);
    inkPath(g, [{ x: sx, y: top }, { x: sx + (rand() - 0.5) * 2.5, y: top + h * (0.34 + rand() * 0.3) }], seed + 20 + fissure, {
      width: 0.6, alpha: 0.26, wobble: 0.3, step: 9,
    });
  }
  // No scrub on the crown. The three tufts that used to sit up there read as a pair of
  // green spectacles on every summit, and forty of them across the horizon is the first
  // thing the eye finds. The rock carries itself.
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
