// Farmers, road travellers, buffalo and carts must travel as living sprites: face their actual step direction and
// visibly change authored foot/hoof/wheel frames instead of sliding or bobbing as rigid PNGs.
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
        && child.texture?.key?.startsWith('conquest-art:life.farmer-walk')) output.farmer.push(child);
      if (child.list) walk(child, output);
    }
  };
  const objects = {
    cart: [...scene.traffic.cartMarkers.values()].map((mover) => mover.object),
    traveler: [...scene.traffic.travelerMarkers.values()].flat().map((mover) => mover.object),
    buffalo: [],
    farmer: [],
  };
  walk({ list: scene.children.list }, objects);

  const visualOf = (object) => object.texture
    ? object
    : object.list?.find((child) => child.texture) ?? null;
  const textureOf = (object) => visualOf(object)?.texture?.key ?? null;
  const walkFramesOf = (object) => object.getData?.('walkFrameAnimation')
    ?? object.list?.find((child) => child.getData?.('walkFrameAnimation'))
      ?.getData('walkFrameAnimation')
    ?? null;
  const read = (object) => {
    const motion = object.getData?.('naturalTravelMotion');
    const walkFrames = walkFramesOf(object);
    const visual = visualOf(object);
    return {
      x: object.x,
      y: object.y,
      scaleSign: Math.sign(object.scaleX),
      native: object.getData?.('nativeFacing') ?? null,
      texture: textureOf(object),
      motionKind: motion?.kind ?? null,
      motionPlaying: motion?.moving ?? false,
      frameIndex: walkFrames?.index ?? null,
      frameTexture: walkFrames?.target?.texture?.key ?? null,
      wholeImageBob: motion?.bob ?? null,
      visualHeight: visual
        ? visual.displayHeight * (visual === object ? 1 : Math.abs(object.scaleY ?? 1))
        : null,
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
    let frameTransitions = 0;
    let activeGaitSamples = 0;
    let wholeImageBob = 0;
    let minVisualHeight = Number.POSITIVE_INFINITY;
    let maxVisualHeight = 0;
    const wrongExamples = [];
    const natives = new Set();
    const textures = new Set();
    const motionKinds = new Set();
    const frameIndices = new Set();
    const frameTextures = new Set();
    for (const [objectIndex, history] of histories[kind].entries()) {
      if (history.length === 0) continue;
      history.forEach((sample) => {
        if (sample.native !== null) natives.add(sample.native);
        if (sample.texture) textures.add(sample.texture);
        if (sample.motionKind) motionKinds.add(sample.motionKind);
        if (sample.motionPlaying) activeGaitSamples += 1;
        if (sample.frameIndex !== null) frameIndices.add(sample.frameIndex);
        if (sample.frameTexture) frameTextures.add(sample.frameTexture);
        if (Number.isFinite(sample.wholeImageBob)) wholeImageBob = Math.max(wholeImageBob, sample.wholeImageBob);
        if (Number.isFinite(sample.visualHeight)) {
          minVisualHeight = Math.min(minVisualHeight, sample.visualHeight);
          maxVisualHeight = Math.max(maxVisualHeight, sample.visualHeight);
        }
      });
      const travel = Math.hypot(
        history.at(-1).x - history[0].x,
        history.at(-1).y - history[0].y,
      );
      if (travel > 0.35) movedObjects += 1;
      const objectFrames = new Set(history.map((sample) => sample.frameIndex).filter(Number.isFinite));
      if (objectFrames.size > 1) gaitObjects += 1;
      for (let index = 1; index < history.length; index += 1) {
        const before = history[index - 1];
        const after = history[index];
        if (Number.isFinite(before.frameIndex) && Number.isFinite(after.frameIndex)
          && before.frameIndex !== after.frameIndex) frameTransitions += 1;
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
      frameTransitions,
      activeGaitSamples,
      wholeImageBob,
      minVisualHeight: Number.isFinite(minVisualHeight) ? minVisualHeight : null,
      maxVisualHeight,
      natives: [...natives],
      textures: [...textures],
      motionKinds: [...motionKinds],
      frameIndices: [...frameIndices].sort(),
      frameTextures: [...frameTextures],
      wrongExamples,
    };
  };

  return {
    cart: summarize('cart'),
    traveler: summarize('traveler'),
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
          && child.texture?.key?.startsWith('conquest-art:life.farmer-walk')) all.push(child);
        if (child.list) walk(child);
      }
    };
    if (requestedKind === 'cart') {
      all.push(...[...scene.traffic.cartMarkers.values()].map((mover) => mover.object));
    } else if (requestedKind === 'traveler') {
      all.push(...[...scene.traffic.travelerMarkers.values()].flat().map((mover) => mover.object));
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
    scene.tweens.pauseAll();
    window.__walkCaptureObject = chosen.object;
    return true;
  }, kind);
  if (!focused) return;
  const canvas = page.locator('canvas').first();
  for (let frame = 0; frame < 4; frame += 1) {
    await page.evaluate((frameIndex) => {
      const object = window.__walkCaptureObject;
      const state = object?.getData?.('walkFrameAnimation')
        ?? object?.list?.find((child) => child.getData?.('walkFrameAnimation'))
          ?.getData('walkFrameAnimation');
      if (!state) throw new Error('Focused mover has no walk-frame state');
      state.index = frameIndex;
      state.target.setFrame(frameIndex);
      state.target.setDisplayOrigin(
        state.sheet.anchorsX?.[frameIndex] ?? state.sheet.frameWidth / 2,
        state.sheet.baselines[frameIndex],
      );
    }, frame);
    await page.waitForTimeout(80);
    await canvas.screenshot({ path: `${OUT}/${kind}-frame-${frame}.png` });
  }
};

