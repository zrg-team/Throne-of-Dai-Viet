/**
 * Every promise the Four Courts round made, exercised against the live systems.
 *
 * The round answered eleven separate requests, and most of them are the kind that can be *written*
 * without ever being *reachable* — a relations dial nothing reads, a supply clock nothing ticks, an
 * envoy option no page can raise. Each check below drives the real function and asserts the world
 * moved, so a later change that quietly disconnects one of them fails here rather than in a run.
 *
 * Deliberately not seed-dependent: every check builds the state it needs rather than waiting for a
 * run to produce it. See `verify-fronts` for what happens when a probe depends on the balance.
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const D = await import('/src/systems/DiplomacySystem.ts');
  const FA = await import('/src/systems/ForeignAffairsSystem.ts');
  const WD = await import('/src/systems/ascent/WaveDirector.ts');
  const INV = await import('/src/systems/empire/InvasionSystem.ts');
  const ALLY = await import('/src/systems/ascent/AllySupport.ts');
  const CB = await import('/src/systems/ascent/CourtBargains.ts');
  const ENV = await import('/src/systems/ascent/EnvoySystem.ts');
  const WE = await import('/src/systems/ascent/WorldEventSystem.ts');
  const GP = await import('/src/systems/empire/GreatPowersSystem.ts');
  const CFG = await import('/src/game/ascentConfig.ts');
  const { beginBattle } = await import('/src/systems/ascent/BattleSystem.ts');
  const { enrolArrivals } = await import('/src/systems/ascent/battleMembership.ts');
  const { createBattlePreview } = await import('/src/systems/WarSystem.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');

  const orig = Math.random;
  let s = 20260828 >>> 0;
  Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const fresh = () => createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const rivals = (st) => st.kingdoms.filter((k) => k.id !== 'dai-viet' && !k.isDefeated);
  const r = {};

  // ── 1. Relations move the wave clock, the budget and the host count ──────
  {
    const st = fresh();
    const k = rivals(st)[0];
    k.opinionModifiers = [];
    k.relations = 90;
    const warm = WD.relationsDial(st, k.id);
    k.relations = 10;
    const cold = WD.relationsDial(st, k.id);
    r.dial = {
      warm, cold,
      moves: warm.clock > cold.clock && warm.budget < cold.budget && warm.hosts < cold.hosts,
    };
  }

  // ── 2. The floor: long when young, tight when old, and never constant ────
  {
    const st = fresh();
    st.ascent.wave = 1;
    const young = Array.from({ length: 24 }, () => WD.peaceFloorTicks(st));
    st.ascent.wave = 25;
    const old = Array.from({ length: 24 }, () => WD.peaceFloorTicks(st));
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    r.floor = {
      young: Math.round(mean(young)), old: Math.round(mean(old)),
      varies: new Set(young).size > 3,
      tightens: mean(young) > mean(old) * 1.5,
    };
  }

  // ── 3. Warming one court cools the court it feuds with ───────────────────
  {
    const st = fresh();
    const [a, b] = rivals(st);
    a.feudWith = b.id; b.feudWith = a.id;
    b.opinionModifiers = []; D.recomputeOpinion(b);
    const before = b.relations;
    st.resources.gold = 99999;
    FA.sendGift(st, a.id, 'lavish');
    r.feud = { before: Math.round(before), after: Math.round(b.relations), cooled: b.relations < before };
  }
  // ...and every ascent run pairs its courts off at worldgen.
  {
    const st = fresh();
    const paired = rivals(st).filter((k) => k.feudWith);
    r.feudPairs = {
      count: paired.length,
      symmetric: paired.every((k) => st.kingdoms.find((o) => o.id === k.feudWith)?.feudWith === k.id),
    };
  }

  // ── 4. An invasion runs out of season, and success refills it ────────────
  {
    const st = fresh();
    const k = rivals(st)[0];
    INV.launchOffMapInvasion(st, k.id, { totalSoldiers: 400, forceConquest: true });
    const rec = st.invasions[0];
    const start = rec.campaignTicks;
    for (let i = 0; i < 4; i += 1) advanceAscentTick(st);
    const spent = st.invasions[0]?.campaignTicks ?? 0;
    INV.extendCampaign(rec, CFG.CAMPAIGN_TICKS_ON_CAPTURE);
    r.campaign = {
      startsUnset: start === undefined,
      ticksDown: spent < CFG.CAMPAIGN_TICKS_BASE,
      refills: rec.campaignTicks > spent,
      capped: (() => { INV.extendCampaign(rec, 999); return rec.campaignTicks === CFG.CAMPAIGN_TICKS_MAX; })(),
    };
  }
  // ...and a spent host turns for home rather than marching for ever.
  {
    const st = fresh();
    const k = rivals(st)[0];
    INV.launchOffMapInvasion(st, k.id, { totalSoldiers: 400, forceConquest: true });
    st.invasions[0].campaignTicks = 1;
    for (let i = 0; i < 3; i += 1) advanceAscentTick(st);
    const rec = st.invasions[0];
    r.goesHome = { withdrawing: !rec || rec.plan === 'withdrawing' || rec.pillaged === true };
  }

  // ── 5. Three hosts to a court, six on the map ───────────────────────────
  {
    const st = fresh();
    const k = rivals(st)[0];
    for (let i = 0; i < 5; i += 1) {
      INV.launchOffMapInvasion(st, k.id, { totalSoldiers: 300, forceCoalition: 3, forceConquest: true });
    }
    r.caps = {
      perKingdom: st.invasions.filter((x) => x.kingdomId === k.id).length,
      limit: CFG.MAX_HOSTS_PER_KINGDOM,
      mapCeiling: CFG.MAX_LIVE_INVADER_HOSTS,
    };
  }

  // ── 6. Difficulty finally changes the size of what attacks ──────────────
  {
    const size = (diff) => {
      const st = createAscentGameState({ seaSides: 1, difficulty: diff });
      INV.launchOffMapInvasion(st, rivals(st)[0].id, { totalSoldiers: 1000, forceConquest: true });
      return st.armies.filter((a) => a.kingdomId !== 'dai-viet')
        .reduce((sum, a) => sum + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
    };
    const easy = size('easy');
    const hard = size('ironman');
    r.difficulty = { easy, hard, differs: hard > easy * 1.4 };
  }

  // ── 7. An ally's column joins a battle we are already fighting ──────────
  {
    const st = fresh();
    const k = rivals(st)[0];
    k.opinionModifiers = [];
    D.addOpinionModifier(k, { id: 'probe-warm', label: 'probe', value: 60, source: 'treaty' });
    st.ascent.lastWatchedKey = undefined;
    st.ascent.lastWatchedWave = -99;
    st.ascent.activeBattle = undefined;
    st.ascent.sideBattles = [];
    const land = st.lands.find((l) => l.ownerId === 'dai-viet');
    // Deliberately thin. The point of this check is the relief column, and a province that is
    // plainly about to fall is the one case `beginBattle` opens a field for unconditionally.
    land.localSoldiers = 40;
    land.defense = 5;
    st.armies = st.armies.filter((a) => a.kingdomId !== 'dai-viet' || a.landId !== land.id);
    const foe = {
      id: 'probe-foe', kingdomId: k.id, name: 'Probe', landId: land.id,
      units: { spearmen: 900, archers: 400, heavyInfantry: 200 },
      morale: 85, supply: 90, rations: 999, provisions: 999,
      level: 1, experience: 0, experienceToNextLevel: 120,
    };
    st.armies.push(foe);
    (st.invasions ??= []).push({ armyId: foe.id, kingdomId: k.id, targetLandId: land.id, intent: 'conquest', plan: 'spearhead' });
    const preview = createBattlePreview(st, foe.id, land.id);
    st.pendingBattle = {
      invaderArmyId: foe.id, landId: land.id, landName: land.name, kingdomId: k.id,
      kingdomName: k.name, isGreat: false,
      attackerPower: preview?.attackerPower ?? 0, defenderPower: preview?.defenderPower ?? 0,
    };
    const opened = beginBattle(st);
    st.pendingBattle = undefined;
    const refusal = ALLY.aidRefusal(st, k);
    const sent = ALLY.callForAid(st, k.id);
    const column = st.armies.find((a) => a.patron?.startsWith(ALLY.ALLY_PATRON_PREFIX));
    const battle = st.ascent.activeBattle;
    if (battle) enrolArrivals(st, battle);
    r.aid = {
      opened, refusal: refusal ?? null, sent,
      column: Boolean(column),
      onTheField: Boolean(column && battle && (battle.ourArmyIds ?? []).includes(column.id)),
      costStanding: k.relations < 95,
      // Asking twice in a row is not on offer.
      cooling: ALLY.aidRefusal(st, k) === 'cooling',
    };
  }

  // ── 8. A host can be bought off the field, and only by a warm court ─────
  {
    const st = fresh();
    const k = rivals(st)[0];
    k.opinionModifiers = [];
    D.addOpinionModifier(k, { id: 'probe-cold', label: 'probe', value: -40, source: 'reputation' });
    INV.launchOffMapInvasion(st, k.id, { totalSoldiers: 500, forceConquest: true });
    const cold = CB.buyoffRefusal(st, k);
    D.removeOpinionModifier(k, 'probe-cold');
    D.addOpinionModifier(k, { id: 'probe-warm', label: 'probe', value: 45, source: 'treaty' });
    const warm = CB.buyoffRefusal(st, k);
    const price = CB.buyoffCost(st, CB.hostsInTheField(st, k.id)[0]);
    st.resources.gold = price + 10;
    const bought = CB.buyOffHost(st, k.id);
    r.buyoff = {
      coldRefuses: cold === 'standing', warmAccepts: warm === undefined,
      price, bought,
      leftTheField: (st.invasions ?? []).some((x) => x.kingdomId === k.id && x.plan === 'withdrawing'),
    };
  }

  // ── 9. Grain against coin, and only with a warm court holding a charter ──
  {
    const st = fresh();
    const k = rivals(st)[0];
    k.opinionModifiers = []; D.recomputeOpinion(k);
    const noCharter = CB.canTrade(k);
    st.court.influence = 50;
    FA.proposeTrade(st, k.id);
    k.relations = 30;
    const charterButCold = CB.canTrade(k);
    k.relations = 80;
    const charterAndWarm = CB.canTrade(k);
    const food0 = st.resources.food; const gold0 = st.resources.gold;
    st.resources.food = 500;
    const sold = CB.tradeGrain(st, k.id, 'sell');
    r.exchange = {
      noCharter, charterButCold, charterAndWarm, sold,
      gainedGold: st.resources.gold > gold0, spentFood: st.resources.food < 500,
      ratesDiffer: (() => {
        const a = rivals(st)[0]; const b = rivals(st)[1];
        if (!b) return true;
        a.stability = 5; b.stability = 95;
        return CB.exchangeRate(a).sell !== CB.exchangeRate(b).sell;
      })(),
      _food0: food0,
    };
  }

  // ── 10. The envoy sheet is a ledger, and a blocked row says what it wants ─
  {
    const st = fresh();
    const k = rivals(st)[0];
    const ids = ENV.buildEnvoyOptions(st, k).map((o) => o.id);
    const blocked = ENV.buildEnvoyOptions(st, k).filter((o) => o.blockedBy);
    r.envoy = {
      ids,
      hasAll: ['gift', 'gift-lavish', 'grain', 'pact', 'aid', 'buyoff', 'denounce', 'ambassador', 'exchange-buy']
        .every((id) => ids.includes(id)),
      explains: blocked.length > 0
        && blocked.every((o) => ENV.envoyOptionDetail(st, k, o).length > 0),
      // An action the realm cannot pay for still answers the card.
      closesWhenBroke: (() => { st.resources.gold = 0; return ENV.resolveEnvoy(st, k.id, 'gift'); })(),
      refusesUnknown: ENV.resolveEnvoy(st, k.id, 'not-a-real-option') === false,
    };
  }

  // ── 11. Denouncing picks a side; a gift's envy is only ever one-way ─────
  {
    const st = fresh();
    const [a, b] = rivals(st);
    a.feudWith = b.id; b.feudWith = a.id;
    a.opinionModifiers = []; b.opinionModifiers = [];
    D.recomputeOpinion(a); D.recomputeOpinion(b);
    const a0 = a.relations; const b0 = b.relations;
    FA.denounce(st, a.id);
    r.denounce = { cooled: a.relations < a0, warmedRival: b.relations > b0 };
  }

  // ── 12. A new king wipes the slate ──────────────────────────────────────
  {
    const st = fresh();
    const k = rivals(st)[0];
    st.resources.gold = 99999;
    FA.sendGift(st, k.id, 'lavish');
    const warmed = k.relations;
    k.king.age = 400; // guarantees the roll
    for (let i = 0; i < 30 && k.opinionModifiers.length > 0; i += 1) GP.tickGreatPowersYear(st);
    r.succession = { warmed: Math.round(warmed), wiped: k.opinionModifiers.length === 0, age: k.king.age };
  }

  // ── 13. Events happen on their own, and every option moves the board ────
  {
    const st = fresh();
    // The reign opens on two cards of its own, and both outrank an event. Clear them, or the
    // drain below hands back the mandate and this check measures the opening instead.
    st.ascent.promptQueue = [];
    st.pendingAscentPrompt = undefined;
    st.turn = CFG.WORLD_EVENT_GRACE_TICKS + 1;
    let raised = 0;
    for (let i = 0; i < 400 && raised < 3; i += 1) {
      st.turn += 1;
      if (WE.maybeOfferWorldEvent(st)) raised += 1;
    }
    drainAscentPrompts(st);
    const prompt = st.pendingAscentPrompt;
    let moved = false;
    if (prompt && prompt.kind === 'world-event') {
      const k = st.kingdoms.find((x) => x.id === prompt.kingdomId);
      const before = k.relations;
      st.resources.gold = 99999; st.resources.food = 99999;
      WE.resolveWorldEvent(st, prompt.eventId, prompt.kingdomId, prompt.otherKingdomId, prompt.options[0].id);
      moved = k.relations !== before;
    }
    r.events = {
      raised,
      kind: prompt?.kind ?? null,
      named: Boolean(prompt?.kingdomName),
      hasOptions: (prompt?.options?.length ?? 0) >= 2,
      moved,
      // Every option of every event has to be answerable, not just the first.
      allAnswerable: (() => {
        if (!prompt || prompt.kind !== 'world-event') return false;
        return prompt.options.every((o) => WE.resolveWorldEvent(
          st, prompt.eventId, prompt.kingdomId, prompt.otherKingdomId, o.id,
        ));
      })(),
    };
  }

  // ── 14. A second crown joins a war the realm is losing ─────────────────
  {
    const st = fresh();
    for (const k of rivals(st)) { k.opinionModifiers = []; k.relations = 5; k.warAppetite = 100; k.feudWith = undefined; }
    const first = rivals(st)[0];
    INV.launchOffMapInvasion(st, first.id, { totalSoldiers: 6000, forceConquest: true });
    // Visibly losing, and from the first tick. `maybeJoinTheWar` reads live state every pass, so a
    // realm that only collapses at season eighty leaves the draw almost no ticks to fire in.
    st.armies = st.armies.filter((a) => a.kingdomId !== 'dai-viet');
    for (const l of st.lands.filter((x) => x.ownerId === 'dai-viet')) { l.localSoldiers = 10; l.defense = 2; }
    let joined = false;
    for (let i = 0; i < 120 && !joined; i += 1) {
      advanceAscentTick(st);
      joined = new Set((st.invasions ?? []).map((x) => x.kingdomId)).size > 1;
      if (st.ascent.runOver) break;
    }
    const PW = await import('/src/systems/ascent/PowerSystem.ts');
    const WS = await import('/src/systems/WarSystem.ts');
    r.coalition = {
      joined,
      courts: [...new Set((st.invasions ?? []).map((x) => x.kingdomId))].length,
      invaderPower: Math.round((st.invasions ?? []).reduce((sum, rec) => {
        const a = st.armies.find((x) => x.id === rec.armyId);
        return sum + (a ? WS.armyPower(st, a) : 0);
      }, 0)),
      defence: Math.round(PW.contestedDefencePower(st)),
      need: CFG.COALITION_JOIN_RATIO,
      live: (st.invasions ?? []).length,
      runOver: !!st.ascent.runOver,
      relations: rivals(st).map((k) => Math.round(k.relations ?? 50)),
    };
  }

  // ── 15. The diplomacy ledger is actually running in this mode ───────────
  {
    const st = fresh();
    const k = rivals(st)[0];
    st.resources.gold = 99999;
    FA.sendGift(st, k.id, 'lavish');
    const peak = k.relations;
    for (let i = 0; i < 60; i += 1) advanceAscentTick(st);
    r.ledger = { peak: Math.round(peak), later: Math.round(k.relations), decays: k.relations < peak };
  }
  // ...and a pact can be signed at all.
  {
    const st = fresh();
    const k = rivals(st)[0];
    k.opinionModifiers = []; k.relations = 95; k.trust = 95;
    st.court.influence = 90; st.resources.gold = 99999;
    r.pact = { signed: D.proposePact(st, k.id, 200) };
  }

  Math.random = orig;
  return r;
});

const checks = {
  'relations move the clock, the budget and the host count': out.dial.moves,
  'the war floor is long when young and tight when old': out.floor.tightens,
  'and it is never the same number twice': out.floor.varies,
  'the courts are paired into feuds at worldgen': out.feudPairs.count >= 2 && out.feudPairs.symmetric,
  'warming one court cools the court it feuds with': out.feud.cooled,
  'an invasion carries a campaign season, and spends it': out.campaign.ticksDown,
  'success refills it, and the refill is capped': out.campaign.refills && out.campaign.capped,
  'a spent host turns for home': out.goesHome.withdrawing,
  'a court may commit three hosts, no more': out.caps.perKingdom === out.caps.limit,
  'the map carries six': out.caps.mapCeiling === 6,
  'difficulty changes the size of what attacks': out.difficulty.differs,
  'a warm court sends a relief column': out.aid.sent && out.aid.column,
  'and it stands in the line of the fight': out.aid.onTheField,
  'asking costs standing, and cannot be repeated at once': out.aid.costStanding && out.aid.cooling,
  'a cold court will not call its host home': out.buyoff.coldRefuses,
  'a warm one will, for a price': out.buyoff.warmAccepts && out.buyoff.bought && out.buyoff.leftTheField,
  'the exchange needs a charter AND standing': !out.exchange.noCharter && !out.exchange.charterButCold && out.exchange.charterAndWarm,
  'grain sells for coin at the court’s own rate': out.exchange.sold && out.exchange.gainedGold && out.exchange.ratesDiffer,
  'the envoy sheet carries every action': out.envoy.hasAll,
  'a blocked row says what standing it wanted': out.envoy.explains,
  'an action we cannot pay for still closes the card': out.envoy.closesWhenBroke === true,
  'an id nothing understands does not': out.envoy.refusesUnknown,
  'denouncing cools them and warms their rival': out.denounce.cooled && out.denounce.warmedRival,
  'a new king wipes what we built': out.succession.wiped,
  'events arrive on their own': out.events.raised >= 1 && out.events.kind === 'world-event',
  'each names a court and offers a real choice': out.events.named && out.events.hasOptions,
  'and every answer moves the board': out.events.moved && out.events.allAnswerable,
  'a second crown joins a war we are losing': out.coalition.joined,
  'opinion decays in this mode at all': out.ledger.decays,
  'and a pact can be signed': out.pact.signed,
  'no console errors': errors.length === 0,
};

const fails = [];
for (const [label, ok] of Object.entries(checks)) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) fails.push(label);
}
console.log('\n' + JSON.stringify(out, null, 1));
if (errors.length) console.log('\nERRORS\n' + errors.slice(0, 6).join('\n'));

await browser.close();
console.log(fails.length === 0
  ? `\nPASS: all ${Object.keys(checks).length} promises of the Four Courts round are reachable`
  : `\nFAIL: ${fails.length} check(s) — ${fails.join(' | ')}`);
process.exit(fails.length === 0 ? 0 : 1);
