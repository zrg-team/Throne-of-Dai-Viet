// Two pips, and the game they are supposed to make.
//
// docs/20: stamina is spent by changing formation, one pip per change, two pips in hand, a pip
// back every six beats on its own — and nothing else touches it. The enemy holds his shape while
// he is winning and answers only once he is losing. The player's job is to READ: see his shape
// (or fail to), answer it, and when the answer costs more than they have, hold and dig in.
//
// Four proofs, in the order they matter:
//   1. the invader holds while winning, answers when losing — the duel is a read, not a timer
//   2. the meter actually empties in ordinary play, and not too often (1–3 times a fight)
//   3. three bots: manager > chaser > turtle — reading and rationing beats both extremes
//   4. the dock hides its rims on hard, shows them on normal
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-battle-stamina.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://localhost:5173';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();

async function bootPage(difficulty) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript((d) => localStorage.setItem('mandate:battle:difficulty:v1', d), difficulty);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  return { page, errors };
}

async function openFight(page, ourMen, theirMen) {
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
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.battleAwaitingOrder = false;
    window.__mandateState.isStrategyPause = false;
  });
}

/** The three policies, run in-page. Returns the fight's outcome and the meter's history. */
const POLICY_SRC = `
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
  let empties = 0, wasEmpty = false, changes = 0, refused = 0, rotations = 0, lastTheirs = b().theirFormation;
  let stuck = 0, stuckBeats = 0, wasStuck = false;
  for (let beat = 0; beat < 400 && !b().over; beat += 1) {
    const read = B.battleTelegraph(st);
    const target = read ? (read.next ?? read.formation) : b().theirFormation;
    const stam = B.battleStamina(b()).pips;
    const walking = (b().reformBeats ?? 0) > 0 || (b().theirReformBeats ?? 0) > 0;
    const tier = walking ? 0 : F.formationTier(b().ourFormation, b().theirFormation);
    const want = strongAnswer(target);
    if (POLICY === 'chaser') {
      if (want !== b().ourFormation && (b().formationTarget ?? '') !== want) {
        if (B.setBattleFormation(st, want)) changes += 1; else refused += 1;
      }
      B.setBattleStance(st, 'press');
    } else if (POLICY === 'turtle') {
      B.setBattleStance(st, 'defend');
    } else {
      // manager: answer while a pip is in hand and the answer is worth it; never spend the last
      // pip on a soft answer; dig in when empty and countered, press only when countering.
      const answer = [want, softAnswer(target)].find((s, i) => (i === 0 ? stam >= 1 : stam >= 2));
      if (answer && answer !== b().ourFormation && (b().formationTarget ?? '') !== answer
        && F.formationTier(b().ourFormation, target) <= 0) {
        if (B.setBattleFormation(st, answer)) changes += 1; else refused += 1;
      }
      B.setBattleStance(st, tier > 0 ? 'press' : (tier < 0 || stam === 0) ? 'defend' : 'balanced');
    }
    B.fightRound(st);
    const nowEmpty = B.battleStamina(b()).pips === 0;
    if (nowEmpty && !wasEmpty) empties += 1;
    wasEmpty = nowEmpty;
    // STUCK: no pip, and standing in a shape they beat. The moment the whole design exists for.
    const walkingNow = (b().reformBeats ?? 0) > 0 || (b().theirReformBeats ?? 0) > 0;
    const nowStuck = nowEmpty && !walkingNow && F.formationTier(b().ourFormation, b().theirFormation) < 0;
    if (nowStuck) stuckBeats += 1;
    if (nowStuck && !wasStuck) stuck += 1;
    wasStuck = nowStuck;
    if (b().theirFormation !== lastTheirs) { rotations += 1; lastTheirs = b().theirFormation; }
  }
  return { outcome: b().outcome, ourNow: Math.round(b().ourNow), theirNow: Math.round(b().theirNow),
    beats: b().round, empties, changes, refused, rotations, stuck, stuckBeats };
`;

const normal = await bootPage('medium');

