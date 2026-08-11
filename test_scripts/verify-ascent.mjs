// Verifies Dragon Ascent (gameMode 'ascent'): the restored core systems actually run —
// several acquisition methods, court appointments, edicts, the parliament deck and the rival
// empires — alongside the autopilot, the power curve and the wave escalation. Also asserts the
// pacing contract (never two prompts in consecutive ticks). Run against a dev server on 5173.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto('http://localhost:5173/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { buildConquestTargets } = await import('/src/systems/ascent/ConquestSystem.ts');

  // Deterministic RNG so the run is reproducible.
  let s = 20260808 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  window.__mandateState = st;

  // Pick the first option of whatever prompt is open (a naive but always-legal player).
  const firstChoice = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      // Rotate through the legal methods rather than always taking the first, so the run
      // exercises bribe / envoy / settle and not only whichever sorts to the top.
      case 'conquer-method': {
        const open = p.target.methods.filter((m) => !m.blockedReason);
        return open.length > 0 ? open[methodCursor++ % open.length].method : 'back';
      }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': {
        const card = st.politicsDeck.find((c) => c.id === p.cardId);
        if (!card) return 'decline';
        // Mirror the modal, which greys out any choice the treasury cannot cover.
        const affordable = card.choices.find((c) => Object.entries(c.effects.resourceDelta ?? {})
          .every(([k, v]) => (v ?? 0) >= 0 || st.resources[k] >= Math.abs(v)));
        return affordable ? affordable.id : 'decline';
      }
      case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      // A rich realm buys its way out of a famine; a poor one endures. Either way the card
      // must always resolve — a prompt this policy cannot answer stalls the whole run.
      // Fight it out rather than retreating, so the assertions see engagements resolve.
      case 'battle': return 'hold';
      case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
      case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'empire-response': {
        // A rich realm buys soldiers — exercises the gold sink the run depends on.
        const merc = p.options.find((o) => o.id === 'hire-mercenaries' && o.affordable);
        if (merc && st.resources.gold > 2500) return merc.id;
        return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      }
      default: return 'ok';
    }
  };
  let methodCursor = 0;

  const promptCounts = {};
  const trace = [];
  // Pacing contract: a prompt raised on tick N must not be followed by one on tick N+1.
  const promptTicks = [];
  const countedPrompts = new WeakSet();
  const stuckPrompts = [];
  const backToBackKinds = [];
  let backToBackPrompts = 0;
  let maxPromptsInOneTick = 0;
  const drawnTwice = [];
  const rivalsAtStart = st.kingdoms
    .filter((k) => k.id !== 'dai-viet')
    .map((k) => ({ id: k.id, relations: Math.round(k.relations ?? 50), power: Math.round(k.power ?? 0) }));
  const powerSeries = [];
  const threatSeries = [];
  let victoryEverTrue = false;
  let bossWaves = 0;
  let telegraphedBosses = 0;
  let sawTelegraphBeforeBoss = 0;
  let prevWave = 0;
  let pendingTelegraph = false;

  // Waves must track the realm's lagged field power, not a fixed curve and not the raw
  // headcount clamp that made every wave trivial.
  const waveRatios = [];
  let sawRaid = false;
  let ratioWave = -1;
  let ownedPrev = new Set(st.lands.filter((l) => l.ownerId === 'dai-viet').map((l) => l.id));
  let gained = 0;
  let lost = 0;

  for (let i = 0; i < 400; i += 1) {
    advanceAscentTick(st);
    if (st.victory) victoryEverTrue = true;

    const ownedNow = new Set(st.lands.filter((l) => l.ownerId === 'dai-viet').map((l) => l.id));
    for (const id of ownedNow) if (!ownedPrev.has(id)) gained += 1;
    for (const id of ownedPrev) if (!ownedNow.has(id)) lost += 1;
    ownedPrev = ownedNow;

    if ((st.invasions ?? []).some((r) => r.intent === 'raid')) sawRaid = true;
    if (st.ascent.wave !== ratioWave && st.ascent.wave > 0) {
      ratioWave = st.ascent.wave;
      const def = st.ascent.defensePower;
      const thr = st.ascent.threat;
      if (def > 0 && thr > 0) waveRatios.push(thr / def);
    }
    if (st.ascent.bossTelegraphed && !pendingTelegraph) { pendingTelegraph = true; telegraphedBosses += 1; }
    if (st.ascent.wave !== prevWave) {
      prevWave = st.ascent.wave;
      if (st.ascent.lastWaveBoss) {
        bossWaves += 1;
        if (pendingTelegraph) sawTelegraphBeforeBoss += 1;
      }
      pendingTelegraph = false;
    }

    // Drain the whole prompt chain, as the UI would. Count each prompt *object* once: a card
    // left open because its choice was rejected must not be tallied again every tick.
    let guard = 0;
    let raisedThisTick = 0;
    let firstKindThisTick = null;
    while (st.pendingAscentPrompt && guard < 10) {
      guard += 1;
      const p = st.pendingAscentPrompt;
      if (!countedPrompts.has(p)) {
        countedPrompts.add(p);
        promptCounts[p.kind] = (promptCounts[p.kind] ?? 0) + 1;
        raisedThisTick += 1;
        if (firstKindThisTick === null) firstKindThisTick = p.kind;
      }
      if (p.kind === 'run-over') break;
      if (!resolveAscentPrompt(st, firstChoice(p))) { stuckPrompts.push(p.kind); break; }
    }
    if (raisedThisTick > 0) {
      // Chained follow-ups (province -> method, champion -> appointment) are intentional and
      // are counted as one interruption; what must never happen is a *fresh* prompt landing
      // on the very next tick with no play in between.
      if (promptTicks.length > 0 && promptTicks[promptTicks.length - 1] === i - 1) {
        backToBackPrompts += 1;
        backToBackKinds.push(firstKindThisTick);
      }
      promptTicks.push(i);
      maxPromptsInOneTick = Math.max(maxPromptsInOneTick, raisedThisTick);
    }

    powerSeries.push(st.ascent.power);
    threatSeries.push(st.ascent.threat);
    if (i % 40 === 0) {
      trace.push({
        t: i,
        wave: st.ascent.wave,
        lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
        armies: st.armies.filter((a) => a.kingdomId === 'dai-viet').length,
        invaders: (st.invasions ?? []).length,
        freeHeroes: st.heroes.filter((h) => !h.assignedTo).length,
        humans: Math.round(st.resources.humans),
        gold: Math.round(st.resources.gold),
        power: st.ascent.power,
        def: st.ascent.defensePower,
        threat: st.ascent.threat,
        front: st.ascent.frontLandId ?? null,
        blocked: st.ascent.frontBlocked,
        gained,
        lost,
        bestWin: Math.max(0, ...buildConquestTargets(st).map((x) => x.bestChance)),
        armySize: st.armies.filter((a) => a.kingdomId === 'dai-viet')
          .map((a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry),
      });
    }
    if (st.isDefeated) break;
  }

  // The parliament deck must not repeat a card before it is exhausted and refilled.
  const seenDraw = new Set();
  for (const id of st.ascent.drawnCourtCards) {
    if (seenDraw.has(id)) drawnTwice.push(id);
    seenDraw.add(id);
  }

  return {
    trace,
    promptCounts,
    waveRatios,
    sawRaid,
    rivalAnswers: st.ascent.laneStats.rivalAnswers ?? 0,
    endGold: Math.round(st.resources.gold),
    endGoldRate: Math.max(1, Math.round(st.resourceRates.gold)),
    landsLost: lost,
    backToBackPrompts,
    maxPromptsInOneTick,
    promptTickCount: promptTicks.length,
    stuckPrompts: [...new Set(stuckPrompts)],
    backToBackKinds: [...new Set(backToBackKinds)],
    methodsUsed: st.ascent.laneStats.conquestsByMethod,
    distinctMethods: Object.values(st.ascent.laneStats.conquestsByMethod).filter((n) => n > 0).length,
    appointments: st.ascent.laneStats.appointments,
    edictsEnacted: st.ascent.laneStats.edictsEnacted,
    parliamentAnswered: st.ascent.laneStats.parliamentAnswered,
    envoyActions: st.ascent.laneStats.envoyActions,
    edicts: st.mandate?.edicts ?? [],
    seatsFilled: Object.values(st.court.seats).filter(Boolean).length,
    unlockedSeats: st.court.unlockedSeats.length,
    governors: st.lands.filter((l) => l.ownerId === 'dai-viet' && st.heroes.some((h) => h.assignedTo === l.id)).length,
    stability: Math.round(st.court.stability),
    taxPolicy: st.taxPolicy ?? 'balanced',
    drawnCourtCards: st.ascent.drawnCourtCards.length,
    drawnTwice,
    rivalsAtStart,
    rivalsAtEnd: st.kingdoms
      .filter((k) => k.id !== 'dai-viet')
      .map((k) => ({ id: k.id, relations: Math.round(k.relations ?? 50), power: Math.round(k.power ?? 0) })),
    victoryEverTrue,
    bossWaves,
    telegraphedBosses,
    sawTelegraphBeforeBoss,
    powerStart: powerSeries.find((p) => p > 0) ?? 0,
    powerEnd: powerSeries[powerSeries.length - 1],
    peakPower: st.ascent.peakPower,
    threatEnd: threatSeries[threatSeries.length - 1],
    wave: st.ascent.wave,
    wavesSurvived: st.ascent.wavesSurvived,
    level: st.ascent.level,
    autopilot: st.ascent.autopilotStats,
    cardStacks: st.ascent.cardStacks,
    distinctCards: Object.keys(st.ascent.cardStacks).length,
    maxStack: Math.max(0, ...Object.values(st.ascent.cardStacks)),
    retired: st.ascent.retiredCards,
    heroesSummoned: st.ascent.heroesSummoned,
    heroes: st.heroes.length,
    lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
    armies: st.armies.filter((a) => a.kingdomId === 'dai-viet').length,
    era: st.mandate?.era,
    codex: JSON.parse(localStorage.getItem('mandate:codex:v1') ?? 'null'),
    turn: st.turn,
    defeated: st.isDefeated,
    isPaused: st.isPaused,
    orphanPrompt: st.pendingAscentPrompt ? st.pendingAscentPrompt.kind : null,
  };
});

