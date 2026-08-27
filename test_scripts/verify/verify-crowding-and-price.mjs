/**
 * Crowding costs, hosts are priced, and a fight ends when its ground does.
 *
 * Five consequences that all had the same shape of hole: a number the game showed but never moved,
 * or a rule it applied once and never checked again.
 *
 *   1. `land.population` grows toward its own ceiling instead of being fixed at world generation
 *   2. a full realm feeds its people worse, and growth tapers because of it
 *   3. a muster costs gold at all, and costs more per man the larger it is
 *   4. what bounds a host is people and purse, not a flat 2,200
 *   5. a province lost mid-battle ends the battle, files it, and closes the front
 *
 * Headless engine — no renderer, so it runs a thousand seasons in a few seconds. Ascent only;
 * every mechanic here is behind `gameMode === 'ascent'` and `verify-modes-regression` holds the
 * other three modes byte-identical.
 *
 * Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-crowding-and-price.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';

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

const out = await page.evaluate(async () => {
  const seed = (n) => {
    let s = n >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const RS = await import('/src/systems/ResourceSystem.ts');
  const WS = await import('/src/systems/WarSystem.ts');
  const BS = await import('/src/systems/ascent/BattleSystem.ts');
  const FR = await import('/src/systems/ascent/fronts.ts');
  const IS = await import('/src/systems/empire/InvasionSystem.ts');
  const CFG = await import('/src/game/ascentConfig.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  const first = (p) => {
    const o = p.options ?? [];
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards?.[0] ?? 'skip';
      case 'conquer-target': return p.targets?.[0]?.landId ?? 'hold';
      case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
      case 'hero-choice': return p.heroIds?.[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds?.[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': return 'decline';
      default: return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
    }
  };
  const drain = (st) => {
    let g = 0;
    while (st.pendingAscentPrompt && g++ < 40) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
  };
  const build = () => { const st = createAscentGameState({ difficulty: 'normal' }); drain(st); return st; };

  const r = {};

  // ── 1 + 2. a district fills, and a full one eats harder ──────────────────
  seed(20260828);
  {
    const st = build();
    const seat = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    const trace = [];
    const startPop = seat.population;
    for (let i = 0; i < 500; i += 1) {
      seat.ownerId = PLAYER;
      for (const l of st.lands) if (l.id !== seat.id && l.ownerId === PLAYER) l.ownerId = 'neutral';
      st.isDefeated = false;
      advanceAscentTick(st);
      drain(st);
      if (i % 100 === 99) {
        seat.ownerId = PLAYER;
        trace.push({
          tick: i + 1,
          landPop: Math.round(seat.population),
          landCap: RS.landPopulationCapacity(st, seat),
          humans: Math.round(st.resources.humans),
          cap: RS.realmPopulationCapacity(st),
          fill: RS.realmPopulationFill(st),
          rate: st.resourceRates.humans,
          food: st.resourceRates.food,
        });
      }
    }
    seat.ownerId = PLAYER;
    r.fill = trace;
    r.startPop = startPop;
    r.seatCap = RS.landPopulationCapacity(st, seat);
    r.seatBuilt = seat.buildings.reduce((sum, b) => sum + 1 + b.level * 0.5, 0);
    // The design target, read off the constants rather than off this run: a maxed district is
    // about 31 build points, and the answer asked for was "~6k for a capital".
    r.maxedSeatCap = Math.floor(
      (CFG.POP_CAPACITY_PER_LAND * CFG.POP_CAPACITY_CAPITAL_MULT + 31 * CFG.POP_CAPACITY_PER_BUILDING_LEVEL)
      * (CFG.POP_CAPACITY_LOYALTY_FLOOR + (seat.loyalty / 100) * (1 - CFG.POP_CAPACITY_LOYALTY_FLOOR)),
    );

    // The crowding term, measured directly: same realm, two population levels.
    const capNow = RS.realmPopulationCapacity(st);
    const probeFood = (humans) => {
      const before = st.resources.humans;
      st.resources.humans = humans;
      const rates = RS.calculatePlayerResourceRates(st);
      st.resources.humans = before;
      return rates.food;
    };
    const probeGrowth = (humans) => {
      const before = st.resources.humans;
      st.resources.humans = humans;
      const rates = RS.calculatePlayerResourceRates(st);
      st.resources.humans = before;
      return rates.humans;
    };
    r.crowding = {
      cap: capNow,
      quarterFood: probeFood(Math.round(capNow * 0.25)),
      fullFood: probeFood(capNow),
      // The taper, measured where it is supposed to bite rather than wherever this run happened to
      // finish: the same realm, asked what it would grow by at a fifth full and at nine tenths.
      thinGrowth: probeGrowth(Math.round(capNow * 0.2)),
      packedGrowth: probeGrowth(Math.round(capNow * 0.9)),
    };
  }

  // ── 1b. growth stops when the granary is empty ───────────────────────────
  seed(20260828);
  {
    const st = build();
    for (let i = 0; i < 30; i += 1) { advanceAscentTick(st); drain(st); }
    const land = st.lands.find((l) => l.ownerId === PLAYER);
    const before = land.population;
    st.resourceRates.food = -25;
    RS.growProvincialPopulation(st);
    const starved = land.population;
    st.resourceRates.food = 40;
    RS.growProvincialPopulation(st);
    r.deficit = { before, starved, fed: land.population };
  }

  // ── 3 + 4. what a host costs, and what bounds it ─────────────────────────
  seed(20260828);
  {
    const st = build();
    for (let i = 0; i < 40; i += 1) { advanceAscentTick(st); drain(st); }
    const quote = (n) => {
      const c = WS.musterCost(st, n);
      return { n, ...c, goldPerMan: c.gold / n };
    };
    r.price = [500, 1000, 2000, 4000, 8000].map(quote);
    // A rich, populous realm: the ceiling must follow it rather than sit at 2,200.
    st.resources.humans = 7400;
    st.resources.gold = 40000;
    st.resources.food = 40000;
    st.resources.supplies = 40000;
    r.richLimit = WS.musterLimit(st);
    st.resources.gold = 200;
    r.poorLimit = WS.musterLimit(st);
  }

  // ── 5. the ground goes, the fight goes with it ───────────────────────────
  seed(20260828);
  {
    const st = build();
    let opened = null;
    for (let i = 0; i < 260 && !opened; i += 1) {
      advanceAscentTick(st);
      drain(st);
      opened = FR.liveBattles(st).find((b) => b.role !== 'offence') ?? null;
    }
    if (!opened) {
      r.lost = { opened: false };
    } else {
      const landId = opened.landId;
      const historyBefore = (st.ascent.battleHistory ?? []).length;
      const land = st.lands.find((l) => l.id === landId);
      // The province falls to the besieger, exactly as `progressSiegeOrders` would leave it.
      land.ownerId = st.kingdoms.find((k) => k.id !== PLAYER)?.id ?? 'rival';
      BS.reconcileFronts(st);
      const stillLive = FR.liveBattles(st).some((b) => b.landId === landId && b.role !== 'offence');
      r.lost = {
        opened: true,
        land: land.name,
        stillLive,
        recorded: (st.ascent.battleHistory ?? []).length > historyBefore,
        reEnterable: BS.openFieldAt(st, landId),
        // Ownership is `fieldCandidateAt`'s gate, not the front cap's — the cap is a budget on the
        // player's attention and says nothing about whose ground it is.
        candidate: Boolean(BS.fieldCandidateAt(st, landId)),
      };
    }
  }

  // ── 5b. a contested province refuses a second, hidden settlement ─────────
  seed(20260828);
  {
    const st = build();
    let opened = null;
    for (let i = 0; i < 260 && !opened; i += 1) {
      advanceAscentTick(st);
      drain(st);
      opened = FR.liveBattles(st).find((b) => b.role !== 'offence') ?? null;
    }
    r.contested = opened
      ? { land: opened.landName, room: FR.hasRoomForAnotherFront(st, opened.landId) }
      : null;
  }

  return r;
});

await browser.close();

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

console.log('=== 1. A DISTRICT FILLS ===');
console.log(`  the seat starts at ${out.startPop} people and can hold ${out.seatCap}`);
for (const row of out.fill) {
  console.log(`  tick ${String(row.tick).padStart(3)}  district ${String(row.landPop).padStart(5)}/${String(row.landCap).padStart(5)}`
    + `   realm ${String(row.humans).padStart(5)}/${String(row.cap).padStart(5)}`
    + `  (${(row.fill * 100).toFixed(0)}% full, people ${row.rate >= 0 ? '+' : ''}${row.rate}, food ${row.food >= 0 ? '+' : ''}${row.food})`);
}
const last = out.fill[out.fill.length - 1];
check('land.population actually grows', last.landPop > out.startPop,
  `${out.startPop} -> ${last.landPop}`);
check('and stops at the district ceiling', last.landPop <= last.landCap * 1.02,
  `${last.landPop} of ${last.landCap}`);
// The run's own capital is only partly built, so its live ceiling is not the design target. The
// target is what a *fully developed* capital may hold — 31 build points is a maxed district.
check('a maxed capital lands near the 6k asked for',
  out.maxedSeatCap >= 5300 && out.maxedSeatCap <= 6600,
  `a fully built capital holds ${out.maxedSeatCap}; this run's is ${out.seatCap} at ${out.seatBuilt.toFixed(1)} build points`);

console.log('\n=== 2. A FULL REALM EATS HARDER ===');
console.log(`  at a quarter full: food ${out.crowding.quarterFood}/season`);
console.log(`  at the ceiling:    food ${out.crowding.fullFood}/season`);
check('crowding costs food', out.crowding.fullFood < out.crowding.quarterFood,
  `${out.crowding.quarterFood} -> ${out.crowding.fullFood} for ${out.crowding.cap} people`);
console.log(`  growth at a fifth full: +${out.crowding.thinGrowth}/season; at nine tenths: ${out.crowding.packedGrowth >= 0 ? '+' : ''}${out.crowding.packedGrowth}`);
check('growth tapers as the ground fills',
  out.crowding.packedGrowth < out.crowding.thinGrowth,
  `+${out.crowding.thinGrowth} -> ${out.crowding.packedGrowth} a season`);
check('a food deficit stops arrivals', out.deficit.starved === out.deficit.before,
  `${out.deficit.before} held while short, then ${out.deficit.fed} once fed`);
check('and they resume when it is fed', out.deficit.fed > out.deficit.starved);

console.log('\n=== 3. A HOST IS PRICED ===');
console.log('    men     gold     food  supplies   gold/man');
for (const row of out.price) {
  console.log(`  ${String(row.n).padStart(5)}  ${String(row.gold).padStart(7)}  ${String(row.food).padStart(7)}  ${String(row.supplies).padStart(8)}`
    + `   ${row.goldPerMan.toFixed(2)}`);
}
check('a muster costs gold at all', out.price[0].gold > 0, `${out.price[0].gold}g for ${out.price[0].n} men`);
check('and more per man the larger it is',
  out.price[out.price.length - 1].goldPerMan > out.price[0].goldPerMan * 1.5,
  `${out.price[0].goldPerMan.toFixed(2)} -> ${out.price[out.price.length - 1].goldPerMan.toFixed(2)} gold a man`);

console.log('\n=== 4. WHAT BOUNDS A HOST ===');
console.log(`  7,400 people and a full treasury: ${out.richLimit} men`);
console.log(`  the same people, 200 gold:        ${out.poorLimit} men`);
check('a populous rich realm may raise past the old 2,200 cap', out.richLimit > 2200, `${out.richLimit} men`);
check('an empty treasury still binds it', out.poorLimit < out.richLimit / 2,
  `${out.poorLimit} against ${out.richLimit}`);

console.log('\n=== 5. THE GROUND GOES, THE FIGHT GOES ===');
if (!out.lost.opened) {
  console.log('  CHECK: no defence opened in 260 seasons — nothing to measure');
} else {
  console.log(`  ${out.lost.land} fell mid-battle`);
  check('the fight ends with the ground', !out.lost.stillLive);
  check('and is written down rather than vanishing', out.lost.recorded);
  check('the lost field cannot be re-entered', !out.lost.reEnterable);
  check('and no fresh field may be raised on it', !out.lost.candidate);
}
if (out.contested) {
  // Joining is not opening: a column arriving where a fight is already standing must be routed
  // into `beginBattle`, which absorbs it — never refused, because every caller answers a refusal
  // with a hidden odds roll for the same ground. `verify-fronts` holds the absorb contract itself.
  check('a contested province always admits the next column', out.contested.room === true,
    `${out.contested.land} already has a live battle`);
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: crowding costs, hosts are priced, lost ground ends its war' : 'FAIL: see above');
process.exit(failed.length === 0 ? 0 : 1);
