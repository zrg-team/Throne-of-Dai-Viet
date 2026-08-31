import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/conquest-dongho-review/marker-runtime-final';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

await page.goto(`${BASE}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(2200);

await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  for (const land of scene.state.lands) {
    land.isVisible = true;
    land.isExplored = true;
  }
  scene.refresh();
  const first = scene.state.lands.find((land) => land.hasVillage && land.neighbors.some(
    (id) => scene.state.lands.find((candidate) => candidate.id === id)?.hasVillage,
  ));
  const second = scene.state.lands.find((land) => land.id === first.neighbors.find(
    (id) => scene.state.lands.find((candidate) => candidate.id === id)?.hasVillage,
  ));
  const a = scene.getVisibleLandMarkerPoint(first);
  const b = scene.getVisibleLandMarkerPoint(second);
  scene.cameras.main.setZoom(1.4).centerOn((a.x + b.x) / 2, (a.y + b.y) / 2);
  scene.add.existing(scene.mapItems.createProgressBadge(a.x, a.y, 2, 6, 'battle').setDepth(90));
  scene.add.existing(scene.mapItems.createProgressBadge(b.x, b.y, 4, 6, 'siege').setDepth(90));
});

await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/battle-siege-900ms.png` });
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/battle-siege-1800ms.png` });

await browser.close();
console.log(errors.length ? errors.join('\n') : 'no console errors');
process.exit(errors.length ? 1 : 0);
