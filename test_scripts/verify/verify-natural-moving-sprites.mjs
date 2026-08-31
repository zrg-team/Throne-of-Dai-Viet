// Farmers, buffalo and carts must travel as living sprites: face their actual step direction and
// carry a small gait cycle instead of sliding as rigid PNGs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const OUT = 'output/web-game/natural-moving-sprites';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
// A desktop viewport leaves a useful map window below the HUD. The narrow mobile layout devotes
// nearly all of its height to controls, which can make a perfectly centred mover impossible to see.
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
await page.addInitScript(() => {
  localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
  localStorage.setItem('mandate:life:v1', JSON.stringify({ birds: false, traffic: 'busy', seasons: false }));
});

await page.goto(`${BASE}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  for (const land of scene.state.lands) {
    land.isVisible = true;
    land.isExplored = true;
  }
  scene.refresh();
});
await page.waitForTimeout(1400);

const audit = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  const walk = (node, output) => {
    for (const child of node.list ?? []) {
      if (child.getData?.('grazing')) output.buffalo.push(child);
      if (child.getData?.('conquestLivingPerson')
        && child.texture?.key === 'conquest-art:life.farmer') output.farmer.push(child);
      if (child.list) walk(child, output);
    }
  };
  const objects = {
    cart: [...scene.traffic.cartMarkers.values()].map((mover) => mover.object),
    buffalo: [],
    farmer: [],
  };
  walk({ list: scene.children.list }, objects);

  const textureOf = (object) => object.texture?.key
    ?? object.list?.find((child) => child.texture)?.texture?.key
    ?? null;
  const read = (object) => {
    const motion = object.getData?.('naturalTravelMotion');
    return {
      x: object.x,
      y: object.y,
      scaleSign: Math.sign(object.scaleX),
      native: object.getData?.('nativeFacing') ?? null,
      texture: textureOf(object),
      motionKind: motion?.kind ?? null,
      motionPlaying: motion?.tween?.isPlaying?.() ?? false,
      visual: motion ? motion.target[motion.visualProperty] : null,
      angle: motion?.target?.angle ?? null,
    };
  };

  const histories = Object.fromEntries(Object.entries(objects).map(([kind, list]) => (
    [kind, list.map(() => [])]
  )));
  for (let sample = 0; sample < 40; sample += 1) {
    for (const [kind, list] of Object.entries(objects)) {
      list.forEach((object, index) => histories[kind][index].push(read(object)));
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
  }

  const summarize = (kind) => {
    let directionSteps = 0;
    let wrongDirectionSteps = 0;
    let movedObjects = 0;
    let gaitObjects = 0;
    let activeGaitSamples = 0;
    let maxVisualTravel = 0;
    const wrongExamples = [];
    const natives = new Set();
    const textures = new Set();
    const motionKinds = new Set();
    for (const [objectIndex, history] of histories[kind].entries()) {
      if (history.length === 0) continue;
      history.forEach((sample) => {
        if (sample.native !== null) natives.add(sample.native);
        if (sample.texture) textures.add(sample.texture);
        if (sample.motionKind) motionKinds.add(sample.motionKind);
        if (sample.motionPlaying) activeGaitSamples += 1;
      });
      const travel = Math.hypot(
        history.at(-1).x - history[0].x,
        history.at(-1).y - history[0].y,
      );
      if (travel > 0.35) movedObjects += 1;
      const visuals = history.map((sample) => sample.visual).filter(Number.isFinite);
      const angles = history.map((sample) => sample.angle).filter(Number.isFinite);
      const visualTravel = Math.max(
        visuals.length ? Math.max(...visuals) - Math.min(...visuals) : 0,
        angles.length ? Math.max(...angles) - Math.min(...angles) : 0,
      );
      maxVisualTravel = Math.max(maxVisualTravel, visualTravel);
      if (visualTravel > 0.01) gaitObjects += 1;
      for (let index = 1; index < history.length; index += 1) {
        const before = history[index - 1];
        const after = history[index];
        const dx = after.x - before.x;
        // A sample that contains the exact turnaround has no single direction: it includes the end
        // of one leg and the start of the other. On every uninterrupted leg, facing must agree with
        // the measured x travel for the whole interval.
        if (Math.abs(dx) < 0.02 || after.native === null
          || !before.motionPlaying || !after.motionPlaying
          || before.scaleSign !== after.scaleSign) continue;
        directionSteps += 1;
        if (Math.sign(dx) * after.native !== after.scaleSign) {
          wrongDirectionSteps += 1;
          if (wrongExamples.length < 12) {
            wrongExamples.push({ objectIndex, dx, beforeX: before.x, afterX: after.x,
              beforeScale: before.scaleSign, afterScale: after.scaleSign });
          }
        }
      }
    }
    return {
      count: histories[kind].length,
      directionSteps,
      wrongDirectionSteps,
      movedObjects,
      gaitObjects,
      activeGaitSamples,
      maxVisualTravel,
      natives: [...natives],
      textures: [...textures],
      motionKinds: [...motionKinds],
      wrongExamples,
    };
  };

  return {
    cart: summarize('cart'),
    buffalo: summarize('buffalo'),
    farmer: summarize('farmer'),
  };
});

const focusAndCapture = async (kind) => {
  const focused = await page.evaluate((requestedKind) => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    const all = [];
    const walk = (node) => {
      for (const child of node.list ?? []) {
        if (requestedKind === 'buffalo' && child.getData?.('grazing')) all.push(child);
        if (requestedKind === 'farmer' && child.getData?.('conquestLivingPerson')
          && child.texture?.key === 'conquest-art:life.farmer') all.push(child);
        if (child.list) walk(child);
      }
    };
    if (requestedKind === 'cart') {
      all.push(...[...scene.traffic.cartMarkers.values()].map((mover) => mover.object));
    } else {
      walk({ list: scene.children.list });
    }
    const camera = scene.cameras.main;
    // MapScene intentionally does not use Phaser camera bounds, so `camera.getBounds()` is empty.
    // Its own world dimensions are the authority for choosing a centreable specimen.
    const centre = { x: scene.worldWidth / 2, y: scene.worldHeight / 2 };
    const candidates = all
      .filter((candidate) => candidate.active && candidate.visible)
      .map((object) => ({ object, point: object.getWorldTransformMatrix().transformPoint(0, 0) }))
      .sort((a, b) => {
        const da = (a.point.x - centre.x) ** 2 + (a.point.y - centre.y) ** 2;
        const db = (b.point.x - centre.x) ** 2 + (b.point.y - centre.y) ** 2;
        return da - db;
      });
    const chosen = candidates[0];
    if (!chosen) return null;
    const zoom = 3;
    const designWidth = 390;
    const designHeight = 630;
    scene.setMapZoom(zoom);
    camera.setScroll(
      Math.max(0, Math.min(scene.worldWidth - designWidth / zoom,
        chosen.point.x - designWidth / (2 * zoom))),
      Math.max(0, Math.min(scene.worldHeight - designHeight / zoom,
        chosen.point.y - designHeight / (2 * zoom))),
    );
    scene.scene.setVisible(false, 'UIScene');
    return true;
  }, kind);
  if (!focused) return;
  await page.waitForTimeout(240);
  const canvas = page.locator('canvas').first();
  await canvas.screenshot({ path: `${OUT}/${kind}-moving.png` });
};

await focusAndCapture('cart');
await focusAndCapture('buffalo');
await focusAndCapture('farmer');
await browser.close();

let failures = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures += 1;
};

for (const [kind, expectedTexture, expectedMotion] of [
  ['cart', 'conquest-art:life.ox-cart', 'cart'],
  ['buffalo', 'conquest-art:life.buffalo', 'buffalo'],
  ['farmer', 'conquest-art:life.farmer', 'person'],
]) {
  const result = audit[kind];
  check(`${kind}: authored sprites are present`, result.count > 0 && result.textures.includes(expectedTexture),
    `${result.count} sprites / ${result.textures.join(', ')}`);
  check(`${kind}: authored art declares viewer-right facing`, result.natives.length === 1 && result.natives[0] === 1,
    `native ${result.natives.join(', ')}`);
  check(`${kind}: sprites move`, result.movedObjects > 0, `${result.movedObjects}/${result.count}`);
  check(`${kind}: every sampled step faces its travel direction`, result.directionSteps > 0
    && result.wrongDirectionSteps === 0, `${result.directionSteps - result.wrongDirectionSteps}/${result.directionSteps}`);
  check(`${kind}: natural ${expectedMotion} gait is active while moving`, result.motionKinds.includes(expectedMotion)
    && result.activeGaitSamples > 0 && result.gaitObjects > 0,
  `${result.gaitObjects} animated; visual range ${result.maxVisualTravel.toFixed(3)}`);
}
check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));

writeFileSync(`${OUT}/audit.json`, `${JSON.stringify({ audit, errors }, null, 2)}\n`);
console.log(`\n${16 - failures}/16 natural-mover checks passed`);
process.exit(failures === 0 ? 0 : 1);
