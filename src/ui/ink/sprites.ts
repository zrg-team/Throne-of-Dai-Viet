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
 */
import Phaser from 'phaser';
import { RENDER_SCALE } from '../../game/graphicsQuality';
import { buffalo } from './props';

type G = Phaser.GameObjects.Graphics;

/**
 * How many texture pixels one design unit gets.
 *
 * The camera is already zoomed by `RENDER_SCALE`, and the map camera zooms up to about 2× on top of
 * that, so a texture baked at one pixel per unit is magnified and soft exactly where the player
 * leans in to look. Two design pixels of headroom is what `FaceRenderer` uses for the same reason.
 */
const RASTER = RENDER_SCALE * 2;

/** The box a prop occupies around its anchor, in design units. */
export interface PropBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface BakedProp {
  key: string;
  /** Origin fractions that put the prop's anchor back under the image's position. */
  originX: number;
  originY: number;
  /** Scale that returns the raster to design units. */
  scale: number;
}

/**
 * Bakes one prop into a texture, or returns the existing bake.
 *
 * `draw` receives the anchor position **already in raster pixels** and the raster factor to
 * multiply its own scale by — rather than the graphics being scaled as an object, because
 * `generateTexture` rasterises through the browser's Canvas API and the safest thing to hand it is
 * geometry that is already the size it should end up. (The same Canvas route is why nothing baked
 * here may use `fillGradientStyle`; none of the ink helpers do.)
 */
export function bakeProp(
  scene: Phaser.Scene,
  key: string,
  box: PropBox,
  draw: (g: G, x: number, y: number, raster: number) => void,
): BakedProp {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const baked: BakedProp = {
    key,
    originX: -box.left / width,
    originY: -box.top / height,
    scale: 1 / RASTER,
  };
  if (scene.textures.exists(key)) {
    return baked;
  }

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  // Drawn at the anchor's offset inside the box, so the texture holds the whole prop with no
  // clipping and the origin above puts it back where the caller asked for it.
  draw(graphics, -box.left * RASTER, -box.top * RASTER, RASTER);
  graphics.generateTexture(key, Math.ceil(width * RASTER), Math.ceil(height * RASTER));
  graphics.destroy();
  return baked;
}

/**
 * Data key carrying an object's own scale, so anything that flips it — facing, a walk — multiplies
 * by that rather than overwriting it. A baked prop is drawn at raster size and scaled down to
 * design units; `setScale(-1, 1)` on one of those would show it at four times the size, mirrored.
 */
export const BASE_SCALE_KEY = 'baseScale';

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
export function bakedBuffalo(scene: Phaser.Scene, seed: number, rider: boolean): BakedProp {
  const look = Math.abs(Math.round(seed)) % BUFFALO_LOOKS;
  const key = `prop:buffalo:${look}:${rider ? 'r' : 'x'}`;
  // Rider variants reach higher than the animal: keep the lotus canopy entirely inside the bake.
  // Clipping this box used to shave the top from the leaf and make the rider harder to parse.
  const box: PropBox = { left: -38, right: 26, top: rider ? -43 : -34, bottom: 5 };
  return bakeProp(scene, key, box, (g, x, y, raster) => buffalo(g, x, y, raster, look * 977 + 13, rider));
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
  const size = baked.scale * scale;
  return scene.add.image(x, y, baked.key)
    .setOrigin(baked.originX, baked.originY)
    .setScale(size)
    .setData(BASE_SCALE_KEY, size);
}
