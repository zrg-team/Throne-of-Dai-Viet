import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? 'http://localhost:5190';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(2500);
const out = await page.evaluate(async () => {
  const sc = window.__phaserGame.scene.getScene('MapScene');
  const s = window.__mandateState;
  const B = await import('/src/map/boundary.ts');
  const hexSize = s.mapConfig.hexSize;
  const MAP_SCALE = 1.72;
  const map = new Map(s.hexTiles.map((t) => [`${t.coord.q},${t.coord.r}`, t]));
  const origin = { x: sc.wx(0), y: sc.wy(0) };
  const edges = B.traceRegionEdges(s.hexTiles, map, hexSize,
    (v) => origin.x + v * MAP_SCALE, (v) => origin.y + v * MAP_SCALE,
    (t) => t.terrain === 'water');
  const closed = B.weldLoops(edges, false);
  const open = B.weldLoops(edges, true);
  return {
    waterTiles: s.hexTiles.filter((t) => t.terrain === 'water').length,
    edges: edges.length,
    closedLoops: closed.length,
    allChains: open.length,
    longest: open.length ? Math.max(...open.map((l) => l.length)) : 0,
    sampleEdge: edges[0],
    hasTraceRegionEdges: typeof B.traceRegionEdges === 'function',
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
