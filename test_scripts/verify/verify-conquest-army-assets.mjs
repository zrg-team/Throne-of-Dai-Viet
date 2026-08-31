// Accepted Đông Hồ army pack: complete matrix, fixed native facing, and arena mirroring.
//
// Usage: node test_scripts/verify/verify-conquest-army-assets.mjs
//        DEV_URL=http://127.0.0.1:5181 node test_scripts/verify/verify-conquest-army-assets.mjs
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const REVIEW = resolve(ROOT, 'output/conquest-dongho-review');
const decisions = JSON.parse(readFileSync(resolve(REVIEW, 'decisions.json'), 'utf8'));
const reviewManifest = JSON.parse(readFileSync(resolve(REVIEW, 'manifest.json'), 'utf8'));
const runtimeManifest = JSON.parse(readFileSync(resolve(ROOT, 'public/art/conquest-dongho/manifest.json'), 'utf8'));

const themes = [
  'dinh', 'ly', 'tran', 'le', 'trinh', 'nguyenLord', 'tayson', 'nguyen',
  'song', 'yuan', 'ming', 'qing', 'champa',
];
const tiers = ['levy', 'trained', 'royal'];
const arms = ['spear', 'sword', 'skirmish', 'bow', 'mounted'];
const expected = themes.flatMap((theme) => tiers.flatMap((tier) => arms.map((arm) =>
  `figure.${theme}.${tier}.${arm}`)));

const figures = decisions.filter((entry) => entry.family === 'figures');
const runtimeFigures = runtimeManifest.assets.filter((entry) => entry.family === 'figures');
const byId = new Map(figures.map((entry) => [entry.id, entry]));
const runtimeById = new Map(runtimeFigures.map((entry) => [entry.id, entry]));
const fileHash = (path) => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
const fileSlug = (theme) => theme === 'nguyenLord' ? 'nguyen-lord' : theme;
const primaryVisuals = figures.filter((entry) => entry.derivedFrom === undefined);
const vietnameseThemes = new Set([
  'dinh', 'ly', 'tran', 'le', 'trinh', 'nguyenLord', 'tayson', 'nguyen',
]);
const sourceCellIsCorrect = themes.every((theme) => tiers.every((tier, tierIndex) => {
  const prefix = `figure.${theme}.${tier}`;
  const expectedSheet = vietnameseThemes.has(theme)
    ? `masters/alpha-army-v3-clothing-${fileSlug(theme)}.png`
    : `masters/alpha-army-v2-${fileSlug(theme)}.png`;
  const spear = byId.get(`${prefix}.spear`);
  const sword = byId.get(`${prefix}.sword`);
  const ranged = byId.get(`${prefix}.skirmish`);
  const bowAlias = byId.get(`${prefix}.bow`);
  const mounted = byId.get(`${prefix}.mounted`);
  const start = tierIndex * 4;
  return [spear, sword, ranged, mounted].every((entry) => entry?.sourceSheet === expectedSheet)
    && spear?.sourceCell === start
    && sword?.sourceCell === start + 1
    && ranged?.sourceCell === start + 2
    && mounted?.sourceCell === start + 3
    && bowAlias?.sourceCell === start + 2
    && bowAlias?.derivedFrom === `${prefix}.skirmish`;
}));

