/**
 * The README's pictures, produced from the live game so they never drift from it.
 *
 * Every image under docs/readme/ comes out of this script: portrait shots of the screens that
 * explain the game, a four-season strip, a three-theme strip, a row of champion portraits, and the
 * wide banner. Screenshots are taken as PNG and re-encoded to WebP *inside Chromium* — this
 * machine has no image tools, and a 2× PNG of the sheet weighs 1.1 MB where the WebP weighs a
 * tenth of that. Strips are composed the same way, on a canvas, with transparent gutters so they
 * sit on GitHub's light and dark pages alike.
 *
 *   DEV_URL=http://127.0.0.1:5199 node test_scripts/shot/shot-readme.mjs [section...]
 *
 * Sections: menu ascent battle chronicle empire seasons themes skirmish history portraits banner.
 * With no arguments every section runs. `banner` composes frames taken by `menu`, `ascent` and
 * `battle`, so it only runs when those three ran in the same invocation.
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'docs/readme';
const QUALITY = 0.82;
const ONLY = process.argv.slice(2);
const want = (name) => ONLY.length === 0 || ONLY.includes(name);
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
    // The default tier is medium on every device; the dense bake and the live settlement band are
    // behind `high`. A README picture is the one place the game is judged on a machine that can
    // afford them, so the pictures are taken the way the game looks at its best.
    localStorage.setItem('mandate:graphics:v1', 'high');
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
 *
 * `battleAfter` lets the early fights resolve themselves and stops on the first that opens at or
 * past that tick: the fight a run meets at turn 15 is two unled militia hosts in a bare winter,
 * and the one it meets at turn 130 has a commander, a reserve, and a summer field worth looking at.
 */
async function advanceAscent(page, ticks, { stopOnBattle = false, battleAfter = 0, seed = 20260818 } = {}) {
  await page.evaluate(FIRST_CHOICE);
  return page.evaluate(async ({ ticks, stopOnBattle, battleAfter, seed }) => {
    const st = window.__mandateState;
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    // A map picture wants the map, not the battle screen a fight opens over it. The battle shot
    // is the one run that wants that screen; every other run lets its generals fight.
    st.ascent.autoResolveBattles = !stopOnBattle || battleAfter > 0;
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let t = 0;
    for (; t < ticks; t += 1) {
      if (stopOnBattle && t >= battleAfter) st.ascent.autoResolveBattles = false;
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
      // The wave director raises its start/end banner cues into state and the UI drains them on
      // the next refresh — a 150-tick run leaves up to three queued, and the first regeneration
      // after the banner shipped photographed "INVASION 6 BROKEN" instead of the country. Cleared
      // here, inside the same synchronous evaluate, so the scene never sees them.
      if (st.ascent.waveCues) st.ascent.waveCues = [];
      ui.waveCueQueue = [];
      if (ui.waveBanner) {
        try { ui.waveBanner.destroy(); } catch { /* already gone */ }
        ui.waveBanner = undefined;
      }
      try { ui.closeOverlay?.(); ui.closeLane?.(); } catch { /* nothing open */ }
      // Whatever held the world during the run — a banner's end-plate, a system prompt, a lane
      // closer restoring the hold it remembered — the photograph wants a running realm: both
      // pause flags off (each prints a PAUSED plate and swaps the action bar to Resume), and the
      // tick accumulator sunk so the clock stays quiet through the framing waits anyway.
      st.isPaused = false;
      st.isStrategyPause = false;
      world.ascentAccumulator = -1e9;
    } else {
      // The battle owns the screen; anything else that came up in the same tick is answered so
      // no story card sits over the field. The hold here can be the honest one — the battle
      // screen covers the map HUD, so no plate shows.
      let g = 0;
      while (st.pendingAscentPrompt && st.pendingAscentPrompt.kind !== 'run-over' && g++ < 12) {
        resolveAscentPrompt(st, window.__firstChoice(st.pendingAscentPrompt));
      }
      st.ascent.promptQueue = st.ascent.promptQueue.filter((p) => p.kind === 'run-over');
      st.isStrategyPause = true;
    }
    // Answering a story beat *publishes* its ledger — the "what changed · Noted" card — into
    // `lastStoryOutcome`, a slot of its own that clearing the prompt queue does not touch. Three
    // regenerations in a row photographed The Reed Banner's receipts instead of the country
    // before this line existed.
    st.lastStoryOutcome = undefined;
    world.refresh();
    ui.events.emit('state-changed');
    const capital = st.lands.find((l) => l.type === 'castle' && l.ownerId === 'dai-viet');
    return { turn: st.turn, wave: st.ascent.wave, lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length, capitalHeld: Boolean(capital), battle: Boolean(st.ascent.activeBattle) };
  }, { ticks, stopOnBattle, battleAfter, seed });
}

