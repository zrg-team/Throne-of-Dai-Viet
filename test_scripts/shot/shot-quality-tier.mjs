/**
 * The world map as a phone actually shows it, one tier at a time.
 *
 * The complaint this answers is always a comparison the player makes against their own memory —
 * "normal looks bad" — so the frame has to be the frame they saw: a 390x844 phone at pixel ratio
 * 3, the opening camera, no zoom fiddling. Run it once before a tier change and once after with
 * a different --out, then look at the two files side by side.
 *
 * Usage: node test_scripts/shot/shot-quality-tier.mjs [--quality medium] [--mode ascent] [--seed 1337] [--out before]
 */
import { mkdirSync } from 'node:fs';
import { boot, startWorld, resolveOpening, arg } from '../perf/_boot.mjs';

const QUALITY = arg('quality', 'medium');
const MODE = arg('mode', 'ascent');
const SEED = Number(arg('seed', '1337'));
const LABEL = arg('out', QUALITY);
const OUT = 'output/quality';
mkdirSync(OUT, { recursive: true });

// The `?bakescale=` escape hatch, so a density can be A/B'd against the tier without editing it.
const BAKE = arg('bakescale', '');
const { browser, page, errors } = await boot({ dpr: 3, quality: QUALITY, query: `?capture=1${BAKE ? `&bakescale=${BAKE}` : ''}` });
await startWorld(page, { mode: MODE, seed: SEED, settle: 1200 });
if (MODE === 'ascent') await resolveOpening(page);
await page.waitForTimeout(1000);

const facts = await page.evaluate((mode) => {
  const sc = window.__phaserGame.scene.getScene(mode === 'ascent' ? 'ConquestScene' : 'MapScene');
  const rt = sc.staticBakeRT;
  return {
    scale: window.__renderScale(),
    world: [sc.worldWidth, sc.worldHeight],
    rt: rt ? { w: rt.width, h: rt.height } : null,
    zoom: sc.cameras.main.zoom,
    liveInk: [...(sc.landInk?.values() ?? [])].flat().filter((g) => g.visible).length,
  };
}, MODE);
const texels = facts.rt ? (facts.rt.w / facts.world[0]).toFixed(2) : 'n/a';
console.log(`${QUALITY}: buffer x${facts.scale}, bake ${texels} texels/unit (${facts.rt?.w}x${facts.rt?.h}), `
  + `map zoom ${facts.zoom.toFixed(2)}, ${facts.liveInk} live ink pieces`);

await page.screenshot({ path: `${OUT}/map-${LABEL}.png` });
// A close crop of the settlement, where the softness is judged.
await page.screenshot({ path: `${OUT}/map-${LABEL}-crop.png`, clip: { x: 40, y: 300, width: 320, height: 320 } });
if (errors.length) console.log(`errors: ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
