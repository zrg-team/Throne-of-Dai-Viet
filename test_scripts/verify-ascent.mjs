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

await page.goto('http://127.0.0.1:5173/?capture=1', { waitUntil: 'domcontentloaded' });
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
      case 'empire-response': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
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
const takenGroups = result.edicts.map((id) => exclusiveGroups[id]).filter(Boolean);
const noDoubleGroup = new Set(takenGroups).size === takenGroups.length;

const checks = {
  'never falsely won (B1 guard)': result.victoryEverTrue === false,
  'power more than doubled': result.powerEnd > result.powerStart * 2 || result.peakPower > result.powerStart * 2,

  // ── the restored core systems ──
  'conquer prompt fired': (kinds['conquer-target'] ?? 0) > 0,
  'method sheet fired': (kinds['conquer-method'] ?? 0) > 0,
  'three or more acquisition methods used': result.distinctMethods >= 3,
  'appointment card fired': (kinds['court-appointment'] ?? 0) > 0,
  'two or more court seats filled': result.seatsFilled >= 2,
  'law card fired': (kinds['law-choice'] ?? 0) > 0,
  'two or more edicts enacted': result.edicts.length >= 2,
  'no two edicts from one exclusive group': noDoubleGroup,
  'parliament fired': (kinds['parliament'] ?? 0) > 0,
  'parliament deck drew without replacement': result.drawnTwice.length === 0,
  'envoy card fired': (kinds['envoy'] ?? 0) > 0,
  'rival empires evolved': rivalMoved,

  // ── pacing contract ──
  // The contract is about the *scheduled* cards. A wave landing or the run ending is
  // time-critical and is allowed to interrupt whatever came before it.
  'scheduled cards never land on consecutive ticks':
    result.backToBackKinds.every((k) => ['empire-response', 'wave-result', 'run-over'].includes(k)),
  'no prompt left unanswerable': result.stuckPrompts.length === 0,

  // ── unchanged run shape ──
  'power-draft fired': (kinds['power-draft'] ?? 0) > 0,
  'hero-choice fired': (kinds['hero-choice'] ?? 0) > 0,
  'empire-response fired': (kinds['empire-response'] ?? 0) > 0,
  'wave-result fired': (kinds['wave-result'] ?? 0) > 0,
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
