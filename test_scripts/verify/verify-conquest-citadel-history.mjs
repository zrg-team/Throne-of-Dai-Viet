import fs from 'node:fs';

const decisions = JSON.parse(fs.readFileSync('output/conquest-dongho-review/decisions.json', 'utf8'));
const review = JSON.parse(fs.readFileSync('output/conquest-dongho-review/castle-historical-review.json', 'utf8'));
const runtime = JSON.parse(fs.readFileSync('public/art/conquest-dongho/manifest.json', 'utf8'));

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const worldFamilies = new Set(['settlements', 'buildings']);
const world = decisions.filter(({ family }) => worldFamilies.has(family));
const acceptedWorld = world.filter(({ accepted }) => accepted);
check(
  'all accepted settlement and building variants use the strict front-30 camera',
  world.length === 40 && acceptedWorld.length === 39 && acceptedWorld.every(({ projection, cameraView }) => (
    projection === 'front-orthographic-30' && cameraView === 'front-centered-elevation-30'
  )),
  `${acceptedWorld.length}/39 accepted; ${world.length}/40 audited`,
);

const buildingSources = acceptedWorld.filter(({ family }) => family === 'buildings').map(({ sourceSheet }) => sourceSheet);
const settlementSources = acceptedWorld.filter(({ family }) => family === 'settlements').map(({ sourceSheet }) => sourceSheet);
check(
  'runtime buildings come from reviewed front-centered v3 masters',
  buildingSources.length === 28 && buildingSources.every((source) => source?.startsWith('masters/front-centered-vertical30-v3/building.')),
  `${buildingSources.length}/28`,
);
check(
  'runtime settlements come from reviewed front-centered v3 masters',
  settlementSources.length === 11 && settlementSources.every((source) => source?.startsWith('masters/front-centered-vertical30-v3/settlement.')),
  `${settlementSources.length}/11`,
);

const expectedCitadels = ['dinh', 'ly', 'tran', 'le', 'nguyen'].map((era) => `settlement.citadel-${era}`);
const reviewById = new Map(review.citadels.map((entry) => [entry.id, entry]));
check(
  'all five dynasty citadels have an explicit historical review',
  expectedCitadels.every((id) => reviewById.has(id)) && reviewById.size === 5,
  `${reviewById.size}/5`,
);
check(
  'each citadel records a concrete Vietnamese silhouette and confidence',
  [...reviewById.values()].every(({ acceptedFeatures, confidence, oldVerdict }) => (
    acceptedFeatures.length >= 4 && Boolean(confidence) && Boolean(oldVerdict)
  )),
);
check(
  'the historical review is supported by institutional heritage sources',
  review.sources.length >= 5 && review.sources.every(({ url }) => (
    url.startsWith('https://whc.unesco.org/') || url.startsWith('https://hoangthanhthanglong.vn/')
  )),
  `${review.sources.length} sources`,
);

const runtimeWorld = runtime.assets.filter(({ family }) => worldFamilies.has(family));
check(
  'runtime manifest keeps the same camera contract',
  runtimeWorld.length === 39 && runtimeWorld.every(({ projection, cameraView }) => (
    projection === 'front-orthographic-30' && cameraView === 'front-centered-elevation-30'
  )),
  `${runtimeWorld.length}/39 accepted; mine worker is living-map art`,
);

const failed = checks.filter(({ pass }) => !pass);
console.log(`\n${checks.length - failed.length}/${checks.length} front-30/history checks passed`);
process.exit(failed.length ? 1 : 0);
