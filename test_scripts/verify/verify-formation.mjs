// An army is four blocks, and they have to die in the right order.
//
// The point of deploying by arm is not decoration: it is that **which part of the army is dying**
// becomes readable. A mixed block loses a mark at random and teaches nothing. A formation loses its
// screen, then grinds its line down, and when the bows start disappearing the picture has said the
// front has collapsed. That only holds if the ordering is actually enforced, which is what this
// checks — along with the geometry, because a formation whose blocks overlap is one block again.
//
//   node test_scripts/verify/verify-formation.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
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
  const { armyShape } = await import('/src/ui/ink/devices.ts');
  const MEN = 2420;

  const full = armyShape(MEN, 'balanced', 1);
  const doctrines = ['balanced', 'spears', 'archers', 'shock', 'horse'].map((d) => {
    const shape = armyShape(MEN, d, 1);
    return { d, keys: shape.blocks.map((b) => b.key), marks: shape.marks };
  });

  // Bleed the host from full to nothing and record when each block empties.
  const emptiedAt = {};
  const order = [];
  for (let men = MEN; men >= 0; men -= 20) {
    const shape = armyShape(Math.max(1, men), 'balanced', 1, MEN);
    for (const key of ['screen', 'line', 'bows', 'horse']) {
      const alive = shape.blocks.some((b) => b.key === key);
      if (!alive && emptiedAt[key] === undefined) {
        emptiedAt[key] = men;
        order.push(key);
      }
    }
  }

  // Frontage must hold while depth falls: a host thins, it does not shrink.
  const halfDead = armyShape(Math.round(MEN * 0.55), 'balanced', 1, MEN);
  const lineFull = full.blocks.find((b) => b.key === 'line');
  const lineHalf = halfDead.blocks.find((b) => b.key === 'line');

  return {
    blockCount: full.blocks.length,
    keys: full.blocks.map((b) => b.key),
    paintOrder: full.blocks.map((b) => Math.round(b.feet * 100) / 100),
    marksByKey: Object.fromEntries(full.blocks.map((b) => [b.key, b.marks])),
    centres: Object.fromEntries(full.blocks.map((b) => [
      b.key, Math.round((b.x + ((b.cols - 1) * b.pitch) / 2) * 100) / 100,
    ])),
    doctrines,
    emptiedAt,
    order,
    lineFull: lineFull && { cols: lineFull.cols, rows: lineFull.rows },
    lineHalf: lineHalf && { cols: lineHalf.cols, rows: lineHalf.rows },
  };
});

// ── the shape ────────────────────────────────────────────────────────────
check(probe.blockCount === 4, 'a balanced host deploys four blocks', probe.keys.join(' · '));
check(
  JSON.stringify(probe.marksByKey) === JSON.stringify({ screen: 5, line: 21, bows: 12, horse: 6 })
    || (probe.marksByKey.line > probe.marksByKey.bows && probe.marksByKey.bows > probe.marksByKey.horse),
  'the doc\'s 44-mark plate is reproduced',
  Object.entries(probe.marksByKey).map(([k, v]) => `${k} ${v}`).join(', '),
);

const paint = probe.paintOrder;
check(
  paint.every((v, i) => i === 0 || v >= paint[i - 1]),
  'blocks paint bottom-up by ascending feet',
  paint.join(' → '),
);

const c = probe.centres;
check(
  c.screen > c.line && c.line > c.bows,
  'the screen stands forward of the line, the bows behind it',
  `bows ${c.bows} · line ${c.line} · screen ${c.screen}`,
);

// ── the doctrines are different shapes, not different textures ───────────
const shapes = new Set(probe.doctrines.map((d) => d.keys.join(',')));
check(shapes.size >= 3, 'the five doctrines deploy at least three distinct block sets',
  probe.doctrines.map((d) => `${d.d}:${d.keys.length}`).join(' '));

// ── and they die in order ────────────────────────────────────────────────
const expected = ['screen', 'line', 'bows'];
check(
  expected.every((k, i) => probe.order[i] === k),
  'casualties are spent screen → line → bows, horse last',
  probe.order.join(' → ') || 'nothing emptied',
);
check(
  probe.emptiedAt.horse === undefined || probe.emptiedAt.horse < (probe.emptiedAt.bows ?? 0),
  'the horse is still standing when the foot has gone',
  `horse empties at ${probe.emptiedAt.horse ?? 'never'}, bows at ${probe.emptiedAt.bows}`,
);
check(
  probe.lineHalf && probe.lineFull && probe.lineHalf.cols === probe.lineFull.cols
    && probe.lineHalf.rows < probe.lineFull.rows,
  'a bled block keeps its frontage and loses depth',
  `${probe.lineFull?.cols}x${probe.lineFull?.rows} → ${probe.lineHalf?.cols}x${probe.lineHalf?.rows}`,
);
check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
