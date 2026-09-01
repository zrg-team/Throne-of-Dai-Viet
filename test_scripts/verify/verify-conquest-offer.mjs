/**
 * A way into a province that the sheet offers is one the realm can actually take — and a refusal
 * is said once, in the words of the thing that refused.
 *
 * Three systems were answering "can this host be ordered to attack?" differently and the player
 * paid for the disagreement. `setArmyOrders` refuses an auxiliary and a host mid-refit;
 * `buildHostPickerRows` offered both as tappable rows; and `executeConquestMethod` reported the
 * refusal as "every host is busy elsewhere", which is not what happened. Measured on the real tap
 * path, with the run's clock stopped throughout:
 *
 *   · the siege sheet said OPEN with the realm's only host four seasons into a refit;
 *   · the host picker offered that host as a live row;
 *   · the first tap answered with the wrong reason;
 *   · every tap after it answered "that came to nothing" — `executeConquestMethod` decided its
 *     reason by comparing `state.message` against its own previous value, and a host that refuses
 *     twice writes the same message twice;
 *   · and the sheet re-raised itself for as long as the player kept pressing (58 times inside one
 *     tick, from a driver that pressed as fast as it could).
 *
 * The fix is in layers, and this checks each one, because the outer layer is what makes the rest
 * survive a case nobody thought of:
 *
 *   1. `hostOrderRefusal` is the one place that answers the question. The picker greys on it, the
 *      sheet's `bestBattle`/`bestReachableArmy` skip on it, and the execution asks it before
 *      giving the order rather than guessing afterwards.
 *   2. A blocked method reports why in the realm's own terms — "no host is free" when the realm
 *      has hosts and none can go, "we need a host" only when it truly has none.
 *   3. The resolver re-raises the sheet at most once per reason. A host under the player's own
 *      standing order is deliberately *not* in layer 1 — naming it directly is a legitimate way
 *      to redirect it — so a refusal from that direction is still possible, and this is what
 *      stops it becoming a loop.
 *
 * Usage: node test_scripts/verify/verify-conquest-offer.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 160)}`); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });

const out = await page.evaluate(async () => {
  const GS = await import('/src/state/GameState.ts');
  const CQ = await import('/src/systems/ascent/ConquestSystem.ts');
  const RES = await import('/src/systems/ascent/AscentResolver.ts');
  const ROWS = await import('/src/ui/heroPickerRows.ts');
  const I18N = await import('/src/i18n/index.ts');

  let g = 20260901 >>> 0;
  Math.random = () => { g = (g + 0x6d2b79f5) | 0; let t = Math.imul(g ^ (g >>> 15), 1 | g);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /** A board with one player host, mutated to taste, and a neutral province next door. */
  const build = (mutate) => {
    const st = GS.createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.pendingAscentPrompt = undefined;
    st.ascent.promptQueue = [];
    st.resources.gold = 5000;
    const capital = st.lands.find((l) => l.ownerId === 'dai-viet');
    const target = st.lands.find((l) => l.ownerId !== 'dai-viet' && capital.neighbors.includes(l.id))
      ?? st.lands.find((l) => l.ownerId !== 'dai-viet');
    st.armies = st.armies.filter((a) => a.kingdomId !== 'dai-viet');
    const host = {
      id: 'the-host', kingdomId: 'dai-viet', name: 'Host', landId: capital.id,
      units: { spearmen: 900, archers: 300, heavyInfantry: 200 }, morale: 85, supply: 85,
      rations: 400, provisions: 300, level: 1, experience: 0, experienceToNextLevel: 100,
    };
    mutate(host, st);
    st.armies.push(host);
    return { st, target };
  };

  const look = (label, mutate) => {
    const { st, target } = build(mutate);
    const rows = ROWS.buildHostPickerRows(st, { kind: 'siege', landId: target.id });
    const mine = rows.find((r) => r.army.id === 'the-host');
    const siege = CQ.buildMethodOptions(st, target).find((m) => m.method === 'siege');
    const first = CQ.executeConquestMethod(st, target.id, 'siege', { armyId: 'the-host' });
    const second = CQ.executeConquestMethod(st, target.id, 'siege', { armyId: 'the-host' });
    return {
      label,
      landName: target.name,
      sheetBlocked: siege?.blockedReason ?? null,
      rowBlocked: mine?.blockedReason ?? null,
      first: { attempted: first.attempted, ok: first.ok, reason: first.reason ?? null },
      second: { attempted: second.attempted, ok: second.ok, reason: second.reason ?? null },
    };
  };

  /**
   * The loop test, on the one path layer 1 deliberately leaves open: a host carrying the player's
   * own standing order. `marchBestHostToTarget` will not redirect it (`isAutoHost` is false) but
   * naming it directly still can, so the sheet is right to offer the method — and the resolver's
   * once-per-reason rule is the only thing standing between that and an endless card.
   */
  const loop = (() => {
    const { st, target } = build((host) => { host.orders = { kind: 'defend', landId: host.landId }; });
    st.pendingAscentPrompt = {
      kind: 'conquer-method',
      target: CQ.buildConquestTarget(st, target),
    };
    const seen = [];
    for (let i = 0; i < 25; i += 1) {
      const prompt = st.pendingAscentPrompt;
      if (prompt?.kind !== 'conquer-method') break;
      seen.push(prompt.notice ?? '(no notice)');
      // Pressing the same row over and over, which is what a player does when told nothing useful.
      RES.resolveAscentPrompt(st, 'siege');
      RES.drainAscentPrompts?.(st);
    }
    return { sheets: seen.length, notices: seen, ended: st.pendingAscentPrompt?.kind ?? 'none' };
  })();

  return {
    refit: look('mid-refit', (host) => { host.refit = { kind: 'reinforce', ticksLeft: 4, total: 6, gain: 200 }; }),
    auxiliary: look('auxiliary', (host) => { host.patron = 'ally-kingdom'; }),
    free: look('free', () => {}),
    loop,
    words: {
      refitBusy: I18N.t('ascent.army.refitBusy'),
      auxiliary: I18N.t('ascent.pick.blocked.auxiliary'),
      noHostFree: I18N.t('ascent.conquer.noHostFree'),
      needHost: I18N.t('ascent.conquer.needHost'),
      cameToNothing: I18N.t('ascent.conquer.cameToNothing'),
    },
  };
});

