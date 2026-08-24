/**
 * The lifecycle gate: scene-event listeners must not stack across runs.
 *
 * Phaser clears a scene's `events` emitter only on `destroy`, never on `shutdown`, and this
 * game's scene instances are reused across runs — so before the M0 fixes, every `create()`
 * added another copy of every handler. Measured: after three runs each tick rebuilt the HUD
 * three times and every land action ran three times; `ui:restart-ascent` restarted the scene
 * that registers it, so restarts multiplied geometrically.
 *
 * Also pinned here: the battle clock must die with its lane (the tick used to re-arm itself
 * after `stopBattleClock` removed the stored handle), and an army's march tween — whose target
 * is a plain `{t}` counter no marker-keyed kill can reach — must stop when the army goes.
 */
import { boot, startWorld, FIRST_OPTION, report } from '../perf/_boot.mjs';

const { browser, page, errors } = await boot({ dpr: 1, quality: 'low' });
const checks = [];

// ── Listener counts across two Ascent runs ──────────────────────────────────
await startWorld(page, { mode: 'ascent', seed: 1337 });
await startWorld(page, { mode: 'ascent', seed: 1337 });

const UI_KEYS = [
  'ui:land-action', 'ui:hero-pick', 'ui:hero-mission', 'ui:hero-ability', 'ui:hero-event-choice',
  'ui:politics-choice', 'ui:foreign-choice', 'ui:battle-decision', 'ui:attack-land', 'ui:retreat-siege',
  'ui:create-army', 'ui:disband-army', 'ui:zoom-map', 'ui:toggle-render-mode', 'ui:save-snapshot',
  'ui:exit-to-menu', 'ui:pan-camera', 'ui:clear-selection',
  'ui:restart-ascent', 'ui:ascent-choice', 'ui:ascent-reroll', 'ui:ascent-conquer', 'ui:ascent-envoy',
  'ui:ascent-appoint', 'ui:arena-leave', 'ui:battle-moment', 'ui:battle-order',
  'ui:ascent-army-orders', 'ui:ascent-army-recall', 'ui:ascent-army-resupply', 'ui:ascent-disband-army',
  'ui:ascent-raise-host', 'ui:ascent-assign', 'ui:ascent-law',
];
const counts = await page.evaluate((keys) => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const bad = {};
  for (const key of keys) {
    const n = ui.events.listenerCount(key);
    if (n !== 1) bad[key] = n;
  }
  return { stateChanged: ui.events.listenerCount('state-changed'), bad };
}, UI_KEYS);
checks.push(['state-changed has exactly one listener after two runs', counts.stateChanged === 1, `got ${counts.stateChanged}`]);
checks.push(['every ui:* key has exactly one listener after two runs',
  Object.keys(counts.bad).length === 0, JSON.stringify(counts.bad)]);

// ── One restart fires once, and UPDATE listeners stay flat ──────────────────
const restart = await page.evaluate(async () => {
  const game = window.__phaserGame;
  const ui = game.scene.getScene('ConquestUIScene');
  const before = ui.events.listenerCount('update');
  const stateBefore = window.__mandateState;
  ui.events.emit('ui:restart-ascent');
  await new Promise((resolve) => setTimeout(resolve, 800));
  const world = game.scene.getScene('ConquestScene');
  return {
    updateBefore: before,
    updateAfter: ui.events.listenerCount('update'),
    changed: world.state !== stateBefore,
    stateChanged: ui.events.listenerCount('state-changed'),
    restartCount: ui.events.listenerCount('ui:restart-ascent'),
  };
});
checks.push(['restart produced a fresh run (state replaced once)', restart.changed, '']);
checks.push(['UPDATE listener count flat across restart', restart.updateAfter <= restart.updateBefore,
  `${restart.updateBefore} -> ${restart.updateAfter}`]);
