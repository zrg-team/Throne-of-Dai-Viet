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
await page.goto(process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179', { waitUntil: 'domcontentloaded' });
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
    // What `refresh()` does when everything the map is keyed on changes at once — a province taken
    // and the fog lifting off its neighbours, which is the worst case and the one the player feels.
    ...time('fullRefreshMs', () => {
      for (const band of ['terrain', 'control', 'fog', 'roads', 'node']) scene.renderSignatures[band] = '';
      scene.refresh();
    }, 5),
    // The two cases the bands were split apart for. Ownership moving does not move a hill, and a
    // province being remembered rather than seen changes only how heavily its fog is inked — both
    // used to cost the full repaint above.
    ...time('ownershipOnlyMs', () => {
      scene.renderSignatures.control = '';
      scene.refresh();
    }, 5),
    ...time('fogOnlyMs', () => {
      scene.renderSignatures.fog = '';
      scene.refresh();
    }, 5),
    // The calendar's own path: repaint the scatter and the ground cast from the cached plan, redraw
    // the live settlement nodes, re-composite. Every season change pays exactly this.
    ...time('seasonTurnMs', () => scene.rebakeScenery(), 5),
    tiles: scene.state.hexTiles.length,
    lands: scene.state.lands.length,
  };
});

// The revealed map is the hard case: every settlement node live, every tile lit. This is the
// state players actually complain about, and the row the season-turn budget is judged on.
const revealed = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  for (const land of scene.state.lands) { land.isVisible = true; land.isExplored = true; }
  for (const band of ['terrain', 'control', 'fog', 'roads', 'node']) scene.renderSignatures[band] = '';
  scene.refresh();
  const time = (label, fn, runs) => {
    for (let i = 0; i < 2; i++) fn();
    const t = performance.now();
    for (let i = 0; i < runs; i++) fn();
    return { [label]: +((performance.now() - t) / runs).toFixed(1) };
  };
  return {
    ...time('bakeOnlyMs', () => scene.bakeStaticTerrain(), 6),
    ...time('seasonTurnMs', () => scene.rebakeScenery(), 5),
    nodes: scene.landNodes.size,
  };
});

const budget = 16.7;
console.log(`tiles=${out.tiles} lands=${out.lands}  (4x CPU throttle, mid-tier Android)`);
console.log(`  bake only:            ${out.bakeOnlyMs} ms  (${(out.bakeOnlyMs / budget).toFixed(1)} frames)`);
console.log(`  repaint + bake:       ${out.repaintPlusBakeMs} ms  (${(out.repaintPlusBakeMs / budget).toFixed(1)} frames)`);
console.log(`  full refresh + bake:  ${out.fullRefreshMs} ms  (${(out.fullRefreshMs / budget).toFixed(1)} frames)`);
console.log(`  ownership only:       ${out.ownershipOnlyMs} ms  (${(out.ownershipOnlyMs / budget).toFixed(1)} frames)`);
console.log(`  fog/explored only:    ${out.fogOnlyMs} ms  (${(out.fogOnlyMs / budget).toFixed(1)} frames)`);
console.log(`  season turn:          ${out.seasonTurnMs} ms  (${(out.seasonTurnMs / budget).toFixed(1)} frames)`);
console.log('');
// Run-to-run spread on a throttled browser is wide, so treat one green run as weak evidence and
// repeat before trusting a number near the line.
console.log(`  a full refresh is a freeze the player sees: budget 1800 ms -> ${out.fullRefreshMs <= 1800 ? 'PASS' : 'FAIL - thin the landscape passes'}`);
console.log(`  it is paid only when land changes hands or leaves the fog, never on the calendar.`);
console.log(`  a season turn: budget 250 ms -> ${out.seasonTurnMs <= 250 ? 'PASS' : 'FAIL - thin the scatter plan'}`);
console.log('');
console.log(`revealed map (${revealed.nodes} live nodes):`);
console.log(`  bake only:            ${revealed.bakeOnlyMs} ms  (${(revealed.bakeOnlyMs / budget).toFixed(1)} frames)`);
console.log(`  season turn:          ${revealed.seasonTurnMs} ms  (${(revealed.seasonTurnMs / budget).toFixed(1)} frames)`);
// Calibration (2026-08-24, settlement-harvest A/B on this rig): the revealed bake was ~2.3 s at
// 4x SwiftShader BEFORE the settlements joined the band (+9% after), and the revealed season turn
// ~3.1 s before (2.8 s after) - the giant numbers are the pre-existing band ink under software
// rasterisation, not the harvest. What the harvest actually bought is per-frame: revealed frame
// p50 55 -> 19 ms. So the gates below are REGRESSION guards over today's measured numbers, not
// aspirations; the honest frame-cost gates live in the GL-counts harness, where numbers transfer.
console.log(`  revealed season turn: regression guard 3400 ms -> ${revealed.seasonTurnMs <= 3400 ? 'PASS' : 'FAIL - the seasonal path grew'}`);

await browser.close();
process.exit(revealed.seasonTurnMs <= 3400 && revealed.bakeOnlyMs <= 3000 && out.seasonTurnMs <= 400 ? 0 : 1);
