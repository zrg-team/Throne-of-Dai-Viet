/**
 * Long-run memory-stability check. Advances many realtime ticks (each forces a full
 * refresh -> drawArmies) and samples JS heap + active tween count. Before the Phase 2
 * fix, drawArmies re-added an infinite formation-bob tween every refresh without
 * killing the old one, so tween count (and heap) climbed without bound. After the fix
 * both should stay flat.
 */
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(400);

const samples = await page.evaluate(async () => {
  const game = window.__phaserGame;
  const map = game.scene.getScene('MapScene');
  const tweenCount = () => map.tweens.getTweens().length;
  const heap = () => { if (window.gc) try { window.gc(); } catch (_) {} return performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : 0; };
  const out = [];
  for (let block = 0; block < 6; block += 1) {
    for (let i = 0; i < 50; i += 1) game.step(performance.now(), 6000);
    out.push({ tick: (block + 1) * 50, tweens: tweenCount(), heapMB: heap() });
  }
  return out;
});

console.log('tick   activeTweens   heapMB');
for (const s of samples) console.log(`${String(s.tick).padStart(4)}   ${String(s.tweens).padStart(11)}   ${s.heapMB}`);
const first = samples[0], last = samples[samples.length - 1];
console.log(`\ntweens ${first.tweens} -> ${last.tweens}   heap ${first.heapMB} -> ${last.heapMB} MB`);
await browser.close();
