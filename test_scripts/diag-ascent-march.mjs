// Focused diagnostic: why does Dragon Ascent stop expanding? Logs the front, the army's
// position, its live orders, and the best available target every tick for a window.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto('http://127.0.0.1:5173/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { buildMarchTargets } = await import('/src/systems/ascent/MarchOrderSystem.ts');

  let s = 20260808 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const firstChoice = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'march-order': return p.targets[0]?.landId ?? 'hold';
      case 'hero-summon': return p.heroIds[0] ?? 'pass';
      case 'empire-response': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      default: return 'ok';
    }
  };

  const log = [];
  for (let i = 0; i < 120; i += 1) {
    advanceAscentTick(st);
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 10) {
      const p = st.pendingAscentPrompt;
      if (p.kind === 'run-over') break;
      if (!resolveAscentPrompt(st, firstChoice(p))) break;
    }
    if (i >= 30 && i <= 70) {
      const mine = st.armies.filter((a) => a.kingdomId === 'dai-viet');
      log.push({
        t: i,
        front: st.ascent.frontLandId ?? null,
        blocked: st.ascent.frontBlocked,
        lands: st.lands.filter((l) => l.ownerId === 'dai-viet').map((l) => l.id).join(','),
        army: mine.map((a) => `${a.id}@${a.landId}(${a.units.spearmen + a.units.archers + a.units.heavyInfantry})`).join(' '),
        move: st.movementOrders.map((o) => `${o.armyId}->${o.path.join('>')} ${o.progress}/${o.legRequired}`).join(' '),
        siege: st.siegeOrders.map((o) => `${o.armyId}@${o.landId}`).join(' '),
        recruit: st.recruitmentOrders.map((o) => `${o.landId} ${o.progress}/${o.required}`).join(' '),
        best: buildMarchTargets(st).map((x) => `${x.landId}:${x.winChance}%`).join(' '),
        msg: st.message.slice(0, 70),
      });
    }
  }
  return log;
});

for (const row of out) console.log(JSON.stringify(row));
await browser.close();
