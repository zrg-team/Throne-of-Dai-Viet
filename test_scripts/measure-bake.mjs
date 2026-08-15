// What redrawing the world costs, in the three sizes the map can be asked to pay.
//
//   - a bare re-bake (compositing the existing layers into the RenderTexture),
//   - a landscape repaint plus re-bake — what changing anything in the ink actually costs, and
//   - a full `refresh()` with the bake signature dirtied: what a province changing hands costs, and
//   - `rebakeScenery()`: what the calendar actually costs, which is the reason this file exists.
//
// This is the measurement that ruled out ever keying the bake on `state.season`, which advances
// every couple of economy ticks. The season instead re-inks the decoration layer alone, from a
// cached placement plan, and the gap between the last two numbers is that decision. Run against
// `npm run dev`.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cdp = await page.context().newCDPSession(page);
await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(600);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // mid-tier Android

const out = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  const time = (label, fn, runs) => {
    for (let i = 0; i < 2; i++) fn(); // warm
    const t = performance.now();
    for (let i = 0; i < runs; i++) fn();
    return { [label]: +((performance.now() - t) / runs).toFixed(1) };
  };

  return {
    ...time('bakeOnlyMs', () => scene.bakeStaticTerrain(), 8),
    ...time('repaintPlusBakeMs', () => { scene.repaintHexTerrain(); scene.bakeStaticTerrain(); }, 6),
    // What `refresh()` does when the bake signature changes — a province taken, or the fog lifting.
    ...time('fullRefreshMs', () => {
      scene.renderSignatures.bake = '';
      scene.refresh();
    }, 5),
    // The calendar's own path: repaint the scatter and the ground cast from the cached plan, redraw
    // the live settlement nodes, re-composite. Every season change pays exactly this.
    ...time('seasonTurnMs', () => scene.rebakeScenery(), 5),
    tiles: scene.state.hexTiles.length,
    lands: scene.state.lands.length,
  };
});

const budget = 16.7;
console.log(`tiles=${out.tiles} lands=${out.lands}  (4x CPU throttle, mid-tier Android)`);
console.log(`  bake only:            ${out.bakeOnlyMs} ms  (${(out.bakeOnlyMs / budget).toFixed(1)} frames)`);
console.log(`  repaint + bake:       ${out.repaintPlusBakeMs} ms  (${(out.repaintPlusBakeMs / budget).toFixed(1)} frames)`);
console.log(`  full refresh + bake:  ${out.fullRefreshMs} ms  (${(out.fullRefreshMs / budget).toFixed(1)} frames)`);
console.log(`  season turn:          ${out.seasonTurnMs} ms  (${(out.seasonTurnMs / budget).toFixed(1)} frames)`);
console.log('');
// Run-to-run spread on a throttled browser is wide, so treat one green run as weak evidence and
// repeat before trusting a number near the line.
console.log(`  a full refresh is a freeze the player sees: budget 1800 ms -> ${out.fullRefreshMs <= 1800 ? 'PASS' : 'FAIL - thin the landscape passes'}`);
console.log(`  it is paid only when land changes hands or leaves the fog, never on the calendar.`);
console.log(`  a season turn: budget 250 ms -> ${out.seasonTurnMs <= 250 ? 'PASS' : 'FAIL - thin the scatter plan'}`);

await browser.close();
