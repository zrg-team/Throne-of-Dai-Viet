/**
 * How long each plate takes to draw, in the browser, with the screenshot left out of it.
 *
 * A render is five hundred frames; a plate that costs 1.4 s a frame instead of 0.3 s adds nine
 * minutes to it, and the only way to find which one does is to time them separately. Reports the
 * median of five draws per sample, because the first draw of anything warms a cache.
 *
 * Usage: node scripts/promo/profile.mjs [--origin http://127.0.0.1:5179]
 */
import { chromium } from 'playwright';
import { armAgainstReload, openStage } from './openStage.mjs';

const arg = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : fallback;
};

const ORIGIN = arg('--origin', 'http://127.0.0.1:5179');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await armAgainstReload(page);
if (!await openStage(page, ORIGIN, 1080, 1920)) {
  console.log('stage never became ready');
  await browser.close();
  process.exit(1);
}

const scenes = await page.evaluate(() => window.__promo.scenes);
const rows = [];
for (const scene of scenes) {
  for (const at of [0.25, 0.6, 0.9]) {
    const t = scene.from + (scene.to - scene.from) * at;
    const ms = await page.evaluate((when) => {
      const runs = [];
      for (let pass = 0; pass < 5; pass += 1) {
        const start = performance.now();
        window.__promo.render(when);
        runs.push(performance.now() - start);
      }
      runs.sort((a, b) => a - b);
      return runs[2];
    }, t);
    rows.push({ scene: scene.name, t: t.toFixed(1), ms: Math.round(ms) });
  }
}

const worst = Math.max(...rows.map((r) => r.ms));
for (const row of rows) {
  const bar = '#'.repeat(Math.round((row.ms / worst) * 40));
  console.log(`${row.scene.padEnd(7)} ${String(row.t).padStart(5)}s  ${String(row.ms).padStart(5)}ms  ${bar}`);
}
const total = rows.reduce((sum, r) => sum + r.ms, 0) / rows.length;
console.log(`\nmean ${Math.round(total)}ms/frame -> about ${(1000 / total).toFixed(1)} draws/s before the screenshot`);

await browser.close();
