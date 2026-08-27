/**
 * One scale for everything drawn on the ground.
 *
 * ## The table
 *
 * Every prop was drawn on its own, to look right on its own, and nothing compared them. This is
 * the whole cast, **measured** rather than estimated — `DRAWN` comes from running each prop at
 * `s = 1` and recording the extent of every coordinate it emits, and `metres` is what the thing
 * actually is. The correction each one carries is simply `PX_PER_M × metres ÷ drawn`.
 *
 * | prop      | drawn | is                        | m  | UNIT  | at GROUND_SCALE |
 * |-----------|-------|---------------------------|----|-------|-----------------|
 * | grassTuft |   5.6 | a tuft of grass           |0.9 | 0.498 |   2.0 px        |
 * | buffalo   |  30.1 | a trâu at the shoulder    |1.5 | 0.332 |   7.2 px        |
 * | figure    |   6.7 | a soldier                 |1.7 | 0.786 |   6.8 px        |
 * | farmer    |  16.2 | a farmer                  |1.7 | 0.325 |   8.2 px        |
 * | hayStack  |  27.0 | a cây rơm                 |3   | 0.344 |   6.7 px        |
 * | gieng     |   6.9 | a giếng làng              |1.26| 0.566 |   2.8 px        |
 * | boThoc    |  12.3 | a bồ thóc                 |2   | 0.504 |   4.5 px        |
 * | chuongTrau|  11.1 | a chuồng trâu             |2.8 | 0.782 |   6.2 px        |
 * | bep       |  12.0 | a bếp                     |3.2 | 0.827 |   7.1 px        |
 * | banana    |  19.4 | a chuối                   |4   | 0.639 |   8.9 px        |
 * | house     |  19.3 | a nhà tranh ridge         |5   | 0.803 |  11.2 px        |
 * | tree      |  15.4 | a village tree            |8   | 1.610 |  17.9 px        |
 * | bamboo    |  46.2 | a lũy tre hedge           |8   | 0.537 |  17.9 px        |
 * | dinh      |  30.4 | an đình                   |8   | 0.816 |  17.9 px        |
 * | areca     |  39.8 | a cau                     |10  | 0.779 |  22.3 px        |
 * | banyan    |  33.3 | a cây đa                  |14  | 1.303 |  31.2 px        |
 * | thap      |  50.4 | a tháp                    |16  | 0.984 |  35.7 px        |
 *
 * ## Re-measured, and why the table drifted
 *
 * `diag/measure-props.mjs` re-run against today's geometry: **every** `DRAWN` figure above had
 * moved since it was last written down, because a prop's extents change whenever anyone touches
 * its outline and nothing re-derived the correction. Two had drifted far enough to see:
 *
 *  · **tree** was drawn 15.4 against a recorded 17.3, so `UNIT` was 11% low and a village tree came
 *    out **shorter than the lũy tre beside it** — both are declared 8 m, and the bamboo stood 16%
 *    over the tree. This is the one people notice.
 *  · **areca** was drawn 39.8 against a recorded 34.1, so a cau stood 17% **over** its ten metres
 *    and out-topped the đình it stands beside.
 *
 * The rest were within 6%. All of them are reconciled here rather than only the two that showed,
 * because a half-corrected table is how this drifts again.
 *
 * ## Why it kept going wrong
 *
 * Three separate faults, each of which hid the others:
 *
 * 1. **The drawn heights were guessed, not measured.** An older table claimed bamboo was 31 and
 *    house 15.5, against the mid-forties and the high teens they actually draw at. Every correction
 *    built on those numbers was wrong by the same margin — which is why a lũy tre came out half
 *    again the height of the tree beside it and read as three times. The lesson is the one above:
 *    re-run the measurement whenever a prop's outline moves, and reconcile the **whole** table.
 * 2. **The real heights were specimen heights.** Bamboo at 12 m, cau at 15 m, cây đa at 20 m are
 *    true of a mature grove in the wild and false of what stands in a village. A hedge is kept at
 *    about the height of the trees it grows beside, and it now is.
 * 3. **Three props had no correction at all** — `banana`, `dinh` and `thap` were drawn at raw size
 *    and nobody noticed, because nothing measured them.
 *
 * `s = 1` draws a thing at its real size, `PX_PER_M` to the metre. `GROUND_SCALE` is the one
 * caller scale the map is drawn at, and `verify-ground-scale.mjs` measures a real map and fails if
 * anything disagrees — including if two plants drift apart from each other, which is the check the
 * numbers above would have needed to be caught by eye.
 */

