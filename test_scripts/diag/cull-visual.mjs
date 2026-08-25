/**
 * Proves the view culling is invisible.
 *
 * The whole claim of culling is that it only removes what the camera cannot reach — so the rendered
 * frame must be identical with it on and off. Anything that differs is something the player could
 * see and no longer can, which is a bug wearing an optimisation's clothes.
 *
 * Shoots the same seeded game at the same camera with and without `?nocull=1`, at the fresh start,
 * with the whole map revealed, and panned across revealed ground. Pixels are sampled in-page onto a
 * quarter-scale 2D canvas rather than through an image library, so this needs no new dependency —
 * `?capture=1` is what makes the WebGL buffer readable at all. Run against `npm run dev`.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5179';

async function sample(browser, query, reveal, pan) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?capture=1${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function'
      && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => window.__startBenchGame(1337));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
  await page.waitForTimeout(400);

  const pixels = await page.evaluate(
    async ({ reveal, pan }) => {
      const game = window.__phaserGame;
      const scene = game.scene.getScene('MapScene');
      if (reveal) {
        for (const land of scene.state.lands) {
          land.isVisible = true;
          land.isExplored = true;
        }
        scene.refresh();
      }
      if (pan) {
        scene.cameras.main.setScroll(pan.x, pan.y);
      }
      // Step deterministically rather than sleeping: the cull answers the pan on the next update,
      // and a fixed number of small steps keeps both runs at the same point in every drift tween.
      for (let i = 0; i < 12; i += 1) game.step(performance.now(), 16);

      const source = game.canvas;
      const w = 96;
      const h = 208;
      const flat = document.createElement('canvas');
      flat.width = w;
      flat.height = h;
      const ctx = flat.getContext('2d');
      ctx.drawImage(source, 0, 0, w, h);
      return Array.from(ctx.getImageData(0, 0, w, h).data);
    },
    { reveal, pan },
  );
  await page.close();
  return { pixels, errors };
}

function compare(a, b) {
  let differing = 0;
  let maxDelta = 0;
  const px = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (d > 24) differing += 1;
    if (d > maxDelta) maxDelta = d;
  }
  return { fraction: differing / px, differing, maxDelta };
}

const CASES = [
  ['fresh start', false, null],
  ['revealed map', true, null],
  ['revealed, panned', true, { x: 900, y: 1500 }],
];

const browser = await chromium.launch();
let failed = false;
for (const [label, reveal, pan] of CASES) {
  const on = await sample(browser, '', reveal, pan);
  const off = await sample(browser, '&nocull=1', reveal, pan);
  const { fraction, differing, maxDelta } = compare(on.pixels, off.pixels);
  // A small allowance, not zero: fog clouds and weather motes run on their own loops and land a
  // pixel or two differently between two loads however the culling behaves.
  const verdict = fraction < 0.01 ? 'PASS' : 'FAIL';
  if (verdict === 'FAIL') failed = true;
  const errs = [...on.errors, ...off.errors];
  console.log(
    `${label.padEnd(18)} differing ${(fraction * 100).toFixed(3)}% (${differing} px, max delta ${maxDelta}) -> ${verdict}`
    + (errs.length ? `  ERRORS: ${errs[0]}` : ''),
  );
}
await browser.close();
console.log(failed ? 'FAIL: culling changed what is on screen' : 'PASS: culling is invisible');
process.exit(failed ? 1 : 0);
