// The first order has to actually start the fight.
//
// The battle screen opens held: the world is strategy-paused and a note says the fight begins on
// your first order. Every other lane captures whatever pause was in force when it opened and hands
// it back on the way out — right for a screen you were *reading*, wrong for this one. A battle can
// open itself while the world is already paused, and then the first order restored the very pause
// it had just been released from: the dock accepted the tap and nothing moved, leaving Close as the
// only control that did anything.
//
// Driven through the real input system — an actual mouse click on an actual chip — because the bug
// was never in the handler. Emitting `ui:battle-order` would have passed throughout.
//
//   node test_scripts/verify-battle-start.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://localhost:5173';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__phaserGame;
  g.scene.stop('MenuScene');
  g.scene.start('BattleArenaScene');
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const s = window.__phaserGame.scene.getScene('BattleArenaScene');
  s.ourMen = 1500; s.theirMen = 1500; s.martial = 70;
  s.startFight();
});
await page.waitForFunction(
  () => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle',
  null, { timeout: 20000 });
await page.waitForTimeout(1400);

// The failing case, forced: the world was already strategy-paused when the fight opened, so the
// lane is holding a `true` to give back. This is what a battle raised behind a prompt looks like.
const before = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = window.__mandateState;
  const b = st.ascent.activeBattle;
  ui.lanePauseBeforeOpen = true;
  const d = window.__phaserGame.scale.displayScale;
  const zones = [];
  ui.battleUi.orders.list.forEach((o) => {
    if (o.type === 'Zone' && o.input) zones.push({ x: o.x, y: o.y, w: o.width, h: o.height });
  });
  zones.sort((a, c) => a.y - c.y);
  const chips = zones.slice(4);
  const pick = chips[2] ?? chips[0];
  return {
    awaiting: ui.battleAwaitingOrder,
    strategyPause: st.isStrategyPause,
    beat: (b.approachBeats ?? 0) + b.round,
    stances: zones.length - chips.length,
    chips: chips.length,
    tap: pick ? { x: (pick.x + pick.w / 2) / d.x, y: (pick.y + pick.h / 2) / d.y } : null,
  };
});

check(before.awaiting === true, 'the fight opens held, waiting for an order');
check(before.stances === 4 && before.chips === 5,
  'the dock offers four stances and five shapes to give it with',
  `${before.stances} stances, ${before.chips} shapes`);
check(Boolean(before.tap), 'a formation chip is there to be tapped');

if (before.tap) await page.mouse.click(before.tap.x, before.tap.y);
await page.waitForTimeout(9000);

const after = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = window.__mandateState;
  const b = st.ascent?.activeBattle;
  return {
    awaiting: ui.battleAwaitingOrder,
    strategyPause: st.isStrategyPause,
    beat: b ? (b.approachBeats ?? 0) + b.round : Infinity,
    gone: !b,
  };
});

await browser.close();

check(after.awaiting === false, 'the tap ends the hold');
check(after.strategyPause === false, 'and does not hand the pause straight back',
  `isStrategyPause ${after.strategyPause}`);
check(after.beat > before.beat, 'the fight is actually running nine seconds later',
  after.gone ? 'it ran to a finish' : `beat ${before.beat} → ${after.beat}`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the fight does not start');
