import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const sc = window.__phaserGame.scene.getScene('MapScene');
  const st = window.__mandateState;
  let graphics = 0, totalCommands = 0;
  let visibleGraphics = 0, visibleCommands = 0;
  const layers = [];
  const walk = (o, topDepth, parentVisible) => {
    const vis = parentVisible && o.visible !== false;
    if (o.type === 'Graphics') {
      graphics++;
      const c = o.commandBuffer ? o.commandBuffer.length : 0;
      totalCommands += c;
      if (vis) { visibleGraphics++; visibleCommands += c; }
      if (c > 500) layers.push({ depth: topDepth, commands: c, visible: vis });
    }
    if (Array.isArray(o.list)) o.list.forEach((ch) => walk(ch, topDepth, vis));
  };
  sc.children.list.forEach((o) => walk(o, o.depth, o.visible !== false));
  layers.sort((a, b) => b.commands - a.commands);
  return {
    world: { w: sc.minimapInfo.worldWidth, h: sc.minimapInfo.worldHeight },
    cols: st.mapConfig.cols, rows: st.mapConfig.rows,
    hexTiles: st.hexTiles.length, lands: st.lands.length,
    visibleLands: st.lands.filter(l => l.isVisible).length,
    armies: st.armies.length,
    liveGraphics: graphics, totalGraphicsCommands: totalCommands,
    visibleGraphics, visibleCommands,
    mapSceneTopLevel: sc.children.list.length,
    heavyLayers: layers.slice(0, 12),
  };
});
console.log(JSON.stringify(info, null, 2));
const mb = (info.world.w * info.world.h * 4 / 1048576).toFixed(1);
console.log(`Full-world RenderTexture would be ~${mb} MB`);
await page.screenshot({ path: 'test_scripts/perf-results/map-after.png' });
console.log('screenshot -> test_scripts/perf-results/map-after.png');
await browser.close();
