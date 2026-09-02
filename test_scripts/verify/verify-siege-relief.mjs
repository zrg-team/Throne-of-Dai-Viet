/**
 * The army saves the land — the siege clock, the relief march, and the walls put in their place.
 *
 * Dragon Ascent's honest answer to "how do I defend?" used to be *buy another course of wall*: a
 * garrison was `defense * 16`, the hidden roll counted exactly one host (`.find`, not `.filter`),
 * and an invader that reached a province resolved the fight on the tick it arrived — so the mode's
 * own advice, *march a host to the province under attack*, named an order that could never arrive
 * in time.
 *
 * The six things this proves, in the order the plan lists them:
 *
 *   1. masonry is worth half what it was, and only in Ascent
 *   2. the walls can never be more than `MASONRY_SHARE_CAP` of a defence a host is standing in —
 *      and marching a host in never *lowers* a province's defence
 *   3. every host present counts in the roll (the `.find` -> `.filter` pass)
 *   4. an arrival opens a siege clock instead of an assault, and the clock is honoured
 *   5. a host that reaches a besieged province is paid for it and fights in the line
 *   6. the retake window grants up to +25% and decays to nothing over three waves
 *
 * Headless engine — no renderer, so it runs hundreds of seasons in seconds. Ascent only; every
 * mechanic here is behind `gameMode === 'ascent'` and `verify-modes-regression` holds the other
 * three modes byte-identical.
 *
 * Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-siege-relief.mjs
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
  const { createAscentGameState, createInitialGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const WS = await import('/src/systems/WarSystem.ts');
  const PS = await import('/src/systems/ascent/PowerSystem.ts');
  const IS = await import('/src/systems/empire/InvasionSystem.ts');
  const CFG = await import('/src/game/ascentConfig.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  /**
   * What this driver answers, per prompt kind.
   *
   * **`muster-proposal` is the one that decides everything measured below**, and it is the exact
   * trap `playtest-lib.mjs` carries a paragraph about: the card has no `options` array, so a
   * driver that falls through to `'ok'` lands in `AscentResolver`'s `else` branch — which is
   * *decline*, with `MUSTER_DECLINE_TICKS` of silence behind it. `autoRecruit` proposes rather
   * than musters unless `autoMusterSilently` is set, so a driver that never says 'accept' is
   * measuring a realm that can never field an army.
   *
   * That is what the first cut of this harness did, and it is why it reported five of eight seeds
   * with no host at wave 5 and an army share of 16%. The defence formula was never the binding
   * constraint in those numbers; the driver was.
   */
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
      case 'muster-proposal': return 'accept';
      /**
       * Round-robin, not `options[0]`.
       *
       * The first option is `fortify` — walls x2.2, militia x1.5, and no extra host. A driver that
       * always takes it measures a realm that has chosen to turtle, which is precisely the realm
       * whose army share of a defence is lowest, and then reports that share as the mode's. It
       * showed as provinces at 100+ defence and 1,400 militia by wave 5 against a single host.
       * `doctrineIndex` is set per seed by the caller.
       */
      case 'doctrine': return p.options?.[doctrineIndex % p.options.length] ?? 'hold';
      case 'mandate': return p.options?.[0] ?? 'ok';
      case 'dynasty-level': return p.options?.[0] ?? 'ok';
      case 'decree-offer': return p.projectIds?.[0] ?? 'decline';
      case 'province-order': return p.options?.[0]?.id ?? 'ok';
      default: return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
    }
  };
  /** Which doctrine this seed's driver takes; see the 'doctrine' case above. */
  let doctrineIndex = 0;
  const drain = (st) => {
    let g = 0;
    while (st.pendingAscentPrompt && g++ < 40) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
  };
  /** A throwaway host of `men` standing on `land`, so a defence can be measured with and without. */
  const host = (st, land, men, id) => {
    const army = {
      id,
      kingdomId: land.ownerId,
      name: id,
      landId: land.id,
      units: { spearmen: Math.round(men * 0.6), archers: Math.round(men * 0.25), heavyInfantry: Math.round(men * 0.15) },
      morale: 80,
      supply: 80,
      rations: 999,
      provisions: 999,
      level: 1,
      experience: 0,
      experienceToNextLevel: 120,
    };
    st.armies.push(army);
    return army;
  };

  const r = {};

  // ── 1. masonry is worth half what it was, and only in Ascent ─────────────
  seed(20260902);
  {
    const asc = createAscentGameState({ difficulty: 'normal' });
    drain(asc);
    const classic = createInitialGameState();
    r.masonry = {
      ascent: WS.masonryPowerPerDefense(asc),
      classic: WS.masonryPowerPerDefense(classic),
      configAscent: CFG.ASCENT_MASONRY_POWER_PER_DEFENSE,
      configClassic: CFG.MASONRY_POWER_PER_DEFENSE,
    };
  }

  // ── 2 & 3. the share cap, and every host counting ────────────────────────
  //
  // Measured through `createBattlePreview`, which is what both the quoted odds and the roll read,
  // rather than through `defenderPower` directly — a check on a private helper would prove the
  // helper and not the fight.
  seed(20260902);
  {
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    for (let i = 0; i < 12; i += 1) { advanceAscentTick(st); drain(st); }
    st.isDefeated = false;

    const land = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    const from = st.lands.find((l) => land.neighbors.includes(l.id));
    from.ownerId = 'rival-kingdom';
    // Everything of ours off the ground, so each case below is exactly the hosts it adds.
    for (const army of st.armies) if (army.landId === land.id) army.landId = from.id;
    st.armies = st.armies.filter((a) => a.landId !== from.id || a.kingdomId !== PLAYER);
    const attacker = host(st, from, 900, 'probe-attacker');
    attacker.kingdomId = 'rival-kingdom';

    const look = () => WS.createBattlePreview(st, attacker.id, land.id).defenderPower;
    const wallsAlone = look();
    const small = host(st, land, 60, 'probe-small');
    const withSmall = look();
    st.armies = st.armies.filter((a) => a.id !== 'probe-small');
    host(st, land, 900, 'probe-one');
    const withOne = look();
    const one = WS.armyPower(st, st.armies.find((a) => a.id === 'probe-one'));
    host(st, land, 900, 'probe-two');
    const withTwo = look();

    r.hosts = {
      wallsAlone: Math.round(wallsAlone),
      withSmall: Math.round(withSmall),
      withOne: Math.round(withOne),
      withTwo: Math.round(withTwo),
      onePower: Math.round(one),
      // What the walls are worth inside a defence they are only part of.
      masonryShare: withTwo > 0 ? (withTwo - one * 2) / withTwo : 1,
      cap: CFG.MASONRY_SHARE_CAP,
    };
  }

  // ── 4 & 5. the siege clock, and the relief that reaches it ───────────────
  seed(20260902);
  {
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    for (let i = 0; i < 14; i += 1) { advanceAscentTick(st); drain(st); }
    st.isDefeated = false;
    // Battles settle as the hidden roll, so the clock is the only thing under test.
    st.ascent.autoResolveBattles = true;

    const seat = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    // The warm-up can leave a clock already running — and then `openedAt` is tick 0 with a
    // part-spent countdown, and the section measures a siege it did not open. Same class of
    // precondition fault as the standing levy in `verify-land-consequences`.
    for (const l of st.lands) l.siege = undefined;
    const expected = IS.siegeTicksFor(seat);
    const rival = st.kingdoms.find((k) => k.id !== PLAYER && !k.isDefeated);
    IS.launchOffMapInvasion(st, rival.id, {
      forceCoalition: 1, forceConquest: true, staging: 'inland', aimLandId: seat.id, totalSoldiers: 1400,
    });

    const trace = [];
    let openedAt = -1;
    let resolvedAt = -1;
    let firstTicks = 0;
    for (let i = 0; i < 60; i += 1) {
      advanceAscentTick(st);
      drain(st);
      st.isDefeated = false;
      const siege = seat.siege;
      if (siege && openedAt < 0) { openedAt = i; firstTicks = siege.ticksLeft; }
      if (openedAt >= 0 && resolvedAt < 0) {
        // The assault has happened when the walls were carried (the province is being counted
        // away, or is already gone) or when the clock was re-set after a repel.
        const carried = seat.ownerId !== PLAYER || st.siegeOrders.some((o) => o.landId === seat.id);
        const renewed = siege && siege.ticks !== firstTicks;
        const reset = siege && siege.ticksLeft > 0 && i > openedAt + firstTicks;
        if (carried || renewed || (reset && siege.ticksLeft >= firstTicks)) resolvedAt = i;
      }
      if (i < 24) {
        trace.push({
          tick: i,
          ticksLeft: siege ? siege.ticksLeft : null,
          mine: seat.ownerId === PLAYER,
          carried: st.siegeOrders.some((o) => o.landId === seat.id),
        });
      }
      if (resolvedAt >= 0) break;
    }
    r.clock = {
      expected, openedAt, resolvedAt, firstTicks, trace,
      held: resolvedAt < 0 ? null : resolvedAt - openedAt,
    };
  }

  // ── 5b. how often relief actually reaches a siege, over full runs ────────
  const relief = { opened: 0, relievable: 0, relieved: 0, seeds: [] };
  // Eight seeds, not four: the rate moved 22 -> 45 -> 28 across three runs of four, which is a
  // noise floor wider than the gate it is being measured against.
  // Sixteen, for the same reason the split below uses sixteen: at eight this rate moved 17-45%
  // between runs of builds that differed by one clause.
  for (const [n, s] of [11, 22, 33, 44, 55, 66, 77, 88, 99, 111, 122, 133, 144, 155, 166, 177].entries()) {
    doctrineIndex = n;
    seed(20260902 + s);
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    const seen = new Map();
    let opened = 0;
    let relievable = 0;
    let joined = 0;
    for (let i = 0; i < 260; i += 1) {
      advanceAscentTick(st);
      drain(st);
      if (st.isDefeated) break;
      for (const land of st.lands) {
        const siege = land.siege;
        const key = land.id;
        if (siege && !seen.has(key)) {
          /**
           * **Could a relief march have happened at all?**
           *
           * The gate is about the mechanic, and the mechanic needs two things that a collapsing
           * realm does not have. A realm down to its last province has nowhere to march *from* —
           * and the defenders standing on that province are `presentAtOpen` by definition, so they
           * can never earn the reward however long they hold. Counting those sieges in the
           * denominator measures the realm's health, not whether relief works, and makes the gate
           * unmeetable however good the relief rule is.
           *
           * So: at least two provinces held, and at least one standing host that is not already on
           * the ground being besieged. `opened` is still reported beside it, because the gap
           * between the two numbers is itself the finding.
           */
          const held = st.lands.filter((l) => l.ownerId === PLAYER).length;
          const elsewhere = st.armies.some((a) => a.kingdomId === PLAYER && !a.isLevy && !a.patron
            && a.landId !== land.id
            && a.units.spearmen + a.units.archers + a.units.heavyInfantry
              >= CFG.MIN_ARMY_SOLDIERS * CFG.REMNANT_SHARE);
          const couldRelieve = held >= 2 && elsewhere;
          seen.set(key, { relieved: false, couldRelieve });
          opened += 1;
          if (couldRelieve) relievable += 1;
        }
        if (!siege) { seen.delete(key); continue; }
        const mark = seen.get(key);
        if (siege.relieved && mark && !mark.relieved) {
          mark.relieved = true;
          // Only counted against the denominator it was measured in.
          if (mark.couldRelieve) joined += 1;
        }
      }
    }
    relief.opened += opened;
    relief.relievable += relievable;
    relief.relieved += joined;
    relief.seeds.push({
      seed: s, opened, relievable, joined,
      wave: st.ascent.wave, lands: st.lands.filter((l) => l.ownerId === PLAYER).length,
    });
  }
  r.relief = relief;

  // ── 6. the retake window ─────────────────────────────────────────────────
  seed(20260902);
  {
    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    for (let i = 0; i < 12; i += 1) { advanceAscentTick(st); drain(st); }
    st.isDefeated = false;
    st.ascent.wave = 9;

    const target = st.lands.find((l) => l.ownerId !== PLAYER && l.neighbors.some(
      (id) => st.lands.find((n) => n.id === id)?.ownerId === PLAYER));
    const from = st.lands.find((l) => l.ownerId === PLAYER && l.neighbors.includes(target.id));
    for (const army of st.armies) if (army.kingdomId === PLAYER) army.landId = from.id;
    const attacker = st.armies.find((a) => a.kingdomId === PLAYER) ?? host(st, from, 900, 'probe-retaker');

    const power = () => WS.createBattlePreview(st, attacker.id, target.id).attackerPower;
    target.lostAtWave = undefined;
    const base = power();
    const curve = [];
    for (let elapsed = 0; elapsed <= CFG.RETAKE_BONUS_WAVES; elapsed += 1) {
      target.lostAtWave = st.ascent.wave - elapsed;
      curve.push({ elapsed, ratio: power() / base });
    }
    r.retake = { base: Math.round(base), curve, bonus: CFG.RETAKE_POWER_BONUS, waves: CFG.RETAKE_BONUS_WAVES };
  }

  /**
   * ── The three-way split of a *contested* defence at wave 5 ───────────────
   *
   * At the point of contact, not summed over the realm. A wave lands on one province, so the
   * defence it meets is that province's garrison plus the field hosts that can reach it — the same
   * distinction `computeFieldDefencePower` exists to make, and summing thirty-five garrisons
   * against a host that can only attack one of them is the category error the mode's own comments
   * warn about.
   *
   * The province measured is the one a wave would face: the median-garrison province, matching
   * `waveFacingDefencePower`.
   */
  {
    const rows = [];
    // Sixteen, not eight. Host coverage moved across 3/8, 5/8, 6/8, 7/8 and 8/8 between builds
    // that differed by one clause — a band wider than the thing being measured, which is the same
    // reason /funscore is never run at eight.
    //
    // **Read this block only against the same script.** It is deterministic run to run, but it is
    // *not* independent of what ran before it in the same page: widening the relief block above
    // from eight seeds to sixteen moved coverage here from 12/16 to 9/16 with no change to this
    // block or to any game code. Something in the module graph carries across `createAscentGameState`
    // calls; it has not been identified, so an A/B of two builds must run an identical script, and a
    // number quoted from a different version of this file is not comparable.
    for (const [n, s] of [11, 22, 33, 44, 55, 66, 77, 88, 99, 111, 122, 133, 144, 155, 166, 177].entries()) {
      doctrineIndex = n;
      seed(20260902 + s);
      const st = createAscentGameState({ difficulty: 'normal' });
      drain(st);
      // Host coverage is a metric in its own right: a realm with no army cannot relieve a siege
      // and cannot be a share of its own defence, so every number below is downstream of it.
      let hostsByWave3 = 0;
      for (let i = 0; i < 400 && st.ascent.wave < 3; i += 1) {
        advanceAscentTick(st); drain(st); if (st.isDefeated) break;
      }
      // `REMNANT_SHARE` of `MIN_ARMY_SOLDIERS`, the same threshold `autoRecruit` counts by — a
      // host of eighteen men is a rout's leftovers, not an army, and counting it as coverage
      // reports a realm as defended by something that cannot stand in a line.
      const fielded = (a) => a.kingdomId === PLAYER && !a.isLevy && !a.patron
        && a.units.spearmen + a.units.archers + a.units.heavyInfantry
          >= CFG.MIN_ARMY_SOLDIERS * CFG.REMNANT_SHARE;
      hostsByWave3 = st.armies.filter(fielded).length;
      for (let i = 0; i < 400 && st.ascent.wave < 5; i += 1) { advanceAscentTick(st); drain(st); if (st.isDefeated) break; }
      const mine = st.lands.filter((l) => l.ownerId === PLAYER);
      if (mine.length === 0) continue;
      const ranked = mine.slice().sort((a, b) => PS.landGarrisonPower(st, a) - PS.landGarrisonPower(st, b));
      const land = ranked[Math.floor(ranked.length / 2)];

      const whole = PS.landGarrisonPower(st, land);
      const wallTerm = land.defense * WS.masonryPowerPerDefense(st);
      const rawTotal = wallTerm + land.localSoldiers * WS.militiaPowerPerMan(st);
      const masonry = rawTotal > 0 ? whole * (wallTerm / rawTotal) : whole;
      const militia = whole - masonry;
      const hosts = st.armies.filter(fielded);
      const army = hosts.reduce((sum, a) => sum + WS.armyPower(st, a), 0);
      // What the roll actually reads once both are in it — the cap included.
      const contested = WS.combinedDefencePower(st, whole, army);
      rows.push({
        seed: s,
        wave: st.ascent.wave,
        turn: st.turn,
        doctrine: st.ascent.doctrine ?? '-',
        lands: mine.length,
        hostsByWave3,
        recruits: st.ascent.autopilotStats?.recruits ?? 0,
        land: land.name,
        defense: Math.round(land.defense),
        militiaMen: Math.round(land.localSoldiers),
        hosts: hosts.length,
        hostMen: hosts.reduce((n, a) => n + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0),
        masonry: Math.round(masonry),
        militia: Math.round(militia),
        army: Math.round(army),
        contested: Math.round(contested),
        armyShare: contested > 0 ? Math.min(1, army / contested) : 0,
      });
    }
    r.split = rows;
  }

  return r;
});

