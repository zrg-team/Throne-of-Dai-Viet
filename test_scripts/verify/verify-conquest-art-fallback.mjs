/**
 * Proves generated conquest art is optional at runtime. Test settlement and map families
 * separately with both missing and corrupt responses, including all new walking sheets.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/conquest-dongho-review/fallback-audit.json';
const cases = [
  { name: 'missing', response: { status: 404, contentType: 'image/png', body: '' } },
  { name: 'corrupt', response: { status: 200, contentType: 'image/png', body: 'not-a-png' } },
].flatMap(testCase => ['settlement', 'map'].map(family => ({ ...testCase, family })));

const browser = await chromium.launch();
const results = [];

for (const testCase of cases) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const pageErrors = [];
  let intercepted = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const pattern = testCase.family === 'settlement'
    ? /\/art\/conquest-dongho(?:-v\d+)?\/settlement\/[^/]+\.png/
    : /\/art\/conquest-dongho(?:-v\d+)?\/(?:flora|terrain|life|marker)\/.*\.png/;
  await page.route(pattern, async (route) => {
    intercepted += 1;
    await route.fulfill(testCase.response);
  });

  let active = false;
  let lands = 0;
  let blockedTexturePresent = true;
  let distinctSamples = 0;
  let proceduralScatter = 0;
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
    ({ active, lands, blockedTexturePresent, proceduralScatter } = await page.evaluate((family) => {
      const scene = window.__phaserGame.scene.getScene('MapScene');
      return {
        active: scene.scene.isActive(),
        lands: scene.state?.lands?.length ?? 0,
        blockedTexturePresent: family === 'settlement'
          ? scene.textures.exists('conquest-art:settlement.hamlet')
          : scene.textures.getTextureKeys().some(key => /^conquest-art:(flora|terrain|life|marker)\./.test(key)),
        proceduralScatter: scene.mapRenderer.scatterPlan?.length ?? 0,
      };
    }, testCase.family));
    mkdirSync('output/conquest-dongho-review', { recursive: true });
    await page.screenshot({ path: `output/conquest-dongho-review/fallback-${testCase.family}-${testCase.name}.png` });
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 844 } });
    const distinct = new Set();
    for (let i = 0; i < shot.length - 3; i += 997) distinct.add(shot.readUInt32BE(i));
    distinctSamples = distinct.size;
  } catch (error) {
    pageErrors.push(error.message.split('\n')[0]);
  }

  const passed = intercepted >= (testCase.family === 'settlement' ? 11 : 91)
    && active
    && lands > 0
    && !blockedTexturePresent
    && (testCase.family === 'settlement' || proceduralScatter > 0)
    && distinctSamples > 24
    && pageErrors.length === 0;
  const result = {
    case: testCase.name,
    family: testCase.family,
    proceduralScatter,
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
    `${passed ? 'ok  ' : 'FAIL'} ${testCase.name} ${testCase.family} plates use procedural fallback`
    + ` — intercepted=${intercepted} lands=${lands} samples=${distinctSamples}`,
  );
  await context.close();
}

await browser.close();
mkdirSync('output/conquest-dongho-review', { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);

const failed = results.filter((result) => !result.passed);
console.log(failed.length === 0
  ? `PASS: missing and corrupt settlements and map art fall back (${OUT})`
  : `FAIL: ${failed.map((result) => result.case).join(', ')}`);
process.exit(failed.length === 0 ? 0 : 1);
