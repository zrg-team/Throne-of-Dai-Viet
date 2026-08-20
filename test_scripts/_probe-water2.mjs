import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

const run = async (seaSides, seed) => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate(({ seaSides, seed }) => {
    let s = seed; const rng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const orig = Math.random; Math.random = rng;
    window.__probe = { seaSides, seed };
    Math.random = orig;
  }, { seaSides, seed });
  await page.evaluate(({ seed }) => window.__startBenchGame(seed, 'campaign'), { seed });
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
  return page.evaluate(async () => {
    const s = window.__mandateState;
    // land graph connectivity
    const byId = new Map(s.lands.map(l => [l.id, l]));
    const seen = new Set(); const comps = [];
    for (const l of s.lands) {
      if (seen.has(l.id)) continue;
      const stack = [l.id]; seen.add(l.id); const c = [];
      while (stack.length) { const id = stack.pop(); c.push(id);
        for (const n of byId.get(id)?.neighbors ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); } }
      comps.push(c.length);
    }
    comps.sort((a,b)=>b-a);
    const RS = await import('/src/systems/ResourceSystem.ts');
    const harbourOk = s.lands.filter(l => !RS.getBuildBlockReason?.(s, l, 'harbor')).length;
    const waterTotal = s.lands.reduce((a,l)=>a+l.terrainSummary.water,0);
    const orphanWater = s.hexTiles.filter(t=>t.terrain==='water'&&!t.landId).length;
    const claimedWater = s.hexTiles.filter(t=>t.terrain==='water'&&t.landId).length;
    const noLandTiles = s.hexTiles.filter(t=>!t.landId).length;
    const avgNeighbors = (s.lands.reduce((a,l)=>a+l.neighbors.length,0)/s.lands.length).toFixed(2);
    return { comps, waterTotal, orphanWater, claimedWater, noLandTiles, avgNeighbors, harbourOk,
      exports: Object.keys(RS).filter(k=>/build|Block|reason/i.test(k)) };
  });
};
for (const seed of [1337, 42, 7]) {
  const r = await run(1, seed);
  console.log(`seed ${seed}`, JSON.stringify(r));
}
await browser.close();
