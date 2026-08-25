// A fight ends when a line breaks, and only when a line breaks.
//
// It used to stop at `totalRounds` whether or not anything had been decided, and the commonest
// result of an even engagement was `spent` — both hosts still standing, the field still contested,
// twenty rounds of decisions declared to have settled nothing. The cap is gone. What replaces it is
// `BATTLE_OVERTIME_MORALE`: past the reference length both lines lose heart simply for still being
// there, a little more each round, so a decision always arrives.
//
// The two things worth holding it to are opposites, which is why they are checked together:
//   · a close fight must be ALLOWED past the old cap, or nothing has changed;
//   · and it must still TERMINATE, or an even matchup locks the province for the rest of the run.
//
// The bound is arithmetic, not a timer: the extra drain accumulates as k(k+1)/2 * 1.2, which
// passes a full 100 morale by the thirteenth round of overtime.
//
//   node test_scripts/verify/verify-battle-overtime.mjs
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
await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(700);

// Fought head-on through the real resolver rather than through the screen: `fightRound` is what
// the rule lives in, and a hundred engagements is a sample rather than an anecdote.
const runs = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const cfg = await import('/src/game/ascentConfig.ts');
  const out = [];
  const arena = window.__phaserGame.scene.getScene('BattleArenaScene');
  for (let i = 0; i < 24; i += 1) {
    // Deliberately even: an even fight is the one the old cap always ended undecided.
    arena.ourMen = 900 + (i % 4) * 200;
    arena.theirMen = arena.ourMen + ((i % 3) - 1) * 60;
    arena.martial = 40 + (i % 5) * 12;
    const st = arena.buildArenaState ? arena.buildArenaState() : null;
    if (!st) break;
    const battle = st.ascent.activeBattle;
    if (!battle) break;
    // The officer no longer plays an unclaimed fight (2026-08-25: dials move only when a person
    // moves them, or after a hand-over). Unsteered, our side stands flat, is countered every
    // beat and breaks well before the reference rounds — so no engagement could reach overtime
    // and the "allowed past the cap" half went dark. The rule under test is about CLOSE fights
    // between two commanded hosts, so hand ours to its general: the shipped path for a fight
    // nobody is steering by hand.
    B.delegateBattle(st, true);
    let guard = 0;
    while (!battle.over && guard < 400) { B.fightRound(st); guard += 1; }
    out.push({
      outcome: battle.outcome,
      round: battle.round,
      reference: battle.totalRounds,
      over: battle.over,
      overtime: Math.max(0, battle.round - battle.totalRounds),
    });
  }
  return { out, perRound: cfg.BATTLE_OVERTIME_MORALE };
});

if (!runs.out.length) {
  check(false, 'the arena could hand out engagements to fight', 'no state builder found');
} else {
  const all = runs.out;
  check(all.every((r) => r.over), 'every engagement reached an ending', `${all.length} fought`);
  check(all.every((r) => r.outcome === 'they-rout' || r.outcome === 'we-rout'),
    'and every one of them ended because a line broke',
    [...new Set(all.map((r) => r.outcome))].join(', '));
  check(!all.some((r) => r.outcome === 'spent'),
    'the clock never settles a fight any more');
  const wentLong = all.filter((r) => r.overtime > 0);
  check(wentLong.length > 0,
    'a close fight is allowed past the old cap',
    `${wentLong.length}/${all.length} went into overtime, longest ${Math.max(...all.map((r) => r.overtime))}`);
  // The arithmetic bound, checked as a bound rather than as a hope.
  const worst = Math.max(...all.map((r) => r.overtime));
  check(worst <= 16, 'and none of them grinds on for ever', `worst overtime ${worst} rounds`);
  check(runs.perRound > 0, 'the pressure that guarantees it is real', `${runs.perRound} morale a round`);
}

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
console.log(passed === results.length
  ? 'PASS: fights end by a rout, and they end'
  : 'FAIL: the fight does not resolve the way it says it does');
process.exit(passed === results.length ? 0 : 1);
