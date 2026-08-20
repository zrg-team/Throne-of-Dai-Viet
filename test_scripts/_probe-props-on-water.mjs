// Are trees and mountains drawn standing in the river? Reads the renderer's own scatter plan and
// inverts every prop position back to a hex, for the shipped map and for the proposed hydrology.
import { chromium } from 'playwright';
import { buildMap, key } from './_hydrology.mjs';

const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(2600);

const measure = async (label) => page.evaluate((label) => {
  const sc = window.__phaserGame.scene.getScene('MapScene');
  const s = window.__mandateState;
  const hexSize = s.mapConfig.hexSize;
  const MAP_SCALE = 1.72;
  const plan = sc.mapRenderer.scatterPlan ?? [];
  const relief = sc.mapRenderer.reliefPlan ?? [];
  const offX = sc.hexOffsetX ?? 0, offY = sc.hexOffsetY ?? 0;

  const roundHex = (q, r) => {
    const cx = q, cz = r, cy = -cx - cz;
    let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
    const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return { q: rx, r: rz };
  };
  const hexAt = (wx, wy) => {
    const x = wx / MAP_SCALE + offX, y = wy / MAP_SCALE + offY;
    const q = ((Math.sqrt(3) / 3) * x - y / 3) / hexSize;
    const r = ((2 / 3) * y) / hexSize;
    return roundHex(q, r);
  };
  const terrainAt = new Map(s.hexTiles.map((t) => [`${t.coord.q},${t.coord.r}`, t.terrain]));

  let onWater = 0, total = 0, offOwnCell = 0;
  for (const item of plan) {
    total += 1;
    const h = hexAt(item.x, item.y);
    if (terrainAt.get(`${h.q},${h.r}`) === 'water') onWater += 1;
  }
  // Ranges: sample along each range's foot line and see if any of it stands over water.
  let rangesOverWater = 0, rangeWaterCells = 0;
  for (const rp of relief) {
    const b = rp.bounds ?? {};
    const left = b.left ?? b.x0 ?? b.x;
    const right = b.right ?? b.x1 ?? (b.x != null && b.width != null ? b.x + b.width : undefined);
    const top = b.top ?? b.y0 ?? b.y;
    const foot = rp.footY;
    if (left == null || right == null || foot == null) continue;
    let hit = false;
    // Sample the whole footprint box, not just the foot line: a massif's body is what covers ground.
    for (let t = 0; t <= 1.0001; t += 0.08) {
      for (const yy of [foot, (top ?? foot) * 0.5 + foot * 0.5]) {
        const h = hexAt(left + (right - left) * t, yy);
        if (terrainAt.get(`${h.q},${h.r}`) === 'water') { hit = true; rangeWaterCells += 1; }
      }
    }
    if (hit) rangesOverWater += 1;
  }

  return {
    label, props: total, propsOnWater: onWater,
    pct: total ? ((onWater / total) * 100).toFixed(1) : '0',
    ranges: relief.length, rangesOverWater, rangeWaterCells,
    waterHexes: s.hexTiles.filter((t) => t.terrain === 'water').length,
    reliefKeys: relief[0] ? Object.keys(relief[0]) : [],
  };
}, label);

await page.evaluate(() => {
  const s = window.__mandateState;
  s.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
  s.isPaused = true;
  window.__phaserGame.scene.getScene('MapScene').drawMap();
});
await page.waitForTimeout(2600);
console.log('SHIPPED  ', JSON.stringify(await measure('shipped')));

// Now the proposed hydrology, same map.
const seed = await page.evaluate(() => window.__mandateState.mapConfig.seed);
const proposed = buildMap(seed, 'proposed');
const layout = proposed.coords.map((c) => {
  const cell = proposed.cells.get(key(c));
  return { q: c.q, r: c.r, wet: cell.terrain === 'water' ? (cell.waterKind ?? 'river') : null };
});
await page.evaluate((layout) => {
  const s = window.__mandateState;
  const byKey = new Map(s.hexTiles.map((t) => [`${t.coord.q},${t.coord.r}`, t]));
  for (const cell of layout) {
    const tile = byKey.get(`${cell.q},${cell.r}`);
    if (!tile) continue;
    if (cell.wet) { tile.terrain = 'water'; tile.waterKind = cell.wet; }
    else if (tile.terrain === 'water') tile.terrain = 'plains';
  }
  s.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
  s.isPaused = true;
  window.__phaserGame.scene.getScene('MapScene').drawMap();
}, layout);
await page.waitForTimeout(2600);
console.log('PROPOSED ', JSON.stringify(await measure('proposed')));

await browser.close();
