/**
 * The sheet the film is printed on.
 *
 * `src/ui/ink/paper.ts` bakes giấy điệp — dó-bark paper coated in crushed seashell — into a 512
 * tile and repeats it under the whole map. That code is already Canvas2D and it is copied here
 * rather than imported for one reason: the original takes a `Phaser.Scene` and puts the result in
 * a texture manager, neither of which exists in this page. The *drawing* is the same drawing,
 * pigment for pigment, and it has to be: this is the ground the game's own props expect to sit on.
 *
 * On top of the tile go the two things `PaperFX` supplies in the game as a shader pass, redone here
 * with flat 2D compositing: the tea-stain blot and the vignette. Both are frame-fixed — they belong
 * to the sheet, not to the country, and they must not pan with the camera or the illusion that you
 * are looking *at* a print collapses into looking *through* a window.
 */
import { PIGMENT } from '../../src/ui/ink/palette';
import { mulberry32 } from '../../src/ui/ink/stroke';

const TILE = 512;

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

let tile: HTMLCanvasElement | undefined;

/** Giấy điệp, baked once. A verbatim port of `ensurePaperTexture`. */
export function paperTile(): HTMLCanvasElement {
  if (tile) {
    return tile;
  }
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(0x0d13b7);

  ctx.fillStyle = hex(PIGMENT.diep);
  ctx.fillRect(0, 0, TILE, TILE);

  for (let index = 0; index < 16; index += 1) {
    const x = rand() * TILE;
    const y = rand() * TILE;
    const rx = 60 + rand() * 160;
    const ry = 50 + rand() * 130;
    ctx.globalAlpha = 0.045 + rand() * 0.045;
    ctx.fillStyle = rand() > 0.45 ? hex(PIGMENT.diepLo) : hex(PIGMENT.diepHi);
    for (const dx of [-TILE, 0, TILE]) {
      for (const dy of [-TILE, 0, TILE]) {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, rx, ry, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.globalAlpha = 0.055;
  ctx.lineWidth = 0.7;
  for (let index = 0; index < 900; index += 1) {
    const x = rand() * TILE;
    const y = rand() * TILE;
    const length = 2 + rand() * 9;
    const angle = (rand() - 0.5) * 0.5;
    ctx.strokeStyle = rand() > 0.5 ? hex(PIGMENT.diepDeep) : hex(PIGMENT.diepHi);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#fffbf0';
  for (let index = 0; index < 300; index += 1) {
    ctx.fillRect(rand() * TILE, rand() * TILE, 1, 1);
  }

  ctx.globalAlpha = 1;
  tile = canvas;
  return canvas;
}

let pattern: CanvasPattern | undefined;

/** Lays the sheet. Called first thing every frame, in screen space. */
export function layPaper(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  if (!pattern) {
    pattern = ctx.createPattern(paperTile(), 'repeat')!;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * The two full-frame passes `PaperFX` does in a shader, done flat.
 *
 * The tint darkens the whole sheet toward a *pigment* rather than toward black — a woodblock print
 * has no black ink but soot, and a night scene on this paper is the paper going blue under a lamp,
 * which is also how the game's Winter wash works. Multiply, so the ink stays the darkest thing;
 * chàm for a night, hoè for a late afternoon.
 */
export function washPass(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tint: { colour: number; alpha: number } = { colour: PIGMENT.cham, alpha: 0 },
  bleach = 0,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (tint.alpha > 0) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = tint.alpha;
    ctx.fillStyle = hex(tint.colour);
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  if (bleach > 0) {
    ctx.globalAlpha = bleach;
    ctx.fillStyle = hex(PIGMENT.diepHi);
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * The grain of the sheet itself: the tea-stain and the vignette.
 *
 * Split from `washPass` so the title plate's lettering can be laid between the two — under the
 * sheet's own marks, which is where type printed on paper sits, and over the hour of the day, which
 * is not something a title should be subject to.
 */
export function grainPass(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Tea-stain: two soft blots off the corners, the mark of a sheet that has been handled.
  const blot = ctx.createRadialGradient(
    width * 0.12, height * 0.08, 0, width * 0.12, height * 0.08, Math.max(width, height) * 0.55,
  );
  blot.addColorStop(0, 'rgba(150,120,70,0.10)');
  blot.addColorStop(1, 'rgba(150,120,70,0)');
  ctx.fillStyle = blot;
  ctx.fillRect(0, 0, width, height);

  // Vignette, elliptical so it does not read as a porthole on a tall frame.
  const vignette = ctx.createRadialGradient(
    width * 0.5, height * 0.48, Math.min(width, height) * 0.32,
    width * 0.5, height * 0.5, Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, 'rgba(42,33,24,0)');
  vignette.addColorStop(1, 'rgba(42,33,24,0.22)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

/**
 * The registration wobble.
 *
 * A Đông Hồ sheet is pulled block by block by hand and no two pulls land in exactly the same place.
 * Held on **twelves** while the camera runs at thirty, so the ink has the small restless life of a
 * printed thing without the motion itself stuttering. It is a whole-frame offset rather than a
 * per-line reseed on purpose: reseeding the wobble makes a tree change *shape* between frames,
 * because in `src/ui/ink/` one seed drives both the outline and the shake.
 */
export function registration(t: number): { dx: number; dy: number; rot: number } {
  const pull = Math.floor(t * 12);
  const rand = mulberry32(pull * 2654435761);
  return {
    dx: (rand() - 0.5) * 1.1,
    dy: (rand() - 0.5) * 1.1,
    rot: (rand() - 0.5) * 0.0011,
  };
}
