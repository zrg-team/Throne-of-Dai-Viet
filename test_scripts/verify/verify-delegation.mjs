// Handing the fight to your general must hand over the *rest of it*, not end it.
//
// The order used to call `finishBattle(state, 'hold')`: a one-way door that resolved the
// engagement on the spot and threw away the aftermath, the spoils and any chance of taking the
// field back. This drives the real scenes and checks that the fight keeps running, that the
// commander is actually giving orders, and that the switch works in both directions.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-delegation.mjs
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);
// The arena gives a fight on demand instead of driving a whole run to find one.
await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(700);
await page.evaluate(() => window.__phaserGame.scene.getScene('BattleArenaScene').startFight());
await page.waitForFunction(
  () => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle',
  null, { timeout: 20000 });
await page.waitForTimeout(1400);

const read = () => page.evaluate(() => {
  const b = window.__mandateState.ascent?.activeBattle;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  // Both containers: the hand-over chip left the dock for the field's top-right corner when the
  // dock became two dials, and looking only at `orders` reported "no way back" for a chip that was
  // sitting on screen the whole time.
  const labels = [];
  ui.battleUi?.orders?.list?.forEach((o) => { if (o.text) labels.push(o.text); });
  ui.battleUi?.exits?.list?.forEach((o) => { if (o.text) labels.push(o.text); });
  const st = window.__mandateState;
  return b ? {
    paused: Boolean(st.isPaused), strat: Boolean(st.isStrategyPause), defeated: Boolean(st.isDefeated),
    conquestActive: window.__phaserGame.scene.isActive('ConquestScene'),
    awaiting: Boolean(ui.battleAwaitingOrder), turn: st.turn,
    over: b.over, round: b.round, key: b.key ?? b.landId, delegated: Boolean(b.delegated),
    moment: b.moment?.id ?? null,
    // The fight's whole clock. `round` counts *exchanges* and deliberately does not move during
    // the approach, so a fight that is closing the ground perfectly happily reads as round 0 —
    // which is how this check came to report a stall that was not one.
    beat: (b.approachBeats ?? 0) + b.round,
    martial: b.generalMartial ?? null, stance: b.stance, formation: b.ourFormation,
    log: b.log.slice(-3), labels,
  } : { gone: true, labels };
});

const before = await read();
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  // The opening hold is released by the tap handler, not by the order. Without clearing both the
  // world never ticks and the fight sits at round 0 looking like delegation broke it.
  ui.battleAwaitingOrder = false;
  window.__mandateState.isStrategyPause = false;
  ui.events.emit('ui:battle-order', 'auto');
});
await page.waitForTimeout(1200);
const handed = await read();
// Let the commander fight a while, then take it back.
await page.waitForTimeout(9000);
const later = await read();
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.events.emit('ui:battle-order', 'take-field');
});
await page.waitForTimeout(900);
const back = await read();

await browser.close();

const line = (ok, label, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} ${detail}`);
console.log('═══ DELEGATION ═══\n');
line(!handed.gone && !handed.over, 'handing over does not end the fight',
  handed.gone ? 'the battle was destroyed' : `round ${handed.round}, over=${handed.over}`);
line(handed.delegated === true, 'the field changed hands', `delegated=${handed.delegated}`);
line((handed.martial ?? 0) > 0, 'a commander with a martial score has it', `martial ${handed.martial}`);
// Pinned to the engagement that was handed over. A fight that finished and was replaced by the
// next one also reads "round 0", and calling that a stall would be the harness lying about which
// battle it was watching.
line(!later.gone && (later.key !== handed.key || later.beat > handed.beat),
  'the fight kept running without the player',
  later.key !== handed.key ? `it finished; the next one is at beat ${later.beat}`
    : `beat ${handed.beat} -> ${later.beat} (exchange ${handed.round} -> ${later.round})`);
line(later.labels.some((s) => /Take the field|Thu lại quyền/.test(s)), 'the chip offers the way back',
  later.labels.filter((s) => s.length < 24).join(' | '));
line(back.delegated === false, 'taking the field back works', `delegated=${back.delegated}`);
line(!back.gone && !back.over, 'and the fight is still there afterwards', `round ${back.round}`);
console.log(`\nlog at hand-over: ${handed.log.join(' / ')}`);
console.log(`fights: handed ${handed.key}@${handed.beat}  later ${later.key}@${later.beat}  back ${back.key}@${back.beat}`);
console.log(`clocks: handed ${JSON.stringify({ p: handed.paused, s: handed.strat, a: handed.awaiting, t: handed.turn })}`
  + `  later ${JSON.stringify({ p: later.paused, s: later.strat, a: later.awaiting, t: later.turn, d: later.defeated, c: later.conquestActive })}`);
console.log(`console errors: ${errors.length ? errors.slice(0, 2).join(' ; ') : 'none'}`);
void before;
