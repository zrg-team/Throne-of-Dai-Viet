// Does the realm's water actually work? Drives the real game and asks the questions the whole
// water system turns on. Adding a check here is cheaper than finding out from a screenshot.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://localhost:5173';
const SEEDS = [1337, 42, 7, 2024, 99];
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

const boot = async (seed, mode) => {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
      await page.evaluate(({ seed, mode }) => window.__startBenchGame(seed, mode), { seed, mode });
      await page.waitForTimeout(2200);
      if (await page.evaluate(() => !!window.__mandateState?.mapConfig)) return;
    } catch { /* the tree is edited while this runs; try again */ }
    await page.waitForTimeout(1500);
  }
  throw new Error(`game never booted for seed ${seed}`);
};

const survey = () => page.evaluate(() => {
  const s = window.__mandateState;
  const key = (c) => `${c.q},${c.r}`;
  const byKey = new Map(s.hexTiles.map((t) => [key(t.coord), t]));
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const kinds = { sea: 0, river: 0, stream: 0, lake: 0 };
  for (const t of s.hexTiles) if (t.terrain === 'water') kinds[t.waterKind ?? 'river'] += 1;

  // Bodies, and whether each reaches the sea.
  const seen = new Set();
  let bodies = 0, noOutlet = 0, lakeClusters = 0;
  for (const t of s.hexTiles) {
    if (t.terrain !== 'water' || seen.has(key(t.coord))) continue;
    bodies += 1;
    const stack = [t.coord]; seen.add(key(t.coord));
    let touchesSea = false;
    while (stack.length) {
      const c = stack.pop();
      if (byKey.get(key(c))?.waterKind === 'sea') touchesSea = true;
      for (const [dq, dr] of N) {
        const nk = `${c.q + dq},${c.r + dr}`;
        const n = byKey.get(nk);
        if (n?.terrain === 'water' && !seen.has(nk)) { seen.add(nk); stack.push(n.coord); }
      }
    }
    if (!touchesSea) noOutlet += 1;
  }
  const lakeSeen = new Set();
  for (const t of s.hexTiles) {
    if (t.waterKind !== 'lake' || lakeSeen.has(key(t.coord))) continue;
    lakeClusters += 1;
    const stack = [t.coord]; lakeSeen.add(key(t.coord));
    while (stack.length) {
      const c = stack.pop();
      for (const [dq, dr] of N) {
        const nk = `${c.q + dq},${c.r + dr}`;
        const n = byKey.get(nk);
        if (n?.waterKind === 'lake' && !lakeSeen.has(nk)) { lakeSeen.add(nk); stack.push(n.coord); }
      }
    }
  }

  // Permeable growth must leave the realm in one piece.
  const byId = new Map(s.lands.map((l) => [l.id, l]));
  const visited = new Set();
  let components = 0;
  for (const l of s.lands) {
    if (visited.has(l.id)) continue;
    components += 1;
    const stack = [l.id]; visited.add(l.id);
    while (stack.length) {
      const id = stack.pop();
      for (const n of byId.get(id)?.neighbors ?? []) if (!visited.has(n)) { visited.add(n); stack.push(n); }
    }
  }

  return {
    tiles: s.hexTiles.length,
    kinds,
    water: Object.values(kinds).reduce((a, b) => a + b, 0),
    bodies, noOutlet, lakeClusters, components,
    provinces: s.lands.length,
    withWater: s.lands.filter((l) => l.terrainSummary.water > 0).length,
    coastal: s.lands.filter((l) => l.coastHexes > 0).length,
    navigable: s.lands.filter((l) => l.navigable).length,
    unclaimedInland: s.hexTiles.filter((t) => t.terrain === 'water' && t.waterKind !== 'sea' && !t.landId).length,
    waterTerrainMismatch: s.hexTiles.filter((t) => (t.terrain === 'water') !== (t.waterKind !== undefined)).length,
  };
});

for (const seed of SEEDS) {
  await boot(seed, 'campaign');
  const r = await survey();
  const tag = `seed ${seed}`;
  console.log(`\n── ${tag} — ${r.water} water (${(100 * r.water / r.tiles).toFixed(1)}%), ` +
    `sea ${r.kinds.sea} river ${r.kinds.river} stream ${r.kinds.stream} lake ${r.kinds.lake}`);
  check(`${tag}: every body drains to the sea`, r.noOutlet === 0, `${r.noOutlet} landlocked`);
  check(`${tag}: the map has lakes`, r.lakeClusters >= 1, `${r.lakeClusters} lakes`);
  check(`${tag}: the map has streams`, r.kinds.stream >= 1, `${r.kinds.stream} stream hexes`);
  check(`${tag}: provinces own their water`, r.withWater > 0, `${r.withWater}/${r.provinces}`);
  check(`${tag}: some water is navigable`, r.navigable > 0, `${r.navigable} provinces`);
  check(`${tag}: inland water is all claimed`, r.unclaimedInland === 0, `${r.unclaimedInland} orphan hexes`);
  check(`${tag}: waterKind is set on exactly the wet tiles`, r.waterTerrainMismatch === 0, `${r.waterTerrainMismatch} mismatched`);
  check(`${tag}: permeable growth leaves the realm in one piece`, r.components === 1, `${r.components} components`);
}

console.log(errors.length ? `\n${errors.slice(0, 6).join('\n')}` : '\nno console errors');
if (errors.length) failures += 1;
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