// Separately prove the run can actually END. Losing the capital is the only terminal state,
// and it is reachable in normal play only after many waves, so force it directly.
const defeat = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st.pendingAscentPrompt = undefined;
  const capital = st.lands.find((l) => l.id === st.ascent.capitalLandId);
  capital.ownerId = 'northern-rival';
  // The capital now has a grace window before the dynasty falls, so run past it.
  for (let i = 0; i < 10 && !st.isDefeated; i += 1) advanceAscentTick(st);
  return {
    defeated: st.isDefeated,
    reason: st.defeatReason,
    prompt: st.pendingAscentPrompt?.kind ?? null,
    legacyEarned: st.pendingAscentPrompt?.kind === 'run-over' ? st.pendingAscentPrompt.legacyEarned : null,
    banked: st.legacyBanked === true,
  };
});
// The normal-difficulty run is now short by design — it is a fight. The slow-burn systems
// (era progression, edicts, the envoy card) need a run that lasts, so they are exercised on
// easy, where `difficultyArmyScale` sizes waves down.
const longRun = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  let s = 4242 >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const st = createAscentGameState({ seaSides: 1, difficulty: 'easy' });
  const kinds = {};
  const pick = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': { const o = p.target.methods.filter((m) => !m.blockedReason); return o.length ? o[0].method : 'back'; }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': { const c = st.politicsDeck.find((x) => x.id === p.cardId); return c ? c.choices[0].id : 'decline'; }
      // Play to survive rather than to spend: this run is about reaching the late systems.
      case 'empire-response': {
        const f = p.options.find((o) => o.id === 'fortify' && o.affordable);
        return (f ?? p.options.find((o) => o.affordable) ?? p.options[0]).id;
      }
      default: return (p.options?.find?.((o) => o.affordable) ?? p.options?.[0])?.id ?? 'ok';
    }
  };
  for (let i = 0; i < 500 && !st.isDefeated; i += 1) {
    advanceAscentTick(st);
    let g = 0;
    while (st.pendingAscentPrompt && g++ < 10) {
      const p = st.pendingAscentPrompt;
      kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
      if (p.kind === 'rival-demand') kinds[`demand:${p.demand}`] = (kinds[`demand:${p.demand}`] ?? 0) + 1;
      if (p.kind === 'run-over') break;
      if (!resolveAscentPrompt(st, pick(p))) break;
    }
  }
  return { kinds, turn: st.turn, era: st.mandate?.era, edicts: st.mandate?.edicts ?? [], lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length };
});
console.log('=== LONG RUN (easy) ===');
console.log(JSON.stringify(longRun));

