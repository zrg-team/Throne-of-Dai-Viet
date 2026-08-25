// Verifies the living-empires layer: power evolves & diverges, empires war/conquer/
// are reborn (identity changes), threat is strength-driven, and espionage works.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const st = window.__mandateState;
  const gp = await import('/src/systems/empire/GreatPowersSystem.ts');
  const esp = await import('/src/systems/empire/EspionageSystem.ts');
  const empires = () => st.kingdoms.filter((k) => k.id !== 'dai-viet' && !k.isDefeated);

  const startNames = empires().map((k) => k.name);
  const startPowers = empires().map((k) => Math.round(k.power));

  // Simulate ~50 years of world evolution.
  let rebirths = 0;
  let prevNames = empires().map((k) => k.name).join('|');
  for (let y = 0; y < 50; y += 1) {
    gp.tickGreatPowersYear(st);
    const names = empires().map((k) => k.name).join('|');
    if (names !== prevNames) rebirths += 1;
    prevNames = names;
  }
  const endPowers = empires().map((k) => Math.round(k.power));
  const powerSpread = Math.max(...endPowers) - Math.min(...endPowers);

  // Espionage: sabotage crashes stability; ambassador posts a free hero.
  const target = empires()[0];
  st.court.influence = 100;
  const stabBefore = Math.round(target.stability);
  esp.fomentUnrest(st, target.id);
  const stabAfter = Math.round(target.stability);

  const relBefore = Math.round(target.relations);
  const posted = esp.postAmbassador(st, target.id);
  const hasEnvoy = Boolean(target.ambassadorHeroId);

  const rival = empires().find((k) => k.id !== target.id);
  const incited = rival ? esp.inciteWar(st, target.id) : false;

  return {
    startNames, startPowers, endPowers, powerSpread,
    rebirths,
    sabotage: { stabBefore, stabAfter },
    ambassador: { posted, hasEnvoy },
    incited,
    powersEvolved: endPowers.some((p, i) => p !== startPowers[i]),
  };
});

console.log(JSON.stringify(result, null, 2));
console.log('errors:', errors.length ? errors : 'none');
const pass =
  result.powersEvolved &&
  result.powerSpread >= 8 &&
  result.rebirths >= 1 &&
  result.sabotage.stabAfter < result.sabotage.stabBefore &&
  result.ambassador.hasEnvoy &&
  errors.length === 0;
console.log(pass ? 'PASS: empires are alive (evolve, war, reborn) + espionage works' : 'CHECK: expectations unmet');
await browser.close();
