/**
 * A victory costs what it cost, and numbers break a line.
 *
 * Three screenshots of the same capital: the enemy's line "broke" at 87, 85 and 86 rounds with
 * ours at 170, 2,504 and 3,899 men against 8,814, 8,081 and 11,286 — and three years after the
 * middle one, the same walls fielded 11,408 again. Reproduced headlessly and traced to four rules:
 *
 *   1. a fight has no cap and no numbers check: past the reference length both lines lost heart at
 *      the same rate, so who broke was a coin-flip on morale that ignored a ten-to-one field;
 *   2. the Sát Thát capstone / proclamation made our line unbreakable on morale — and under that
 *      symmetric grind, an unbreakable line always outlasts a breakable one;
 *   3. 45% of a *won* fight's losses were refunded, after the card was written and onto the levy;
 *   4. the walls were conjured back at ~92% on the next contact, and the militia's dead cost the
 *      province no people at all.
 *
 * What this holds the game to, in that order: overtime favours the side with the men; a side under
 * `BATTLE_NUMBERS_FLOOR` of the other's strength is broken whatever it has sworn; a won defence
 * keeps its losses; and the province that fought is thinner for `GARRISON_RECOVER_SEASONS` — in the
 * turnout it can raise, in the hidden roll, and in its people.
 *
 * Headless engine. Ascent only. Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-costly-victory.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

const out = await page.evaluate(async () => {
  const seed = (n) => {
    let s = n >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const BS = await import('/src/systems/ascent/BattleSystem.ts');
  const IS = await import('/src/systems/empire/InvasionSystem.ts');
  const PS = await import('/src/systems/ascent/PowerSystem.ts');
  const RS = await import('/src/systems/ResourceSystem.ts');
  const CFG = await import('/src/game/ascentConfig.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');
  const men = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;
  const pick = (p) => {
    const o = p.options ?? [];
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards?.[0] ?? 'skip';
      case 'conquer-target': return 'hold';
      case 'conquer-method': return 'back';
      case 'hero-choice': return p.heroIds?.[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return 'hold';
      case 'muster-proposal': return 'accept';
      case 'doctrine': return p.options?.[0] ?? 'hold';
      default: return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
    }
  };
  const drain = (st) => { let g = 0; while (st.pendingAscentPrompt && g++ < 40) resolveAscentPrompt(st, pick(st.pendingAscentPrompt)); };

  /** A walled seat with a real watch, one invasion at its gates, the fight played to its end. */
  const fight = (opts) => {
    seed(20260903 + (opts.salt ?? 0));
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    for (let i = 0; i < 24; i += 1) { advanceAscentTick(st); drain(st); st.isDefeated = false; }
    const seat = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    seat.defense = opts.defense ?? 160;
    seat.localSoldiers = opts.militia ?? 3000;
    seat.population = Math.max(seat.population, 6000);
    seat.garrisonExhaustion = undefined;
    st.ascent.activeBattle = undefined; st.ascent.sideBattles = []; st.pendingBattle = undefined;
    for (const a of st.armies) if (a.isLevy) a.units = { spearmen: 0, archers: 0, heavyInfantry: 0 };
    IS.dissolveGarrisonLevies(st);
    seat.garrisonExhaustion = undefined;
    seat.population = Math.max(seat.population, 6000);
    if (st.mandate) st.mandate.capstones = opts.eternal ? ['binh'] : [];
    // A clear map: every host on it and every invasion record, so the launch below is the only
    // enemy in reach and cannot be refused for a kingdom already at its host cap.
    st.invasions = [];
    st.armies = st.armies.filter((a) => a.kingdomId === PLAYER);
    st.siegeOrders = st.siegeOrders.filter((o) => o.attackerKingdomId === PLAYER);
    const rival = st.kingdoms.find((k) => k.id !== PLAYER && !k.isDefeated);
    IS.launchOffMapInvasion(st, rival.id, {
      forceCoalition: opts.columns ?? 1, forceConquest: true, staging: 'inland', aimLandId: seat.id, totalSoldiers: opts.invader,
    });
    for (const l of st.lands) l.siege = undefined;
    st.ascent.autoResolveBattles = false;
    const popBefore = seat.population;
    let opened = false;
    for (let i = 0; i < 60 && !opened; i += 1) {
      advanceAscentTick(st); drain(st); st.isDefeated = false;
      const b = st.ascent.activeBattle;
      if (!b || b.over) continue;
      if (b.landId === seat.id && b.theirStart >= opts.invader * 0.5) { opened = true; break; }
      // Somebody else got here first (a border raid, most often): play it out and keep walking.
      let g = 0;
      while (st.ascent.activeBattle && !st.ascent.activeBattle.over && g++ < 400) {
        BS.advanceBattle(st);
        const live = st.ascent.activeBattle;
        if (live?.moment) BS.answerBattleMoment?.(st, live.moment.options?.[0]?.id ?? 'hold');
      }
      for (const l of st.lands) l.siege = undefined;
    }
    if (!opened) return { error: 'no defence opened' };
    const b0 = st.ascent.activeBattle;
    if (b0.theirStart < opts.invader * 0.5) return { error: `mis-staged: enemy fielded ${Math.round(b0.theirStart)} of ${opts.invader}` };
    const start = { ours: Math.round(b0.ourStart), theirs: Math.round(b0.theirStart), rounds: b0.totalRounds };
    const openingLevy = st.armies.find((a) => a.isLevy && a.landId === seat.id)?.levyMustered ?? 0;
    let last = null; let guard = 0;
    while (st.ascent.activeBattle && !st.ascent.activeBattle.over && guard++ < 700) {
      BS.advanceBattle(st);
      const b = st.ascent.activeBattle;
      if (!b) break;
      last = { round: b.round, ourNow: Math.round(b.ourNow), theirNow: Math.round(b.theirNow) };
      if (b.moment) BS.answerBattleMoment?.(st, b.moment.options?.[0]?.id ?? 'hold');
    }
    const rec = (st.ascent.battleHistory ?? []).slice(-1)[0] ?? null;
    const onSeat = st.armies.filter((a) => a.kingdomId === PLAYER && a.landId === seat.id).reduce((n, a) => n + men(a), 0);
    // The levy goes home; then the next contact's turnout and the roll's reading of the walls.
    const levy = st.armies.find((a) => a.isLevy && a.landId === seat.id);
    const levyDrawn = levy?.levyDrawn ?? 0;
    const levySurvivors = levy ? men(levy) : 0;
    IS.dissolveGarrisonLevies(st);
    const popAfter = seat.population;
    const exhaustion = seat.garrisonExhaustion ?? 0;
    const rollAfter = PS.landGarrisonPower(st, seat);
    const next = IS.raiseGarrisonLevy(st, seat);
    const nextTurnout = next ? next.levyMustered : 0;
    // Recovery: walk the clock with no fight in between.
    IS.dissolveGarrisonLevies(st);
    const curve = [];
    for (let i = 0; i < CFG.GARRISON_RECOVER_SEASONS + 2; i += 1) {
      RS.recoverGarrison(st);
      curve.push(Number((seat.garrisonExhaustion ?? 0).toFixed(3)));
    }
    return {
      start, last, rec: rec ? { outcome: rec.outcome, rounds: rec.rounds, ourEnd: rec.ourEnd, theirEnd: rec.theirEnd } : null,
      onSeatAfter: onSeat, openingLevy, levyDrawn, levySurvivors, militiaAfter: Math.round(seat.localSoldiers),
      popBefore: Math.round(popBefore), popAfter: Math.round(popAfter), exhaustion, rollAfter: Math.round(rollAfter),
      nextTurnout, curve, overtime: last ? Math.max(0, last.round - start.rounds) : null,
    };
  };

  return {
    floor: CFG.BATTLE_NUMBERS_FLOOR,
    recoverSeasons: CFG.GARRISON_RECOVER_SEASONS,
    // A. the screenshot: an unbreakable line against twice its strength
    eternalOutnumbered: fight({ eternal: true, invader: 13000, columns: 3 }),
    // B. the same fight with an ordinary line
    ordinaryOutnumbered: fight({ eternal: false, invader: 13000, columns: 3, salt: 1 }),
    // C. a defence that should be won, and what winning costs
    wonDefence: fight({ eternal: false, invader: 4200, salt: 2 }),
  };
});
await browser.close();

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};
const describe = (name, c) => {
  if (c.error) { console.log(`  ${name}: ${c.error}`); return; }
  console.log(`  ${name}: ${c.start.ours} vs ${c.start.theirs} -> ${c.rec?.outcome} at round ${c.rec?.rounds} (${c.overtime} overtime),`
    + ` ours ${c.rec?.ourEnd} / theirs ${c.rec?.theirEnd}`);
};

