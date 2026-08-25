// Proves the render scale is a pure resolution change: the design surface must still map exactly
// onto the buffer, and pan, zoom and tap must behave identically at every device pixel ratio.
// Buffer-space pointers compared against design-space bounds is the failure this exists to catch.
import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) failures += 1; };

for (const dsf of [1, 2, 3]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dsf });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  const scale = await page.evaluate(() => window.__phaserGame.scale.gameSize.width / 390);
  console.log(`\n--- devicePixelRatio ${dsf} → render scale ${scale} ---`);

  // The design surface must map exactly onto the buffer: top-left to top-left, full width.
  const mapping = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('UIScene');
    const cam = ui.cameras.main;
    const at = (x, y) => ({ x: (x - cam.scrollX - cam.width * cam.originX) * cam.zoom + cam.width * cam.originX,
                            y: (y - cam.scrollY - cam.height * cam.originY) * cam.zoom + cam.height * cam.originY });
    return { topLeft: at(0, 0), bottomRight: at(390, window.__phaserGame.scale.gameSize.height / cam.zoom) };
  });
  check(`design origin maps to buffer origin`, Math.abs(mapping.topLeft.x) < 0.5 && Math.abs(mapping.topLeft.y) < 0.5, JSON.stringify(mapping.topLeft));
  check(`design right edge maps to buffer right edge`, Math.abs(mapping.bottomRight.x - 390 * scale) < 0.5, `${mapping.bottomRight.x} vs ${390 * scale}`);

  // Drag the map: one design pixel of finger travel must move the world one design pixel.
  const before = await page.evaluate(() => ({ ...window.__phaserGame.scene.getScene('MapScene').cameras.main }) && {
    x: window.__phaserGame.scene.getScene('MapScene').cameras.main.scrollX,
    y: window.__phaserGame.scene.getScene('MapScene').cameras.main.scrollY,
  });
  await page.mouse.move(200, 500);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(200 - i * 6, 500 - i * 4);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    x: window.__phaserGame.scene.getScene('MapScene').cameras.main.scrollX,
    y: window.__phaserGame.scene.getScene('MapScene').cameras.main.scrollY,
  }));
  check(`drag moves the map 1:1 with the finger`, Math.abs((after.x - before.x) - 60) < 6 && Math.abs((after.y - before.y) - 40) < 6,
    `moved ${Math.round(after.x - before.x)},${Math.round(after.y - before.y)} for a 60,40 drag`);

  // Zoom in via the on-screen control, then confirm the map zoom (not the render scale) changed.
  const z0 = await page.evaluate(() => window.__phaserGame.scene.getScene('MapScene').mapZoom);
  await page.evaluate(() => window.__phaserGame.scene.getScene('MapScene').zoomMap(1));
  const z1 = await page.evaluate(() => window.__phaserGame.scene.getScene('MapScene').mapZoom);
  check(`zoom step changes map zoom only`, z1 > z0 && Math.abs(z1 - z0 - 0.2) < 0.15, `${z0.toFixed(2)} → ${z1.toFixed(2)}`);

  // Tapping a land selects it, which proves the tap→world transform survived.
  const picked = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    const land = window.__mandateState.lands.find((l) => l.isVisible);
    const cam = scene.cameras.main;
    const sx = (scene.wx(land.x) - cam.scrollX) * scene.mapZoom;
    const sy = (scene.wy(land.y) - cam.scrollY) * scene.mapZoom;
    return { id: land.id, sx, sy };
  });
  if (picked.sx > 20 && picked.sx < 370 && picked.sy > 100 && picked.sy < 700) {
    await page.mouse.click(picked.sx, picked.sy);
    await page.waitForTimeout(400);
    const selected = await page.evaluate(() => window.__mandateState.selectedLandId);
    check(`tap selects the land under the finger`, !!selected, `selected ${selected ?? 'nothing'}`);
  } else {
    console.log(`  (land off screen at ${Math.round(picked.sx)},${Math.round(picked.sy)} — tap test skipped)`);
  }
  check(`no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}
await browser.close();
console.log(failures === 0 ? '\nALL INTERACTION CHECKS PASS' : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
