/**
 * The History page's two army plates, swept across every wardrobe the page can show.
 *
 * `verify-history` proves a chip *changes* the plate; it never looks at what was drawn, so when the
 * page swapped from the procedural figure to the authored Đông Hồ sheets it went on passing while
 * the soldier's sabre printed through the dynasty's own title and the block captions were buried
 * under a rank of horsemen. Both were reported by a player. This is the check that would have
 * caught them.
 *
 * Nothing here re-derives the page's layout: the plate's own title and caption are found on the
 * display list and the soldier is required to stand between them. A test that recomputed
 * `plateHeight` would agree with a broken page as readily as with a working one.
 *
 * Usage: node test_scripts/verify/verify-army-plate.mjs   (a dev server must already be running)
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const THEMES = ['ly', 'tran', 'le', 'trinh', 'nguyenLord', 'tayson', 'nguyen'];
const ARMS = ['spear', 'sword', 'skirmish', 'bow', 'mounted'];
const TIERS = [0, 1, 2];
const DOCTRINES = ['balanced', 'spears', 'archers', 'shock', 'horse'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__phaserGame.scene.start('HistoryScene'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('HistoryScene'), null, { timeout: 20000 });
await page.waitForTimeout(700);
await page.evaluate(() => {
  const sc = window.__phaserGame.scene.getScene('HistoryScene');
  sc.tab = 'army';
  sc.render();
});
await page.waitForTimeout(300);

/**
 * How many blocks each doctrine actually deploys, asked of `armyShape` rather than assumed.
 *
 * It is not a constant: at the plate's headcount `balanced` and `horse` field four blocks while the
 * three committed doctrines field three, because a doctrine that concentrates has fewer things to
 * name — and the counts move again with the headcount. The first draft asserted four and failed
 * twenty-one perfectly correct pages. The headcount is read out of the page's own source, so this
 * and the plate can never drift apart.
 */
const blockCounts = await page.evaluate(async () => {
  const { armyShape } = await import('/src/ui/ink/devices.ts');
  const src = await fetch('/src/scenes/HistoryScene.ts').then((r) => r.text());
  const men = Number(/const ARMY_PLATE_MEN\s*=\s*(\d+)/.exec(src)?.[1]);
  const out = {};
  for (const d of ['balanced', 'spears', 'archers', 'shock', 'horse']) {
    out[d] = armyShape(men, d, 1).blocks.length;
  }
  return { men, out };
});
console.log(`plate headcount ${blockCounts.men}; blocks per doctrine ${JSON.stringify(blockCounts.out)}`);

/**
 * One rendered state, read off the display list.
 *
 * The soldier is the plate's only Image; the doctrine's heading is the one Text drawn in the title
 * face. Everything is measured in world space, so a container the page nests differently tomorrow
 * still measures the same.
 */
const PROBE = ([theme, arm, tier, doctrine]) => {
  const sc = window.__phaserGame.scene.getScene('HistoryScene');
  sc.armyTheme = theme;
  sc.armyArm = arm;
  sc.armyTier = tier;
  sc.armyDoctrine = doctrine;
  sc.pendingScroll = 0;
  sc.render();

  const content = sc.scroll?.content;
  if (!content) return { err: 'no scroll content' };
  const box = (obj) => {
    const b = obj.getBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.x + b.width, b: b.y + b.height };
  };

  const texts = [];
  const images = [];
  const hosts = [];
  const walk = (obj) => {
    if (obj.type === 'Text' && obj.text) texts.push({ text: obj.text, ...box(obj) });
    // Measured by its **ink**, not its frame. The authored sheets are a uniform 144x128 and the
    // man never fills one, so a frame that reaches past the caption is not a soldier that does —
    // and a check on frames would demand a page leave room for transparency. The scene has already
    // scanned each sheet once and cached the result; this reads that rather than scanning again.
    if (obj.type === 'Image') {
      const b = obj.getBounds();
      const ink = sc.constructor.inkCache?.get(obj.texture.key) ?? { x: 0, y: 0, w: 1, h: 1 };
      const x = b.x + b.width * ink.x;
      const y = b.y + b.height * ink.y;
      const w = b.width * ink.w;
      const h = b.height * ink.h;
      images.push({ x, y, w, h, r: x + w, b: y + h });
    }
    // The stamped host: a container of rank containers, each holding the men. Measured from the
    // men rather than from the container, because `stampedArmy` pushes an empty layer for any rank
    // its plan skips and an empty container folds its origin into `getBounds()`.
    if (obj.type === 'Container' && obj.list.length > 0
      && obj.list.every((c) => c.type === 'Container')) {
      let u = null;
      const men = (o) => {
        if (o.list && o.list.length) { o.list.forEach(men); return; }
        if (typeof o.getBounds !== 'function') return;
        const b = o.getBounds();
        if (b.width <= 0 || b.height <= 0) return;
        u = u ? {
          x: Math.min(u.x, b.x), y: Math.min(u.y, b.y),
          r: Math.max(u.r, b.x + b.width), b2: Math.max(u.b2, b.y + b.height),
        } : { x: b.x, y: b.y, r: b.x + b.width, b2: b.y + b.height };
      };
      men(obj);
      if (u) hosts.push({ x: u.x, y: u.y, w: u.r - u.x, h: u.b2 - u.y, r: u.r, b: u.b2 });
    }
    if (obj.list) obj.list.forEach(walk);
  };
  content.list.forEach(walk);

  const title = texts.find((t) => /·\s*\d{3,4}/.test(t.text));
  const caption = texts.find((t) => t !== title && t.y > (title?.b ?? 0) && !/·/.test(t.text));
  const heading = texts.find((t) => /·/.test(t.text) && t !== title);
  const blockLabels = texts.filter((t) => /\s\d+$/.test(t.text) && t !== title);

  return {
    soldier: images[0] ?? null,
    title: title ?? null,
    caption: caption ?? null,
    heading: heading ?? null,
    host: hosts[0] ?? null,
    blockLabels,
    viewport: { x: sc.scroll.bounds.x, r: sc.scroll.bounds.x + sc.scroll.bounds.width },
    // The plate is as wide as the list, less the six the scroll body keeps clear, and it is drawn
    // from the content's own left edge — so the drawing's frame is the content column itself.
    frame: { x: content.getWorldTransformMatrix().tx, w: sc.scroll.bounds.width - 6 },
  };
};

