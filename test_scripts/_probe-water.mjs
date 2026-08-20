// Throwaway: what the map's water actually is right now — how much, where, in what shapes,
// and what the economy/war systems make of it. Plus screenshots of the ground at three zooms.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const OUT = 'output/water-probe';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

const boot = async (theme) => {
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate((t) => localStorage.setItem('mandate:map-theme:v1', t), theme);
  await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
  await page.waitForTimeout(2400);
};

await boot('dong-ho');

const stats = await page.evaluate(() => {
  const s = window.__mandateState;
  const tiles = s.hexTiles;
  const key = (c) => `${c.q},${c.r}`;
  const byKey = new Map(tiles.map((t) => [key(t.coord), t]));
  const counts = {};
  for (const t of tiles) counts[t.terrain] = (counts[t.terrain] ?? 0) + 1;

  // connected water bodies
  const seen = new Set();
  const bodies = [];
  const N = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  for (const t of tiles) {
    if (t.terrain !== 'water' || seen.has(key(t.coord))) continue;
    const stack = [t.coord]; seen.add(key(t.coord));
    const cells = [];
    while (stack.length) {
      const c = stack.pop(); cells.push(c);
      for (const [dq, dr] of N) {
        const nk = `${c.q+dq},${c.r+dr}`;
        const n = byKey.get(nk);
        if (n && n.terrain === 'water' && !seen.has(nk)) { seen.add(nk); stack.push(n.coord); }
      }
    }
    const qs = cells.map(c=>c.q), rs = cells.map(c=>c.r);
    bodies.push({ size: cells.length, qSpan: Math.max(...qs)-Math.min(...qs), rSpan: Math.max(...rs)-Math.min(...rs) });
  }
  bodies.sort((a,b)=>b.size-a.size);

  const lands = s.lands.map((l) => ({
    id: l.id, name: l.name, type: l.type, owner: l.ownerId,
    water: l.terrainSummary.water, rice: l.terrainSummary.riceFields,
    hexes: Object.values(l.terrainSummary).reduce((a,b)=>a+b,0),
    neighbors: l.neighbors.length,
  }));
  const withWater = lands.filter((l) => l.water > 0);

  // how many land-pairs are separated by water (i.e. a river cutting between neighbours)
  return {
    counts,
    totalTiles: tiles.length,
    waterTiles: counts.water ?? 0,
    bodies: bodies.slice(0, 12),
    bodyCount: bodies.length,
    landCount: lands.length,
    landsWithWater: withWater.length,
    waterPerLand: withWater.map(l=>`${l.name}:${l.water}/${l.hexes}`),
    lands,
    mapConfig: s.mapConfig,
  };
});

writeFileSync(`${OUT}/stats.json`, JSON.stringify(stats, null, 2));
console.log('terrain counts', stats.counts);
console.log('total', stats.totalTiles, 'water', stats.waterTiles, `(${(100*stats.waterTiles/stats.totalTiles).toFixed(1)}%)`);
console.log('water bodies', stats.bodyCount, 'largest', stats.bodies.map(b=>`${b.size}(${b.qSpan}x${b.rSpan})`).join(' '));
console.log('lands', stats.landCount, 'with any water', stats.landsWithWater);
console.log(stats.waterPerLand.join('  '));

const shoot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const zoomTo = async (z) => {
  await page.evaluate((z) => { const sc = window.__phaserGame.scene.getScene('MapScene'); sc?.cameras?.main?.setZoom(z); }, z);
  await page.waitForTimeout(1000);
};
// pan to the biggest water body so it is actually in frame
await page.evaluate(() => {
  const sc = window.__phaserGame.scene.getScene('MapScene');
  const s = window.__mandateState;
  const wet = s.hexTiles.filter(t=>t.terrain==='water');
  // interior water: has a dry neighbour but is not on the map rim
  const inner = wet.filter(t=>t.coord.r>6 && t.coord.r<46);
  const t = inner[Math.floor(inner.length/2)] ?? wet[0];
  if (t && sc) {
    const size = s.mapConfig.hexSize;
    const x = size*Math.sqrt(3)*(t.coord.q + t.coord.r/2), y = size*1.5*t.coord.r;
    sc.cameras.main.centerOn(x*1.72, y*1.72);
  }
});
for (const z of [0.7, 1.4, 2.6]) { await zoomTo(z); await shoot(`dongho-${z}`); }

for (const theme of ['ink', 'atlas']) {
  await boot(theme);
  await zoomTo(1.4); await shoot(`${theme}-1.4`);
}

console.log(errors.length ? errors.slice(0,8) : 'no console errors');
await browser.close();
