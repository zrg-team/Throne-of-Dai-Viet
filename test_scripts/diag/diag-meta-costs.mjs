/**
 * What the two meta sinks actually cost, in runs.
 *
 * Prints rather than asserts: the question is not "is the table well formed" (verify-legacy holds
 * that) but "how many reigns does a player spend before the vault and the deck stop having
 * anything to sell them". A run scoring 9,000 banks 900 points — `bankLegacy` pays score ÷ 10 —
 * so every total here is also quoted in 9k-runs.
 *
 * Usage: node test_scripts/diag/diag-meta-costs.mjs   (a dev server must already be running)
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
/** The run the report is priced against — the score the player reported reaching in one game. */
const RUN_SCORE = 9000;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });

const out = await page.evaluate(async () => {
  const { LEGACY_PERKS, LOADOUT_MAX, PERK_MAX_LEVEL } = await import('/src/state/legacy.ts');
  const { rubbingPackPrice } = await import('/src/state/cabinet.ts');

  const perks = LEGACY_PERKS.map((perk) => ({
    id: perk.id,
    cost: perk.cost.slice(),
    first: perk.cost[0],
    last: perk.cost[PERK_MAX_LEVEL - 1],
    ladder: perk.cost.reduce((sum, n) => sum + n, 0),
  }));

  // The pack price walked forward by hand: the store is not written, only read at each count.
  const store = JSON.parse(localStorage.getItem('mandate:cabinet:v1') ?? '{}');
  const packs = [];
  for (let bought = 0; bought < 12; bought += 1) {
    localStorage.setItem('mandate:cabinet:v1', JSON.stringify({ ...store, packsBought: bought }));
    packs.push(rubbingPackPrice());
  }
  localStorage.removeItem('mandate:cabinet:v1');

  return { perks, packs, loadoutMax: LOADOUT_MAX, maxLevel: PERK_MAX_LEVEL };
});

const runs = (points) => (points / (RUN_SCORE / 10)).toFixed(1);
const firstRung = out.perks.reduce((sum, p) => sum + p.first, 0);
const vault = out.perks.reduce((sum, p) => sum + p.ladder, 0);
// A player only ever fields `LOADOUT_MAX` perks, so the real target is maxing that many — priced
// on the dearest, which is what a player chasing power actually picks.
const dearest = out.perks.slice().sort((a, b) => b.ladder - a.ladder).slice(0, out.loadoutMax);
const loadout = dearest.reduce((sum, p) => sum + p.ladder, 0);

console.log(`=== LEGACY VAULT (${out.perks.length} perks x ${out.maxLevel} levels) ===`);
console.log(`a ${RUN_SCORE.toLocaleString('en-US')} run banks ${RUN_SCORE / 10} points\n`);
console.log('perk                  Lv1   Lv10   x    ladder');
for (const perk of out.perks.slice().sort((a, b) => b.ladder - a.ladder)) {
  console.log(`${perk.id.padEnd(20)} ${String(perk.first).padStart(4)} ${String(perk.last).padStart(6)} ${(perk.last / perk.first).toFixed(1).padStart(5)} ${String(perk.ladder).padStart(8)}`);
}
console.log('\n=== WHAT IT TAKES ===');
console.log(`first level of every perk   ${String(firstRung).padStart(7)} pts   ${runs(firstRung)} runs`);
console.log(`max the ${out.loadoutMax} dearest        ${String(loadout).padStart(7)} pts   ${runs(loadout)} runs   (${dearest.map((p) => p.id).join(', ')})`);
console.log(`max the whole vault         ${String(vault).padStart(7)} pts   ${runs(vault)} runs`);

console.log('\n=== RUBBING PACKS (Legacy -> one draw) ===');
console.log(`price by packs bought: ${out.packs.join(', ')}`);
let running = 0;
const cumulative = out.packs.map((price) => (running += price));
console.log(`cumulative:            ${cumulative.join(', ')}`);
console.log(`ten packs cost ${cumulative[9]} pts — ${runs(cumulative[9])} runs`);

await browser.close();
