// The ring has to be a ring.
//
// Five shapes, each beating the two clockwise from it. If that is not exactly true then some shape
// is dominant or some shape is helpless, and the whole fast dial collapses into "press the good
// one" — which is the fault the three-way stance ring had and the reason it was replaced.
//
// Pure arithmetic, so this runs against the module rather than against a fight.
//
//   node test_scripts/verify/verify-formation-ring.mjs
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
  const F = await import('/src/data/ascent/formations.ts');
  const ring = F.FORMATION_RING;

  const beats = {};
  const losesTo = {};
  for (const a of ring) {
    beats[a] = ring.filter((b) => a !== b && F.formationBeats(a, b));
    losesTo[a] = ring.filter((b) => a !== b && F.formationBeats(b, a));
  }

  // Every ordered pair is exactly one of: a beats b, b beats a, or they are the same shape.
  const contradictions = [];
  const mutuallyBlind = [];
  for (const a of ring) {
    for (const b of ring) {
      if (a === b) continue;
      const ab = F.formationBeats(a, b);
      const ba = F.formationBeats(b, a);
      if (ab && ba) contradictions.push(`${a}<->${b}`);
      if (!ab && !ba) mutuallyBlind.push(`${a}|${b}`);
    }
  }

  const selfBeats = ring.filter((a) => F.formationBeats(a, a));
  const signs = {};
  for (const a of ring) {
    for (const b of ring) signs[`${a}>${b}`] = F.formationTiltSign(a, b);
  }

  // The five doctrines, and which shapes each can form at full strength.
  const doctrines = ['balanced', 'spears', 'archers', 'shock', 'horse'].map((d) => ({
    d, states: F.formationAvailability(d, 2420, 2420),
  }));

  // Bleed a balanced host to nothing and record the order the shapes close.
  const closedAt = {};
  for (let men = 2420; men >= 0; men -= 20) {
    const states = F.formationAvailability('balanced', Math.max(1, men), 2420);
    for (const shape of ring) {
      if (states[shape] !== 'ready' && closedAt[shape] === undefined) closedAt[shape] = men;
    }
  }
  const floor = F.formationAvailability('balanced', 1, 2420);

  return { ring, beats, losesTo, contradictions, mutuallyBlind, selfBeats, signs, doctrines, closedAt, floor };
});

const { ring, beats, losesTo, contradictions, mutuallyBlind, selfBeats, signs, doctrines, closedAt, floor } = probe;

check(ring.length === 5, 'the ring holds five shapes', ring.join(' · '));

const twoEach = ring.every((a) => beats[a].length === 2 && losesTo[a].length === 2);
check(twoEach, 'every shape beats exactly two and loses to exactly two',
  ring.map((a) => `${a}:${beats[a].length}/${losesTo[a].length}`).join(' '));

check(contradictions.length === 0, 'no pair beats each other both ways', contradictions.join(', ') || 'none');
check(mutuallyBlind.length === 0, 'no pair is mutually neutral — there is nowhere to hide',
  mutuallyBlind.join(', ') || 'none');
check(selfBeats.length === 0, 'no shape beats itself', selfBeats.join(', ') || 'none');

// The document's own edges, spelled out. If any of these flips, the prose on the page is now a lie.
const DOC = [
  ['chong', 'xung'], ['chong', 'tan'],
  ['xung', 'tan'], ['xung', 'quy'],
  ['tan', 'quy'], ['tan', 'no'],
  ['quy', 'no'], ['quy', 'chong'],
  ['no', 'chong'], ['no', 'xung'],
];
const wrong = DOC.filter(([a, b]) => !beats[a].includes(b));
check(wrong.length === 0, "the ten edges match Doc 14's table",
  wrong.map(([a, b]) => `${a}>${b}`).join(', ') || 'all ten');

const signsOk = DOC.every(([a, b]) => signs[`${a}>${b}`] === 1 && signs[`${b}>${a}`] === -1)
  && ring.every((a) => signs[`${a}>${a}`] === 0);
check(signsOk, 'the tilt sign follows the ring, and is zero against a mirror');

// Doctrines that have no horse never had the wedge; the one with no screen never had the skirmish.
const spears = doctrines.find((d) => d.d === 'spears').states;
const archers = doctrines.find((d) => d.d === 'archers').states;
const shock = doctrines.find((d) => d.d === 'shock').states;
check(spears.xung === 'gone' && archers.xung === 'gone',
  'a doctrine with no horse never had Thế Xung', `spears:${spears.xung} archers:${archers.xung}`);
check(shock.tan === 'gone', 'a doctrine with no screen never had Thế Tán', `shock:${shock.tan}`);

// The narrowing arc: the screen dies first and takes the skirmish with it.
check(closedAt.tan !== undefined && (closedAt.xung === undefined || closedAt.tan > closedAt.xung),
  'Thế Tán closes before Thế Xung — the screen dies before the horse',
  `tan at ${closedAt.tan ?? 'never'} · xung at ${closedAt.xung ?? 'never'}`);

check(closedAt.chong === undefined && closedAt.quy === undefined,
  'Thế Chông and Thế Quy never close', `chong ${closedAt.chong ?? 'never'} · quy ${closedAt.quy ?? 'never'}`);

check(floor.quy === 'ready', 'the tortoise is the floor — a dock is never entirely dead', `quy:${floor.quy}`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the ring is not a ring');