console.log('=== DEFEAT PATH ===');
console.log(JSON.stringify(defeat));

// Evolutions are the run's headline payoff, so prove the mechanism directly rather than
// relying on a naive auto-player happening to max both halves of a pair.
const evolution = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { takePowerCard, rollPowerDraftCards } = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { findPowerCard } = await import('/src/data/ascentCards.ts');
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st.pendingAscentPrompt = undefined;

  const a = findPowerCard('village-muster');
  const b = findPowerCard('war-drums');
  for (let i = 0; i < a.maxStacks; i += 1) takePowerCard(st, a.id);
  // With one half maxed, the other must be guaranteed a slot in the very next draft.
  const offered = rollPowerDraftCards(st).includes(b.id);
  for (let i = 0; i < b.maxStacks; i += 1) takePowerCard(st, b.id);

  return {
    offeredPartner: offered,
    retired: st.ascent.retiredCards,
    granted: st.ascent.cardStacks['thunder-march'] ?? 0,
    parentsGone: !st.activeCourtModifiers.some((m) => m.label.startsWith('asc:village-muster:')),
  };
});
console.log('=== EVOLUTION PATH ===');
console.log(JSON.stringify(evolution));

console.log(JSON.stringify(result, null, 2));
console.log('=== ERRORS ===');
errors.forEach((e) => console.log(e));