/** Design pixels to the metre at world scale 1. Set by the soldier and the roof, which agreed. */
export const PX_PER_M = 3.1;

/**
 * How much bigger than life people and livestock are drawn.
 *
 * At 3.1 px to the metre a man is five pixels, which on a map at rest is not a man, it is a speck.
 * Đông Hồ prints exaggerate people for the same reason. What matters is that the exaggeration is
 * one number applied to every human on the map — the farmer in the paddy and the soldier in the
 * rank are the same height, and both still stand lower than a roof.
 *
 * **1.8 was still not enough.** Measured on the map at `GROUND_SCALE`, everything lands at
 * 2.23 px to the metre and living things at 4.02, which made a soldier **6.8 px tall and 3.2 px
 * wide** — the narrowest thing on the sheet, against a buffalo 10.8 px across and a house 22. A
 * host read as a smudge under its own standard whatever the spacing.
 *
 * At 2.15 a soldier is 8.2 px and still stands well under a roof, and the farmer and the buffalo
 * grow with him, which is the only property that matters: the exaggeration is one number, applied
 * to every living thing, and nothing on the map is drawn to a different rule because of it.
 *
 * 2.15 and not more: `verify-ground-scale` bands the living-to-object ratio at 1.4–2.2, which is
 * the line between an exaggeration and a cartoon. 2.4 was tried and it broke that band at 2.40x —
 * a man three-quarters the height of a five-metre house is a different drawing, not a bigger one.
 * Raising the ceiling is a design decision and belongs in the harness, deliberately, not here.
 */
const LIVING = 2.15;

/**
 * Per-prop corrections from the measurements above: `PX_PER_M / (drawn height ÷ real height)`.
 *
 * A prop multiplies its incoming `s` by its own entry. Callers never touch these.
 */
export const UNIT = {
  // ── Buildings ──
  house: 0.803,
  dinh: 0.816,
  thap: 0.984,
  hayStack: 0.344,
  // ── The rest of a làng. A village is not four copies of one roof: the kitchen stands off the
  // main house because of the cooking fire, the trâu has a byre, the rice has a bin, and the
  // water has a well. Provisional until `diag/measure-props.mjs` reports them; reconciled below.
  bep: 0.827,
  chuongTrau: 0.782,
  boThoc: 0.504,
  gieng: 0.566,
  // ── Plants ──
  // 1.610, not 1.434: re-measured at 15.4 drawn against the 17.3 the table used to claim, which
  // is why a village tree stood 11% short of its own eight metres and the lũy tre beside it — the
  // same declared height — came out 16% taller.
  tree: 1.610,
  bamboo: 0.537,
  banana: 0.639,
  // 0.779, not 0.909: measured at 39.8 drawn against a recorded 34.1, so a cau was standing
  // 11.7 m and out-topping the đình.
  areca: 0.779,
  // Re-measured with `diag/measure-props.mjs` when the đa was redrawn as an actual banyan: 33.3 at
  // `s = 1` against the old stamp's 30.8, because it grew a bole, a fringe of aerial root and two
  // pillars down to the ground. The correction comes down to match, so it still stands fourteen
  // metres and still lands at 31.2 px beside everything else.
  banyan: 1.303,
  /**
   * Grass keeps a nominal 0.9 m and takes **no** exaggeration.
   *
   * It is the one entry here that is not an object but a *texture* standing for open ground, the
   * way a woodcut shows a meadow with a handful of marks — so its metre figure is a judgement, not
   * a measurement. Twice now it has been raised to fix "plains read as bare paper" and twice that
   * put the country knee-deep in grass standing as tall as the people walking through it. Coverage
   * is a question of **how many**, not how big; `SCATTER.plains` carries the count instead.
   */
  grassTuft: 0.498,
  // ── Living things ──
  // People carry one exaggeration between them, so the farmer in the paddy and the soldier in the
  // rank are the same height, and both stand lower than a roof.
  // Re-measured twice, both times with `diag/measure-figure.mjs` and never by eye — the table's own
  // header records what happened the last time these were guessed. The wardrobe's crowns took it
  // from 6.2 to 6.6; rebuilding the figure to the document's geometry took it to 6.7, the tallest
  // being a Lý royal guard with a levy's billhook.
  //
  // A **mounted** figure is deliberately not in this table. It measures 7.48 tall and 4.91 wide
  // against a swordsman's 5.92 and 3.17 — a ratio of 1.26, which is exactly a rider at 2.4 m
  // against a man at 1.9 m with his blade up. The pony is drawn inside `figure()`'s own coordinate
  // system, so it inherits this correction and comes out at the right height by construction;
  // giving it a row of its own would apply the correction twice.
  figure: 0.786 * LIVING,
  farmer: 0.325 * LIVING,
  // A trâu is 1.5 m at the shoulder against a man's 1.7, so at the same exaggeration it lands just
  // under him — which is where it belongs, and nowhere near over him.
  buffalo: 0.154 * LIVING,
};

