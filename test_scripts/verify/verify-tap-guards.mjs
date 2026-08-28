/**
 * The map's tap handler, and the three ways it was answering taps that were not for it.
 *
 * `MapScene` listens on the **canvas element** rather than through Phaser's display list, so
 * nothing drawn over it in another scene can consume a press. Everything that must not reach the
 * map therefore has to be declared in `isScreenPointOverFixedUi`, and anything the guard does not
 * know about is a tap that silently does two things at once. All three faults below were reported
 * by hand before they were ever measured, which is what that blind spot costs.
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
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

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { renderActionBar } = await import('/src/scenes/conquest/shell.ts');
  const game = window.__phaserGame;
  const r = {};

  // Boot the mode for real: the guard reads live scene state, so a synthetic scene would prove
  // nothing about the thing that was broken.
  const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  game.scene.stop('MenuScene');
  game.scene.start('ConquestScene', { state });
  await new Promise((done) => setTimeout(done, 1200));

  const map = game.scene.getScene('ConquestScene');
  const ui = game.scene.getScene('ConquestUIScene');
  if (!map || !ui) return { fatal: 'scenes did not start' };

  // The guard is `protected`; reached the way the handler reaches it.
  const guard = (x, y) => map.isScreenPointOverFixedUi(x, y);
  const MID_Y = 400; // open map, below the HUD and above the inspect card

  // A fresh run opens on the mandate and the founding, and the boot stamps a suppression window.
  // Both make the guard say "not for the map", correctly — and both would be measured here as the
  // fix working when it is only the opening sequence.
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  for (let g = 0; g < 6 && state.pendingAscentPrompt; g += 1) {
    const p = state.pendingAscentPrompt;
    resolveAscentPrompt(state, p.options?.[0]?.id ?? p.options?.[0] ?? 'ok');
  }
  state.pendingAscentPrompt = undefined;
  if (state.ascent) state.ascent.promptQueue = [];
  ui.closeOverlay();
  window.__suppressMapInputUntil = 0;
  await new Promise((done) => setTimeout(done, 250));
  window.__suppressMapInputUntil = 0;

  // ── 1. A sheet over the map means the map hears nothing ──────────────────
  const openBefore = guard(200, MID_Y);
  ui.beginOverlay('probe');
  // `beginOverlay` claims the layer; a real sheet then draws into it, which is the second half of
  // what the guard believes. Stand something in for the furniture.
  ui.modalLayer.add(ui.add.rectangle(0, 0, 10, 10, 0x000000, 0));
  const openDuring = guard(200, MID_Y);
  const alsoOverTheCentre = guard(195, 300) && guard(60, 500);
  ui.closeOverlay();
  await new Promise((done) => setTimeout(done, 200));
  const openAfter = guard(200, MID_Y);

  r.overlay = {
    quietBefore: openBefore === false,
    deafDuring: openDuring === true,
    everywhere: alsoOverTheCentre === true,
    hearsAgainAfter: openAfter === false,
  };

  // ── 2. A key left set with nothing drawn must not lock the map ───────────
  ui.openPromptKey = 'stuck';
  ui.modalLayer.removeAll(true);
  r.stuckKey = { stillHears: guard(200, MID_Y) === false };
  ui.openPromptKey = '';

  // ── 3. A tap on open ground puts the inspect card away ───────────────────
  const owned = state.lands.find((l) => l.ownerId === 'dai-viet');
  state.selectedLandId = owned.id;
  const selectedBefore = state.selectedLandId;
  map.deselectLand();
  r.dismiss = {
    wasSelected: Boolean(selectedBefore),
    clearedByEmptyTap: state.selectedLandId === undefined,
    // And an idle tap with nothing selected does not repaint the world for nothing.
    idleIsCheap: (() => {
      let refreshes = 0;
      const real = map.refresh.bind(map);
      map.refresh = () => { refreshes += 1; real(); };
      map.deselectLand();
      map.refresh = real;
      return refreshes === 0;
    })(),
  };

  // ── 4. One press may not act on a control built by that same press ──────
  //
  // The critical report: *modal has a Close button — click it — also clicks the menu behind.*
  // `InkUI.button` acts on the press, so closing happens on `pointerdown`; the release of that
  // same press is then delivered to whatever the close has just built underneath, and rows, lanes
  // and strips all act on the release. Nothing about it is a hit-test fault — at the moment of
  // the release the sheet is gone.
  // ── 5. Chrome hidden under a sheet is switched off, not merely invisible ─
  //
  // The mechanical root cause of *"click Close in the modal, also click the bottom bar"*. Phaser 4
  // sets a container child's `displayList` to null and `willRender` never consults
  // `parentContainer`, so `setVisible(false)` on a container hides it and leaves every hit area
  // live. Measured before the fix, with a lane open: the action bar reported `visible: false` and
  // **8 of 8 hit areas still enabled**, directly under where the sheet draws its footer.
  {
    const liveIn = (root) => {
      let live = 0; let total = 0;
      const walk = (c) => {
        for (const o of c.list ?? []) {
          if (o.input) { total += 1; if (o.input.enabled) live += 1; }
          if (o.list) walk(o);
        }
      };
      walk(root);
      return { live, total };
    };
    const openMap = liveIn(ui.actionBar);
    ui.beginOverlay('probe-chrome');
    ui.modalLayer.add(ui.add.rectangle(0, 0, 10, 10, 0x000000, 0));
    renderActionBar(ui);
    const underSheet = liveIn(ui.actionBar);
    ui.closeOverlay();
    await new Promise((done) => setTimeout(done, 200));
    renderActionBar(ui);
    const afterwards = liveIn(ui.actionBar);
    r.chrome = {
      openMap, underSheet, afterwards,
      liveWithMap: openMap.total > 0 && openMap.live === openMap.total,
      deadUnderSheet: underSheet.live === 0,
      liveAgainAfter: afterwards.live === afterwards.total,
    };
  }

  // ── 6. The name plate is the same size under the thumb at any zoom ───────
  const landId = [...map.landLabels.keys()].find((id) => map.hasVisibleLabel(id));
  if (landId) {
    // `mapZoom` is a getter over `cameras.main.zoom`; assigning to it is a silent no-op, which is
    // how the first version of this check measured the same zoom twice and called it a failure.
    const was = map.cameras.main.zoom;
    const at = (zoom) => {
      map.setMapZoom(zoom);
      const rect = map.labelWorldRect(landId);
      // World units x zoom = pixels on the glass, which is what the finger is aiming at.
      return { zoom: map.mapZoom, w: Math.round(rect.width * map.mapZoom), h: Math.round(rect.height * map.mapZoom) };
    };
    const near = at(1);
    const far = at(0.5);
    map.cameras.main.setZoom(was);
    r.plate = {
      near, far,
      // The plate's own ink shrinks with the map; only the forgiveness around it is held constant,
      // so the target does shrink — but by far less than the 2x the zoom would otherwise take.
      holdsUp: far.h > near.h * 0.72,
      padHeldConstant: Math.abs((far.h - near.h * 0.5) - 16) < 6,
    };
  } else {
    r.plate = { holdsUp: false, padHeldConstant: false, reason: 'no visible label' };
  }

  return r;
});

const checks = out.fatal ? { [out.fatal]: false } : {
  'the map hears an ordinary tap': out.overlay.quietBefore,
  'a sheet over the map makes it deaf': out.overlay.deafDuring,
  'everywhere under the sheet, not just one band': out.overlay.everywhere,
  'and it hears again once the sheet closes': out.overlay.hearsAgainAfter,
  'a stale key with nothing drawn cannot lock the map': out.stuckKey.stillHears,
  'a tap on open ground clears the selection': out.dismiss.clearedByEmptyTap,
  'and an idle tap repaints nothing': out.dismiss.idleIsCheap,
  'the bottom bar is pressable with the map showing': out.chrome.liveWithMap,
  'and every one of its hit areas is DEAD under a sheet': out.chrome.deadUnderSheet,
  'and live again once the sheet closes': out.chrome.liveAgainAfter,
  'the name plate holds its size under the thumb when zoomed out': out.plate.holdsUp,
  'because the padding is screen pixels, not world units': out.plate.padHeldConstant,
  'no console errors': errors.length === 0,
};

const fails = [];
for (const [label, ok] of Object.entries(checks)) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) fails.push(label);
}
console.log('\n' + JSON.stringify(out, null, 1));
if (errors.length) console.log('\nERRORS\n' + errors.slice(0, 5).join('\n'));

await browser.close();
console.log(fails.length === 0
  ? '\nPASS: a sheet takes the whole screen, open ground dismisses, and the plate is a thumb-sized target'
  : `\nFAIL: ${fails.length} check(s) — ${fails.join(' | ')}`);
process.exit(fails.length === 0 ? 0 : 1);
