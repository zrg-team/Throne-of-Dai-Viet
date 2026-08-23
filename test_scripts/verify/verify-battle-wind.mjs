// The wind clock, and the one exploit that must stay dead.
//
// The wind mechanic (docs/19-five-shapes-one-clock.html) has two promises the dials harness cannot
// carry alone. First: pressing SPENDS the dock — hold Xung phong through a few changes of shape
// and your answers must measurably run out, because that trade-off is the entire depth of the
// screen. Second, the turtle regression. A bot that only ever mirrors the enemy's shape and holds
// Cố thủ used to be the best player in the room: with defend dealing 0.62 its exchange ratio was
// favourable, the exchange-winner morale gain compared ABSOLUTE losses (a faucet for whichever
// side is smaller), and no doctrine punished passivity at even shape. All three are fixed —
// defend deals 0.50, the win-gain is proportional, and every personality presses a passive line.
//
// What the fix does NOT do is make the turtle lose outright at any odds: the defence's reserve
// and rally are deliberate structural edges (the player's edge over an invader that gets
// neither), and against a quarter-larger army they still drag a mirror-turtle over the line —
// at the cost of two thirds of its men and the rally spent. So the regression is a MARGIN:
// passivity must end in ruin, and active play must win the same fight decisively better. If the
// turtle ever gets its cheap win back, one of the three fixes above has been reverted.
//
// Three fights: the drain probe mutates wind by hand, and each policy fight must start clean.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-battle-wind.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://localhost:5173';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

/** A fresh engagement in the arena. The turtle fights outnumbered; the drain probe does not care. */
async function openFight(ourMen, theirMen) {
  await page.evaluate(({ ours, theirs }) => {
    window.__phaserGame.scene.start('BattleArenaScene');
    window.__armySizes = { ours, theirs };
  }, { ours: ourMen, theirs: theirMen });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const s = window.__phaserGame.scene.getScene('BattleArenaScene');
    s.ourMen = window.__armySizes.ours;
    s.theirMen = window.__armySizes.theirs;
    s.martial = 70;
    s.startFight();
  });
  await page.waitForFunction(
    () => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle',
    null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.battleAwaitingOrder = false;
    window.__mandateState.isStrategyPause = false;
  });
}

// ── fight one: pressing drains the dock ──────────────────────────────────────
await openFight(9000, 9000);
const drain = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const st = window.__mandateState;
  const b = () => st.ascent.activeBattle;
  const step = (n = 1) => { for (let i = 0; i < n; i += 1) if (!b().over) B.fightRound(st); };
  const ready = () => {
    const view = B.battleWindView(b());
    return ['chong', 'xung', 'tan', 'quy', 'no'].filter((s) => view.takeable[s]).length;
  };
  // The probe drives both dials itself; the commander must not tidy up after it.
  b().steeredStance = true;
  b().steeredFormation = true;
  b().ourWind = {};
  b().stance = 'press';
  b().stancePending = undefined;

  const opening = ready();
  // Work the fast dial the way an over-aggressive player does: a new shape the moment the last
  // one lands, never dropping out of press. Under press nothing recovers, so each landing must
  // subtract an answer.
  const ring = ['chong', 'xung', 'tan', 'quy', 'no'];
  const readiness = [opening];
  for (let hop = 0; hop < 3 && !b().over; hop += 1) {
    b().stance = 'press';
    b().stancePending = undefined;
    const view = B.battleWindView(b());
    const next = ring.find((s) => s !== b().ourFormation && s !== b().theirFormation && view.takeable[s]);
    if (!next) break;
    B.setBattleFormation(st, next);
    step(2); // one beat walking, one standing — press recovery is x0 throughout
    readiness.push(ready());
  }
  return { opening, readiness, over: b().over };
});

check(drain.opening === 5, 'the dock opens full', `${drain.opening}/5`);
check(!drain.over && drain.readiness.length >= 3
  && drain.readiness[drain.readiness.length - 1] <= 3
  && drain.readiness[drain.readiness.length - 1] < drain.opening,
  'holding Xung phong through the changes measurably drains the dock',
  drain.readiness.join(' → '));

