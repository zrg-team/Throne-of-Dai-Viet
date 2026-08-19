// Every player-flag style on one sheet, so a new one can be looked at rather than asserted.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

const styles = await page.evaluate(async () => {
  const { PLAYER_FLAG_STYLES, createPlayerLandFlag } = await import('/src/ui/playerFlag.ts');
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  // A clean sheet: everything the menu drew is hidden so only the flags are in the frame.
  scene.children.list.forEach((o) => o.setVisible?.(false));
  const bg = scene.add.rectangle(0, 0, 2000, 900, 0xefe7d2).setOrigin(0, 0).setDepth(900);
  void bg;
  // Laid out inside the game's own canvas, not the browser viewport: Phaser letterboxes to the
  // device aspect, so anything placed past `scale.width` is simply off the sheet.
  const W = scene.scale.width;
  PLAYER_FLAG_STYLES.forEach((style, i) => {
    const row = i;
    const y = 70 + row * 128;
    for (const [j, muted] of [[0, false], [1, true]]) {
      const flag = createPlayerLandFlag(scene, false, i, muted);
      flag.setPosition(W * 0.28 + j * W * 0.34, y + 62).setScale(2.1).setDepth(1000);
    }
    scene.add.text(8, y + 40, style, { fontSize: '11px', color: '#2a2118' }).setDepth(1001);
  });
  return PLAYER_FLAG_STYLES;
});
await page.waitForTimeout(600);
mkdirSync('output/web-game', { recursive: true });
await page.screenshot({ path: 'output/web-game/flags.png' });
await browser.close();
console.log('styles:', styles.join(', '));
console.log('errors:', errors.length ? errors.slice(0, 2).join(' ; ') : 'none');
