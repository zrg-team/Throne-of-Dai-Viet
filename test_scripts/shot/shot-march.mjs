/**
 * Hành quân: what a host looks like standing, and what it looks like on the road.
 *
 * Two images into `output/march/`:
 *   compare.png  — the same host drawn both ways, magnified, so the arrangement is legible.
 *   map.png      — the same host on the map itself, standing then marching.
 *
 * The formation is drawn exactly as the map draws it — `createArmyMarker` with no `drawScale`, so
 * the renderer uses `MAP_HOST_SPREAD` — and only the finished container is scaled up. Passing a
 * `drawScale` here would force `spread: 1` and quietly show an arrangement the map never uses.
 */
import { chromium } from 'playwright';
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = process.env.SHOT_OUT ?? 'output/march';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 620 }, deviceScaleFactor: 3 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const game = window.__phaserGame;
  const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  game.scene.stop('MenuScene');
  game.scene.start('ConquestScene', { state });
  await new Promise((d) => setTimeout(d, 1600));
  const st = window.__mandateState ?? state;
  st.pendingAscentPrompt = undefined;
  st.isPaused = true; st.isStrategyPause = true;
  const ui = game.scene.getScene('ConquestUIScene');
  const map = game.scene.getScene('ConquestScene');
  const host = st.armies.find((a) => a.kingdomId === 'dai-viet' && !a.isLevy);
  const { hostKitFor } = await import('/src/ui/ink/devices.ts');
  const kit = hostKitFor(st, host);
  const total = host.units.spearmen + host.units.archers + host.units.heavyInfantry;

  // A blank sheet over everything, then the same host drawn twice at four times map scale.
  const layer = ui.add.container(0, 0);
  layer.setDepth(9999);
  layer.add(ui.add.rectangle(0, 0, 390, 620, 0xefe7d2, 1).setOrigin(0, 0));
  const label = (x, y, s) => layer.add(ui.add.text(x, y, s, {
    color: '#3a3129', fontFamily: 'sans-serif', fontSize: '13px', fontStyle: '700',
  }));
  label(14, 12, `ĐỨNG (stand) — ${total} men`);
  label(14, 316, 'HÀNH QUÂN (march)');
  const draw = (y, marching) => {
    // Exactly the call the map makes — no drawScale, so the renderer uses MAP_HOST_SPREAD.
    // The container is scaled afterwards, so this is the map's own drawing, magnified.
    const m = map.mapItems.createArmyMarker(
      total, true, undefined, st.mapConfig.seed, { ...kit, marching },
    );
    m.setPosition(195, y);
    m.setScale(4);
    layer.add(m);
    return m;
  };
  const a = draw(230, false);
  const b = draw(540, true);
  await new Promise((d) => setTimeout(d, 300));
  const bounds = (m) => { const r = m.getBounds(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  return { stand: bounds(a), march: bounds(b), total };
});
await page.screenshot({ path: `${OUT}/compare.png` });
console.log(JSON.stringify(out));
console.log('ERRORS:', errs.length ? errs.slice(0, 3) : 'none');
await browser.close();
