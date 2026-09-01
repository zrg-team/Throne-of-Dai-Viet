// Measures the authored PNGs after their actual stamp boxes and instance scales are applied.
// Unlike the procedural proportion probe, this catches a tightly cropped generated sprite that
// fills a generous design box and therefore appears too large even though its caller scale is sane.
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);

const measured = await page.evaluate(async () => {
  window.__startBenchGame(1337, 'campaign');
  await new Promise((resolve) => setTimeout(resolve, 4000));

  const scene = window.__phaserGame.scene.scenes.find((candidate) => candidate.mapItems);
  if (!scene) throw new Error('Map scene renderer was not found');

  const [{ CONQUEST_MAP_ART, conquestArtStamp }, { placeStamp }, { GROUND_SCALE },
    { figureStamp }, { bakedBuffalo }] = await Promise.all([
    import('/src/ui/conquestMapArt.ts'),
    import('/src/ui/ink/stamp.ts'),
    import('/src/ui/ink/proportion.ts'),
    import('/src/ui/ink/figureStamps.ts'),
    import('/src/ui/ink/sprites.ts'),
  ]);

  const measureStamp = (name, stamp, instanceScale = 1) => {
    if (!stamp) throw new Error(`Authored stamp missing: ${name}`);
    const image = placeStamp(scene, stamp, -10000, -10000, instanceScale);
    const result = {
      width: image.displayWidth,
      height: image.displayHeight,
      ratio: image.displayWidth / image.displayHeight,
    };
    image.destroy();
    return result;
  };
  const authored = (name, id, box, instanceScale = 1) => measureStamp(
    name,
    conquestArtStamp(scene, id, box),
    instanceScale,
  );

  const worldBox = { left: -58, right: 58, top: -58, bottom: 18 };
  const paddyBox = { left: -30, right: 30, top: -17, bottom: 17 };
  const values = {
    farmer: authored('farmer', 'life.farmer', undefined, GROUND_SCALE),
    traveler: authored('traveler', 'life.traveler', { left: -10, right: 8, top: -14, bottom: 6 }),
    cart: authored('cart', 'life.ox-cart', { left: -14, right: 10, top: -14, bottom: 6 }),
    buffalo: measureStamp('buffalo', bakedBuffalo(scene, 13, false), GROUND_SCALE),
    soldier: measureStamp('soldier', figureStamp(scene, {
      theme: 'dinh', tier: 1, arm: 'spear', colour: 0x2a2118, variant: 0, bucket: 'm',
    })),
    tree: authored('tree', 'flora.tree.spring', undefined, GROUND_SCALE),
    building: authored(
      'building', 'building.improvement-market', { left: -19, right: 19, top: -28, bottom: 6 },
    ),
    house: authored('house', 'building.thatched-house'),
    mountain: authored(
      'mountain', 'terrain.karst-range', { left: -50, right: 50, top: -56, bottom: 0 },
    ),
    settlements: Object.fromEntries([
      'hamlet', 'village', 'market-town', 'shrine-village', 'farmstead', 'mine-camp',
      'citadel-dinh', 'citadel-ly', 'citadel-tran', 'citadel-le', 'citadel-nguyen',
    ].map((state) => [state, authored(state, `settlement.${state}`, worldBox)])),
    paddies: Object.fromEntries([
      'flooded', 'fallow', 'transplanted', 'ripe', 'nursery',
          // The single rectangular plates were retired in favour of the connected shared-bund field
      // systems (`rejectedTerrain` in conquestMapArt); this measures the family that actually ships.
    ].map((state) => [state, authored(state, `terrain.paddy-system-${state}`, paddyBox)])),
  };

  return {
    values,
    projections: CONQUEST_MAP_ART.map(({ id, family, projection, cameraView, accepted, scaleContract }) => ({
      id, family, projection, cameraView, accepted, scaleContract,
    })),
  };
});

await browser.close();

const checks = [];
const check = (label, pass, detail) => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const ratio = (a, b) => a / Math.max(0.0001, b);
const { values } = measured;