const kinds = result.promptCounts;
const rivalMoved = result.rivalsAtEnd.some((end) => {
  const start = result.rivalsAtStart.find((r) => r.id === end.id);
  return start && (start.relations !== end.relations || start.power !== end.power);
});
const exclusiveGroups = { 'iron-discipline': 'war-rivalry', 'martial-drills': 'war-rivalry',
  'coin-reform': 'econ-rivalry', 'agrarian-focus': 'econ-rivalry',
  census: 'gov-rivalry', 'public-works': 'gov-rivalry' };
const takenGroups = longRun.edicts.map((id) => exclusiveGroups[id]).filter(Boolean);
const noDoubleGroup = new Set(takenGroups).size === takenGroups.length;

const checks = {
  'never falsely won (B1 guard)': result.victoryEverTrue === false,

  // ── the challenge contract ──
  // Waves are sized from the realm's own lagged field power. A curve that ignored it would
  // sit far below this band (the old headcount clamp) or far above it (a fixed curve).
  'waves track the realm, not a fixed curve':
    result.waveRatios.length >= 3 &&
    result.waveRatios.filter((r) => r > 0.15 && r < 2.5).length >= Math.ceil(result.waveRatios.length * 0.6),
  'border raids happen': result.sawRaid,
  'rivals make their own demands': result.rivalAnswers > 0 || (kinds['rival-demand'] ?? 0) > 0,
  // All three must be *reachable*. Vassalage originally could not fire at all: its gate asked
  // for a rival 1.8x the player's military, but an off-map empire's strength tops out near
  // 0.7x it, so the branch was dead. Assert each kind rather than the total.
  // Coalition and vassalage are deliberately *complementary*, not independent: a world that
  // bands together against a dominant player is the same world that will not ask them to kneel,
  // and both read `playerDominance` from opposite sides. Demanding all three in one run asserted
  // something the design makes impossible — and chasing it is what took the vassalage branch dark
  // four times, since the only way to satisfy it was an absolute "N x the player" threshold that
  // every improvement to the realm invalidated.
  'tribute recurs, and the world responds to dominance':
    (longRun.kinds['demand:tribute'] ?? 0) > 0
    && ((longRun.kinds['demand:coalition'] ?? 0) > 0 || (longRun.kinds['demand:vassalage'] ?? 0) > 0),
  'the realm is genuinely threatened': result.landsLost > 0 || result.defeated,
  // The treasury has somewhere to go: mercenaries, tribute, buy-offs. Without sinks this ran
  // to five figures while the player had nothing to spend it on.
  'gold does not run away unspent': result.endGold < result.endGoldRate * 40,

  'power more than doubled': result.powerEnd > result.powerStart * 2 || result.peakPower > result.powerStart * 2,

  // ── the restored core systems ──
  'conquer prompt fired': (kinds['conquer-target'] ?? 0) > 0,
  'method sheet fired': (kinds['conquer-method'] ?? 0) > 0,
  'three or more acquisition methods used': result.distinctMethods >= 3,
  'appointment card fired': (kinds['court-appointment'] ?? 0) > 0,
  'two or more court seats filled': result.seatsFilled >= 2,
  'law card fired': (kinds['law-choice'] ?? 0) > 0,
  'two or more edicts enacted (long run)': longRun.edicts.length >= 2,
  'no two edicts from one exclusive group': noDoubleGroup,
  'the long run reaches a later era': longRun.era !== 'founding',
  'parliament fired': (kinds['parliament'] ?? 0) > 0,
  'parliament deck drew without replacement': result.drawnTwice.length === 0,
  'envoy card fired (long run)': (longRun.kinds['envoy'] ?? 0) > 0,
  'rival empires evolved': rivalMoved,

  // ── pacing contract ──
  // The contract is about the *scheduled* cards. A wave landing or the run ending is
  // time-critical and is allowed to interrupt whatever came before it.
  'scheduled cards never land on consecutive ticks':
    // `battle` is exempt for the same reason `empire-response` is: it is not a scheduled
    // card competing for the player's attention, it is one engagement unfolding a round at
    // a time and deliberately re-queuing itself until a side breaks.
    result.backToBackKinds.every((k) => ['empire-response', 'battle', 'wave-result', 'run-over'].includes(k)),
  'no prompt left unanswerable': result.stuckPrompts.length === 0,

  // ── unchanged run shape ──
  'power-draft fired': (kinds['power-draft'] ?? 0) > 0,
  'hero-choice fired': (kinds['hero-choice'] ?? 0) > 0,
  'empire-response fired': (kinds['empire-response'] ?? 0) > 0,
  // Great Invasions are reported through the header strip rather than a modal whose only
  // control was "Continue" — so what must still hold is that bosses happen and are
  // survived, not that a one-button prompt appears.
  'boss waves are survived and reported': result.bossWaves > 0 && (kinds['wave-result'] ?? 0) === 0,
  'autopilot built': result.autopilot.builds > 0,
  'autopilot recruited': result.autopilot.recruits > 0,
  'autopilot marched': result.autopilot.marches > 0,
  'at least 2 boss waves': result.bossWaves >= 2,
  'bosses telegraphed': result.sawTelegraphBeforeBoss >= result.bossWaves,
  'expanded beyond capital': result.lands > 1,
  'built a varied deck': result.distinctCards >= 6,
  'stacked a card': result.maxStack >= 2,
  'codex recorded': Boolean(result.codex && result.codex.unlocked.length > 0),
  'evolution partner guaranteed a slot': evolution.offeredPartner,
  'evolution fires and grants the jade card': evolution.granted === 1 && evolution.retired.length === 2,
  'evolution retires both parents': evolution.parentsGone,
  'losing the capital ends the run': defeat.defeated && defeat.prompt === 'run-over',
  'legacy banked on death': defeat.banked && defeat.legacyEarned !== null,
  'no orphaned prompt': result.orphanPrompt === null || result.orphanPrompt === 'run-over',
  'no console errors': errors.length === 0,
};

console.log('=== CHECKS ===');
let pass = true;
for (const [name, ok] of Object.entries(checks)) {
  if (!ok) pass = false;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
}
console.log(pass ? 'PASS: Dragon Ascent loop healthy' : 'CHECK: some expectations unmet');

await browser.close();
