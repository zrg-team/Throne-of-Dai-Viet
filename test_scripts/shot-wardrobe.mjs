// The wardrobe, all of it, on one sheet.
//
// Four dynasties down, three tiers across, drawn at the scale a battlefield uses — and then the
// same host at each era so the progression can be seen rather than described. A grid of soldiers
// is the only honest way to check a figure: the numbers in `proportion.ts` say it is the right
// size, and nothing but looking says it is the right *soldier*.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/shot-wardrobe.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
mkdirSync('output/web-game', { recursive: true });

const browser = await chromium.launch();
// The game lays out in 390 design units and `applyRenderScale` zooms the camera to match, so a
// wider viewport simply falls outside it. High DPI instead: small figures, photographed large.
const page = await browser.newPage({ viewport: { width: 390, height: 720 }, deviceScaleFactor: 3 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

await page.evaluate(async () => {
  const devices = await import('/src/ui/ink/devices.ts');
  const { PIGMENT } = await import('/src/ui/ink/palette.ts');
  const scene = window.__phaserGame.scene.getScene('MenuScene');

  const layer = scene.add.container(0, 0).setDepth(9999);
  const bg = scene.add.graphics();
  bg.fillStyle(PIGMENT.diepHi, 1);
  bg.fillRect(0, 0, 390, 760);
  layer.add(bg);

  const label = (x, y, text, size = 12) => {
    const t = scene.add.text(x, y, text, {
      color: '#2a2118', fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: `${size}px`,
    });
    layer.add(t);
    return t;
  };

  label(12, 10, 'THE WARDROBE', 13);
  label(12, 26, 'four dynasties down, three tiers across', 9);

  const eras = [['ly', 'Lý  · founding'], ['tran', 'Trần · rivalry'],
    ['le', 'Later Lê · empires'], ['nguyen', 'Nguyễn · mandate']];
  const tiers = [[0, 'levy'], [1, 'trained'], [2, 'royal guard']];
  const arms = ['spear', 'bow', 'heavy'];

  tiers.forEach(([, name], ti) => label(96 + ti * 100, 44, name.toUpperCase(), 8));

  eras.forEach(([era, eraName], ei) => {
    const y = 96 + ei * 74;
    label(10, y - 30, eraName, 10);
    tiers.forEach(([tier], ti) => {
      arms.forEach((arm, ai) => {
        const g = scene.add.graphics();
        // 9x life size: a battlefield close-up, where every one of these marks is meant to read.
        // Drawn at the scale a battlefield close-up uses. Larger than this and the ink
        // strokes — which are a fixed share of the figure's height — merge into a blob.
        devices.figure(g, 96 + ti * 100 + ai * 28, y, 3.4, PIGMENT.muc, {
          era, tier, arm, accent: PIGMENT.son,
        });
        layer.add(g);
      });
    });
  });

  // The same host, five hundred men, at each era — the progression, as a block.
  label(10, 410, 'THE SAME HOST, AS THE DYNASTY CLIMBS', 9);
  eras.forEach(([era], ei) => {
    const g = scene.add.graphics();
    devices.drawHost(g, 14 + ei * 94, 500, 500, 17, PIGMENT.muc, 1.5, {
      era, tier: ei === 0 ? 0 : ei === 3 ? 2 : 1, accent: PIGMENT.son,
      units: { spearmen: 300, archers: 140, heavyInfantry: 60 },
    });
    layer.add(g);
  });
});

await page.waitForTimeout(700);
await page.screenshot({ path: 'output/web-game/wardrobe.png' });
console.log('wardrobe sheet written; errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
