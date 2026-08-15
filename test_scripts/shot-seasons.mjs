// The four seasons, plus a non-Đông Hồ theme to prove the opt-out is a no-op.
//
// The regression this guards is one the map has now failed in both directions: a picture that
// ignores `state.season` entirely (bare twigs in high summer), and a picture that states the season
// as a coloured rectangle over the whole sheet. So the four dong-ho shots must be **clearly
// different from each other** — the script reports the share of pixels that changed between
// consecutive seasons — while the atlas shots, which opt out, must be identical.
//
// `?capture=1` is required: the game only retains the WebGL drawing buffer when a screenshot tool
// asks for it (`game/config.ts`), and without it the canvas comes back empty.
//
// Run against `npm run dev`. Writes test_scripts/shots/season-*.png.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'test_scripts/shots';
mkdirSync(OUT, { recursive: true });

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const URL = 'http://127.0.0.1:5173/?capture=1';

const browser = await chromium.launch();

async function shoot(theme, label) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('mandate:map-theme:v1', t), theme);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
    && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.screenshot({ path: `${OUT}/season-${label}-menu.png` });

  await page.evaluate(() => window.__startBenchGame(1337));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
  await page.waitForTimeout(600);

  const shots = [];
  for (const season of SEASONS) {
    await page.evaluate((s) => {
      const scene = window.__phaserGame.scene.getScene('MapScene');
      // Hold the clock, or the economy tick advances the season out from under the capture.
      scene.state.isPaused = true;
      scene.state.season = s;
      scene.refresh();
    }, season);
    // Past the 1200 ms accent cross-fade, so the shot is the season and not the transition.
    await page.waitForTimeout(1500);
    const buffer = await page.screenshot({ path: `${OUT}/season-${label}-${season}.png` });
    shots.push(buffer.toString('base64'));
  }

  await page.close();
  return { errors, shots };
}

const dongHo = await shoot('dong-ho', 'dongho');
const atlas = await shoot('illustrated-atlas', 'atlas');

// The comparison runs in a blank page rather than in Node, so the script needs no PNG decoder and
// no dependency this repo does not already have.
const judge = await browser.newPage();
await judge.goto('about:blank');
const differenceRatio = async (a, b) => judge.evaluate(async ([left, right]) => {
  const pixels = async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height).data;
  };
  const [one, two] = [await pixels(left), await pixels(right)];
  if (one.length !== two.length) {
    return 1;
  }
  let changed = 0;
  for (let index = 0; index < one.length; index += 4) {
    if (
      Math.abs(one[index] - two[index]) > 6
      || Math.abs(one[index + 1] - two[index + 1]) > 6
      || Math.abs(one[index + 2] - two[index + 2]) > 6
    ) {
      changed += 1;
    }
  }
  return changed / (one.length / 4);
}, [a, b]);

console.log('dong-ho — every pair must differ; the season has to be visible without reading the HUD:');
let weakest = 1;
for (let index = 0; index < SEASONS.length; index += 1) {
  const next = (index + 1) % SEASONS.length;
  const ratio = await differenceRatio(dongHo.shots[index], dongHo.shots[next]);
  weakest = Math.min(weakest, ratio);
  console.log(`  ${SEASONS[index]} -> ${SEASONS[next]}: ${(ratio * 100).toFixed(1)}% of pixels changed`);
}
// The HUD's own season line is a few hundred pixels out of 329k, so anything under ~1.5% means the
// map itself did not move.
console.log(`  weakest turn ${(weakest * 100).toFixed(1)}% -> ${weakest >= 0.015 ? 'PASS' : 'FAIL - the map is not following the calendar'}`);

console.log('atlas — opted out, so the four must match apart from the HUD:');
for (let index = 0; index < SEASONS.length; index += 1) {
  const next = (index + 1) % SEASONS.length;
  const ratio = await differenceRatio(atlas.shots[index], atlas.shots[next]);
  console.log(`  ${SEASONS[index]} -> ${SEASONS[next]}: ${(ratio * 100).toFixed(2)}%`);
}

console.log(`dong-ho console errors: ${dongHo.errors.length}`);
dongHo.errors.slice(0, 5).forEach((e) => console.log('  ', e));
console.log(`atlas console errors:   ${atlas.errors.length}`);
atlas.errors.slice(0, 5).forEach((e) => console.log('  ', e));
console.log(`shots written to ${OUT}/`);

await browser.close();
