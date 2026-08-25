import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('output/web-game', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });

// Push a spread of notifications through the unified funnel.
const funnel = await page.evaluate(async () => {
  const st = window.__mandateState;
  const n = await import('/src/systems/empire/notifications.ts');
  n.pushToast(st, 'The Northern Warlords muster a great host against your borders.', 'threat');
  n.pushToast(st, 'Directive complete: Raise three Wonders (+40 Mandate).', 'reward');
  n.pushToast(st, 'A new era dawns upon the realm.', 'milestone');
  n.pushToast(st, 'Envoys report shifting winds in the eastern courts.', 'info');
  const ui = window.__phaserGame.scene.getScene('UIScene');
  ui.refresh();
  return {
    logLen: st.eventLog?.length ?? -1,
    toastLen: st.toasts?.length ?? -1,
    unread: (st.eventLog ?? []).filter(e => !e.read).length,
  };
});
console.log('after push:', JSON.stringify(funnel));

await page.waitForTimeout(300);
await page.screenshot({ path: 'output/web-game/notif-bell-badge.png' });

// Open the Chronicle log (should pause and mark read).
const opened = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('UIScene');
  ui.openModal('event-log');
  const st = window.__mandateState;
  return { paused: st.isPaused, screen: ui.modalScreen, unreadAfterOpen: (st.eventLog ?? []).filter(e => !e.read).length };
});
console.log('after open:', JSON.stringify(opened));

await page.waitForTimeout(400);
await page.screenshot({ path: 'output/web-game/notif-log-open.png' });

// Close and confirm badge cleared + unpaused.
const closed = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('UIScene');
  ui.closeModal();
  const st = window.__mandateState;
  return { paused: st.isPaused, screen: ui.modalScreen, unread: (st.eventLog ?? []).filter(e => !e.read).length };
});
console.log('after close:', JSON.stringify(closed));

await page.waitForTimeout(200);
await page.screenshot({ path: 'output/web-game/notif-bell-cleared.png' });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
