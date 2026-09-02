/**
 * Does the ground matter? The four consequences that make territory worth holding.
 *
 * Every one of these was missing, and together they are why a reported Dragon Ascent run could sit
 * on a single district holding 46,400 people at Year 74, lose ground for free, and meet an
 * identical garrison on every wave.
 *
 *   1. population converges on `realmPopulationCapacity` instead of compounding for ever
 *   2. losing a province costs the realm people, and its watch goes with the ground
 *   3. a fought defence knocks walls down, and they come back over `WALL_REPAIR_SEASONS`
 *   4. the governor of a province commands its defence when no host is standing there
 *
 * Headless engine — no renderer, so it runs a thousand seasons in a few seconds. Ascent only;
 * every mechanic here is behind `gameMode === 'ascent'` and `verify-modes-regression` holds the
 * other three modes byte-identical.
 *
 * Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-land-consequences.mjs
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
  const CS = await import('/src/systems/ascent/ConquestSystem.ts');
  const IS = await import('/src/systems/empire/InvasionSystem.ts');
  const LC = await import('/src/systems/ascent/landCommand.ts');
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

  const r = {};

  // 1. the ceiling
  seed(20260827);
  {
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    const trace = [];
    for (let i = 0; i < 400; i += 1) {
      advanceAscentTick(st);
      drain(st);
      if (i % 80 === 79) {
        trace.push({
          tick: i + 1,
          lands: st.lands.filter((l) => l.ownerId === PLAYER).length,
          humans: Math.round(st.resources.humans),
          cap: RS.realmPopulationCapacity(st),
          rate: st.resourceRates.humans,
        });
      }
    }
    r.growth = trace;
    // Only while the realm still holds ground: a dead run has a capacity of 1 by construction and
    // any ratio measured against it is arithmetic about nothing.
    const live = trace.filter((row) => row.lands > 0);
    r.worstRatio = live.length ? Math.max(...live.map((row) => row.humans / row.cap)) : 0;
  }

  // 1b. the reported case: one province, held for a very long time.
  //
  // Year 74 of the reported run was a single district carrying 46,400 people at +229 a season and
  // still climbing. The autopilot is switched off and the realm is pinned to its seat so the only
  // thing being measured is the growth curve itself.
  seed(20260827);
  {
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    const seat = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    const trace = [];
    for (let i = 0; i < 600; i += 1) {
      // Pinned every tick: the seat is always ours and nothing else ever is. Without the first
      // half the seat falls to a wave, the run ends, and the ticks after it are no-ops — which is
      // what a frozen population at capacity 1 was telling us.
      seat.ownerId = PLAYER;
      for (const l of st.lands) if (l.id !== seat.id && l.ownerId === PLAYER) l.ownerId = 'neutral';
      // `advanceAscentTick` returns immediately once `isDefeated` is set, and stripping the realm
      // to one district trips the capital-grace defeat inside the first few seasons — after which
      // every remaining tick was a no-op and the trace read as a population that had stopped
      // growing. This probe is about the growth curve, so the run is kept alive around it.
      st.isDefeated = false;
      advanceAscentTick(st);
      drain(st);
      if (i % 150 === 149) {
        // Re-pinned before the read: a wave that took the seat during the tick would otherwise be
        // sampled as a realm of no land at all, and the ceiling read as 1.
        seat.ownerId = PLAYER;
        trace.push({
          tick: i + 1,
          humans: Math.round(st.resources.humans),
          cap: RS.realmPopulationCapacity(st),
          rate: st.resourceRates.humans,
        });
      }
    }
    seat.ownerId = PLAYER;
    r.oneLand = trace;
    r.oneLandRatio = st.resources.humans / Math.max(1, RS.realmPopulationCapacity(st));
  }

  // 2. losing ground
  seed(20260827);
  {
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    for (let i = 0; i < 40; i += 1) { advanceAscentTick(st); drain(st); }
    const mine = st.lands.filter((l) => l.ownerId === PLAYER);
    const victim = mine.find((l) => l.id !== st.ascent.capitalLandId) ?? mine[0];
    const before = st.resources.humans;
    const owned = new Set(st.lands.filter((l) => l.ownerId === PLAYER).map((l) => l.id));
    const militiaBefore = victim.localSoldiers;
    victim.ownerId = st.kingdoms.find((k) => k.id !== PLAYER)?.id ?? 'rival';
    CS.detectConquests(st, owned);
    r.loss = {
      land: victim.name,
      population: victim.population,
      humansBefore: Math.round(before),
      humansAfter: Math.round(st.resources.humans),
      dropped: Math.round(before - st.resources.humans),
      expected: Math.round(victim.population * (1 - CFG.REFUGEE_SHARE)),
      militiaBefore,
      militiaAfter: victim.localSoldiers,
    };
  }

  // 3. the walls stay down
  seed(20260827);
  {
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    for (let i = 0; i < 20; i += 1) { advanceAscentTick(st); drain(st); }
    const land = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    /**
     * Send home anything already standing, before the measurement starts.
     *
     * This section raises a levy, mauls it, dissolves it and raises a second one — and the
     * dissolve at the middle of that dissolves **every** levy on the map, not only ours. A fight
     * already live at the seat on tick 20 leaves its own levy standing, holding that province's
     * militia; the mid-measurement dissolve then pours that militia back in at full strength and
     * the *second* turnout is raised from a province with more men than the first one had.
     *
     * Observed exactly that way: militia 56 before the first levy and 371 after the dissolve, so
     * the second turnout came out larger than the first and this section reported a mauled
     * defence getting stronger. It is a precondition the harness never controlled, and whether it
     * bites depends on nothing more than whether tick 20 happens to have a battle running.
     */
    IS.dissolveGarrisonLevies(st);
    /**
     * And nobody standing on it either — the same isolation section 4 does, for the same reason.
     *
     * What this section is about is the *province's own* defence: raise its watch, maul it, and
     * meet a thinner one next time. Since the share cap shipped (`combinedDefencePower`), a field
     * host standing on the ground is deliberately the deciding term of the defence and the walls
     * are clamped to a minority of it — so with the royal host parked on the seat the turnout is
     * pinned to what the host is worth and stops tracking the masonry at all. That is the new rule
     * working, not the consequence failing, but it means the walls cannot be measured through it.
     */
    for (const army of st.armies) {
      if (army.landId === land.id && !army.isLevy) army.landId = '__away__';
    }
    const defBefore = land.defense;
    const levy = IS.raiseGarrisonLevy(st, land);
    const mustered = levy.units.spearmen + levy.units.archers + levy.units.heavyInfantry;
    // Maul it: 60% of the turnout falls.
    for (const k of ['spearmen', 'archers', 'heavyInfantry']) levy.units[k] = Math.round(levy.units[k] * 0.4);
    IS.dissolveGarrisonLevies(st);
    const defAfter = land.defense;
    const breach = land.wallsBreached ?? 0;
    // A second contact must meet a smaller turnout.
    const levy2 = IS.raiseGarrisonLevy(st, land);
    const mustered2 = levy2.units.spearmen + levy2.units.archers + levy2.units.heavyInfantry;
    IS.dissolveGarrisonLevies(st);
    // ...and it must come back.
    const repairFrom = land.defense;
    for (let i = 0; i < CFG.WALL_REPAIR_SEASONS + 4; i += 1) RS.repairProvincialDefence(st);
    r.walls = {
      defBefore,
      defAfter,
      breach,
      mustered,
      mustered2,
      turnoutDrop: 1 - mustered2 / Math.max(1, mustered),
      repairFrom,
      repaired: land.defense,
      breachLeft: land.wallsBreached ?? 0,
    };
  }

  // 4. the governor holds the walls
  seed(20260827);
  {
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    for (let i = 0; i < 20; i += 1) { advanceAscentTick(st); drain(st); }
    const land = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    // Nobody standing here, so the province defends itself.
    for (const army of st.armies) if (army.landId === land.id) army.landId = '__away__';
    const hero = st.heroes[0];
    const before = LC.defenceCommanderOf(st, land);
    hero.assignedTo = land.id;
    const after = LC.defenceCommanderOf(st, land);
    r.command = {
      heroesInRealm: st.heroes.length,
      withoutGovernor: before ? before.name : null,
      withGovernor: after ? after.name : null,
      martial: after ? after.stats.martial : null,
    };
  }

  return r;
});

