/**
 * The quality ladder moves when the frames say so, and only then.
 *
 * Run WITHOUT `?capture=1` (which pins the ladder for every other harness) and WITH
 * `?ladder=fast` (600 ms windows). Heat is injected as a real post-step busy-wait, so the gap
 * clock — the one the player feels — is what trips the rung, exactly as on a slow phone.
 *
 * Usage: node test_scripts/verify/verify-ladder.mjs
 */
import { boot, report } from '../perf/_boot.mjs';

const { browser, page, errors } = await boot({ dpr: 3, quality: 'auto', query: '?ladder=fast', ladder: true });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(400);

const checks = [];
const state = () => page.evaluate(() => window.__ladder.state());

const s0 = await state();
checks.push(['the ladder runs on a real page', s0.enabled === true, JSON.stringify(s0)]);
// dpr 3 with no explicit tier: ceiling high, and the session STARTS there — a conservative
// step below was tried and read as a regression on every healthy device.
checks.push(['it starts at its ceiling', s0.rung === 'high' && s0.ceiling === 'high',
  `rung ${s0.rung}, ceiling ${s0.ceiling}`]);

// ── Heat: 40 ms of busy-wait per frame → the gap clock runs hot → a step down ──
await page.evaluate(() => {
  window.__nonce = Math.random();
  window.__burn = (ms) => {
    window.__burnOff?.();
    const on = () => { const t = performance.now(); while (performance.now() - t < ms) { /* burn */ } };
    window.__phaserGame.events.on('poststep', on);
    window.__burnOff = () => window.__phaserGame.events.off('poststep', on);
  };
  window.__burn(40);
});
// Polled, because a state that appears pristine at the end can hide steps that happened and
// were wiped by an instance swap (HMR re-evaluating main.ts) or a reload mid-phase.
let hot = await state();
for (let i = 0; i < 8; i += 1) {
  await page.waitForTimeout(800);
  const now = await page.evaluate(() => ({
    ...window.__ladder.state(),
    nonce: window.__nonce ?? 'GONE',
    stored: localStorage.getItem('mandate:graphics:rung:v1'),
  }));
  console.log(`  t+${(i + 1) * 0.8}s`, JSON.stringify(now));
  hot = now;
  if (['low', 'low-30'].includes(now.rung)) break;
}
checks.push(['sustained heat steps the rung down', ['medium-lite', 'low', 'low-30'].includes(hot.rung),
  `rung ${hot.rung} after 4.5 s at ~40 ms/frame`]);
const sheets = await page.evaluate(() => [...(window.__phaserGame.scene.getScene('MenuScene').children.list)]
  .filter((o) => o.texture?.key === 'ink:paper-grain' && o.visible).length);
checks.push(['medium-lite hides the paper sheet', sheets === 0, `${sheets} visible grain sprites`]);
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

// ── Calm: burn off, then STEP the loop by hand at 8 ms — SwiftShader at DSF 3 is genuinely
// slow, so waiting for real calm frames measures the CI box, not the ladder. Synthetic deltas
// make the gap clock exactly what a healthy 120 Hz device would report.
await page.evaluate(async () => {
  window.__burnOff();
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
