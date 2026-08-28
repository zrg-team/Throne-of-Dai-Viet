/**
 * Renders the promo film and encodes it.
 *
 * The film draws itself in a headless Chromium — `scripts/promo/stage.html`, which imports the
 * game's own ink primitives out of `src/ui/ink/` — and every frame is a pure function of one
 * number. So this driver simply asks for t = 0, t = 1/30, t = 2/30 … and pipes what comes back
 * into ffmpeg. A frame that takes four hundred milliseconds to draw still lands on the timeline at
 * exactly its own thirtieth of a second; there is no realtime capture anywhere in this, and no
 * dropped-frame class of bug to worry about.
 *
 * ## Getting ffmpeg
 *
 * Looked for in this order: `--ffmpeg <path>`, `$FFMPEG`, `ffmpeg` on PATH, then the `ffmpeg-static`
 * package if one happens to be installed nearby. It is deliberately not a dependency of this
 * repository — it is a 70 MB binary that exists to cut one marketing asset, and every contributor
 * and every CI run would pay for it.
 *
 *     npm i -g ffmpeg-static      # or: winget install ffmpeg
 *     node scripts/promo/build-promo.mjs
 *
 * ## Usage
 *
 *     node scripts/promo/build-promo.mjs [--w 1080] [--h 1920] [--fps 30]
 *                                        [--out scripts/promo/out/van-thang.mp4]
 *                                        [--from 0] [--to 57.4] [--ffmpeg <path>] [--keep]
 *
 *   --from/--to  render a slice, for looking at one plate without waiting for the other six
 *   --keep       leave the PNG frames on disk afterwards
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { armAgainstReload, openStage } from './openStage.mjs';

const arg = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : fallback;
};

const WIDTH = Number(arg('--w', 1080));
const HEIGHT = Number(arg('--h', 1920));
const FPS = Number(arg('--fps', 30));
const OUT = arg('--out', `scripts/promo/out/van-thang-${WIDTH}x${HEIGHT}.mp4`);
const FRAMES = arg('--frames', 'scripts/promo/out/frames');
const KEEP = process.argv.includes('--keep');
const ORIGIN = arg('--origin', 'http://127.0.0.1:5179');

/** Where ffmpeg is. See the note at the top: it is a tool, not a dependency. */
function findFfmpeg() {
  const explicit = arg('--ffmpeg', process.env.FFMPEG);
  if (explicit && existsSync(explicit)) return explicit;
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  if (onPath.status === 0) {
    const first = onPath.stdout.split(/\r?\n/).find(Boolean);
    if (first && existsSync(first)) return first;
  }
  try {
    return createRequire(import.meta.url)('ffmpeg-static');
  } catch {
    return undefined;
  }
}

const FFMPEG = findFfmpeg();
if (!FFMPEG) {
  console.error(
    'No ffmpeg. Pass --ffmpeg <path>, set $FFMPEG, put it on PATH, or `npm i ffmpeg-static` nearby.',
  );
  process.exit(1);
}

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

// Before anything loads: no HMR socket, so nothing can reload the page out from under the render.
await armAgainstReload(page);

if (!await openStage(page, ORIGIN, WIDTH, HEIGHT)) {
  console.error(`stage never became ready. Is \`yarn dev\` up on ${ORIGIN}?`);
  await browser.close();
  process.exit(1);
}
// Errors from a reloaded-away attempt are not this render's errors.
errors.length = 0;
if (errors.length) {
  console.error(`stage errors:\n${errors.join('\n')}`);
  await browser.close();
  process.exit(1);
}

const duration = await page.evaluate(() => window.__promo.duration);
const FROM = Number(arg('--from', 0));
const TO = Math.min(duration, Number(arg('--to', duration)));
const total = Math.round((TO - FROM) * FPS);

console.log(`${WIDTH}x${HEIGHT} · ${FPS} fps · ${(TO - FROM).toFixed(1)}s · ${total} frames`);

/**
 * One frame, with the page reopened if it went away underneath us.
 *
 * A render is ten to fifteen minutes long and the dev server will reload the page during it for
 * reasons that have nothing to do with the film — someone saves a file, `package.json` changes,
 * Vite decides to re-optimize. That arrives here as `Execution context was destroyed`, and the
 * first version of this simply died on it eleven hundred frames in. Since every frame is a pure
 * function of `t`, recovering is just: open the stage again and ask for the same second.
 */
async function shoot(frame, t) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.evaluate((at) => window.__promo.render(at), t);
      await page.screenshot({ path: `${FRAMES}/${String(frame).padStart(5, '0')}.png` });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      const why = String(error).split(String.fromCharCode(10))[0];
      process.stdout.write(`
  frame ${frame}: ${why} — reopening
`);
      if (!await openStage(page, ORIGIN, WIDTH, HEIGHT)) {
        throw error;
      }
    }
  }
}

const started = Date.now();
for (let frame = 0; frame < total; frame += 1) {
  const t = FROM + frame / FPS;
  await shoot(frame, t);
  if (frame % 60 === 0 || frame === total - 1) {
    const done = frame + 1;
    const rate = done / ((Date.now() - started) / 1000);
    const left = Math.round((total - done) / rate);
    process.stdout.write(
      `\r  ${done}/${total}  ${rate.toFixed(1)} fps  ~${Math.floor(left / 60)}m${String(left % 60).padStart(2, '0')}s left   `,
    );
  }
}
process.stdout.write('\n');
await browser.close();

if (errors.length) {
  console.error(`page errors during render:\n${errors.slice(0, 10).join('\n')}`);
}

/**
 * yuv420p and an even frame size, because every player and every platform that will ever be handed
 * this file assumes both, and the ones that do not assume them silently refuse the file instead of
 * saying why. CRF 17 on a flat-colour print is visually lossless and still small.
 */
const encode = spawn(FFMPEG, [
  '-y',
  '-framerate', String(FPS),
  '-i', `${FRAMES}/%05d.png`,
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '17',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  OUT,
], { stdio: ['ignore', 'ignore', 'pipe'] });

let log = '';
encode.stderr.on('data', (chunk) => { log += chunk.toString(); });
const code = await new Promise((resolve) => encode.on('close', resolve));

if (code !== 0) {
  console.error(log.split('\n').slice(-25).join('\n'));
  process.exit(1);
}

if (!KEEP) {
  rmSync(FRAMES, { recursive: true, force: true });
}

const size = statSync(OUT).size;
console.log(`${OUT} · ${(size / 1024 / 1024).toFixed(1)} MB · ${((Date.now() - started) / 1000 / 60).toFixed(1)} min`);
