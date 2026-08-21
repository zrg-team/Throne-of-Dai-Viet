// What a ruler brings, and what a sworn crown does. Every failure here compiles perfectly:
// an arrival that fires twice, a vassal that still marches, tribute that stacks.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-arrivals.mjs
import { chromium } from 'playwright';
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });

const r = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { heroTemplates } = await import('/src/data/heroes.ts');
  const { HERO_ARRIVALS } = await import('/src/data/heroArrivals.ts');
  const { fireHeroArrival } = await import('/src/systems/ascent/ArrivalSystem.ts');
  const V = await import('/src/systems/ascent/VassalSystem.ts');
  const { computeAscentPower, contestedDefencePower } = await import('/src/systems/ascent/PowerSystem.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const fresh = () => createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const out = {};

  const rulers = heroTemplates.filter((h) => h.arrival);
  out.rulers = rulers.length;
  out.unknownArrival = rulers.filter((h) => !HERO_ARRIVALS[h.arrival]).map((h) => h.id);
  out.arrivalsOnNonLegendary = rulers.filter((h) => h.rarity !== 'Legendary').map((h) => h.id);

  // ── every arrival must land, or fall back, and never throw ──
  const dud = [];
  for (const id of Object.keys(HERO_ARRIVALS)) {
    const st = fresh();
    const hero = { ...rulers.find((h) => h.arrival === id) ?? rulers[0], arrival: id };
    st.heroes.push(hero);
    if (!fireHeroArrival(st, hero)) dud.push(id);
  }
  out.dudArrivals = dud;

  // ── fires exactly once, however many times it is called ──
  const once = fresh();
  const ruler = { ...rulers.find((h) => h.arrival === 'treasury') };
  once.heroes.push(ruler);
  const first = fireHeroArrival(once, ruler);
  const second = fireHeroArrival(once, ruler);
  out.firesOnce = first === true && second === false && once.ascent.arrivalsFired.length === 1;

  // ── vassalage: tribute flows, POWER moves, DEFENCE does not ──
  const vs = fresh();
  const target = vs.kingdoms.find((k) => k.id !== 'dai-viet' && !k.isDefeated);
  const beforePower = computeAscentPower(vs);
  const beforeDef = contestedDefencePower(vs);
  const beforeGold = vs.resourceRates.gold;
  V.grantVassalage(vs, target, 'arrival');
  V.grantVassalage(vs, target, 'arrival');   // must not stack
  const { refreshAllLandOutputs } = await import('/src/systems/ResourceSystem.ts');
  refreshAllLandOutputs(vs);
  out.tributeModifiers = vs.activeCourtModifiers.filter((m) => m.id.startsWith('vassal-tribute-')).length;
  out.powerRose = computeAscentPower(vs) > beforePower;
  out.defenceUnchanged = contestedDefencePower(vs) === beforeDef;
  out.goldRose = vs.resourceRates.gold > beforeGold;
  out.vassalCount = V.vassalCount(vs);

  // ── a sworn crown never marches, and the waves still come ──
  const war = fresh();
  const sworn = war.kingdoms.find((k) => k.id !== 'dai-viet' && !k.isDefeated);
  V.grantVassalage(war, sworn, 'arrival');
  war.pendingAscentPrompt = undefined; war.ascent.promptQueue = [];
  const waveStart = war.ascent.wave;
  // A revolt is designed behaviour — the oath is a bet on staying strong — so what must never
  // happen is a march *while still sworn*, not a march at all.
  let marchedWhileSworn = 0, revoltedAt = -1;
  for (let i = 0; i < 300 && !war.isDefeated; i += 1) {
    advanceAscentTick(war);
    war.pendingAscentPrompt = undefined; war.ascent.promptQueue = [];
    const stillSworn = Boolean(sworn.vassalage);
    if (!stillSworn && revoltedAt < 0) revoltedAt = i;
    if (stillSworn && (war.invasions ?? []).some((inv) => inv.kingdomId === sworn.id)) marchedWhileSworn += 1;
  }
  out.marchedWhileSworn = marchedWhileSworn;
  out.revoltedAtTick = revoltedAt;
  out.wavesStillCame = war.ascent.wave > waveStart;

  // ── the cap, and never the last sovereign ──
  const cap = fresh();
  let taken = 0;
  for (const k of cap.kingdoms.filter((k) => k.id !== 'dai-viet' && !k.isDefeated)) {
    if (V.grantVassalage(cap, k, 'arrival')) taken += 1;
  }
  out.capHeld = taken <= 2;
  out.sovereignsLeft = V.sovereignRivals(cap).length;
  return out;
});

const checks = {
  'every ruler carries a known arrival': r.unknownArrival.length === 0,
  'arrivals are Legendary only': r.arrivalsOnNonLegendary.length === 0,
  'the rulers are all here': r.rulers === 24,
  'no arrival is a dud': r.dudArrivals.length === 0,
  'an arrival fires exactly once': r.firesOnce,
  'tribute does not stack': r.tributeModifiers === 1,
  'a vassal raises POWER': r.powerRose,
  'a vassal does NOT raise defence': r.defenceUnchanged,
  'tribute reaches the gold rate': r.goldRose,
  'a sworn crown never marches while sworn': r.marchedWhileSworn === 0,
  'the waves still come': r.wavesStillCame,
  'the vassal cap holds': r.capHeld && r.vassalCount <= 2,
  'the last sovereign is never taken': r.sovereignsLeft >= 1,
  'no console errors': errors.length === 0,
};
console.log(JSON.stringify(r, null, 2));
console.log('=== CHECKS ===');
let pass = true;
for (const [label, ok] of Object.entries(checks)) { if (!ok) pass = false; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`); }
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
console.log(pass ? 'PASS: arrivals and oaths hold' : 'CHECK: some expectations unmet');
await browser.close();
process.exit(pass ? 0 : 1);
