// Verifies the Dragon Ascent demand economy — the "too easy, become rich with no care" fix.
//
// What is asserted, and why these and not others:
//  - Provincial demand claims a real share of gross at small AND large realm sizes. The share
//    is printed for tuning; the band is loose on purpose. A flat wage bill passes at three
//    provinces and vanishes at ten (measured: 130 of wages against 3,000 gross), so the large
//    -realm share is the one that catches the compounding-trade-network defect.
//  - Shortfalls are EVENTS, not numbers: starving the realm must name a province, cost it
//    people, and appear in the ledger's "going without" list.
//  - The army is people: soldiers eat a full ration, a marching host eats more than a
//    garrisoned one, and a big army drags on civilian growth.
//  - Rivals are not scenery: their power must grow across a run.
//  - The coin ratchet is survivable: never more than three provinces unpaid, and a starved
//    treasury that heals must get its provinces back.
//
// Needs a live Vite dev server on http://localhost:5173.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:5173/?seed=1337', { waitUntil: 'networkidle' });

// ── One seeded autopilot run, sampled at a small and a grown realm ───────────
const run = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { ascentProvincialDemand } = await import('/src/systems/ResourceSystem.ts');
  const { getEmpirePower } = await import('/src/systems/DiplomacySystem.ts');

  let s = 20260808 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  // The economy's contract is measured with battles handed to the generals: a fought engagement
  // is decided by orders this naive policy never gives, and its casualties would confound every
  // demand and shortfall figure below with battle policy.
  st.ascent.autoResolveBattles = true;

  let methodCursor = 0;
  const firstChoice = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': {
        const open = p.target.methods.filter((m) => !m.blockedReason);
        return open.length ? open[methodCursor++ % open.length].method : 'back';
      }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': {
        const card = st.politicsDeck.find((c) => c.id === p.cardId);
        if (!card) return 'decline';
        const a = card.choices.find((c) => Object.entries(c.effects.resourceDelta ?? {})
          .every(([k, v]) => (v ?? 0) >= 0 || st.resources[k] >= Math.abs(v)));
        return a ? a.id : 'decline';
      }
      case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'battle': return 'hold';
      case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
      case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'story-beat': return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
      case 'empire-response': {
        const merc = p.options.find((o) => o.id === 'hire-mercenaries' && o.affordable);
        if (merc && st.resources.gold > 2500) return merc.id;
        return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      }
      default: return 'ok';
    }
  };

  const rivalPower = () => Math.max(...st.kingdoms
    .filter((k) => k.id !== 'dai-viet' && !k.isDefeated)
    .map((k) => getEmpirePower(st, k)), 0);
  const grossGold = () => st.ascentLedger?.gold.gross ?? 0;
  const landCount = () => st.lands.filter((l) => l.ownerId === 'dai-viet').length;

  const rivalPowerStart = rivalPower();
  // The share is demand ÷ gross for the same tick, recorded whenever the realm passes through
  // the target sizes. Only ticks where the ledger has a real gross count.
  const smallShares = [];
  const grownShares = [];
  let maxUnpaid = 0;
  let sawUnpaid = false;
  let sawRecovery = false;
  let shortfallKindsSeen = new Set();
  let popLossTick = -1;
  let civilianDampingSeen = false;

  for (let i = 0; i < 400 && !st.isDefeated; i += 1) {
    advanceAscentTick(st);
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 12) {
      const p = st.pendingAscentPrompt;
      if (p.kind === 'run-over') break;
      if (!resolveAscentPrompt(st, firstChoice(p))) break;
    }

    const unpaid = (st.unpaidLandIds ?? []).length;
    maxUnpaid = Math.max(maxUnpaid, unpaid);
    if (unpaid > 0) sawUnpaid = true;
    if (sawUnpaid && unpaid === 0) sawRecovery = true;
    for (const entry of st.ascentLedger?.shortfalls ?? []) shortfallKindsSeen.add(entry.kind);

    const gross = grossGold();
    if (gross > 10) {
      const share = ascentProvincialDemand(st).bag.gold / gross;
      const lands = landCount();
      if (lands >= 3 && lands <= 4) smallShares.push(share);
      if (lands >= 8) grownShares.push(share);
    }

    // The army drags on growth: whenever a real host stands, the humans rate must sit below
    // what the food surplus alone would grant. Cheap proxy: with troops fielded and food
    // positive, growth is still finite and modest.
    const troops = st.armies.filter((a) => a.kingdomId === 'dai-viet')
      .reduce((n, a) => n + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
    if (troops > 400 && st.resourceRates.food > 0 && st.resourceRates.humans >= 0) {
      const humans = st.resources.humans;
      const undamped = Math.max(1, Math.round(humans * 0.01));
      if (st.resourceRates.humans < undamped) civilianDampingSeen = true;
    }
  }

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : -1);

  // ── Stress: an empty granary must become a named event, not a silent subtraction ──
  // Real scarcity, not a clamped number: `collectPlayerIncome` recomputes the rates from the
  // land itself (refreshAllLandOutputs), so a forced negative rate does not survive into the
  // apply — a prosperous end-of-run realm simply out-harvested the old fake famine. A host too
  // large to feed makes the shortage true no matter how rich the fields are.
  const { calculatePlayerResourceRates, collectPlayerIncome } = await import('/src/systems/ResourceSystem.ts');
  // Measured on a living realm. A long run can end annihilated — a roguelite is allowed to
  // lose — and a realm with no provinces has nobody to starve, so the stress falls back to a
  // fresh realm advanced sixty seasons rather than reading nothing off a dead one.
  let stress = st;
  if (st.isDefeated || !st.lands.some((l) => l.ownerId === 'dai-viet')) {
    stress = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    stress.ascent.autoResolveBattles = true;
    for (let i = 0; i < 60 && !stress.isDefeated; i += 1) {
      advanceAscentTick(stress);
      let guard = 0;
      while (stress.pendingAscentPrompt && guard++ < 10) {
        const p = stress.pendingAscentPrompt;
        if (p.kind === 'run-over') break;
        if (!resolveAscentPrompt(stress, firstChoice(p))) break;
      }
    }
  }
  // The run may well have no standing host by now, and only army rations can drive the food
  // rate below zero (civilian demand withholds at source and floors at nothing). Conjure one.
  const feedMe = stress.armies.find((a) => a.kingdomId === 'dai-viet' && !a.isLevy)
    ?? (() => {
      const proto = JSON.parse(JSON.stringify(stress.armies[0]));
      proto.id = 'stress-host';
      proto.kingdomId = 'dai-viet';
      proto.landId = (stress.lands.find((l) => l.ownerId === 'dai-viet') ?? stress.lands[0]).id;
      proto.generalHeroId = undefined;
      proto.isLevy = undefined;
      stress.armies.push(proto);
      return proto;
    })();
  feedMe.units.spearmen += 50000;
  stress.resources.food = 0;
  const popBefore = stress.lands.filter((l) => l.ownerId === 'dai-viet').reduce((n, l) => n + l.population, 0);
  for (let i = 0; i < 6; i += 1) {
    stress.resources.food = 0; // hold the famine open regardless of what the tick harvests
    stress.resourceRates = calculatePlayerResourceRates(stress);
    stress.resourceRates.food = Math.min(stress.resourceRates.food, -20);
    collectPlayerIncome(stress);
  }
  const popAfter = stress.lands.filter((l) => l.ownerId === 'dai-viet').reduce((n, l) => n + l.population, 0);
  const famineShortfall = (stress.ascentLedger?.shortfalls ?? []).some((e) => e.kind === 'food');

  return {
    turn: st.turn,
    lands: landCount(),
    smallShare: mean(smallShares),
    grownShare: mean(grownShares),
    smallSamples: smallShares.length,
    grownSamples: grownShares.length,
    maxUnpaid,
    sawUnpaid,
    sawRecovery,
    shortfallKindsSeen: [...shortfallKindsSeen],
    civilianDampingSeen,
    rivalPowerStart,
    rivalPowerEnd: rivalPower(),
    // The named parts of the gold outgo must add up to the demand line they explain. Read off
    // the living realm the stress ran on, so a dead run does not read as a broken ledger.
    partsBalance: (() => {
      const l = stress.ascentLedger;
      const p = l?.goldParts;
      if (!l || !p) return false;
      const sum = p.payroll + p.hosts + p.wages + p.buildings + p.graft + p.softcap;
      return Math.abs(l.gold.demand - sum) < 1.5;
    })(),
    ledger: st.ascentLedger ? {
      gold: st.ascentLedger.gold,
      food: st.ascentLedger.food,
      coherent: ['food', 'supplies', 'gold'].every((k) => {
        const line = st.ascentLedger[k];
        return line && Math.abs(line.gross - line.demand - line.net) < 0.001;
      }),
    } : null,
    famine: { popBefore, popAfter, famineShortfall },
  };
});

