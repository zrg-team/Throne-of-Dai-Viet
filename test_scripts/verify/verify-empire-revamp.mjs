// Verifies the Throne of Empires revamp: continuous invasions past turn 60,
// directives completing + refilling, Mandate growth/era transitions, spoils, and
// telegraphed ultimatums. Run against a dev server on 5173.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179'}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(300);

// Drive many economy ticks directly on the state and record what the systems do.
const result = await page.evaluate(async () => {
  const st = window.__mandateState;
  const mod = await import('/src/systems/RealtimeSystem.ts');
  const advance = mod.advanceRealtimeMonth;
  const { resolvePendingBattle } = await import('/src/systems/empire/InvasionSystem.ts');

  // Deterministic RNG for the tick loop so the check is reproducible.
  let s = 20260703 >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // Give the realm a standing garrison + hardy capital so it survives long enough
  // to exercise era progression and a Great Invasion (a real player would defend).
  const cap = st.lands.find((l) => l.ownerId === 'dai-viet' && l.type === 'castle');
  if (cap) { cap.defense = 400; cap.localSoldiers = 400; }
  st.armies.push({ id: 'player-garrison', kingdomId: 'dai-viet', name: 'Garrison', landId: cap.id,
    units: { spearmen: 2000, archers: 900, heavyInfantry: 400 }, morale: 90, supply: 90,
    rations: 9999, provisions: 9999, level: 4, experience: 0, experienceToNextLevel: 999 });
  // Keep the treasury/larder topped so we isolate the threat/progression systems.
  const feed = () => { st.resources.food = Math.max(st.resources.food, 400); st.resources.supplies = Math.max(st.resources.supplies, 400); st.resources.gold = Math.max(st.resources.gold, 400); };

  const snap = () => ({
    turn: st.turn,
    era: st.mandate?.era,
    mandate: Math.round(st.mandate?.points ?? 0),
    edictPts: st.mandate?.edictPoints,
    directives: (st.directives ?? []).length,
    invasionsOnMap: (st.invasions ?? []).length,
    repelled: st.invasionsRepelled ?? 0,
    pendingUltimatum: st.pendingUltimatum ? (st.pendingUltimatum.isGreatInvasion ? 'GREAT' : 'minor') : null,
    seats: st.court.unlockedSeats.length,
  });

  const initial = snap();
  const eras = new Set([st.mandate?.era]);
  let anyUltimatum = false;
  let anyGreat = false;
  let anyInvasionAfter60 = false;
  const completedDirectiveTemplates = new Set();

  let prevDirectiveIds = new Set((st.directives ?? []).map((d) => d.id));

  for (let i = 0; i < 240; i += 1) {
    feed();
    // **Fight the battles.** This loop used to leave `pendingBattle` standing, and a deferred
    // contact is never resolved — so across 240 seasons the realm fought nothing, repelled
    // nothing, earned no Mandate, never left the founding era, and ended with seventeen invading
    // hosts parked on the map. Every unmet expectation this harness reported was that, not the
    // systems it claims to be checking. A realm that answers its own battles is the minimum a
    // "the revamp is active" gate has to simulate.
    let guard = 0;
    while (st.pendingBattle && guard++ < 8) resolvePendingBattle(st, 'attack');
    advance(st);
    while (st.pendingBattle && guard++ < 16) resolvePendingBattle(st, 'attack');
    if (st.pendingUltimatum) {
      anyUltimatum = true;
      if (st.pendingUltimatum.isGreatInvasion) anyGreat = true;
    }
    if (st.turn > 60 && (st.invasions ?? []).length > 0) anyInvasionAfter60 = true;
    eras.add(st.mandate?.era);
    // Detect directive turnover (a completed one replaced by a new id).
    const nowIds = new Set((st.directives ?? []).map((d) => d.id));
    for (const id of prevDirectiveIds) if (!nowIds.has(id)) completedDirectiveTemplates.add(id);
    prevDirectiveIds = nowIds;
    if (st.isDefeated || st.victory) break;
  }

  return {
    initial,
    final: snap(),
    erasSeen: [...eras],
    anyUltimatum,
    anyGreat,
    anyInvasionAfter60,
    directiveTurnovers: completedDirectiveTemplates.size,
    defeated: st.isDefeated,
    defeatReason: st.defeatReason,
    victory: st.victory,
    toasts: (st.toasts ?? []).slice(-4).map((t) => t.text),
  };
});

await page.screenshot({ path: 'output/web-game/empire-revamp-verify.png' }).catch(() => {});

console.log(JSON.stringify(result, null, 2));
console.log('=== ERRORS ===');
errors.forEach((e) => console.log(e));

const pass =
  result.anyInvasionAfter60 &&
  result.anyUltimatum &&
  result.directiveTurnovers > 0 &&
  result.final.mandate > result.initial.mandate &&
  result.erasSeen.length > 1 &&
  errors.length === 0;
console.log(pass ? 'PASS: revamp systems active' : 'CHECK: some expectations unmet');

await browser.close();
