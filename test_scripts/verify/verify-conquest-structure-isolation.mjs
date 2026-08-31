import fs from 'node:fs';
import { chromium } from 'playwright';

const decisions = JSON.parse(fs.readFileSync('output/conquest-dongho-review/decisions.json', 'utf8'));
const runtime = JSON.parse(fs.readFileSync('public/art/conquest-dongho/manifest.json', 'utf8'));
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const architecture = decisions.filter(({ family }) => family === 'settlements' || family === 'buildings');
const acceptedArchitecture = architecture.filter(({ accepted }) => accepted);
check(
  'every accepted architecture sprite declares structure-only transparent content',
  acceptedArchitecture.length === 39 && acceptedArchitecture.every((entry) => (
    entry.contentPolicy === 'structure-only-transparent'
      && entry.bakedPeople === false
      && entry.bakedTerrain === false
  )),
  `${acceptedArchitecture.length}/39`,
);
check(
  'no generated mine-worker remains in the building family',
  !fs.existsSync('public/art/conquest-dongho/building/mine-worker.png')
    && decisions.find(({ id }) => id === 'building.mine-worker')?.accepted === false,
);
const runtimeArchitecture = runtime.assets.filter(({ family }) => family === 'settlements' || family === 'buildings');
check(
  'runtime architecture keeps the isolation and camera contract',
  runtimeArchitecture.length === 39 && runtimeArchitecture.every((entry) => (
    entry.contentPolicy === 'structure-only-transparent'
      && entry.bakedPeople === false
      && entry.bakedTerrain === false
      && entry.projection === 'front-orthographic-30'
      && entry.cameraView === 'front-centered-elevation-30'
  )),
  `${runtimeArchitecture.length}/39`,
);

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
// Starting from the main-module hook is too early: PreloadScene may still be fetching the optional
// authored textures, which deliberately makes the map choose its procedural fallbacks. Wait for the
// menu instead, exactly as a player must, so this test exercises the accepted structure sprites.
await page.waitForFunction(() => (
  typeof window.__startBenchGame === 'function'
    && window.__phaserGame?.scene.isActive('MenuScene')
), null, { timeout: 30000 });
const activity = await page.evaluate(async () => {
  const module = await import('/src/scenes/map/SettlementRenderer.ts');
  window.__startBenchGame(1337, 'campaign');
  await new Promise((resolve) => setTimeout(resolve, 4200));
  const scene = window.__phaserGame.scene.scenes.find((candidate) => (
    candidate.scene.key === 'MapScene' && candidate.scene.isActive()
  ));
  if (!scene) throw new Error('Map scene not found');
  const find = () => {
    const out = [];
    const visit = (node) => {
      if (node?.getData?.('settlementWandering')) out.push(node);
      for (const child of node?.list ?? []) visit(child);
    };
    for (const child of scene.children.list) visit(child);
    return out;
  };
  const people = find();
  const nodePeople = [];
  for (const node of scene.landNodes?.values?.() ?? []) {
    const visitNode = (child) => {
      if (child?.getData?.('settlementWandering')) nodePeople.push(child);
      for (const nested of child?.list ?? []) visitNode(nested);
    };
    visitNode(node);
  }
  const all = [];
  const collect = (node) => {
    if (node?.type === 'Image') all.push(node);
    for (const child of node?.list ?? []) collect(child);
  };
  for (const child of scene.children.list) collect(child);
  const before = people.map((person) => ({ x: person.x, y: person.y }));
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const moved = people.filter((person, index) => (
    Math.hypot(person.x - before[index].x, person.y - before[index].y) > 0.15
  )).length;
  const bounded = people.every((person) => {
    const home = person.getData('settlementWandering');
    return Math.abs(person.x - home.homeX) <= home.radius + 0.5
      && Math.abs(person.y - home.homeY) <= home.radius * 0.42 + 0.5;
  });
  return {
    people: people.length,
    moved,
    bounded,
    bakedPeople: people.filter((person) => person.getData('conquestSettlementArt') === true).length,
    sceneKey: scene.scene.key,
    images: all.length,
    livingFlags: all.filter((image) => image.getData?.('conquestLivingPerson') === true).length,
    settlementInk: all.filter((image) => image.getData?.('conquestSettlementArt') === true).length,
    methodPresent: typeof module.SettlementRenderer.prototype.addLivingPeople === 'function',
    authoredTexturePresent: scene.textures.exists('conquest-art:settlement.hamlet'),
    travelerTexturePresent: scene.textures.exists('conquest-art:life.traveler'),
    farmerTexturePresent: scene.textures.exists('conquest-art:life.farmer'),
    rendererMethodPresent: typeof scene.settlements?.addLivingPeople === 'function',
    landNodes: scene.landNodes?.size ?? -1,
    nodePeople: nodePeople.length,
    visibleLands: [...(scene.landNodes?.keys?.() ?? [])].map((id) => {
      const land = scene.state.lands.find((candidate) => candidate.id === id);
      return `${land?.type}:${land?.hasVillage}`;
    }),
  };
});
await browser.close();

check('settlement people are independent live sprites', activity.people > 0 && activity.bakedPeople === 0,
  `${activity.people} live / ${activity.bakedPeople} baked; scene=${activity.sceneKey}, images=${activity.images}, livingFlags=${activity.livingFlags}, settlementInk=${activity.settlementInk}, method=${activity.methodPresent}/${activity.rendererMethodPresent}, texture=${activity.authoredTexturePresent}/${activity.travelerTexturePresent}/${activity.farmerTexturePresent}, landNodes=${activity.landNodes}, nodePeople=${activity.nodePeople}, visible=${activity.visibleLands.join(',')}`);
check('settlement people visibly walk', activity.moved >= Math.max(1, Math.floor(activity.people * 0.35)),
  `${activity.moved}/${activity.people} moved in 1.8s`);
check('settlement walkers remain inside their home compounds', activity.bounded);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter(({ pass }) => !pass);
console.log(`\n${checks.length - failed.length}/${checks.length} structure-isolation checks passed`);
process.exit(failed.length ? 1 : 0);
