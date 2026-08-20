import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const log = [];
page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.type().toUpperCase() + ' ' + m.text().slice(0, 300)); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
await page.waitForTimeout(6000);
const state = await page.evaluate(() => ({
  hasState: !!window.__mandateState,
  active: window.__phaserGame.scene.scenes.filter((s) => s.scene.isActive()).map((s) => s.scene.key),
}));
console.log(JSON.stringify(state));
console.log(log.length ? log.slice(0, 10).join('\n') : 'clean');
await browser.close();
