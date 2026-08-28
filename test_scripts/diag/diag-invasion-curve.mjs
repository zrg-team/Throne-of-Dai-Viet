/**
 * What a wave is *allowed* to be, against a realm of known shape.
 *
 * The played harness (`diag-empire-pressure.mjs`) measures an outcome, and an outcome is as much
 * the policy's as the game's. This one measures the rule: build an empire-mode realm, force it
 * into an exact shape (N provinces, D wall per province, T standing troops), stand it at a given
 * turn, launch one wave through the real spawner, and report what came and what it will meet.
 *
 * The number that matters is the last column: the invader's chance of taking the province it
 * lands on, derived from `resolveInvaderBattle`'s own model —
 *   win  ⟺  attackerPower ≥ defenderPower × defenderBonus × siegeMult × fuzz,  fuzz ∈ [0.9, 1.1)
 * so  P(win) = clamp((attackerPower / (defenderPower × bonus × siege) − 0.9) / 0.2, 0, 1).
 *
 * Usage: node test_scripts/diag/diag-invasion-curve.mjs [--difficulty normal] [--samples 40]
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5199';
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DIFFICULTY = arg('difficulty', 'normal');
const SAMPLES = Number(arg('samples', 40));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });

const out = await page.evaluate(async ([difficulty, samples]) => {
  const GS = await import('/src/state/GameState.ts');
  const War = await import('/src/systems/WarSystem.ts');
  const Inv = await import('/src/systems/empire/InvasionSystem.ts');
  const Dip = await import('/src/systems/DiplomacySystem.ts');
  const Res = await import('/src/systems/ResourceSystem.ts');

  const PID = 'dai-viet';
  const men = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;

  /** A realm forced into an exact shape, so nothing about it is the policy's doing. */
  const shape = (seed, { turn, provinces, wallPerProvince, troops, era, tenure }) => {
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const st = GS.createEmpireGameState({ seaSides: 1, difficulty });
    st.turn = turn;
    st.year = 1 + Math.floor(turn / 8);
    if (st.mandate) st.mandate.era = era;

    // Hand the player a contiguous block of provinces around the seat.
    const seat = st.lands.find((l) => l.ownerId === PID && l.type === 'castle') || st.lands.find((l) => l.ownerId === PID);
    const mine = new Set([seat.id]);
    const frontier = [...seat.neighbors];
    while (mine.size < provinces && frontier.length > 0) {
      const id = frontier.shift();
      const land = st.lands.find((l) => l.id === id);
      if (!land || mine.has(id) || land.ownerId !== 'neutral') continue;
      land.ownerId = PID;
      mine.add(id);
      frontier.push(...land.neighbors);
    }
    // Wall values are deliberately NOT forced: a claimed province keeps the defence the map
    // generated for it (median 17, range 4-29), which is the whole point — the seat is forced to
    // 52 by `createCampaignLands` and nothing else ever is. `wallPerProvince` is added on top as
    // "what the player managed to build here", so 0 means an untouched claim.
    for (const l of st.lands) {
      if (l.ownerId !== PID || l.type === 'castle') continue;
      l.defense += wallPerProvince;
      l.loyalty = 80;
    }
    Res.refreshAllLandOutputs(st);
    // Tenure: how many seasons the realm has held this ground. `growProvincialMilitia` is what
    // turns that into a garrison, so a snapshot that never ticks cannot see it at all.
    for (let g = 0; g < tenure; g += 1) Res.growProvincialMilitia(st);

    if (troops > 0) {
      st.armies.push({
        id: 'host-1', kingdomId: PID, name: 'Host', landId: seat.id,
        units: { spearmen: Math.round(troops * 0.6), archers: Math.round(troops * 0.28), heavyInfantry: Math.round(troops * 0.12) },
        morale: 85, supply: 90, rations: 9999, provisions: 9999,
        level: 3, experience: 0, experienceToNextLevel: 999,
      });
    }
    return { st, seat };
  };

  const rows = [];
  const grid = [];
  // Table 1 — turn x tenure at a fixed eight provinces: does holding ground pay?
  for (const turn of [16, 24, 32, 40, 56]) {
    for (const tenure of [2, 12, 30]) {
      grid.push({
        turn, provinces: 8, tenure, sweep: 'tenure',
        wallPerProvince: tenure <= 2 ? 0 : tenure <= 12 ? 8 : 22,
        troops: turn <= 16 ? 400 : turn <= 32 ? 800 : 1400,
        era: turn <= 12 ? 'founding' : turn <= 32 ? 'rivalry' : turn <= 48 ? 'empires' : 'mandate',
      });
    }
  }
  // Table 2 — turn x province count at a fixed tenure: does expanding change what comes?
  // It must not shrink the wave (that would pay the player for staying small) and must not
  // balloon it (that is the defect this pass exists to remove).
  for (const turn of [24, 40, 56]) {
    for (const provinces of [1, 3, 6, 12, 18]) {
      grid.push({
        turn, provinces, tenure: 12, sweep: 'provinces',
        wallPerProvince: 8,
        troops: turn <= 32 ? 800 : 1400,
        era: turn <= 32 ? 'rivalry' : turn <= 48 ? 'empires' : 'mandate',
      });
    }
  }

  for (const cfg of grid) {
    const acc = { men: 0, hosts: 0, attPow: 0, defPow: 0, medDef: 0, medMil: 0, mil: 0, pWin: 0, pMed: 0, pWeak: 0, n: 0 };
    for (let i = 0; i < samples; i += 1) {
      const orig = Math.random;
      try {
        const { st, seat } = shape(4242 + i * 977, cfg);
        acc.mil += Dip.getPlayerMilitary(st);
        const aggressor = st.kingdoms.find((k) => k.id !== PID && !k.isDefeated);
        Inv.launchOffMapInvasion(st, aggressor.id, {});
        const hosts = (st.invasions || []).map((r) => st.armies.find((a) => a.id === r.armyId)).filter(Boolean);
        const waveMen = hosts.reduce((n, a) => n + men(a), 0);
        acc.men += waveMen;
        acc.hosts += hosts.length;

        // `defenderPower` is not exported, so the same arithmetic is repeated: walls × 16 +
        // militia × 2.5 over rugged terrain, plus the one field host standing there.
        const biggest = hosts.sort((a, b) => men(b) - men(a))[0];
        const attPow = biggest ? War.armyPower(st, biggest) : 0;
        const siege = waveMen > 1000 ? 0.8 : 0.85;
        const pFall = (land) => {
          const field = st.armies.find((a) => a.kingdomId === PID && a.landId === land.id && !a.isLevy);
          const def = (land.defense * 16 + land.localSoldiers * 2.5) * War.terrainDefenseMultiplier(land)
            + (field ? War.armyPower(st, field) : 0);
          // No field host on the tile means no decision is asked, so no defender bonus either.
          const ratio = attPow / Math.max(1, def * (field ? 1.22 : 1) * siege);
          return { p: Math.min(1, Math.max(0, (ratio - 0.9) / 0.2)), def };
        };
        const held = st.lands.filter((l) => l.ownerId === PID);
        const frontier = held.filter((l) => l.type !== 'castle').sort((a, b) => a.defense - b.defense);
        const median = frontier.length ? frontier[Math.floor(frontier.length / 2)] : seat;
        const weakest = frontier.length ? frontier[0] : seat;
        const atSeat = pFall(seat);
        const atMedian = pFall(median);
        const atWeakest = pFall(weakest);
        acc.attPow += attPow;
        acc.defPow += atSeat.def;
        acc.medDef += atMedian.def;
        acc.medMil += median.localSoldiers;
        acc.pWin += atSeat.p;
        acc.pMed += atMedian.p;
        acc.pWeak += atWeakest.p;
        acc.n += 1;
      } finally {
        Math.random = orig;
      }
    }
    rows.push({
      ...cfg,
      waveMen: Math.round(acc.men / acc.n),
      hosts: (acc.hosts / acc.n).toFixed(1),
      attPow: Math.round(acc.attPow / acc.n),
      seatDef: Math.round(acc.defPow / acc.n),
      playerMilitary: Math.round(acc.mil / acc.n),
      pWin: acc.pWin / acc.n, pMed: acc.pMed / acc.n, pWeak: acc.pWeak / acc.n,
      medDef: Math.round(acc.medDef / acc.n), medMil: Math.round(acc.medMil / acc.n),
    });
  }
  return rows;
}, [DIFFICULTY, SAMPLES]);

