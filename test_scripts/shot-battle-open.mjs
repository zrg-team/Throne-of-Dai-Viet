// Drives the real Conquest scenes until an engagement begins and screenshots the battle screen
// that opened itself — the check that the fight announces itself rather than waiting to be found.
// Prints the lane key, the opening hold and the strategy pause. Needs `npm run dev`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('output/web-game', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`${process.env.DEV_URL ?? 'http://127.0.0.1:5173'}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260812, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);
const res = await page.evaluate(async () => {
  const st = window.__mandateState;
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  const first = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': return 'decline';
      case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
      case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'story-beat': return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
      case 'empire-response': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      default: return 'ok';
    }
  };
  let tick = 0;
  for (; tick < 120; tick += 1) {
    // Let the world scene run its own tick so the UI path is exercised for real.
    advanceAscentTick(st);
    world.refresh();
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 10) { resolveAscentPrompt(st, first(st.pendingAscentPrompt)); }
    ui.events.emit('state-changed');
    if (st.ascent.activeBattle) break;
  }
  await new Promise((r) => setTimeout(r, 400));
  return {
    tick,
    battle: st.ascent.activeBattle ? { land: st.ascent.activeBattle.landName, ours: st.ascent.activeBattle.ourNow, theirs: st.ascent.activeBattle.theirNow, key: st.ascent.activeBattle.key } : null,
    openPromptKey: ui.openPromptKey,
    awaiting: ui.battleAwaitingOrder,
    strategyPause: st.isStrategyPause,
    message: st.message,
  };
});
console.log(JSON.stringify(res));
await page.screenshot({ path: 'output/web-game/battle-autoopen.png' });
console.log('ERRORS', errors);
await browser.close();
