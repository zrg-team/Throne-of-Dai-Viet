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
 * | farmer   | 12           | a man, 1.7 m      | 7.1              |
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
  hayStack: 0.55,
  /**
   * Grass, exaggerated — for the same reason people are, and more so.
   *
   * Real grass is ankle high, so at 3.1 px to the metre a true-scale tuft is about one design
   * pixel: not grass, not even a speck. Drawn honestly it left `plains` — half the map — reading
   * as bare paper next to the paddy, which is the whole complaint this correction answers.
   *
   * Grass is also the one entry here that is not really an object. It is a *texture* standing for
   * open ground, the way a woodcut shows a meadow with a handful of marks rather than by drawing
   * blades to scale, so it is the entry that can afford to lie about its size.
   */
  grassTuft: 1.6,
  // Living things, all carrying the same exaggeration.
  figure: LIVING,
  farmer: 0.44 * LIVING,
  // A buffalo takes a gentler exaggeration than a person. It is nearly three metres long, so at
  // the full living factor it reads as five, and a herd next to a nine-metre house looked like
  // livestock drawn to a different map.
  buffalo: 0.23 * 1.4,
};

/**
 * The world scale a hex of the given size implies.
 *
 * The landscape scatter has always derived its sizes from the tile, which is the one number that
 * says how much ground a screen pixel covers. Everything else on the map now asks the same
 * question the same way instead of carrying its own hand-tuned multiplier.
 */
export function worldScale(tileSize: number): number {
  return tileSize / 24;
}