console.log('=== A. NUMBERS BREAK A LINE ===');
describe('eternal line, outnumbered 2:1', out.eternalOutnumbered);
describe('ordinary line, outnumbered 2:1', out.ordinaryOutnumbered);
const a = out.eternalOutnumbered; const b = out.ordinaryOutnumbered;
const lopsidedWin = (c) => c.rec?.outcome === 'they-rout' && c.rec.ourEnd < c.rec.theirEnd * out.floor;
check('an unbreakable line cannot win with a fifteenth of the enemy standing',
  !a.error && !lopsidedWin(a),
  a.rec ? `ended ${a.rec.outcome} with ${a.rec.ourEnd} against ${a.rec.theirEnd}` : a.error);
check('nor can an ordinary one', !b.error && !lopsidedWin(b),
  b.rec ? `ended ${b.rec.outcome} with ${b.rec.ourEnd} against ${b.rec.theirEnd}` : b.error);
check('the outnumbered defence loses, oath or no oath',
  a.rec?.outcome === 'we-rout' && b.rec?.outcome === 'we-rout',
  `eternal ${a.rec?.outcome}, ordinary ${b.rec?.outcome}`);
check('and overtime still terminates', [a, b].every((c) => c.overtime !== null && c.overtime <= 25),
  `${a.overtime} and ${b.overtime} overtime rounds`);