console.log(JSON.stringify(values, null, 2));
check(
  'farmer and traveler share one standing height',
  ratio(values.farmer.height, values.traveler.height) >= 0.80
    && ratio(values.farmer.height, values.traveler.height) <= 1.25,
  `${values.farmer.height.toFixed(1)} px / ${values.traveler.height.toFixed(1)} px`,
);
check(
  'farmer and soldier share one standing height',
  ratio(values.farmer.height, values.soldier.height) >= 0.78
    && ratio(values.farmer.height, values.soldier.height) <= 1.22,
  `${values.farmer.height.toFixed(1)} px / ${values.soldier.height.toFixed(1)} px`,
);
check(
  'buffalo does not out-stand a soldier',
  values.buffalo.height <= values.soldier.height * 1.10,
  `${values.buffalo.height.toFixed(1)} px / ${values.soldier.height.toFixed(1)} px`,
);
check(
  'cart reads as traffic, not a building',
  values.cart.width >= values.soldier.height * 1.25
    && values.cart.width <= values.soldier.height * 3,
  `${values.cart.width.toFixed(1)} px wide vs ${values.soldier.height.toFixed(1)} px person`,
);
check(
  'constructed building remains between a person and a settlement',
  values.building.height >= values.soldier.height * 1.05
    && values.building.height <= values.soldier.height * 2.6,
  `${values.building.height.toFixed(1)} px vs ${values.soldier.height.toFixed(1)} px person`,
);
check(
  'authored house stays at the procedural house scale',
  values.house.height >= values.soldier.height * 1.45
    && values.house.height <= values.soldier.height * 2.15,
  `${values.house.height.toFixed(1)} px vs ${values.soldier.height.toFixed(1)} px person`,
);
check(
  'one karst row stands taller than a rural compound and three houses',
  values.mountain.height > values.settlements['mine-camp'].height
    && values.mountain.height >= values.house.height * 3,
  `${values.mountain.height.toFixed(1)} px vs ${values.settlements['mine-camp'].height.toFixed(1)} px mine camp`,
);

const ruralHeights = ['hamlet', 'farmstead', 'mine-camp']
  .map((name) => values.settlements[name].height);
const townHeights = ['village', 'market-town', 'shrine-village']
  .map((name) => values.settlements[name].height);
const citadelHeights = Object.entries(values.settlements)
  .filter(([name]) => name.startsWith('citadel-'))
  .map(([, value]) => value.height);
const spread = (numbers) => Math.max(...numbers) / Math.min(...numbers);
check('rural compounds stay within their reviewed band', spread(ruralHeights) <= 1.15, `${spread(ruralHeights).toFixed(2)}× spread`);
check('town compounds stay within their reviewed band', spread(townHeights) <= 1.20, `${spread(townHeights).toFixed(2)}× spread`);
check('citadel-era sizes stay within 15%', spread(citadelHeights) <= 1.15, `${spread(citadelHeights).toFixed(2)}× spread`);
check(
  'rural compound is smaller than town and every citadel dominates both',
  Math.max(...ruralHeights) < Math.max(...townHeights)
    && Math.min(...citadelHeights) >= Math.max(...townHeights) * 1.44
    && Math.max(...citadelHeights) <= values.soldier.height * 11,
  `rural ${Math.min(...ruralHeights).toFixed(1)}–${Math.max(...ruralHeights).toFixed(1)}, town ${Math.min(...townHeights).toFixed(1)}–${Math.max(...townHeights).toFixed(1)}, citadel ${Math.min(...citadelHeights).toFixed(1)}–${Math.max(...citadelHeights).toFixed(1)} px`,
);

const contractedStructures = measured.projections.filter(({ family, accepted }) => (
  accepted && (family === 'buildings' || family === 'settlements')
));
check(
  'every accepted building and settlement has one semantic scale contract',
  contractedStructures.every(({ scaleContract }) => (
    Number.isFinite(scaleContract?.worldHeight) && scaleContract.worldHeight > 0
  )),
  `${contractedStructures.filter(({ scaleContract }) => !scaleContract).length} missing`,
);

const paddyWidths = Object.values(values.paddies).map((value) => value.width);
const paddyHeights = Object.values(values.paddies).map((value) => value.height);
check(
  'all five rice states keep one footprint',
  spread(paddyWidths) <= 1.05 && spread(paddyHeights) <= 1.05,
  `${spread(paddyWidths).toFixed(3)}× width / ${spread(paddyHeights).toFixed(3)}× height`,
);
check(
  'rice fields retain the shared front-30 rectangular plate',
  Object.values(values.paddies).every((value) => value.ratio >= 1.55 && value.ratio <= 2.15),
  Object.values(values.paddies).map((value) => value.ratio.toFixed(2)).join(', '),
);

const front30 = measured.projections.filter(({ id, family }) => (
  family === 'settlements'
    || (family === 'buildings' && id !== 'building.mine-worker')
    || id.startsWith('terrain.paddy-')
    || id === 'terrain.timber-bridge'
));
const badFront30 = front30.filter(({ projection, cameraView }) => (
  projection !== 'front-orthographic-30' || cameraView !== 'front-centered-elevation-30'
));
check(
  'all 45 structural assets declare the strict front-30 projection and camera',
  front30.length === 45 && badFront30.length === 0,
  badFront30.map(({ id }) => id).join(', '),
);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter(({ pass }) => !pass);
console.log(`\n${checks.length - failed.length}/${checks.length} visual-scale checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
