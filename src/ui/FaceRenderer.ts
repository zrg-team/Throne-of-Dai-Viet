import Phaser from 'phaser';
import { FACE_PART_DEFS, type FacePartDef } from './faces/parts.generated';
import { resolveHeroLook } from './faces/heroLook';
import type { Hero } from '../state/types';

/**
 * Hero portraits, composed from a library of SVG parts.
 *
 * This used to draw every portrait from Phaser primitives at runtime — twenty-odd rectangles
 * and ellipses per face, built fresh on every render. That is why the faces all looked alike:
 * an axis-aligned box is an axis-aligned box, so the only variation available was interior
 * detail on an identical outline, and at the sizes portraits are actually drawn (five call
 * sites, from 0.32× to 1.16×) most of that detail was sub-pixel.
 *
 * Now each part is a real drawing shipped as an SVG in `public/faces/`, rasterised once at
 * load, and stacked as tinted Images. Three consequences worth knowing:
 *
 *  - **Parts that carry a run-chosen colour are drawn white and tinted.** Six skin tones cost
 *    one file. Parts with a fixed colour — the black lacquer of a khăn vấn, a gold coronet —
 *    ship their colour and are never tinted.
 *  - **Positions come from the generator, not from here.** `scripts/build-faces.mjs` measures
 *    each part's real bounding box and writes its centre into `parts.generated.ts`, so a part
 *    can be redrawn or replaced by hand without anything in this file changing.
 *  - **An artist can take over incrementally.** Any single SVG can be replaced with better art
 *    as long as its footprint stays put; nothing here knows what a part looks like.
 *
 * The public surface is unchanged: `renderHeroFace`, `renderHeroFaceInBox`, and
 * `HERO_FACE_EXTENT` behave exactly as before, so the four calling scenes needed no edits.
 */

/** Texture key namespace, so face parts cannot collide with icons or map art. */
const TEXTURE_PREFIX = 'face:';

/**
 * Rasterisation size, as a multiple of design space.
 *
 * Portraits are drawn at up to 1.16×, so 2× leaves headroom for a retina backing store without
 * paying for texture memory nobody looks at. `load.svg` rasterises once at this size; Phaser
 * then scales the Image down, which is a GPU operation and free.
 */
const RASTER_SCALE = 2;

const PART_BY_KEY = new Map<string, FacePartDef>(FACE_PART_DEFS.map((part) => [part.key, part]));

/**
 * Visual extent of a portrait at scale 1, relative to its container origin.
 *
 * Derived from the generator's design space rather than measured by hand — the old comment
 * here had to name which hat and which shoulder set the bounds, and went stale the moment
 * either changed. Callers sizing a portrait against a box must still use these rather than the
 * plate, because the tallest headwear overhangs it.
 */
const bounds = FACE_PART_DEFS.reduce(
  (acc, part) => ({
    top: Math.min(acc.top, part.cy - part.h / 2),
    bottom: Math.max(acc.bottom, part.cy + part.h / 2),
    left: Math.min(acc.left, part.cx - part.w / 2),
    right: Math.max(acc.right, part.cx + part.w / 2),
  }),
  { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity },
);

export const HERO_FACE_EXTENT = {
  top: bounds.top,
  bottom: bounds.bottom,
  left: bounds.left,
  right: bounds.right,
} as const;
export const HERO_FACE_W = HERO_FACE_EXTENT.right - HERO_FACE_EXTENT.left;
export const HERO_FACE_H = HERO_FACE_EXTENT.bottom - HERO_FACE_EXTENT.top;

/**
 * Queues every face part for loading. Call from a scene's `preload`.
 *
 * Safe to call more than once: Phaser skips a key that is already in the texture manager, so a
 * scene that preloads defensively costs nothing.
 */
export function preloadHeroFaces(scene: Phaser.Scene): void {
  const baseUrl = import.meta.env.BASE_URL;
  for (const part of FACE_PART_DEFS) {
    const key = TEXTURE_PREFIX + part.key;
    if (scene.textures.exists(key)) continue;
    scene.load.svg(key, `${baseUrl}faces/${part.key}.svg`, {
      width: Math.max(1, Math.round(part.w * RASTER_SCALE)),
      height: Math.max(1, Math.round(part.h * RASTER_SCALE)),
    });
  }
}

/** True once the parts are in the texture manager — the portrait needs them to draw anything. */
export function heroFacesReady(scene: Phaser.Scene): boolean {
  return scene.textures.exists(TEXTURE_PREFIX + FACE_PART_DEFS[0].key);
}

/**
 * Renders a portrait scaled and positioned to sit fully inside `box`, centred within it.
 * Use this anywhere a portrait shares a card with text; `renderHeroFace` alone takes a raw
 * centre point and will happily overflow its container.
 */
export function renderHeroFaceInBox(
  scene: Phaser.Scene,
  hero: Hero,
  box: { x: number; y: number; width: number; height: number },
  maxScale = 1,
): Phaser.GameObjects.Container {
  const scale = Math.min(box.width / HERO_FACE_W, box.height / HERO_FACE_H, maxScale);
  // The origin is not the middle of the artwork, so offset by the extent's own centre.
  const centreOffsetY = (HERO_FACE_EXTENT.top + HERO_FACE_EXTENT.bottom) / 2;
  return renderHeroFace(
    scene,
    hero,
    box.x + box.width / 2,
    box.y + box.height / 2 - centreOffsetY * scale,
    scale,
  );
}

export function renderHeroFace(
  scene: Phaser.Scene,
  hero: Hero,
  x: number,
  y: number,
  scale: number,
): Phaser.GameObjects.Container {
  const root = scene.add.container(x, y).setScale(scale);
  const look = resolveHeroLook(hero);

  // Paint order comes from the manifest, not from the order the wardrobe happened to push
  // parts in — the throat is layer 25 and a collar is 35, and the wardrobe builds the garment
  // before the body it hangs on. Sorting here means `heroLook` can stay readable as a
  // description of a person rather than as a paint sequence.
  const stack = look.parts
    .map((wanted) => ({ wanted, def: PART_BY_KEY.get(wanted.key) }))
    .filter((entry): entry is { wanted: typeof entry.wanted; def: FacePartDef } => Boolean(entry.def))
    .sort((a, b) => a.def.layer - b.def.layer);

  for (const { wanted, def } of stack) {
    const textureKey = TEXTURE_PREFIX + def.key;
    // A missing texture means the scene did not preload; draw what we can rather than throwing
    // in the middle of a roster list.
    if (!scene.textures.exists(textureKey)) continue;

    const image = scene.add.image(def.cx, def.cy, textureKey);
    image.setDisplaySize(def.w, def.h);
    if (wanted.tint !== 'none') image.setTint(look.palette[wanted.tint]);
    root.add(image);
  }

  return root;
}