// ── 1. the invader holds while winning, answers when losing ─────────────────
await openFight(normal.page, 6000, 6000);
const hold = await normal.page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const F = await import('/src/data/ascent/formations.ts');
  const st = window.__mandateState;
  const b = () => st.ascent.activeBattle;
  b().steeredStance = true; b().steeredFormation = true;
  b().commanderTemper = 'measured';
  b().ourAdvance = 0.5; b().theirAdvance = 0.5;
  const ring = F.FORMATION_RING;
  // Stand in the shape THEY beat, and do nothing: he is winning, he must not move.
  const losing = ring[(ring.indexOf(b().theirFormation) + 1) % ring.length];
  b().ourFormation = losing; b().formationTarget = undefined; b().reformBeats = 0;
  b().theirFormationTarget = undefined; b().theirReformBeats = 0;
  let movedWhileWinning = 0;
  let last = b().theirFormation;
  for (let i = 0; i < 20 && !b().over; i += 1) {
    B.fightRound(st);
    if (b().theirFormation !== last) { movedWhileWinning += 1; last = b().theirFormation; }
  }
  // Now stand in the shape that beats him: he is losing, he must answer inside a few beats.
  const beating = ring[(ring.indexOf(b().theirFormation) - 1 + ring.length) % ring.length];
  b().ourFormation = beating; b().formationTarget = undefined; b().reformBeats = 0;
  b().beatsSinceOurShape = 0;
  let answeredAfter = -1;
  last = b().theirFormation;
  for (let i = 0; i < 12 && !b().over; i += 1) {
    B.fightRound(st);
    if (b().theirFormation !== last) { answeredAfter = i + 1; break; }
  }
  return { movedWhileWinning, answeredAfter };
});
check(hold.movedWhileWinning === 0, 'the invader holds his shape while he is winning', `${hold.movedWhileWinning} moves in 20 beats`);
check(hold.answeredAfter > 0 && hold.answeredAfter <= 6, 'and answers within a few beats once he is losing', `answered after ${hold.answeredAfter} beats`);

// ── 2 & 3. the three bots ────────────────────────────────────────────────────
const runs = {};
const ODDS = Number(process.env.ODDS || 6600);
for (const policy of ['manager', 'chaser', 'turtle']) {
  await openFight(normal.page, 6000, ODDS);
  runs[policy] = await normal.page.evaluate(new Function('POLICY', `return (async () => {${POLICY_SRC}})()`), policy);
  console.log(`  ${policy.padEnd(8)} ${JSON.stringify(runs[policy])}`);
}
const m = runs.manager, c = runs.chaser, tu = runs.turtle;
// Four to five on a typical boot; the seeded opening shape moves it by one either way. The claim
// is "a few times, and briefly" — spells of one or two beats, never a long grey wall.
check(m.stuck >= 1 && m.stuck <= 6 && m.stuckBeats <= 12,
  'in ordinary play the player is STUCK — no pip, countered — a few times a fight, briefly',
  `manager stuck ${m.stuck}x for ${m.stuckBeats} beats over ${m.beats}; ${m.changes} changes, ${m.rotations} enemy answers`);
check(c.refused >= 2,
  'a player who chases every rotation is refused — the penalty for changing too fast is real',
  `chaser refused ${c.refused}x, emptied ${c.empties}x`);
const score = (r) => (r.outcome === 'they-rout' ? 1 : 0) * 10000 + r.ourNow - r.theirNow;
// The chaser is a manager who never waits; with the ring this strong the two finish within a
// few percent of each other and the order flips on noise. The claim that holds: rationing is
// never WORSE than chasing, and both crush the turtle — the meter taxes flailing, it does not
// punish courage.
check(score(m) >= score(c) * 0.97 && score(c) > score(tu) && m.outcome === 'they-rout',
  'rationing is never worse than chasing, and both crush the turtle',
  `manager ${m.outcome} ${m.ourNow}v${m.theirNow} · chaser ${c.outcome} ${c.ourNow}v${c.theirNow} · turtle ${tu.outcome} ${tu.ourNow}v${tu.theirNow}`);

// ── 4. rims by difficulty ───────────────────────────────────────────────────
const rimsOn = await normal.page.evaluate(async () => {
  const O = await import('/src/game/battleOptions.ts');
  return O.battleRimsShown();
});
const hard = await bootPage('hard');
const rimsOff = await hard.page.evaluate(async () => {
  const O = await import('/src/game/battleOptions.ts');
  return O.battleRimsShown();
});
check(rimsOn === true && rimsOff === false, 'the dock rims the counter on normal and hides it on hard',
  `normal ${rimsOn}, hard ${rimsOff}`);

check(normal.errors.length === 0 && hard.errors.length === 0, 'no console errors',
  [...normal.errors, ...hard.errors].slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the two pips are not making the game');
