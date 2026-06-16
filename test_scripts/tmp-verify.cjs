const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://localhost:5173');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1500);

  const getLandScreenPos = (landId) => page.evaluate((landId) => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    const state = window.__mandateState;
    const land = state.lands.find(l => l.id === landId);
    const anchor = scene.getSettlementAnchor ? scene.getSettlementAnchor(land) : { x: land.x, y: land.y };
    const cam = scene.cameras.main;
    return {
      x: (scene.wx(anchor.x) - cam.scrollX) * cam.zoom,
      y: (scene.wy(anchor.y) - cam.scrollY) * cam.zoom,
    };
  }, landId);

  const armyPos = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    const marker = scene.armies.markers.get('first-army');
    const cam = scene.cameras.main;
    return { x: (marker.x - cam.scrollX) * cam.zoom, y: (marker.y - cam.scrollY) * cam.zoom };
  });
  console.log('army pos', armyPos);

  const targetPos = await getLandScreenPos('mountain-gate');
  console.log('mountain-gate pos', targetPos);

  // Press on army marker (selects it) and start dragging
  await page.mouse.move(armyPos.x, armyPos.y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'tmp-selected.png' });

  // Move toward target in steps to trigger pointermove curve drawing
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const x = armyPos.x + (targetPos.x - armyPos.x) * (i / steps);
    const y = armyPos.y + (targetPos.y - armyPos.y) * (i / steps);
    await page.mouse.move(x, y, { steps: 2 });
    await page.waitForTimeout(30);
  }
  await page.screenshot({ path: 'tmp-dragging.png' });

  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tmp-after-drop.png' });

  let state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log('mode after drop:', state.mode, 'message:', state.message);
  console.log('movementOrders present?', state.mode === 'moving_army');

  console.log('console errors so far:', errors);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
