// One scale for everything drawn on the ground — measured off a real map, not read off the source.
//
// This fault has come back twice, and both times through a call site nobody had found: a cart on a
// road, a glyph on a building, a traveller under a hat. There are forty-odd call sites across four
// files and any one of them can quietly disagree, so grepping for it does not work.
//
// So the map is measured. `setPropScaleProbe` (ui/ink/proportion.ts) reports every prop the moment
// it is drawn, wherever it was drawn from; this boots the real game, renders a real map with
// settlements, hosts, traffic and terrain on it, and fails if anything lands outside the band.
//
// The contract, from `proportion.ts`:
//   · objects  (house, tree, bamboo, areca, banyan, hayStack)  →  one rate
//   · living   (figure, farmer, buffalo)                       →  that rate × LIVING
// Jitter is allowed within a prop — a wood of identical trees is its own kind of wrong — but a
// *call site* that disagrees is the fault, and shows up as a band that will not close.
//
// Usage: node test_scripts/verify-ground-scale.mjs
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';

/** How far a prop may sit from the median of its class before it counts as a different scale. */
const TOLERANCE = 1.35;

/**
 * How far one prop's caller scales may spread before it is two call sites rather than one varying.
 *
 * Deliberate variety lives in here: the scatter jitters each plant ±20%, and stunted trees on
 * mountains are drawn smaller than trees on a flood plain because that is what mountains do to
 * trees. What this catches is the actual fault — a *base* scale that differs, which shows up as a
 * spread far wider than any jitter, the way a cart's buffalo at 0.95 did against a herd at 0.72.
 */
const JITTER_TOLERANCE = 1.6;

/**
 * Grass is measured but not held to the object rate, and the exemption is deliberate.
 *
 * `proportion.ts` says so itself: a tuft is "not an object but a *texture* standing for open
 * ground, the way a woodcut shows a meadow with a handful of marks". Its real height is a
 * judgement rather than a measurement, so a px-per-metre figure for it is not a fact to assert on.
 * What *is* assertable, and is checked below, is that it never out-stands a person.
 */
const RATE_EXEMPT = new Set(['grassTuft']);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);

// The probe has to be installed before anything paints, so it is armed and then the map is drawn.
const probeRun = await page.evaluate(async () => {
  const { setPropScaleProbe } = await import('/src/ui/ink/proportion.ts');
  const seen = [];
  setPropScaleProbe((s) => seen.push(s));
  window.__startBenchGame(1337, 'campaign');
  await new Promise((resolve) => setTimeout(resolve, 2500));
  // Traffic and hosts are built lazily as the map settles, so give them a beat of their own.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // A host and a cart are the two things the report was actually about, and neither is guaranteed
  // to be on screen in the first few seconds — so they are drawn explicitly through the same
  // renderer the map uses, rather than hoped for.
  let forced = 'skipped';
  try {
    const scene = window.__phaserGame.scene.scenes.find((s) => s.mapItems);
    const renderer = scene?.mapItems;
    if (renderer) {
      for (const men of [40, 400, 4000]) renderer.createArmyMarker?.(men, true);
      renderer.createCart?.();
      renderer.createTraveler?.();
      for (const b of ['farm', 'barracks', 'market', 'communalHall']) {
        renderer.createBuildingGlyph?.(b, 0, 0);
      }
      forced = 'ok';
    } else {
      forced = 'no renderer on any scene';
    }
  } catch (error) {
    forced = `threw: ${String(error)}`;
  }

  setPropScaleProbe(undefined);
  return { seen, forced };
});

await browser.close();
const samples = probeRun.seen;
console.log(`forced draws: ${probeRun.forced}`);

if (samples.length === 0) {
  console.log('FAIL nothing was drawn — the probe saw no props at all');
  process.exit(1);
}

// ── Group by prop, then by the distinct caller scale each call site used ──
// Texture bakes are dropped: they draw a prop once at a canonical size and every copy is sized by
// the image afterwards, so their caller scale is the texture's and not any placement's.
const placed = samples.filter((s) => !s.raster);
const byProp = new Map();
for (const s of placed) {
  if (!byProp.has(s.prop)) byProp.set(s.prop, []);
  byProp.get(s.prop).push(s);
}

const LIVING_PROPS = new Set(['figure', 'farmer', 'buffalo']);
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const objectRates = [];
const livingRates = [];
for (const [prop, list] of byProp) {
  if (RATE_EXEMPT.has(prop)) continue;
  const rate = median(list.map((s) => s.pxPerMetre));
  (LIVING_PROPS.has(prop) ? livingRates : objectRates).push({ prop, rate });
}

const objectRate = median(objectRates.map((r) => r.rate));
const livingRate = livingRates.length > 0 ? median(livingRates.map((r) => r.rate)) : 0;

console.log(`${samples.length} props drawn across ${byProp.size} kinds`);
console.log(`object rate ${objectRate.toFixed(2)} px/m   ·   living rate ${livingRate.toFixed(2)} px/m`);
console.log(`living exaggeration ${(livingRate / objectRate).toFixed(2)}×\n`);

