// The four seasons, side by side, plus a non-Đông Hồ theme to prove the opt-out is a no-op.
// Run against `npm run dev`. Writes test_scripts/shots/season-*.png.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'test_scripts/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shoot(theme, label) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('mandate:map-theme:v1', t), theme);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
    && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.screenshot({ path: `${OUT}/season-${label}-menu.png` });

  await page.evaluate(() => window.__startBenchGame(1337));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
  await page.waitForTimeout(600);

  for (const season of ['Spring', 'Summer', 'Autumn', 'Winter']) {
    await page.evaluate((s) => {
      const scene = window.__phaserGame.scene.getScene('MapScene');
      // Hold the clock, or the economy tick advances the season out from under the capture —
      // which is exactly how the first run of this script photographed Spring and labelled it Winter.
      scene.state.isPaused = true;
      scene.state.season = s;
      scene.refresh();
    }, season);
    // Long enough for the 1200ms cross-fade to settle.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/season-${label}-${season}.png` });
  }

  await page.close();
  return errors;
}

const dongHo = await shoot('dong-ho', 'dongho');
const atlas = await shoot('illustrated-atlas', 'atlas');

console.log(`dong-ho console errors: ${dongHo.length}`);
dongHo.slice(0, 5).forEach((e) => console.log('  ', e));
console.log(`atlas console errors:   ${atlas.length}`);
atlas.slice(0, 5).forEach((e) => console.log('  ', e));
console.log(`shots written to ${OUT}/`);

await browser.close();
