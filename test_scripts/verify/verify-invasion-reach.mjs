/**
 * A wave that is sent has to be able to walk to you.
 *
 * `generateMap` does not guarantee one connected district graph — an island, or a range no road
 * crosses — and the invasion spawner picked its staging ground by *distance from the capital,
 * descending*, which on a split map can be the piece the player cannot be reached from. Measured
 * on seed 99 under a run that expanded to seventeen provinces: five hosts frozen on `district-18`
 * for 380 seasons, `MAX_LIVE_INVADER_HOSTS` full, the wave director silent from then on, and a
 * 31-wave run in which the battle screen opened exactly **zero** times. From the throne that reads
 * as "I played six rounds and there was no fight at all".
 *
 * What this asserts, per run: no invader is ever standing somewhere it cannot walk to the realm
 * from; no invader holds one province for a quarter of the run; the world actually reaches the
 * realm; and a fight actually opens.
 *
 * **It does not reproduce the original stranding.** Whether a spawn lands across a divide depends
 * on how far the run has expanded by the time the wave is sent, so the seeds swept here pass on
 * the pre-fix code too. Treat it as a floor under the invariant — a change that strands or freezes
 * waves broadly trips it — not as the regression test for that one seed.
 *
 *   node test_scripts/verify/verify-invasion-reach.mjs
 *   DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-invasion-reach.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const SEEDS = [99, 1337, 777, 4242, 20260826, 5, 106, 113];
const TICKS = 260;
/** A host that has not moved for this many seasons is not marching, it is stuck. */
const STUCK_TICKS = 60;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 160)}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 },
);

const runs = [];
for (const seed of SEEDS) {
  runs.push(await page.evaluate(async ({ seed, ticks, stuckTicks }) => {
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');

    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    let methodCursor = 0;
    let doctrineCursor = 0;
    const answer = (p) => {
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
        case 'doctrine': return p.options[doctrineCursor++ % p.options.length];
        case 'parliament': {
          const card = st.politicsDeck.find((c) => c.id === p.cardId);
          if (!card) return 'decline';
          const ok = card.choices.find((c) => Object.entries(c.effects.resourceDelta ?? {})
            .every(([k, v]) => (v ?? 0) >= 0 || st.resources[k] >= Math.abs(v)));
          return ok ? ok.id : 'decline';
        }
        case 'muster-proposal': return 'accept';
        case 'battle': return 'hold';
        case 'envoy': case 'rival-demand': case 'empire-response':
          return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
        case 'story-beat':
          return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
        default: return 'ok';
      }
    };

    const reach = (index, fromId) => {
      const seen = new Set([fromId]);
      const queue = [fromId];
      while (queue.length > 0) {
        const land = index.get(queue.shift());
        for (const n of land?.neighbors ?? []) {
          if (seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      return seen;
    };

    let strandedSpawns = 0;
    let spawns = 0;
    let contactTicks = 0;
    let longestStill = 0;
    const seenHost = new Set();
    const stillFor = new Map();
    const battles = new Set();

    for (let tick = 0; tick < ticks; tick += 1) {
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 40) {
        const p = st.pendingAscentPrompt;
        if (p.kind === 'run-over') break;
        if (!resolveAscentPrompt(st, answer(p))) break;
      }
      if (st.isDefeated) break;
      advanceAscentTick(st);

      const index = new Map(st.lands.map((l) => [l.id, l]));
      const mine = st.lands.filter((l) => l.ownerId === 'dai-viet');
      for (const record of st.invasions ?? []) {
        const army = st.armies.find((a) => a.id === record.armyId);
        if (!army) continue;
        // Staged where the realm can be walked to?
        if (!seenHost.has(army.id)) {
          seenHost.add(army.id);
          spawns += 1;
          const canReach = reach(index, army.landId);
          if (!mine.some((l) => canReach.has(l.id))) strandedSpawns += 1;
        }
        // Marching, or standing?
        const was = stillFor.get(army.id);
        if (was && was.land === army.landId) was.ticks += 1;
        else stillFor.set(army.id, { land: army.landId, ticks: 0 });
        longestStill = Math.max(longestStill, stillFor.get(army.id).ticks);
      }
      const reached = st.armies.some((a) => a.kingdomId !== 'dai-viet' && !a.isLevy
        && mine.some((l) => a.landId === l.id || l.neighbors.includes(a.landId)));
      if (reached) contactTicks += 1;
      const live = st.ascent?.activeBattle;
      if (live?.key) battles.add(live.key);
    }

    return {
      seed,
      turns: st.turn,
      wave: st.ascent?.wave ?? 0,
      spawns,
      strandedSpawns,
      contactTicks,
      longestStill,
      battles: battles.size,
      stuck: longestStill >= stuckTicks,
    };
  }, { seed, ticks: TICKS, stuckTicks: STUCK_TICKS }));
}

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

for (const r of runs) {
  console.log(`  seed ${String(r.seed).padStart(8)}  turns ${String(r.turns).padStart(3)}  wave ${String(r.wave).padStart(2)}`
    + `  hosts ${String(r.spawns).padStart(3)}  stranded ${r.strandedSpawns}`
    + `  longest-still ${String(r.longestStill).padStart(3)}  contact ${String(r.contactTicks).padStart(3)}  battles ${r.battles}`);
}

check('the sweep actually saw waves', runs.every((r) => r.spawns > 0),
  runs.filter((r) => r.spawns === 0).map((r) => `seed ${r.seed}`).join(', '));
check('no invader stands where the realm cannot be walked to',
  runs.every((r) => r.strandedSpawns === 0),
  runs.filter((r) => r.strandedSpawns > 0).map((r) => `seed ${r.seed}: ${r.strandedSpawns}/${r.spawns}`).join(', '));
check(`no invader holds one province for ${STUCK_TICKS} seasons`,
  runs.every((r) => !r.stuck),
  runs.filter((r) => r.stuck).map((r) => `seed ${r.seed}: ${r.longestStill}`).join(', '));
check('every run is actually reached by the world',
  runs.every((r) => r.contactTicks > 0),
  runs.filter((r) => r.contactTicks === 0).map((r) => `seed ${r.seed}`).join(', '));
check('every run gets a fight on screen',
  runs.every((r) => r.battles > 0),
  runs.filter((r) => r.battles === 0).map((r) => `seed ${r.seed}`).join(', '));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: every wave that is sent can walk to the realm, and does'
  : 'FAIL: a wave was sent somewhere it can never arrive from');
process.exit(failed.length === 0 ? 0 : 1);
