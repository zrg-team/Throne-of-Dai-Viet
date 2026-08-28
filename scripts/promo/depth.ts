/**
 * Depth: the two things that were missing from every flat frame in the first cut.
 *
 * A landscape drawn as a stack of horizontal bands — hills, fields, village, grass — reads as a
 * chart of a landscape, however well each band is drawn. Two moves fix it, and both of them are
 * older than photography:
 *
 *  1. **Aerial perspective.** Things further away are paler and lower in contrast, because there is
 *     air in between. `recede` lays a wash of the paper's own colour over everything drawn so far,
 *     so each layer is pushed back a step before the next one goes down. Called four or five times
 *     in a plate, it does more for depth than any amount of extra detail.
 *
 *  2. **Repoussoir.** Something large, dark and close at the edge of the frame, that the eye reads
 *     past into the picture. `near` draws with the brightness pulled down, so a banana clump at the
 *     bottom of the frame goes to a silhouette instead of competing with the village behind it.
 *
 * Neither invents a colour: `recede` washes toward `PIGMENT.diep`, which is the sheet, and `near`
 * only darkens what the game's own props already drew.
 */
import { PIGMENT } from '../../src/ui/ink/palette';
import type { Pt } from '../../src/ui/ink/stroke';
import type { G } from './inkCanvas';

/**
 * Pushes everything drawn so far one step back into the haze.
 *
 * Drawn as a plain rect in world space, so it moves with the camera and a layer stays at its own
 * distance while the camera pans. The colour is the paper: on điệp, distance does not go blue, it
 * goes toward the sheet.
 */
export function recede(
  g: G, x0: number, x1: number, y0: number, y1: number, alpha: number, colour = PIGMENT.diep,
): void {
  if (alpha <= 0.004) return;
  const rect: Pt[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  g.fillStyle(colour, alpha);
  g.fillPoints(rect, true);
}

/**
 * The same, but fading out downward — for a haze that sits on the horizon and thins as the ground
 * comes toward the viewer. Six bands is enough; the wobble in everything underneath hides the
 * steps.
 */
export function hazeBand(
  g: G, x0: number, x1: number, y0: number, y1: number, alpha: number, colour = PIGMENT.diep,
): void {
  if (alpha <= 0.004) return;
  const bands = 6;
  for (let index = 0; index < bands; index += 1) {
    const a = y0 + ((y1 - y0) * index) / bands;
    const b = y0 + ((y1 - y0) * (index + 1)) / bands;
    g.fillStyle(colour, alpha * (1 - index / bands) ** 1.4);
    g.fillPoints([{ x: x0, y: a }, { x: x1, y: a }, { x: x1, y: b }, { x: x0, y: b }], true);
  }
}

/**
 * Draws with everything darkened, for whatever is closest to the camera.
 *
 * `ctx.filter` rather than a wash laid over the top afterwards, because a wash would have to know
 * the shape of what it is darkening and a plant is mostly holes. Chromium applies the filter per
 * draw call, so this is for the four or five big near-camera props in a plate and not for a crowd.
 */
export function near(ctx: CanvasRenderingContext2D, brightness: number, draw: () => void): void {
  ctx.save();
  ctx.filter = `brightness(${brightness}) saturate(0.78)`;
  draw();
  ctx.restore();
}
