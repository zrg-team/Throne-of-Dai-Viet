import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(999, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const st = window.__mandateState;
  const CRIS = await import('/src/systems/empire/CrisisSystem.ts');
  const TD = await import('/src/systems/empire/ThreatDirector.ts');
  const ACQ = await import('/src/systems/AcquisitionSystem.ts');
  // Give the player a couple of provinces, then make one bitterly disloyal.
  const cap = st.lands.find(l => l.ownerId==='dai-viet');
  const n = cap.neighbors.map(id=>st.lands.find(l=>l.id===id)).filter(l=>l&&l.ownerId==='neutral');
  st.resources.gold = 500;
  for (const l of n.slice(0,2)) { l.ownerId='dai-viet'; l.loyalty=8; }
  if (st.dynastyStatus) st.dynastyStatus.farmerUnrest = 80;
  const beforeLands = st.lands.filter(l=>l.ownerId==='dai-viet').length;
  let seceded = false;
  for (let i=0;i<40 && !seceded;i++){ CRIS.tickCrises(st); if (st.lands.filter(l=>l.ownerId==='dai-viet').length < beforeLands) seceded = true; }

  // Vassalage: make the strongest empire dwarf the player and be hostile.
  const strong = st.kingdoms.find(k=>k.id!=='dai-viet' && !k.isDefeated);
  strong.power = 130; strong.relations = 28;
  let vassal = false;
  for (let i=0;i<80 && !vassal;i++){ TD.tickThreatDirector(st); if (st.pendingForeignCard?.id?.startsWith('vassalage')) vassal = true; st.pendingForeignCard = st.pendingForeignCard?.id?.startsWith('vassalage') ? st.pendingForeignCard : undefined; }
  return { seceded, vassal, vassalCard: st.pendingForeignCard?.title };
});
console.log('secession fires:', r.seceded, '| vassalage fires:', r.vassal, r.vassalCard || '');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
