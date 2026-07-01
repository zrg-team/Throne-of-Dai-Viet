// Isolates the cost of MapScene.refresh vs UIScene.refresh (the state-changed handler),
// to see how much of a tick is map rendering vs HUD rebuilding now that the map is baked.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(400);

const out = await page.evaluate(() => {
  const game = window.__phaserGame;
  const map = game.scene.getScene('MapScene');
  const ui = game.scene.getScene('UIScene');
  const N = 400;

  // UIScene.refresh runs on its own 'state-changed' event. Time that path alone
  // (no map work, no simulation) -- pure HUD rebuild cost.
  const t0 = performance.now();
  for (let i = 0; i < N; i++) ui.events.emit('state-changed');
  const uiMs = (performance.now() - t0) / N;

  // MapScene.refresh with no static change (bake/node signatures unchanged):
  // the per-frame steady-state path (markers + emit), no rebake.
  const t1 = performance.now();
  for (let i = 0; i < N; i++) map.refresh();
  const mapNoStaticMs = (performance.now() - t1) / N;

  return { uiRefreshMs: +uiMs.toFixed(3), mapRefreshNoStaticMs: +mapNoStaticMs.toFixed(3) };
});
console.log(JSON.stringify(out, null, 2));
console.log(`UIScene.refresh: ${out.uiRefreshMs} ms   MapScene.refresh(no static change): ${out.mapRefreshNoStaticMs} ms`);
await browser.close();
