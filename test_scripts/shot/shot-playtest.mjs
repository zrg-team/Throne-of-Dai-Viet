// Plays a real campaign and photographs every kind of thing the map can draw, by finding one of
// each land type on the actual generated map and flying the camera to it.
//
// Fixed viewpoints are how a renderer ships half-converted: the two screens you happen to capture
// look right and the mine, the cart and the market do not.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// Dev server port. Defaults to Vite's, overridable when 5173 is taken by something else.
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const OUT = process.env.SHOT_OUT ?? 'output/playtest';
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
await page.waitForTimeout(2400);

// Reveal the whole map, so every land type is actually on screen to be drawn.
await page.evaluate(() => {
  const state = window.__mandateState;
  // Hold the clock. The campaign keeps ticking while the camera flies around, and a tick can
  // recompute visibility and fog the map back up between one screenshot and the next — which
  // reads as the renderer having broken when it has not.
  state.isPaused = true;
  for (const land of state.lands) { land.isVisible = true; land.isExplored = true; }
  const scene = window.__phaserGame.scene.getScene('MapScene');
  scene.scene.restart({ state });
});
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.evaluate(() => {
  const state = window.__mandateState;
  state.isPaused = true;
  for (const land of state.lands) { land.isVisible = true; land.isExplored = true; }
  window.__phaserGame.scene.getScene('MapScene').refresh();
});
await page.waitForTimeout(2600);

const types = await page.evaluate(() => {
  const state = window.__mandateState;
  const seen = new Map();
  for (const land of state.lands) {
    if (!seen.has(land.type)) seen.set(land.type, land);
  }
  return [...seen.entries()].map(([type, land]) => ({ type, id: land.id, name: land.name }));
});
console.log('land types on this map:', types.map((t) => t.type).join(', '));

for (const entry of types) {
  for (const zoom of [1.4, 2.4]) {
    await page.evaluate(({ id, z }) => {
      const state = window.__mandateState;
      const scene = window.__phaserGame.scene.getScene('MapScene');
      const land = state.lands.find((l) => l.id === id);
      // Centre on the SETTLEMENT, not the land centroid. A province's centroid is often bare
      // field a screen away from its town, so centring there photographs grass and calls it a
      // castle.
      const hexSize = state.mapConfig.hexSize;
      const seats = state.hexTiles.filter((t) => t.landId === land.id && (t.terrain === 'fortress' || t.terrain === 'shrine'));
      let at = { x: land.x, y: land.y };
      if (seats.length) {
        const px = seats.map((t) => ({
          x: hexSize * Math.sqrt(3) * (t.coord.q + t.coord.r / 2),
          y: hexSize * 1.5 * t.coord.r,
        }));
        at = {
          x: px.reduce((a, p) => a + p.x, 0) / px.length,
          y: px.reduce((a, p) => a + p.y, 0) / px.length,
        };
      }
      // setMapZoom, not camera.setZoom: the camera also carries the render scale. And scroll
      // directly rather than centerOn, which assumes a centred camera origin the game does not use.
      scene.setMapZoom(z);
      const cam = scene.cameras.main;
      cam.setScroll(scene.wx(at.x) - 195 / z, scene.wy(at.y) - 422 / z);
    }, { id: entry.id, z: zoom });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/land-${entry.type}-${zoom}x.png` });
  }
  console.log('  ', entry.type, '—', entry.name);
}

// Armies on the march, and the traffic that runs the roads between provinces.
await page.evaluate(() => {
  const state = window.__mandateState;
  const scene = window.__phaserGame.scene.getScene('MapScene');
  const army = state.armies?.[0];
  if (army) {
    const land = state.lands.find((l) => l.id === army.landId) ?? state.lands[0];
    scene.setMapZoom(2.0);
    scene.cameras.main.setScroll(scene.wx(land.x) - 97, scene.wy(land.y) - 211);
  }
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/army.png` });
console.log('   army');

console.log(errors.length ? errors.slice(0, 8) : 'no console errors');
await browser.close();
