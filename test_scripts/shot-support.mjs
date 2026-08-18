/**
 * The front page's support row and the coffee modal, in every state it can be in — and, the part
 * that matters, whether the codes it draws actually scan.
 *
 * Drives the real buttons with real taps: an unclickable "Buy me a coffee" is the one thing this
 * feature must not ship with. The QR under each tab is read back off the live canvas with an
 * independent decoder (jsQR) and must decode to the configured link — a code that is one module
 * off looks identical to a human and pays nobody. The empty state and the official-image state are
 * mocked in-page, since the config is a plain object and the texture manager takes a canvas.
 *
 *   DEV_URL=http://127.0.0.1:5199 node test_scripts/shot-support.mjs
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const JSQR_PATH = require.resolve('jsqr/dist/jsQR.js');

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const OUT = process.env.SHOT_OUT ?? 'output/support';
mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  permissions: ['clipboard-read', 'clipboard-write'],
});
const errors = [];

// Headless Chromium reports a new tab well after the click that opened it — measured at over four
// seconds once — so popups are collected as they arrive and each check waits for the count to grow.
const popups = [];
let page;
context.on('page', (p) => { if (p !== page) popups.push(p); });
const nextPopup = async (seen, timeoutMs = 8000) => {
  const start = Date.now();
  while (popups.length <= seen && Date.now() - start < timeoutMs) await new Promise((r) => setTimeout(r, 100));
  const p = popups[seen];
  if (!p) return null;
  await p.waitForLoadState('domcontentloaded').catch(() => {});
  return p;
};

async function openMenu(language, viewport) {
  const p = await context.newPage();
  if (viewport) await p.setViewportSize(viewport);
  p.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 200)}`); });
  await p.addInitScript((lang) => localStorage.setItem('mandate:language:v1', lang), language);
  await p.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await p.addScriptTag({ path: JSQR_PATH });
  await p.waitForTimeout(900);
  return p;
}

/** Centre of the first Text on the menu whose content matches, in design units, plus the sheet size. */
const findLabel = (p, text) => p.evaluate((needle) => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  let hit = null;
  const walk = (obj, ox, oy) => {
    if (!obj || hit) return;
    const x = ox + (obj.x ?? 0);
    const y = oy + (obj.y ?? 0);
    if (obj.type === 'Text' && obj.text === needle) { hit = { x, y }; return; }
    if (obj.list) for (const c of obj.list) walk(c, x, y);
  };
  for (const child of scene.children.list) walk(child, 0, 0);
  const cam = scene.cameras.main;
  return hit ? { ...hit, sheetW: cam.width / cam.zoom, sheetH: cam.height / cam.zoom } : null;
}, text);

const tapDesign = async (p, d) => {
  const box = await p.evaluate(() => {
    const r = window.__phaserGame.canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await p.mouse.click(box.x + (d.x / d.sheetW) * box.w, box.y + (d.y / d.sheetH) * box.h);
  await p.waitForTimeout(450);
};

const modalTexts = (p) => p.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  return scene.modalObjects.flatMap((o) => {
    const out = [];
    const walk = (obj) => { if (obj.type === 'Text' && obj.text) out.push(obj.text); if (obj.list) obj.list.forEach(walk); };
    walk(o);
    return out;
  });
});

/** Reads whatever QR code is on the live canvas right now, via jsQR. */
const decodeCanvas = (p) => p.evaluate(() => {
  const src = window.__phaserGame.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const res = window.jsQR(img.data, img.width, img.height);
  return res ? res.data : null;
});

const setChannels = (p, patch) => p.evaluate(async (patch) => {
  const { SUPPORT } = await import('/src/data/support.ts');
  for (const [id, values] of Object.entries(patch)) {
    const channel = SUPPORT.channels.find((c) => c.id === id);
    Object.assign(channel, values);
  }
}, patch);

