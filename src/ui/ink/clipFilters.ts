import type Phaser from 'phaser';

/**
 * Whether a rectangular clip can be done with a Phaser 4 Mask filter on this renderer.
 *
 * Two things have to be true, and on the medium and high graphics tiers the second one is not.
 *
 * **WebGL.** `enableFilters()` returns early without it, so `gameObject.filters` stays null. On
 * Canvas the old `GeometryMask` is the live mechanism instead — callers fall back to it.
 *
 * **An unzoomed camera.** Object-level filters size their framebuffer from the camera's *design*
 * dimensions but draw into it at the camera's zoomed scale, so anything past the design rectangle
 * lands outside the framebuffer and is thrown away. This game inflates `gameSize` by
 * `RENDER_SCALE` and zooms every camera by the same factor to get back to 390-wide design units
 * (see `game/graphicsQuality.ts`) — which is exactly the configuration that trips it.
 *
 * Measured, reading the preserved drawing buffer with `?capture=1` and asking for a clip rect of
 * design (12, 108, 366, 675) on a 390x844 surface:
 *
 *   RENDER_SCALE 1, canvas 390x844   — kept x 14..374, y 112..782  (exact; that is the content's edge)
 *   RENDER_SCALE 2, canvas 780x1688  — kept x 24..354, y 216..824  (cropped)
 *
 * The origin is right in both — at scale 2 the rect's (12,108) lands at device (24,216), correctly
 * zoomed. The far edge does not move: four different mask rects, both `viewTransform` modes,
 * internal and external, geometry drawn in design units and in device units all stop dead at
 * 354x824. A mask covering the whole 780x1688 buffer still loses everything past ~390x844 device
 * pixels — the design size, not the buffer size. So it is not the mask that crops; it is the
 * composite. Camera filters are unaffected: `PaperFX` runs on `cameras.main` and is correct at
 * every tier.
 *
 * **Why fall through to no clip rather than to a broken one.** A cropped filter does not merely
 * clip in the wrong place, it deletes content: Dragon Ascent's prompt came up with its whole card
 * list gone, which is a game you cannot play. An unclipped list overflows its frame, which is ugly
 * and obvious and still playable. Of the two failures, take the one the player can work with.
 *
 * The real fix is a camera viewport instead of a filter — cameras clip in screen space natively,
 * with no framebuffer round-trip, and cost less than a filter pass per scroll area. That is a
 * design change rather than a port, so it is written up in `docs/16-phaser-4-migration.md` §4.1a
 * with the reproduction rather than rushed in here.
 */
export function clipFiltersUsable(scene: Phaser.Scene): boolean {
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer?.renderNodes) {
    return false;
  }
  return scene.cameras.main?.zoom === 1;
}