await browser.close();

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};
const pct = (v) => `${(v * 100).toFixed(0)}%`;

console.log('=== 1. THE MASONRY TERM ===');
console.log(`  ascent ${out.masonry.ascent} per point of defence · classic ${out.masonry.classic}`);
check('Ascent halves the masonry term', out.masonry.ascent === out.masonry.configAscent && out.masonry.ascent === 8);
check('the classic modes keep 16', out.masonry.classic === out.masonry.configClassic && out.masonry.classic === 16);

console.log('\n=== 2. THE WALLS ARE A MINORITY SHARE ===');
console.log(`  walls alone            ${out.hosts.wallsAlone}`);
console.log(`  + a token company      ${out.hosts.withSmall}`);
console.log(`  + one host (${out.hosts.onePower})   ${out.hosts.withOne}`);
console.log(`  + a second host        ${out.hosts.withTwo}`);
check('marching a host in never lowers a province\'s defence',
  out.hosts.withSmall >= out.hosts.wallsAlone,
  `${out.hosts.wallsAlone} -> ${out.hosts.withSmall}`);
check('the walls are capped once a real host stands there',
  out.hosts.masonryShare <= out.hosts.cap + 0.01,
  `walls are ${pct(out.hosts.masonryShare)} of the defence, cap ${pct(out.hosts.cap)}`);