await browser.close();

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

console.log('=== 1. POPULATION CEILING ===');
for (const row of out.growth) {
  console.log(`  tick ${String(row.tick).padStart(3)}  ${String(row.lands).padStart(2)} lands`
    + `  ${String(row.humans).padStart(7)} people of ${String(row.cap).padStart(7)}`
    + `  (${(row.humans / row.cap * 100).toFixed(0)}% full, ${row.rate >= 0 ? '+' : ''}${row.rate}/season)`);
}
check('population stays inside its ceiling while the realm lives', out.worstRatio <= 1.05,
  `peaked at ${(out.worstRatio * 100).toFixed(0)}% of capacity`);

console.log('\n=== 1b. ONE PROVINCE, 600 SEASONS (the reported case) ===');
for (const row of out.oneLand) {
  console.log(`  tick ${String(row.tick).padStart(3)}  ${String(row.humans).padStart(7)} people`
    + ` of ${String(row.cap).padStart(7)}  (${(row.humans / row.cap * 100).toFixed(0)}% full,`
    + ` ${row.rate >= 0 ? '+' : ''}${row.rate}/season)`);
}
check('one province cannot hold a city', out.oneLandRatio <= 1.05,
  `${(out.oneLandRatio * 100).toFixed(0)}% of capacity — reported run held 46,400 on one district`);

