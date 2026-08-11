// Does playing the fight screen beat skipping it?
//
// That is the only question that matters about a battle screen with a skip button, and it is
// answerable rather than a matter of taste. This runs the same engagements — identical armies,
// identical ground — under four policies and compares what each achieves:
//
//   auto           the skip button, the baseline to beat
//   always-hold    does one standing order dominate?
//   always-charge  the same question from the other side
//   adaptive       charge when out-shot, rally at the morale trough, reserve at contact
//
// If `adaptive` cannot beat `auto`, the screen has no agency and no amount of animation will
// fix that. If `always-hold` or `always-charge` beats `adaptive`, an order dominates and the
// choice is fake.
//
// Usage: node test_scripts/battle-lab.mjs [fightsPerPolicy]
import { chromium } from 'playwright';

const FIGHTS = Number(process.argv[2] ?? 240);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260812, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });

const out = await page.evaluate(async (fights) => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const CFG = await import('/src/game/ascentConfig.ts');
  const st = window.__mandateState;

  const mkArmy = (id, kingdomId, landId, total, archerShare, heavyShare, morale, level) => ({
    id, kingdomId, landId,
    name: id,
    units: {
      archers: Math.round(total * archerShare),
      heavyInfantry: Math.round(total * heavyShare),
      spearmen: total - Math.round(total * archerShare) - Math.round(total * heavyShare),
    },
    morale, supply: 90, level, experience: 0, experienceToNextLevel: 160,
    rations: 999, provisions: 999, autoDefend: false,
  });

  // A deterministic-ish spread of matchups: sometimes we out-shoot them, sometimes not,
  // sometimes we are outnumbered. A policy that only wins one shape of fight is not a policy.
  const scenarios = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < fights; i += 1) {
    scenarios.push({
      ours: 900 + Math.round(rnd() * 700),
      // Scaled against us on purpose: the player's court bonuses and the ground's
      // defensive edge both favour the defender, and at a 100% win rate no policy can
      // possibly differentiate. Contested fights are the only ones that measure anything.
      theirs: Math.round((900 + rnd() * 700) * 1.55),
      ourArch: 0.1 + rnd() * 0.45,
      theirArch: 0.1 + rnd() * 0.45,
      ourHeavy: 0.1 + rnd() * 0.25,
      theirHeavy: 0.1 + rnd() * 0.25,
    });
  }

  const land = st.lands.find((l) => l.ownerId === 'dai-viet');

  /** Sets up one engagement and returns the battle object. */
  const setup = (sc) => {
    st.armies = st.armies.filter((a) => a.id !== 'lab-us' && a.id !== 'lab-them');
    const ours = mkArmy('lab-us', 'dai-viet', land.id, sc.ours, sc.ourArch, sc.ourHeavy, 85, 2);
    const theirs = mkArmy('lab-them', 'northern-rival', land.id, sc.theirs, sc.theirArch, sc.theirHeavy, 85, 2);
    st.armies.push(ours, theirs);
    st.ascent.activeBattle = undefined;
    st.ascent.lastWatchedWave = -1;
    st.pendingBattle = {
      invaderArmyId: 'lab-them', landId: land.id, landName: land.name,
      kingdomId: 'northern-rival', kingdomName: 'Lab', isGreat: true,
      attackerPower: 0, defenderPower: 0,
    };
    B.beginBattle(st);
    return st.ascent.activeBattle;
  };

  /** Runs an engagement under a policy and scores it. */
  const run = (sc, policy) => {
    const b = setup(sc);
    if (!b) return null;

    if (policy === 'always-charge') B.setBattlePosture(st, 'press');
    let guard = 0;
    while (!b.over && guard++ < 400) {
      if (policy === 'adaptive') {
        const ours = st.armies.find((a) => a.id === 'lab-us');
        const theirs = st.armies.find((a) => a.id === 'lab-them');
        const met = b.ourAdvance + b.theirAdvance >= 1;
        // Out-shot on the approach? Close the distance. Otherwise stand and shoot.
        if (!met) B.setBattlePosture(st, theirs.units.archers > ours.units.archers ? 'press' : 'hold');
        else {
          // Commit at contact, and rally when the line is about to go.
          if (!b.reserveSpent) B.commitReserve(st);
          else if (!b.rallySpent && b.ourMorale < CFG.BATTLE_ROUT_MORALE + 12) B.rally(st);
          B.setBattlePosture(st, b.ourMorale > b.theirMorale ? 'press' : 'hold');
        }
      }
      B.fightRound(st);
    }

    const ours = st.armies.find((a) => a.id === 'lab-us');
    const theirs = st.armies.find((a) => a.id === 'lab-them');
    // Reserve never committed still counts — those men are alive.
    const ourLeft = (ours ? ours.units.spearmen + ours.units.archers + ours.units.heavyInfantry : 0)
      + (b.reserveSpent ? 0 : b.reserve.spearmen + b.reserve.archers + b.reserve.heavyInfantry);
    const theirLeft = theirs ? theirs.units.spearmen + theirs.units.archers + theirs.units.heavyInfantry : 0;
    return {
      won: b.outcome === 'they-rout' || (b.outcome === 'spent' && ourLeft > theirLeft),
      routed: b.outcome === 'they-rout' || b.outcome === 'we-rout',
      weRouted: b.outcome === 'we-rout',
      beats: b.round,
      ourLeftShare: ourLeft / Math.max(1, b.ourStart),
      ratio: ourLeft / Math.max(1, theirLeft),
    };
  };

  const policies = ['auto', 'always-hold', 'always-charge', 'adaptive'];
  const results = {};
  for (const policy of policies) {
    const rows = scenarios.map((sc) => run(sc, policy)).filter(Boolean);
    const n = rows.length || 1;
    results[policy] = {
      n: rows.length,
      winRate: rows.filter((r) => r.won).length / n,
      routRate: rows.filter((r) => r.routed).length / n,
      weRoutedRate: rows.filter((r) => r.weRouted).length / n,
      survivors: rows.reduce((s, r) => s + r.ourLeftShare, 0) / n,
      beats: rows.reduce((s, r) => s + r.beats, 0) / n,
    };
  }

  // Composition: does bringing bowmen actually pay?
  const compo = (ourArch, theirArch) => {
    const rows = [];
    for (let i = 0; i < 90; i += 1) {
      // A controlled experiment, deliberately unlike the contested scenarios above: equal
      // numbers, and a passive standing order. Measuring this under `adaptive` hid the effect
      // entirely, because charging when out-shot is exactly how a good player *counters* enemy
      // archers — the policy was cancelling the very thing being measured.
      rows.push(run({ ours: 1200, theirs: 1200, ourArch, theirArch, ourHeavy: 0.15, theirHeavy: 0.15 }, 'always-hold'));
    }
    // Survivor share, not win rate. Win rate is binary and the window where a 1200-strong host
    // sometimes-but-not-always beats a 1500-strong one is too narrow to read anything from:
    // both compositions won at 1500 and both lost at 1860. How many men come home is continuous
    // and answers the actual question — does bringing bowmen pay?
    return rows.reduce((sum, r) => sum + r.ourLeftShare, 0) / rows.length;
  };

  return {
    results,
    archerHeavyWins: compo(0.5, 0.12),
    archerLightWins: compo(0.12, 0.5),
    tickMs: CFG.BATTLE_TICK_MS,
  };
}, FIGHTS);

