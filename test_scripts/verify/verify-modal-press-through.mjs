/**
 * One press must act on one control — never on a second one that the first revealed.
 *
 * Reported as *sometimes clicking on a modal also clicks the bottom clickable item which is not
 * visible and covered by the modal* — on the front page, and on the pause sheet in a run. Two
 * structural causes, both confirmed in the engine source, and this harness reproduces each:
 *
 *  1. **The swallow silenced one scene.** `swallowRestOfPress` switched off the UI scene's input
 *     for the rest of the press. Phaser's `InputManager.updateInputPlugins` then simply carried the
 *     same release on to the next scene — the world scene under the sheet — whose scene-level
 *     `pointerup` (`enableMapDrag`) looked up, found the overlay already closed by the press, and
 *     selected the province under the Back button.
 *
 *  2. **Phaser sorts hits by *last frame's* render order.** `InputPlugin.sortGameObjects` ranks by
 *     `camera.renderList`, and an object created since the last render is not in it — it gets index
 *     0, the bottom. DOM input is dispatched synchronously (`InputManager.onMouseDown` runs the
 *     plugins on the event, not on the step), so a page or modal built *inside* a press handler
 *     loses the same gesture's release to whatever was rendered beneath it. `MenuScene` had no guard
 *     against this at all — no sheet registration, no swallow, no generation boundary — and every
 *     one of its links, tiles and tablets fires on the release.
 *
 * The events are dispatched on the canvas from inside the page, back to back in one task, so no
 * frame can render between the press and the release. That is the shape a WebView's duplicated
 * `pointerdown`+`mousedown`+`pointerup`+`mouseup` takes, and the shape of any tap that lands on a
 * heavy frame — which is why the report says *sometimes*.
 *
 * Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-modal-press-through.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
await page.waitForTimeout(1400);

/** Installed once in the page: a synchronous press+release on the canvas at design coordinates. */
await page.evaluate(() => {
  const canvas = window.__phaserGame.canvas;
  const toClient = (x, y) => {
    const rect = canvas.getBoundingClientRect();
    return { clientX: rect.left + (x / 390) * rect.width, clientY: rect.top + (y / 844) * rect.height };
  };
  const fire = (type, x, y) => {
    const at = toClient(x, y);
    canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mousedown' ? 1 : 0, ...at }));
  };
  // Down and up in the same task: nothing can render in between.
  window.__tap = (x, y) => { fire('mousedown', x, y); fire('mouseup', x, y); };
  window.__press = (x, y) => fire('mousedown', x, y);
  window.__release = (x, y) => fire('mouseup', x, y);
  window.__find = (scene, key, value) => {
    let found;
    const walk = (list) => {
      for (const obj of list) {
        if (found) return;
        if (obj.getData && obj.getData(key) !== undefined && (value === undefined || obj.getData(key) === value)) { found = obj; return; }
        if (obj.list) walk(obj.list);
      }
    };
    walk(scene.children.list);
    if (!found) return null;
    const b = found.getBounds();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  };
});

const results = {};

// ── A. The front page: a press that rebuilds the page under itself ─────────
//
// Back at the foot of any sub-page fires on the press and rebuilds the front page. The front page
// puts the support line in the same band, and its two phrases fire on the release.
results.menuPage = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  scene.mode = 'main';
  scene.render();
  await wait(150);
  const coffee = window.__find(scene, 'menuSupportLink', 'coffee');
  if (!coffee) return { skipped: 'no support link on the front page' };
  // The back bar's band: `GAME_HEIGHT - BACK_BAR_BAND` .. `+ BACK_BAR_HEIGHT` (InkUI).
  const { GAME_HEIGHT } = await import('/src/game/constants.ts');
  const { BACK_BAR_BAND, BACK_BAR_HEIGHT, BACK_BAR_WIDTH } = await import('/src/ui/InkUI.ts');
  const back = { x: (390 - BACK_BAR_WIDTH) / 2, y: GAME_HEIGHT - BACK_BAR_BAND, width: BACK_BAR_WIDTH, height: BACK_BAR_HEIGHT };
  // A point inside both rectangles, or the case cannot be staged on this sheet height.
  const x0 = Math.max(coffee.x, back.x); const x1 = Math.min(coffee.x + coffee.width, back.x + back.width);
  const y0 = Math.max(coffee.y, back.y); const y1 = Math.min(coffee.y + coffee.height, back.y + back.height);
  if (x1 - x0 < 6 || y1 - y0 < 4) return { skipped: `no overlap: link ${JSON.stringify(coffee)} back ${JSON.stringify(back)}` };
  const px = (x0 + x1) / 2; const py = (y0 + y1) / 2;

  scene.mode = 'dynasty';
  scene.render();
  await wait(200);
  const modalsBefore = scene.modalObjects.length;
  window.__tap(px, py);
  await wait(60);
  return {
    point: { x: Math.round(px), y: Math.round(py) },
    modeAfter: scene.mode,
    modalOpened: scene.modalObjects.length > modalsBefore,
  };
});
await page.evaluate(() => { const s = window.__phaserGame.scene.getScene('MenuScene'); s.closeModal?.(); s.mode = 'main'; s.render(); });
await page.waitForTimeout(150);

// ── B. The front page: a modal opened by the press, released over the tablet under it ──
results.menuModal = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const tablet = window.__find(scene, 'menuTablet', 'dynasty');
  if (!tablet) return { skipped: 'no dynasty tablet on the front page' };
  const px = tablet.x + tablet.width / 2; const py = tablet.y + tablet.height / 2;
  // Open the sheet and, in the same task, press and release over the tablet beneath it — the
  // way a press that opens a modal is followed by its own duplicated release.
  scene.renderSupportModal();
  const opened = scene.modalObjects.length > 0;
  window.__tap(px, py);
  await wait(60);
  return { opened, modeAfter: scene.mode, modalStillOpen: scene.modalObjects.length > 0 };
});
await page.evaluate(() => { const s = window.__phaserGame.scene.getScene('MenuScene'); s.closeModal?.(); s.mode = 'main'; s.render(); });

