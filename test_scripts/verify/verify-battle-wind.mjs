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
  const drained = { opening, readiness, over: b().over };

  // ── the signature keeps its breath ─────────────────────────────────────────
  // A doctrine's signature shape stamps wind 2, not 3. Probed under press (recovery x0) so the
  // landing-beat tick cannot blur the number; the plain stamp under press already read 3 above.
  b().stance = 'press';
  b().stancePending = undefined;
  b().theirFormationTarget = undefined;
  b().theirReformBeats = 0;
  b().ourWind = {};
  b().freeReform = false;
  b().ourSignature = 'chong';
  if (b().ourFormation !== 'chong') {
    b().ourFormation = 'chong';
    b().formationTarget = undefined;
    b().reformBeats = 0;
  }
  const off = ['xung', 'tan', 'quy', 'no'].find((f) => f !== b().theirFormation);
  B.setBattleFormation(st, off);
  step(2);
  drained.signatureWind = B.battleWindView(b()).ours.chong;

  // ── the drum refills the dock ──────────────────────────────────────────────
  b().ourWind = { xung: 3, tan: 2, quy: 3 };
  b().moment = {
    id: 'the-drum', raisedAtBeat: b().round, ticksLeft: 1,
    subject: b().kingdomName, generalName: 'Probe', generalMartial: 60,
  };
  const drummed = B.answerBattleMoment(st, 'commit');
  const after = B.battleWindView(b());
  drained.drum = {
    took: drummed,
    cleared: ['chong', 'xung', 'tan', 'quy', 'no'].every((f) => after.ours[f] === 0),
  };
  return drained;
});

check(drain.opening === 5, 'the dock opens full', `${drain.opening}/5`);
check(drain.signatureWind === 4,
  'the signature shape keeps its breath — wind 4, not 6',
  `chong left at wind ${drain.signatureWind}`);
check(drain.drum.took === true && drain.drum.cleared === true,
  'the drum clears every wind clock at once',
  drain.drum.took ? 'committed, dock refilled' : 'moment refused');
check(!drain.over && drain.readiness.length >= 3
  && drain.readiness[drain.readiness.length - 1] <= 3
  && drain.readiness[drain.readiness.length - 1] < drain.opening,
  'holding Xung phong through the changes measurably drains the dock',
  drain.readiness.join(' → '));

// ── fight one-and-a-half: tempers give different fights ──────────────────────
// Same armies, same rules, a different man: the hasty rotates out of an even matchup on his own
// clock, the stubborn never moves unless he is losing. Hold one shape, count their changes.
const cadence = {};
for (const temper of ['hasty', 'stubborn']) {
  await openFight(9000, 9000);
  cadence[temper] = await page.evaluate(async (who) => {
    const B = await import('/src/systems/ascent/BattleSystem.ts');
    const st = window.__mandateState;
    const b = () => st.ascent.activeBattle;
    b().steeredStance = true;
    b().steeredFormation = true;
    b().commanderTemper = who;
    // Mirror them every beat (a direct write, no walk): the tilt is pinned at 0, so the ONLY
    // thing that can move them is restlessness. A rotation they make into a counter would end
    // the probe otherwise — a restless commander who finds a winning shape rightly keeps it.
    let changes = 0;
    let last = b().theirFormation;
    for (let beat = 0; beat < 30 && !b().over; beat += 1) {
      b().ourFormation = b().theirFormation;
      b().formationTarget = undefined;
      b().reformBeats = 0;
      B.fightRound(st);
      if (b().theirFormation !== last) { changes += 1; last = b().theirFormation; }
    }
    return changes;
  }, temper);
}
check(cadence.hasty >= 4 && cadence.stubborn <= 3 && cadence.hasty > cadence.stubborn * 2,
  'the hasty rotates on his own clock, far more often than the stubborn',
  `hasty changed ${cadence.hasty} times in 30 beats, stubborn ${cadence.stubborn}`);

// ── fight one-and-three-quarters: the cooldown actually happens ──────────────
// "I played ten times and never saw a cooldown — a mechanic that never happens, what is it for?"
// Greedy play against a MEASURED invader (the default temper), medium difficulty: count the
// decisions where the strong answer to the telegraph is winded. Under two per fight, the wind is
// decoration again.
await openFight(6000, 6000);
const met = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const F = await import('/src/data/ascent/formations.ts');
  const st = window.__mandateState;
  const b = () => st.ascent.activeBattle;
  b().steeredStance = true;
  b().steeredFormation = true;
  b().commanderTemper = 'measured';
  const ring = F.FORMATION_RING;
  const strongAnswer = (shape) => ring[(ring.indexOf(shape) - 1 + ring.length) % ring.length];
  const softAnswer = (shape) => ring[(ring.indexOf(shape) - 2 + ring.length) % ring.length];
  let decisions = 0, blocked = 0, beats = 0;
  for (let beat = 0; beat < 60 && !b().over; beat += 1) {
    beats += 1;
    const read = B.battleTelegraph(st);
    const target = read ? (read.next ?? read.formation) : b().theirFormation;
    const want = strongAnswer(target);
    if (want !== b().ourFormation && (b().formationTarget ?? '') !== want && (b().reformBeats ?? 0) === 0) {
      decisions += 1;
      if (!B.canFormFormation(st, want)) blocked += 1;
      const wish = [want, softAnswer(target), target].find((s) => B.canFormFormation(st, s));
      if (wish && wish !== b().ourFormation) B.setBattleFormation(st, wish);
    }
    const walking = (b().reformBeats ?? 0) > 0 || (b().theirReformBeats ?? 0) > 0;
    const tier = walking ? 0 : F.formationTier(b().ourFormation, b().theirFormation);
    B.setBattleStance(st, tier > 0 ? 'press' : tier < 0 ? 'defend' : 'balanced');
    B.fightRound(st);
  }
  return { decisions, blocked, beats, rotations: b().theirRotations ?? 0, opening: b().theirFormation };
});
check(met.blocked >= 2 && met.blocked <= Math.ceil(met.decisions * 0.6),
  'the cooldown is MET, and is not a wall — the strong answer is winded 2+ times, under 60% of decisions',
  `${met.blocked} blocked of ${met.decisions} decisions in ${met.beats} beats; invader rotated ${met.rotations} times`);

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
// 1.3x, down from 1.4x: once every invader learned to read the dock (wind round two) the greedy
// bot's strong answer is refused about every other decision, which costs ACTIVE play and not the
// turtle — it only ever matches. Measured 1.7x before that change, 1.38x after. The invariant is
// the shape of the result, an outright win against a ruin, not the exact ratio.
check(active.outcome === 'they-rout' && active.ourNow >= turtle.ourNow * 1.3,
  'and decisively better than turtling it — the margin the whole screen exists to create',
  `active kept ${Math.round(active.ourNow)}, the turtle ${Math.round(turtle.ourNow)}`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the wind is not doing its job');
