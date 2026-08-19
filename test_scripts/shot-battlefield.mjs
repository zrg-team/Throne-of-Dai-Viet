// The battlefield, photographed part-way through a real fight.
//
// Driven through The Field rather than through a run: the arena tick runs the fight and nothing
// else, so no card can take the screen at the moment of the shot — which is what kept happening
// when this was driven through Dragon Ascent.
//
// Usage: SECONDS=25 DEV_URL=http://127.0.0.1:5199 node test_scripts/shot-battlefield.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('output/web-game', { recursive: true });

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const SECONDS = Number(process.env.SECONDS ?? 22);
const HEIGHT = Number(process.env.HEIGHT ?? 844);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: HEIGHT }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);

await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = window.__phaserGame.scene.getScene('BattleArenaScene');
  s.ourMen = 1500; s.theirMen = 1500; s.martial = 70; s.ground = 'hills';
  s.startFight();
});
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 20000 });
await page.waitForTimeout(700);
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.battleAwaitingOrder = false;
  window.__mandateState.isStrategyPause = false;
});

await page.waitForTimeout(SECONDS * 1000);
const state = await page.evaluate(() => {
  const b = window.__mandateState?.ascent?.activeBattle;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  return {
    live: Boolean(b), round: b?.round ?? -1, ours: b?.ourNow ?? -1, theirs: b?.theirNow ?? -1,
    fallen: ui?.battleUi?.fallenCount ?? -1, lane: ui?.openPromptKey ?? '',
    ourMarkers: (ui?.battleUi?.ourMarkers ?? []).map((m) => ({
      id: m.hostId, x: Math.round(m.marker.x), y: Math.round(m.marker.y),
      alive: m.marker.active, kids: m.marker.list.length,
    })),
    theirMarkers: (ui?.battleUi?.theirMarkers ?? []).map((m) => ({
      id: m.hostId, x: Math.round(m.marker.x), y: Math.round(m.marker.y),
      alive: m.marker.active, kids: m.marker.list.length,
    })),
    fallenAlive: Boolean(ui?.battleUi?.fallen?.active),
  };
});
await page.screenshot({ path: `output/web-game/battlefield${HEIGHT === 844 ? '' : `-${HEIGHT}`}.png` });
// A crop of the field alone, at high magnification — the only way to see whether a mark holds up
// as a drawing rather than as a shape that happens to be the right size.
await page.screenshot({
  path: 'output/web-game/battlefield-crop.png',
  clip: { x: 20, y: Number(process.env.CROPY ?? 400), width: 350, height: 200 },
});
console.log(JSON.stringify(state));
console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
