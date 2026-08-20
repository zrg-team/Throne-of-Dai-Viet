// Which layer is putting trees in the river? Checks the scatter plan against the water, and then
// looks for anything else drawn near water that is not part of it.
import { chromium } from 'playwright';
import { buildMap, key } from './_hydrology.mjs';
const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
// The tree is edited while this runs; boot until the game answers.
for (let attempt = 1; ; attempt += 1) {
  try {
    await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
    await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
    await page.waitForTimeout(2600);
    if (await page.evaluate(() => !!window.__mandateState?.mapConfig)) break;
  } catch (error) { console.log('  boot ' + attempt + ': ' + String(error).slice(0, 70)); }
  if (attempt >= 5) throw new Error('game never booted');
  await page.waitForTimeout(2500);
}

const seed = await page.evaluate(() => window.__mandateState.mapConfig.seed);
const proposed = buildMap(seed, 'proposed');
const layout = proposed.coords.map((c) => {
  const cell = proposed.cells.get(key(c));
  return { q: c.q, r: c.r, wet: cell.terrain === 'water' ? (cell.waterKind ?? 'river') : null };
});
await page.evaluate((layout) => {
  const s = window.__mandateState;
  const byKey = new Map(s.hexTiles.map((t) => [`${t.coord.q},${t.coord.r}`, t]));
  for (const c of layout) {
    const t = byKey.get(`${c.q},${c.r}`);
    if (!t) continue;
    if (c.wet) { t.terrain = 'water'; t.waterKind = c.wet; }
    else if (t.terrain === 'water') t.terrain = 'plains';
  }
  s.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
  s.isPaused = true;
}, layout);
await page.waitForTimeout(500);
await page.evaluate(() => window.__phaserGame.scene.getScene('MapScene').drawMap());
await page.waitForTimeout(3000);

const out = await page.evaluate(async () => {
  const sc = window.__phaserGame.scene.getScene('MapScene');
  const s = window.__mandateState;
  const { axialToPixel } = await import('/src/map/hex.ts');
  const hexSize = s.mapConfig.hexSize;
  const tileSize = hexSize * 1.72;
  const wet = s.hexTiles.filter((t) => t.terrain === 'water')
    .map((t) => { const p = axialToPixel(t.coord, hexSize); return { x: sc.wx(p.x), y: sc.wy(p.y) }; });
  const nearest = (x, y) => {
    let best = Infinity;
    for (const w of wet) { const d = Math.hypot(x - w.x, y - w.y); if (d < best) best = d; }
    return best;
  };

  const plan = sc.mapRenderer.scatterPlan ?? [];
  const dists = plan.map((i) => nearest(i.x, i.y) / tileSize);
  dists.sort((a, b) => a - b);
  const inradius = Math.sqrt(3) / 2;

  // Anything else in the scene tree sitting over water.
  const others = [];
  const walk = (obj, depth) => {
    if (depth > 2 || !obj) return;
    const x = obj.x, y = obj.y;
    if (typeof x === 'number' && typeof y === 'number' && (x !== 0 || y !== 0)) {
      const d = nearest(x, y) / tileSize;
      if (d < inradius) others.push({ type: obj.type, name: obj.name ?? '', depth: obj.depth, d: +d.toFixed(2) });
    }
    if (obj.list) for (const child of obj.list) walk(child, depth + 1);
  };
  for (const child of sc.children.list) walk(child, 0);

  return {
    props: plan.length,
    minDist: +dists[0].toFixed(3),
    insideHex: dists.filter((d) => d < inradius).length,
    within095: dists.filter((d) => d < 0.95).length,
    inradius: +inradius.toFixed(3),
    otherObjectsOverWater: others.length,
    otherSample: others.slice(0, 12),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
