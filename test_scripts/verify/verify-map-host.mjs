// A host on the map has to read as men standing in ranks, not as a smudge with a flag over it.
//
// Doc 12's formation geometry is a *plate's* geometry: a soldier 42 units to the crown, filed 16
// units from his neighbour — deliberately shoulder to shoulder. Carried onto the map at
// `GROUND_SCALE` that same ratio put men **3.23 px wide at a 1.72 px pitch**, overlapping by half,
// with ranks 1.29 px apart on a figure 6.82 px tall. A 2,400-man host came out 33 px across.
//
// The battle screen was given its room back by raising `BATTLE_HOST_SCALE` to 2.3. The map has no
// such dial and was never re-checked, so it gets `MAP_HOST_SPREAD` instead — which opens the gaps
// and must NOT touch the figures' size, because that is what `proportion.ts` is for.
//
//   node test_scripts/verify/verify-map-host.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://localhost:5173';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

const probe = await page.evaluate(async () => {
  const P = await import('/src/ui/ink/proportion.ts');
  const D = await import('/src/ui/ink/devices.ts');
  const s = P.GROUND_SCALE;

  // Read off `UNIT`, never re-derived. Hard-coding `0.786 * 1.8` here made this harness fail the
  // moment `LIVING` was raised — for a reason that had nothing to do with what it is checking.
  const unitFigure = P.UNIT.figure;
  const figureH = s * unitFigure * 6.7;
  // A tier-1 swordsman, the widest thing in a line block, from `diag/measure-figure.mjs`.
  const figureW = s * unitFigure * 3.17;

  const plate = D.armyShape(2400, 'balanced', s);

  const line = (shape) => shape.blocks.find((x) => x.key === 'line');
  return {
    groundScale: s,
    figureH: +figureH.toFixed(2),
    figureW: +figureW.toFixed(2),
    plate: {
      pitch: +line(plate).pitch.toFixed(2),
      rankPitch: +line(plate).rankPitch.toFixed(2),
      width: +plate.width.toFixed(1),
    },
  };
});

// The map renderer is the thing under test, so its own numbers are read back off a real marker.
const mapPitch = await page.evaluate(async () => {
  const D = await import('/src/ui/ink/devices.ts');
  const P = await import('/src/ui/ink/proportion.ts');
  // `MAP_HOST_SPREAD` is module-private on purpose; the marker's footprint is the public evidence.
  const plain = D.armyShape(2400, 'balanced', P.GROUND_SCALE);
  const spread = D.armyShape(2400, 'balanced', P.GROUND_SCALE, undefined, 4.6 / (16 / 9.46));
  const line = (sh) => sh.blocks.find((x) => x.key === 'line');
  return {
    plainWidth: +plain.width.toFixed(1),
    spreadWidth: +spread.width.toFixed(1),
    spreadPitch: +line(spread).pitch.toFixed(2),
    spreadRank: +line(spread).rankPitch.toFixed(2),
    spreadShear: +line(spread).shear.toFixed(2),
  };
});

await browser.close();

const { figureH, figureW, plate } = probe;
const m = mapPitch;

// The plate keeps Doc 12's own geometry — the thing that must NOT move. Asserted as the *ratio* of
// pitch to a man's height, because that is what Doc 12 actually specifies (16 units of pitch on a
// soldier 42 units to the crown) and it survives any change to `LIVING`, which a raw pixel figure
// does not: pinning 1.72 px here failed the moment the exaggeration was raised for a reason that
// had nothing to do with the plate.
check(Math.abs(plate.pitch / figureH - (16 / 9.46) / 6.7) < 0.01,
  'the plate keeps Doc 12’s pitch-to-height ratio',
  `${(plate.pitch / figureH).toFixed(3)} against ${((16 / 9.46) / 6.7).toFixed(3)}`);

check(m.spreadPitch > figureW, 'on the map a man no longer stands inside his neighbour',
  `pitch ${m.spreadPitch} px against a figure ${figureW} px wide`);
check(m.spreadRank >= figureH * 0.4, 'the ranks behind are readable over the shoulders in front',
  `rank pitch ${m.spreadRank} px on a figure ${figureH} px tall`);
check(m.spreadShear > 0, 'the ranks still step sideways', `shear ${m.spreadShear} px`);

check(m.spreadWidth > m.plainWidth * 2, 'the host takes real ground again',
  `${m.plainWidth} px before, ${m.spreadWidth} px now`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the map host does not read');