/**
 * The one caller scale every ground prop is drawn at.
 *
 * `UNIT` above is defined as `PX_PER_M / (drawn height ÷ real height)`, which means the algebra
 * collapses to something very simple:
 *
 *     px per metre = callerScale × PX_PER_M            (objects)
 *     px per metre = callerScale × PX_PER_M × LIVING   (people and livestock)
 *
 * So **the corrections in `UNIT` only equalise the props if every call site passes the same
 * caller scale.** They never did. Measured across the two renderers, the same table came out at
 * anything from 1.4 to 5.8 px per metre — a four-fold disagreement — because each site had been
 * tuned by eye against its own neighbours and nothing compared them:
 *
 * | call site               | caller scale | vs the soldier |
 * |-------------------------|--------------|----------------|
 * | scatter tree            | 0.90 – 1.87  | 1.5× – 3.1×    |
 * | crop-patch farmer       | 0.85         | 1.4×           |
 * | village buffalo         | 0.80 – 1.15  | 1.3× – 1.9×    |
 * | village house           | 0.64 – 0.92  | 1.1× – 1.5×    |
 * | hamlet house            | 0.47 – 0.63  | ≈ 1            |
 * | host figure             | 0.60         | —              |
 *
 * Which is why a buffalo out-stood a soldier, a farmer out-stood both, and a forest tree stood
 * three times what the same tree stood beside a village.
 *
 * The value is the median of what the map already drew, so this equalises the world without
 * rescaling it wholesale: most props move a little, the outliers move a lot, and the country ends
 * up at one rate. Per-instance jitter still varies a *little* around this — a wood of identical
 * trees is its own kind of wrong — but the jitter is variety, not a second scale.
 */
export const GROUND_SCALE = 0.72;

/**
 * The tile size the world was tuned at: `hexSize` 18 × `MAP_SCALE` 1.72.
 *
 * `worldScale` is written against this so that a change to either one moves the whole map
 * together rather than pulling the scatter away from everything else, which is the fault this
 * file exists to prevent.
 */
const REFERENCE_TILE = 30.96;

/**
 * The caller scale a hex of the given size implies.
 *
 * Every ground prop in both renderers now asks this the same way, instead of the scatter deriving
 * its own `tileSize / 24` while the settlements, the herds and the hosts carried hand-tuned
 * constants that answered to nothing.
 */
export function worldScale(tileSize: number): number {
  return GROUND_SCALE * (tileSize / REFERENCE_TILE);
}

/** What a probe is told about one prop being drawn. */
export interface PropScaleSample {
  prop: keyof typeof UNIT;
  /** The scale the call site passed. This is the number that has to agree everywhere. */
  caller: number;
  /** Metres of real-world height the prop stands, from the table at the top of this file. */
  metres: number;
  /** Drawn pixel height, and the rate it works out to. */
  px: number;
  pxPerMetre: number;
  /**
   * True when this draw was rasterising a texture rather than placing something on the map.
   *
   * A baked prop is drawn once at a canonical size into a texture, and every copy is then sized by
   * `propImage`'s own scale — so the caller scale here is the texture's, not any animal's, and
   * measuring it as a placement reports a herd that disagrees with itself when it does not.
   */
  raster: boolean;
}

