/**
 * The README's pictures, produced from the live game so they never drift from it.
 *
 * Every image under docs/readme/ comes out of this script: portrait shots of the screens that
 * explain the game, a four-season strip, a three-theme strip, and the wide banner. Screenshots are
 * taken as PNG and re-encoded to WebP *inside Chromium* — this machine has no image tools, and a
 * 2× PNG of the sheet weighs 1.1 MB where the WebP weighs a tenth of that. Strips are composed the
 * same way, on a canvas, with transparent gutters so they sit on GitHub's light and dark pages alike.
 *
 *   DEV_URL=http://127.0.0.1:5199 node test_scripts/shot-readme.mjs
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const OUT = 'docs/readme';
const QUALITY = 0.82;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const written = [];

// ── encoding ────────────────────────────────────────────────────────────────────────────────────

/** A blank page that only ever holds a canvas — the game page is never touched by the encoder. */
const codec = await browser.newPage();
await codec.goto('about:blank');

/**
 * Lays PNG buffers side by side (or one alone), scales, and returns WebP bytes.
 * `gap` is in source pixels; gutters and any spare height are left transparent.
 */
async function encode(buffers, { gap = 0, scale = 1, quality = QUALITY } = {}) {
  const dataUrl = await codec.evaluate(async ({ images, gap, scale, quality }) => {
    const bitmaps = await Promise.all(images.map((src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/png;base64,${src}`;
    })));
    const width = bitmaps.reduce((sum, im) => sum + im.width, 0) + gap * (bitmaps.length - 1);
    const height = Math.max(...bitmaps.map((im) => im.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    let x = 0;
    for (const im of bitmaps) {
      ctx.drawImage(im, Math.round(x * scale), 0, Math.round(im.width * scale), Math.round(im.height * scale));
      x += im.width + gap;
    }
    return canvas.toDataURL('image/webp', quality);
  }, { images: buffers.map((b) => b.toString('base64')), gap, scale, quality });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function save(name, buffers, opts) {
  const bytes = await encode(buffers, opts);
  const path = `${OUT}/${name}.webp`;
  writeFileSync(path, bytes);
  written.push({ path, kb: Math.round(statSync(path).size / 1024) });
  console.log(`   ${path}  ${written.at(-1).kb} KB`);
}

// ── driving the game ────────────────────────────────────────────────────────────────────────────

async function newPage(viewport = { width: 390, height: 844 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
  await page.addInitScript(() => {
    localStorage.setItem('mandate:language:v1', 'en');
    if (!localStorage.getItem('mandate:map-theme:v1')) localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
  });
  return page;
}

async function toMenu(page) {
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function boot(page, seed, mode) {
  await toMenu(page);
  await page.evaluate(([s, m]) => window.__startBenchGame(s, m), [seed, mode]);
  const key = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
  await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), key, { timeout: 30000 });
  await page.waitForTimeout(1500);
}

/** An engaged player: takes the first real option of every card. Installed in-page as `window.__firstChoice`. */
const FIRST_CHOICE = `
window.__firstChoice = (p) => {
  switch (p.kind) {
    case 'founder': return p.options[0];
    case 'power-draft': return p.cards[0] ?? 'skip';
    case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
    case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
    case 'hero-choice': return p.heroIds[0] ?? 'pass';
    case 'court-appointment': return p.options[0].id;
    case 'law-choice': return p.projectIds[0] ? 'edict:' + p.projectIds[0] : 'hold';
    case 'parliament': return 'decline';
    case 'doctrine': return p.options[1] ?? p.options[0] ?? 'hold';
    default: return (p.options?.find((o) => o.affordable) ?? p.options?.[0])?.id ?? 'ok';
  }
};`;

/**
 * Runs the ascent world forward with prompts answered, then leaves the map clean and redrawn.
 *
 * `__startBenchGame` seeds `Math.random` for state construction only, so the ticks after it are
 * a different run every time — the first cut of this framed a capital that had changed hands.
 * The tick loop pins the RNG too, so the picture is the same one on every regeneration.
 */
async function advanceAscent(page, ticks, { stopOnBattle = false, seed = 20260818 } = {}) {
  await page.evaluate(FIRST_CHOICE);
  return page.evaluate(async ({ ticks, stopOnBattle, seed }) => {
    const st = window.__mandateState;
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    // A map picture wants the map, not the battle screen a fight opens over it. The battle shot
    // is the one run that wants that screen; every other run lets its generals fight.
    st.ascent.autoResolveBattles = !stopOnBattle;
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let t = 0;
    for (; t < ticks; t += 1) {
      advanceAscentTick(st);
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 10) {
        if (st.pendingAscentPrompt.kind === 'run-over') break;
        resolveAscentPrompt(st, window.__firstChoice(st.pendingAscentPrompt));
      }
      if (stopOnBattle && st.ascent.activeBattle) break;
    }
    if (!stopOnBattle) {
      st.pendingAscentPrompt = undefined;
      st.ascent.promptQueue = [];
      st.isPaused = false;
      try { ui.closeOverlay?.(); ui.closeLane?.(); } catch { /* nothing open */ }
    }
    world.refresh();
    ui.events.emit('state-changed');
    const capital = st.lands.find((l) => l.type === 'castle' && l.ownerId === 'dai-viet');
    return { turn: st.turn, wave: st.ascent.wave, lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length, capitalHeld: Boolean(capital), battle: Boolean(st.ascent.activeBattle) };
  }, { ticks, stopOnBattle, seed });
}

const shot = (page, clip) => page.screenshot(clip ? { clip } : {});

/**
 * Parks the world camera on the player's capital and says where on the sheet it landed.
 *
 * Uses the scene's own pan formula, not `camera.centerOn`: the map camera has its origin at (0,0)
 * so Phaser centres about the wrong point, which is how the first cut of this photographed the
 * coast four times. The season is pinned too — a run left to itself lands on whatever the tick
 * count says, and winter's bare trees are the least inviting picture of the country.
 */
async function frameCapital(page, sceneKey, { zoom = 1.2, season, revealAll = false, hideUi = false, yNudge = 0 } = {}) {
  const at = await page.evaluate(({ sceneKey, zoom, season, revealAll, hideUi, yNudge }) => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene(sceneKey);
    const st = scene.state;
    if (hideUi) game.scene.getScene(sceneKey === 'ConquestScene' ? 'ConquestUIScene' : 'UIScene')?.scene.setVisible(false);
    if (revealAll) st.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
    if (season) st.season = season;
    scene.refresh();
    // The header prints the season too; make sure it agrees with the ground.
    const uiScene = game.scene.getScene(sceneKey === 'ConquestScene' ? 'ConquestUIScene' : 'UIScene');
    uiScene?.events.emit('state-changed');
    uiScene?.refresh?.();
    const capital = st.lands.find((l) => l.ownerId === 'dai-viet' && l.type === 'castle') ?? st.lands.find((l) => l.ownerId === 'dai-viet') ?? st.lands[0];
    // The citadel is drawn on the province's fortress hexes, which can be most of a province away
    // from the centroid the land node sits on — so aim at the seat the settlement renderer uses.
    const anchor = scene.getSettlementAnchor?.(capital) ?? { x: capital.x, y: capital.y };
    const wx = scene.wx(anchor.x);
    const wy = scene.wy(anchor.y) + yNudge;
    scene.setMapZoom(zoom);
    const cam = scene.cameras.main;
    // The scene sets no Phaser bounds any more (its own clamp is the right one for an origin-(0,0)
    // camera); this is a no-op kept so the framing stays correct against an older checkout.
    cam.removeBounds();
    const renderScale = cam.zoom / zoom;
    const designW = 390;
    const designH = cam.height / renderScale;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    cam.scrollX = clamp(wx - designW / (2 * zoom), 0, Math.max(0, scene.worldWidth - designW / zoom));
    cam.scrollY = clamp(wy - designH / (2 * zoom), 0, Math.max(0, scene.worldHeight - designH / zoom));
    return { sx: (wx - cam.scrollX) * zoom, sy: (wy - cam.scrollY) * zoom, designH, name: capital.name };
  }, { sceneKey, zoom, season, revealAll, hideUi, yNudge });
  await page.waitForTimeout(1600); // past the season cross-fade and the culling catch-up
  return at;
}

/** A square of `size` design units around the framed subject, kept on the sheet. */
function squareAround(at, size = 390) {
  const x = Math.max(0, Math.min(390 - size, at.sx - size / 2));
  const y = Math.max(0, Math.min(at.designH - size, at.sy - size / 2));
  return { x, y, width: size, height: size };
}

// ── 1 · the front page ──────────────────────────────────────────────────────────────────────────
console.log('menu');
let page = await newPage();
await toMenu(page);
await page.waitForTimeout(600);
const menuPng = await shot(page);   // only used in the banner — the front page needs no page of its own

// The coffee modal, for the Support section: the Wise tab with its drawn code.
await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').renderSupportModal('wise'));
await page.waitForTimeout(500);
const coffeePng = await shot(page);
await save('coffee', [coffeePng]);
await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').closeModal());

// ── 2 · Dragon Ascent: the map after a while, then the cards ────────────────────────────────────
console.log('dragon ascent');
await boot(page, 1337, 'ascent');
const founderPng = await shot(page);
await save('founder', [founderPng]);

const progress = await advanceAscent(page, 110);
console.log('   run:', JSON.stringify(progress));
const ascentFrame = await frameCapital(page, 'ConquestScene', { zoom: 1.2, season: 'Autumn', yNudge: 40 });
console.log('   framed on', ascentFrame.name, `at sheet ${Math.round(ascentFrame.sx)},${Math.round(ascentFrame.sy)}`);
const ascentMapPng = await shot(page);
await save('ascent-map', [ascentMapPng]);

// The power draft: the roguelite's card pick.
await page.evaluate(async () => {
  const st = window.__mandateState;
  const { offerPowerDraft } = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  st.ascent.pendingLevelUps = Math.max(1, st.ascent.pendingLevelUps ?? 0);
  offerPowerDraft(st);
  drainAscentPrompts(st);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await page.waitForTimeout(700);
const draftPng = await shot(page);
await save('power-draft', [draftPng]);

// Where do we press: the conquest card.
await page.evaluate(async () => {
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  const C = await import('/src/systems/ascent/ConquestSystem.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  C.offerConquestPrompt(st);
  drainAscentPrompts(st);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await page.waitForTimeout(700);
const conquerPng = await shot(page);
await save('conquer', [conquerPng]);

await page.close();

// ── 3 · a battle that opened itself ─────────────────────────────────────────────────────────────
console.log('battle');
page = await newPage();
await boot(page, 20260812, 'ascent');
const battle = await advanceAscent(page, 160, { stopOnBattle: true });
console.log('   run:', JSON.stringify(battle));
await page.waitForTimeout(1200);
const battlePng = await shot(page);
await save('battle', [battlePng]);
await page.close();

// ── 4 · the Chronicle: a story card, reached by a headless run handed to the real scene ──────────
console.log('chronicle');
page = await newPage();
await toMenu(page);
await page.evaluate(FIRST_CHOICE);
const story = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  let s = 20260816 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  let found = null;
  for (let i = 0; i < 400 && !found; i += 1) {
    advanceAscentTick(st);
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 8) {
      const p = st.pendingAscentPrompt;
      if (p.kind === 'story-beat') { found = { templateId: p.templateId, fragmentId: p.fragmentId }; break; }
      if (p.kind === 'run-over') break;
      resolveAscentPrompt(st, window.__firstChoice(p));
    }
  }
  window.__shotState = st;
  return { found, turn: st.turn };
});
console.log('   story:', JSON.stringify(story));
await page.evaluate(() => window.__phaserGame.scene.start('ConquestScene', { state: window.__shotState }));
await page.waitForTimeout(3000);
const chroniclePng = await shot(page);
await save('chronicle', [chroniclePng]);
await page.close();

// ── 5 · a classic mode: Throne of Empires on the hand-played map ────────────────────────────────
console.log('empire');
page = await newPage();
await boot(page, 1337, 'empire');
await page.evaluate(async () => {
  const st = window.__mandateState;
  const { advanceRealtimeMonth } = await import('/src/systems/RealtimeSystem.ts');
  let s = 20260818 >>> 0;   // pinned, like the ascent loop — an unpinned run lost the capital once
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 70; i += 1) {
    st.pendingCourtRequest = undefined; st.activePoliticsCard = undefined; st.pendingForeignCard = undefined;
    st.pendingHeroEvent = undefined; st.pendingThreatAlert = undefined; st.pendingBattle = undefined; st.isPaused = false;
    advanceRealtimeMonth(st);
  }
  window.__phaserGame.scene.getScene('MapScene').refresh();
  window.__phaserGame.scene.getScene('UIScene').refresh?.();
});
const empireFrame = await frameCapital(page, 'MapScene', { zoom: 1.15, season: 'Summer', yNudge: 40, revealAll: true });
console.log('   framed on', empireFrame.name, `at sheet ${Math.round(empireFrame.sx)},${Math.round(empireFrame.sy)}`);
// The UI plays a 1.7 s "Year N" plaque when it notices the year changed, and nine years just did.
await page.waitForTimeout(1500);
const empirePng = await shot(page);
await save('empire-map', [empirePng]);
await page.close();

// ── 6 · the four seasons, one square of the same country ────────────────────────────────────────
console.log('seasons');
page = await newPage();
await boot(page, 1337, 'rival');
await page.evaluate(() => { window.__mandateState.isPaused = true; });
const seasonPngs = [];
for (const season of ['Spring', 'Summer', 'Autumn', 'Winter']) {
  const at = await frameCapital(page, 'MapScene', { zoom: 1.35, season, revealAll: true, hideUi: true, yNudge: 30 });
  seasonPngs.push(await shot(page, squareAround(at)));
}
await save('seasons', seasonPngs, { gap: 24, scale: 0.5 });
await page.close();

// ── 7 · the three themes, same square ───────────────────────────────────────────────────────────
console.log('themes');
const themePngs = [];
for (const theme of ['dong-ho', 'ink-wash', 'illustrated-atlas']) {
  page = await newPage();
  await page.addInitScript((t) => localStorage.setItem('mandate:map-theme:v1', t), theme);
  await boot(page, 1337, 'rival');
  await page.evaluate(() => { window.__mandateState.isPaused = true; });
  const at = await frameCapital(page, 'MapScene', { zoom: 1.35, season: 'Autumn', revealAll: true, hideUi: true, yNudge: 30 });
  themePngs.push(await shot(page, squareAround(at)));
  await page.close();
}
await save('themes', themePngs, { gap: 24, scale: 0.5 });

// ── 8 · the banner: four screens in a row ───────────────────────────────────────────────────────
console.log('banner');
await save('banner', [menuPng, ascentMapPng, founderPng, battlePng], { gap: 28, scale: 0.5 });

await codec.close();
await browser.close();

console.log('\n=== WRITTEN ===');
for (const w of written) console.log(`${String(w.kb).padStart(5)} KB  ${w.path}`);
console.log(`total ${written.reduce((s, w) => s + w.kb, 0)} KB in ${written.length} files`);
console.log(errors.length ? `console errors:\n  ${errors.slice(0, 8).join('\n  ')}` : 'no console errors');
