/**
 * Where the steady-state frame goes, and what view culling is worth.
 *
 * Two things this exists to correct in the other harnesses:
 *
 *  - `measure-render.mjs` measures a *fresh* game, which has 3 visible lands out of 42. That is the
 *    cheapest the map is ever going to be, and it is not the state anyone complains about. The
 *    "revealed" rows below light the whole map, which is what a developed realm looks like.
 *  - headless Chromium rasterises through SwiftShader, in software. Fill rate is therefore charged
 *    to the CPU and is worth far more here than on a real phone GPU, so read the object counts and
 *    the culled fraction as the transferable numbers, and the milliseconds as this machine's.
 *
 * Method matches measure-render.mjs: game.step below the tick threshold so no refresh fires, 4x CPU
 * throttle. Run against `npm run dev`.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5179';

const CASES = [
  ['fresh game', '', false],
  ['fresh, no paperFX', '?nofx=1', false],
  ['revealed map', '', true],
  ['revealed, no culling', '?nocull=1', true],
  ['revealed, no paperFX', '?nofx=1', true],
];

async function run(browser, label, query, reveal) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const cdp = await page.context().newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function'
      && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => window.__startBenchGame(1337));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
  await page.waitForTimeout(400);

  if (reveal) {
    await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('MapScene');
      for (const land of scene.state.lands) {
        land.isVisible = true;
        land.isExplored = true;
      }
      scene.refresh();
    });
    await page.waitForTimeout(600);
  }

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const out = await page.evaluate(() => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('MapScene');
    const N = 150;
    for (let i = 0; i < 30; i += 1) game.step(performance.now(), 16);
    const t = performance.now();
    for (let i = 0; i < N; i += 1) game.step(performance.now(), 16);
    const perFrame = (performance.now() - t) / N;

    let visible = 0;
    let total = 0;
    const walk = (list, parentVisible) => {
      for (const obj of list) {
        total += 1;
        const shown = parentVisible && obj.visible !== false;
        if (shown) visible += 1;
        if (obj.list) walk(obj.list, shown);
      }
    };
    walk(scene.children.list, true);

    const tweens = scene.tweens.getTweens();
    const running = tweens.filter((tw) => tw.isPlaying && tw.isPlaying()).length;
    return {
      perFrame: +perFrame.toFixed(2),
      visible,
      total,
      tweens: tweens.length,
      running,
      culled: scene.viewIndex ? scene.viewIndex.culledCount : -1,
      indexed: scene.viewIndex ? scene.viewIndex.size : -1,
    };
  });
  await page.close();
  return { label, ...out, errors };
}

const browser = await chromium.launch();
const rows = [];
for (const [label, query, reveal] of CASES) {
  rows.push(await run(browser, label, query, reveal));
}
await browser.close();

console.log('label                    ms/frame   objs vis/tot   tweens run   indexed/culled');
for (const r of rows) {
  console.log(
    `${r.label.padEnd(24)} ${String(r.perFrame).padStart(7)}   ${String(r.visible).padStart(4)}/${String(r.total).padEnd(5)} `
    + `${String(r.tweens).padStart(6)} ${String(r.running).padStart(4)}   ${String(r.indexed).padStart(6)}/${r.culled}`
    + (r.errors.length ? `   ERRORS: ${r.errors[0]}` : ''),
  );
}
