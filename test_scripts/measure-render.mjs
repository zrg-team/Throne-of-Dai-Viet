// Pure steady-state per-frame render cost: game.step with a small delta (< REALTIME_TICK_MS)
// so no realtime tick fires -> no refresh, no rebake -> just the WebGL render of the baked
// map + live objects. This is what actually determines mobile FPS during normal play.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cdp = await page.context().newCDPSession(page);
await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(400);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // mid-tier Android

const out = await page.evaluate(() => {
  const game = window.__phaserGame;
  const N = 200;
  // Warm up
  for (let i = 0; i < 20; i++) game.step(performance.now(), 16);
  const t = performance.now();
  for (let i = 0; i < N; i++) game.step(performance.now(), 16); // 16ms < 5500ms tick -> render only
  const perFrame = (performance.now() - t) / N;
  return { perFrameRenderMs: +perFrame.toFixed(2), impliedFps: +(1000 / perFrame).toFixed(0) };
});
console.log(`steady-state render: ${out.perFrameRenderMs} ms/frame  (~${out.impliedFps} fps headroom, 4x CPU throttle)`);
await browser.close();