const staticChecks = {
  exactCount: figures.length === 195 && runtimeFigures.length === 195,
  exactVisualCount: primaryVisuals.length === 13 * 3 * 4,
  unique: new Set(figures.map((entry) => entry.id)).size === 195,
  complete: expected.every((id) => byId.get(id)?.accepted && runtimeById.has(id)),
  nativeRight: runtimeFigures.every((entry) => entry.nativeFacing === 1),
  fixedCanvas: runtimeFigures.every((entry) => entry.width === 144 && entry.height === 128),
  rangedAliasesMatch: themes.every((theme) => tiers.every((tier) =>
    fileHash(runtimeById.get(`figure.${theme}.${tier}.skirmish`).runtimePath)
      === fileHash(runtimeById.get(`figure.${theme}.${tier}.bow`).runtimePath))),
  mountedScaleCompensation: runtimeFigures.every((entry) =>
    entry.id.endsWith('.mounted') ? entry.runtimeScale === 1.33 : entry.runtimeScale === 1.51),
  filesPresent: runtimeFigures.every((entry) => existsSync(resolve(ROOT, entry.runtimePath))),
  alphaClean: reviewManifest.alphaAudit?.passed === reviewManifest.alphaAudit?.files
    && reviewManifest.alphaAudit?.allHaveRealTransparency === true
    && reviewManifest.alphaAudit?.allFreeOfChromaFringe === true,
  mountedCropClear: reviewManifest.alphaAudit?.mountedFiles === 39
    && reviewManifest.alphaAudit?.allMountedClearOfCropEdges === true,
  correctFourColumnSources: sourceCellIsCorrect,
  attemptBudget: figures.every((entry) => {
    const theme = entry.id.split('.')[1];
    return entry.attemptCount === (vietnameseThemes.has(theme) ? 2 : 1);
  }),
  clothingOnlyRevision: figures.every((entry) => {
    const theme = entry.id.split('.')[1];
    return vietnameseThemes.has(theme)
      ? entry.clothingRevision === 'v3-historical-audit' && entry.clothingOnlyEdit === true
      : entry.clothingRevision === 'v2-unchanged-foreign-wardrobe';
  }),
};

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5181';
mkdirSync(REVIEW, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`CONSOLE ${message.text()}`);
});

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30_000 });
await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(900);

const arena = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('BattleArenaScene');
  scene.ourStyle = 'nguyenLord';
  scene.theirStyle = 'yuan';
  scene.tab = 'army';
  scene.render();

  const images = [];
  const walk = (object, offsetX = 0, offsetY = 0) => {
    for (const child of object.list ?? []) {
      const x = offsetX + (child.x ?? 0);
      const y = offsetY + (child.y ?? 0);
      const side = child.getData?.('arenaArmySide');
      if (side) {
        images.push({
          side,
          assetId: child.getData('conquestFigureAssetId'),
          requestedDirection: child.getData('conquestFigureDirection'),
          nativeFacing: child.getData('nativeFacing'),
          scaleX: child.scaleX,
          scaleY: child.scaleY,
          displayWidth: child.displayWidth,
          displayHeight: child.displayHeight,
          footX: x,
          footY: y,
          texture: child.texture?.key,
        });
      }
      if (child.list) walk(child, x, y);
    }
  };
  walk(scene.children);
  return images;
});

await page.screenshot({
  path: resolve(REVIEW, 'army-clothing-v3-facing-skirmish.png'),
  fullPage: true,
});
await browser.close();

const ours = arena.filter((entry) => entry.side === 'ours');
const theirs = arena.filter((entry) => entry.side === 'theirs');
const dynamicChecks = {
  fourPerSide: ours.length === 4 && theirs.length === 4,
  correctWardrobes: ours.every((entry) => entry.assetId?.startsWith('figure.nguyenLord.trained.'))
    && theirs.every((entry) => entry.assetId?.startsWith('figure.yuan.trained.')),
  correctDirection: ours.every((entry) => entry.nativeFacing === 1
      && entry.requestedDirection === 1 && entry.scaleX > 0)
    && theirs.every((entry) => entry.nativeFacing === 1
      && entry.requestedDirection === -1 && entry.scaleX < 0),
  alignedFeet: new Set(ours.map((entry) => Math.round(entry.footY))).size === 1
    && new Set(theirs.map((entry) => Math.round(entry.footY))).size === 1,
  noConsoleErrors: errors.length === 0,
};

const allChecks = { ...staticChecks, ...dynamicChecks };
for (const [name, passed] of Object.entries(allChecks)) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`army assets: ${figures.length}/195 accepted, ${runtimeFigures.length}/195 runtime`);
console.log(`reviewed visual cells: ${primaryVisuals.length}/156 (bow aliases reuse ranged cells)`);
console.log(`arena: ${ours.length} Nguyễn Lord facing right, ${theirs.length} Yuan facing left`);
console.log(`console errors: ${errors.length ? errors.join(' ; ') : 'none'}`);

if (Object.values(allChecks).some((passed) => !passed)) process.exitCode = 1;
