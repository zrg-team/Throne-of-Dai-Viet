import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? 'http://localhost:5190';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  const s = window.__mandateState;
  s.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
  s.isPaused = true;
  window.__phaserGame.scene.getScene('MapScene').drawMap();
});
await page.waitForTimeout(2800);
const out = await page.evaluate(() => {
  const sc = window.__phaserGame.scene.getScene('MapScene');
  const plan = sc.mapRenderer.scatterPlan ?? [];
  const byKind = {};
  for (const item of plan) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
  const s = window.__mandateState;
  return {
    total: plan.length,
    byKind,
    riverHexes: s.hexTiles.filter((t) => t.waterKind === 'river').length,
    lakeHexes: s.hexTiles.filter((t) => t.waterKind === 'lake').length,
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