/** Real height of each prop, so a sample can be expressed as a rate rather than a raw size. */
const METRES: Record<keyof typeof UNIT, number> = {
  house: 5, dinh: 8, thap: 16, hayStack: 3,
  bep: 3.2, chuongTrau: 2.8, boThoc: 2.0,
  /**
   * 1.26, and the number is chosen for the WIDTH.
   *
   * This table governs height only, and a well is the one thing on the map where that is the wrong
   * axis: its rim stands about 0.9 m, which at map scale is two pixels and nothing at all. What
   * identifies a well from the map's viewpoint is the ring and the dark shaft inside it — the
   * across-measure. The drawing runs 1.9 wide to 1 tall, so declaring 1.26 m puts it at the 2.4 m
   * across a giếng làng actually is, and its 0.9 m rim then falls out correctly underneath.
   *
   * If a width column is ever added here, this is the entry that should move to it.
   */
  gieng: 1.26,
  tree: 8, bamboo: 8, banana: 4, areca: 10, banyan: 14,
  grassTuft: 0.9, figure: 1.7, farmer: 1.7, buffalo: 1.5,
};

/** Drawn height at `s = 1`, measured off each prop by `diag/measure-props.mjs`, not estimated. */
const DRAWN: Record<keyof typeof UNIT, number> = {
  house: 19.3, dinh: 30.4, thap: 50.4, hayStack: 27,
  bep: 12, chuongTrau: 11.1, boThoc: 12.3, gieng: 6.9,
  tree: 15.4, bamboo: 46.2, banana: 19.4, areca: 39.8, banyan: 33.3,
  grassTuft: 5.6, figure: 6.7, farmer: 16.2, buffalo: 30.1,
};

/**
 * The probe lives on `globalThis`, not in a module variable, and that is not incidental.
 *
 * Under Vite's dev server an edited module is re-served at a versioned URL, so a test that imports
 * `proportion.ts` by plain path can get a *different instance* from the one `props.ts` is holding —
 * it installs its probe on one copy while every prop on the map reports to the other, and the
 * harness reports an empty map with no error. Anchoring the hook to the global makes module
 * identity irrelevant.
 */
const PROBE_KEY = '__propScaleProbe';
const PROBE_HOST = globalThis as Record<string, unknown>;

let rasterFactor = 1;

/**
 * Runs `draw` while telling the probe that its geometry is being rasterised, not displayed.
 *
 * `bakeProp` draws a prop several times life size into a texture and then stamps that texture back
 * at `1 / RASTER`, so the scale it passes is not the size anything ends up. Without this the probe
 * reports a baked buffalo at 2.0 and calls the herd inconsistent when it is the only part of the
 * map that was right.
 */
export function whileRasterising<T>(factor: number, draw: () => T): T {
  const previous = rasterFactor;
  rasterFactor = factor;
  try {
    return draw();
  } finally {
    rasterFactor = previous;
  }
}

/**
 * Watches every prop drawn anywhere on the map.
 *
 * This exists because the fault this file describes came back twice, and both times it came back
 * through a call site nobody had found — a cart on a road, a glyph on a building, a traveller.
 * Grepping for the fault does not work: there are forty-odd call sites across four files and any
 * one of them can quietly disagree. So the map is measured instead of read, by
 * `verify-ground-scale.mjs`, which installs a probe here and fails if anything on the ground is
 * drawn outside the agreed band.
 *
 * Costs one undefined check per prop when no probe is installed, which is every real run.
 */
export function setPropScaleProbe(fn: ((sample: PropScaleSample) => void) | undefined): void {
  PROBE_HOST[PROBE_KEY] = fn;
}

/**
 * Applies a prop's own correction to the scale its caller asked for.
 *
 * Every prop goes through this rather than writing `scale * UNIT.x` inline, so that there is one
 * place where the correction is applied and one place the probe can watch.
 */
export function unitScale(prop: keyof typeof UNIT, scale: number): number {
  const s = scale * UNIT[prop];
  const probe = PROBE_HOST[PROBE_KEY] as ((sample: PropScaleSample) => void) | undefined;
  if (probe) {
    // Reported as it will be *seen*, so a prop baked at 2× and stamped back at ½ counts once, at
    // the size it ends up.
    const shown = scale / rasterFactor;
    const px = shown * UNIT[prop] * DRAWN[prop];
    probe({
      prop, caller: shown, metres: METRES[prop], px,
      pxPerMetre: px / METRES[prop], raster: rasterFactor !== 1,
    });
  }
  return s;
}
