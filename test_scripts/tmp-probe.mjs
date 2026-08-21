import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://127.0.0.1:5199/?capture=1', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof window.__startBenchGame === 'function');
await p.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => {
  const s = window.__phaserGame.scene.getScene('ConquestUIScene');
  return { hasState: !!s.state, prompt: s.state?.pendingAscentPrompt?.kind ?? 'none' };
}));
await b.close();
