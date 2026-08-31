// Proves that the footprint planner keeps every current building outside compounds, labels, and peers.
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

const audit = await page.evaluate(async () => {
  window.__startBenchGame(1337, 'campaign');
  await new Promise((resolve) => setTimeout(resolve, 3500));
  const scene = window.__phaserGame.scene.getScene('MapScene');
  if (!scene) throw new Error('Map scene renderer was not found');
  for (const land of window.__mandateState.lands) {
    land.isVisible = true;
    land.isExplored = true;
  }
  scene.refresh();
  await new Promise((resolve) => setTimeout(resolve, 600));

  const [{ conquestArtDisplayMetrics }, layout] = await Promise.all([
    import('/src/ui/conquestMapArt.ts'),
    import('/src/scenes/map/settlementLayout.ts'),
  ]);
  const settlementIds = [
    'settlement.hamlet', 'settlement.village', 'settlement.market-town',
    'settlement.shrine-village', 'settlement.farmstead', 'settlement.mine-camp',
    'settlement.citadel-dinh', 'settlement.citadel-ly', 'settlement.citadel-tran',
    'settlement.citadel-le', 'settlement.citadel-nguyen',
  ];
  const buildingIds = [
    'building.improvement-farm', 'building.improvement-mine',
    'building.improvement-market', 'building.improvement-tower',
    'building.improvement-barracks', 'building.improvement-communal-hall',
    'building.improvement-harbor', 'building.improvement-workshop',
    'building.improvement-guild', 'building.improvement-university',
  ];
  const items = buildingIds.map((id) => ({
    value: id,
    footprint: conquestArtDisplayMetrics(scene, id),
  }));
  if (items.some(({ footprint }) => !footprint)) throw new Error('Missing building footprint');

  const layouts = settlementIds.map((id, settlementIndex) => {
    const footprint = conquestArtDisplayMetrics(scene, id);
    if (!footprint) throw new Error(`Missing settlement footprint: ${id}`);
    const core = layout.footprintRect(0, 0, footprint, 3);
    const label = { left: -52, right: 52, top: 37, bottom: 59 };
    const placements = layout.planSettlementSatellites(
      core,
      label,
      items,
      settlementIndex % 2 === 0 ? 1 : -1,
      () => true,
    );
    const overlaps = [];
    placements.forEach((placement, index) => {
      if (layout.rectsOverlap(placement.rect, core)) overlaps.push(`${index}:core`);
      if (layout.rectsOverlap(placement.rect, label)) overlaps.push(`${index}:label`);
      for (let peer = 0; peer < index; peer += 1) {
        if (layout.rectsOverlap(placement.rect, placements[peer].rect)) {
          overlaps.push(`${index}:${peer}`);
        }
      }
    });
    return {
      id,
      count: placements.length,
      overlaps,
      farthest: Math.max(...placements.map(({ x, y }) => Math.hypot(x, y))),
    };
  });
  const labelRects = [...scene.landLabels.entries()].map(([id, label]) => ({
    id,
    left: label.x - label.width / 2,
    right: label.x + label.width / 2,
    top: label.y - label.height / 2,
    bottom: label.y + label.height / 2,
  }));
  const structureRects = [...scene.landStructureBounds.entries()].map(([id, rect]) => ({ id, ...rect }));
  const overlaps = [];
  const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  labelRects.forEach((label, index) => {
    for (const structure of structureRects) {
      if (overlap(label, structure)) overlaps.push(`${label.id}:structure:${structure.id}`);
    }
    for (let peer = 0; peer < index; peer += 1) {
      if (overlap(label, labelRects[peer])) overlaps.push(`${label.id}:label:${labelRects[peer].id}`);
    }
  });
  return { layouts, liveLabels: labelRects.length, liveStructures: structureRects.length, overlaps };
});

await browser.close();

const failed = [];
for (const result of audit.layouts) {
  const pass = result.count === 10 && result.overlaps.length === 0 && result.farthest < 220;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${result.id} — ${result.count} satellites, ${result.overlaps.length} overlaps, ${result.farthest.toFixed(1)} max distance`);
  if (!pass) failed.push(result.id);
}
const liveClean = audit.overlaps.length === 0 && audit.liveLabels >= audit.liveStructures;
console.log(`${liveClean ? 'ok  ' : 'FAIL'} live map labels avoid every settlement and each other — ${audit.liveLabels} labels / ${audit.liveStructures} structures / ${audit.overlaps.length} overlaps`);
if (!liveClean) {
  console.log(audit.overlaps.slice(0, 12).join('\n'));
  failed.push('live-labels');
}
const cleanConsole = errors.length === 0;
console.log(`${cleanConsole ? 'ok  ' : 'FAIL'} no console errors${cleanConsole ? '' : ` — ${errors.slice(0, 3).join(' | ')}`}`);
if (!cleanConsole) failed.push('console');
console.log(`\n${audit.layouts.length - failed.filter((id) => !['console', 'live-labels'].includes(id)).length}/${audit.layouts.length} settlement layouts passed`);
process.exit(failed.length === 0 ? 0 : 1);
