// Regression gate for the Dragon Ascent work: every edit to shared files was meant to be
// additive, so the three existing modes must behave identically. Runs each mode from the
// same seed through 60 economy ticks and prints a fingerprint to diff across changes.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${process.env.DEV_URL ?? 'http://127.0.0.1:5179'}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });

const out = {};
for (const mode of ['empire', 'campaign', 'rival']) {
  out[mode] = await page.evaluate(async (m) => {
    const { createInitialGameState, createCampaignGameState, createEmpireGameState } =
      await import('/src/state/GameState.ts');
    const { advanceRealtimeMonth } = await import('/src/systems/RealtimeSystem.ts');
    const { scheduleCampaignEvents } = await import('/src/systems/CampaignEventSystem.ts');

    const original = Math.random;
    let s = 1337 >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    let st;
    if (m === 'empire') { st = createEmpireGameState({ seaSides: 1, difficulty: 'normal' }); scheduleCampaignEvents(st); }
    else if (m === 'campaign') { st = createCampaignGameState({ seaSides: 1, difficulty: 'normal' }); scheduleCampaignEvents(st); }
    else { st = createInitialGameState(); }

    for (let i = 0; i < 60; i += 1) {
      // Resolve anything that pauses, so all three run the same number of real ticks.
      st.pendingCourtRequest = undefined;
      st.activePoliticsCard = undefined;
      st.pendingForeignCard = undefined;
      st.pendingHeroEvent = undefined;
      st.pendingThreatAlert = undefined;
      st.pendingBattle = undefined;
      st.isPaused = false;
      advanceRealtimeMonth(st);
    }
    Math.random = original;

    return {
      turn: st.turn,
      year: st.year,
      season: st.season,
      victory: st.victory,
      isDefeated: st.isDefeated,
      lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
      gold: Math.round(st.resources.gold),
      food: Math.round(st.resources.food),
      humans: Math.round(st.resources.humans),
      armies: st.armies.length,
      mandate: Math.round(st.mandate?.points ?? 0),
      era: st.mandate?.era ?? null,
      invasions: (st.invasions ?? []).length,
      directives: (st.directives ?? []).length,
      modifiers: st.activeCourtModifiers.length,
      stability: Math.round(st.court.stability),
    };
  }, mode);
}

console.log(JSON.stringify(out, null, 2));
console.log('=== ERRORS ===');
errors.forEach((e) => console.log(e));
console.log(errors.length === 0 ? 'PASS: no console errors' : 'FAIL: console errors');

await browser.close();
