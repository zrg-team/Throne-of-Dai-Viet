/**
 * One scale for everything drawn on the ground.
 *
 * Each prop in this folder was drawn on its own, to look right on its own, and nothing ever
 * compared them. Measured at `s = 1` they came out like this:
 *
 * | prop     | drawn height | what it is        | pixels per metre |
 * |----------|--------------|-------------------|------------------|
 * | figure   | 5.3          | a man, 1.7 m      | 3.1              |
 * | house    | 15.5         | a ridge, 5 m      | 3.1              |
 * | tree     | 20           | a tree, 8 m       | 2.5              |
 * | bamboo   | 31           | a clump, 12 m     | 2.6              |
 * | areca    | 34           | a palm, 15 m      | 2.3              |
 * | banyan   | 31           | a cây đa, 20 m    | 1.6              |
 * | hayStack | 22           | a cây rơm, 3 m    | 7.3              |
 * | farmer   | 15.0         | a man, 1.7 m      | 8.8              |
 * | buffalo  | 20           | a trâu, 1.5 m     | 13.3             |
 *
 * So a farmer stood twice the height of a soldier and a buffalo four times, while houses came out
 * at half the scale of the people walking past them. On the map that reads as a toy set rather
 * than a country: nothing tells you how big anything is, because nothing agrees.
 *
 * The soldier and the house already agreed, at 3.1, so that is the rate the world keeps. Every
 * other prop takes a correction to meet it, applied inside the prop itself so that a caller's `s`
 * means the same thing everywhere: **`s = 1` draws a thing at its real size, 3.1 px to the metre.**
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
  house: 1,
  tree: 1.24,
  bamboo: 1.19,
  areca: 1.35,
  banyan: 1.94,
  // A cây rơm is about three metres. This was 0.55 against a true correction of 0.42, which left
  // haystacks the one object on the map standing a third over the rate everything else keeps.
  hayStack: 0.42,
  /**
   * Grass, exaggerated — for the same reason people are, but *less* than a person, not more.
   *
   * Real grass is ankle high, so at 3.1 px to the metre a true-scale tuft is about one design
   * pixel: not grass, not even a speck. Drawn that honestly it left `plains` — 44% of the map —
   * reading as bare paper next to the paddy. The correction that answered *that* went to 1.6 and
   * overshot badly: a mean tuft came out 8.5 px against a mean farmer's 8.9, so the country was
   * knee-deep in grass that stood as tall as the people walking through it, and the tallest tufts
   * beat the tallest farmers outright.
   *
   * The lesson is that coverage is a question of **how many**, not how big. This is roughly waist
   * height on the exaggerated scale — still a lie, deliberately, because grass is the one entry
   * here that is not an object but a *texture* standing for open ground, the way a woodcut shows a
   * meadow with a handful of marks. The blank paper it was raised to fix is now answered by
   * `SCATTER.plains` carrying twice the tufts instead.
   */
  grassTuft: 0.62,
  // Living things, all carrying the same exaggeration.
  figure: LIVING,
  // Fitted to `farmer()`'s real drawn height. The old 0.44 was fitted to a measured 12, but the
  // figure has since grown to 15.0 — so the farmer stood 13-26% taller than the soldier at the same
  // caller scale, which is exactly what the header above promises never happens.
  farmer: 0.35 * LIVING,
  // A buffalo takes a gentler exaggeration than a person. It is nearly three metres long, so at
  // the full living factor it reads as five, and a herd next to a nine-metre house looked like
  // livestock drawn to a different map.
  //
  // Raised from `0.185 * 1.4` once every call site was put on one scale. That value was tuned when
  // the herd was drawn at a caller scale of 1.0–1.15 while the soldiers beside them were at 0.6 —
  // it was carrying the correction for a gap that no longer exists, and at the shared rate it left
  // a water buffalo standing half the height of the man leading it. A trâu is 1.5 m at the
  // shoulder against a man's 1.7, so it belongs just under him and nowhere near over him.
  buffalo: 0.298 * 1.4,
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
