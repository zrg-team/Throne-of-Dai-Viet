/**
 * The HUD's quiet-emit cost: what one `state-changed` with *no state change* rebuilds.
 *
 * Before the keyed chrome, every emit tore down and rebuilt ~20 standing objects with 8–17
 * fresh Text canvases (46 rasterisations per tick in empire mode) to draw the same pixels.
 * The gate here is the one that keeps that fixed: a quiet emit creates nothing and rasterises
 * at most a couple of labels, in every mode, at the tier phones actually run (DSF 3 / high).
 *
 * Usage: node test_scripts/perf/measure-ui.mjs [--mode rival|empire|ascent] [--dpr 3] [--quality high]
 *        --mode all (default) runs the three.
 */
import { boot, startWorld, arg, textCounters, census, throttle, report } from './_boot.mjs';

const MODES = arg('mode', 'all') === 'all' ? ['rival', 'empire', 'ascent'] : [arg('mode', 'rival')];
const checks = [];

for (const mode of MODES) {
  const { browser, page, cdp, errors } = await boot({});
  await startWorld(page, { mode });
  const counters = await textCounters(page);
  await throttle(cdp, 4);

  const uiKey = mode === 'ascent' ? 'ConquestUIScene' : 'UIScene';

  // Warm one emit (first pass after boot may legitimately build), then measure quiet ones.
  await page.evaluate((key) => {
    const ui = window.__phaserGame.scene.getScene(key);
    ui.events.emit('state-changed');
  }, uiKey);
  await counters.reset();
  const before = await census(page);

  const timing = await page.evaluate(async (key) => {
    const ui = window.__phaserGame.scene.getScene(key);
    const samples = [];
    for (let i = 0; i < 50; i += 1) {
      const t0 = performance.now();
      ui.events.emit('state-changed');
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    return { p50: +samples[25].toFixed(2), p95: +samples[47].toFixed(2) };
  }, uiKey);

  const after = await census(page);
  const text = await counters.read();
  const perEmit = { updates: text.updates / 50, created: text.created / 50 };

  checks.push([`${mode}: quiet emit rasterises ≤ 2 labels`, perEmit.updates <= 2,
    `${perEmit.updates.toFixed(2)} updateText/emit`]);
  checks.push([`${mode}: quiet emit creates no Text`, perEmit.created === 0,
    `${perEmit.created.toFixed(2)} created/emit`]);
  checks.push([`${mode}: display list flat across 50 quiet emits`, Math.abs(after.objects - before.objects) <= 2,
    `${before.objects} -> ${after.objects}`]);
  checks.push([`${mode}: quiet refresh p50 ≤ 4 ms at 4×`, timing.p50 <= 4,
    `p50 ${timing.p50} ms, p95 ${timing.p95} ms`]);
  checks.push([`${mode}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | ')]);

  console.log(`[${mode}] p50 ${timing.p50} ms  p95 ${timing.p95} ms  `
    + `updateText/emit ${perEmit.updates.toFixed(2)}  created/emit ${perEmit.created.toFixed(2)}  `
    + `objects ${before.objects} -> ${after.objects}`);
  await browser.close();
}

report(checks);