console.log('\n=== 3. EVERY HOST COUNTS (.find -> .filter) ===');
check('a second host raises the defence the roll reads',
  out.hosts.withTwo > out.hosts.withOne * 1.2,
  `${out.hosts.withOne} -> ${out.hosts.withTwo} (one host is worth ${out.hosts.onePower})`);

console.log('\n=== 4. THE SIEGE CLOCK ===');
for (const row of out.clock.trace) {
  console.log(`  tick ${String(row.tick).padStart(2)}  walls ${row.ticksLeft === null ? '  —' : String(row.ticksLeft).padStart(3)}`
    + `  ${row.mine ? 'ours' : 'LOST'}${row.carried ? '  (being counted away)' : ''}`);
}
console.log(`  opened at tick ${out.clock.openedAt} with ${out.clock.firstTicks} seasons`
  + ` (siegeTicksFor said ${out.clock.expected}); assault at tick ${out.clock.resolvedAt}`);
check('an arrival opens a clock rather than an assault', out.clock.openedAt >= 0);
check('the clock is the one the walls are worth', out.clock.firstTicks === out.clock.expected,
  `${out.clock.firstTicks} vs ${out.clock.expected}`);
check('the province survives the whole clock',
  out.clock.held === null || out.clock.held >= out.clock.firstTicks,
  `held ${out.clock.held} seasons against a clock of ${out.clock.firstTicks}`);

