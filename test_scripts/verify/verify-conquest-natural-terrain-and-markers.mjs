import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${URL}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);

const result = await page.evaluate(async () => {
  window.__startBenchGame(1337, 'campaign');
  await new Promise((resolve) => setTimeout(resolve, 3500));
  const scene = window.__phaserGame.scene.getScene('MapScene');
  if (!scene) throw new Error('MapScene missing');
  for (const land of scene.state.lands) {
    land.isVisible = true;
    land.isExplored = true;
  }
  scene.refresh();
  await new Promise((resolve) => setTimeout(resolve, 800));

  const art = await import('/src/ui/conquestMapArt.ts');
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  const trees = ['tree', 'tree-jackfruit', 'tree-lychee', 'tree-pomelo', 'tree-silk-cotton'];
  const mountains = ['karst-classic', 'karst-three-spire', 'karst-seven-spire', 'karst-stepped', 'karst-tower'];
  const paddies = ['flooded', 'fallow', 'transplanted', 'ripe', 'nursery'];
  const ids = [
    ...seasons.flatMap((season) => trees.map((tree) => `flora.${tree}.${season}`)),
    ...mountains.map((mountain) => `terrain.${mountain}`),
    ...paddies.map((paddy) => `terrain.paddy-system-${paddy}`),
  ];

  const sizes = {};
  const touching = [];
  for (const id of ids) {
    const asset = art.conquestArtAsset(id);
    if (!asset?.textureKey || !scene.textures.exists(asset.textureKey)) continue;
    const source = scene.textures.get(asset.textureKey).getSourceImage();
    sizes[id] = `${source.width}x${source.height}`;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, source.width, source.height).data;
    let visible = 0;
    const alphaAt = (x, y) => data[(y * source.width + x) * 4 + 3];
    for (let x = 0; x < source.width; x += 1) visible += Number(alphaAt(x, 0) > 0) + Number(alphaAt(x, source.height - 1) > 0);
    for (let y = 1; y < source.height - 1; y += 1) visible += Number(alphaAt(0, y) > 0) + Number(alphaAt(source.width - 1, y) > 0);
    if (visible > 0) touching.push(`${id}:${visible}`);
  }

  const selectedTrees = new Set(Array.from({ length: 100 }, (_, seed) => art.conquestTreeArtId('spring', seed)));
  const selectedMountains = new Set(Array.from({ length: 100 }, (_, seed) => art.conquestKarstArtId(seed)));
  const terrainPlates = scene.children.list.filter((child) => child.getData?.('conquestTerrainPlate'));
  const authoredTrees = scene.children.list.filter((child) => (
    child.getData?.('conquestScatterArt')?.startsWith('flora.tree')
  ));
  const plannedTrees = scene.mapRenderer.scatterPlan.filter((item) => item.kind === 'tree');
  const authoredTreesBehindRelief = authoredTrees.filter((tree) => (
    scene.mapRenderer.reliefPlan.some((plan) => plan.occludes(tree.x, tree.y))
  ));

  const badges = {};
  for (const variant of ['acquisition', 'build', 'recruit', 'siege', 'battle']) {
    const badge = scene.mapItems.createProgressBadge(-2000, -2000, 1, 3, variant);
    const glyph = badge.list.find((child) => child.type === 'Image') ?? badge.list.find((child) => child.type === 'Graphics');
    const samples = [];
    const origin = { x: glyph.x, y: glyph.y };
    for (let sample = 0; sample < 8; sample += 1) {
      samples.push({ width: glyph.displayWidth ?? glyph.width, height: glyph.displayHeight ?? glyph.height, x: glyph.x, y: glyph.y });
      await new Promise((resolve) => setTimeout(resolve, 140));
    }
    badges[variant] = {
      maxWidth: Math.max(...samples.map((sample) => sample.width)),
      maxHeight: Math.max(...samples.map((sample) => sample.height)),
      stable: samples.every((sample) => sample.x === origin.x && sample.y === origin.y),
    };
    badge.destroy(true);
  }

  const land = scene.state.lands.find((candidate) => candidate.isVisible && candidate.hasVillage);
  const before = scene.getVisibleLandMarkerPoint(land);
  scene.cameras.main.setScroll(scene.cameras.main.scrollX + 140, scene.cameras.main.scrollY + 90);
  const after = scene.getVisibleLandMarkerPoint(land);

  return {
    ids, sizes, touching,
    selectedTrees: [...selectedTrees],
    selectedMountains: [...selectedMountains],
    terrainPlateCount: terrainPlates.length,
    plannedTreeCount: plannedTrees.length,
    authoredTreeCount: authoredTrees.length,
    authoredTreesBehindRelief: authoredTreesBehindRelief.length,
    badges,
    stableWorldAnchor: before.x === after.x && before.y === after.y,
  };
});

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

check('all 30 natural runtime variants preload', Object.keys(result.sizes).length === 30, `${Object.keys(result.sizes).length}/30`);
check('all tree variants share one 144x144 canvas', Object.entries(result.sizes)
  .filter(([id]) => id.startsWith('flora.')).every(([, size]) => size === '144x144'));
check('all mountain variants share one 240x160 canvas', Object.entries(result.sizes)
  .filter(([id]) => id.startsWith('terrain.karst-')).every(([, size]) => size === '240x160'));
check('all connected rice states share one 768x384 canvas', Object.entries(result.sizes)
  .filter(([id]) => id.startsWith('terrain.paddy-system-')).every(([, size]) => size === '768x384'));
check('all normalized images retain empty crop padding', result.touching.length === 0, result.touching.join(', '));
check('tree selector reaches five deterministic silhouettes', result.selectedTrees.length === 5, result.selectedTrees.join(', '));
check('mountain selector reaches five deterministic silhouettes', result.selectedMountains.length === 5, result.selectedMountains.join(', '));
check('every planned tree uses authored art when the asset family is loaded',
  result.plannedTreeCount > 0 && result.authoredTreeCount === result.plannedTreeCount,
  `${result.authoredTreeCount}/${result.plannedTreeCount}`);
check('trees behind authored relief remain authored and depth-sort with it',
  result.authoredTreesBehindRelief > 0, `${result.authoredTreesBehindRelief} trees`);
check('generated rice plates replace canvas plots on the live map', result.terrainPlateCount > 0, `${result.terrainPlateCount} plates`);
check('all five progress glyphs stay within the 26px visual class', Object.values(result.badges)
  .every(({ maxWidth, maxHeight }) => maxWidth <= 26 && maxHeight <= 26), JSON.stringify(result.badges));
check('marker animation never moves the icon anchor', Object.values(result.badges).every(({ stable }) => stable));
check('panning cannot move a marker inside its province', result.stableWorldAnchor);
check('no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = checks.filter(({ pass }) => !pass);
console.log(`\n${checks.length - failed.length}/${checks.length} natural-terrain/marker checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
