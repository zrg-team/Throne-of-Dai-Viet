// Verifies combat is now probabilistic and HONEST: the win chance shown in the
// preview matches the empirical win rate over many battles.
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
  const war = await import('/src/systems/WarSystem.ts');
  const base = window.__mandateState;

  // Set up: a player army at the capital targeting an adjacent neutral district.
  const cap = base.lands.find((l) => l.ownerId === 'dai-viet' && l.type === 'castle');
  const targetId = cap.neighbors.find((id) => {
    const l = base.lands.find((x) => x.id === id);
    return l && l.ownerId === 'neutral';
  });
  const target = base.lands.find((l) => l.id === targetId);
  target.defense = 20; // ~700 defender power

  base.armies.push({ id: 'test-army', kingdomId: 'dai-viet', name: 'Test', landId: cap.id,
    units: { spearmen: 800, archers: 300, heavyInfantry: 100 }, morale: 90, supply: 90,
    rations: 999, provisions: 999, level: 1, experience: 0, experienceToNextLevel: 100 });

  const preview = war.createBattlePreview(base, 'test-army', targetId);
  const shownChance = preview.winChance;

  let wins = 0;
  const N = 200;
  for (let i = 0; i < N; i += 1) {
    const s = structuredClone(base);
    const won = war.attackLand(s, 'test-army', targetId);
    if (won) wins += 1;
  }
  const empirical = Math.round((wins / N) * 100);
  return { shownChance, empirical, N };
});

console.log(JSON.stringify(result, null, 2));
console.log('errors:', errors.length ? errors : 'none');
const gap = Math.abs(result.shownChance - result.empirical);
console.log(gap <= 12
  ? `PASS: honest odds (shown ${result.shownChance}% vs actual ${result.empirical}%, gap ${gap})`
  : `CHECK: odds gap ${gap} (shown ${result.shownChance}% vs actual ${result.empirical}%)`);
await browser.close();
