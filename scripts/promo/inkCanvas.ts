/**
 * A Canvas2D stand-in for `Phaser.GameObjects.Graphics`.
 *
 * The point of this file is that the promo film is drawn by the *game's own* code. Every ink
 * primitive in `src/ui/ink/` — `inkPath`, `washFill`, `hatchPoly`, and every prop, figure and
 * device built on them — talks to a `Graphics` object through exactly eleven methods, and not one
 * of them needs a renderer, a scene or a texture manager. Shim those eleven onto a 2D context and
 * the whole vocabulary of the map is available to a film that never boots Phaser.
 *
 * The list was taken by grepping every call site under `src/ui/ink/`, not guessed:
 *
 *   fillStyle · fillPoints · fillCircle · fillEllipse · fillRect · fillTriangle
 *   lineStyle · strokePoints · strokeCircle · lineBetween · translateCanvas
 *
 * If a prop ever reaches for a twelfth, it lands here as `undefined is not a function` on the very
 * first frame rather than as a quiet omission, which is the failure mode worth having.
 *
 * Two Phaser conventions this has to honour exactly or the drawings come out wrong:
 *
 *  · `fillEllipse(x, y, width, height)` takes **diameters**, not radii.
 *  · `translateCanvas` accumulates into the transform for everything drawn after it, and
 *    `washFill` — the misregistration that is the whole look — translates, fills, and translates
 *    back. So it must be a real transform, not an offset applied per call.
 */

export interface Pt {
  x: number;
  y: number;
}

const hex = (colour: number): string => `#${(colour >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

/**
 * Round caps and round joins on everything.
 *
 * A Đông Hồ contour is a brush lifted off paper; a mitre join puts a spike on the outside of every
 * corner of every wobbled path, and at three passes per stroke those spikes are what makes ink
 * drawn this way read as vector art with a shake applied.
 */
export class InkCanvas {
  readonly ctx: CanvasRenderingContext2D;

  private lineColour = '#2a2118';

  private lineAlpha = 1;

  private lineWidth = 1;

  private fillColour = '#2a2118';

  private fillAlpha = 1;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  // ── state ───────────────────────────────────────────────────────────────────

  lineStyle(width: number, colour: number, alpha = 1): this {
    this.lineWidth = width;
    this.lineColour = hex(colour);
    this.lineAlpha = alpha;
    return this;
  }

  fillStyle(colour: number, alpha = 1): this {
    this.fillColour = hex(colour);
    this.fillAlpha = alpha;
    return this;
  }

  // ── paths ───────────────────────────────────────────────────────────────────

  private trace(points: ReadonlyArray<Pt>, closeShape: boolean): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    if (closeShape) {
      ctx.closePath();
    }
  }

  strokePoints(points: ReadonlyArray<Pt>, closeShape = false, _closePath = false): this {
    if (points.length < 2 || this.lineAlpha <= 0 || this.lineWidth <= 0) {
      return this;
    }
    const { ctx } = this;
    this.trace(points, closeShape);
    ctx.globalAlpha = this.lineAlpha;
    ctx.strokeStyle = this.lineColour;
    // Phaser clamps its own minimum; a sub-pixel width here disappears entirely on some passes and
    // the three-pass ink loses its soaked underlay.
    ctx.lineWidth = Math.max(0.05, this.lineWidth);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return this;
  }

  fillPoints(points: ReadonlyArray<Pt>, _closeShape = false): this {
    if (points.length < 3 || this.fillAlpha <= 0) {
      return this;
    }
    const { ctx } = this;
    // A fill is always closed — Phaser closes the sub-path for you whatever `closeShape` says, and
    // an open polygon fill is not a thing any caller in `src/ui/ink/` wants.
    this.trace(points, true);
    ctx.globalAlpha = this.fillAlpha;
    ctx.fillStyle = this.fillColour;
    ctx.fill();
    ctx.globalAlpha = 1;
    return this;
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    return this.strokePoints([{ x: x1, y: y1 }, { x: x2, y: y2 }], false, false);
  }

  // ── shapes ──────────────────────────────────────────────────────────────────

  fillCircle(x: number, y: number, radius: number): this {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
    ctx.globalAlpha = this.fillAlpha;
    ctx.fillStyle = this.fillColour;
    ctx.fill();
    ctx.globalAlpha = 1;
    return this;
  }

  strokeCircle(x: number, y: number, radius: number): this {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
    ctx.globalAlpha = this.lineAlpha;
    ctx.strokeStyle = this.lineColour;
    ctx.lineWidth = Math.max(0.05, this.lineWidth);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return this;
  }

  /** `width` and `height` are diameters, as they are in Phaser. Getting this wrong halves props. */
  fillEllipse(x: number, y: number, width: number, height: number): this {
    const { ctx } = this;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0, width / 2), Math.max(0, height / 2), 0, 0, Math.PI * 2);
    ctx.globalAlpha = this.fillAlpha;
    ctx.fillStyle = this.fillColour;
    ctx.fill();
    ctx.globalAlpha = 1;
    return this;
  }

  fillRect(x: number, y: number, width: number, height: number): this {
    const { ctx } = this;
    ctx.globalAlpha = this.fillAlpha;
    ctx.fillStyle = this.fillColour;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1;
    return this;
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    return this.fillPoints([{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }], true);
  }

  // ── transform ───────────────────────────────────────────────────────────────

  translateCanvas(x: number, y: number): this {
    this.ctx.translate(x, y);
    return this;
  }

  // ── conveniences the film uses, which Phaser also has ───────────────────────

  save(): this {
    this.ctx.save();
    return this;
  }

  restore(): this {
    this.ctx.restore();
    return this;
  }

  clear(): this {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    return this;
  }
}

/**
 * The cast, made once.
 *
 * The cast is typed against `Phaser.GameObjects.Graphics`, and this is not one — satisfying that
 * structurally would mean reimplementing a four-thousand-line engine class. So the assertion lives
 * here, with the grep at the top of the file as its argument, rather than at each of the two
 * hundred call sites in the film.
 */
export type G = Phaser.GameObjects.Graphics;

export const asGraphics = (ink: InkCanvas): G => ink as unknown as G;
