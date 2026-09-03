/**
 * The Legacy vault and the manual reign.
 *
 * The vault: twenty perks on a ten-step ladder, a loadout of three, and only the loadout applied
 * to a fresh reign — with the old stores migrated (one-time buy -> Lv3 of 10; three-step Lv1/2/3 ->
 * 3/7/10) so nobody's purchases vanish.
 * Hands-on rule (tự tay cai trị): a fully manual run raises none of the cards a lane can do for you, keeps the events
 * that have consequences, and the autopilot does nothing but hold the ground.
 *
 * Usage: node test_scripts/verify/verify-legacy.mjs   (a dev server must already be running)
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

console.log('=== THE VAULT ===');
const vault = await page.evaluate(async () => {
  const L = await import('/src/state/legacy.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const cab = await import('/src/state/cabinet.ts');
  const out = {};
  out.count = L.LEGACY_PERKS.length;
  out.everyLadder = L.LEGACY_PERKS.every((p) => p.cost.length === 10 && p.cost.every((c, i) => i === 0 || c > p.cost[i - 1]) && p.levels.length === 10);
  // Every level is worth more than the one below it, or at least as much (the whole-number perks step).
  const worth = (lv) => Object.values(lv).reduce((sum, v) => sum + (typeof v === 'number' ? Math.abs(v) : Object.values(v).reduce((s2, m) => s2 + Math.abs(m), 0)), 0);
  out.monotone = L.LEGACY_PERKS.every((p) => p.levels.every((lv, i) => i === 0 || worth(lv) >= worth(p.levels[i - 1])));
  out.smallSteps = L.LEGACY_PERKS.every((p) => worth(p.levels[0]) <= worth(p.levels[9]) / 3 + 1e-9);
  // A three-step store migrates onto the tenths.
  localStorage.setItem('mandate:legacy:v1', JSON.stringify({ points: 0, bestScore: 0, ascensions: 0, perks: ['salt-charter', 'masons-guild', 'settlers'], perkLevels: { 'salt-charter': 1, 'masons-guild': 2, settlers: 3 }, loadout: ['salt-charter'], codes: [] }));
  const migrated = L.getLegacy();
  out.migrated = { ...migrated.perkLevels, ladder: migrated.ladder };
  // The old store: two bought perks, no levels, no loadout.
  localStorage.setItem('mandate:legacy:v1', JSON.stringify({ points: 500, bestScore: 0, ascensions: 0, perks: ['founders-purse', 'settlers'], codes: [] }));
  const old = L.getLegacy();
  out.compat = { levels: old.perkLevels, loadout: old.loadout };
  // The ladder: buying raises the level and spends the step's cost; a fourth carry is refused.
  const before = L.getLegacy().points;
  out.levelBefore = L.perkLevel('founders-purse');
  out.bought = L.purchaseLegacyPerk('founders-purse');
  const mid = L.getLegacy();
  out.levelAfter = L.perkLevel('founders-purse', mid);
  out.spent = before - mid.points;
  out.expectedSpent = L.LEGACY_PERKS.find((p) => p.id === 'founders-purse').cost[out.levelBefore];
  L.purchaseLegacyPerk('salt-charter');
  L.purchaseLegacyPerk('masons-guild');
  out.loadoutAfterBuys = L.getLegacy().loadout.slice();
  out.fourth = L.toggleLoadout('masons-guild');
  out.loadoutNow = L.getLegacy().loadout.slice();
  // Only the loadout applies: a bought perk set down does nothing.
  // Set the settlers down; the masons stay bought and set down.
  L.toggleLoadout('settlers');
  const store = L.getLegacy();
  out.finalLoadout = store.loadout.slice();
  localStorage.removeItem('mandate:cabinet:v1');
  cab.resetCabinetCache?.();
  const withPerks = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  localStorage.setItem('mandate:legacy:v1', JSON.stringify({ points: 0, bestScore: 0, ascensions: 0, perks: [], perkLevels: {}, loadout: [], codes: [] }));
  const bare = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.goldDelta = withPerks.resources.gold - bare.resources.gold;
  out.humansDelta = withPerks.resources.humans - bare.resources.humans;
  out.expectedGold = L.LEGACY_PERKS.find((p) => p.id === 'founders-purse').levels[out.levelAfter - 1].gold;
  out.hasSalt = withPerks.activeCourtModifiers.some((m) => m.id === 'legacy-salt-charter');
  out.hasMasons = withPerks.activeCourtModifiers.some((m) => m.id === 'legacy-masons-guild');
  localStorage.removeItem('mandate:legacy:v1');
  return out;
});
check('twenty perks, each on a ten-step ladder with rising prices', vault.count === 20 && vault.everyLadder, `${vault.count}`);
check('every level is worth at least the one below, and the first step is at most a third of the top', vault.monotone && vault.smallSteps);
check('a three-step store migrates Lv1/2/3 onto 3/7/10 and is stamped', vault.migrated['salt-charter'] === 3 && vault.migrated['masons-guild'] === 7 && vault.migrated.settlers === 10 && vault.migrated.ladder === 10, JSON.stringify(vault.migrated));
check('a one-time-buy store reads its bought perks as Lv3 of 10 and carries them', vault.compat.levels['founders-purse'] === 3 && vault.compat.loadout.length === 2, JSON.stringify(vault.compat));
check('buying a held perk raises it a level at the ladder\'s price', vault.bought && vault.levelAfter === vault.levelBefore + 1 && vault.spent === vault.expectedSpent, `Lv${vault.levelBefore} -> ${vault.levelAfter}, spent ${vault.spent} of ${vault.expectedSpent}`);
check('a fourth perk is refused a slot', vault.fourth === false && vault.loadoutNow.length === 3, vault.loadoutNow.join(','));
check('only the loadout reaches a fresh reign: gold from the carried purse, none from the set-down settlers', vault.goldDelta === vault.expectedGold && vault.humansDelta === 0, `gold +${vault.goldDelta} (want ${vault.expectedGold}), people +${vault.humansDelta}`);
check('a carried modifier perk stands as a court modifier, a set-down one does not', vault.hasSalt === true && vault.hasMasons === false, `salt ${vault.hasSalt}, masons ${vault.hasMasons}`);

console.log('\n=== HANDS-ON RULE ===');
const manual = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { enqueueAscentPrompt } = await import('/src/systems/ascent/AscentState.ts');
  const { tickAscentAutopilot } = await import('/src/systems/ascent/AutopilotSystem.ts');
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  st.ascent.hardcore = true;
  const land = st.lands.find((l) => l.ownerId === 'dai-viet');
  enqueueAscentPrompt(st, { kind: 'province-order', landId: land.id, options: [] });
  enqueueAscentPrompt(st, { kind: 'court-appointment', options: [] });
  enqueueAscentPrompt(st, { kind: 'conquer-target', targets: [] });
  const silenced = st.ascent.promptQueue.length;
  enqueueAscentPrompt(st, { kind: 'famine', options: [] });
  const kept = st.ascent.promptQueue.length;
  const stats = { ...st.ascent.autopilotStats };
  st.resources.gold = 99999;
  for (let i = 0; i < 40; i += 1) tickAscentAutopilot(st);
  const after = { ...st.ascent.autopilotStats };
  st.ascent.hardcore = false;
  for (let i = 0; i < 40; i += 1) tickAscentAutopilot(st);
  const off = { ...st.ascent.autopilotStats };
  return { silenced, kept, unchanged: JSON.stringify(stats) === JSON.stringify(after), moved: JSON.stringify(after) !== JSON.stringify(off) };
});
check('hands-on rule silences the cards a lane can do for you', manual.silenced === 0, `${manual.silenced} queued`);
check('and keeps the events with consequences', manual.kept === 1, `${manual.kept} queued`);
check('the autopilot does nothing while hands-on rule stands, and moves again when it is lifted', manual.unchanged && manual.moved);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the vault is a ladder with three slots, and a manual reign is manual' : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
