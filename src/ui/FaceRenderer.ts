import Phaser from 'phaser';
import { FACE_PART_DEFS, type FacePartDef } from './faces/parts.generated';
import { resolveHeroLook } from './faces/heroLook';
import { getActiveMapTheme } from './mapTheme';
import { PIGMENT } from './ink/palette';
import { hatchPoly, inkPath, washFill } from './ink/stroke';
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
 * The frame a printed portrait sits in: hatched paper with a hand-pulled contour, weighted by rank
 * so a Legendary still announces itself without a slab of lacquer behind the face.
 */
function drawCartouche(scene: Phaser.Scene, rank: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const left = HERO_FACE_EXTENT.left + 2;
  const right = HERO_FACE_EXTENT.right - 2;
  const top = HERO_FACE_EXTENT.top + 2;
  const bottom = HERO_FACE_EXTENT.bottom - 2;
  const box = [
    { x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom },
  ];
  washFill(g, box, PIGMENT.diepLo, rank * 31 + 7, 0.55, 1.2);
  hatchPoly(g, box, 0.8, 6, PIGMENT.mucSoft, 0.07, 0.7);
  inkPath(g, box, rank * 17 + 3, {
    width: 1 + rank * 0.35,
    alpha: 0.5 + rank * 0.1,
    colour: rank >= 3 ? PIGMENT.son : PIGMENT.muc,
    wobble: 0.9,
    step: 12,
    closed: true,
  });
  return g;
}

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

const BADGE_TEXTURE_PREFIX = 'hero-face:';
const BADGE_RASTER = 2;
/** Render textures kept alive for as long as their saved texture is: destroying one destroys the other. */
const badgeTextures = new Map<string, Phaser.GameObjects.RenderTexture>();

/**
 * A hero's portrait as a single texture, baked once and reused — for the map, where a face
 * beside every standing host would otherwise be fifteen tinted images each.
 *
 * Returns the texture key, or nothing when the parts are not loaded yet or the GL context is
 * lost (drawing into a render texture then dereferences a null binding, exactly as the map's
 * own bake guards against). Callers fall back to `renderHeroFaceInBox` or draw nothing.
 */
export function heroFaceTextureKey(scene: Phaser.Scene, hero: Hero): string | undefined {
  const key = BADGE_TEXTURE_PREFIX + hero.id;
  if (scene.textures.exists(key)) return key;
  if (!heroFacesReady(scene)) return undefined;
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (renderer?.contextLost) return undefined;

  const width = Math.ceil(HERO_FACE_W * BADGE_RASTER);
  const height = Math.ceil(HERO_FACE_H * BADGE_RASTER);
  const target = scene.make.renderTexture({ width, height }, false);
  // The face is drawn about its own origin, with parts reaching left of and above it; shift so
  // the whole extent lands inside the texture.
  const face = renderHeroFace(scene, hero, -HERO_FACE_EXTENT.left * BADGE_RASTER, -HERO_FACE_EXTENT.top * BADGE_RASTER, BADGE_RASTER);
  target.draw(face);
  face.destroy(true);
  target.saveTexture(key);
  badgeTextures.set(key, target);
  return key;
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

  // Under the woodblock treatment the rarity plate — a dark lacquered slab with a gold rim — is
  // the one part of the portrait that fights the page it now sits on. The face itself is right;
  // it just needs paper behind it instead of a colour swatch, so the plate is replaced with an
  // inked cartouche and rank is carried by the border weight.
  const printed = getActiveMapTheme().id === 'dong-ho';
  if (printed) {
    look.parts = look.parts.filter((part) => !/^plate-|^rank-/.test(part.key));
    root.add(drawCartouche(scene, look.rank));
  }

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