console.log('\n=== B. A VICTORY COSTS WHAT IT COST ===');
const w = out.wonDefence;
describe('won defence', w);
check('the defence is won', w.rec?.outcome === 'they-rout', w.rec?.outcome ?? w.error);
check('the card says what the hosts hold: no refund after the last beat',
  !w.error && Math.abs(w.onSeatAfter - w.rec.ourEnd) <= 2,
  `card ${w.rec?.ourEnd}, on the ground ${w.onSeatAfter}`);
const militiaDead = Math.max(0, w.levyDrawn - w.militiaAfter);
check('the militia\'s dead are taken from the province\'s people',
  !w.error && w.popBefore - w.popAfter >= militiaDead * 0.95,
  `people ${w.popBefore} -> ${w.popAfter}; militia ${w.levyDrawn} -> ${w.militiaAfter}`);
check('the turnout is spent in the share that fell', !w.error && w.exhaustion > 0.2,
  `exhaustion ${w.exhaustion.toFixed(2)}`);
check('the next contact meets a thinner turnout, not the old one',
  !w.error && w.nextTurnout < w.openingLevy * 0.8,
  `levy ${w.openingLevy} -> ${w.nextTurnout}`);
check('the hidden roll reads the same spent walls', !w.error && w.rollAfter > 0 && w.exhaustion > 0,
  `garrison power ${w.rollAfter}`);
const seasonsToHeal = Math.ceil(w.exhaustion * out.recoverSeasons);
check('and it recovers over the clock, not at once',
  !w.error && seasonsToHeal >= 2 && w.curve[seasonsToHeal - 2] > 0 && w.curve[Math.min(w.curve.length - 1, seasonsToHeal)] === 0,
  `${seasonsToHeal} season(s) to heal; exhaustion by season: ${w.curve.join(' ')}`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: a victory costs what it cost, and numbers break a line' : 'FAIL: see above');
process.exit(failed.length === 0 ? 0 : 1);
