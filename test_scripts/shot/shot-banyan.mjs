// The cây đa on its own, at map size and at 3×, in every season.
//
// The banyan is the one prop a Vietnamese player looks straight at — it is the tree of the village
// gate — and it is drawn at ~30 design px on the map, which is far too small to judge anything by
// in a map screenshot. So it is drawn here on bare điệp, alone, at the size it is really drawn and
// again magnified, so the silhouette can actually be read.
//
// Usage: node test_scripts/shot/shot-banyan.mjs [out-name]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5199';
const OUT = 'output/banyan';
const NAME = process.argv[2] ?? 'banyan';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

await page.goto(`${BASE}/?capture=1&nofx=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(600);

const report = await page.evaluate(async () => {
  const props = await import('/src/ui/ink/props.ts');
  const { PIGMENT } = await import('/src/ui/ink/palette.ts');
  const season = await import('/src/ui/ink/season.ts');
  const { GROUND_SCALE } = await import('/src/ui/ink/proportion.ts');
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  // Everything the menu already drew is in the way of the subject.
  for (const child of [...scene.children.list]) child.setVisible?.(false);

  const g = scene.add.graphics().setDepth(9999);
  g.fillStyle(PIGMENT.diep, 1);
  g.fillRect(0, 0, 390, 900);

  // Row 1 — magnified 3×, so the silhouette, the roots and the trunk can be read at all.
  season.setFoliageSeason('Summer');
  const big = scene.add.graphics().setDepth(10000);
  big.setScale(3).setPosition(0, 0);
  props.banyan(big, 65, 100, GROUND_SCALE, 5001);
  const big2 = scene.add.graphics().setDepth(10000).setScale(3);
  props.banyan(big2, 65, 205, GROUND_SCALE, 91);

  // Row 2 — map size, four seeds side by side, which is how a player ever sees it.
  const row = scene.add.graphics().setDepth(10000);
  for (let i = 0; i < 4; i += 1) props.banyan(row, 55 + i * 90, 700, GROUND_SCALE, 300 + i * 37);

  // Row 3 — the seasons, map size. The banyan is evergreen; winter states itself in snow.
  let x = 55;
  for (const s of ['Spring', 'Summer', 'Autumn', 'Winter']) {
    season.setFoliageSeason(s);
    props.banyan(row, x, 790, GROUND_SCALE, 777);
    x += 90;
  }
  season.setFoliageSeason('Summer');

  // A house beside it, so the scale claim is visible rather than asserted.
  props.house(row, 250, 700, GROUND_SCALE, 12);
  return { ok: true };
});

await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/${NAME}.png` });

// ── and then in place, because a prop that reads on bare paper can still cover three roofs ──
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(2200);
const framed = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  const state = scene.state;
  state.isPaused = true;
  state.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
  scene.refresh();
  window.__phaserGame.scene.getScene('UIScene')?.scene.setVisible(false);
  // A shrine seat always draws a da; a village only draws one on half its seeds.
  const shrineLands = new Set(state.hexTiles.filter((t) => t.terrain === 'shrine').map((t) => t.landId));
  const land = state.lands.find((l) => shrineLands.has(l.id)) ?? state.lands.find((l) => l.hasVillage);
  const node = land && scene.landNodes.get(land.id);
  if (!node) return null;
  scene.cameras.main.removeBounds();
  scene.cameras.main.setZoom(2.4);
  scene.cameras.main.centerOn(node.x, node.y);
  return { what: land.name, shrine: shrineLands.has(land.id), x: node.x, y: node.y };
});
await page.waitForTimeout(900);
// Cropped to where the settlement actually landed, not to the middle of the canvas: `centerOn` does
// not survive the scene's own camera handling, which is how this first produced a shot of open sea.
const clip = await page.evaluate(({ x, y }) => {
  const game = window.__phaserGame;
  const cam = game.scene.getScene('MapScene').cameras.main;
  const canvas = game.canvas.getBoundingClientRect();
  const sx = canvas.width / game.scale.width;
  const sy = canvas.height / game.scale.height;
  const px = canvas.left + (x - cam.scrollX) * cam.zoom * sx;
  const py = canvas.top + (y - cam.scrollY) * cam.zoom * sy;
  const size = 520;
  return {
    x: Math.max(canvas.left, Math.min(canvas.left + canvas.width - size, px - size / 2)),
    y: Math.max(canvas.top, Math.min(canvas.top + canvas.height - size, py - size / 2)),
    width: size,
    height: size,
  };
}, framed);
await page.screenshot({ path: `${OUT}/${NAME}-in-place.png`, clip });
console.log('in place', JSON.stringify(framed));

await browser.close();
console.log('shot', `${OUT}/${NAME}.png`, JSON.stringify(report));
if (errors.length) console.log('ERRORS', errors.slice(0, 5).join(' | '));
