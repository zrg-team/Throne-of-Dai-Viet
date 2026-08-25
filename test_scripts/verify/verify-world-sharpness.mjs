/**
 * What each tier promises the world map, held to pixels-per-texel.
 *
 * "High" was blurry by construction: the world bake carried 1 texel per design unit while the
 * camera magnified it by renderScale x mapZoom — a 3x upscale of every town before the player
 * even zoomed (user-reported twice). The contract now: HIGH bakes the ground at 2 texels per
 * design unit (device-capped) and keeps the settlement band [1.40, 1.50) LIVE — vector-crisp
 * towns, plates and accents above a bake that sits below them (depth < 1.4, or the fresh bake
 * paints straight over the live ink — the "buildings vanished" bug). Every other tier bakes
 * everything, exactly as before. The default tier is medium at ANY pixel ratio: high is chosen,
 * never guessed. A rung flip mid-run rebuilds both world RTs at the new density.
 *
 * Usage: node test_scripts/verify/verify-world-sharpness.mjs
 */
import { boot, startWorld, resolveOpening, report } from '../perf/_boot.mjs';

const checks = [];

// ── The default: medium, whatever the pixel ratio says ──
{
  const { browser, page } = await boot({ dpr: 3, quality: 'auto' });
  const ladder = await page.evaluate(() => window.__ladder.state());
  checks.push(['no stored tier at DPR 3 starts (and caps) at medium',
    ladder.rung === 'medium' && ladder.ceiling === 'medium', JSON.stringify(ladder)]);
  await browser.close();
}

// ── High: dense bake below, live settlement ink above ──
const { browser, page, errors } = await boot({ dpr: 3, quality: 'high' });
await startWorld(page, { mode: 'ascent', seed: 1337, settle: 1200 });
await resolveOpening(page);
await page.waitForTimeout(800);

const high = await page.evaluate(() => {
  const sc = window.__phaserGame.scene.getScene('ConquestScene');
  const rt = sc.staticBakeRT;
  const pieces = [...sc.children.list].filter((o) => typeof o.depth === 'number'
    && o.depth >= 1.395 && o.depth <= 1.5);
  // The run opens centred on the home settlement; in ascent that is the first land (the owner
  // id is the dynasty's, not the literal string 'player').
  const home = window.__mandateState.lands.find((l) => l.ownerId === 'player') ?? window.__mandateState.lands[0];
  const homeInk = sc.landInk.get(home?.id) ?? [];
  return {
    world: [sc.worldWidth, sc.worldHeight],
    rt: rt ? { w: rt.width, h: rt.height, depth: rt.depth } : null,
    pieces: pieces.length,
    homeInk: homeInk.length,
    homeVisible: homeInk.filter((g) => g.visible).length,
  };
});
// Phaser rounds RT dimensions up a pixel or two; the contract is the density, not the parity.
const near = (got, want) => got !== undefined && Math.abs(got - want) <= 2;
checks.push(['high bakes the ground at 2 texels per design unit',
  high.rt !== null && near(high.rt.w, high.world[0] * 2) && near(high.rt.h, high.world[1] * 2),
  JSON.stringify(high.rt)]);
checks.push(['the bake sits under the settlement band', high.rt !== null && high.rt.depth < 1.4,
  `depth ${high.rt?.depth}`]);
// Only the HOME settlement is asserted visible — the camera opens on it; ink further out is
// legitimately view-culled, which is the other half of this design.
checks.push(['the home settlement ink is live on high', high.homeInk > 0 && high.homeVisible === high.homeInk,
  `${high.homeVisible}/${high.homeInk} home pieces visible (band total ${high.pieces})`]);

// ── A rung flip mid-run: the bake follows the new density and takes the band back ──
const flipped = await page.evaluate(() => {
  window.__ladder.force('medium');
  const sc = window.__phaserGame.scene.getScene('ConquestScene');
  sc.bakeStaticTerrain();
  const rt = sc.staticBakeRT;
  const pieces = [...sc.children.list].filter((o) => typeof o.depth === 'number'
    && o.depth >= 1.395 && o.depth <= 1.5);
  return {
    rt: rt ? { w: rt.width, h: rt.height } : null,
    world: [sc.worldWidth, sc.worldHeight],
    visible: pieces.filter((o) => o.visible).length,
  };
});
checks.push(['a flip to medium rebakes at 0.75 texels per design unit',
  flipped.rt !== null && near(flipped.rt.w, flipped.world[0] * 0.75)
    && near(flipped.rt.h, flipped.world[1] * 0.75), JSON.stringify(flipped.rt)]);
checks.push(['and the settlement band goes back into the bake', flipped.visible === 0,
  `${flipped.visible} still visible`]);

checks.push(['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')]);
await browser.close();
report(checks);