const shot = (page, clip) => page.screenshot(clip ? { clip } : {});

/**
 * Parks the world camera on a province and says where on the sheet it landed. The player's
 * capital unless `landId` names another — the seasons strip wants a paddy country, and on this
 * map the capital sits in a mountain pass where nothing floods and nothing ripens.
 *
 * Uses the scene's own pan formula, not `camera.centerOn`: the map camera has its origin at (0,0)
 * so Phaser centres about the wrong point, which is how the first cut of this photographed the
 * coast four times. The season is pinned too — a run left to itself lands on whatever the tick
 * count says, and winter's bare trees are the least inviting picture of the country.
 */
async function frameCapital(page, sceneKey, { zoom = 1.2, season, revealAll = false, hideUi = false, yNudge = 0, landId, own = false } = {}) {
  const at = await page.evaluate(({ sceneKey, zoom, season, revealAll, hideUi, yNudge, landId, own }) => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene(sceneKey);
    const st = scene.state;
    if (hideUi) game.scene.getScene(sceneKey === 'ConquestScene' ? 'ConquestUIScene' : 'UIScene')?.scene.setVisible(false);
    if (revealAll) st.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
    if (season) st.season = season;
    const capital = (landId ? st.lands.find((l) => l.id === landId) : undefined)
      ?? st.lands.find((l) => l.ownerId === 'dai-viet' && l.type === 'castle')
      ?? st.lands.find((l) => l.ownerId === 'dai-viet') ?? st.lands[0];
    // A neutral province draws washed toward the paper; the strip wants the country at full
    // pigment, so the framed land is taken into the realm for the length of the photograph.
    if (own) capital.ownerId = 'dai-viet';
    scene.refresh();
    // The header prints the season too; make sure it agrees with the ground.
    const uiScene = game.scene.getScene(sceneKey === 'ConquestScene' ? 'ConquestUIScene' : 'UIScene');
    uiScene?.events.emit('state-changed');
    uiScene?.refresh?.();
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
  }, { sceneKey, zoom, season, revealAll, hideUi, yNudge, landId, own });
  await page.waitForTimeout(1600); // past the season cross-fade and the culling catch-up
  return at;
}

/** A square of `size` design units around the framed subject, kept on the sheet. */
function squareAround(at, size = 390) {
  const x = Math.max(0, Math.min(390 - size, at.sx - size / 2));
  const y = Math.max(0, Math.min(at.designH - size, at.sy - size / 2));
  return { x, y, width: size, height: size };
}

// The paddy country the seasons and themes strips are shot over: a river, a hamlet, and plots in
// every direction on the seed-1337 rival map. Chosen from a contact sheet of every farm province —
// the capital of this map sits in a mountain pass, which photographs the same in June and January.
const SEASONS_LAND = 'district-02';

let menuPng, ascentMapPng, founderPng, battlePng;

