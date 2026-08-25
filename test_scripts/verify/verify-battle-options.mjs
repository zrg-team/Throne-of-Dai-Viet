// The two dials the player owns: how fast the enemy answers, and how fast a round goes by.
//
// Both defend the same claim — that they are *settings* and not a rewrite. Difficulty may only
// change the invader's reaction time; if it moved damage or morale it would be a different game at
// each tier rather than a harder one. Speed may only change pacing; its two numbers have to stay
// paired, because `advanceBattle` resolves a burst of beats on the economy tick and the screen
// drains one per `tickMs` — drift between them and the view either runs dry mid-season or falls
// permanently behind the fight it is drawing.
//
// And both must default to what the game did before they existed, or every harness in this
// directory is measuring a dial nobody set.
//
//   node test_scripts/verify/verify-battle-options.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
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

const read = await page.evaluate(async () => {
  const O = await import('/src/game/battleOptions.ts');
  const cfg = await import('/src/game/ascentConfig.ts');
  const out = { defaults: {}, tiers: {}, speeds: {}, base: {} };
  out.defaults = { difficulty: O.getBattleDifficulty(), speed: O.getBattleSpeed() };
  out.base = { beats: cfg.BATTLE_BEATS_PER_TICK, tick: cfg.BATTLE_TICK_MS, seasonMs: cfg.ASCENT_TICK_MS };
  for (const tier of O.BATTLE_DIFFICULTIES) {
    O.setBattleDifficulty(tier);
    out.tiers[tier] = { delay: O.battleReactDelay(), even: O.battleAnswersEven() };
  }
  for (const speed of O.BATTLE_SPEEDS) {
    O.setBattleSpeed(speed);
    out.speeds[speed] = { beats: O.battleBeatsPerTick(), tick: O.battleTickMs() };
  }
  // Left as found, or the next harness to run in this browser profile inherits a dial.
  O.setBattleDifficulty('medium');
  O.setBattleSpeed('normal');
  return out;
});

check(read.defaults.difficulty === 'medium' && read.defaults.speed === 'normal',
  'both default to what the game did before they existed', JSON.stringify(read.defaults));
check(read.tiers.medium.delay === 0 && read.tiers.medium.even === false,
  'and the default tier adds nothing to the invader\u2019s reaction',
  JSON.stringify(read.tiers.medium));
check(read.speeds.normal.beats === read.base.beats && read.speeds.normal.tick === read.base.tick,
  'and the default pace is the constants themselves',
  `${read.speeds.normal.beats}x${read.speeds.normal.tick} against ${read.base.beats}x${read.base.tick}`);

// Monotone: every step up the ladder is a quicker answer, never a slower one.
const order = ['easy', 'medium', 'hard', 'nightmare'];
const delays = order.map((t) => read.tiers[t].delay);
check(delays.every((d, i) => i === 0 || d <= delays[i - 1]),
  'each tier answers at least as fast as the one below it',
  order.map((t, i) => `${t} ${delays[i] >= 0 ? '+' : ''}${delays[i]}`).join('  '));
check(read.tiers.nightmare.even === true && read.tiers.easy.even === false,
  'and only the top tier refuses to rest on an even matchup');

// The pairing. Each profile has to spend about a season's worth of milliseconds on a season's
// worth of beats, or the picture and the simulation come apart.
const paired = Object.entries(read.speeds).map(([name, p]) => ({
  name, ms: p.beats * p.tick, ratio: (p.beats * p.tick) / read.base.seasonMs,
}));
check(paired.every((p) => p.ratio > 0.9 && p.ratio <= 1),
  'every pace drains a season\u2019s beats inside the season that made them',
  paired.map((p) => `${p.name} ${p.ms}ms of ${read.base.seasonMs}`).join('  '));
const rates = ['slow', 'normal', 'fast'].map((s) => read.speeds[s].beats);
check(rates.every((r, i) => i === 0 || r > rates[i - 1]),
  'and a faster pace really is more rounds a season', rates.join(' < '));

// ── The one that matters: does the dial reach the fight? ────────────────────
//
// Driven through the real resolver rather than read off the profile table, because a setting that
// is stored and never consulted looks identical to one that works.
await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(700);
const reach = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const O = await import('/src/game/battleOptions.ts');
  const arena = window.__phaserGame.scene.getScene('BattleArenaScene');
  const walk = (tier) => {
    O.setBattleDifficulty(tier);
    arena.ourMen = 1400; arena.theirMen = 1400; arena.martial = 60;
    const st = arena.buildArenaState();
    const b = st.ascent.activeBattle;
    /**
     * Put them in a shape ours beats, then fight exactly one beat.
     *
     * The alternative — running a whole engagement and counting beats spent in transit — measures
     * two things at once and gets the answer wrong: an easy enemy walks for longer but walks fewer
     * times, and the two cancel. This is the dial itself: given an invader obliged to answer, how
     * many beats do they take?
     *
     * Read as `theirReformBeats + 1` because `settleFormations` spends one beat of the walk at the
     * end of the very beat that ordered it.
     */
    const RING = ['chong', 'xung', 'tan', 'quy', 'no'];
    const step = (RING.indexOf(b.theirFormation) - RING.indexOf(b.ourFormation) + 5) % 5;
    if (step !== 1 && step !== 2) {
      b.ourFormation = RING[(RING.indexOf(b.theirFormation) + 4) % 5];
    }
    b.theirReformBeats = 0;
    b.theirFormationTarget = undefined;
    /**
     * A held counter is the PLAYER's counter, and it was just taken.
     *
     * Both stamps matter, and this check silently measured nothing without them. Unsteered, the
     * covering officer re-orders our shape underneath the experiment; and `beatsSinceOurShape`
     * left undefined reads as long-settled (`?? 99`), so every tier answered on the very first
     * beat and the old walk-clock readout returned the flat reform length — 2, 2, 2 — whatever
     * the dial said. Stamped fresh, the hesitation gate is the thing actually on the clock.
     */
    B.markPlayerSteered(st);
    b.beatsSinceOurShape = 0;
    // At contact, because the hesitation clock only runs while the two are trading — during the
    // approach `beatsSinceOurShape` stands still and no tier answers anything, so a measurement
    // that starts at range times the walk-in, not the dial.
    b.ourAdvance = 0.5;
    b.theirAdvance = 0.5;
    const was = b.theirFormation;
    for (let i = 1; i <= 24 && !b.over; i += 1) {
      B.fightRound(st);
      // Counted to the LANDING, not the order: hesitation plus the walk is the whole of what a
      // player holding the counter gets to spend, and the landing is the one event every tier
      // leaves a trace of — a one-beat walk is ordered and settled inside a single round.
      if (b.theirFormation !== was) return i;
    }
    return -1;
  };
  const out = { easy: walk('easy'), medium: walk('medium'), nightmare: walk('nightmare') };
  O.setBattleDifficulty('medium');
  return out;
});
check(reach.easy > reach.medium && reach.medium > reach.nightmare && reach.nightmare >= 1,
  'the dial reaches the fight: each tier answers a held counter in fewer beats',
  `beats to answer — easy ${reach.easy}, medium ${reach.medium}, nightmare ${reach.nightmare}`);
check(reach.nightmare >= 1,
  'and even the worst of them has to walk at least one beat',
  `nightmare ${reach.nightmare}`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
console.log(passed === results.length
  ? 'PASS: the two dials change the fight, and change nothing else'
  : 'FAIL: a dial does not do what it says');
process.exit(passed === results.length ? 0 : 1);
