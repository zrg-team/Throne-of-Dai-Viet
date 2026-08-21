// Verifies the hero-action layer (empire mode): mission dispatch → tick → resolve
// lifecycle, signature abilities + cooldowns, Energy spend/recover, block reasons,
// and the dynasty-founder setup pick.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5175';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const st = window.__mandateState;
  const ha = await import('/src/systems/empire/HeroActionSystem.ts');
  const gs = await import('/src/state/GameState.ts');

  // Give the roster one hero of each type (pulled from the deck) so we can drive every path.
  const takeType = (type) => {
    const h = st.heroDeck.find((c) => c.type === type);
    if (h) { h.fatigue = 0; h.assignedTo = undefined; st.heroes.push(h); }
    return h;
  };
  const general = takeType('general');
  const minister = takeType('minister');
  takeType('agent');
  takeType('governor');

  // Ensure there's a player army so the general ability has something to buff.
  st.armies.push({ id: 'test-army', kingdomId: 'dai-viet', name: 'Test Host', landId: st.lands[0].id,
    units: { spearmen: 100, archers: 0, heavyInfantry: 0 }, morale: 40, supply: 40,
    rations: 100, provisions: 100, level: 1, experience: 0, experienceToNextLevel: 100 });

  const out = {};

  // ── Mission lifecycle (general raid, needs target) ──
  const target = ha.heroMissionTargets(st)[0];
  const energyBefore = ha.getHeroEnergy(general);
  const dispatched = ha.dispatchHeroMission(st, general.id, target.id);
  out.dispatched = dispatched;
  out.missionQueued = (st.heroMissions ?? []).length;
  out.heroMarkedBusy = String(general.assignedTo).startsWith('mission:');
  out.energySpent = energyBefore - ha.getHeroEnergy(general);
  out.dispatchBlockedWhileOnMission = Boolean(ha.heroMissionBlockedReason(st, general));

  // Tick until it resolves.
  const def = ha.heroMissionDef(general);
  for (let i = 0; i < def.ticks; i += 1) ha.tickHeroActions(st);
  out.missionResolvedEmpty = (st.heroMissions ?? []).length === 0;
  out.heroFreedAfter = general.assignedTo === undefined;

  // ── Minister tax circuit (no target) should be able to add gold over trials ──
  let goldGain = 0;
  for (let trial = 0; trial < 8; trial += 1) {
    minister.fatigue = 0;
    const g0 = st.resources.gold;
    ha.dispatchHeroMission(st, minister.id);
    const d = ha.heroMissionDef(minister);
    for (let i = 0; i < d.ticks; i += 1) ha.tickHeroActions(st);
    goldGain += st.resources.gold - g0;
  }
  out.taxCircuitEverPaid = goldGain > 0;

  // ── Signature ability + cooldown (general Forced March) ──
  general.fatigue = 0;
  const armyMoraleBefore = st.armies.find((a) => a.id === 'test-army').morale;
  const used = ha.useHeroAbility(st, general.id);
  const armyMoraleAfter = st.armies.find((a) => a.id === 'test-army').morale;
  out.abilityUsed = used;
  out.abilityRaisedMorale = armyMoraleAfter > armyMoraleBefore;
  out.abilityOnCooldown = ha.heroAbilityCooldown(st, general.id) > 0;
  out.abilityBlockedOnCooldown = Boolean(ha.heroAbilityBlockedReason(st, general));
  ha.tickHeroActions(st); // cooldown should tick down
  out.cooldownDecrements = ha.heroAbilityCooldown(st, general.id) < ha.HERO_ABILITY_DEFS.general.cooldown;

  // ── Energy recovery (idle recovers faster than posted) ──
  general.assignedTo = undefined; general.fatigue = 50;
  ha.tickHeroActions(st);
  out.idleRecovered = general.fatigue < 50;

  // ── King cannot be dispatched ──
  const king = st.heroes.find((h) => h.id === 'king');
  out.kingBlocked = Boolean(ha.heroMissionBlockedReason(st, king));

  // ── Founder pick flows from setup config ──
  const founded = gs.createEmpireGameState({ seaSides: 0, difficulty: 'normal', founderId: 'real-ngo-quyen' });
  out.founderInRoster = founded.heroes.some((h) => h.id === 'real-ngo-quyen');
  out.founderRemovedFromDeck = !founded.heroDeck.some((h) => h.id === 'real-ngo-quyen');

  return out;
});

await browser.close();

const checks = {
  'mission dispatched': result.dispatched === true,
  'mission queued': result.missionQueued === 1,
  'hero marked busy (mission:)': result.heroMarkedBusy === true,
  'energy spent on dispatch': result.energySpent > 0,
  're-dispatch blocked while on mission': result.dispatchBlockedWhileOnMission === true,
  'mission resolves & queue empties': result.missionResolvedEmpty === true,
  'hero freed after mission': result.heroFreedAfter === true,
  'tax circuit pays gold (some trials)': result.taxCircuitEverPaid === true,
  'ability used': result.abilityUsed === true,
  'ability raised army morale': result.abilityRaisedMorale === true,
  'ability set cooldown': result.abilityOnCooldown === true,
  'ability blocked on cooldown': result.abilityBlockedOnCooldown === true,
  'cooldown decrements on tick': result.cooldownDecrements === true,
  'idle hero recovers energy': result.idleRecovered === true,
  'king cannot be dispatched': result.kingBlocked === true,
  'founder joins roster': result.founderInRoster === true,
  'founder removed from deck': result.founderRemovedFromDeck === true,
};

let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? '✓' : '✗'} ${name}`);
  if (!pass) ok = false;
}
if (errors.length) { ok = false; console.log('\nPage errors:', errors.slice(0, 5)); }
console.log(`\n${ok ? 'PASS' : 'FAIL'} — hero actions`);
process.exit(ok ? 0 : 1);
