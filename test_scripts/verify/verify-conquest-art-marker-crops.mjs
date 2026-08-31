// Marker art is unusually vulnerable to sprite-sheet bleed: its long poles cross nominal row
// boundaries, while circular seals make a flat cut immediately obvious. The extraction audit is
// the source of truth—every runtime marker must finish with transparent pixels on all four edges.
import { readFileSync } from 'node:fs';

const review = JSON.parse(readFileSync('output/conquest-dongho-review/alpha-audit.json', 'utf8'));
const runtime = JSON.parse(readFileSync('public/art/conquest-dongho/manifest.json', 'utf8'));
const markerAudit = review.assets.filter(({ id }) => id.startsWith('marker.'));
const markerRuntime = runtime.assets.filter(({ id }) => id.startsWith('marker.'));

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

check('all 23 marker variants are exported', markerAudit.length === 23 && markerRuntime.length === 23,
  `${markerAudit.length} audited / ${markerRuntime.length} runtime`);

const touching = markerAudit.filter(({ visibleBorderPixels }) => visibleBorderPixels !== 0);
check('no marker ink touches a runtime crop edge', touching.length === 0,
  touching.map(({ id, visibleBorderPixels }) => `${id}=${visibleBorderPixels}`).join(', '));

const flags = markerRuntime.filter(({ id }) => id.startsWith('marker.flag-') || id.startsWith('marker.rival-flag-'));
check('all twelve field flags retain their full tall silhouette',
  flags.length === 12 && flags.every(({ width, height }) => height === 112 && width >= 60 && width <= 76),
  flags.map(({ id, width, height }) => `${id.split('.').at(-1)} ${width}x${height}`).join(', '));

const roundIds = new Set([
  'marker.selection-seal', 'marker.capital-highlight', 'marker.acquisition', 'marker.build',
  'marker.recruit', 'marker.siege', 'marker.battle', 'marker.route-brush',
]);
const round = markerRuntime.filter(({ id }) => roundIds.has(id));
const distorted = round.filter(({ width, height }) => width / height < 0.90 || width / height > 1.10);
check('round markers remain round after padding and resize', round.length === roundIds.size && distorted.length === 0,
  distorted.map(({ id, width, height }) => `${id} ${width}x${height}`).join(', '));

check('all marker files retain true alpha and no chroma fringe', markerAudit.every(
  ({ realTransparency, greenFringePixels }) => realTransparency && greenFringePixels === 0,
));

const failed = checks.filter(({ pass }) => !pass);
console.log(`\n${checks.length - failed.length}/${checks.length} marker-crop checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
