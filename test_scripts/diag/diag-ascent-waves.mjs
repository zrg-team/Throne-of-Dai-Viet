/**
 * Playing Dragon Ascent and writing down what actually arrives.
 *
 * Three reported things, all of them about the first hour of a run:
 *   · "it makes multiple invasions at the same time"
 *   · the first waves are too hard, and the player does not get to fight them
 *   · the "Lập quân" (muster) card comes up while a host is already being gathered
 *
 * So this prints, per tick: the wave, how many invading hosts stand on the map and where they
 * came from, the realm's own field power against theirs, whether a battle was opened or settled
 * by a hidden roll, and every prompt raised — with a flag on any muster card raised while a
 * recruitment order was already in progress or while no free commander existed.
 *
 * Usage: node test_scripts/diag/diag-ascent-waves.mjs [--seeds 4] [--ticks 160] [--verbose]
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5199';
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 4));
const TICKS = Number(arg('ticks', 160));
const VERBOSE = process.argv.includes('--verbose');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });

const runs = [];
for (let i = 0; i < SEEDS; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  runs.push(await page.evaluate(async ([seed, ticks]) => {
    const orig = Math.random;
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      const GS = await import('/src/state/GameState.ts');
      const Tick = await import('/src/systems/ascent/AscentTick.ts');
      const Resolver = await import('/src/systems/ascent/AscentResolver.ts');
      const War = await import('/src/systems/WarSystem.ts');
      const Fronts = await import('/src/systems/ascent/fronts.ts');
      const PID = 'dai-viet';
      const men = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;

      const st = GS.createAscentGameState({ seaSides: 1, difficulty: 'normal' });
      const mine = () => st.armies.filter((a) => a.kingdomId === PID && !a.isLevy && !a.patron);
      const invaderArmies = () => (st.invasions ?? [])
        .map((r) => st.armies.find((a) => a.id === r.armyId)).filter(Boolean);

      const rows = [];
      const promptLog = [];
      const spawns = [];
      let knownHosts = new Set();
      let toastSeen = 0;
      const musterBugs = [];
      const battles = [];
      let lastWave = 0;

      // Answer prompts the way `playtest-lib` does: first affordable option per kind.
      const answer = (p) => {
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
          case 'battle': return 'fight';
          default: {
            const o = p.options ?? [];
            return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
          }
        }
      };

      for (let i = 0; i < ticks; i += 1) {
        let guard = 0;
        while (st.pendingAscentPrompt && guard++ < 40) {
          const p = st.pendingAscentPrompt;
          if (p.kind === 'run-over') break;
          // The reported bug, caught at the moment the card is up rather than inferred.
          if (p.kind === 'muster-proposal') {
            const training = st.recruitmentOrders.map((o) => ({ land: o.landId, hero: o.heroId, left: o.required - o.progress }));
            const hero = st.heroes.find((h) => h.id === p.heroId);
            musterBugs.push({
              tick: st.turn, wave: st.ascent?.wave,
              heroId: p.heroId,
              heroBusyWith: hero?.assignedTo ?? null,
              inProgress: training,
              standingHosts: mine().length,
            });
          }
          promptLog.push({ tick: st.turn, wave: st.ascent?.wave, kind: p.kind });
          Resolver.resolveAscentPrompt(st, answer(p));
        }
        if (st.pendingAscentPrompt?.kind === 'run-over') break;

        const waveBefore = st.ascent?.wave ?? 0;
        Tick.advanceAscentTick(st);

        // Which spawner sent each new host. Every source pushes its own toast in the same tick,
        // so the toast tail is the attribution — there is no other seam to read it from.
        const toasts = (st.toasts ?? []).slice(toastSeen).map((x) => x.text ?? '');
        toastSeen = (st.toasts ?? []).length;
        for (const r of (st.invasions ?? [])) {
          if (knownHosts.has(r.armyId)) continue;
          knownHosts.add(r.armyId);
          const a = st.armies.find((x) => x.id === r.armyId);
          spawns.push({
            tick: st.turn, wave: st.ascent?.wave ?? 0,
            waveAdvanced: (st.ascent?.wave ?? 0) > waveBefore,
            kingdom: r.kingdomId, intent: r.intent, great: !!r.great,
            men: a ? men(a) : 0,
            toasts,
          });
        }

        const invs = invaderArmies();
        const byKingdom = {};
        for (const r of (st.invasions ?? [])) byKingdom[r.kingdomId] = (byKingdom[r.kingdomId] ?? 0) + 1;
        // Use the real helper, not a guessed field name — `engagements` vs `battleHistory`
        // already cost one wrong reading in this file.
        const live = Fronts.liveBattles(st).length;
        if ((st.ascent?.wave ?? 0) > lastWave) {
          lastWave = st.ascent.wave;
        }
        rows.push({
          tick: st.turn, wave: st.ascent?.wave ?? 0,
          lands: st.lands.filter((l) => l.ownerId === PID).length,
          hosts: invs.length,
          crowns: Object.keys(byKingdom).length,
          perCrown: Object.values(byKingdom).join('/'),
          invaderMen: invs.reduce((n, a) => n + men(a), 0),
          invaderPower: Math.round(invs.reduce((n, a) => n + War.armyPower(st, a), 0)),
          ourMen: mine().reduce((n, a) => n + men(a), 0),
          ourPower: Math.round(mine().reduce((n, a) => n + War.armyPower(st, a), 0)),
          liveBattles: live,
          threat: Math.round(st.ascent?.threat ?? 0),
        });
        if (st.isDefeated) break;
      }

      // Every engagement the run recorded, so "did the player get to fight it" is answerable.
      const ledger = (st.ascent?.battleHistory ?? []).map((e) => ({
        turn: e.turn, wave: e.wave, land: e.landName, outcome: e.outcome,
        delegated: e.delegated, rounds: e.rounds, ourStart: e.ourStart, theirStart: e.theirStart,
      }));

      return {
        seed, rows, promptLog, musterBugs, battles, ledger, spawns,
        score: st.campaignScore ?? null,
        endTick: st.turn, defeated: !!st.isDefeated,
        waves: st.ascent?.wave ?? 0,
      };
    } finally { Math.random = orig; }
  }, [4242 + i * 7919, TICKS]));
}
await browser.close();

const pad = (v, w) => String(v).padStart(w);
console.log(`=== DRAGON ASCENT — ${SEEDS} seeds, ${TICKS} ticks ===\n`);

for (const run of runs) {
  console.log(`seed ${run.seed}  ${run.defeated ? `DEFEAT t${run.endTick}` : `survived t${run.endTick}`}  waves=${run.waves}`);
  if (VERBOSE) {
    console.log('  tick wave lands hosts crowns per  invMen invPow  ourMen ourPow live threat');
    for (const r of run.rows) {
      console.log(`  ${pad(r.tick, 4)} ${pad(r.wave, 4)} ${pad(r.lands, 5)} ${pad(r.hosts, 5)} ${pad(r.crowns, 6)} ${String(r.perCrown).padEnd(4)} ${pad(r.invaderMen, 6)} ${pad(r.invaderPower, 6)}  ${pad(r.ourMen, 6)} ${pad(r.ourPower, 6)} ${pad(r.liveBattles, 4)} ${pad(r.threat, 6)}`);
    }
  }
  // The first two waves, in detail — that is the reported moment.
  const early = run.rows.filter((r) => r.wave <= 2 && r.hosts > 0);
  if (early.length) {
    const worst = early.reduce((a, b) => (b.invaderPower > a.invaderPower ? b : a));
    console.log(`  waves 1-2: peak ${worst.hosts} hosts from ${worst.crowns} crown(s) at once (${worst.perCrown}),`
      + ` ${worst.invaderMen} men / ${worst.invaderPower} power vs our ${worst.ourMen} men / ${worst.ourPower} power`);
  }
  const peak = run.rows.reduce((a, b) => (b.hosts > a.hosts ? b : a), run.rows[0]);
  console.log(`  peak on the map: ${peak.hosts} hosts from ${peak.crowns} crowns at tick ${peak.tick} (wave ${peak.wave})`);
  // `rounds > 0` means a fight actually opened on the field; `rounds: 0` is a dispatch about a
  // hidden dice roll (`resolveInvaderBattle` files those with rounds deliberately zero).
  const opened = run.ledger.filter((e) => e.rounds > 0).length;
  const earlyLedger = run.ledger.filter((e) => e.wave <= 3);
  const earlyOpened = earlyLedger.filter((e) => e.rounds > 0).length;
  console.log(`  engagements: ${run.ledger.length}; fought on the field: ${opened}; hidden rolls: ${run.ledger.length - opened}`);
  console.log(`  waves 1-3 only: ${earlyLedger.length} engagements, ${earlyOpened} fought on the field`);
  const earlySpawns = run.spawns.filter((sp) => sp.wave <= 3);
  console.log(`  hosts sent in waves 1-3: ${earlySpawns.length}`);
  for (const sp of earlySpawns) {
    console.log(`    t${String(sp.tick).padStart(3)} w${sp.wave} ${sp.kingdom.padEnd(12)} ${sp.intent.padEnd(8)} ${String(sp.men).padStart(5)} men${sp.waveAdvanced ? '  [wave landed]' : ''}${sp.great ? ' [GREAT]' : ''}  ${sp.toasts.slice(-2).join(' | ').slice(0, 90)}`);
  }
  if (run.musterBugs.length) {
    const bad = run.musterBugs.filter((m) => m.inProgress.length > 0 || m.heroBusyWith);
    console.log(`  muster cards: ${run.musterBugs.length}; raised while already recruiting or with a busy hero: ${bad.length}`);
    for (const m of bad.slice(0, 6)) {
      console.log(`    t${m.tick} w${m.wave} hero=${m.heroId} busyWith=${m.heroBusyWith ?? '-'} inProgress=${JSON.stringify(m.inProgress)} standing=${m.standingHosts}`);
    }
  }
  console.log('');
}

console.log('=== SIMULTANEITY: hosts standing on the map at once ===');
console.log(' tick | hosts | crowns | invMen | invPow | ourPow | live battles');
for (let t = 4; t <= TICKS; t += 6) {
  const rs = runs.map((r) => r.rows.find((x) => x.tick === t)).filter(Boolean);
  if (!rs.length) continue;
  const avg = (f) => rs.reduce((n, r) => n + f(r), 0) / rs.length;
  console.log(` ${pad(t, 4)} | ${pad(avg((r) => r.hosts).toFixed(1), 5)} | ${pad(avg((r) => r.crowns).toFixed(1), 6)} | ${pad(Math.round(avg((r) => r.invaderMen)), 6)} | ${pad(Math.round(avg((r) => r.invaderPower)), 6)} | ${pad(Math.round(avg((r) => r.ourPower)), 6)} | ${pad(avg((r) => r.liveBattles).toFixed(1), 12)}`);
}

const allMuster = runs.flatMap((r) => r.musterBugs);
const badMuster = allMuster.filter((m) => m.inProgress.length > 0 || m.heroBusyWith);
console.log(`\nmuster cards raised: ${allMuster.length}; of those, while already recruiting or with a busy hero: ${badMuster.length}`);
const allLedger = runs.flatMap((r) => r.ledger);
console.log(`engagements: ${allLedger.length}; fought on the field: ${allLedger.filter((e) => e.rounds > 0).length}; hidden rolls: ${allLedger.filter((e) => e.rounds === 0).length}`);
const earlyAll = allLedger.filter((e) => e.wave <= 3);
console.log(`  of the first three waves: ${earlyAll.length} engagements, ${earlyAll.filter((e) => e.rounds > 0).length} fought on the field`);
console.log(errors.length ? `console errors: ${errors.slice(0, 3).join(' | ')}` : 'no console errors');
