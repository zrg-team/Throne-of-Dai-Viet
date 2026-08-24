// Opens the Directives/Mandate board in empire mode and screenshots it.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179'}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });

// Give the player some progress so the board has interesting values + a few toasts.
await page.evaluate(async () => {
  const st = window.__mandateState;
  const mod = await import('/src/systems/RealtimeSystem.ts');
  for (let i = 0; i < 8; i += 1) mod.advanceRealtimeMonth(st);
  // Force UIScene to redraw from the mutated state.
  window.__phaserGame.scene.getScene('UIScene').events.emit('ui:refresh');
});
await page.waitForTimeout(300);

// Click the "Agenda" action button (empire bar: margin 6, width 50, gap 2, index 5).
await page.mouse.click(6 + 5 * 52 + 25, 844 - 25);
await page.waitForTimeout(400);

const opened = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('UIScene');
  return ui.modalScreen ?? 'unknown';
});
await page.screenshot({ path: 'output/web-game/empire-directives-board.png' });
console.log('modalScreen:', opened);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
