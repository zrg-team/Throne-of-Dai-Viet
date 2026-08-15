// Renders the props at the sizes the map actually draws them, magnified, so shape can be judged.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('output/props', { recursive: true });
const BASE = 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4 });
const errs = [];
page.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`CONSOLE ${m.text()}`); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const { farmer } = await import('/src/ui/ink/props.ts');
  const { bakedBuffalo, propImage } = await import('/src/ui/ink/sprites.ts');
  const plate = scene.add.graphics().setDepth(998);
  plate.fillStyle(0xe9dfc2, 1); plate.fillRect(0, 300, 390, 500);
  // A layer scaled up so the small real sizes can be inspected: the geometry is what the map draws.
  const zoom = scene.add.container(0, 0).setDepth(999);
  const g = scene.add.graphics();
  zoom.add(g);
  // The three sizes the map uses: crop patch 0.85, farm cluster 0.9, open-country scatter ~1.4.
  [0.85, 0.9, 1.4].forEach((s, row) => {
    for (let i = 0; i < 5; i += 1) farmer(g, 16 + i * 22, 90 + row * 26, s, 700 + i * 41 + row * 7);
  });
  zoom.setScale(4);
  zoom.setPosition(10, 20);
  // Buffalo at their real instance scales.
  [0.85, 1.0, 1.35].forEach((s, i) => {
    const img = propImage(scene, bakedBuffalo(scene, 200 + i * 91, i === 1), 60 + i * 120, 700, s);
    img.setDepth(999); img.setScale(img.scaleX * 3.5, img.scaleY * 3.5);
  });
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'output/props/lod-farmers.png', clip: { x: 0, y: 330, width: 390, height: 330 } });
await page.screenshot({ path: 'output/props/lod-buffalo.png', clip: { x: 0, y: 600, width: 390, height: 130 } });
console.log(errs.length ? errs.slice(0,3).join('\n') : 'ok');
await browser.close();
