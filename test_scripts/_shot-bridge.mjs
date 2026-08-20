// One picture, one browser. SHOT=wide|mid|close, ZOOM overrides the zoom.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { buildMap, key } from './_hydrology.mjs';

const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const OUT = 'output/water-probe/doc';
const SHOT = process.env.SHOT ?? 'mid';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type().toUpperCase() + ' ' + m.text()); });

// The working tree is edited while this runs, so Vite hot-reloads mid-flight and the game can be
// half-built when we ask it a question. Boot until it answers.
const boot = async () => {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
      await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
      await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
      await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
      await page.waitForTimeout(2600);
      const ok = await page.evaluate(() => !!window.__mandateState?.mapConfig);
      if (ok) return;
      console.log(`  boot attempt ${attempt}: no state, retrying`);
    } catch (error) {
      console.log('  boot attempt ' + attempt + ' failed: ' + String(error).slice(0, 90));
    }
    await page.waitForTimeout(2500);
  }
  throw new Error('game never booted cleanly — the working tree is probably mid-edit');
};
await boot();

const where = async (tag) => console.log('  scene@' + tag + ':', (await page.evaluate(() => window.__phaserGame.scene.scenes.filter((x) => x.scene.isActive()).map((x) => x.scene.key))).join(','));
await where('after-boot');
const seed = await page.evaluate(() => window.__mandateState.mapConfig.seed);
const proposed = buildMap(seed, 'proposed');
const layout = proposed.coords.map((c) => {
  const cell = proposed.cells.get(key(c));
  return { q: c.q, r: c.r, wet: cell.terrain === 'water' ? (cell.waterKind ?? 'river') : null };
});

// Swap only the water layer, hold the world still, redraw once.
const skipSwap = process.env.KEEP_CURRENT === '1';
const setup = await page.evaluate(({ layout, skipSwap }) => {
  const s = window.__mandateState;
  const byKey = new Map(s.hexTiles.map((t) => [`${t.coord.q},${t.coord.r}`, t]));
  if (!skipSwap) {
    for (const c of layout) {
      const tile = byKey.get(`${c.q},${c.r}`);
      if (!tile) continue;
      if (c.wet) { tile.terrain = 'water'; tile.waterKind = c.wet; }
      else if (tile.terrain === 'water') tile.terrain = 'plains';
    }
  }
  s.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
  s.isPaused = true;
  s.activePoliticsCard = undefined;
  s.pendingCourtRequest = undefined;
  s.activeHeroDraft = undefined;
  return s.hexTiles.filter((t) => t.terrain === 'water').length;
}, { layout, skipSwap });
// Let the visibility flags settle for a frame before asking for the redraw: drawMap reads them,
// and a redraw issued in the same tick as the mutation comes out half fogged.
await page.waitForTimeout(600);
await page.evaluate(() => window.__phaserGame.scene.getScene('MapScene').drawMap());
await page.waitForTimeout(3200);
console.log('water hexes now', setup);
await where('after-redraw');

// Where does a road actually cross water? Same test TrafficRenderer runs.
// MEASURE=1 asks which layer is putting things on the water, using the same live scene the
// screenshot is about to be taken of.
if (process.env.MEASURE === '1') {
  const m = await page.evaluate(async () => {
    const sc = window.__phaserGame.scene.getScene('MapScene');
    const st = window.__mandateState;
    const { axialToPixel } = await import('/src/map/hex.ts');
    const hexSize = st.mapConfig.hexSize;
    const tileSize = hexSize * 1.72;
    const wet = st.hexTiles.filter((t) => t.terrain === 'water')
      .map((t) => { const p = axialToPixel(t.coord, hexSize); return { x: sc.wx(p.x), y: sc.wy(p.y) }; });
    const nearest = (x, y) => {
      let best = Infinity;
      for (const w of wet) { const d = Math.hypot(x - w.x, y - w.y); if (d < best) best = d; }
      return best;
    };
    const inradius = Math.sqrt(3) / 2;
    const plan = sc.mapRenderer.scatterPlan ?? [];
    const dists = plan.map((i) => nearest(i.x, i.y) / tileSize).sort((a, b) => a - b);

    // Anything else in the scene graph sitting over water.
    const others = [];
    const walk = (obj, depth) => {
      if (depth > 2 || !obj) return;
      if (typeof obj.x === 'number' && typeof obj.y === 'number' && (obj.x || obj.y)) {
        const d = nearest(obj.x, obj.y) / tileSize;
        if (d < inradius) others.push({ type: obj.type, depth: obj.depth, d: +d.toFixed(2) });
      }
      if (obj.list) for (const child of obj.list) walk(child, depth + 1);
    };
    for (const child of sc.children.list) walk(child, 0);

    const byType = {};
    for (const o of others) byType[o.type + '@' + o.depth] = (byType[o.type + '@' + o.depth] ?? 0) + 1;
    return {
      props: plan.length,
      closestPropTileRadii: +dists[0].toFixed(3),
      propsInsideAWaterHex: dists.filter((d) => d < inradius).length,
      inradius: +inradius.toFixed(3),
      otherObjectsOverWater: others.length,
      byType,
    };
  });
  console.log('MEASURE', JSON.stringify(m, null, 2));
}

