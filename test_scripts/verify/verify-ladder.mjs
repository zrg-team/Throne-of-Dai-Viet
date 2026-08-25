/**
 * The quality ladder moves when the frames say so, and only then.
 *
 * Run WITHOUT `?capture=1` (which pins the ladder for every other harness) and WITH
 * `?ladder=fast` (600 ms windows). BOTH phases step the loop by hand with synthetic deltas:
 * headless Chromium's rAF clock is a fiction — timestamps advance exactly 16.67 ms per callback
 * whatever the wall clock did (measured: 16.67 ms deltas against 144 ms real gaps under a 40 ms
 * busy-wait), so no real burn can ever look hot here, and SwiftShader at DSF 3 never looks calm.
 * Synthetic deltas are exactly what a phone's real (honest) rAF timestamps would report.
 *
 * Usage: node test_scripts/verify/verify-ladder.mjs
 */
import { boot, report } from '../perf/_boot.mjs';

// Explicit high: the auto default is medium at ANY pixel ratio now (high spends real VRAM and
// is only ever chosen, never guessed), so an unpinned session would start — and cap — there.
const { browser, page, errors } = await boot({ dpr: 3, quality: 'high', query: '?ladder=fast', ladder: true });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(400);

const checks = [];
const state = () => page.evaluate(() => window.__ladder.state());

const s0 = await state();
checks.push(['the ladder runs on a real page', s0.enabled === true, JSON.stringify(s0)]);
// An explicit tier is a promise: the session STARTS there and caps there — a conservative
// step below was tried and read as a regression on every healthy device.
checks.push(['it starts at its ceiling', s0.rung === 'high' && s0.ceiling === 'high',
  `rung ${s0.rung}, ceiling ${s0.ceiling}`]);

// ── Heat: hand-stepped 48 ms frames — what a phone delivering ~21 fps reports → a step down ──
await page.evaluate(() => {
  window.__nonce = Math.random();
  const game = window.__phaserGame;
  game.loop.sleep();
  let clock = performance.now();
  for (let i = 0; i < 160; i += 1) { clock += 48; game.step(clock, 48); }
  game.loop.wake();
});
// Polled, because a state that appears pristine at the end can hide steps that happened and
// were wiped by an instance swap (HMR re-evaluating main.ts) or a reload mid-phase.
let hot = await state();
for (let i = 0; i < 3; i += 1) {
  await page.waitForTimeout(400);
  const now = await page.evaluate(() => ({
    ...window.__ladder.state(),
    nonce: window.__nonce ?? 'GONE',
    stored: localStorage.getItem('mandate:graphics:rung:v1'),
  }));
  console.log(`  t+${(i + 1) * 0.4}s`, JSON.stringify(now));
  hot = now;
  if (now.stepsDown >= 2) break;
}
checks.push(['sustained heat steps the rung down', ['medium-lite', 'low', 'low-30'].includes(hot.rung),
  `rung ${hot.rung} after 4.5 s at ~40 ms/frame`]);
// The paper sheet is OFF by default at every tier and rung (user verdict: it read as a gray
// filter) — only `?paper=N` lays it. This page passed no such switch, so none may exist.
const sheets = await page.evaluate(() => [...(window.__phaserGame.scene.getScene('MenuScene').children.list)]
  .filter((o) => (o.texture?.key === 'ink:paper-grain' || o.texture?.key === 'ink:paper-tone') && o.visible).length);
checks.push(['no paper sheet without ?paper=', sheets === 0, `${sheets} visible sheet layers`]);
const persisted = await page.evaluate(() => localStorage.getItem('mandate:graphics:rung:v1'));
checks.push(['the rung is persisted', persisted === hot.rung, `stored ${persisted}`]);

// ── A step to `low` leaves a buffer-scale request pending for the next boundary ──
if (hot.rung === 'low' || hot.rung === 'low-30') {
  const pending = await page.evaluate(async () => {
    const { pendingRenderScale } = await import('/src/game/graphicsQuality.ts');
    return pendingRenderScale();
  });
  checks.push(['the buffer scale waits for a boundary', pending === 1, `pending ${pending}`]);
}

// ── Calm: hand-stepped 8 ms frames — what a healthy 120 Hz device reports → a climb back ──
await page.evaluate(async () => {
  const game = window.__phaserGame;
  game.loop.sleep();
  let clock = performance.now();
  for (let i = 0; i < 900; i += 1) { clock += 8; game.step(clock, 8); }
  game.loop.wake();
});
const calm = await state();
const rungOrder = ['high', 'medium', 'medium-lite', 'low', 'low-30'];
checks.push(['calm frames climb the ladder back', rungOrder.indexOf(calm.rung) < rungOrder.indexOf(hot.rung),
  `rung ${hot.rung} -> ${calm.rung}`]);
checks.push(['never above the ceiling', rungOrder.indexOf(calm.rung) >= rungOrder.indexOf(calm.ceiling),
  `rung ${calm.rung} vs ceiling ${calm.ceiling}`]);

checks.push(['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')]);
await browser.close();
report(checks);