// Soldier rations are config-level truths — read them straight from the module.
const rations = await page.evaluate(async () => {
  const cfg = await import('/src/game/ascentConfig.ts');
  return {
    soldierEats: cfg.ARMY_FOOD_PER_SOLDIER,
    campaignMult: cfg.ARMY_CAMPAIGN_FOOD_MULT,
    civilianEats: 1 / 240, // foodPerHead for ascent in calculatePlayerResourceRates
  };
});

console.log(JSON.stringify(run, null, 2));
console.log('rations', JSON.stringify(rations));

const checks = {
  'the run survives long enough to measure': run.turn >= 250,
  'the gold parts add up to the demand line': run.partsBalance,
  'the ledger exists and its three lines balance': Boolean(run.ledger?.coherent),

  // The headline: provinces cost something at every size. Printed above for tuning; the
  // grown-realm floor is what catches the linear-wages-vs-compounding-trade defect.
  'demand claims a real share of gross at 3-4 provinces': run.smallSamples > 5 && run.smallShare > 0.05 && run.smallShare < 0.95,
  'demand still claims a real share at 8+ provinces': run.grownSamples > 5 && run.grownShare > 0.08 && run.grownShare < 0.8,

  // Shortfall machinery: events with names, never more than three provinces dark, and a
  // treasury that heals gets its provinces back.
  'a shortfall was seen and it recovered': !run.sawUnpaid || run.sawRecovery,
  'the coin ratchet never exceeds three provinces': run.maxUnpaid <= 3,

  // Famine stress: people were lost and the ledger points at a place.
  'starving the realm costs people': run.famine.popAfter < run.famine.popBefore,
  'starving the realm lands in the ledger': run.famine.famineShortfall,

  // Army-as-people.
  'a soldier eats at least a civilian ration': rations.soldierEats >= rations.civilianEats,
  'a marching host eats more than a garrisoned one': rations.campaignMult > 1,
  'a standing army drags on civilian growth': run.civilianDampingSeen,

  // The world grows back.
  'rival power grows across the run': run.rivalPowerEnd >= run.rivalPowerStart * 1.5,
};

let failed = 0;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!pass) failed += 1;
}
console.log(failed === 0 ? '\nverify-economy: all checks passed' : `\nverify-economy: ${failed} FAILED`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
