// The coach on the battle screen: does it appear there at all, and does it point at the controls?
//
// This screen was the one the coach had least business skipping and skipped anyway. It is a whole
// interface of its own — two hosts, a round clock, a telegraph line, four stances, five shapes and
// two ways out — and none of it appears anywhere else. It was skipped because opening a lane sets
// `openPromptKey`, which is how the coach decides a card owns the glass; only a stage marked
// `overCard` may speak when the thing it is about IS the thing owning the glass.
//
// Reached through the arena, which is the shortest honest route to a live fight.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://localhost:5173';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`ok   ${label}`); }
  else { failed += 1; console.log(`FAIL ${label}${detail ? `  — ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// Pinned: every literal this file asserts (‘Next’, ‘re-forming’, the bubble lines) is the
// English catalog's. The game's default language is the player's business; the harness's is not.
await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));

await page.goto(`${BASE}/?capture=1&tour=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => {
  const game = window.__phaserGame;
  game.scene.stop('MenuScene');
  game.scene.start('BattleArenaScene');
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  const arena = window.__phaserGame.scene.getScene('BattleArenaScene');
  arena.ourMen = 1500;
  arena.theirMen = 1500;
  arena.martial = 70;
  arena.startFight();
});
const live = await page.waitForFunction(
  () => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle',
  null,
  { timeout: 20000 },
).then(() => true).catch(() => false);
check('a fight can be reached', live);
await page.waitForTimeout(1600);

const opened = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  return {
    shown: [...scene.tourStagesShown],
    up: Boolean(scene.runTour),
    paused: Boolean(scene.state.isStrategyPause),
  };
});
check('the coach speaks on the battle screen', opened.shown.includes('fight') && opened.up,
  JSON.stringify(opened));
// The fight runs on the world's clock. A card the player is reading must not cost them beats.
check('and the fight waits while a card is being read', opened.paused === true,
  JSON.stringify(opened));

// ── Every control gets its own rectangle, recorded by the dock ──────────────
//
// Read off `battleUi.coachBounds`, filled where the dock computes its rows. The arithmetic is four
// constants deep and another session is actively moving it; a second copy in the tour would be
// wrong within the week.
const boxes = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const stage = scene.tourStages().find((s) => s.id === 'fight');
  return {
    ids: stage.steps().map((s) => s.id),
    targets: stage.steps().map((s) => s.target()),
    recorded: scene.battleUi?.coachBounds ?? {},
  };
});
check('every part of the fight is covered',
  ['fight-rails', 'fight-pips', 'fight-read', 'fight-stance', 'fight-shapes', 'fight-exits']
    .every((id) => boxes.ids.includes(id)),
  JSON.stringify(boxes.ids));
check('each card has a real rectangle to point at',
  boxes.targets.every((b) => b && b.width > 40 && b.height > 8),
  JSON.stringify(boxes.targets));
check('and they are distinct parts of the screen, not one band repeated',
  new Set(boxes.targets.map((b) => Math.round(b.y))).size === boxes.targets.length,
  JSON.stringify(boxes.targets.map((b) => b.y)));
// The dock's rows run down the screen in the order the cards name them.
const dock = ['readout', 'stance', 'formation'].map((k) => boxes.recorded[k]?.y ?? -1);
check('the recorded dock rows are in dock order',
  dock.every((y, i) => i === 0 || y > dock[i - 1]), JSON.stringify(dock));

// ── Walking it ──────────────────────────────────────────────────────────────
const forward = () => page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  for (const child of scene.children.list) {
    const label = child.list?.find?.((k) => k.type === 'Text'
      && /^(Next|Got it|Start playing|Play now)$/.test(k.text));
    if (label) {
      child.list.find((k) => k.type === 'Rectangle')
        ?.emit('pointerup', { id: 12, downTime: 0 }, 0, 0, { stopPropagation() {} });
      return true;
    }
  }
  return false;
});
let steps = 0;
for (let guard = 0; guard < 10; guard += 1) {
  if (!(await forward())) break;
  steps += 1;
  await page.waitForTimeout(240);
}
check('all six cards can be walked and dismissed', steps >= 6, `${steps} advanced`);
const after = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  return { up: Boolean(scene.runTour), paused: Boolean(scene.state.isStrategyPause) };
});
check('the coach lets go of the screen at the end', after.up === false, JSON.stringify(after));

// The clock is NOT asserted to be running here, and that was a wrong assumption first time round:
// the battle screen deliberately holds the fight until the first order — "the realm holds its
// breath" — so a paused world after the coach closes is the screen working, not the coach leaking.
//
// What must hold is the contract: the coach gives back exactly the clock it took. Tested by
// setting a known value, raising a card over it, and closing it again.
const restored = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const out = [];
  for (const before of [false, true]) {
    scene.runTour?.destroy();
    scene.runTour = undefined;
    scene.tourStagesShown.clear();
    scene.state.isStrategyPause = before;
    scene.renderActionBar();
    const during = scene.state.isStrategyPause;
    scene.runTour?.opts?.onClose?.();
    scene.runTour?.destroy();
    scene.runTour = undefined;
    out.push({ before, during, after: scene.state.isStrategyPause });
  }
  return out;
});
check('a card always stops the clock while it is read',
  restored.every((r) => r.during === true), JSON.stringify(restored));
check('and hands back exactly the clock it took',
  restored.every((r) => r.after === r.before), JSON.stringify(restored));

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${passed}/${passed + failed} checks passed`);
console.log(failed
  ? 'FAIL: the battle screen is not explained'
  : 'PASS: the battle screen explains itself, one control at a time');
process.exit(failed ? 1 : 0);
