// Verifies the bake/node signature split: a building-only change must redraw the
// settlement node (nodeChanged) but NOT rebuild the static terrain bake (bakeChanged).
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:5173/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(400);

const result = await page.evaluate(() => {
  const game = window.__phaserGame;
  const sc = game.scene.getScene('MapScene');
  const st = window.__mandateState;
  // Spy on the two redraw paths.
  let bakeCalls = 0, nodeCalls = 0;
  const origBake = sc.bakeStaticTerrain.bind(sc);
  const origNodes = sc.redrawLandNodes.bind(sc);
  sc.bakeStaticTerrain = (...a) => { bakeCalls++; return origBake(...a); };
  sc.redrawLandNodes = (...a) => { nodeCalls++; return origNodes(...a); };

  // Pick the player's visible capital and add a building (a pure node change).
  const cap = st.lands.find((l) => l.ownerId === 'dai-viet' && l.isVisible);
  const before = { bakeCalls, nodeCalls };
  cap.buildings.push({ type: cap.buildings[0] ? cap.buildings[0].type : 'farm', level: 1 });
  // Refresh directly (no simulation tick) so only the building change is in play.
  sc.refresh();

  return {
    capitalId: cap.id,
    buildingChange: { bake: bakeCalls - before.bakeCalls, node: nodeCalls - before.nodeCalls },
  };
});
console.log(JSON.stringify(result, null, 2));
console.log(result.buildingChange.node >= 1 && result.buildingChange.bake === 0
  ? 'PASS: building change redrew nodes WITHOUT re-baking terrain'
  : 'CHECK: building change bake=' + result.buildingChange.bake + ' node=' + result.buildingChange.node);
await browser.close();