await browser.close();

const pad = (v, w) => String(v).padStart(w);
console.log(`=== WHAT ONE WAVE IS ALLOWED TO BE (difficulty=${DIFFICULTY}, ${SAMPLES} samples/cell) ===\n`);
console.log(' turn | tenure | +wall | troops |  waveMen | attPow | P(seat) | frontDef | frontMil | P(frontier) | P(weakest)');
let lastTurn = null;
let lastSweep = null;
for (const r of out) {
  if (lastSweep !== null && r.sweep !== lastSweep) {
    console.log('');
    console.log('=== TABLE 2: does expanding change what comes? (tenure fixed at 12) ===');
    console.log(' turn |   prov | +wall | troops |  waveMen | attPow | P(seat) | frontDef | frontMil | P(frontier) | P(weakest)');
  } else if (lastTurn !== null && r.turn !== lastTurn) console.log('');
  lastTurn = r.turn;
  lastSweep = r.sweep;
  const pct = (v) => `${(v * 100).toFixed(0)}%`.padStart(4);
  console.log(` ${pad(r.turn, 4)} | ${pad(r.sweep === 'provinces' ? r.provinces : r.tenure, 6)} | ${pad(r.wallPerProvince, 5)} | ${pad(r.troops, 6)} | ${pad(r.waveMen, 8)} | ${pad(r.attPow, 6)} | ${pad(pct(r.pWin), 7)} | ${pad(r.medDef, 8)} | ${pad(r.medMil, 8)} | ${pad(pct(r.pMed), 11)} | ${pad(pct(r.pWeak), 10)}`);
}
console.log('\nRead down each block: only `prov` changes. A wave that grows with province count while');
console.log('the province it lands on does not is the whole of "expanding makes me weaker".');
console.log(errors.length ? `console errors: ${errors.slice(0, 3).join(' | ')}` : 'no console errors');
