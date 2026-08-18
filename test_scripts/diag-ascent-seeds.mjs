// Multi-seed survival sweep for Dragon Ascent under the naive harness policy (the same
// first-legal-choice player `verify-ascent.mjs` uses). Prints one JSON row per seed — survival
// tick, provinces held/gained/lost, ticks with a live battle, battle outcomes from
// `ascent.battleHistory`, gold and payroll — and a summary line, so a balance change can be judged
// across a dozen worlds instead of the one seed a harness happens to pin.
//
// Usage: node test_scripts/diag-ascent-seeds.mjs [seed,seed,...] [ticks]
//        AUTO=1 node test_scripts/diag-ascent-seeds.mjs …   → battles handed to the generals (roll path)
import { chromium } from 'playwright';
const SEEDS = (process.argv[2] ?? '20260808,1337,7,424242,31337,5150').split(',').map(Number);
const TICKS = Number(process.argv[3] ?? 200);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto((process.env.DEV_URL ?? 'http://127.0.0.1:5173') + '/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
const rows = [];
for (const seed of SEEDS) {
  const r = await page.evaluate(async ({ seed, ticks, autoResolve }) => {
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    let s = seed >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    if (autoResolve) st.ascent.autoResolveBattles = true;
    let methodCursor = 0;
    const firstChoice = (p) => {
      switch (p.kind) {
        case 'founder': return p.options[0];
        case 'power-draft': return p.cards[0] ?? 'skip';
        case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
        case 'conquer-method': { const open = p.target.methods.filter((m) => !m.blockedReason); return open.length > 0 ? open[methodCursor++ % open.length].method : 'back'; }
        case 'hero-choice': return p.heroIds[0] ?? 'pass';
        case 'court-appointment': return p.options[0].id;
        case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
        case 'parliament': { const card = st.politicsDeck.find((c) => c.id === p.cardId); if (!card) return 'decline'; const a = card.choices.find((c) => Object.entries(c.effects.resourceDelta ?? {}).every(([k, v]) => (v ?? 0) >= 0 || st.resources[k] >= Math.abs(v))); return a ? a.id : 'decline'; }
        case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        case 'battle': return 'hold';
        case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
        case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        case 'story-beat': return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
        case 'empire-response': { const merc = p.options.find((o) => o.id === 'hire-mercenaries' && o.affordable); if (merc && st.resources.gold > 2500) return merc.id; return (p.options.find((o) => o.affordable) ?? p.options[0]).id; }
        default: return 'ok';
      }
    };
    const owned = () => st.lands.filter((l) => l.ownerId === 'dai-viet').length;
    let prev = new Set(st.lands.filter((l) => l.ownerId === 'dai-viet').map((l) => l.id));
    let gained = 0, lost = 0, battleTicks = 0, keys = new Set(), died = -1, negGold = 0, unpaidTicks = 0;
    let zeroStreak = 0, longestZero = 0, allUnpaidStreak = 0, longestAllUnpaid = 0, nonNegAfter30 = 0, ticksAfter30 = 0;
    const landsAt = {};
    for (let i = 0; i < ticks; i += 1) {
      advanceAscentTick(st);
      if (st.ascent.activeBattle) { battleTicks += 1; keys.add(st.ascent.activeBattle.key ?? st.ascent.activeBattle.landId); }
      const now = new Set(st.lands.filter((l) => l.ownerId === 'dai-viet').map((l) => l.id));
      for (const id of now) if (!prev.has(id)) gained += 1;
      for (const id of prev) if (!now.has(id)) lost += 1;
      prev = now;
      if (st.resourceRates.gold < 0) negGold += 1;
      if ((st.unpaidLandIds ?? []).length > 0) unpaidTicks += 1;
      if (i >= 30) { ticksAfter30 += 1; if (st.resourceRates.gold >= 0) nonNegAfter30 += 1; }
      zeroStreak = st.resources.gold <= 0 ? zeroStreak + 1 : 0; longestZero = Math.max(longestZero, zeroStreak);
      const allUnpaid = owned() > 0 && (st.unpaidLandIds ?? []).length >= owned();
      allUnpaidStreak = allUnpaid ? allUnpaidStreak + 1 : 0; longestAllUnpaid = Math.max(longestAllUnpaid, allUnpaidStreak);
      if (i % 50 === 49) landsAt[i + 1] = owned();
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 10) { const p = st.pendingAscentPrompt; if (p.kind === 'run-over') break; if (!resolveAscentPrompt(st, firstChoice(p))) break; }
      if (st.isDefeated) { died = i; break; }
    }
    const hist = st.ascent.battleHistory ?? [];
    const outcomes = {};
    for (const b of hist) { const k = `${b.outcome}${b.levyFought ? '(levy)' : ''}`; outcomes[k] = (outcomes[k] ?? 0) + 1; }
    const battlesDetail = hist.map((b) => `${b.turn}:${b.landName.slice(0, 6)} ${b.ourStart}v${b.theirStart}(${b.theirHosts}h) r${b.rounds} ${b.outcome}${b.levyFought ? 'L' : ''}`);
    const gross = Math.max(1, st.ascentLedger?.gold.gross ?? 1);
    return { seed, died, lands: owned(), gained, lost, battleTicks, battles: keys.size, negGold, unpaidTicks, longestZero, longestAllUnpaid, nonNegShare: ticksAfter30 ? Math.round((nonNegAfter30 / ticksAfter30) * 100) : null, payrollShare: Math.round(((st.ascentLedger?.goldParts?.payroll ?? 0) / gross) * 100), outcomes, battlesDetail, gold: Math.round(st.resources.gold), rate: Math.round(st.resourceRates.gold), heroes: st.heroes.length, troops: st.armies.filter((a) => a.kingdomId === 'dai-viet' && !a.isLevy).reduce((n, a) => n + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0), landsAt, wave: st.ascent.wave };
  }, { seed, ticks: TICKS, autoResolve: process.env.AUTO === '1' });
  rows.push(r);
  console.log(JSON.stringify(r));
}
const alive = rows.filter((r) => r.died < 0).length;
const mean = (f) => (rows.reduce((n, r) => n + (f(r) ?? 0), 0) / rows.length).toFixed(1);
console.log(`SUMMARY alive=${alive}/${rows.length} meanLands=${mean((r) => r.lands)} meanLost=${mean((r) => r.lost)} meanBattleTicks=${mean((r) => r.battleTicks)} meanNegGold=${mean((r) => r.negGold)} meanNonNegShare=${mean((r) => r.nonNegShare)}% maxZeroStreak=${Math.max(...rows.map((r) => r.longestZero))} maxAllUnpaid=${Math.max(...rows.map((r) => r.longestAllUnpaid))} meanPayrollShare=${mean((r) => r.payrollShare)}%`);
await browser.close();