checks.push(['state-changed still single after restart', restart.stateChanged === 1, `got ${restart.stateChanged}`]);
checks.push(['ui:restart-ascent still single after restart', restart.restartCount === 1, `got ${restart.restartCount}`]);

// ── The battle clock dies with its lane ─────────────────────────────────────
const clock = await page.evaluate(async (src) => {
  const game = window.__phaserGame;
  const st = window.__mandateState;
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const ui = game.scene.getScene('ConquestUIScene');
  const world = game.scene.getScene('ConquestScene');
  const first = eval(src);
  for (let t = 0; t < 200 && !st.ascent.activeBattle; t += 1) {
    advanceAscentTick(st);
    world.refresh();
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 12) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
    ui.events.emit('state-changed');
  }
  if (!st.ascent.activeBattle) return { skipped: true };
  ui.battleAwaitingOrder = false;
  ui.openLane('battle');
  const opened = ui.battleClock !== undefined;
  ui.closeLane();
  // Step past several beats of scene time so a zombie re-arm would have fired.
  let refreshes = 0;
  const origRefresh = ui.refresh.bind(ui);
  ui.refresh = () => { refreshes += 1; origRefresh(); };
  let clockTime = performance.now();
  for (let i = 0; i < 200; i += 1) { clockTime += 16.7; game.step(clockTime, 16.7); }
  ui.refresh = origRefresh;
  return { skipped: false, opened, dead: ui.battleClock === undefined, refreshes };
}, FIRST_OPTION);
if (clock.skipped) {
  checks.push(['battle clock check reached a fight', false, 'no battle within 200 ticks']);
} else {
  checks.push(['battle clock armed while the lane was open', clock.opened, '']);
  checks.push(['battle clock dead after closeLane', clock.dead, '']);
  checks.push(['no zombie refreshes after closeLane', clock.refreshes === 0, `got ${clock.refreshes}`]);
}

// ── March tween ownership (classic map) ─────────────────────────────────────
await startWorld(page, { mode: 'rival', seed: 1337 });
const march = await page.evaluate(async () => {
  const game = window.__phaserGame;
  const map = game.scene.getScene('MapScene');
  const st = map.state;
  const { issueMoveOrder } = await import('/src/systems/WarSystem.ts');
  const army = st.armies.find((a) => a.kingdomId === 'player') ?? st.armies[0];
  if (!army) return { skipped: true, why: 'no army' };
  const land = st.lands.find((l) => l.id === army.landId);
  const target = st.lands.find((l) => land.neighbors.includes(l.id));
  if (!target) return { skipped: true, why: 'no neighbour' };
  // The renderer only draws markers for visible armies, and at run start the rival's host sits
  // in fog — no marker, no tween, and the check would measure nothing.
  land.isVisible = true; land.isExplored = true;
  target.isVisible = true; target.isExplored = true;
  issueMoveOrder(st, army.id, target.id);
  map.refresh();
  const marching = map.armies.moveTweens?.size ?? -1;
  // Remove the army mid-march; the tween must go with it.
  st.movementOrders = st.movementOrders.filter((o) => o.armyId !== army.id);
  st.armies = st.armies.filter((a) => a.id !== army.id);
  map.refresh();
  let clockTime = performance.now();
  for (let i = 0; i < 90; i += 1) { clockTime += 16.7; game.step(clockTime, 16.7); }
  return { skipped: false, marching, after: map.armies.moveTweens?.size ?? -1, dust: map.armies.dust?.length ?? -1 };
});
if (march.skipped) {
  checks.push(['march check found an army with a neighbour', false, march.why]);
} else {
  checks.push(['march tween tracked while marching', march.marching === 1, `got ${march.marching}`]);
  checks.push(['march tween removed with the army', march.after === 0, `got ${march.after}`]);
  checks.push(['no dust after the army is gone', march.dust === 0, `got ${march.dust}`]);
}

checks.push(['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')]);
await browser.close();
report(checks);