console.log('\n=== 2. LOSING GROUND ===');
console.log(`  ${out.loss.land}: ${out.loss.population} people, realm ${out.loss.humansBefore} -> ${out.loss.humansAfter}`);
check('losing a province costs its people', out.loss.dropped === out.loss.expected,
  `dropped ${out.loss.dropped}, expected ${out.loss.expected}`);
check('the province keeps almost none of its watch', out.loss.militiaAfter <= out.loss.militiaBefore * 0.3,
  `${out.loss.militiaBefore} -> ${out.loss.militiaAfter}`);

console.log('\n=== 3. THE WALLS STAY DOWN ===');
console.log(`  defence ${out.walls.defBefore} -> ${out.walls.defAfter} (breach ${out.walls.breach})`);
console.log(`  turnout ${out.walls.mustered} -> ${out.walls.mustered2} men on the next contact`);
check('a mauled defence costs the walls', out.walls.defAfter < out.walls.defBefore,
  `${out.walls.defBefore} -> ${out.walls.defAfter}`);
check('the next wave meets a smaller turnout', out.walls.turnoutDrop > 0.05,
  `${(out.walls.turnoutDrop * 100).toFixed(0)}% fewer men`);
check('the breach is rebuilt in time',
  out.walls.repaired >= out.walls.defBefore * 0.98 && out.walls.breachLeft === 0,
  `${out.walls.repairFrom} -> ${out.walls.repaired} of ${out.walls.defBefore}, ${out.walls.breachLeft} left`);

console.log('\n=== 4. THE GOVERNOR COMMANDS ===');
console.log(`  without a governor: ${out.command.withoutGovernor ?? '(nobody)'}`);
console.log(`  with a governor:    ${out.command.withGovernor ?? '(nobody)'} (martial ${out.command.martial})`);
check('an ungoverned, unheld province has no commander', out.command.withoutGovernor === null);
check('the governor commands the defence', Boolean(out.command.withGovernor));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the ground matters' : 'FAIL: see above');
process.exit(failed.length === 0 ? 0 : 1);