await page.evaluate((aim) => { window.__AIM = aim; }, process.env.AIM ?? '');
const found = await page.evaluate(async () => {
  const sc = window.__phaserGame.scene.getScene('MapScene');
  const s = window.__mandateState;
  const { buildRoadCurve } = await import('/src/map/roadCurve.ts');
  const { axialToPixel } = await import('/src/map/hex.ts');
  const wx = (v) => sc.wx(v), wy = (v) => sc.wy(v);
  const hexSize = s.mapConfig.hexSize;
  const cell = hexSize * 1.72;
  const reach = cell * 0.5 * Math.sqrt(3) * 0.5 + cell * 0.18;
  // Bucketed exactly like TrafficRenderer.waterIndex — a linear scan of every wet cell per sample
  // blocks the page for seconds, and a stalled page drops the game back to the menu.
  const buckets = new Map();
  for (const t of s.hexTiles) {
    if (t.terrain !== 'water') continue;
    const p = axialToPixel(t.coord, hexSize);
    const pt = { x: wx(p.x), y: wy(p.y) };
    const k = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`;
    (buckets.get(k) ?? buckets.set(k, []).get(k)).push(pt);
  }
  const onWater = (x, y) => {
    const bx = Math.floor(x / cell), by = Math.floor(y / cell);
    for (let ox = -1; ox <= 1; ox += 1) for (let oy = -1; oy <= 1; oy += 1) {
      for (const w of buckets.get(`${bx + ox}:${by + oy}`) ?? []) {
        if (Math.hypot(x - w.x, y - w.y) <= reach) return true;
      }
    }
    return false;
  };
  const hits = [];
  let roadsWithBridge = 0;
  for (const land of s.lands) {
    for (const nid of land.neighbors) {
      const nb = s.lands.find((l) => l.id === nid);
      if (!nb || land.id > nb.id) continue;
      let curve;
      try { curve = buildRoadCurve(s, sc.getSettlementAnchor(land), sc.getSettlementAnchor(nb), `${land.id}|${nid}`, wx, wy); } catch { continue; }
      const pts = curve.getSpacedPoints(64);
      let run = -1;
      let roadHit = false;
      for (let i = 0; i < pts.length; i += 1) {
        const w = onWater(pts[i].x, pts[i].y);
        if (w && run < 0) run = i;
        else if (!w && run >= 0) {
          if (i - 1 - run >= 1) {
            const m = pts[Math.round((run + i - 1) / 2)];
            const wetLen = Math.hypot(pts[i - 1].x - pts[run].x, pts[i - 1].y - pts[run].y);
            // Same rule the renderer applies: only a span short enough to be a crossing counts.
            if (wetLen <= cell * 4) { hits.push({ x: m.x, y: m.y, len: i - run }); roadHit = true; }
          }
          run = -1;
        }
      }
      if (roadHit) roadsWithBridge += 1;
    }
  }
  hits.sort((a, b) => b.len - a.len);
  if (window.__AIM === 'water') {
    // Middle of the biggest inland water body, for looking at what is standing in it.
    const inland = s.hexTiles.filter((t) => t.terrain === 'water' && t.waterKind && t.waterKind !== 'sea');
    if (inland.length) {
      const mid = inland[Math.floor(inland.length * 0.62)];
      const p = axialToPixel(mid.coord, hexSize);
      return { count: hits.length, at: { x: wx(p.x), y: wy(p.y) } };
    }
  }
  return { count: hits.length, roads: roadsWithBridge, at: hits[Math.min(1, hits.length - 1)] ?? null };
});
console.log('wet spans:', found.count, '| bridges drawn (one per road):', found.roads);
await where('after-search');

// Changing the camera zoom is what keeps tipping this run over, so it is optional: with ZOOM unset
// the scene keeps the zoom it opened at, which is already close enough to read a bridge.
if (process.env.ZOOM) {
  await page.evaluate((z) => window.__phaserGame.scene.getScene('MapScene').cameras.main.setZoom(Number(z)), process.env.ZOOM);
  await page.waitForTimeout(900);
}
const target = SHOT === 'wide' ? 'centre' : (found.at ? 'crossing' : null);
if (target) {
  // Not `centerOn`: MapScene deliberately sets no Phaser bounds and clamps every move itself, so
  // an unclamped camera jump leaves it somewhere the scene cannot recover from. This is the same
  // clamp the drag-pan uses, expressed in world units read off the camera.
  await page.evaluate((at) => {
    const sc = window.__phaserGame.scene.getScene('MapScene');
    const cam = sc.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const to = at ?? { x: sc.worldWidth / 2, y: sc.worldHeight / 2 };
    cam.scrollX = clamp(to.x - viewW / 2, 0, Math.max(0, sc.worldWidth - viewW));
    cam.scrollY = clamp(to.y - viewH / 2, 0, Math.max(0, sc.worldHeight - viewH));
  }, target === 'centre' ? null : found.at);
  await page.waitForTimeout(1100);
}
await page.evaluate(() => {
  const s = window.__mandateState;
  if (!s) return;
  s.isPaused = true;
  s.activePoliticsCard = undefined;
  s.pendingCourtRequest = undefined;
});
await page.waitForTimeout(900);
await where('after-camera');
const clip = SHOT === 'close'
  ? { x: 120, y: 528, width: 210, height: 135 }
  : { x: 0, y: 190, width: 390, height: 560 };
const name = process.env.NAME ?? (SHOT === 'close' ? 'g-bridge-close' : SHOT === 'wide' ? 'e-proposed-wide' : 'f-proposed-bridge');
await page.screenshot({ path: `${OUT}/${name}.png`, clip });
console.log('shot', name, errors.length ? errors.slice(0, 3) : '');
await browser.close();
