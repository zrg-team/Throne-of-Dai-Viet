// What `figure()` actually draws, at s = 1, for every wardrobe it can wear.
//
// `proportion.ts` carries a `DRAWN` height for `figure` and derives `UNIT.figure` from it, and the
// table's own header records what happens when that number is an estimate rather than a
// measurement. The crowns changed the silhouette — a Lý crest sweeps back off the helm, a nón dấu
// carries a spike — so the entry has to be re-measured rather than assumed still true.
//
// The prop is handed a recorder rather than a Phaser Graphics: every method the ink primitives use
// is stubbed to collect coordinates, which is exact and immune to what the renderer would do.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/_measure-figure.mjs
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

const rows = await page.evaluate(async () => {
  const devices = await import('/src/ui/ink/devices.ts');
  const { UNIT } = await import('/src/ui/ink/proportion.ts');

  const make = () => {
    const pts = [];
    const note = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]); };
    const rec = {
      pts,
      fillStyle: () => rec, lineStyle: () => rec, beginPath: () => rec, closePath: () => rec,
      strokePath: () => rec, fillPath: () => rec, save: () => rec, restore: () => rec,
      translateCanvas: () => rec, scaleCanvas: () => rec, clear: () => rec,
      moveTo: (x, y) => { note(x, y); return rec; },
      lineTo: (x, y) => { note(x, y); return rec; },
      lineBetween: (a, b, c, d) => { note(a, b); note(c, d); return rec; },
      fillCircle: (x, y, r) => { note(x - r, y - r); note(x + r, y + r); return rec; },
      strokeCircle: (x, y, r) => { note(x - r, y - r); note(x + r, y + r); return rec; },
      fillRect: (x, y, w, h) => { note(x, y); note(x + w, y + h); return rec; },
      strokeRect: (x, y, w, h) => { note(x, y); note(x + w, y + h); return rec; },
      fillEllipse: (x, y, w, h) => { note(x - w / 2, y - h / 2); note(x + w / 2, y + h / 2); return rec; },
      fillTriangle: (a, b, c, d, e, f) => { note(a, b); note(c, d); note(e, f); return rec; },
      strokeTriangle: (a, b, c, d, e, f) => { note(a, b); note(c, d); note(e, f); return rec; },
      fillPoints: (ps) => { for (const p of ps) note(p.x, p.y); return rec; },
      strokePoints: (ps) => { for (const p of ps) note(p.x, p.y); return rec; },
      arc: (x, y, r) => { note(x - r, y - r); note(x + r, y + r); return rec; },
    };
    return rec;
  };

  // Drawn at 1 / UNIT.figure so the prop's internal `s` lands on exactly 1.
  const at = 1 / UNIT.figure;
  const out = [];
  for (const era of ['ly', 'tran', 'le', 'nguyen']) {
    for (const tier of [0, 1, 2]) {
      for (const arm of ['spear', 'bow', 'heavy']) {
        const g = make();
        devices.figure(g, 0, 0, at, 0x2a2118, { era, tier, arm, accent: 0xb33a26 });
        if (!g.pts.length) continue;
        const xs = g.pts.map((p) => p[0]);
        const ys = g.pts.map((p) => p[1]);
        out.push({
          era, tier, arm,
          h: Math.max(...ys) - Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
        });
      }
    }
  }
  return { out, unit: UNIT.figure };
});

await browser.close();

const tallest = rows.out.reduce((m, r) => (r.h > m.h ? r : m), rows.out[0]);
const widest = rows.out.reduce((m, r) => (r.w > m.w ? r : m), rows.out[0]);

console.log('═══ figure(), measured at s = 1 ═══\n');
console.log('era     tier arm      drawn h   drawn w');
for (const r of rows.out) {
  console.log(`${r.era.padEnd(8)}${String(r.tier).padStart(2)}  ${r.arm.padEnd(7)}${r.h.toFixed(2).padStart(9)}${r.w.toFixed(2).padStart(10)}`);
}
console.log(`\ntallest  ${tallest.h.toFixed(2)}  (${tallest.era} t${tallest.tier} ${tallest.arm})`);
console.log(`widest   ${widest.w.toFixed(2)}  (${widest.era} t${widest.tier} ${widest.arm})`);
console.log(`\nUNIT.figure is ${rows.unit}; a soldier is 1.7 m.`);
console.log(`For DRAWN = ${tallest.h.toFixed(1)}, UNIT should be ${(1.7 * 3.1 / tallest.h).toFixed(3)} `
  + `(PX_PER_M x metres / drawn, PX_PER_M = 3.1)`);
console.log(`\nerrors: ${errors.length ? errors.slice(0, 2).join(' ; ') : 'none'}`);