// ── fight two: the turtle must lose ──────────────────────────────────────────
// Mirror their shape, always defend, never a counter — but the defence's structural one-shots
// (the reserve, the rally) still fire, because a real player turtling would press them too, and
// together they are deliberately worth about a tenth of an army. So the bar is a QUARTER: a gap
// structure alone cannot cover, where every point must come from actually playing the ring.
// At the old defend 0.62 this bot beat +10% flat; it must not beat +25% with the kitchen sink.
await openFight(4800, 6000);
const turtle = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const st = window.__mandateState;
  const b = () => st.ascent.activeBattle;
  b().steeredStance = true;
  b().steeredFormation = true;
  for (let beat = 0; beat < 400 && !b().over; beat += 1) {
    B.setBattleStance(st, 'defend');
    const read = B.battleTelegraph(st);
    const mirror = read ? (read.next ?? read.formation) : b().theirFormation;
    if (mirror !== b().ourFormation && (b().formationTarget ?? b().ourFormation) !== mirror) {
      B.setBattleFormation(st, mirror);
    }
    B.fightRound(st);
  }
  return { over: b().over, outcome: b().outcome, ourNow: b().ourNow, theirNow: b().theirNow };
});

const turtleStart = 4800;
const turtleLossShare = 1 - turtle.ourNow / turtleStart;
check(turtle.over && (turtle.outcome !== 'they-rout' || turtleLossShare >= 0.5),
  'the turtle never gets a cheap win — passivity against a bigger army ends in ruin',
  `outcome ${turtle.outcome}, lost ${Math.round(turtleLossShare * 100)}% of the host`);

// ── fight three: active play wins the same fight ─────────────────────────────
// The same armies, but the player answers: strong counter when it has wind, soft when not, match
// when neither, press only while countering, dig in while countered. If THIS loses too, the
// turtle check above proves nothing — the matchup was simply unwinnable.
await openFight(4800, 6000);
const active = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const F = await import('/src/data/ascent/formations.ts');
  const st = window.__mandateState;
  const b = () => st.ascent.activeBattle;
  b().steeredStance = true;
  b().steeredFormation = true;
  const ring = F.FORMATION_RING;
  const strongAnswer = (shape) => ring[(ring.indexOf(shape) - 1 + ring.length) % ring.length];
  const softAnswer = (shape) => ring[(ring.indexOf(shape) - 2 + ring.length) % ring.length];
  for (let beat = 0; beat < 400 && !b().over; beat += 1) {
    const read = B.battleTelegraph(st);
    const target = read ? (read.next ?? read.formation) : b().theirFormation;
    const wish = [strongAnswer(target), softAnswer(target), target]
      .find((s) => B.canFormFormation(st, s));
    if (wish && wish !== b().ourFormation && (b().formationTarget ?? '') !== wish) {
      B.setBattleFormation(st, wish);
    }
    const walking = (b().reformBeats ?? 0) > 0 || (b().theirReformBeats ?? 0) > 0;
    const tier = walking ? 0 : F.formationTier(b().ourFormation, b().theirFormation);
    B.setBattleStance(st, tier > 0 ? 'press' : tier < 0 ? 'defend' : 'balanced');
    B.fightRound(st);
  }
  return { over: b().over, outcome: b().outcome, ourNow: b().ourNow, theirNow: b().theirNow };
});

check(active.over && active.outcome === 'they-rout',
  'active play wins the same fight outright',
  `outcome ${active.outcome}, us ${Math.round(active.ourNow)} v them ${Math.round(active.theirNow)}`);
check(active.outcome === 'they-rout' && active.ourNow >= turtle.ourNow * 1.4,
  'and decisively better than turtling it — the margin the whole screen exists to create',
  `active kept ${Math.round(active.ourNow)}, the turtle ${Math.round(turtle.ourNow)}`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the wind is not doing its job');
