/**
 * The same host on the map, standing and then under a real attack order.
 *
 * Deliberately driven through `setArmyOrders` — the call the "Tấn công…" tile makes — rather than
 * by pushing a movement order by hand, because the question this answers is whether *ordering an
 * attack in the game* puts the host into column, not whether the renderer can draw one.
 *
 * Writes output/march/map-stand.png and map-march.png, cropped to the same box around the host.
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = process.env.SHOT_OUT ?? 'output/march';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

const host = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const game = window.__phaserGame;
  const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  game.scene.stop('MenuScene');
  game.scene.start('ConquestScene', { state });
  await new Promise((d) => setTimeout(d, 1600));
  const st = window.__mandateState ?? state;
  st.pendingAscentPrompt = undefined;
  // **The clock stays running.** This used to stop the world to keep a card prompt off the shot,
  // and got a marching column anyway because the march tween ignored the pause — which was itself
  // the bug (`ArmyRenderer.setPaused`). A stopped world now stops its hosts, so a paused run
  // photographs a column standing still. The prompt is cleared on every poll instead.
  st.isPaused = false; st.isStrategyPause = false;
  game.scene.getScene('ConquestUIScene').refresh();
  await new Promise((d) => setTimeout(d, 400));
  return st.armies.find((a) => a.kingdomId === 'dai-viet' && !a.isLevy).id;
});

const where = () => page.evaluate(({ id }) => {
  const game = window.__phaserGame;
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  st.isPaused = false; st.isStrategyPause = false;
  const map = game.scene.getScene('ConquestScene');
  const m = map.armies.markers.get(id);
  if (!m) return null;
  const cam = map.cameras.main;
  // Keep the column in frame: a marching host walks off a 390-wide sheet in a couple of seconds,
  // and a crop clamped to the viewport edge photographs empty ground.
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  cam.setScroll(
    clamp(m.x - 390 / (2 * cam.zoom), 0, Math.max(0, map.worldWidth - 390 / cam.zoom)),
    clamp(m.y - 844 / (2 * cam.zoom), 0, Math.max(0, map.worldHeight - 844 / cam.zoom)),
  );
  const rect = game.canvas.getBoundingClientRect();
  const ratio = rect.width / game.scale.width;
  return {
    x: Math.round(((m.x - cam.scrollX) * cam.zoom) * ratio),
    y: Math.round(((m.y - cam.scrollY) * cam.zoom) * ratio),
  };
}, { id: host });

const W = 170, H = 140;
const shot = async (name) => {
  const at = await where();
  if (!at) { console.log(name, 'no marker'); return; }
  console.log(name, JSON.stringify(at));
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: {
    x: Math.max(0, Math.min(390 - W, at.x - W / 2)),
    y: Math.max(0, Math.min(844 - H, at.y - H * 0.66)),
    width: W, height: H,
  } });
};

await shot('map-stand');

// The order the "Tấn công…" tile issues, on a neighbour that is not ours.
const ordered = await page.evaluate(async ({ id }) => {
  const { setArmyOrders } = await import('/src/systems/ascent/StandingOrders.ts');
  const st = window.__mandateState;
  const army = st.armies.find((a) => a.id === id);
  const here = st.lands.find((l) => l.id === army.landId);
  const target = here.neighbors
    .map((n) => st.lands.find((l) => l.id === n))
    .find((l) => l && l.ownerId !== 'dai-viet');
  const ok = setArmyOrders(st, id, { kind: 'attack', landId: (target ?? st.lands.find((l) => l.id === here.neighbors[0])).id });
  window.__phaserGame.scene.getScene('ConquestScene').refresh();
  await new Promise((d) => setTimeout(d, 900));
  return {
    accepted: ok,
    marching: st.movementOrders.some((o) => o.armyId === id),
    order: army.orders?.kind ?? null,
  };
}, { id: host });

await shot('map-march');
// A few frames further on, where the trail behind the column has had time to build.
await page.waitForTimeout(500);
await shot('map-march-trail');
// How much dust is actually alive, and how far it is from the men — the difference between
// "too faint to see" and "not being spawned at all".
const dust = await page.evaluate(({ id }) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const m = map.armies.markers.get(id);
  const puffs = map.armies.dust ?? [];
  return {
    live: puffs.length,
    near: puffs.filter((p) => Math.hypot(p.x - m.x, p.y - m.y) < 40).length,
    sample: puffs.slice(0, 3).map((p) => ({
      dx: Math.round(p.x - m.x), dy: Math.round(p.y - m.y),
      w: Math.round(p.width * p.scaleX), a: Number(p.alpha.toFixed(2)),
    })),
  };
}, { id: host });
console.log('dust', JSON.stringify(dust));
console.log(JSON.stringify(ordered));
console.log('ERRORS:', errs.length ? errs.slice(0, 3) : 'none');
await browser.close();
