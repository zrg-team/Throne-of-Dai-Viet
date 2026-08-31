/**
 * Proves generated conquest art is optional at runtime. Settlement plates are useful targets
 * because a fixed-seed campaign always draws several of them, and their old cluster renderer is
 * still available at the exact same call site.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/conquest-dongho-review/fallback-audit.json';
const cases = [
  { name: 'missing', response: { status: 404, contentType: 'image/png', body: '' } },
  { name: 'corrupt', response: { status: 200, contentType: 'image/png', body: 'not-a-png' } },
];

const browser = await chromium.launch();
const results = [];

for (const testCase of cases) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const pageErrors = [];
  let intercepted = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/art/conquest-dongho/settlement/*.png', async (route) => {
    intercepted += 1;
    await route.fulfill(testCase.response);
  });

  let active = false;
  let lands = 0;
  let blockedTexturePresent = true;
  let distinctSamples = 0;
  try {
    await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(
      () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
      null,
      { timeout: 30000 },
    );
    await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MapScene'), null, { timeout: 30000 });
    await page.waitForTimeout(1800);
    ({ active, lands, blockedTexturePresent } = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('MapScene');
      return {
        active: scene.scene.isActive(),
        lands: scene.state?.lands?.length ?? 0,
        blockedTexturePresent: scene.textures.exists('conquest-art:settlement.hamlet'),
      };
    }));
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 844 } });
    const distinct = new Set();
    for (let i = 0; i < shot.length - 3; i += 997) distinct.add(shot.readUInt32BE(i));
    distinctSamples = distinct.size;
  } catch (error) {
    pageErrors.push(error.message.split('\n')[0]);
  }

  const passed = intercepted >= 11
    && active
    && lands > 0
    && !blockedTexturePresent
    && distinctSamples > 24
    && pageErrors.length === 0;
  const result = {
    case: testCase.name,
    passed,
    intercepted,
    active,
    lands,
    blockedTexturePresent,
    distinctSamples,
    pageErrors,
  };
  results.push(result);
  console.log(
    `${passed ? 'ok  ' : 'FAIL'} ${testCase.name} settlement plates use procedural fallback`
    + ` — intercepted=${intercepted} lands=${lands} samples=${distinctSamples}`,
  );
  await context.close();
}

await browser.close();
mkdirSync('output/conquest-dongho-review', { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);

const failed = results.filter((result) => !result.passed);
console.log(failed.length === 0
  ? `PASS: missing and corrupt art both fall back (${OUT})`
  : `FAIL: ${failed.map((result) => result.case).join(', ')}`);
process.exit(failed.length === 0 ? 0 : 1);
