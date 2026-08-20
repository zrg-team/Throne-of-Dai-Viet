// The front page and the History page it leads to, in both languages and at the shortest sheet
// the design surface allows. Pairs with verify-history.mjs, which asserts; this one is for looking.
import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://localhost:5173';
const browser = await chromium.launch();
for (const [lang, h] of [['vi', 844], ['vi', 620], ['en', 844]]) {
  const page = await browser.newPage({ viewport: { width: 390, height: h }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `test_scripts/shots/menu-${lang}-${h}.png` });

  // Reach the History page by clicking the real button, not by starting the scene.
  const at = await page.evaluate(() => {
    const s = window.__phaserGame.scene.getScene('MenuScene');
    for (const c of s.children.list) {
      const label = c.list?.find?.((k) => k.type === 'Text');
      if (label && /Sử thật|Real History/.test(label.text)) {
        const m = c.getWorldTransformMatrix();
        return { x: m.tx + 141, y: m.ty + 16 };
      }
    }
    return null;
  });
  if (!at) { console.log(`FAIL ${lang} h=${h}: no History button on the menu`); await page.close(); continue; }
  // Design units are CSS pixels here: RENDER_SCALE inflates gameSize and the camera zoom takes it
  // straight back out, so a world coordinate is already where the finger goes.
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('HistoryScene'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  const active = await page.evaluate(() => window.__phaserGame.scene.isActive('HistoryScene'));
  await page.screenshot({ path: `test_scripts/shots/history-${lang}-${h}.png` });
  console.log(`${active && !errors.length ? 'PASS' : 'FAIL'} ${lang} h=${h} active=${active} errors=${errors.slice(0,2).join(' | ')}`);
  await page.close();
}
await browser.close();
