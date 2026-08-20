// Plain look at the generated map. No injection any more — the generator does this for real.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.DEV_URL ?? 'http://localhost:5190';
const OUT = 'output/water'; mkdirSync(OUT, { recursive: true });
const ZOOM = process.env.ZOOM ? Number(process.env.ZOOM) : null;
const NAME = process.env.NAME ?? 'map';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
for (let attempt = 1; attempt <= 4; attempt += 1) {
  try {
    await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
    await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
    await page.waitForTimeout(2400);
    if (await page.evaluate(() => !!window.__mandateState?.mapConfig)) break;
  } catch { /* retry */ }
  await page.waitForTimeout(1500);
}
const quiet = () => page.evaluate(() => {
  const s = window.__mandateState; if (!s) return;
  s.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
  s.isPaused = true; s.activePoliticsCard = undefined; s.pendingCourtRequest = undefined; s.activeHeroDraft = undefined;
});
await page.evaluate((aim) => { window.__AIM = aim; }, process.env.AIM ?? '');
await quiet();
await page.waitForTimeout(500);
await page.evaluate(() => window.__phaserGame.scene.getScene('MapScene').drawMap());
await page.waitForTimeout(3000);
if (ZOOM) { await page.evaluate((z) => window.__phaserGame.scene.getScene('MapScene').cameras.main.setZoom(z), ZOOM); await page.waitForTimeout(900); }
// Pan with the scene's own clamp; centerOn leaves MapScene somewhere it cannot recover from.
await page.evaluate(() => {
  const sc = window.__phaserGame.scene.getScene('MapScene');
  const cam = sc.cameras.main;
  const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  let tx = sc.worldWidth / 2, ty = sc.worldHeight / 2;
  if (window.__AIM === 'water') {
    const s = window.__mandateState;
    const inland = s.hexTiles.filter((t) => t.terrain === 'water' && t.waterKind && t.waterKind !== 'sea');
    const pick = inland[Math.floor(inland.length * 0.55)];
    if (pick) {
      const size = s.mapConfig.hexSize;
      tx = sc.wx(size * Math.sqrt(3) * (pick.coord.q + pick.coord.r / 2));
      ty = sc.wy(size * 1.5 * pick.coord.r);
    }
  }
  cam.scrollX = clamp(tx - vw / 2, 0, Math.max(0, sc.worldWidth - vw));
  cam.scrollY = clamp(ty - vh / 2, 0, Math.max(0, sc.worldHeight - vh));
});
await page.waitForTimeout(900);
await quiet();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/${NAME}.png`, clip: { x: 0, y: 190, width: 390, height: 560 } });
const active = await page.evaluate(() => window.__phaserGame.scene.scenes.filter((s) => s.scene.isActive()).map((s) => s.scene.key));
console.log('shot', NAME, '| scenes:', active.join(','), errors.length ? errors.slice(0, 3) : '');
await browser.close();
