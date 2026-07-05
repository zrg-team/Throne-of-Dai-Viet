// Verifies Phase 3 (hero events: exhaustion/loyalty/ambition dilemmas) and Phase 4
// (battlefield stakes: a routed general is wounded/slain; the king is never at risk).
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5175';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(4242, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const st = window.__mandateState;
  const ev = await import('/src/systems/empire/HeroEventSystem.ts');
  const wl = await import('/src/systems/WarSystem.ts');
  const out = {};

  // A single controllable hero (besides the king) so trigger priority is deterministic.
  const king = st.heroes.find((h) => h.id === 'king');
  const evHero = st.heroDeck.find((h) => h.type === 'minister');
  st.heroDeck = st.heroDeck.filter((h) => h.id !== evHero.id);
  st.heroes = [king, evHero];
  const resetHero = () => { evHero.fatigue = 0; evHero.stats.loyalty = 50; evHero.stats.renown = 30; evHero.assignedTo = undefined; };
  const clearInterrupts = () => { st.pendingHeroEvent = undefined; st.pendingForeignCard = undefined; st.activePoliticsCard = undefined; st.pendingCourtRequest = undefined; st.latestBattleResult = undefined; };

  const force = (setup) => {
    for (let i = 0; i < 120; i += 1) {
      clearInterrupts();
      setup();
      st.heroEventCooldown = 1;
      ev.maybeTriggerHeroEvent(st);
      if (st.pendingHeroEvent) return st.pendingHeroEvent;
    }
    return undefined;
  };

  // ── Exhaustion ──
  let e = force(() => { resetHero(); evHero.fatigue = 90; });
  out.exhaustionKind = e?.kind;
  const view = ev.heroEventView(st);
  out.viewHasTwoChoices = (view?.choices?.length === 2) && Boolean(view?.title) && Boolean(view?.description);
  ev.resolveHeroEvent(st, 'a'); // grant rest
  out.exhaustionRested = evHero.fatigue <= 15;
  out.exhaustionCleared = st.pendingHeroEvent === undefined && st.isPaused === false;

  // ── Ambition (honor costs gold, raises loyalty) ──
  st.resources.gold = 200;
  let a = force(() => { resetHero(); evHero.stats.renown = 90; });
  out.ambitionKind = a?.kind;
  const goldBefore = st.resources.gold; const loyBefore = evHero.stats.loyalty;
  ev.resolveHeroEvent(st, 'a');
  out.ambitionSpentGold = st.resources.gold < goldBefore;
  out.ambitionRaisedLoyalty = evHero.stats.loyalty > loyBefore;

  // ── Loyalty crisis → "let them go" removes the hero from the roster ──
  let l = force(() => { resetHero(); evHero.stats.loyalty = 10; });
  out.loyaltyKind = l?.kind;
  ev.resolveHeroEvent(st, 'b'); // let them go
  out.heroDeparted = !st.heroes.some((h) => h.id === evHero.id);
  out.heroReturnedToDeck = st.heroDeck.some((h) => h.id === evHero.id);

  // ── Battlefield stakes ──
  const cap = st.lands.find((l2) => l2.ownerId === 'dai-viet');
  const targetId = cap.neighbors[0];
  const target = st.lands.find((l2) => l2.id === targetId);
  target.ownerId = 'northern-rival';
  target.defense = 100000; // make defeat near-certain
  st.armies.push({ id: 'stake-army', kingdomId: 'dai-viet', name: 'Stake Host', landId: cap.id,
    units: { spearmen: 50, archers: 0, heavyInfantry: 0 }, morale: 80, supply: 80,
    rations: 100, provisions: 100, level: 1, experience: 0, experienceToNextLevel: 100 });
  const army = st.armies.find((ar) => ar.id === 'stake-army');

  const makeGen = () => {
    let g = st.heroes.find((h) => h.id === 'stake-gen');
    if (!g) {
      g = { id: 'stake-gen', name: 'Stake General', type: 'general', rarity: 'Rare', upkeepGold: 5,
        description: '', effect: '', fatigue: 0,
        stats: { martial: 55, logistics: 30, administration: 10, diplomacy: 10, loyalty: 40, renown: 30 } };
      st.heroes.push(g);
    }
    return g;
  };

  let wounded = 0, slain = 0, defeats = 0;
  for (let i = 0; i < 130; i += 1) {
    const g = makeGen();
    Object.assign(army, { units: { spearmen: 50, archers: 0, heavyInfantry: 0 }, morale: 80, supply: 80, landId: cap.id, generalHeroId: g.id });
    g.assignedTo = army.id; g.fatigue = 0;
    st.latestBattleResult = undefined; st.siegeOrders = [];
    const won = wl.attackLand(st, army.id, targetId, 'balanced');
    if (won) { army.landId = cap.id; st.siegeOrders = []; continue; }
    defeats += 1;
    const r = st.latestBattleResult;
    if (r?.generalFate === 'slain') slain += 1;
    else if (r?.generalFate === 'wounded') wounded += 1;
  }
  out.defeats = defeats;
  out.someWounded = wounded > 0;
  out.someSlain = slain > 0;

  // King must never be harmed on a rout.
  let kingFate = 0;
  for (let i = 0; i < 60; i += 1) {
    Object.assign(army, { units: { spearmen: 50, archers: 0, heavyInfantry: 0 }, morale: 80, supply: 80, landId: cap.id, generalHeroId: 'king' });
    st.latestBattleResult = undefined; st.siegeOrders = [];
    const won = wl.attackLand(st, army.id, targetId, 'balanced');
    if (won) { army.landId = cap.id; st.siegeOrders = []; continue; }
    if (st.latestBattleResult?.generalFate) kingFate += 1;
  }
  out.kingNeverHarmed = kingFate === 0 && st.heroes.some((h) => h.id === 'king');

  return out;
});

await browser.close();

const checks = {
  'exhaustion event triggers': result.exhaustionKind === 'exhaustion',
  'event view has title + 2 choices': result.viewHasTwoChoices === true,
  'grant rest recovers energy': result.exhaustionRested === true,
  'event clears + unpauses': result.exhaustionCleared === true,
  'ambition event triggers': result.ambitionKind === 'ambition',
  'honor spends gold': result.ambitionSpentGold === true,
  'honor raises loyalty': result.ambitionRaisedLoyalty === true,
  'loyalty event triggers': result.loyaltyKind === 'loyalty',
  'let-them-go removes hero': result.heroDeparted === true,
  'departed hero returns to deck': result.heroReturnedToDeck === true,
  [`battlefield defeats observed (${result.defeats})`]: result.defeats > 40,
  'some generals wounded': result.someWounded === true,
  'some generals slain': result.someSlain === true,
  'king never wounded/slain': result.kingNeverHarmed === true,
};

let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? '✓' : '✗'} ${name}`);
  if (!pass) ok = false;
}
if (errors.length) { ok = false; console.log('\nPage errors:', errors.slice(0, 5)); }
console.log(`\n${ok ? 'PASS' : 'FAIL'} — hero events + battlefield stakes`);
process.exit(ok ? 0 : 1);
