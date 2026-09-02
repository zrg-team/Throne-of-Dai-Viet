/**
 * The Cabinet of Seals (Phase 3) — the persistent card collection.
 *
 * Verifies the loop end to end in the headless engine: a rubbing spends and reveals under the
 * summon gacha's pity shape, ×3 combines raise a level, a levelled card is applied at its level
 * and drafts with the steeper weight, the opening hand applies stacks and charges ambition, the
 * ceremony grows a bind step, and the store survives garbage.
 *
 * Runs in a fresh Playwright context, so the developer's real localStorage is never touched.
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';

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

const result = await page.evaluate(async () => {
  const cab = await import('/src/state/cabinet.ts');
  const legacy = await import('/src/state/legacy.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { rollPowerDraftCards, takePowerCard } = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { advanceCeremony } = await import('/src/systems/ascent/Ceremony.ts');
  const { resolveAscentPrompt, endAscentRun } = await import('/src/systems/ascent/AscentResolver.ts');

  // Deterministic for the whole page lifetime, like verify-ascent.
  let s = 1337 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const out = {};
  const wipe = () => {
    localStorage.removeItem('mandate:cabinet:v1');
    localStorage.removeItem('mandate:dynasty:v1');
    localStorage.removeItem('mandate:legacy:v1');
    cab.resetCabinetCache();
  };

  // ── Garbage tolerance ────────────────────────────────────────────────────
  const junk = [
    '{{{not json',
    '"a string"',
    '{"cards":{"iron-levy":{"level":1e999,"copies":"x"},"no-such-card":{"level":2,"copies":1}},"rubbings":-4,"openingHand":["ghost","iron-levy"],"learnedRecipes":42}',
  ];
  out.garbage = junk.every((raw) => {
    localStorage.setItem('mandate:cabinet:v1', raw);
    cab.resetCabinetCache();
    try {
      const store = cab.getCabinet();
      return Number.isFinite(store.rubbings) && store.rubbings >= 0
        && !('no-such-card' in store.cards)
        && store.openingHand.every((id) => id !== 'ghost');
    } catch { return false; }
  });

  // ── Round trip ───────────────────────────────────────────────────────────
  wipe();
  cab.addRubbings(3);
  const added = cab.addCabinetCard('iron-levy');
  cab.resetCabinetCache();
  const reread = cab.getCabinet();
  out.roundTrip = added?.outcome === 'new'
    && reread.rubbings === 3
    && reread.cards['iron-levy']?.level === 1
    && reread.cards['iron-levy']?.copies === 1;

  // ── Rubbing reveal honours the pity table ────────────────────────────────
  wipe();
  cab.addRubbings(1);
  // Hard pity: 8 dry pulls owed — the ninth must be gold-or-better and say so.
  localStorage.setItem('mandate:cabinet:v1', JSON.stringify({ ...cab.getCabinet(), rubbingPity: 8 }));
  cab.resetCabinetCache();
  const pityPull = cab.revealRubbing();
  out.hardPity = Boolean(pityPull && pityPull.pityUsed
    && (pityPull.rarity === 'gold' || pityPull.rarity === 'jade')
    && pityPull.remaining === 0);
  out.pityResets = cab.getCabinet().rubbingPity === 0;
  // Spending honesty: no rubbings, no reveal.
  out.noFreePulls = cab.revealRubbing() === undefined;

  // ── Combine: ×3 → Lv2, ×5 → Lv3, melt past the top ───────────────────────
  wipe();
  cab.addCabinetCard('iron-levy');
  cab.addCabinetCard('iron-levy');
  out.notReadyAtTwo = !cab.canCombine('iron-levy');
  cab.addCabinetCard('iron-levy');
  out.readyAtThree = cab.canCombine('iron-levy');
  out.combineTo2 = cab.combineCard('iron-levy') && cab.getCabinet().cards['iron-levy'].level === 2;
  for (let i = 0; i < 5; i += 1) cab.addCabinetCard('iron-levy');
  out.combineTo3 = cab.combineCard('iron-levy') && cab.getCabinet().cards['iron-levy'].level === 3;
  const legacyBefore = legacy.getLegacy().points;
  const melted = cab.addCabinetCard('iron-levy');
  out.meltPastTop = melted?.outcome === 'melted'
    && melted.meltedLegacy > 0
    && legacy.getLegacy().points === legacyBefore + melted.meltedLegacy;

  // ── The levelled card drafts heavier (×1.6 at Lv3) ───────────────────────
  // Counted BEFORE the take below: a taken stack earns the focus bonus (×2.2), which would
  // lift the offer rate on its own and make this check pass with the cabinet weight broken.
  const state1 = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.weightMult = cab.cabinetWeightMult(2) === 1.3 && cab.cabinetWeightMult(3) === 1.6;
  const offers = (state) => {
    let hits = 0;
    for (let i = 0; i < 300; i += 1) {
      if (rollPowerDraftCards(state).includes('iron-levy')) hits += 1;
    }
    return hits;
  };
  const lifted = offers(state1);

  // ── The levelled card is applied at its level ────────────────────────────
  // iron-levy is Lv3 in the cabinet now: taking one stack must apply the Lv3 effect (+18%),
  // not the Lv1 one — the stack index buys copies, the cabinet level buys depth.
  takePowerCard(state1, 'iron-levy');
  const mod = state1.activeCourtModifiers.find((m) => m.label === 'asc:iron-levy:1');
  out.appliedAtLevel = Math.abs((mod?.armyPowerModifier ?? 0) - 0.18) < 1e-9;
  wipe();
  const state2 = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const flat = offers(state2);
  // ×1.6 on a bronze in a wide pool lifts its offer rate well clear of noise over 300 rolls.
  out.draftsHeavier = lifted > flat * 1.15;
  out.draftsHeavierDetail = `${lifted} vs ${flat}`;

  // ── Opening hand: stacks applied, ambition charged ───────────────────────
  wipe();
  cab.addCabinetCard('bronze-drums');
  cab.setOpeningHand(['bronze-drums']);
  const handed = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  wipe();
  const bare = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.handStacks = (handed.ascent?.cardStacks['bronze-drums'] ?? 0) === 1
    && handed.activeCourtModifiers.some((m) => m.label === 'asc:bronze-drums:1');
  out.handAmbition = ((handed.ascent?.ambition ?? 0) - (bare.ascent?.ambition ?? 0)) === 2;
  // Slots clamp: without Deep Shelf only one slot may be filled.
  cab.addCabinetCard('iron-levy');
  cab.addCabinetCard('bronze-drums');
  cab.setOpeningHand(['iron-levy', 'bronze-drums']);
  out.handClamped = cab.openingHand().length === cab.openingHandSlots()
    && cab.openingHandSlots() === 1;

  // ── The ceremony grows a bind step ───────────────────────────────────────
  wipe();
  const run = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  if (run.ascent) {
    run.ascent.cardStacks = { 'iron-levy': 2, 'bronze-drums': 1, 'royal-guard': 1 };
    run.ascent.ceremonyStage = 'reckoning';
  }
  advanceCeremony(run);
  const bindPrompt = run.pendingAscentPrompt;
  out.bindRaised = bindPrompt?.kind === 'bind-card'
    && bindPrompt.options.length === 3
    // Best rarity first: the gold royal-guard leads the fan.
    && bindPrompt.options[0] === 'royal-guard';
  out.bindRefusesStray = resolveAscentPrompt(run, 'no-such-card') === false
    && cab.getCabinet().cards['no-such-card'] === undefined;
  const bound = resolveAscentPrompt(run, 'iron-levy');
  out.bindLands = bound && cab.getCabinet().cards['iron-levy']?.copies === 1;
  out.bindAdvances = run.pendingAscentPrompt?.kind === 'next-reign';

  // ── The run's end always pays a rubbing ──────────────────────────────────
  wipe();
  const dying = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  endAscentRun(dying);
  out.runEndRubbing = cab.getCabinet().rubbings === 1;
  endAscentRun(dying); // re-entrant: the legacyBanked guard must hold the rubbing too
  out.runEndOnce = cab.getCabinet().rubbings === 1;

  wipe();
  return out;
});

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

console.log('=== CABINET STORE ===');
check('garbage-tolerant parse', result.garbage);
check('save round-trip', result.roundTrip);
console.log('=== RUBBINGS ===');
check('hard pity guarantees gold-or-better', result.hardPity);
check('pity resets after a high pull', result.pityResets);
check('no reveal without a rubbing banked', result.noFreePulls);
check('run end pays exactly one rubbing', result.runEndRubbing && result.runEndOnce);
console.log('=== COMBINE ===');
check('two copies do not combine', result.notReadyAtTwo);
check('three copies combine to Lv2', result.readyAtThree && result.combineTo2);
check('five more combine to Lv3', result.combineTo3);
check('a copy past Lv3 melts to Legacy', result.meltPastTop);
console.log('=== THE RUN READS THE CABINET ===');
check('card applies at its cabinet level', result.appliedAtLevel);
check('draft weight steps 1.3 / 1.6', result.weightMult);
check('levelled card drafts heavier', result.draftsHeavier, result.draftsHeavierDetail);
check('opening hand applies one stack', result.handStacks);
check('opening hand charges +2 ambition', result.handAmbition);
check('hand clamps to earned slots', result.handClamped);
console.log('=== THE CEREMONY ===');
check('bind step raises played cards, best first', result.bindRaised);
check('a stray id binds nothing', result.bindRefusesStray);
check('binding files the card', result.bindLands);
check('bind advances to next-reign', result.bindAdvances);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the Cabinet of Seals loop holds — reveal, combine, draft weight, opening hand, bind'
  : 'FAIL: the cabinet loop is broken — see the checks above');
process.exit(failed.length === 0 ? 0 : 1);
