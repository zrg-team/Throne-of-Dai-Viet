/**
 * The pacing gate: the loop obeys its fps limit, and the front page idles at 30.
 *
 * `fps: { limit: 60 }` exists so a 120 Hz flagship does not run the simulation twice as hot for
 * no visible gain, and the menu's 30-cap halves the battery cost of leaving the game open there.
 * Headless Chromium vsyncs at 60, so the observable contract is: ~60 steps/s uncapped or capped
 * at 60, ~30 with the menu's cap — measured by counting real STEP events over wall time.
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

// The menu idles under its 30 cap.
const menuSteps = await stepsIn(2000);
checks.push(['the front page paces at ~30', menuSteps >= 60 * 0.7 && menuSteps <= 60 * 1.35,
  `${menuSteps} steps / 2 s (want ~60)`]);

// A world runs at the full 60 (the cap is cleared on menu shutdown).
await startWorld(page, { mode: 'rival', seed: 1337 });
const worldSteps = await stepsIn(2000);
checks.push(['a world paces at ~60', worldSteps >= 120 * 0.7 && worldSteps <= 120 * 1.25,
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
