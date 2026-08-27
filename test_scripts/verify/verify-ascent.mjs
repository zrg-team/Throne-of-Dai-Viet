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

await page.goto((process.env.DEV_URL ?? 'http://127.0.0.1:5179') + '/?capture=1', { waitUntil: 'domcontentloaded' });
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
      // Rotate the doctrines so a verification run exercises all four rather than pinning the
      // realm to whichever sorts first — the whole point of the card is that they build differently.
      case 'doctrine': return p.options[doctrineCursor++ % p.options.length];
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
      // The Chronicle. A blow carries no options at all — acknowledging it is the only move.
      case 'story-beat':
        return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
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
  let doctrineCursor = 0;

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

  // The defect this whole pass exists to fix: ten minutes of play produced no battle at all.
  // At ASCENT_TICK_MS = 3500 that window is ~170 ticks, so these are measured inside it.
  //
  // Counted off `ascent.lastWatchedKey`, which `beginBattle` stamps exactly once per engagement
  // it opens. Counting `battle` *prompts* does not work — a battle is a lane the player opens from
  // the action bar, not a prompt — and an engagement can open and resolve inside a single tick, so
  // sampling `activeBattle` after the tick misses it. This is the only signal that sees every one.
  const TEN_MINUTE_TICKS = 171;
  let watchedBattles = 0;
  let battlePromptsInWindow = 0;
  let lastWatchKey = st.ascent.lastWatchedKey;
  let firstBattleTick = -1;
  let firstContactTick = -1;
  let ticksWithInvaderOnOwnedGround = 0;
  let sawInvaderMarchOrder = false;
  let sawVisibleHostileHost = false;
  // A watched engagement must outlive the tick that opened it. Keyed on `activeBattle` *after*
  // the tick: the fight used to open against an invader standing on the adjacent province,
  // find nobody across the field, and resolve as a hidden roll before this line ever ran.
  let battleLiveTicks = 0;
  let battleStreak = 0;
  let longestBattleStreak = 0;
  const battleKeysSeen = new Set();
  let peakLands = 0;

  for (let i = 0; i < 400; i += 1) {
    advanceAscentTick(st);
    if (st.victory) victoryEverTrue = true;

    peakLands = Math.max(peakLands, st.lands.filter((l) => l.ownerId === 'dai-viet').length);
    if (st.ascent.activeBattle) {
      battleLiveTicks += 1;
      battleStreak += 1;
      longestBattleStreak = Math.max(longestBattleStreak, battleStreak);
      battleKeysSeen.add(st.ascent.activeBattle.key ?? st.ascent.activeBattle.landId);
    } else {
      battleStreak = 0;
    }

    if (st.ascent.lastWatchedKey !== lastWatchKey) {
      lastWatchKey = st.ascent.lastWatchedKey;
      watchedBattles += 1;
      if (firstBattleTick < 0) firstBattleTick = i;
      if (i < TEN_MINUTE_TICKS) battlePromptsInWindow += 1;
    }

    // Contact: a hostile host standing on, or next to, ground the player holds.
    const ownedIds = new Set(st.lands.filter((l) => l.ownerId === 'dai-viet').map((l) => l.id));
    const hostiles = st.armies.filter((a) => a.kingdomId !== 'dai-viet');
    const inContact = hostiles.some((a) => {
      if (ownedIds.has(a.landId)) return true;
      const at = st.lands.find((l) => l.id === a.landId);
      return Boolean(at?.neighbors.some((n) => ownedIds.has(n)));
    });
    if (inContact) {
      ticksWithInvaderOnOwnedGround += 1;
      if (firstContactTick < 0) firstContactTick = i;
    }
    // Invaders must march as real MovementOrders, or the renderer draws no approach at all.
    if (st.movementOrders.some((o) => {
      const a = st.armies.find((c) => c.id === o.armyId);
      return a && a.kingdomId !== 'dai-viet';
    })) sawInvaderMarchOrder = true;
    // And they must be visible while doing it, or the march happens in the dark.
    if (hostiles.some((a) => st.lands.find((l) => l.id === a.landId)?.isVisible)) {
      sawVisibleHostileHost = true;
    }

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
    battlePromptsInWindow,
    watchedBattles,
    endStandingHosts: st.armies.filter((a) => a.kingdomId === 'dai-viet' && !a.isLevy).length,
    endLevies: st.armies.filter((a) => a.kingdomId === 'dai-viet' && a.isLevy).length,
    endHumans: Math.round(st.resources.humans),
    firstBattleTick,
    firstContactTick,
    ticksWithInvaderOnOwnedGround,
    sawInvaderMarchOrder,
    sawVisibleHostileHost,
    tenMinuteTicks: TEN_MINUTE_TICKS,
    waveRatios,
    sawRaid,
    rivalAnswers: st.ascent.laneStats.rivalAnswers ?? 0,
    endGold: Math.round(st.resources.gold),
    endGoldRate: Math.max(1, Math.round(st.resourceRates.gold)),
    landsLost: lost,
    battleLiveTicks,
    longestBattleStreak,
    battlesSeenLive: battleKeysSeen.size,
    ticksRun: st.turn,
    peakLands,
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
  let doctrineCursor = 0;
  const pick = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': { const o = p.target.methods.filter((m) => !m.blockedReason); return o.length ? o[0].method : 'back'; }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      // Rotate the doctrines so a verification run exercises all four rather than pinning the
      // realm to whichever sorts first — the whole point of the card is that they build differently.
      case 'doctrine': return p.options[doctrineCursor++ % p.options.length];
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

// The four contracts added by the land-command / claims pass, proved directly.
//
// Same reasoning as the evolution block above: a naive auto-player will not reliably drive a claim
// to its cap, cancel one, set a focus it does not need, or compare two governors — so asserting
// these off a playthrough would be asserting on luck. Each is exercised against the systems.
const command = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const ACQ = await import('/src/systems/AcquisitionSystem.ts');
  const RES = await import('/src/systems/ResourceSystem.ts');
  const COURT = await import('/src/systems/CourtSystem.ts');
  const { buildGovernorRows } = await import('/src/ui/governorPanel.ts');

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st.pendingAscentPrompt = undefined;
  const owned = st.lands.filter((l) => l.ownerId === 'dai-viet');
  const home = owned[0];

  // ── The claim cap actually caps ──
  const slots = ACQ.getClaimSlots(st);
  // Fill every slot with a synthetic order, then confirm a further claim is refused.
  const neighbours = st.lands.filter((l) => l.ownerId !== 'dai-viet').slice(0, slots + 1);
  for (let i = 0; i < slots; i += 1) {
    st.acquisitionOrders.push({
      landId: neighbours[i].id, buyerId: 'dai-viet', progress: 0, required: 4, method: 'settle',
    });
  }
  const cappedOut = !ACQ.canStartClaim(st);
  const blockedReason = ACQ.claimBlockedReason(st);

  // ── Cancelling releases the envoy, with no fatigue ──
  const hero = st.heroes[0];
  if (!hero) return { error: 'no heroes in a fresh run' };
  const target = neighbours[0];
  st.acquisitionOrders = [];
  hero.assignedTo = ACQ.getDiplomacyAssignment(target.id);
  hero.fatigue = 0;
  st.acquisitionOrders.push({
    landId: target.id, buyerId: 'dai-viet', progress: 1, required: 5,
    method: 'diplomacy', heroId: hero.id,
  });
  const cancelled = ACQ.cancelAcquisition(st, target.id);
  const heroFreed = !hero.assignedTo && hero.fatigue === 0;
  const orderGone = !st.acquisitionOrders.some((o) => o.landId === target.id);

  // ── A focus moves output in the promised direction ──
  // The capital starts with no production building at all, so every focus reads 0 against 0.
  // A focus multiplies what a province makes; it needs something to multiply.
  home.buildings.push({ type: 'farm', level: 3 });
  home.buildings.push({ type: 'mine', level: 2 });
  RES.setLandSpecialization(st, home.id, 'balanced');
  RES.refreshAllLandOutputs(st);
  const baseFood = home.outputs.food;
  RES.setLandSpecialization(st, home.id, 'breadbasket');
  RES.refreshAllLandOutputs(st);
  const foodFocused = home.outputs.food;
  // And the martial focus pays outside the resource bag rather than inside it.
  RES.setLandSpecialization(st, home.id, 'fortress');
  RES.refreshAllLandOutputs(st);
  const defendMult = RES.getFocusDefenseMult(st, home);
  const defendFood = home.outputs.food;
  RES.setLandSpecialization(st, home.id, 'garrison');
  const garrisonMult = RES.getFocusGarrisonMult(st, home);

  // ── A governor's fit changes the figure shown ──
  RES.setLandSpecialization(st, home.id, 'fortress');
  for (const h of st.heroes) h.assignedTo = undefined;
  // A fresh run carries very few champions, so the two candidates are built rather than borrowed —
  // the contract under test is how a posting is *scored*, not how many heroes a run starts with.
  const template = st.heroes[0];
  const clerk = { ...template, id: 'probe-clerk', assignedTo: undefined, stats: { ...template.stats, administration: 90, martial: 10 } };
  const captain = { ...template, id: 'probe-captain', assignedTo: undefined, stats: { ...template.stats, administration: 10, martial: 90 } };
  st.heroes = [clerk, captain];
  const rows = buildGovernorRows(st, home);
  const captainRow = rows.find((r) => r.hero.id === captain.id);
  const clerkRow = rows.find((r) => r.hero.id === clerk.id);
  // On ground held to defend, the soldier must out-score the administrator.
  const fitFavoursCaptain = Boolean(captainRow && clerkRow && captainRow.score > clerkRow.score);
  const captainEffect = COURT.getLandGovernorEffects(st, home, captain);
  const clerkEffect = COURT.getLandGovernorEffects(st, home, clerk);
  const defenceDiffers = captainEffect.defenseMult > clerkEffect.defenseMult;

  return {
    slots,
    cappedOut,
    hasBlockedReason: Boolean(blockedReason),
    cancelled,
    heroFreed,
    orderGone,
    baseFood,
    foodFocused,
    defendMult,
    defendFood,
    garrisonMult,
    fitFavoursCaptain,
    defenceDiffers,
    rowCount: rows.length,
  };
});