// ── 1. The wardrobe plate: the soldier stands between the title and the caption ──
console.log('=== THE SOLDIER PLATE ===');
const overlapTitle = [];
const overlapCaption = [];
const outOfFrame = [];
const tiny = [];
let sweep = 0;
for (const theme of THEMES) {
  for (const arm of ARMS) {
    for (const tier of TIERS) {
      const r = await page.evaluate(PROBE, [theme, arm, tier, 'balanced']);
      sweep += 1;
      const id = `${theme}/${arm}/${tier}`;
      if (r.err || !r.soldier || !r.title || !r.caption) { outOfFrame.push(`${id}:probe`); continue; }
      // A 2px grace: the ink of a woodblock edge is not a hairline.
      if (r.soldier.y < r.title.b - 2) overlapTitle.push(`${id} by ${Math.round(r.title.b - r.soldier.y)}`);
      if (r.soldier.b > r.caption.y + 2) overlapCaption.push(`${id} by ${Math.round(r.soldier.b - r.caption.y)}`);
      if (r.soldier.x < r.viewport.x - 2 || r.soldier.r > r.viewport.r + 2) outOfFrame.push(id);
      // A soldier shrunk to nothing passes every "does not overlap" test ever written.
      if (r.soldier.h < 80) tiny.push(`${id}:${Math.round(r.soldier.h)}`);
    }
  }
}
check(`all ${sweep} wardrobe/weapon/rank plates draw a soldier`, outOfFrame.length === 0,
  outOfFrame.slice(0, 4).join(' | '));
check('no soldier reaches into the dynasty title', overlapTitle.length === 0,
  overlapTitle.slice(0, 4).join(' | '));
check('no soldier reaches into the caption below him', overlapCaption.length === 0,
  overlapCaption.slice(0, 4).join(' | '));
check('every soldier is drawn large enough to read', tiny.length === 0, tiny.slice(0, 4).join(' | '));

// ── 2. The formation plate: the block stays under its heading, captions stay legible ──
console.log('\n=== THE FORMATION PLATE ===');
const throughHeading = [];
const collided = [];
const missingLabels = [];
const spilled = [];
let formations = 0;
for (const theme of THEMES) {
  for (const doctrine of DOCTRINES) {
    const r = await page.evaluate(PROBE, [theme, 'sword', 1, doctrine]);
    formations += 1;
    const id = `${theme}/${doctrine}`;
    if (!r.host || !r.heading) { missingLabels.push(`${id}:probe`); continue; }
    if (r.host.y < r.heading.b - 2) throughHeading.push(`${id} by ${Math.round(r.heading.b - r.host.y)}`);
    // The one the plan's own width cannot catch: `armyShape` measures where the files stand, and a
    // levelled spear reaches most of a man past its file.
    const over = Math.max(r.frame.x - r.host.x, (r.host.r) - (r.frame.x + r.frame.w));
    if (over > 2) spilled.push(`${id} by ${Math.round(over)}`);
    const want = blockCounts.out[doctrine];
    if (r.blockLabels.length !== want) missingLabels.push(`${id}:${r.blockLabels.length}/${want}`);
    // Two captions on top of each other are one caption and one smear.
    for (let i = 0; i < r.blockLabels.length; i += 1) {
      for (let j = i + 1; j < r.blockLabels.length; j += 1) {
        const a = r.blockLabels[i];
        const b = r.blockLabels[j];
        if (a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b) collided.push(`${id}:${a.text}/${b.text}`);
      }
    }
  }
}
check(`all ${formations} formations name every block they deploy`, missingLabels.length === 0,
  missingLabels.slice(0, 4).join(' | '));
check('no deployment is drawn through its own heading', throughHeading.length === 0,
  throughHeading.slice(0, 4).join(' | '));
check('no deployment runs off the side of its plate', spilled.length === 0, spilled.slice(0, 4).join(' | '));
check('no two block captions overlap each other', collided.length === 0, collided.slice(0, 3).join(' | '));

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: every wardrobe plate holds its soldier, and every deployment holds its captions'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
