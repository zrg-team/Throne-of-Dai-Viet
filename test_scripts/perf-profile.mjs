/**
 * CPU profile of the realtime-tick hot path. Boots the seeded bench game, records
 * a V8 CPU profile while advancing N big-delta ticks (sim + refresh + render),
 * then prints the functions with the most self-time. Identifies the real hotspots
 * instead of guessing which renderer dominates.
 *
 * Usage: node test_scripts/perf-profile.mjs [--url http://127.0.0.1:5173] [--ticks 120] [--cpu 1]
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const URL = arg('url', 'http://127.0.0.1:5173');
const TICKS = Number(arg('ticks', '120'));
const CPU = Number(arg('cpu', '1'));
const SEED = Number(arg('seed', '1337'));

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cdp = await page.context().newCDPSession(page);

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame
    && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });
await page.evaluate((seed) => window.__startBenchGame(seed), SEED);
await page.waitForFunction(
  () => window.__phaserGame.scene.isActive('MapScene') && !!window.__mandateState,
  null, { timeout: 30000 });
await page.waitForTimeout(600);

if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 50 }); // 50us = fine-grained
await cdp.send('Profiler.start');

await page.evaluate((ticks) => {
  const game = window.__phaserGame;
  for (let i = 0; i < ticks; i += 1) game.step(performance.now(), 6000);
}, TICKS);

const { profile } = await cdp.send('Profiler.stop');

// Aggregate self-time per node id from sample deltas.
const nodeById = new Map();
for (const n of profile.nodes) nodeById.set(n.id, n);
const selfHits = new Map();
for (const id of profile.samples) selfHits.set(id, (selfHits.get(id) || 0) + 1);

const totalUs = (profile.timeDeltas || []).reduce((a, b) => a + b, 0);
const byFn = new Map();
for (const [id, hits] of selfHits) {
  const node = nodeById.get(id);
  if (!node) continue;
  const cf = node.callFrame;
  const file = (cf.url || '').split('/').slice(-1)[0] || cf.url || 'native';
  const key = `${cf.functionName || '(anonymous)'}  @ ${file}:${cf.lineNumber + 1}`;
  byFn.set(key, (byFn.get(key) || 0) + hits);
}

const totalHits = profile.samples.length || 1;
const ranked = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);

console.log(`\n=== CPU profile: ${TICKS} ticks, ${(totalUs / 1000).toFixed(0)} ms total, ${totalHits} samples ===`);
console.log(`self%   self-ms   function`);
for (const [key, hits] of ranked) {
  const pct = ((hits / totalHits) * 100).toFixed(1).padStart(5);
  const ms = ((hits / totalHits) * (totalUs / 1000)).toFixed(0).padStart(6);
  console.log(`${pct}%  ${ms}    ${key}`);
}

await browser.close();
