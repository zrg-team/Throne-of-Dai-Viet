/**
 * The game clock survives slow frames.
 *
 * Two contracts, both broken before the pacing pass:
 *  - `fps.min: 2` keeps the loop's delta clamp at 500 ms, so a 400 ms map rebuild reaches the
 *    realtime clock as 400 ms instead of being silently cut to the default 20-fps floor;
 *  - the tick accumulators carry their remainder (capped at one tick) instead of zeroing, so
 *    the month clock does not drift behind wall time by up to a tick per slow frame.
 *
 * Driven with `game.step` at fixed synthetic deltas, so the numbers are exact.
 *
 * Usage: node test_scripts/verify/verify-tick-clock.mjs
 */
import { boot, startWorld, report } from '../perf/_boot.mjs';

const { browser, page, errors } = await boot({ dpr: 1, quality: 'low' });
await startWorld(page, { mode: 'rival', seed: 1337 });

const out = await page.evaluate(() => {
  const game = window.__phaserGame;
  const scene = game.scene.getScene('MapScene');
  game.loop.sleep(); // the harness owns the clock now

  // 10 x 400 ms steps: all 4 s must reach the realtime clock (min:2 -> clamp floor 500 ms).
  const secondsBefore = scene.state.realtimeSeconds;
  let clock = performance.now();
  for (let i = 0; i < 10; i += 1) { clock += 400; game.step(clock, 400); }
  const seconds = scene.state.realtimeSeconds - secondsBefore;

  // Remainder carry: drive the accumulator to one tick + 100 ms; after the drain it must hold
  // exactly 100, not zero. REALTIME_TICK_MS is read off the accumulator's own behaviour.
  scene.realtimeAccumulator = 0;
  let drains = 0;
  const tickMs = (() => {
    // Find the tick length: step 100 ms at a time until the accumulator resets.
    let last = 0;
    for (let i = 0; i < 400; i += 1) {
      clock += 100; game.step(clock, 100);
      if (scene.realtimeAccumulator < last) { drains += 1; return (i + 1) * 100 - scene.realtimeAccumulator; }
      last = scene.realtimeAccumulator;
    }
    return -1;
  })();
  scene.realtimeAccumulator = 0;
  clock += 0;
  const target = tickMs + 100;
  let stepped = 0;
  while (stepped + 400 <= target) { clock += 400; game.step(clock, 400); stepped += 400; }
  clock += target - stepped; game.step(clock, target - stepped);
  const carried = scene.realtimeAccumulator;

  game.loop.wake();
  return { seconds: +seconds.toFixed(2), tickMs, drains, carried: +carried.toFixed(1) };
});

const checks = [
  ['10 x 400 ms all reach the clock', Math.abs(out.seconds - 4.0) < 0.05, `+${out.seconds}s (want +4.00)`],
  ['the accumulator drains at its tick', out.tickMs > 0, `tick ~${out.tickMs} ms`],
  ['the remainder is carried, not dropped', Math.abs(out.carried - 100) < 1, `carried ${out.carried} ms (want 100)`],
  ['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')],
];
await browser.close();
report(checks);
