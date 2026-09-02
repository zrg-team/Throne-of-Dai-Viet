// Handing the fight to your general must hand over the *rest of it*, not end it.
//
// The order used to call `finishBattle(state, 'hold')`: a one-way door that resolved the
// engagement on the spot and threw away the aftermath, the spoils and any chance of taking the
// field back. This drives the real scenes and checks that the fight keeps running, that the
// commander is actually giving orders, and that the switch works in both directions.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-delegation.mjs
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
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
  //
  // And *recursively*: each exit is a container of its own now, so the icon and the word dip
  // together under a press. A one-level scan finds nothing in `exits` and reported "no way back"
  // for a chip sitting on screen the whole time — which is exactly what it had been doing.
  const labels = [];
  const walk = (o) => {
    if (typeof o.text === 'string' && o.text) labels.push(o.text);
    if (Array.isArray(o.list)) o.list.forEach(walk);
  };
  ui.battleUi?.orders?.list?.forEach(walk);
  ui.battleUi?.exits?.list?.forEach(walk);
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

/**
 * **And it has to still be theirs a season later.**
 *
 * Headless, and it has to be. The battle lane holds the economy clock while the player is
 * standing on the field, so waiting on the rendered screen advances *beats* and never calls
 * `advanceAscentTick` — which is where the auto-delegate rule lives. That is also precisely why
 * the bug was reported the way it was: the field is handed back on the first tick that runs after
 * the player leaves, so it looks like *closing* the screen is what did it. Reported as *i take
 * control -> game back to auto -> it only automatically move to auto mode if i move to other
 * fight or click close button.*
 *
 * The rule counted its grace window from the opening beat, so a take-back — which happens past
 * beat ten by definition — was undone on the very next season unless the player also moved a dial
 * in the same breath. Both entry points are checked: the take-back chip, and walking onto a side
 * fight with `focusBattle`.
 */
const survives = await page.evaluate(async (beatsNeeded) => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const BS = await import('/src/systems/ascent/BattleSystem.ts');

  let s = 20260902 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (p) => {
    const o = p.options ?? [];
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards?.[0] ?? 'skip';
      case 'conquer-target': return p.targets?.[0]?.landId ?? 'hold';
      case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
      case 'hero-choice': return p.heroIds?.[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds?.[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'muster-proposal': return 'accept';
      case 'doctrine': return p.options?.[0] ?? 'hold';
      default: return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
    }
  };
  const drain = (st) => { let g = 0; while (st.pendingAscentPrompt && g++ < 40) resolveAscentPrompt(st, pick(st.pendingAscentPrompt)); };

  const st = createAscentGameState({ difficulty: 'normal' });
  drain(st);
  // Run on until a field is live and has beaten past the grace window under its general.
  let ready = false;
  for (let i = 0; i < 400; i += 1) {
    advanceAscentTick(st);
    drain(st);
    st.isDefeated = false;
    const b = st.ascent.activeBattle;
    if (b && !b.over && (b.approachBeats ?? 0) + b.round >= beatsNeeded) { ready = true; break; }
  }
  if (!ready) return { reached: false };
  const opened = st.ascent.activeBattle;
  const atBeat = (opened.approachBeats ?? 0) + opened.round;
  // Nobody has touched this field and it is past beat ten, so the grace window should already
  // have handed it to a general. That safety net is what `claimed` must not have gutted: its
  // note records that without it, fights the officers used to hold became routs.
  const graceFired = opened.delegated === true && !opened.claimed
    && !opened.steeredFormation && !opened.steeredStance;

  BS.delegateBattle(st, false);
  const tapped = st.ascent.activeBattle?.delegated;
  // Five seasons, not one. The claim is meant to hold until the player gives the field up, so a
  // single tick would pass on a rule that merely delayed the hand-back by a season.
  let seasons = 0;
  for (let i = 0; i < 5; i += 1) {
    advanceAscentTick(st);
    seasons += 1;
    const b = st.ascent.activeBattle;
    if (!b || b.over || b.delegated) break;
  }
  const liveNow = st.ascent.activeBattle;
  const afterOneSeason = liveNow?.delegated;
  const gone = !liveNow || liveNow.over;
  // And handing it over on purpose still works, which is the other half of the contract.
  let releases = null;
  if (!gone) {
    BS.delegateBattle(st, true, false);
    releases = { delegated: liveNow.delegated, claimed: liveNow.claimed ?? false };
  }
  return { reached: true, atBeat, tapped, afterOneSeason, gone, seasons, releases, graceFired };
}, 10);

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
// Matched on the strings the catalog actually holds. The old pair — "Take the field" /
// "Thu lại quyền" — had not existed since the chip was reworded to `ascent.battle.takeField`,
// so this line had been failing on a chip that was there and worked (the assertion under it
// takes the field back successfully every run).
line(later.labels.some((s) => /Take back|Cầm quân lại/.test(s)), 'the chip offers the way back',
  later.labels.filter((s) => s.length < 24).join(' | '));
line(back.delegated === false, 'taking the field back works', `delegated=${back.delegated}`);
line(!back.gone && !back.over, 'and the fight is still there afterwards', `round ${back.round}`);
line(survives.reached && survives.graceFired,
  'an ignored field still goes to its general',
  survives.reached ? `unclaimed and delegated by beat ${survives.atBeat}` : 'no field reached the window');
line(survives.reached && (survives.gone || survives.afterOneSeason === false),
  'the command holds until the player gives it up',
  !survives.reached ? 'no field reached the grace window'
    : survives.gone ? 'the fight ended first'
      : `took the field at beat ${survives.atBeat}, still ours ${survives.seasons} season(s) later`);
line(!survives.releases || (survives.releases.delegated === true && survives.releases.claimed === false),
  'and handing it over on purpose still works',
  survives.releases ? `delegated=${survives.releases.delegated} claimed=${survives.releases.claimed}`
    : 'the fight ended first');
console.log(`\nlog at hand-over: ${handed.log.join(' / ')}`);
console.log(`fights: handed ${handed.key}@${handed.beat}  later ${later.key}@${later.beat}  back ${back.key}@${back.beat}`);
console.log(`clocks: handed ${JSON.stringify({ p: handed.paused, s: handed.strat, a: handed.awaiting, t: handed.turn })}`
  + `  later ${JSON.stringify({ p: later.paused, s: later.strat, a: later.awaiting, t: later.turn, d: later.defeated, c: later.conquestActive })}`);
console.log(`console errors: ${errors.length ? errors.slice(0, 2).join(' ; ') : 'none'}`);
void before;