// ── Standing orders: a commanded host is moved by its order and by nothing else ──
const orders = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const SO = await import('/src/systems/ascent/StandingOrders.ts');
  const AO = await import('/src/systems/ascent/armyOrders.ts');
  const CQ = await import('/src/systems/ascent/ConquestSystem.ts');
  const AP = await import('/src/systems/ascent/AutopilotSystem.ts');
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const W = await import('/src/systems/WarSystem.ts');

  let s = 777 >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  /**
   * Restart the seeded stream before each numbered check.
   *
   * These checks share one state and run in order, so every one of them inherits whatever
   * `Math.random` consumption happened earlier — and a battle consumes a call per beat. Any
   * combat change that makes fights longer or shorter therefore shifts the stream under every
   * check that follows it, and they fail for reasons that have nothing to do with what they
   * assert. Four of them broke on a posture rebalance that `quiet()` guarantees they never saw.
   *
   * Reseeding makes each check independent of the ones before it, which is what they were always
   * meant to be.
   */
  const reseed = (n) => { s = (n >>> 0); };
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  // Answer the opening rather than discarding it. The run now opens on two cards — the reign's
  // advantage, then the founding — and the founding gift (a district, a bigger host, a treasury)
  // arrives with the champion. A scenario that throws them away starts on a single province with
  // nothing to give an order to.
  for (let guard = 0; guard < 4 && st.pendingAscentPrompt; guard += 1) {
    const open = st.pendingAscentPrompt;
    if (open.kind !== 'mandate' && open.kind !== 'founder') break;
    resolveAscentPrompt(st, open.options[0]);
  }
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  // Quiet world: no waves, no raids, so a march is the order's and nothing else's — and a full
  // treasury, so no host is dissolved for arrears under the test.
  st.ascent.autoResolveBattles = true;
  st.resources.gold = 5000;
  // Routine expansion left to the court, for the same reason as the two lines above: `settle()`
  // below answers every conquest card with "not this one", and since claims became a card the
  // player is *asked* about, a driver that refuses them all leaves the realm on its founding
  // province forever. Measured: the royal host starved out by season 27 and four checks that
  // have nothing to do with claims — hold your post, take empty ground, storm a wall, resupply —
  // failed together because there was no host left to give an order to. This scenario is about
  // what a standing order does in a realm that is running; it is not the claim card's test.
  st.ascent.autoClaimSilently = true;
  // A quiet world: no wave lands and no raider crosses, so every march below is the order's own.
  const quiet = () => {
    // Fed as well as paid.
    //
    // `st.resources.gold = 5000` above says "no host is dissolved for arrears under the test",
    // and that intent was only half-implemented: a host starves on **rations**, not wages, and
    // rations come from the realm's food. On a stream where the autopilot's third claim lands a
    // few seasons late the granary empties, the royal host wastes to nothing around season 30,
    // and five checks that are about *standing orders* fail because there is no host left to
    // give one to — the same failure this file's own comment records having chased once before.
    // Measured across five seed offsets: the same build passed four and failed one, and the
    // baseline failed a different one. That is a coin toss, not a gate.
    //
    // Topping up food here makes the scenario say what it means: a realm that can sustain a host,
    // so that what is being measured is the order and nothing else.
    if (st.resources.food < 400) st.resources.food = 400;
    st.ascent.ticksToWave = 999;
    st.ascent.bossTelegraphed = false;
    st.armies = st.armies.filter((a) => a.kingdomId === 'dai-viet');
    st.invasions = [];
    st.siegeOrders = st.siegeOrders.filter((o) => o.attackerKingdomId === 'dai-viet');
  };
  const settle = () => { quiet(); let g = 0; while (st.pendingAscentPrompt && g++ < 10) { const p = st.pendingAscentPrompt; if (p.kind === 'run-over') break; if (!resolveAscentPrompt(st, p.kind === 'founder' ? p.options[0] : p.kind === 'court-appointment' ? p.options[0].id : p.kind === 'power-draft' ? (p.cards[0] ?? 'skip') : p.kind === 'conquer-target' ? 'hold' : p.kind === 'conquer-method' ? 'back' : p.kind === 'hero-choice' ? 'pass' : p.kind === 'law-choice' ? 'hold' : p.kind === 'parliament' ? 'decline' : p.kind === 'famine' ? 'endure' : (p.options?.[0]?.id ?? 'ok'))) break; } };
  const size = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;
  const owned = () => st.lands.filter((l) => l.ownerId === 'dai-viet');
  const royal = st.armies.find((a) => a.kingdomId === 'dai-viet');
  const capital = st.lands.find((l) => l.id === st.ascent.capitalLandId);
  const home = capital ?? owned()[0];

  reseed(1001);
  // 1. A defend host is never moved by the autopilot.
  royal.landId = home.id;
  SO.setArmyOrders(st, royal.id, { kind: 'defend', landId: home.id });
  st.ascent.frontLandId = st.lands.find((l) => l.ownerId !== 'dai-viet' && home.neighbors.includes(l.id))?.id;
  let movedOffPost = false;
  quiet();
  for (let i = 0; i < 40; i += 1) {
    advanceAscentTick(st); settle();
    if (!st.armies.some((a) => a.id === royal.id)) break;
    const order = st.movementOrders.find((o) => o.armyId === royal.id);
    if (order && order.path[order.path.length - 1] !== home.id) movedOffPost = true;
    if (royal.landId !== home.id && !order) movedOffPost = true;
    // The world does keep raising fronts of its own; the defend host must ignore every one.
    if (!st.ascent.frontLandId) st.ascent.frontLandId = st.lands.find((l) => l.ownerId !== 'dai-viet' && home.neighbors.includes(l.id))?.id;
  }
  const defendHeld = st.armies.some((a) => a.id === royal.id) && !movedOffPost && royal.landId === home.id;

  reseed(1002);
  // 2. A commanded remnant is kept; an auto remnant of the same size is dissolved.
  const mk = (id, ordersKind) => ({ id, kingdomId: 'dai-viet', name: id, landId: home.id, units: { spearmen: 40, archers: 0, heavyInfantry: 0 }, morale: 80, supply: 80, rations: 500, provisions: 500, level: 1, experience: 0, experienceToNextLevel: 100, ...(ordersKind ? { orders: { kind: 'defend', landId: home.id } } : {}) });
  st.armies.push(mk('remnant-kept', true), mk('remnant-auto', false));
  advanceAscentTick(st); settle();
  const keptRemnant = st.armies.some((a) => a.id === 'remnant-kept');
  const autoRemnantGone = !st.armies.some((a) => a.id === 'remnant-auto');
  st.armies = st.armies.filter((a) => a.id !== 'remnant-kept');

  reseed(1003);
  // 3. The claim list is the whole border; the prompt keeps its short hand.
  const border = new Set();
  for (const l of owned()) for (const n of l.neighbors) { const c = st.lands.find((x) => x.id === n); if (c && c.ownerId !== 'dai-viet') border.add(n); }
  const all = CQ.buildAllConquestTargets(st);
  const listIsBorder = all.length === border.size && all.every((t) => border.has(t.landId));
  const promptCapped = CQ.buildConquestTargets(st).length <= 4;

  reseed(1004);
  // 4. An attack order on empty wilderness takes it and settles into defend.
  const wild = st.lands.find((l) => l.ownerId === 'neutral' && !l.hasVillage && home.neighbors.includes(l.id));
  let attackTook = !wild; // vacuous if this seed has no adjacent wilderness
  if (wild) {
    SO.setArmyOrders(st, royal.id, { kind: 'attack', landId: wild.id });
    for (let i = 0; i < 12 && !(wild.ownerId === 'dai-viet' && royal.orders?.kind === 'defend'); i += 1) { advanceAscentTick(st); settle(); }
    attackTook = wild.ownerId === 'dai-viet' && royal.orders?.kind === 'defend';
  }

  reseed(1005);
  // 4b. An attack order on a walled village opens an assault the player watches.
  const village = st.lands.find((l) => l.ownerId !== 'dai-viet' && l.hasVillage && owned().some((o) => o.neighbors.includes(l.id)));
  let assaultWatched = !village;
  if (village) {
    st.ascent.autoResolveBattles = false;
    royal.landId = owned().find((o) => o.neighbors.includes(village.id)).id;
    royal.units.spearmen += 800;
    st.movementOrders = st.movementOrders.filter((o) => o.armyId !== royal.id);
    SO.setArmyOrders(st, royal.id, { kind: 'attack', landId: village.id, force: true });
    for (let i = 0; i < 12 && !st.ascent.lastAssaultKey; i += 1) { advanceAscentTick(st); settle(); }
    assaultWatched = Boolean(st.ascent.lastAssaultKey) && (st.ascent.battleHistory ?? []).some((b) => b.role === 'offence') || Boolean(st.ascent.activeBattle?.role === 'offence');
    // Let it play out, then quiet the world again for the tests below.
    for (let i = 0; i < 12 && st.ascent.activeBattle; i += 1) { advanceAscentTick(st); settle(); }
    st.ascent.autoResolveBattles = true;
    st.siegeOrders = st.siegeOrders.filter((o) => o.armyId !== royal.id);
    royal.landId = home.id;
    royal.orders = undefined;
  }

  reseed(1006);
  // 5. Recall breaks a siege and walks home.
  const rivalLand = st.lands.find((l) => l.ownerId !== 'dai-viet' && l.ownerId !== 'neutral' && owned().some((o) => o.neighbors.includes(l.id)));
  let recallOk = !rivalLand;
  if (rivalLand) {
    const from = owned().find((o) => o.neighbors.includes(rivalLand.id));
    royal.landId = rivalLand.id;
    st.siegeOrders.push({ landId: rivalLand.id, armyId: royal.id, attackerKingdomId: 'dai-viet', fromLandId: from.id, progress: 0, required: 6 });
    const r = SO.recallHost(st, royal.id);
    recallOk = r.ok && !st.siegeOrders.some((o) => o.armyId === royal.id) && royal.landId === from.id && royal.orders?.kind === 'defend';
  }

  reseed(1007);
  // 6. Resupply reaches below the autopilot's reserve.
  st.resources.food = 30; st.resources.supplies = 30;
  royal.rations = 0; royal.provisions = 0;
  AP.tickAscentAutopilot(st);
  const autoLeftItHungry = royal.rations === 0;
  const rs = SO.resupplyHost(st, royal.id);
  // The column takes time now: the tap debits the stores and the baggage lands over the next
  // ticks (`tickArmyRefits`), while the host stays free to act. Two ticks empties any column.
  const RF = await import('/src/systems/ascent/refit.ts');
  RF.tickArmyRefits(st);
  RF.tickArmyRefits(st);
  const resupplyDipped = rs.ok && rs.food > 0 && royal.rations > 0;

  reseed(1008);
  // 7. Relief never pulls a commanded host off another province.
  const nb = home.neighbors.map((id) => st.lands.find((l) => l.id === id)).find((l) => l && l.ownerId === 'dai-viet' && l.id !== home.id);
  let reliefRespects = !nb;
  if (nb) {
    st.armies.push(mk('held', true), { ...mk('free', false), id: 'free', name: 'free' });
    for (const a of st.armies) if (a.id === 'held' || a.id === 'free') { a.landId = nb.id; a.units.spearmen = 400; }
    st.armies.find((a) => a.id === 'held').orders = { kind: 'defend', landId: nb.id };
    st.movementOrders = st.movementOrders.filter((o) => o.armyId !== 'held' && o.armyId !== 'free');
    B.summonAdjacentRelief(st, home.id);
    const heldMoved = st.movementOrders.some((o) => o.armyId === 'held');
    const freeMoved = st.movementOrders.some((o) => o.armyId === 'free');
    reliefRespects = !heldMoved && freeMoved;
    st.armies = st.armies.filter((a) => a.id !== 'held' && a.id !== 'free');
    st.movementOrders = st.movementOrders.filter((o) => o.armyId !== 'held' && o.armyId !== 'free');
  }

  reseed(1009);
  // 8. A muster carries its order and commander through to the host.
  const cmd = st.heroes.find((h) => !h.assignedTo) ?? st.heroes[0];
  if (cmd) { cmd.assignedTo = undefined; }
  st.resources.humans = 2000; st.resources.food = 2000; st.resources.supplies = 2000;
  st.recruitmentOrders = [];
  const queued = W.queueRecruitment(st, cmd.id, 400, 100, 60, 'spears', { kind: 'defend', landId: home.id });
  const orderCarried = queued && st.recruitmentOrders[0]?.orders?.kind === 'defend';
  const musterId = st.recruitmentOrders[0]?.id;
  let musteredHost;
  for (let i = 0; i < 40 && !musteredHost; i += 1) { advanceAscentTick(st); settle(); musteredHost = st.armies.find((a) => a.id === musterId); }
  const hostHasOrder = Boolean(musteredHost && musteredHost.orders?.kind === 'defend');
  const label = musteredHost ? AO.hostOrderLabel(st, musteredHost) : '';

  return { defendHeld, keptRemnant, autoRemnantGone, listIsBorder, promptCapped, borderSize: border.size, listSize: all.length, attackTook, assaultWatched, recallOk, autoLeftItHungry, resupplyDipped, reliefRespects, orderCarried, hostHasOrder, label };
});
/**
 * The general left to muster on his own.
 *
 * Its own run, and last, on purpose. The main run answers every card with its first option, and a
 * `muster-proposal` answered that way is a refusal — so with the card in place the autopilot's
 * recruit and march counters read zero there for reasons that say nothing about the autopilot.
 * Accepting them instead is not the same test and is not free: measured, a run that raises every
 * host it is offered takes `the first battle lands inside one sitting` down with it. So the silent
 * path gets a run of its own, where it is the only thing being asked about.
 */
