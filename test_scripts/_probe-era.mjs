import { chromium } from 'playwright';
const BASE = 'http://localhost:5190';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
for (const mode of ['campaign', 'empire']) {
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate((m) => window.__startBenchGame(1337, m), mode);
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const s = window.__mandateState;
    return { hasMandate: !!s.mandate, era: s.mandate?.era ?? null, mode: s.gameMode };
  });
  console.log(mode, JSON.stringify(out));
}
await browser.close();
