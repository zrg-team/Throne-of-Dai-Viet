// Verifies Dragon Ascent (gameMode 'ascent'): the autopilot files real orders, POWER
// compounds, every prompt kind fires, waves escalate with telegraphed bosses, and the
// run never trips the enemy-castle victory sweep. Run against a dev server on 5173.
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
  const { buildMarchTargets } = await import('/src/systems/ascent/MarchOrderSystem.ts');

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
      case 'march-order': return p.targets[0]?.landId ?? 'hold';
      case 'hero-summon': return p.heroIds[0] ?? 'pass';
      case 'empire-response': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      default: return 'ok';
    }
  };

  const promptCounts = {};
  const trace = [];
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

    // Drain the whole prompt chain, as the UI would.
    let guard = 0;
    while (st.pendingAscentPrompt && guard < 10) {
      guard += 1;
      const p = st.pendingAscentPrompt;
      promptCounts[p.kind] = (promptCounts[p.kind] ?? 0) + 1;
      if (p.kind === 'run-over') break;
      if (!resolveAscentPrompt(st, firstChoice(p))) break;
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
        bestWin: Math.max(0, ...buildMarchTargets(st).map((x) => x.winChance)),
        armySize: st.armies.filter((a) => a.kingdomId === 'dai-viet')
          .map((a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry),
      });
    }
    if (st.isDefeated) break;
  }

  return {
    trace,
    promptCounts,
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
const checks = {
  'never falsely won (B1 guard)': result.victoryEverTrue === false,
  'power more than doubled': result.powerEnd > result.powerStart * 2 || result.peakPower > result.powerStart * 2,
  'power-draft fired': (kinds['power-draft'] ?? 0) > 0,
  'march-order fired': (kinds['march-order'] ?? 0) > 0,
  'hero-summon fired': (kinds['hero-summon'] ?? 0) > 0,
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
