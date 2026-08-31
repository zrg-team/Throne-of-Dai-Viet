/**
 * Props baked to textures, and stamped as images.
 *
 * Everything in `props.ts` draws with `Graphics`: paths built from dozens of `printedShape` and
 * `inkPath` calls. That is right for scenery painted once into the map's static bake, and wrong for
 * anything that has to keep its own position — a live `Graphics` re-submits its whole command list
 * every frame, so a herd of forty animals was rebuilding several thousand path segments sixty times
 * a second to show animals that never change shape.
 *
 * Phaser's own guidance for this case is to bake: *"If your Graphics object doesn't change much once
 * you've drawn your shape to it, then you will help performance by calling `generateTexture`, which
 * will bake the Graphics object into a Texture that you can then use for Sprites."* Many copies of
 * one texture also batch into a single draw call, where alternating textures flush the batch per
 * object — which is why variants here are deliberately few and shared.
 *
 * Two things a baked prop gains besides speed:
 *  - **It can be depth-sorted.** A prop inside a shared `Graphics` is fixed in that buffer's paint
 *    order forever; an `Image` carries its own `depth`, so a scene can sort by ground line and get
 *    the order a human eye expects.
 *  - **It can be replaced by real art.** The repo already ships hero portraits as authored SVGs
 *    rasterised at load (`FaceRenderer`); a baked prop is the same shape of thing, so any of these
 *    can become a drawn file later without the callers changing.
 *
 * The bake itself now lives in `stamp.ts` — the registry that keys textures by render scale,
 * refcounts placements, and caps each pool's bytes. This file keeps the prop-shaped API on top of
 * it (`bakeProp` / `propImage`), so the forty-odd existing call sites read as they always did.
 */
import type Phaser from 'phaser';
import { placeStamp, stamp, type Stamp, type StampBox } from './stamp';
import { buffalo } from './props';
import { UNIT } from './proportion';
import { conquestArtStamp } from '../conquestMapArt';

export { BASE_SCALE_KEY } from './stamp';

type G = Phaser.GameObjects.Graphics;

/** The box a prop occupies around its anchor, in design units. */
export type PropBox = StampBox;

/**
 * A baked prop is a `Stamp`: origin fractions that put the prop's anchor back under the image's
 * position, and the scale that returns the raster to design units. (`texture`/`frame` say where
 * the pixels physically live — the stamp's own texture, or a shared atlas page.)
 */
export type BakedProp = Stamp;

/**
 * Bakes one prop into a texture, or returns the existing bake.
 *
 * `draw` receives the anchor position **already in raster pixels** and the raster factor to
 * multiply its own scale by — rather than the graphics being scaled as an object, because
 * the canvas rasteriser is handed geometry that is already the size it should end up. (The same
 * Canvas route is why nothing baked here may use `fillGradientStyle`; none of the ink helpers do.)
 *
 * Props raster at `'super'` — two texture pixels per design unit on top of the render scale,
 * because the map camera zooms up to about 2× exactly where the player leans in to look. Same
 * headroom `FaceRenderer` uses, for the same reason.
 */
export function bakeProp(
  scene: Phaser.Scene,
  key: string,
  box: PropBox,
  draw: (g: G, x: number, y: number, raster: number) => void,
): BakedProp {
  return stamp(scene, key, box, draw, { raster: 'super', pool: 'prop' });
}

/** How many different buffalo drawings exist. Kept small on purpose — see below. */
const BUFFALO_LOOKS = 4;

/**
 * The buffalo, baked at one canonical size.
 *
 * **Size is an instance scale, not part of the texture key.** A herd asks for forty animals at
 * slightly different sizes, and keying the bake on size produced fifteen textures for forty
 * animals — trading a per-frame cost for a batch flush per size, which is exactly the trap the
 * atlas guidance warns about. Scaling a raster is free on the GPU, so four drawings and a rider
 * flag cover the whole herd in eight textures however many animals there are.
 */
/**
 * How far `buffalo()`'s own coordinates reach, **before** `UNIT.buffalo` is applied — read straight
 * off the drawing: muzzle at −33.6, tail at +19.5, horn crest near −30, the rider's lotus higher
 * still. A unit of margin all round covers stroke width and ink wobble.
 */
const BUFFALO_REACH = { left: -36, right: 22, top: -36, riderTop: -45, bottom: 6 };

export type DirectionalBakedProp = BakedProp & { nativeFacing: -1 | 1 };

export function bakedBuffalo(scene: Phaser.Scene, seed: number, rider: boolean): DirectionalBakedProp {
  const look = Math.abs(Math.round(seed)) % BUFFALO_LOOKS;
  const key = `prop:buffalo:${look}:${rider ? 'r' : 'x'}`;
  // Derived from `UNIT.buffalo` rather than written out, because a `PropBox` is in **corrected**
  // units — `bakeProp` hands the draw `RASTER` as its scale, and the prop applies its own unit
  // inside. These numbers were previously the raw drawing extents copied in unchanged, so the
  // texture was ~3x oversized on each axis, ~9x the pixels, across eight cached variants. Written
  // this way the box tracks the constant instead of silently drifting the next time it moves.
  //
  // Rider variants reach higher than the animal: keep the lotus canopy entirely inside the bake.
  // Clipping this box used to shave the top from the leaf and make the rider harder to parse.
  const box: PropBox = {
    left: BUFFALO_REACH.left * UNIT.buffalo,
    right: BUFFALO_REACH.right * UNIT.buffalo,
    top: (rider ? BUFFALO_REACH.riderTop : BUFFALO_REACH.top) * UNIT.buffalo,
    bottom: BUFFALO_REACH.bottom * UNIT.buffalo,
  };
  const generated = conquestArtStamp(scene, rider ? 'life.buffalo-rider' : 'life.buffalo', box);
  if (generated) return { ...generated, key, nativeFacing: 1 };
  return {
    ...bakeProp(scene, key, box, (g, x, y, raster) => buffalo(g, x, y, raster, look * 977 + 13, rider)),
    nativeFacing: -1,
  };
}

/**
 * One instance of a baked prop, positioned by its anchor and sized back into design units.
 * `scale` sizes this copy — the texture itself is shared across every size.
 */
export function propImage(
  scene: Phaser.Scene,
  baked: BakedProp,
  x: number,
  y: number,
  scale = 1,
): Phaser.GameObjects.Image {
  return placeStamp(scene, baked, x, y, scale);
}
