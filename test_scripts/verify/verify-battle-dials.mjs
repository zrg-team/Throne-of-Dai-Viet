// Two dials, two clocks — and neither of them can be seen by any harness that existed before.
//
// The whole design rests on the two controls being *different kinds* of control: formation is
// instant to order and slow to complete, stance is slow to order and instant to complete and then
// holds you for four beats. If either clock is wrong the cadence collapses and the dock is two of
// the same dial again. See docs/14-five-shapes-two-dials.html.
//
// Two fights, because a probe that spends thirty beats reading the telegraph has no fight left to
// test the dials on — measured, every dial check failed with "battle.over" rather than with
// anything about a dial.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-battle-dials.mjs
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

/** A fresh engagement in the arena, big enough to survive being stepped through. */
async function openFight() {
  await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const s = window.__phaserGame.scene.getScene('BattleArenaScene');
    s.ourMen = 9000; s.theirMen = 9000; s.martial = 70;
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

// ── fight one: the dials ─────────────────────────────────────────────────────
await openFight();
const dials = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const st = window.__mandateState;
  const b = () => st.ascent.activeBattle;
  const step = (n = 1) => { for (let i = 0; i < n; i++) if (!b().over) B.fightRound(st); };
  const out = {};

  // ── the slow dial: slow to order, instant to complete ──────────────────────
  b().stance = 'balanced';
  b().stanceLockBeats = 0;
  b().stancePending = undefined;
  const ordered = B.setBattleStance(st, 'press');
  out.landsNextBeat = { ordered, stanceNow: b().stance, pending: b().stancePending ?? null };
  step(1);
  out.landed = { stance: b().stance, lock: b().stanceLockBeats };

  out.lockedRefusals = ['press', 'balanced', 'defend', 'withdraw']
    .map((s) => [s, B.stanceIsLocked(b(), s)]);
  out.refusedWhileLocked = B.setBattleStance(st, 'balanced');
  out.brakeWhileLocked = B.setBattleStance(st, 'defend');

  // How long the lock actually holds, counted from a fresh one.
  b().stance = 'press';
  b().stancePending = undefined;
  b().stanceLockBeats = 4;
  let held = 0;
  while (B.stanceIsLocked(b(), 'balanced') && held < 12) { step(1); held += 1; }
  out.lockHeldBeats = held;
  out.overAfterLock = b().over;

  // ── the fast dial: instant to order, slow to complete ──────────────────────
  b().stancePending = undefined;
  b().stanceLockBeats = 0;
  b().ourFormation = 'chong';
  b().formationTarget = undefined;
  b().reformBeats = 0;
  const window0 = B.reformBeatsFor(st, b());
  const gave = B.setBattleFormation(st, 'quy');
  out.ordered = { gave, target: b().formationTarget ?? null, beats: b().reformBeats, shapeNow: b().ourFormation };

  // Every beat of the walk, and the beat it arrives on. The host must still be in the OLD shape
  // for `window0` beats — a re-form that lands without paying the transit is a free dial.
  const transit = [];
  for (let i = 0; i < window0 + 1; i++) {
    const before = { shape: b().ourFormation, walking: (b().reformBeats ?? 0) > 0 };
    step(1);
    transit.push({ ...before, after: b().ourFormation });
  }
  out.transit = transit;
  out.window = window0;

  // The re-form window by tier, with and without a commander.
  const hosts = () => st.armies.filter((a) => (b().ourArmyIds ?? []).includes(a.id));
  const savedElite = hosts().map((h) => h.elite);
  const savedGeneral = hosts().map((h) => h.generalHeroId);
  const savedMorale = b().ourMorale;
  b().ourMorale = 80; // above the rout line, so the punishment window is not what is measured
  const byTier = [];
  for (const tier of [0, 1, 2]) {
    for (const led of [false, true]) {
      hosts().forEach((h, i) => {
        h.elite = tier;
        h.generalHeroId = led ? savedGeneral[i] : undefined;
      });
      byTier.push({ tier, led, beats: B.reformBeatsFor(st, b()) });
    }
  }
  hosts().forEach((h, i) => { h.elite = savedElite[i]; h.generalHeroId = savedGeneral[i]; });
  out.byTier = byTier;

  // ...and the punishment window, for a host whose heart has already gone.
  b().ourMorale = 5;
  out.brokenWindow = B.reformBeatsFor(st, b());
  b().ourMorale = savedMorale;

  // A shape whose block is spent is refused outright; the tortoise never is.
  // `ourMustered`, not `ourStart`: the reserve is standing at camp, and counting it as dead
  // reads a fresh host as having already lost its whole screen block.
  const states = B.sideFormations(hosts(), B.ourMustered(b()));
  out.states = states;
  const deadShape = Object.entries(states).find(([, v]) => v === 'gone')?.[0] ?? null;
  out.deadShape = deadShape;
  out.deadRefused = deadShape ? B.setBattleFormation(st, deadShape) : null;
  out.floorOffered = B.canFormFormation(st, 'quy');
  return out;
});