// ── 1 · the front page ──────────────────────────────────────────────────────────────────────────
if (want('menu')) {
  console.log('menu');
  const page = await newPage();
  await toMenu(page);
  await page.waitForTimeout(600);
  menuPng = await shot(page);   // only used in the banner — the front page needs no page of its own

  // The Support section shows the Wise code on its own — the same code the game draws, rendered by
  // the game's own encoder so the README can never disagree with the modal. PNG, not WebP: a code
  // is flat black on white and lossless is both smaller and safer for a scanner.
  const wiseQr = await page.evaluate(async () => {
    const [{ encodeQr }, { SUPPORT }] = await Promise.all([import('/src/utils/qr.ts'), import('/src/data/support.ts')]);
    const link = SUPPORT.channels.find((c) => c.id === 'wise')?.link;
    if (!link) return null;
    const matrix = encodeQr(link, 'M');
    const scale = 10;
    const quiet = 4;
    const px = (matrix.size + quiet * 2) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#2a2118';
    for (let y = 0; y < matrix.size; y += 1) for (let x = 0; x < matrix.size; x += 1) if (matrix.modules[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    return { link, dataUrl: canvas.toDataURL('image/png') };
  });
  if (wiseQr) {
    const path = `${OUT}/qr-wise.png`;
    writeFileSync(path, Buffer.from(wiseQr.dataUrl.split(',')[1], 'base64'));
    written.push({ path, kb: Math.round(statSync(path).size / 1024) });
    console.log(`   ${path}  ${written.at(-1).kb} KB  (${wiseQr.link})`);
  }
  await page.close();
}

// ── 2 · Dragon Ascent: the map after a while, then the cards ────────────────────────────────────
if (want('ascent')) {
  console.log('dragon ascent');
  const page = await newPage();
  // Seeds by audition, not accident: on boot 1337 the autopilot stalls at two provinces however
  // long it runs, and a roguelite about expansion should be photographed expanding. This pair
  // holds twenty-odd provinces by turn 150 with the capital still standing.
  await boot(page, 20260825, 'ascent');
  founderPng = await shot(page);
  await save('founder', [founderPng]);

  const progress = await advanceAscent(page, 150, { seed: 31337 });
  console.log('   run:', JSON.stringify(progress));
  const ascentFrame = await frameCapital(page, 'ConquestScene', { zoom: 1.2, season: 'Autumn', yNudge: 40 });
  console.log('   framed on', ascentFrame.name, `at sheet ${Math.round(ascentFrame.sx)},${Math.round(ascentFrame.sy)}`);
  ascentMapPng = await shot(page);
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
}

// ── 3 · a battle that opened itself ─────────────────────────────────────────────────────────────
if (want('battle')) {
  console.log('battle');
  const page = await newPage();
  await boot(page, 1337, 'ascent');
  // Not the first fight of the run: `battleAfter` lets the early scuffles resolve themselves and
  // takes the one that opens past turn 120 — a led host, a reserve to commit, a summer field.
  const battle = await advanceAscent(page, 400, { stopOnBattle: true, battleAfter: 120, seed: 20260825 });
  console.log('   run:', JSON.stringify(battle));
  await page.waitForTimeout(1200);
  battlePng = await shot(page);
  await save('battle', [battlePng]);
  await page.close();
}

// ── 4 · the Chronicle: a story card, reached by a headless run handed to the real scene ──────────
if (want('chronicle')) {
  console.log('chronicle');
  const page = await newPage();
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
}

// ── 5 · a classic mode: Throne of Empires on the hand-played map ────────────────────────────────
if (want('empire')) {
  console.log('empire');
  const page = await newPage();
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
}

// ── 6 · the four seasons, one square of the same country ────────────────────────────────────────
if (want('seasons')) {
  console.log('seasons');
  const page = await newPage();
  await boot(page, 1337, 'rival');
  await page.evaluate(() => { window.__mandateState.isPaused = true; });
  const seasonPngs = [];
  for (const season of ['Spring', 'Summer', 'Autumn', 'Winter']) {
    const at = await frameCapital(page, 'MapScene', { zoom: 1.35, season, revealAll: true, hideUi: true, yNudge: 30, landId: SEASONS_LAND, own: true });
    seasonPngs.push(await shot(page, squareAround(at)));
  }
  await save('seasons', seasonPngs, { gap: 24, scale: 0.5 });
  await page.close();
}

// ── 7 · the three themes, same square ───────────────────────────────────────────────────────────
if (want('themes')) {
  console.log('themes');
  const themePngs = [];
  for (const theme of ['dong-ho', 'ink-wash', 'illustrated-atlas']) {
    const page = await newPage();
    await page.addInitScript((t) => localStorage.setItem('mandate:map-theme:v1', t), theme);
    await boot(page, 1337, 'rival');
    await page.evaluate(() => { window.__mandateState.isPaused = true; });
    const at = await frameCapital(page, 'MapScene', { zoom: 1.35, season: 'Autumn', revealAll: true, hideUi: true, yNudge: 30, landId: SEASONS_LAND, own: true });
    themePngs.push(await shot(page, squareAround(at)));
    await page.close();
  }
  await save('themes', themePngs, { gap: 24, scale: 0.5 });
}

// ── 8 · Skirmish: the muster form ───────────────────────────────────────────────────────────────
if (want('skirmish')) {
  console.log('skirmish');
  const page = await newPage();
  await toMenu(page);
  await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').scene.start('BattleArenaScene'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('BattleArenaScene'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await save('skirmish', [await shot(page)]);
  await page.close();
}

// ── 9 · the History page, reached by its real button ────────────────────────────────────────────
if (want('history')) {
  console.log('history');
  const page = await newPage();
  await toMenu(page);
  // Polled, not sampled once: the front page builds its diorama over a second or so and the
  // button is not in `children.list` until it does.
  const at = await page.waitForFunction(() => {
    const s = window.__phaserGame.scene.getScene('MenuScene');
    for (const c of s.children.list) {
      const label = c.list?.find?.((k) => k.type === 'Text');
      if (label && /Lịch sử|History/.test(label.text)) {
        const m = label.getWorldTransformMatrix();
        return { x: m.tx, y: m.ty };
      }
    }
    return null;
  }, null, { timeout: 15000 }).then((h) => h.jsonValue());
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('HistoryScene'), null, { timeout: 8000 });
  await page.waitForTimeout(900);
  // The figures tab: real people with their portraits, which is the page's whole argument.
  const SIDE = 12;
  const tabWidth = Math.floor((390 - SIDE * 2 - 4 * 4) / 5);
  await page.mouse.click(SIDE + 1 * (tabWidth + 4) + tabWidth / 2, 84);
  await page.waitForTimeout(600);
  await save('history', [await shot(page)]);
  await page.close();
}

// ── 10 · a row of champions: who a portrait is, before the seed draws it ────────────────────────
if (want('portraits')) {
  console.log('portraits');
  const page = await newPage();
  await boot(page, 1337, 'ascent');
  const rows = [];
  for (const half of [0, 1]) {
    const rowH = await page.evaluate(async ({ half }) => {
      const { renderHeroFace, HERO_FACE_W } = await import('/src/ui/FaceRenderer.ts');
      const { heroTemplates } = await import('/src/data/heroes.ts');
      const { UI_FONT } = await import('/src/ui/fonts.ts');
      // Ten from the roster, one man and one woman from every era the wardrobe knows, so the row
      // itself says what the caption claims: era, office and sex decide the clothes. Templates
      // are keyed by `id` — the first cut deduplicated on a field they don't have, and a set
      // holding one `undefined` vetoed every candidate after the first.
      const SPEC = [
        ['dinh', 'man'], ['ly', 'woman'], ['tran', 'man'], ['le', 'woman'], ['tayson', 'man'],
        ['nguyen', 'woman'], ['tran', 'woman'], ['le', 'man'], ['ly', 'man'], ['nguyen', 'man'],
      ];
      const used = new Set();
      const pick = (era, sex) => {
        const hero = heroTemplates.find((h) => h.era === era && h.sex === sex && !used.has(h.id))
          ?? heroTemplates.find((h) => h.era === era && !used.has(h.id));
        if (hero) used.add(hero.id);
        return hero;
      };
      const picks = SPEC.map(([era, sex]) => pick(era, sex)).filter(Boolean).slice(0, 10);
      const row = picks.slice(half * 5, half * 5 + 5);
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      scene.children.removeAll(true);
      const cellW = 390 / 5;
      const scale = (cellW - 10) / HERO_FACE_W;
      // The frame the renderer draws is bigger than the bare face extents (a border, a pin), so
      // the row is laid out from measured bounds rather than a guessed anchor — the guess put
      // every caption across the chin.
      const faces = row.map((hero, i) => {
        const face = renderHeroFace(scene, hero, i * cellW + cellW / 2, 0, scale);
        scene.add.existing(face);
        return { hero, face };
      });
      let bottom = 0;
      for (const { face } of faces) {
        const b = face.getBounds();
        face.y = 8 - b.top;
        bottom = Math.max(bottom, 8 + b.height);
      }
      const rowH = Math.ceil(bottom + 24);
      scene.add.graphics().fillStyle(0xe8ddc4, 1).fillRect(0, 0, 390, rowH).setDepth(-1);
      faces.forEach(({ hero }, i) => {
        scene.add.text(i * cellW + cellW / 2, bottom + 5, hero.name, {
          fontFamily: UI_FONT, fontSize: '9px', fontStyle: '600', color: '#2a2118', align: 'center',
        }).setOrigin(0.5, 0);
      });
      return rowH;
    }, { half });
    await page.waitForTimeout(400);
    rows.push(await shot(page, { x: 0, y: 0, width: 390, height: rowH }));
  }
  await save('portraits', rows, { gap: 16 });
  await page.close();
}

// ── 11 · the banner: four screens in a row ──────────────────────────────────────────────────────
if (want('banner')) {
  if (menuPng && ascentMapPng && founderPng && battlePng) {
    console.log('banner');
    await save('banner', [menuPng, ascentMapPng, founderPng, battlePng], { gap: 28, scale: 0.5 });
  } else {
    console.log('banner skipped — needs menu, ascent and battle in the same run');
  }
}

await codec.close();
await browser.close();

console.log('\n=== WRITTEN ===');
for (const w of written) console.log(`${String(w.kb).padStart(5)} KB  ${w.path}`);
console.log(`total ${written.reduce((s, w) => s + w.kb, 0)} KB in ${written.length} files`);
console.log(errors.length ? `console errors:\n  ${errors.slice(0, 8).join('\n  ')}` : 'no console errors');