console.log('\n=== 5. RELIEF REACHES THE WALLS ===');
for (const row of out.relief.seeds) {
  console.log(`  seed ${row.seed}: ${row.opened} siege(s), ${row.relievable} where relief was possible,`
    + ` ${row.joined} relieved  (wave ${row.wave}, ${row.lands} provinces held)`);
}
const reliefRate = out.relief.relievable > 0 ? out.relief.relieved / out.relief.relievable : 0;
console.log(`  ${out.relief.relieved} of ${out.relief.relievable} relievable sieges relieved — ${pct(reliefRate)}`
  + `  (${out.relief.opened} opened in all; the rest were realms with one province left,`
  + ` or with every host already standing on the besieged ground)`);
check('sieges happen at all', out.relief.opened > 0,
  `${out.relief.opened} opened across ${out.relief.seeds.length} seeds`);
// Printed, not gated. How often relief is even *possible* is a fact about the probe realm's health
// rather than about the mechanic, and turning it into a pass/fail would put a verdict on realm
// survival into the one harness that must not carry one — /funscore owns that, and its driver plays
// the run far better than this one does.
console.log(`  relief was possible in ${out.relief.relievable} of ${out.relief.opened} sieges`
  + ` (${pct(out.relief.relievable / Math.max(1, out.relief.opened))})`);
