/**
 * Pixel-identity oracle for the `drawArmy` → `planArmy` refactor.
 *
 * The refactor re-implements `drawArmy` on top of a placement plan so figures can be stamped
 * instead of inked. The promise is that the drawing does not change AT ALL: same figures, same
 * positions, same wobble, same paint order. A Graphics object's `commandBuffer` is the drawing —
 * every fill, stroke and vertex in order — so hashing it before and after the refactor proves
 * pixel identity without a single screenshot.
 *
 * Usage:
 *   node test_scripts/diag/diag-army-hash.mjs --save     # write the baseline hashes
 *   node test_scripts/diag/diag-army-hash.mjs            # compare against the saved baseline
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { boot, arg, report } from '../perf/_boot.mjs';

const BASELINE = 'test_scripts/diag/army-hash-baseline.json';
const save = process.argv.includes('--save');

const { browser, page, errors } = await boot({ dpr: 1, quality: 'low' });
await page.waitForFunction(() => window.__phaserGame?.scene?.isActive('MenuScene'), null, { timeout: 30000 });

const hashes = await page.evaluate(async () => {
  const { drawArmy } = await import('/src/ui/ink/devices.ts');
  const game = window.__phaserGame;
  const scene = game.scene.getScene('MenuScene');

  // FNV-1a over the serialised command buffer. Numbers rounded to 1e-6 so float formatting can
  // never differ; command objects and arrays are flattened in order.
  const fnv = (parts) => {
    let h = 0x811c9dc5;
    const eat = (str) => {
      for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    };
    for (const part of parts) eat(part);
    return h.toString(16);
  };
  const flat = (value, out) => {
    if (typeof value === 'number') out.push(String(Math.round(value * 1e6) / 1e6));
    else if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) for (const v of value) flat(v, out);
    else if (value && typeof value === 'object') {
      for (const key of Object.keys(value).sort()) { out.push(key); flat(value[key], out); }
    } else out.push(String(value));
    return out;
  };

  // Three armies spanning the paths: a small plain host, a large mixed host with casualties,
  // and a shaped host (wedge borrowing) with per-rank targets the way the map marker draws.
  const CASES = [
    { name: 'small-line', men: 120, seed: 41, colour: 0x2b2b23, s: 0.72, kit: { theme: 'le' } },
    {
      name: 'big-mixed', men: 2400, seed: 7, colour: 0x2b2b23, s: 2.2,
      kit: { theme: 'tran', tier: 2, units: { spearmen: 900, archers: 900, heavyInfantry: 600 }, mustered: 3000 },
    },
    {
      name: 'shaped-ranks', men: 800, seed: 99, colour: 0x53524a, s: 2.2,
      kit: { theme: 'qing', accent: 0x8a2b1d, shape: 'xung' },
      ranks: true,
    },
  ];

  const results = {};
  for (const c of CASES) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const rankLayers = [];
    const rankTarget = c.ranks
      ? (index) => {
        while (rankLayers.length <= index) rankLayers.push(scene.make.graphics({ x: 0, y: 0 }, false));
        return rankLayers[index];
      }
      : undefined;
    const shape = drawArmy(g, 200, 300, c.men, c.seed, c.colour, c.s, c.kit, rankTarget);
    const parts = flat(g.commandBuffer, []);
    for (const layer of rankLayers) flat(layer.commandBuffer, parts);
    results[c.name] = {
      hash: fnv(parts),
      commands: parts.length,
      marks: shape.marks,
      blocks: shape.blocks.map((b) => `${b.key}:${b.marks}:${b.cols}x${b.rows}`).join(' '),
    };
    g.destroy();
    for (const layer of rankLayers) layer.destroy();
  }
  return results;
});

await browser.close();

console.log(JSON.stringify(hashes, null, 2));
const checks = [['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')]];

if (save) {
  writeFileSync(BASELINE, JSON.stringify(hashes, null, 2));
  console.log(`baseline saved to ${BASELINE}`);
} else if (!existsSync(BASELINE)) {
  checks.push(['baseline exists (run with --save first)', false, BASELINE]);
} else {
  const base = JSON.parse(readFileSync(BASELINE, 'utf-8'));
  for (const [name, result] of Object.entries(hashes)) {
    checks.push([`${name}: command stream identical`, base[name]?.hash === result.hash,
      `${base[name]?.hash} vs ${result.hash} (${base[name]?.commands} vs ${result.commands} parts)`]);
  }
}
report(checks);
void arg;