const { refit, auxiliary, free, loop, words } = out;

// ── Layer 1: what cannot be commanded is not offered ─────────────────────────────────────────
check('a host mid-refit is not offered as a live row',
  refit.rowBlocked === words.refitBusy,
  `row says "${refit.rowBlocked}"`);
check('an allied auxiliary is not offered as a live row',
  auxiliary.rowBlocked === words.auxiliary,
  `row says "${auxiliary.rowBlocked}"`);
check('and the sheet does not offer the method behind them either',
  refit.sheetBlocked !== null && auxiliary.sheetBlocked !== null,
  `refit: ${refit.sheetBlocked ?? 'OPEN'} · auxiliary: ${auxiliary.sheetBlocked ?? 'OPEN'}`);
check('a host that can go is still offered, and the order takes',
  free.sheetBlocked === null && free.rowBlocked === null && free.first.ok,
  `sheet ${free.sheetBlocked ?? 'OPEN'}, row ${free.rowBlocked ?? 'tappable'}, order ok=${free.first.ok}`);

// ── Layer 2: the reason is the realm's own, and it does not decay ─────────────────────────────
check('"no host is free" rather than "we have no host", with a host standing there',
  refit.sheetBlocked === words.noHostFree && refit.sheetBlocked !== words.needHost,
  `sheet says "${refit.sheetBlocked}"`);
check('the second refusal says as much as the first',
  refit.second.reason === refit.first.reason && refit.second.reason !== words.cameToNothing
    && auxiliary.second.reason === auxiliary.first.reason,
  `refit: "${refit.first.reason}" then "${refit.second.reason}"`);

// ── Layer 3: a refusal is a card once, not a card for ever ────────────────────────────────────
check('pressing a refusing method does not raise the same sheet again',
  loop.sheets <= 2,
  `${loop.sheets} sheet(s) over 25 presses, ending on ${loop.ended}; notices: ${loop.notices.join(' | ')}`);

check('no browser errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

await browser.close();
const passed = checks.filter((c) => c.pass).length;
console.log(`\n${passed}/${checks.length} conquest-offer checks passed`);
if (passed !== checks.length) process.exitCode = 1;
