// What a season change would cost if it went through the static terrain bake.
//
// The season advances every economy tick (5.5s classic / 3.5s ascent), so anything seasonal that
// lives inside `bakeStaticTerrain` is paid at that rate. This measures the two candidate costs:
//   - a bare re-bake (compositing the existing layers into the RenderTexture), and
//   - a full seasonal repaint (redraw the landscape, then re-bake) — what changing a baked
//     seasonal colour or the canopy shape actually triggers via `refresh()`.
// Run against `npm run dev`.
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

  const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
  let turn = 0;

  return {
    ...time('bakeOnlyMs', () => scene.bakeStaticTerrain(), 8),
    ...time('repaintPlusBakeMs', () => { scene.repaintHexTerrain(); scene.bakeStaticTerrain(); }, 6),
    // What `refresh()` does when the bake signature changes — the cost that ruled out ever keying
    // the bake on the season. Kept as the yardstick the shipped path is measured against.
    ...time('fullRefreshMs', () => {
      scene.renderSignatures.bake = '';
      scene.refresh();
    }, 5),
    // What a season change ACTUALLY costs now: re-ink the scatter from its cached plan, rebuild the
    // live settlement nodes, re-composite. Driven through a real season change so nothing is
    // measured that the game does not also pay.
    ...time('sceneryRebakeMs', () => {
      turn += 1;
      scene.state.season = seasons[turn % 4];
      scene.syncSeasonVisuals();
    }, 8),
    tiles: scene.state.hexTiles.length,
    lands: scene.state.lands.length,
  };
});

const budget = 16.7;
console.log(`tiles=${out.tiles} lands=${out.lands}  (4x CPU throttle, mid-tier Android)`);
console.log(`  bake only:            ${out.bakeOnlyMs} ms  (${(out.bakeOnlyMs / budget).toFixed(1)} frames)`);
console.log(`  repaint + bake:       ${out.repaintPlusBakeMs} ms  (${(out.repaintPlusBakeMs / budget).toFixed(1)} frames)`);
console.log(`  full refresh + bake:  ${out.fullRefreshMs} ms  (${(out.fullRefreshMs / budget).toFixed(1)} frames)`);
console.log('');
console.log(`  SEASON CHANGE (shipped path): ${out.sceneryRebakeMs} ms  (${(out.sceneryRebakeMs / budget).toFixed(1)} frames)`);
console.log(`    vs a full refresh:          ${(out.fullRefreshMs / out.sceneryRebakeMs).toFixed(1)}x cheaper`);
// Run-to-run spread on a throttled browser is wide (110-220 ms observed for the same build), so
// treat one green run as weak evidence and repeat before trusting a number near the line.
console.log(`    budget 250 ms ->            ${out.sceneryRebakeMs <= 250 ? 'PASS' : 'FAIL - thin the scatter plan or take live-layers-only'}`);
console.log('');
console.log(`a season is 2 ticks: 11.0 s classic, 7.0 s ascent`);
console.log(`  frozen fraction of an ascent season: ${(out.sceneryRebakeMs / 7000 * 100).toFixed(1)} %`);

await browser.close();
