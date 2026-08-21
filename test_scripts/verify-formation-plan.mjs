// A host in a fight stands in the shape it was ordered into. A host anywhere else does not.
//
// `armyShape` has three callers and only one of them is in a battle: the fight screen, the History
// plate and the map marker. An army crossing a province is not standing in Thế Nỏ, so the shape is
// an **optional** argument and its absence has to reproduce today's geometry to the pixel — if the
// default went the other way every marker on the map would silently change shape and no harness
// here would say so.
//
// Checked as geometry rather than as pictures: the block table is the thing under test, and a
// screenshot diff would answer "did anything move" when the question is "did the right thing move".
//
//   node test_scripts/verify-formation-plan.mjs
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
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

const probe = await page.evaluate(async () => {
  const D = await import('/src/ui/ink/devices.ts');
  const F = await import('/src/data/ascent/formations.ts');
  const P = await import('/src/ui/ink/proportion.ts');

  /** A block's geometry, to two decimals — everything a formation is allowed to restate. */
  const read = (shape) => {
    const s = D.armyShape(2420, 'balanced', 1, undefined, 1, shape);
    const by = {};
    s.blocks.forEach((b) => {
      by[b.key] = {
        x: +b.x.toFixed(2), y: +b.y.toFixed(2),
        lead: +(b.x + (b.cols - 1) * b.pitch).toFixed(2),
        cols: b.cols, rows: b.rows,
        pitch: +b.pitch.toFixed(2),
        wedge: b.wedge === true,
      };
    });
    return { width: +s.width.toFixed(2), marks: s.marks, by };
  };

  return {
    base: read(undefined),
    shapes: Object.fromEntries(F.FORMATION_RING.map((id) => [id, read(id)])),
    ring: F.FORMATION_RING,
    // The map marker's own call, which must be untouched by any of this.
    map: (() => {
      const s = D.armyShape(2420, 'balanced', P.GROUND_SCALE, undefined, 4.6 / (16 / 9.46));
      return { width: +s.width.toFixed(2), blocks: s.blocks.length };
    })(),
    mapWithShape: (() => {
      // Nothing passes a shape here — this is what a marker would look like if something did,
      // and the check below is that the real call is the first one, not this.
      const s = D.armyShape(2420, 'balanced', P.GROUND_SCALE, undefined, 4.6 / (16 / 9.46), 'no');
      return { width: +s.width.toFixed(2) };
    })(),
  };
});

// ── the default is today ───────────────────────────────────────────────────
// Pinned as a relationship rather than as absolute numbers: these come from `FORMATION` and
// `DOCTRINE`, and hard-coding pixels here would fail the next time an unrelated constant moved.
const b = probe.base.by;
check(b.screen.x > b.line.x && b.line.x > b.bows.x,
  'with no shape, the screen is still forward of the line and the bows still behind it',
  `screen ${b.screen.x}, line ${b.line.x}, bows ${b.bows.x}`);
check(b.horse.y > b.bows.y && b.bows.y > b.screen.y,
  'and the horse still stands nearest the viewer',
  `screen ${b.screen.y}, bows ${b.bows.y}, horse ${b.horse.y}`);
check(Object.values(b).every((block) => block.wedge === false),
  'nothing is a wedge unless a shape asks for one');

// ── every shape is a different deployment ──────────────────────────────────
const prints = new Map();
probe.ring.forEach((id) => prints.set(id, JSON.stringify(probe.shapes[id].by)));
check(new Set(prints.values()).size === probe.ring.length,
  'all five shapes deploy differently',
  `${new Set(prints.values()).size} distinct of ${probe.ring.length}`);
check(!probe.ring.some((id) => prints.get(id) === JSON.stringify(b)),
  'and none of them is just the default again');

// The same men in every shape — a formation moves the host, it does not recruit or disband.
const marks = new Set([probe.base.marks, ...probe.ring.map((id) => probe.shapes[id].marks)]);
check(marks.size === 1, 'the same men stand in every shape', `${[...marks].join(' / ')} marks`);

// ── each shape is the thing it is named after ──────────────────────────────
const S = probe.shapes;
check(S.chong.by.line.cols > S.quy.by.line.cols,
  'Thế Chông stands its line wider than Thế Quy does',
  `${S.chong.by.line.cols} files against ${S.quy.by.line.cols}`);
check(S.quy.by.line.rows > S.chong.by.line.rows,
  'and Thế Quy stands it deeper',
  `${S.quy.by.line.rows} ranks against ${S.chong.by.line.rows}`);
check(S.no.by.line.cols >= S.chong.by.line.cols,
  'Thế Nỏ puts the broadest front of all across the field',
  `${S.no.by.line.cols} files`);
check(S.tan.by.screen.pitch > S.quy.by.screen.pitch,
  'Thế Tán stands its screen loose where Thế Quy packs it',
  `pitch ${S.tan.by.screen.pitch} against ${S.quy.by.screen.pitch}`);
check(S.xung.by.horse.wedge === true && probe.ring.filter((id) => S[id].by.horse.wedge).length === 1,
  'and only Thế Xung forms a wedge',
  probe.ring.filter((id) => S[id].by.horse.wedge).join(',') || 'none');

// Which block is at the seam is the shape's whole argument, so check it is the named one.
const foremost = (id) => Object.entries(S[id].by).sort((p, q) => q[1].lead - p[1].lead)[0][0];
const NAMED = { chong: 'line', xung: 'horse', tan: 'screen', quy: 'line', no: 'line' };
const wrong = probe.ring.filter((id) => foremost(id) !== NAMED[id]);
check(wrong.length === 0,
  'each shape puts the block that gives it its name nearest the enemy',
  wrong.map((id) => `${id}:${foremost(id)}`).join(' ') || 'all five');

// Thế Nỏ is the one shape whose forward block is not the block it depends on: the thin fence is
// the line, and the bows it is there to protect are banked behind it. Worth pinning, because a
// plan that put the bows at the seam would look like a volley and play like a massacre.
const depends = await page.evaluate(async () => {
  const F = await import('/src/data/ascent/formations.ts');
  return F.BLOCK_OF;
});
check(depends.no === 'bows' && foremost('no') === 'line',
  'Thế Nỏ shoots from behind its own fence, not in front of it',
  `depends on ${depends.no}, foremost is ${foremost('no')}`);

// ── the map is not in a battle ─────────────────────────────────────────────
check(probe.map.blocks === 4, 'the map marker still deploys its four blocks');
check(probe.map.width !== probe.mapWithShape.width,
  'a shape would visibly change it — which is why nothing passes one',
  `${probe.map.width} against ${probe.mapWithShape.width} if it did`);

// The real proof: nothing outside the fight screen passes a shape at all.
const callers = await page.evaluate(async () => {
  const sources = await Promise.all([
    fetch('/src/ui/DongHoMapItemRenderer.ts').then((r) => r.text()),
    fetch('/src/scenes/HistoryScene.ts').then((r) => r.text()),
  ]);
  return sources.map((src) => /\bshape\s*:/.test(src) || /armyShape\([^)]*,[^)]*,[^)]*,[^)]*,[^)]*,[^)]*\)/s.test(src));
});
check(callers.every((passes) => passes === false),
  'and neither the map renderer nor the History plate asks for one',
  callers.map((v, i) => `${['map', 'history'][i]}:${v}`).join(' '));

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the formation plan does not hold');
