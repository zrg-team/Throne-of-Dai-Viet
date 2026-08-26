// "Ta mở rộng hướng nào" — the expansion card — must not come up over a sheet on which nothing
// can be pressed.
//
// Reported verbatim: *if there are in-progress claims and no available claim slot, no need to
// show it, it is meaningless.* `isReady('conquer-target')` already refused when nothing was
// takeable, but its "is a host free to act on the answer?" test accepted **any** army with no
// march or siege order against its name — which is every garrison levy standing on a wall and
// every column already in a battle line. So with all the claim slots committed and every real
// host in the field, the card still came up with every method greyed.
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { isAscentPromptReady } = await import('/src/systems/ascent/DecisionDirector.ts');
  const { buildConquestTargets } = await import('/src/systems/ascent/ConquestSystem.ts');
  const { claimBlockedReason } = await import('/src/systems/AcquisitionSystem.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  let s = 5150 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const build = () => {
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.pendingAscentPrompt = undefined;
    st.ascent.marchCooldown = 0;
    st.ascent.promptCooldowns = {};
    return st;
  };

  // Fill every claim slot, so only siege and occupation are left on any target's sheet.
  const commitEveryClaim = (st) => {
    let guard = 0;
    while (!claimBlockedReason(st) && guard++ < 12) {
      const target = st.lands.find((land) => land.ownerId !== PLAYER
        && !(st.acquisitionOrders ?? []).some((order) => order.landId === land.id));
      if (!target) break;
      (st.acquisitionOrders ??= []).push({
        landId: target.id,
        buyerId: PLAYER,
        method: 'diplomacy',
        progress: 0,
        required: 8,
        costGold: 0,
      });
    }
    return Boolean(claimBlockedReason(st));
  };

  // ── the reported case: slots all committed, and the only "free host" is a wall levy ──
  const walled = build();
  const slotsFull = commitEveryClaim(walled);
  // Every real host is marching. What is left standing is the garrison levy of a province.
  for (const army of walled.armies.filter((a) => a.kingdomId === PLAYER)) army.isLevy = true;
  const withLevyOnly = isAscentPromptReady(walled, 'conquer-target');

  // ── the same realm, with one host that can actually march ──
  const free = build();
  commitEveryClaim(free);
  const host = free.armies.find((a) => a.kingdomId === PLAYER);
  if (host) {
    host.isLevy = false;
    host.units = { spearmen: 400, archers: 100, heavyInfantry: 50 };
  }
  const withRealHost = isAscentPromptReady(free, 'conquer-target');

  // ── and one whose only host is standing in a battle line ──
  const fighting = build();
  commitEveryClaim(fighting);
  const line = fighting.armies.find((a) => a.kingdomId === PLAYER);
  if (line) {
    line.isLevy = false;
    line.units = { spearmen: 400, archers: 100, heavyInfantry: 50 };
  }
  fighting.ascent.activeBattle = {
    landId: fighting.ascent.capitalLandId,
    landName: 'x',
    kingdomId: fighting.kingdoms[1].id,
    kingdomName: 'x',
    invaderArmyId: 'inv',
    isGreat: false,
    round: 3,
    totalRounds: 20,
    stance: 'balanced',
    theirStance: 'balanced',
    ourFormation: 'chong',
    theirFormation: 'chong',
    brokenHostIds: [],
    ourLostTotal: 0,
    ourStartMorale: 80,
    ourAdvance: 0,
    theirAdvance: 0,
    ourMorale: 80,
    theirMorale: 80,
    ourHostCount: 1,
    theirHostCount: 1,
    reserve: { spearmen: 0, archers: 0, heavyInfantry: 0 },
    reserveSpent: true,
    rallySpent: true,
    rallyPower: 0,
    terrainEdge: 1,
    outcome: 'fighting',
    ourNow: 500,
    theirNow: 500,
    ourStart: 500,
    theirStart: 500,
    log: [],
    over: false,
    role: 'defence',
    approachBeats: 0,
    ourArmyIds: line ? [line.id] : [],
    theirArmyIds: ['inv'],
    key: 'k',
  };
  const withHostInLine = isAscentPromptReady(fighting, 'conquer-target');

  return {
    slotsFull,
    withLevyOnly,
    withRealHost,
    withHostInLine,
    targets: buildConquestTargets(walled).length,
  };
});

check('the fixture really does run out of claim slots', out.slotsFull === true);
check('with every slot committed and only a wall levy standing, it does not ask',
  out.withLevyOnly === false);
check('nor when the one host it has is standing in a battle line',
  out.withHostInLine === false);
check('but it still asks when a host is genuinely free to march',
  out.withRealHost === true);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the expansion card only comes up when there is something to press on it'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
