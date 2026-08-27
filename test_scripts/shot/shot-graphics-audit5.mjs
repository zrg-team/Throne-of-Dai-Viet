// The range the art system already has but the default frame never shows: the two other themes,
// and the four seasons. Reference frames for the audit, not a regression check.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'output/graphics-audit';
mkdirSync(OUT, { recursive: true });
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';
const browser = await chromium.launch();

async function frame(label, theme, season) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript((t) => localStorage.setItem('mandate:map-theme:v1', t), theme);
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
    && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 40000 });
  if (season) {
    await page.evaluate(async (s) => {
      const m = await import('/src/ui/ink/season.ts');
      m.setRenderSeason(s); m.setFoliageSeason(s);
    }, season);
  }
  await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 40000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    scene.state = scene.state ?? window.__mandateState;
    scene.state.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
    scene.refresh?.();
    window.__phaserGame.scene.getScene('UIScene')?.scene.setVisible(false);
  });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  console.log('  ' + label);
  await page.close();
}

await frame('theme-dongho', 'dong-ho');
await frame('theme-inkwash', 'ink-wash');
await frame('theme-atlas', 'illustrated-atlas');
for (const s of ['Spring', 'Summer', 'Autumn', 'Winter']) {
  await frame(`season-${s.toLowerCase()}`, 'dong-ho', s);
}
await browser.close();
