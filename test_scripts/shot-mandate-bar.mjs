import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5173/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(7, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });

// Mid-progress within the Rivalry era so the bar is partially filled.
await page.evaluate(async () => {
  const st = window.__mandateState;
  const m = await import('/src/systems/empire/MandateSystem.ts');
  m.addMandate(st, 60); // -> rivalry era, ~part way to empires (92)
  window.__phaserGame.scene.getScene('UIScene').refresh();
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'output/web-game/mandate-bar-hud.png', clip: { x: 0, y: 0, width: 390, height: 140 } });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
