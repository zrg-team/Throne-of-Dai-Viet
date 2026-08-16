import { chromium } from 'playwright';

const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 3 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 25000 });
} catch {
  console.log('MENU DID NOT BOOT');
  errs.slice(0, 3).forEach((e) => console.log('  ', e));
  await browser.close();
  process.exit(2);
}
await page.waitForTimeout(1600);
const c = await page.evaluate(() => {
  const r = window.__phaserGame.canvas.getBoundingClientRect();
  return { l: r.left, w: r.width };
});
await page.screenshot({ path: out, clip: { x: c.l, y: 110, width: c.w, height: 240 } });
console.log('ok, console errors:', errs.length);
await browser.close();