// ── fight two: the telegraph ─────────────────────────────────────────────────
await openFight();
const wire = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const st = window.__mandateState;
  const b = () => st.ascent.activeBattle;
  // A telegraph that can differ from what happens teaches a rule the game does not keep.
  const promises = [];
  for (let i = 0; i < 40 && !b().over; i++) {
    const read = B.battleTelegraph(st);
    if (!read) break;
    const promised = read.next && read.beatsLeft === 1 ? read.next : null;
    B.fightRound(st);
    if (promised) promises.push({ promised, actual: b().theirFormation, beat: i });
  }
  return { promises, broken: promises.filter((p) => p.promised !== p.actual) };
});

await browser.close();

const p = dials;
check(p.landsNextBeat.ordered && p.landsNextBeat.stanceNow === 'balanced' && p.landsNextBeat.pending === 'press',
  'a stance is ordered now and lands next beat',
  `now ${p.landsNextBeat.stanceNow}, pending ${p.landsNextBeat.pending}`);
check(p.landed.stance === 'press' && p.landed.lock === 4,
  'it lands on the next beat and arms a four-beat lock',
  `${p.landed.stance}, lock ${p.landed.lock}`);

const refusals = Object.fromEntries(p.lockedRefusals);
check(refusals.press && refusals.balanced && !refusals.defend && !refusals.withdraw,
  'the lock refuses press and balanced, never the brake',
  p.lockedRefusals.map(([s, v]) => `${s}:${v ? 'locked' : 'free'}`).join(' '));
check(p.refusedWhileLocked === false, 'a locked stance change is actually refused');
check(p.brakeWhileLocked === true, 'Cố thủ answers even while the line is committed');
check(p.lockHeldBeats === 4, 'the lock holds exactly four beats', `${p.lockHeldBeats} beats`);

check(p.ordered.gave && p.ordered.shapeNow === 'chong' && p.ordered.target === 'quy',
  'a shape is ordered instantly and the host is still in the old one',
  `holding ${p.ordered.shapeNow}, walking to ${p.ordered.target}, ${p.ordered.beats} beats`);
const paid = p.transit.slice(0, p.window);
const arrival = p.transit[p.window];
check(paid.length === p.window && paid.every((s) => s.shape === 'chong' && s.walking)
  && arrival && arrival.after === 'quy',
  'the transit is paid in full before the new shape lands',
  `${p.window}-beat window · ` + p.transit.map((s) => `${s.shape}→${s.after}`).join(' '));

check(p.byTier.every((r) => r.beats >= 1 && r.beats <= 2),
  'a sound host re-forms in one or two beats, never three',
  p.byTier.map((r) => `t${r.tier}${r.led ? '+gen' : ''}:${r.beats}`).join(' '));
const t = Object.fromEntries(p.byTier.map((r) => [`${r.tier}${r.led ? 'L' : ''}`, r.beats]));
check(t['2'] <= t['0'] && t['0L'] <= t['0'],
  'quality and a commander are both reaction time',
  `levy ${t['0']} · levy+gen ${t['0L']} · guard ${t['2']}`);
check(p.brokenWindow === 3, 'a host below the rout line takes three beats', `${p.brokenWindow} beats`);

check(p.deadShape === null || p.deadRefused === false,
  'a shape whose block is spent is refused', p.deadShape ? `${p.deadShape} refused` : 'none spent yet');
check(p.floorOffered === true, 'Thế Quy is always on offer');

check(wire.promises.length > 0, 'the telegraph was read at least once', `${wire.promises.length} promises`);
check(wire.broken.length === 0, 'the telegraph is always what actually happens',
  wire.broken.slice(0, 3).map((b) => `beat ${b.beat}: said ${b.promised}, did ${b.actual}`).join(' | ') || 'none broken');

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: a dial is on the wrong clock');