// Same root cause as the split below: relief cannot arrive from an army that was never raised.
// `tickAutoDefend` now sends an idle auto-command host at the besieged province rather than at
// whichever of ours happens to lie nearest the invader, which moved this from 20% to 27% and
// lengthened the runs; the remaining gap is hosts that do not exist.
check('at least half of the reachable ones see a host arrive', reliefRate >= 0.5, pct(reliefRate));

console.log('\n=== 6. THE RETAKE WINDOW ===');
for (const row of out.retake.curve) {
  console.log(`  ${row.elapsed} wave(s) since the loss: attacker power x${row.ratio.toFixed(4)}`);
}
const opening = out.retake.curve[0].ratio;
const closed = out.retake.curve[out.retake.curve.length - 1].ratio;
check('a freshly lost province is retaken at the full bonus',
  Math.abs(opening - (1 + out.retake.bonus)) < 0.01, `x${opening.toFixed(3)}`);
check('the window decays to nothing', Math.abs(closed - 1) < 0.001, `x${closed.toFixed(3)}`);
check('and it decays monotonically',
  out.retake.curve.every((row, i) => i === 0 || row.ratio <= out.retake.curve[i - 1].ratio + 1e-9));

console.log('\n=== THE THREE-WAY SPLIT OF A CONTESTED DEFENCE AT WAVE 5 ===');
for (const row of out.split) {
  console.log(`  seed ${row.seed} (${row.doctrine}, t${row.turn}): wave ${row.wave}, ${row.lands} provinces · ${row.land}`
    + ` (defence ${row.defense}, ${row.militiaMen} militia) vs ${row.hosts} host(s) of ${row.hostMen} men`
    + ` [${row.recruits} muster(s), ${row.hostsByWave3} host(s) by wave 3]`);
  console.log(`      masonry ${row.masonry}  militia ${row.militia}  army ${row.army}`
    + `  -> contested ${row.contested}  (army ${pct(row.armyShare)})`);
}
const meanShare = out.split.length
  ? out.split.reduce((n, row) => n + row.armyShare, 0) / out.split.length : 0;
