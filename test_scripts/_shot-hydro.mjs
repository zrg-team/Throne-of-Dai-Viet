// Paints the proposed hydrology onto the running game and lets the real Đông Hồ renderer draw it.
// Only the water layer is swapped — provinces, settlements, roads and terrain stay as generated —
// so the difference in the screenshots is the generator change and nothing else.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { buildMap, summarise, key } from './_hydrology.mjs';

const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const OUT = 'output/water-probe/doc';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(2600);

const seed = await page.evaluate(() => window.__mandateState.mapConfig.seed);
console.log('live map seed', seed);

const proposed = buildMap(seed, 'proposed');
const stats = summarise(proposed);
console.log('proposed:', JSON.stringify(stats.kinds), 'water', stats.waterTiles,
  `(${stats.waterShare}%)`, 'lakes', stats.lakeBodies, 'prov w>0', stats.withWater, 'harbourable', stats.harbourable);

const layout = proposed.coords.map((c) => {
  const cell = proposed.cells.get(key(c));
  return { q: c.q, r: c.r, wet: cell.terrain === 'water' ? (cell.waterKind ?? 'river') : null };
});

// Hold the world still and clear anything that would sit over the map: this is a picture of
// terrain, and a court card in front of it is a picture of a court card.
const quiet = () => page.evaluate(() => {
  const s = window.__mandateState;
  if (!s) return;
  s.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
  s.isPaused = true;
  s.activePoliticsCard = undefined;
  s.pendingCourtRequest = undefined;
  s.activeHeroDraft = undefined;
});

const applied = await page.evaluate((layout) => {
  const s = window.__mandateState;
  const byKey = new Map(s.hexTiles.map((t) => [`${t.coord.q},${t.coord.r}`, t]));
  let wetted = 0, dried = 0;
  for (const cell of layout) {
    const tile = byKey.get(`${cell.q},${cell.r}`);
    if (!tile) continue;
    if (cell.wet) {
      if (tile.terrain !== 'water') wetted += 1;
      tile.terrain = 'water';
      tile.waterKind = cell.wet;
    } else if (tile.terrain === 'water') {
      tile.terrain = 'plains';
      dried += 1;
    }
  }
  return { wetted, dried, total: s.hexTiles.filter((t) => t.terrain === 'water').length };
}, layout);
console.log('applied to live state:', JSON.stringify(applied));

await quiet();
await page.evaluate(() => window.__phaserGame.scene.getScene('MapScene').drawMap());
await page.waitForTimeout(2800);

const shoot = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${n}.png`, clip: { x: 0, y: 190, width: 390, height: 560 } }); console.log('shot', n); };
const shootTight = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${n}.png`, clip: { x: 55, y: 330, width: 280, height: 280 } }); console.log('shot', n); };
const zoom = async (z) => { await page.evaluate((z) => window.__phaserGame.scene.getScene('MapScene').cameras.main.setZoom(z), z); await page.waitForTimeout(1100); };

if ((process.env.SHOT ?? 'wide') === 'wide') { await zoom(0.55); await quiet(); await shoot('e-proposed-wide'); }
// Find a real crossing the way TrafficRenderer does — build each road curve, sample it, and look
// for a wet run — then frame it with the scene's own transform rather than a hand-rolled one.
const found = await page.evaluate(async () => {
  const sc = window.__phaserGame.scene.getScene('MapScene');
  const s = window.__mandateState;
  if (!s) return null;
  const { buildRoadCurve } = await import('/src/map/roadCurve.ts');
  const { axialToPixel } = await import('/src/map/hex.ts');
  const wx = (v) => sc.wx(v), wy = (v) => sc.wy(v);
  const hexSize = s.mapConfig.hexSize;
  const cell = hexSize * 1.72;
  const reach = cell * 0.5 * Math.sqrt(3) * 0.5 + cell * 0.18;
  const wet = s.hexTiles.filter((t) => t.terrain === 'water').map((t) => {
    const p = axialToPixel(t.coord, hexSize);
    return { x: wx(p.x), y: wy(p.y), r: t.coord.r };
  });
  const onWater = (x, y) => wet.some((w) => Math.hypot(x - w.x, y - w.y) <= reach);

  const anchor = (land) => sc.getSettlementAnchor(land);
  const hits = [];
  for (const land of s.lands) {
    for (const nid of land.neighbors) {
      const nb = s.lands.find((l) => l.id === nid);
      if (!nb || land.id > nb.id) continue;
      let curve;
      try { curve = buildRoadCurve(s, anchor(land), anchor(nb), `${land.id}|${nid}`, wx, wy); } catch { continue; }
      const pts = curve.getSpacedPoints(64);
      let run = -1;
      for (let i = 0; i < pts.length; i += 1) {
        const w = onWater(pts[i].x, pts[i].y);
        if (w && run < 0) run = i;
        else if (!w && run >= 0) {
          if (i - 1 - run >= 1) hits.push({ x: pts[Math.round((run + i - 1) / 2)].x, y: pts[Math.round((run + i - 1) / 2)].y, len: i - run });
          run = -1;
        }
      }
    }
  }
  hits.sort((a, b) => b.len - a.len);
  if (!hits.length) return { count: 0 };
  sc.cameras.main.centerOn(hits[0].x, hits[0].y);
  return { count: hits.length, at: hits[0] };
});
console.log('road-over-water crossings found:', JSON.stringify(found));
const centreOnCrossing = async () => {
  if (!found?.at) return;
  await page.evaluate((at) => {
    window.__phaserGame.scene.getScene('MapScene').cameras.main.centerOn(at.x, at.y);
  }, found.at);
  await page.waitForTimeout(500);
};

// One shot per browser session. Driving the live game through several zooms and redraws in one
// run kept tipping it back to the menu, and a picture of the main menu is not a picture of a map.
const SHOT = process.env.SHOT ?? 'wide';
if (SHOT === 'close') {
  // Zoom first, then aim: the scene clamps every camera move against the current zoom.
  await zoom(2.9); await centreOnCrossing(); await quiet(); await shootTight('g-bridge-close');
} else if (SHOT === 'mid') {
  await zoom(1.9); await centreOnCrossing(); await quiet(); await shoot('f-proposed-bridge');
}

console.log(errors.length ? errors.slice(0, 6) : 'no console errors');
await browser.close();