await focusAndCapture('cart');
await focusAndCapture('traveler');
await focusAndCapture('buffalo');
await focusAndCapture('farmer');
await browser.close();

let failures = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures += 1;
};

for (const [kind, expectedTexture, expectedMotion] of [
  ['cart', 'conquest-art:life.ox-cart-walk', 'cart'],
  ['traveler', 'conquest-art:life.traveler-walk', 'person'],
  ['buffalo', 'conquest-art:life.buffalo-walk', 'buffalo'],
  ['farmer', 'conquest-art:life.farmer-walk', 'person'],
]) {
  const result = audit[kind];
  // A map walker is drawn from the sheet's *reduced* cells, not its 627px authored ones: nine
  // world pixels out of a 627px cell is a 68:1 minification through a filter that takes four
  // texels, which smeared the figure over nearly twice its area and blended pose 0 into pose 1
  // across the 2x2 cell boundary. The reduced key is therefore part of the contract, not an
  // implementation detail — if a walker is ever seen drawing straight from the authored sheet
  // again, that fault is back.
  const drawnFrom = `${expectedTexture}:x64`;
  check(`${kind}: authored sprites are present`, result.count > 0 && result.textures.includes(drawnFrom),
    `${result.count} sprites / ${result.textures.join(', ')}`);
  check(`${kind}: authored art declares viewer-right facing`, result.natives.length === 1 && result.natives[0] === 1,
    `native ${result.natives.join(', ')}`);
  check(`${kind}: sprites move`, result.movedObjects > 0, `${result.movedObjects}/${result.count}`);
  check(`${kind}: every sampled step faces its travel direction`, result.directionSteps > 0
    && result.wrongDirectionSteps === 0, `${result.directionSteps - result.wrongDirectionSteps}/${result.directionSteps}`);
  const expectedBob = kind === 'traveler' ? 0 : null;
  check(`${kind}: four real ${expectedMotion} frames animate with the intended body motion`,
    result.motionKinds.includes(expectedMotion) && result.activeGaitSamples > 0
      && result.gaitObjects > 0 && result.frameIndices.length === 4
      && result.frameTransitions >= result.gaitObjects * (kind === 'cart' ? 6 : 1)
      && result.frameTextures.length === 1 && result.frameTextures[0] === drawnFrom
      && (expectedBob === null ? result.wholeImageBob > 0 : result.wholeImageBob === expectedBob),
    `${result.gaitObjects} animated; ${result.frameTransitions} sampled frame changes; frames ${result.frameIndices.join(',')}; bob ${result.wholeImageBob}`);
  if (kind === 'traveler') {
    check('traveler: between-land figure keeps the shared readable human scale',
      result.minVisualHeight >= 8 && result.maxVisualHeight <= 10,
      `${result.minVisualHeight.toFixed(1)}-${result.maxVisualHeight.toFixed(1)} world px`);
  }
}
check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));

writeFileSync(`${OUT}/audit.json`, `${JSON.stringify({ audit, errors }, null, 2)}\n`);
const totalChecks = 4 * 5 + 2;
console.log(`\n${totalChecks - failures}/${totalChecks} natural-mover checks passed`);
process.exit(failures === 0 ? 0 : 1);
