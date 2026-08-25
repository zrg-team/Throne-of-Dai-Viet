/**
 * The pacing gate: vsync paces the loop by default, and only a true 30-fps rung engages
 * Phaser's limiter.
 *
 * Post-#102 regression, both halves pinned here: a `fps: { limit: 60 }` at the panel's own rate
 * beats against rAF jitter (skipped frames on 60 Hz, an outright halving on 120 Hz), and
 * `setFPSLimit` called from inside a game step re-arms the rAF loop before the running step
 * closure checks `isRunning` — the loop doubles permanently. So: no limiter by default, the menu
 * runs at panel rate, `force('low-30')` engages a real 30, and cap changes fired mid-step must
 * not raise the step rate above the panel's.
 *
 * Headless Chromium vsyncs at 60, so "panel rate" here is ~120 steps / 2 s.
 *
 * Usage: node test_scripts/verify/verify-fps-cap.mjs
 */
import { boot, startWorld, report } from '../perf/_boot.mjs';

const { browser, page, errors } = await boot({ dpr: 1, quality: 'low' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(600);

const stepsIn = (ms) => page.evaluate(async (dur) => {
  const game = window.__phaserGame;
  let steps = 0;
  const on = () => { steps += 1; };
  game.events.on('step', on);
  await new Promise((r) => setTimeout(r, dur));
  game.events.off('step', on);
  return steps;
}, ms);

const checks = [];

// No limiter engaged at boot; the menu runs at panel rate.
const limiterAtBoot = await page.evaluate(() => window.__phaserGame.loop.hasFpsLimit);
checks.push(['no fps limiter engaged by default', limiterAtBoot === false, `hasFpsLimit ${limiterAtBoot}`]);
const menuSteps = await stepsIn(2000);
checks.push(['the front page paces at panel rate', menuSteps >= 120 * 0.7 && menuSteps <= 120 * 1.35,
  `${menuSteps} steps / 2 s (want ~120)`]);

// A true 30 rung engages the limiter (the apply is deferred one macrotask — wait it out).
await page.evaluate(async () => { window.__ladder.force('low-30'); await new Promise((r) => setTimeout(r, 50)); });
const low30 = await page.evaluate(() => ({ limit: window.__phaserGame.loop.fpsLimit, has: window.__phaserGame.loop.hasFpsLimit }));
checks.push(['low-30 engages a real 30 limit', low30.has === true && low30.limit === 30, JSON.stringify(low30)]);
const cappedSteps = await stepsIn(2000);
checks.push(['low-30 paces at ~30', cappedSteps >= 60 * 0.7 && cappedSteps <= 60 * 1.35,
  `${cappedSteps} steps / 2 s (want ~60)`]);

// Leaving the 30 rung releases the limiter.
await page.evaluate(async () => { window.__ladder.force('low'); await new Promise((r) => setTimeout(r, 50)); });
const released = await page.evaluate(() => window.__phaserGame.loop.hasFpsLimit);
checks.push(['leaving low-30 releases the limiter', released === false, `hasFpsLimit ${released}`]);

// The leak pin: cap changes fired from INSIDE game steps (the way scene code fires them) must
// not double the rAF loop. Toggle across several consecutive steps, then measure.
await page.evaluate(() => new Promise((resolve) => {
  const game = window.__phaserGame;
  let n = 0;
  const on = () => {
    n += 1;
    if (n === 2) window.__ladder.setSceneCap(30);
    if (n === 4) window.__ladder.setSceneCap(undefined);
    if (n === 6) window.__ladder.force('low-30');
    if (n === 8) window.__ladder.force('low');
    if (n >= 10) { game.events.off('prestep', on); resolve(undefined); }
  };
  game.events.on('prestep', on);
}));
await page.waitForTimeout(120);
const afterToggles = await stepsIn(2000);
checks.push(['mid-step cap changes do not double the loop', afterToggles <= 120 * 1.35,
  `${afterToggles} steps / 2 s after in-step toggles (a leaked loop reads ~240)`]);

// A world also runs uncapped at panel rate.
await startWorld(page, { mode: 'rival', seed: 1337 });
const worldSteps = await stepsIn(2000);
checks.push(['a world paces at panel rate', worldSteps >= 120 * 0.7 && worldSteps <= 120 * 1.35,
  `${worldSteps} steps / 2 s (want ~120)`]);

// The probe hook reports the same story.
const probe = await page.evaluate(() => window.__fpsProbe(2));
checks.push(['__fpsProbe reports frames', probe.frames > 60, `frames ${probe.frames}, p50 ${probe.p50} ms`]);

// The ladder hook exists and is pinned under capture.
const ladder = await page.evaluate(() => window.__ladder?.state());
checks.push(['the ladder is installed and pinned under ?capture=1',
  ladder !== undefined && ladder.enabled === false, JSON.stringify(ladder)]);
checks.push(['the live render scale is readable', await page.evaluate(() => window.__renderScale?.()) >= 1, '']);

checks.push(['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')]);
await browser.close();
report(checks);