await browser.close();

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const R = out.results;
console.log(`═══ BATTLE LAB — ${R.auto.n} engagements per policy ═══\n`);
console.log('policy          win rate   rout rate   we routed   survivors   beats');
for (const [name, r] of Object.entries(R)) {
  console.log(
    `${name.padEnd(14)} ${pct(r.winRate).padStart(8)} ${pct(r.routRate).padStart(11)} `
    + `${pct(r.weRoutedRate).padStart(11)} ${pct(r.survivors).padStart(11)} ${r.beats.toFixed(1).padStart(7)}`);
}

const edge = R.adaptive.winRate - R.auto.winRate;
const bestFixed = Math.max(R['always-hold'].winRate, R['always-charge'].winRate);
const seconds = (R.adaptive.beats * out.tickMs) / 1000;

console.log('\n── TARGETS ──');
const line = (ok, label, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${detail}`);
line(edge >= 0.15, 'playing beats skipping (adaptive - auto >= 15pt)', `${(edge * 100).toFixed(1)} pts`);
line(R.adaptive.winRate >= bestFixed, 'no single order beats playing well', `adaptive ${pct(R.adaptive.winRate)} vs best fixed ${pct(bestFixed)}`);
line(Math.abs(R['always-hold'].winRate - R['always-charge'].winRate) <= 0.2,
  'neither order dominates the other', `hold ${pct(R['always-hold'].winRate)} / charge ${pct(R['always-charge'].winRate)}`);
line(R.adaptive.routRate >= 0.25 && R.adaptive.routRate <= 0.5, 'routs in 25-50% of fights', pct(R.adaptive.routRate));
line(seconds >= 8 && seconds <= 22, 'melee lasts 8-22s', `${seconds.toFixed(1)}s`);
line(out.archerHeavyWins - out.archerLightWins >= 0.06, 'archers measurably pay off (survivors)',
  `${pct(out.archerHeavyWins)} vs ${pct(out.archerLightWins)}`);
console.log(`\nconsole errors: ${errors.length ? errors.slice(0, 3).join(' ; ') : 'none'}`);
