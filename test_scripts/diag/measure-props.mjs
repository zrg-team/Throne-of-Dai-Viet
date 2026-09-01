// What every prop actually draws, at `s = 1`, measured rather than guessed.
//
// `proportion.ts` claims a `DRAWN` height for each prop and derives its `UNIT` correction from it,
// and the table's own header records what happened the last time those numbers were estimates: a
// lũy tre drawn half again the height of the tree beside it, because bamboo was written down as 31
// when it is 44.6. This is the script that produces the column — re-run it whenever a prop's
// geometry changes and reconcile `UNIT`, `DRAWN` and the doc table against what it prints.
//
// A prop is handed a recorder rather than a Phaser Graphics: every method the ink primitives use is
// stubbed to collect coordinates, which is both exact and immune to whatever the renderer would
// have done with them. Each prop is drawn at `1 / UNIT[prop]` so its internal `s` lands on 1.
//
// Usage: node test_scripts/scratch/_measure-props.mjs [prop ...]
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const ONLY = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

const rows = await page.evaluate(async (only) => {
  const props = await import('/src/ui/ink/props.ts');
  const { UNIT } = await import('/src/ui/ink/proportion.ts');
  const season = await import('/src/ui/ink/season.ts');

  const recorder = () => {
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    let ox = 0;
    let oy = 0;
    const at = (px, py) => {
      box.minX = Math.min(box.minX, px + ox);
      box.maxX = Math.max(box.maxX, px + ox);
      box.minY = Math.min(box.minY, py + oy);
      box.maxY = Math.max(box.maxY, py + oy);
    };
    const points = (list) => { for (const p of list) at(p.x, p.y); };
    return {
      box,
      fillStyle: () => {}, lineStyle: () => {},
      translateCanvas: (dx, dy) => { ox += dx; oy += dy; },
      fillPoints: points, strokePoints: points,
      fillEllipse: (cx, cy, w, h) => { at(cx - w / 2, cy - h / 2); at(cx + w / 2, cy + h / 2); },
      fillCircle: (cx, cy, r) => { at(cx - r, cy - r); at(cx + r, cy + r); },
      fillRect: (rx, ry, w, h) => { at(rx, ry); at(rx + w, ry + h); },
      lineBetween: (x1, y1, x2, y2) => { at(x1, y1); at(x2, y2); },
    };
  };

  // Summer, so nothing is measured in the one season that strips a crown off.
  season.setFoliageSeason('Summer');
  const out = [];
  for (const prop of Object.keys(UNIT)) {
    if (only.length && !only.includes(prop)) continue;
    const fn = props[prop];
    if (typeof fn !== 'function') { out.push({ prop, drawn: null, note: 'not exported from props.ts' }); continue; }
    // Fifteen seeds, and the **median** of them: every prop jitters, and one unlucky tall draw is
    // not what the table is describing. The max is printed beside it so a prop whose jitter is
    // wider than its neighbours' shows up rather than hiding inside one number.
    const heights = [];
    const widths = [];
    for (let seed = 1; seed <= 15; seed += 1) {
      const g = recorder();
      fn(g, 0, 0, 1 / UNIT[prop], seed * 37);
      heights.push(g.box.maxY - g.box.minY);
      widths.push(g.box.maxX - g.box.minX);
    }
    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    out.push({
      prop,
      drawn: Number(median(heights).toFixed(1)),
      tallest: Number(Math.max(...heights).toFixed(1)),
      width: Number(median(widths).toFixed(1)),
    });
  }
  return out;
}, ONLY);

await browser.close();

const PX_PER_M = 3.1;
const METRES = {
  house: 5, dinh: 8, thap: 16, hayStack: 3, tree: 8, bush: 1.4,
  bamboo: 8, banana: 4, areca: 10, banyan: 14,
  grassTuft: 0.9, figure: 1.7, farmer: 1.7, buffalo: 1.5,
};
console.log('prop        drawn    max   wide    metres   UNIT should be');
for (const row of rows) {
  if (row.drawn === null) { console.log(`${row.prop.padEnd(11)} ${row.note}`); continue; }
  const metres = METRES[row.prop];
  const unit = metres ? (PX_PER_M * metres) / row.drawn : NaN;
  console.log(
    `${row.prop.padEnd(11)} ${String(row.drawn).padStart(5)}  ${String(row.tallest).padStart(5)}  ${String(row.width).padStart(5)}`
    + `   ${String(metres ?? '?').padStart(5)}   ${unit.toFixed(3)}`,
  );
}
if (errors.length) console.log('ERRORS', errors.slice(0, 3).join(' | '));
