import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.evaluate(async () => {
  const st = window.__mandateState;
  const m = await import('/src/systems/empire/MandateSystem.ts');
  m.addMandate(st, 130); // reach empires era -> more edict points + more projects unlocked
  const ui = window.__phaserGame.scene.getScene('UIScene');
  ui.modalScreen = 'edicts';
  ui.state.isPaused = true;
  ui.refresh();
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'output/web-game/empire-edicts-board.png' });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