/**
 * The gate, and the diagnosis it needs to be read with.
 *
 * Measured across eight seeds: **half of them have no field host at all at wave 5.** Where the
 * realm does have one the army is 26-45% of the contested defence; where it has none the share is
 * zero by construction and no defence formula can move it. So the shortfall against the phase's
 * 45-60% band is not the masonry term, the share cap or the roll — all three measure as designed
 * above — it is that an autopiloted realm frequently has not raised a host by wave 5.
 *
 * Both dials this phase owns have been spent on it: masonry halved, and then the militia term
 * halved as well after the first measurement showed masonry was no longer the big term by wave 5.
 * Two further probes were tried and reverted for measuring worse — widening the muster discount to
 * the whole arming bill (share 21% -> 16%), and letting the relief rule interrupt marches already
 * under way (runs collapsed to 0-1 provinces). Raising a host earlier is an autopilot and economy
 * question, not a defence-formula one, and it is left to be measured on its own.
 */
const withHost = out.split.filter((row) => row.hosts > 0 && row.army > 0);
const hostless = out.split.length - withHost.length;
const meanWithHost = withHost.length
  ? withHost.reduce((n, row) => n + row.armyShare, 0) / withHost.length : 0;
const coveredBy3 = out.split.filter((row) => row.hostsByWave3 > 0).length;
const coveredBy5 = out.split.length - hostless;
console.log(`  host coverage: ${coveredBy3}/${out.split.length} seeds field a host by wave 3,`
  + ` ${coveredBy5}/${out.split.length} by wave 5`);
console.log(`  ${hostless} of ${out.split.length} seeds field no host at all at wave 5;`
  + ` where one exists the army is ${pct(meanWithHost)} of the contested defence`);
check('every realm fields a host by wave 3', coveredBy3 === out.split.length,
  `${coveredBy3}/${out.split.length} seeds`);
check('and still holds one at wave 5', coveredBy5 === out.split.length,
  `${coveredBy5}/${out.split.length} seeds`);
check('the army is 45-60% of a contested defence by wave 5',
  meanShare >= 0.45 && meanShare <= 0.60,
  `mean ${pct(meanShare)} — ${pct(meanWithHost)} across the ${withHost.length} seed(s) that have a host,`
  + ` 0% across the ${hostless} that do not`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the army saves the land' : 'FAIL: see above');
process.exit(failed.length === 0 ? 0 : 1);
