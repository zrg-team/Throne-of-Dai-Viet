import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(2600);
// reveal the whole map so the water reads against real terrain, not fog
await page.evaluate(() => {
  const s = window.__mandateState;
  s.lands.forEach(l => { l.isVisible = true; l.isExplored = true; });
  const sc = window.__phaserGame.scene.getScene('MapScene');
  sc.cameras.main.setZoom(0.55);
  sc.drawMap?.();
});
await page.waitForTimeout(2600);
await page.screenshot({ path: 'output/water-probe/doc/d-whole-map.png', clip: { x: 0, y: 190, width: 390, height: 560 } });
console.log('ok');
await browser.close();
