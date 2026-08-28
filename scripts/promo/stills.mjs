/**
 * Stills off the film, for looking at.
 *
 * The film is fifty-odd seconds of drawing that nobody can review by reading the source, so this is
 * the loop everything was tuned in: pick times, render them, open them. Every failure so far has
 * been a composition failure — a horizon in the wrong place, a host off the bottom of the frame,
 * a prop at four times the size of the man beside it — and not one of them was visible in code.
 *
 * Usage: node scripts/promo/stills.mjs [--w 1080] [--h 1920] [--at 0,4,9,...] [--every 2]
 *                                       [--out dir] [--origin http://127.0.0.1:5179]
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { armAgainstReload, openStage } from './openStage.mjs';

const arg = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : fallback;
};

const WIDTH = Number(arg('--w', 1080));
const HEIGHT = Number(arg('--h', 1920));
const OUT = arg('--out', 'scripts/promo/out/stills');
const EVERY = arg('--every', undefined);
const ORIGIN = arg('--origin', 'http://127.0.0.1:5179');
const AT = arg('--at', undefined);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

// Before anything loads: no HMR socket, so nothing can reload the page out from under the render.
await armAgainstReload(page);

if (!await openStage(page, ORIGIN, WIDTH, HEIGHT)) {
  console.log(`stage never became ready — is a dev server up on ${ORIGIN}?`);
  await browser.close();
  process.exit(1);
}
errors.length = 0;
if (errors.length) {
  console.log(`ERRORS:\n${errors.join('\n')}`);
  await browser.close();
  process.exit(1);
}

const { duration, scenes } = await page.evaluate(() => ({
  duration: window.__promo.duration,
  scenes: window.__promo.scenes,
}));
console.log(`${duration.toFixed(1)}s · ${scenes.map((s) => `${s.name} ${s.from}–${s.to}`).join(' · ')}`);

const times = AT
  ? AT.split(',').map(Number)
  : EVERY
    ? Array.from({ length: Math.ceil(duration / Number(EVERY)) }, (_, i) => i * Number(EVERY))
    // One frame from the middle of every beat, plus the moments each plate is actually about.
    : scenes.flatMap((s) => [s.from + (s.to - s.from) * 0.35, s.from + (s.to - s.from) * 0.8]);

for (const t of times) {
  await page.evaluate((at) => window.__promo.render(at), t);
  const name = `${String(Math.round(t * 10)).padStart(4, '0')}.png`;
  await page.screenshot({ path: `${OUT}/${name}` });
}

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : `${times.length} stills → ${OUT}`);
await browser.close();
