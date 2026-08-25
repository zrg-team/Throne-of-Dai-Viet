/**
 * The quality ladder moves when the frames say so — and only for a tier nobody chose.
 *
 * Run WITHOUT `?capture=1` (which pins the ladder for every other harness) and WITH
 * `?ladder=fast` (600 ms windows). The movement phases step the loop by hand with synthetic
 * deltas: headless Chromium's rAF clock is a fiction — timestamps advance exactly 16.67 ms per
 * callback whatever the wall clock did (measured: 16.67 ms deltas against 144 ms real gaps under
 * a 40 ms busy-wait), so no real burn can ever look hot here, and SwiftShader at DSF 3 never
 * looks calm. Synthetic deltas are exactly what a phone's real (honest) rAF timestamps report.
 *
 * Two sessions:
 *   1. AUTO — no stored tier. This is the ladder's job: heat steps down, the rung persists,
 *      calm climbs back, never above the ceiling.
 *   2. EXPLICIT high — the player has spoken, the ladder is pinned. Heat moves nothing, and the
 *      exact user repro (run sharp -> leave -> new run) stays at the high bake density. Before
 *      the pin, the step-down landed at the exit-to-menu boundary and the NEXT run baked a tier
 *      softer than the one just played — "leave, start new game, blurry", from an explicit Cao.
 *
 * Usage: node test_scripts/verify/verify-ladder.mjs
 */
import { boot, startWorld, resolveOpening, report } from '../perf/_boot.mjs';

const checks = [];

const heat = (page, frames = 160, gap = 48) => page.evaluate(([n, g]) => {
  const game = window.__phaserGame;
  game.loop.sleep();
  let clock = performance.now();
  for (let i = 0; i < n; i += 1) { clock += g; game.step(clock, g); }
  game.loop.wake();
}, [frames, gap]);

// ── Session 1: AUTO — the sampler steers ────────────────────────────────────────────────────
{
  const { browser, page, errors } = await boot({ dpr: 3, quality: 'auto', query: '?ladder=fast', ladder: true });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(400);

  const state = () => page.evaluate(() => window.__ladder.state());
  const s0 = await state();
  checks.push(['the ladder runs on a real page', s0.enabled === true && s0.pinned === false, JSON.stringify(s0)]);
  // No stored tier: the session starts AT its ceiling (medium at any pixel ratio) — a
  // conservative step below was tried and read as a regression on every healthy device.
  checks.push(['an auto session starts at its ceiling', s0.rung === 'medium' && s0.ceiling === 'medium',
    `rung ${s0.rung}, ceiling ${s0.ceiling}`]);

  // Heat: hand-stepped 48 ms frames — what a phone delivering ~21 fps reports → steps down.
  await page.evaluate(() => { window.__nonce = Math.random(); });
  await heat(page);
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
    console.log(`  auto t+${(i + 1) * 0.4}s`, JSON.stringify(now));
    hot = now;
    if (now.stepsDown >= 2) break;
  }
  checks.push(['sustained heat steps an auto session down', ['medium-lite', 'low', 'low-30'].includes(hot.rung),
    `rung ${hot.rung} after ~7.7 s of frame time at 48 ms/frame`]);
  // The paper sheet is OFF by default at every tier and rung (user verdict: it read as a gray
  // filter) — only `?paper=N` lays it. This page passed no such switch, so none may exist.
  const sheets = await page.evaluate(() => [...(window.__phaserGame.scene.getScene('MenuScene').children.list)]
    .filter((o) => (o.texture?.key === 'ink:paper-grain' || o.texture?.key === 'ink:paper-tone') && o.visible).length);
  checks.push(['no paper sheet without ?paper=', sheets === 0, `${sheets} visible sheet layers`]);
  const persisted = await page.evaluate(() => localStorage.getItem('mandate:graphics:rung:v1'));
  checks.push(['the rung is persisted', persisted === hot.rung, `stored ${persisted}`]);

  // A step below medium wants scale 1; the buffer must still be 2 until a boundary lands it.
  // Read through the ladder's own state(), not a dynamic import of graphicsQuality — the dev
  // server hands the page a SECOND instance of that module, whose pendingScale is virginal.
  if (hot.rung === 'low' || hot.rung === 'low-30') {
    checks.push(['the buffer scale waits for a boundary', hot.scale === 2,
      `buffer at ${hot.scale} while the rung is ${hot.rung}`]);
  }

  // Calm: hand-stepped 8 ms frames — what a healthy 120 Hz device reports → climbs back.
  await heat(page, 900, 8);
  const calm = await state();
  const rungOrder = ['high', 'medium', 'medium-lite', 'low', 'low-30'];
  checks.push(['calm frames climb the ladder back', rungOrder.indexOf(calm.rung) < rungOrder.indexOf(hot.rung),
    `rung ${hot.rung} -> ${calm.rung}`]);
  checks.push(['never above the ceiling', rungOrder.indexOf(calm.rung) >= rungOrder.indexOf(calm.ceiling),
    `rung ${calm.rung} vs ceiling ${calm.ceiling}`]);

  checks.push(['no console errors (auto)', errors.length === 0, errors.slice(0, 3).join(' | ')]);
  await browser.close();
}

// ── Session 2: EXPLICIT high — the player has spoken, the ladder is pinned ──────────────────
{
  const { browser, page, errors } = await boot({ dpr: 3, quality: 'high', query: '?ladder=fast', ladder: true });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(400);

  const s0 = await page.evaluate(() => window.__ladder.state());
  checks.push(['an explicit tier starts at its rung, pinned', s0.rung === 'high' && s0.pinned === true,
    JSON.stringify(s0)]);

  // The user repro, end to end: run (sharp) -> heat -> leave -> new run. Nothing may soften.
  await startWorld(page, { mode: 'ascent', seed: 1337, settle: 1200 });
  await resolveOpening(page);
  await page.waitForTimeout(600);
  const firstRun = await page.evaluate(() => {
    const sc = window.__phaserGame.scene.getScene('ConquestScene');
    return { rt: `${sc.staticBakeRT?.width}x${sc.staticBakeRT?.height}`, scale: window.__renderScale() };
  });

  await heat(page);
  await page.waitForTimeout(600);
  const afterHeat = await page.evaluate(() => window.__ladder.state());
  checks.push(['sustained heat moves a pinned session nowhere',
    afterHeat.rung === 'high' && afterHeat.stepsDown === 0, JSON.stringify(afterHeat)]);

  // Leave to the menu (the boundary that used to land the silent step-down), then a new run.
  await page.evaluate(() => {
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:exit-to-menu', false);
  });
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  await startWorld(page, { mode: 'ascent', seed: 1338, settle: 1200 });
  await resolveOpening(page);
  await page.waitForTimeout(600);
  const secondRun = await page.evaluate(() => {
    const sc = window.__phaserGame.scene.getScene('ConquestScene');
    return { rt: `${sc.staticBakeRT?.width}x${sc.staticBakeRT?.height}`, scale: window.__renderScale() };
  });
  checks.push(['leave and start again: the new run is as sharp as the first',
    secondRun.scale === firstRun.scale && secondRun.rt === firstRun.rt,
    `first ${JSON.stringify(firstRun)} second ${JSON.stringify(secondRun)}`]);

  checks.push(['no console errors (explicit)', errors.length === 0, errors.slice(0, 3).join(' | ')]);
  await browser.close();
}

report(checks);