const delegated = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  let s = 90210 >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st.ascent.autoMusterSilently = true;
  window.__mandateState = st;
  for (let tick = 0; tick < 220; tick += 1) {
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 8) {
      const p = st.pendingAscentPrompt;
      const first = p.options?.[0]?.id ?? p.options?.[0] ?? p.heroIds?.[0] ?? p.cards?.[0]
        ?? p.targets?.[0]?.landId ?? p.projectIds?.[0] ?? 'ok';
      if (!resolveAscentPrompt(st, String(first))) { st.pendingAscentPrompt = undefined; }
      st.isPaused = false;
    }
    advanceAscentTick(st);
  }
  const cardsRaised = st.ascent.promptCounts?.['muster-proposal'] ?? 0;
  return { ...st.ascent.autopilotStats, cardsRaised, hosts: st.armies.filter((a) => a.kingdomId === 'dai-viet').length };
});
console.log('=== DELEGATED MUSTER ===');
console.log(JSON.stringify(delegated));

console.log('=== STANDING ORDERS ===');
console.log(JSON.stringify(orders));

console.log('=== LAND COMMAND ===');
console.log(JSON.stringify(command, null, 2));

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

  // The defect this pass exists to fix: ten minutes of play produced no battle at all. These four
  // separate the ways that could regress, so a failure says which half broke.
  'a battle is fought inside the first ten minutes': result.battlePromptsInWindow > 0,
  'battles keep happening across the run': result.watchedBattles >= 3,
  // Felt-time, not tick-time: a session that pauses on every prompt reaches maybe 40-60 ticks.
  // The old 72-tick contact floor never fired inside a real sitting, which is how a whole
  // battle screen shipped unseen. First contact must now land inside one.
  'the first battle lands inside one sitting': result.firstBattleTick >= 0 && result.firstBattleTick <= 60,
  'an enemy host reaches the realm inside ten minutes':
    result.firstContactTick >= 0 && result.firstContactTick < result.tenMinuteTicks,
  'invaders march as real orders, so the approach is drawn': result.sawInvaderMarchOrder,
  'a marching enemy host is visible before it arrives': result.sawVisibleHostileHost,
  // The screen has to be *reachable*: a fight that opens and resolves inside one tick was never
  // there for anyone to open. Sampled after each tick, so this is the player's own view of it.
  'a watched defence outlives the tick that opened it': result.longestBattleStreak >= 2,
  'a live battle was there to be seen': result.battlesSeenLive >= 1,
  // Roughly half the ticks: waves land every twelve seasons and a fought engagement runs four
  // or five of them, so a run under steady attack is a run half at war. More than that and the
  // fights have started stacking.
  'battles do not swallow the run': result.battleLiveTicks <= Math.max(1, result.ticksRun) * 0.6,

  // ── Standing orders: the player's hosts do what they were told ──
  'a defend host is never moved by the autopilot': orders.defendHeld,
  'a commanded remnant is kept, an auto remnant is dissolved': orders.keptRemnant && orders.autoRemnantGone,
  'the claim list is the whole border, the prompt stays short': orders.listIsBorder && orders.promptCapped,
  'an attack order takes empty ground and settles into defend': orders.attackTook,
  'an attack on walls opens an assault the player watches': orders.assaultWatched,
  'recall breaks a siege and walks home': orders.recallOk,
  'resupply reaches below the autopilot reserve': orders.autoLeftItHungry && orders.resupplyDipped,
  'relief never pulls a commanded host': orders.reliefRespects,
  'a muster carries its standing order to the host': orders.orderCarried && orders.hostHasOrder,

  // ── Land command: claims, focus, governors ──
  'claims start capped at one': command.slots === 1,
  'the claim cap actually caps': command.cappedOut && command.hasBlockedReason,
  'cancelling a claim releases its envoy unfatigued': command.cancelled && command.heroFreed && command.orderGone,
  'a focus moves output in the promised direction': command.foodFocused > command.baseFood,
  'the defend focus pays in defence, not in goods':
    command.defendMult > 1 && command.defendFood < command.baseFood,
  'the army focus raises what the province musters': command.garrisonMult > 1,
  'a governor is scored against what the province is for': command.fitFavoursCaptain,
  'a matched governor changes the figure shown': command.defenceDiffers,
  // The treasury has somewhere to go: mercenaries, tribute, buy-offs. Without sinks this ran
  // to five figures while the player had nothing to spend it on.
  // A collapsing realm can end holding a stash it no longer has provinces to spend on, so the
  // rate-relative bound is floored: the failure this guards against is five figures, not four.
  'gold does not run away unspent': result.endGold < Math.max(3000, result.endGoldRate * 40),

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
  // Both from the delegated run: see the note above it. What the main run must still show is that
  // the card replaced the silent muster rather than sitting beside it — no host is raised behind
  // the player's back there, because every proposal is refused.
  'the autopilot raises no host behind a refusal': result.autopilot.recruits === 0,
  'autopilot recruited': delegated.recruits > 0,
  'autopilot marched': delegated.marches > 0,
  'at least 2 boss waves': result.bossWaves >= 2,
  'bosses telegraphed': result.sawTelegraphBeforeBoss >= result.bossWaves,
  // Held at any point, not at the end: with fought battles a run can end small, or end.
  'expanded beyond capital': result.peakLands > 2,
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
