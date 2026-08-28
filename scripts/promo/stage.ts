/**
 * The projector.
 *
 * Owns exactly three things: the canvas, the camera, and the order the passes go down in. It holds
 * no state that survives a frame, which is what lets `scripts/promo/build-promo.mjs` ask for any
 * second of the film in any order and get the same picture back every time.
 *
 * ## The camera, and why it is a square
 *
 * The film has to cut for a phone and for a laptop from one set of drawings. So every scene frames
 * a **square** of world — `Shot.half` is its half-side — and the projector guarantees that square
 * is fully visible whatever the output shape is. A 9:16 render then shows the square plus sky and
 * foreground above and below it; a 16:9 render shows the square plus more country left and right.
 * Nothing important is ever laid outside the square, and every scene draws well past its edges so
 * the extra is never blank.
 */
import { asGraphics, InkCanvas } from './inkCanvas';
import { grainPass, layPaper, registration, washPass } from './sheet';
import { DURATION, SCENES, loadDrum, titlePlate } from './film';

const params = new URLSearchParams(location.search);
const WIDTH = Number(params.get('w') ?? 1080);
const HEIGHT = Number(params.get('h') ?? 1920);

const canvas = document.getElementById('stage') as HTMLCanvasElement;
canvas.width = WIDTH;
canvas.height = HEIGHT;
canvas.style.width = `${WIDTH}px`;
canvas.style.height = `${HEIGHT}px`;

const ctx = canvas.getContext('2d', { alpha: false })!;
const ink = new InkCanvas(ctx);
const g = asGraphics(ink);

const sceneAt = (t: number) => {
  for (const scene of SCENES) {
    if (t < scene.to) return scene;
  }
  return SCENES[SCENES.length - 1];
};

/** Draws the film at absolute second `t`. Pure: same `t`, same pixels, every time. */
function render(t: number): void {
  const clock = Math.max(0, Math.min(DURATION - 0.0001, t));
  const scene = sceneAt(clock);
  const local = clock - scene.from;
  const shot = scene.shot(local);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  layPaper(ctx, WIDTH, HEIGHT);

  // The safe square, fitted. `min` rather than `max` is the whole contract: it guarantees the
  // square fits, and hands whatever is left over on the long axis back to the scene.
  const scale = Math.min(WIDTH, HEIGHT) / (shot.half * 2);
  const pull = registration(clock);

  ctx.save();
  ctx.translate(WIDTH / 2 + pull.dx, HEIGHT / 2 + pull.dy);
  ctx.rotate(pull.rot);
  ctx.scale(scale, scale);
  ctx.translate(-shot.cx, -shot.cy);
  scene.draw(g, ctx, local);
  ctx.restore();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  washPass(ctx, WIDTH, HEIGHT, scene.tint?.(local), scene.veil?.(local) ?? 0);
  titlePlate(ctx, g, WIDTH, HEIGHT, clock);
  grainPass(ctx, WIDTH, HEIGHT);
}

interface PromoApi {
  duration: number;
  width: number;
  height: number;
  scenes: Array<{ name: string; from: number; to: number }>;
  render: (t: number) => void;
  ready: boolean;
}

const api: PromoApi = {
  duration: DURATION,
  width: WIDTH,
  height: HEIGHT,
  scenes: SCENES.map((scene) => ({ name: scene.name, from: scene.from, to: scene.to })),
  render,
  ready: false,
};

(window as unknown as { __promo: PromoApi }).__promo = api;

/**
 * Nothing is drawn until the fonts are in.
 *
 * `Source Serif 4` and `Be Vietnam Pro` are the game's own faces and both are self-hosted. A frame
 * rendered before they load falls back to Georgia and the title plate ships in the wrong typeface —
 * silently, because a canvas never reports which font it actually used.
 */
async function boot(): Promise<void> {
  await Promise.all([
    document.fonts.load('700 132px "Source Serif 4"', 'VẠN THẮNG'),
    document.fonts.load('600 34px "Be Vietnam Pro"', 'TEN THOUSAND VICTORIES'),
    document.fonts.load('400 31px "Be Vietnam Pro"', 'Đại Việt'),
    document.fonts.ready,
    loadDrum(),
  ]);
  render(0);
  api.ready = true;
}

void boot();
