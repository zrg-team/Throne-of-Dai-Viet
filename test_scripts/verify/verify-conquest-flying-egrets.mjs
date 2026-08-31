// The ambient egrets are sky sprites, not standing field props. This checks the authored alpha
// silhouettes as loaded by Phaser and then watches the real BirdRenderer move and flap them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/conquest-dongho-review/flying-egrets-runtime';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
await page.addInitScript(() => {
  localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
  localStorage.setItem('mandate:life:v1', JSON.stringify({ birds: true, traffic: 'normal', seasons: true }));
});

await page.goto(`${BASE}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);
await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);

const audit = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  const renderer = scene.birds;
  const skeins = renderer?.skeins ?? [];
  const poses = renderer?.poses;

  const analyseTexture = (textureKey) => {
    const source = scene.textures.get(textureKey).getSourceImage();
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    let visible = 0;
    let borderVisible = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if (alpha <= 8) continue;
        visible += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (x === 0 || y === 0 || x === canvas.width - 1 || y === canvas.height - 1) borderVisible += 1;
      }
    }
    const contentWidth = maxX - minX + 1;
    const contentHeight = maxY - minY + 1;
    return {
      textureKey,
      width: canvas.width,
      height: canvas.height,
      contentBounds: { minX, minY, maxX, maxY },
      contentAspect: contentWidth / Math.max(1, contentHeight),
      transparentRatio: 1 - visible / (canvas.width * canvas.height),
      borderVisible,
    };
  };

  const frames = [poses?.down?.texture, poses?.up?.texture].filter(Boolean).map(analyseTexture);
  const first = skeins[0];
  const samples = [];
  for (let index = 0; index < 12; index += 1) {
    samples.push({
      x: first?.container.x ?? 0,
      y: first?.container.y ?? 0,
      textures: first?.birds.map((bird) => bird.texture.key) ?? [],
      origins: first?.birds.map((bird) => ({ x: bird.originX, y: bird.originY })) ?? [],
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  // Hold one real skein in the camera for the visual review shot after the behavioral sampling.
  renderer?.setPaused(true);
  if (first) {
    const camera = scene.cameras.main;
    first.container
      .setPosition(camera.scrollX + camera.width / camera.zoom * 0.62, camera.scrollY + camera.height / camera.zoom * 0.24)
      .setAlpha(1)
      .setScale(1);
  }

  return {
    frameKeys: { down: poses?.down?.texture, up: poses?.up?.texture },
    frames,
    skeins: skeins.length,
    birds: skeins.reduce((sum, skein) => sum + skein.birds.length, 0),
    samples,
  };
});

await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/flying-egrets.png` });
await browser.close();

let failures = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures += 1;
};

const texturesSeen = new Set(audit.samples.flatMap((sample) => sample.textures));
const travelled = audit.samples.length > 1
  ? Math.hypot(
    audit.samples.at(-1).x - audit.samples[0].x,
    audit.samples.at(-1).y - audit.samples[0].y,
  )
  : 0;

check('both authored wing frames load', audit.frames.length === 2
  && audit.frameKeys.down === 'conquest-art:life.egret-down'
  && audit.frameKeys.up === 'conquest-art:life.egret-up', JSON.stringify(audit.frameKeys));
check('both frames share one animation canvas', audit.frames.every((frame) => frame.width === 256 && frame.height === 160));
check('both silhouettes are horizontal flying birds', audit.frames.every((frame) => frame.contentAspect >= 1.45),
  audit.frames.map((frame) => frame.contentAspect.toFixed(2)).join(', '));
check('the sprites have real transparent padding', audit.frames.every((frame) => (
  frame.transparentRatio >= 0.8 && frame.borderVisible === 0
)), audit.frames.map((frame) => `${frame.transparentRatio.toFixed(3)}/${frame.borderVisible}`).join(', '));
check('the sky contains three moving skeins', audit.skeins === 3 && audit.birds >= 6,
  `${audit.skeins} skeins / ${audit.birds} birds`);
check('the wingbeat swaps between the two authored frames', texturesSeen.has(audit.frameKeys.down)
  && texturesSeen.has(audit.frameKeys.up), [...texturesSeen].join(', '));
check('the flight keeps a centred airborne anchor', audit.samples.flatMap((sample) => sample.origins)
  .every((origin) => Math.abs(origin.x - 0.5) < 1e-6 && Math.abs(origin.y - 0.5) < 1e-6));
check('the sampled skein is flying across the map', travelled > 2, `${travelled.toFixed(2)} world units`);
check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));

writeFileSync(`${OUT}/audit.json`, `${JSON.stringify({ ...audit, travelled, errors }, null, 2)}\n`);
console.log(`\n${9 - failures}/9 flying-egret checks passed`);
process.exit(failures === 0 ? 0 : 1);