// ── C. A run: the pause sheet's Back over a province ────────────────────────
results.conquest = await page.evaluate(async () => {
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const game = window.__phaserGame;
  const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  game.scene.stop('MenuScene');
  game.scene.start('ConquestScene', { state });
  await wait(1200);
  const map = game.scene.getScene('ConquestScene');
  const ui = game.scene.getScene('ConquestUIScene');
  if (!map || !ui) return { fatal: 'scenes did not start' };
  for (let g = 0; g < 8 && state.pendingAscentPrompt; g += 1) {
    const p = state.pendingAscentPrompt;
    resolveAscentPrompt(state, p.options?.[0]?.id ?? p.options?.[0] ?? 'ok');
  }
  state.pendingAscentPrompt = undefined;
  if (state.ascent) state.ascent.promptQueue = [];
  ui.closeOverlay();
  await wait(250);
  window.__suppressMapInputUntil = 0;
  state.selectedLandId = undefined;

  ui.showSystemMenu();
  await wait(250);
  // The first button on the sheet is Back. Its container sits at the sheet's content origin.
  const back = ui.modalLayer.list.find((o) => o.type === 'Container' && o.list?.some((c) => c.input));
  if (!back) return { fatal: 'no Back item on the sheet' };
  const b = back.getBounds();
  const px = b.x + b.width / 2; const py = b.y + b.height / 2;
  // Put a province under that point, so a leaked tap has something to select.
  //
  // `ConquestScene.resolveTapLand` answers a name plate first and the ground only where the
  // province's plate is not on the screen — so the camera is walked over a few offsets around each
  // province until the point resolves to *some* land, rather than assumed to.
  const cam = map.cameras.main;
  const zoom = map.mapZoom ?? cam.zoom;
  let under = null;
  const offsets = [[0, 0], [0, 60], [0, -60], [60, 0], [-60, 0], [45, 45], [-45, -45], [0, 110], [0, -110]];
  outer:
  for (const land of state.lands) {
    for (const [dx, dy] of offsets) {
      cam.scrollX = map.wx(land.x) + dx - px / zoom;
      cam.scrollY = map.wy(land.y) + dy - py / zoom;
      const hit = map.resolveTapLand(cam.scrollX + px / zoom, cam.scrollY + py / zoom);
      if (hit) { under = hit; break outer; }
    }
  }
  // The sheet pauses the world; the map still moves under it, which is all the staging needs.
  await wait(120);

  const keyBefore = ui.openPromptKey;
  const pauseBefore = state.isStrategyPause;
  window.__tap(px, py);
  await wait(80);
  return {
    point: { x: Math.round(px), y: Math.round(py) },
    landUnder: under ?? null,
    keyBefore,
    keyAfter: ui.openPromptKey,
    pendingKind: state.pendingAscentPrompt?.kind ?? null,
    // Back hands the clock back to whatever it was before the sheet opened — the surest sign the
    // press reached it, whatever a later card did to `openPromptKey`.
    backFired: pauseBefore === true && state.isStrategyPause === false,
    sheetClosed: ui.openPromptKey !== keyBefore,
    selectedAfter: state.selectedLandId ?? null,
  };
});

await browser.close();

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

console.log('=== A. FRONT PAGE: BACK REBUILDS THE PAGE UNDER THE PRESS ===');
if (results.menuPage.skipped) console.log(`  skipped: ${results.menuPage.skipped}`);
else {
  console.log(`  pressed Back at ${JSON.stringify(results.menuPage.point)}; mode after: ${results.menuPage.modeAfter}`);
  check('Back returns to the front page', results.menuPage.modeAfter === 'main');
  check('and the release does not open the support sheet underneath', results.menuPage.modalOpened === false,
    results.menuPage.modalOpened ? 'the support modal opened from the same press' : 'nothing else fired');
}

console.log('\n=== B. FRONT PAGE: A MODAL OPENED UNDER THE PRESS ===');
if (results.menuModal.skipped) console.log(`  skipped: ${results.menuModal.skipped}`);
else {
  check('the support sheet opened', results.menuModal.opened);
  check('a press on the sheet does not reach the tablet beneath it', results.menuModal.modeAfter === 'main',
    `mode after: ${results.menuModal.modeAfter}`);
  check('and the sheet is still up', results.menuModal.modalStillOpen);
}

console.log('\n=== C. A RUN: THE PAUSE SHEET\'S BACK OVER A PROVINCE ===');
if (results.conquest.fatal) check(results.conquest.fatal, false);
else {
  console.log(`  Back at ${JSON.stringify(results.conquest.point)}, province under it: ${results.conquest.landUnder}`);
  console.log(`  overlay key ${results.conquest.keyBefore} -> ${results.conquest.keyAfter}; pending card after: ${results.conquest.pendingKind}`);
  check('the case is staged: a province lies under the button', Boolean(results.conquest.landUnder));
  check('Back fires on the press', results.conquest.backFired || results.conquest.sheetClosed,
    results.conquest.backFired ? 'the clock was handed back' : `overlay key is now ${results.conquest.keyAfter}`);
  check('and the release does not select the province behind it', results.conquest.selectedAfter === null,
    results.conquest.selectedAfter ? `selected ${results.conquest.selectedAfter}` : 'nothing selected');
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: one press, one control' : 'FAIL: see above');
process.exit(failed.length === 0 ? 0 : 1);
