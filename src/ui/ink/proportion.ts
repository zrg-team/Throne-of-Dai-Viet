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
 * | grassTuft |   6.0 | a tuft of grass           |0.9 | 0.465 |   2.0 px        |
 * | buffalo   |  28.6 | a trâu at the shoulder    |1.5 | 0.293 |   6.0 px        |
 * | figure    |   6.2 | a soldier                 |1.7 | 0.850 |   6.8 px        |
 * | farmer    |  15.3 | a farmer                  |1.7 | 0.344 |   6.8 px        |
 * | hayStack  |  26.0 | a cây rơm                 |3   | 0.358 |   6.7 px        |
 * | banana    |  18.6 | a chuối                   |4   | 0.667 |   8.9 px        |
 * | house     |  18.4 | a nhà tranh ridge         |5   | 0.842 |  11.2 px        |
 * | tree      |  17.3 | a village tree            |8   | 1.434 |  17.9 px        |
 * | bamboo    |  44.6 | a lũy tre hedge           |8   | 0.556 |  17.9 px        |
 * | dinh      |  29.7 | an đình                   |8   | 0.835 |  17.9 px        |
 * | areca     |  34.1 | a cau                     |10  | 0.909 |  22.3 px        |
 * | banyan    |  33.3 | a cây đa                  |14  | 1.303 |  31.2 px        |
 * | thap      |  49.4 | a tháp                    |16  | 1.004 |  35.7 px        |
 *
 * ## Why it kept going wrong
 *
 * Three separate faults, each of which hid the others:
 *
 * 1. **The drawn heights were guessed, not measured.** The previous table claimed bamboo was 31
 *    when it is 44.6, buffalo 20 when it is 28.6, house 15.5 when it is 18.4. Every correction
 *    built on those numbers was wrong by the same margin — which is why a lũy tre came out half
 *    again the height of the tree beside it and read as three times.
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
 */
const LIVING = 1.8;

/**
 * Per-prop corrections from the measurements above: `PX_PER_M / (drawn height ÷ real height)`.
 *
 * A prop multiplies its incoming `s` by its own entry. Callers never touch these.
 */
export const UNIT = {
  // ── Buildings ──
  house: 0.842,
  dinh: 0.835,
  thap: 1.004,
  hayStack: 0.358,
  // ── Plants ──
  tree: 1.434,
  bamboo: 0.556,
  banana: 0.667,
  areca: 0.909,
  // Re-measured with `_measure-props.mjs` when the đa was redrawn as an actual banyan: 33.3 at
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
  grassTuft: 0.465,
  // ── Living things ──
  // People carry one exaggeration between them, so the farmer in the paddy and the soldier in the
  // rank are the same height, and both stand lower than a roof.
  figure: 0.85 * LIVING,
  farmer: 0.344 * LIVING,
  // A trâu is 1.5 m at the shoulder against a man's 1.7, so at the same exaggeration it lands just
  // under him — which is where it belongs, and nowhere near over him.
  buffalo: 0.163 * LIVING,
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
  tree: 8, bamboo: 8, banana: 4, areca: 10, banyan: 14,
  grassTuft: 0.9, figure: 1.7, farmer: 1.7, buffalo: 1.5,
};

/** Drawn height at `s = 1`, measured off each prop by `_measure-props.mjs`, not estimated. */
const DRAWN: Record<keyof typeof UNIT, number> = {
  house: 18.4, dinh: 29.7, thap: 49.4, hayStack: 26,
  tree: 17.3, bamboo: 44.6, banana: 18.6, areca: 34.1, banyan: 33.3,
  grassTuft: 6, figure: 6.2, farmer: 15.3, buffalo: 28.6,
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
