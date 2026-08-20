import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? 'http://localhost:5190';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
const out = await page.evaluate(async () => {
  const s = window.__mandateState;
  const RS = await import('/src/systems/ResourceSystem.ts');
  // give the player everything and every era so only terrain can block
  const pk = s.kingdoms.find(k=>/player/i.test(k.id)) ?? s.kingdoms[0]; if (s.mandate) s.mandate.era = 'mandate'; pk.resources = { food: 99999, gold: 99999, supplies: 99999, humans: 99999 };
  const rows = [];
  for (const land of s.lands) {
    const opts = RS.getBuildOptions(s, land) ?? [];
    const h = opts.find(o => o.type === 'harbor');
    rows.push({ land: land.name, water: land.terrainSummary.water, harbor: h ? (h.blockedReason ?? h.reason ?? (h.available===false?'blocked':'OK')) : 'absent', keys: h ? Object.keys(h) : [] });
  }
  const anyOk = rows.filter(r => r.harbor === 'OK');
  const wet = s.lands.filter(l => l.terrainSummary.water > 0).length;
  const coastal = s.lands.filter(l => l.coastHexes > 0).length;
  const navigable = s.lands.filter(l => l.navigable).length;
  const kinds = s.lands.reduce((a, l) => ({ river: a.river + l.waterKinds.river, stream: a.stream + l.waterKinds.stream, lake: a.lake + l.waterKinds.lake }), { river: 0, stream: 0, lake: 0 });
  const reasons = {}; for (const r of rows) reasons[r.harbor] = (reasons[r.harbor] ?? 0) + 1;
  return { total: rows.length, harbourOk: anyOk.length, reasons, provincesWithWater: wet, provincesCoastal: coastal, navigable, kinds, sample: anyOk.slice(0, 3).map(r => r.land) };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
