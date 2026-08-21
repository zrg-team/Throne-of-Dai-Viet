// A scroll anywhere must not deaden the fight screen.
//
// `scrollGestureConsumedTap()` used to return **true** when handed no pointer — "fall back to the
// old behaviour for that one call". The old behaviour was the bug the pointer argument was added
// to fix, and the fallback made it permanent: `consumedGesture` records the gesture that scrolled
// and is only ever *replaced* by the next scroll, never cleared. So the first flick of any
// scrolling page in a session set it, and from then on every pointerless call site refused
// everything.
//
// The battle dock had four: both dials, the two exits, and the Moment's answers. One scroll of The
// Field's setup page — which is scrollable — and the fight that followed accepted nothing at all.
// The screen looked perfect and was completely dead.
//
// This drives it the way a person does: scroll a page, take command, then tap a chip.
//
//   node test_scripts/verify/verify-tap-after-scroll.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5173';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
// 620, the `GAME_HEIGHT` floor, because that is where The Field's setup page actually scrolls.
// At 844 it fits without a scrollbar, nothing claims a gesture, and this harness proves nothing.
const page = await browser.newPage({ viewport: { width: 390, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__phaserGame;
  g.scene.stop('MenuScene');
  g.scene.start('BattleArenaScene');
});
await page.waitForTimeout(1000);

const rect = await page.evaluate(() => {
  const r = window.__phaserGame.canvas.getBoundingClientRect();
  return { left: r.left, top: r.top, k: r.width / 390 };
});
const at = (x, y) => ({ x: rect.left + x * rect.k, y: rect.top + y * rect.k });

// ── no call site may ask the guard a question it cannot answer ────────────
//
// This is the whole bug, and it is decidable by reading rather than by driving: with no pointer to
// match, the guard used to answer **true**, and `consumedGesture` is only replaced by the next
// scroll and never cleared. One flick anywhere in a session and every pointerless call site refused
// everything for the rest of the run. The dock had four of them.
//
// Simulating the scroll proved unreliable — a drag begun on a button never reaches the scroll area
// at all — so the guarantee is pinned where it is exact. `pointer` is now a required parameter, so
// this is also a compile error; the grep is here for the day somebody makes it optional again.
const sources = await page.evaluate(async () => {
  const files = [
    '/src/scenes/ConquestUIScene.ts',
    '/src/scenes/ConquestScene.ts',
    '/src/ui/InkUI.ts',
  ];
  const out = {};
  for (const f of files) {
    const text = await fetch(f).then((r) => r.text());
    out[f] = (text.match(/scrollGestureConsumedTap\(\s*\)/g) ?? []).length;
  }
  return out;
});
const blind = Object.entries(sources).filter(([, n]) => n > 0);
check(blind.length === 0,
  'nothing asks the scroll guard about a gesture it cannot name',
  blind.map(([f, n]) => `${f.split('/').pop()}:${n}`).join(' ') || 'no pointerless calls');

const guard = await page.evaluate(async () => {
  const UI = await import('/src/ui/InkUI.ts');
  // A gesture that has certainly never scrolled anything.
  return UI.scrollGestureConsumedTap({ id: 999, downTime: 1 });
});
check(guard === false,
  'and a gesture that never scrolled is never refused',
  `guard returned ${guard}`);

// ── take command, then give an order ───────────────────────────────────────
const btn = await page.evaluate(() => {
  const s = window.__phaserGame.scene.getScene('BattleArenaScene');
  const r = window.__phaserGame.canvas.getBoundingClientRect();
  const k = r.width / 390;
  const texts = [];
  const walk = (o) => { if (o.type === 'Text') texts.push(o); if (o.list) o.list.forEach(walk); };
  s.children.list.forEach(walk);
  const label = texts.find((t) => /Take command|Cầm quân/.test(t.text ?? ''));
  if (!label) return null;
  const bb = label.getBounds();
  return { x: r.left + (bb.x + bb.width / 2) * k, y: r.top + (bb.y + bb.height / 2) * k };
});
check(Boolean(btn), 'The Field offers a way into the fight');
if (btn) {
  await page.mouse.move(btn.x, btn.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
}
await page.waitForFunction(
  () => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle',
  null, { timeout: 20000 });
await page.waitForTimeout(1400);

const before = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const b = window.__mandateState.ascent.activeBattle;
  const r = window.__phaserGame.canvas.getBoundingClientRect();
  const k = r.width / 390;
  const zones = ui.battleUi.orders.list
    .filter((o) => o.type === 'Zone' && o.input && o.height > 30)
    .sort((a, c) => a.x - c.x);
  // A shape we are not already standing in, so the order is a real change.
  const idx = zones.findIndex((_, i) => i !== ['chong', 'xung', 'tan', 'quy', 'no'].indexOf(b.ourFormation));
  const z = zones[idx < 0 ? 0 : idx];
  return {
    awaiting: ui.battleAwaitingOrder,
    ours: b.ourFormation,
    x: r.left + (z.x + z.width / 2) * k, y: r.top + (z.y + z.height / 2) * k,
  };
});
check(before.awaiting === true, 'the fight opens held, waiting for an order');

await page.mouse.move(before.x, before.y);
await page.mouse.down();
await page.waitForTimeout(80);
await page.mouse.up();
await page.waitForTimeout(2500);

const after = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = window.__mandateState;
  const b = st.ascent?.activeBattle;
  return {
    awaiting: ui.battleAwaitingOrder,
    strategy: st.isStrategyPause, paused: st.isPaused,
    target: b?.formationTarget ?? null, ours: b?.ourFormation ?? null,
    steeredFormation: b?.steeredFormation ?? false,
    steeredStance: b?.steeredStance ?? false,
    beat: b ? (b.approachBeats ?? 0) + b.round : null,
  };
});

check(after.awaiting === false,
  'a chip pressed after a scroll still starts the fight',
  `awaiting ${after.awaiting}`);
check(after.strategy === false && after.paused === false,
  'and the world is actually running',
  `strategy ${after.strategy}, paused ${after.paused}`);
check(after.target !== null || after.ours !== before.ours,
  'and the order was taken',
  `${before.ours} → ${after.target ?? after.ours}`);

// The dial split: taking the shape must not also take the tempo off the commander.
check(after.steeredFormation === true && after.steeredStance === false,
  'ordering a shape hands over the shape and nothing else',
  `formation ${after.steeredFormation}, stance ${after.steeredStance}`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: a scroll has deadened the fight screen');