const rows = [];
for (const [prop, list] of byProp) {
  const rate = median(list.map((s) => s.pxPerMetre));
  const target = LIVING_PROPS.has(prop) ? livingRate : objectRate;
  const ratio = rate / target;
  // The widest and narrowest caller scale this prop was drawn at anywhere on the map. A prop drawn
  // from two call sites that disagree shows up here even if its median looks healthy.
  const callers = list.map((s) => s.caller);
  const spread = Math.max(...callers) / Math.max(1e-6, Math.min(...callers));
  rows.push({ prop, n: list.length, rate, ratio, spread, minCaller: Math.min(...callers), maxCaller: Math.max(...callers) });
}
rows.sort((a, b) => b.ratio - a.ratio);

const w = Math.max(...rows.map((r) => r.prop.length));
console.log(`${'prop'.padEnd(w)}   count    px/m   vs class   caller range`);
for (const r of rows) {
  const flag = r.ratio > TOLERANCE || r.ratio < 1 / TOLERANCE ? ' ←' : '';
  console.log(
    `${r.prop.padEnd(w)} ${String(r.n).padStart(7)} ${r.rate.toFixed(2).padStart(7)} `
    + `${(`${r.ratio.toFixed(2)}×`).padStart(9)}   ${r.minCaller.toFixed(2)}–${r.maxCaller.toFixed(2)}${flag}`,
  );
}

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? '\nok  ' : '\nFAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const offClass = rows.filter(
  (r) => !RATE_EXEMPT.has(r.prop) && (r.ratio > TOLERANCE || r.ratio < 1 / TOLERANCE),
);
check(
  'every prop is drawn at its class rate',
  offClass.length === 0,
  offClass.map((r) => `${r.prop} ${r.ratio.toFixed(2)}×`).join(', '),
);

// A prop whose call sites disagree is the actual fault, and it hides behind a healthy median.
const wideSpread = rows.filter((r) => r.spread > JITTER_TOLERANCE);
check(
  'no prop is drawn at two different base scales',
  wideSpread.length === 0,
  wideSpread.map((r) => `${r.prop} ${r.minCaller.toFixed(2)}–${r.maxCaller.toFixed(2)}`).join(', '),
);

check(
  'people and livestock carry one exaggeration over objects',
  livingRate / objectRate > 1.4 && livingRate / objectRate < 2.2,
  `${(livingRate / objectRate).toFixed(2)}×`,
);

// The specific pairs the report named, checked by name so a regression says which one broke.
const rateOf = (prop) => rows.find((r) => r.prop === prop)?.rate ?? 0;
check(
  'a buffalo does not out-stand a soldier',
  rateOf('buffalo') > 0 && rateOf('figure') > 0 && rateOf('buffalo') <= rateOf('figure') * 1.05,
  `buffalo ${rateOf('buffalo').toFixed(2)} vs soldier ${rateOf('figure').toFixed(2)}`,
);
check(
  'a farmer and a soldier are the same height',
  rateOf('farmer') > 0 && rateOf('figure') > 0
    && Math.abs(rateOf('farmer') / rateOf('figure') - 1) < 0.15,
  `farmer ${rateOf('farmer').toFixed(2)} vs soldier ${rateOf('figure').toFixed(2)}`,
);

// The rate checks above compare each prop against the metre it claims, so they all pass happily
// while the *claims* are wrong — a bamboo asserting twelve metres is drawn consistently at twelve
// metres and nothing complains. That is exactly how a lũy tre ended up half again the height of the
// trees beside it and reading as three times, so the plants are also measured against each other in
// plain drawn pixels, which is the comparison a player actually makes.
const pxOf = (prop) => {
  const list = byProp.get(prop);
  return list ? median(list.map((s) => s.px)) : 0;
};
const treePx = pxOf('tree');
for (const [plant, limit] of [['bamboo', 1.15], ['areca', 1.4], ['banyan', 1.9]]) {
  const px = pxOf(plant);
  if (px === 0 || treePx === 0) continue;
  check(
    `a ${plant} stands within ${limit}× a tree`,
    px <= treePx * limit,
    `${plant} ${px.toFixed(1)} px vs tree ${treePx.toFixed(1)} px  (${(px / treePx).toFixed(2)}×)`,
  );
}

// A roof is the one thing on the map whose size everyone knows, so nothing planted beside a house
// may tower over it beyond reason.
const housePx = pxOf('house');
check(
  'a tree does not dwarf the house it shades',
  housePx === 0 || treePx === 0 || treePx <= housePx * 2.2,
  `tree ${treePx.toFixed(1)} px vs house ${housePx.toFixed(1)} px`,
);

// Grass is exempt from the rate band (see `RATE_EXEMPT`) but not from being shorter than a person.
// This is the check that catches the failure that keeps recurring: a countryside where the players
// are knee-deep in grass drawn as tall as they are.
const grass = rows.find((r) => r.prop === 'grassTuft');
check(
  'grass does not out-stand a person',
  !grass || grass.rate < rateOf('figure'),
  grass ? `grass ${grass.rate.toFixed(2)} vs person ${rateOf('figure').toFixed(2)}` : 'no grass drawn',
);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the ground is drawn at one scale' : 'FAIL: the ground disagrees with itself');
process.exit(failed.length === 0 ? 0 : 1);