/** A stand-in for the PNG the MoMo app exports: a QR-shaped grid on white, registered as its texture. */
const mockMomoImage = (p) => p.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  if (scene.textures.exists('support-qr:momo')) return;
  const size = 232;
  const canvas = scene.textures.createCanvas('support-qr:momo', size, size);
  const ctx = canvas.getContext();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#111111';
  const cell = 8;
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let yy = 1; yy < size / cell - 1; yy += 1) for (let xx = 1; xx < size / cell - 1; xx += 1) if (rnd() > 0.55) ctx.fillRect(xx * cell, yy * cell, cell, cell);
  for (const [fx, fy] of [[1, 1], [size / cell - 8, 1], [1, size / cell - 8]]) {
    ctx.fillRect(fx * cell, fy * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = '#ffffff'; ctx.fillRect((fx + 1) * cell, (fy + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = '#111111'; ctx.fillRect((fx + 2) * cell, (fy + 2) * cell, 3 * cell, 3 * cell);
  }
  canvas.refresh();
});

const configured = await (async () => {
  const p = await context.newPage();
  await p.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  const cfg = await p.evaluate(async () => (await import('/src/data/support.ts')).SUPPORT);
  await p.close();
  return cfg;
})();
const wise = configured.channels.find((c) => c.id === 'wise');
const momo = configured.channels.find((c) => c.id === 'momo');
console.log(`config: wise=${wise.link || '(none)'}  momo=${momo.link || '(none)'}  momo image=${momo.qrImage || '(none)'}`);

// ── 1 · English, tall sheet, the real configuration ─────────────────────────────────────────────
console.log('=== ENGLISH ===');
page = await openMenu('en');
await page.screenshot({ path: `${OUT}/01-menu-en.png` });

const coffee = await findLabel(page, 'Buy me a coffee');
check('the coffee button is on the front page', Boolean(coffee), coffee ? `at ${Math.round(coffee.x)},${Math.round(coffee.y)}` : '');
const improve = await findLabel(page, 'Help improve the game');
check('the improve button is on the front page', Boolean(improve));
check('the two buttons sit side by side', Boolean(coffee && improve) && Math.abs(coffee.y - improve.y) < 2 && improve.x > coffee.x,
  coffee && improve ? `y ${Math.round(coffee.y)} / ${Math.round(improve.y)}` : '');
const settings = await findLabel(page, 'Settings');
check('settings sits above the support row', Boolean(settings && coffee) && settings.y < coffee.y - 20);

if (coffee) await tapDesign(page, coffee);
let texts = await modalTexts(page);
check('a real tap opens the coffee modal', texts.length > 0, `${texts.length} texts`);
check('both tabs are offered', texts.some((s) => /^Wise/.test(s)) && texts.some((s) => /^MoMo/.test(s)));
check('the Wise tab is open first and shows the tag', texts.includes(wise.handle), texts.slice(0, 8).join(' | '));
let decoded = await decodeCanvas(page);
check('the drawn Wise code decodes to the Wise link', decoded === wise.link, `decoded ${JSON.stringify(decoded)}`);
await page.screenshot({ path: `${OUT}/02-modal-wise-en.png` });

// Copy link → clipboard; Open → a new tab at the link.
const copyLabel = await findLabel(page, 'Copy link');
if (copyLabel) await tapDesign(page, copyLabel);
const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
check('Copy link puts the Wise link on the clipboard', clipboard === wise.link, `clipboard = ${JSON.stringify(clipboard)}`);
await page.screenshot({ path: `${OUT}/03-modal-copied-en.png` });
let openLabel = await findLabel(page, 'Open');
let popup = null;
if (openLabel) { const seen = popups.length; await tapDesign(page, openLabel); popup = await nextPopup(seen); }
check('Open opens the Wise link in a new tab', Boolean(popup) && popup.url().startsWith(wise.link), popup ? popup.url() : 'no popup');

// The MoMo tab: shortened link shown, drawn code decodes to the MoMo link.
const momoTab = await findLabel(page, 'MoMo · Việt Nam');
if (momoTab) await tapDesign(page, momoTab);
texts = await modalTexts(page);
check('tapping the MoMo tab switches the body', texts.some((s) => /me\.momo\.vn/.test(s)), texts.slice(0, 8).join(' | '));
decoded = await decodeCanvas(page);
check('the drawn MoMo code decodes to the MoMo link', decoded === momo.link, `decoded ${JSON.stringify(decoded)}`);
await page.screenshot({ path: `${OUT}/04-modal-momo-en.png` });
openLabel = await findLabel(page, 'Open');
popup = null;
if (openLabel) { const seen = popups.length; await tapDesign(page, openLabel); popup = await nextPopup(seen); }
check('Open opens the MoMo link in a new tab', Boolean(popup) && popup.url().startsWith(momo.link), popup ? popup.url() : 'no popup');

// With the official image dropped in, the MoMo tab shows the image and says so.
await mockMomoImage(page);
await setChannels(page, { momo: { qrImage: 'support/momo-qr.png' } });
await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').renderSupportModal('momo'));
await page.waitForTimeout(400);
const imageShown = await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').modalObjects.some((o) => o.type === 'Image'));
texts = await modalTexts(page);
check('the official MoMo image replaces the drawn code when present', imageShown && texts.some((s) => /bank app/.test(s)));
await page.screenshot({ path: `${OUT}/05-modal-momo-image-en.png` });
await setChannels(page, { momo: { qrImage: '' } });

// The close glyph must actually close it.
const closeGlyph = await findLabel(page, '×');
if (closeGlyph) await tapDesign(page, closeGlyph);
check('× closes the modal', (await modalTexts(page)).length === 0);

// The empty state points at GitHub, and that button really opens a tab.
await setChannels(page, { wise: { handle: '', link: '' }, momo: { handle: '', link: '' } });
await tapDesign(page, coffee);
texts = await modalTexts(page);
check('with nothing configured the modal points at GitHub', texts.some((s) => /GitHub/.test(s)));
await page.screenshot({ path: `${OUT}/06-modal-empty-en.png` });
const githubLabel = await findLabel(page, 'Open GitHub');
popup = null;
if (githubLabel) { const seen = popups.length; await tapDesign(page, githubLabel); popup = await nextPopup(seen); }
check('Open GitHub opens the repository in a new tab', Boolean(popup) && /github\.com\/zrg-team/.test(popup.url()), popup ? popup.url() : 'no popup');
await page.close();

// ── 2 · Vietnamese ──────────────────────────────────────────────────────────────────────────────
console.log('=== VIETNAMESE ===');
page = await openMenu('vi');
await page.screenshot({ path: `${OUT}/07-menu-vi.png` });
const coffeeVi = await findLabel(page, 'Mời tác giả cà phê');
check('the Vietnamese coffee button is on the front page', Boolean(coffeeVi));
if (coffeeVi) await tapDesign(page, coffeeVi);
texts = await modalTexts(page);
check('the Vietnamese modal opens on the Wise tab', texts.includes(wise.handle) && texts.some((s) => /Chép liên kết/.test(s)));
decoded = await decodeCanvas(page);
check('the code still decodes under the Vietnamese layout', decoded === wise.link, `decoded ${JSON.stringify(decoded)}`);
await page.screenshot({ path: `${OUT}/08-modal-wise-vi.png` });
await page.close();

// ── 3 · The shortest sheet: a wide window forces GAME_HEIGHT to its 620 floor ───────────────────
console.log('=== SHORT SHEET (620) ===');
page = await openMenu('en', { width: 1512, height: 900 });
const sheet = await page.evaluate(() => { const c = window.__phaserGame.scene.getScene('MenuScene').cameras.main; return Math.round(c.height / c.zoom); });
check('the wide window produced the 620 floor', sheet === 620, `sheet height ${sheet}`);
const coffeeShort = await findLabel(page, 'Buy me a coffee');
check('the support row is on the short sheet', Boolean(coffeeShort) && coffeeShort.y < 620, coffeeShort ? `y ${Math.round(coffeeShort.y)}` : '');
if (coffeeShort) await tapDesign(page, coffeeShort);
const shortModal = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const cam = scene.cameras.main;
  const sheetH = cam.height / cam.zoom;
  let minY = Infinity; let maxY = -Infinity;
  const walk = (obj, ox, oy) => {
    const x = ox + (obj.x ?? 0); const y = oy + (obj.y ?? 0);
    if (obj.type === 'Text') {
      const h = obj.height ?? 0;
      const top = y - (obj.originY ?? 0) * h;
      minY = Math.min(minY, top); maxY = Math.max(maxY, top + h);
    }
    if (obj.list) for (const c of obj.list) walk(c, x, y);
  };
  for (const o of scene.modalObjects) walk(o, 0, 0);
  return { minY: Math.round(minY), maxY: Math.round(maxY), sheetH };
});
check('the short modal keeps every text on the sheet', shortModal.minY >= 0 && shortModal.maxY <= shortModal.sheetH,
  `text spans ${shortModal.minY}..${shortModal.maxY} of ${shortModal.sheetH}`);
decoded = await decodeCanvas(page);
check('the code still decodes on the short sheet', decoded === wise.link, `decoded ${JSON.stringify(decoded)}`);
await page.screenshot({ path: `${OUT}/09-modal-short.png` });
await page.close();

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the support row and coffee modal work, and every code scans' : 'FAIL: the support feature is broken somewhere');
process.exit(failed.length === 0 ? 0 : 1);
