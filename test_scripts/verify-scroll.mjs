// Scroll gate: the lists in Dragon Ascent must be draggable by finger, and a drag must not choose.
//
// `InkScrollArea` used to scroll by making its `hitZone` draggable through Phaser's drag system.
// That could never fire: `input.topOnly` is on, every card lays a full-bleed interactive rectangle
// across the whole viewport, and a Zone never joins the camera render list so `sortGameObjects`
// always sinks it below them. The zone was therefore never the drag candidate, `dragstart` never
// fired, and the mouse wheel was the only way to scroll — which is no way at all on a phone.
//
// This drives real pointer events at the viewport where the lists actually overflow. A 1512x900
// window clamps GAME_HEIGHT to 620 (constants.ts), and a four-card draft plus its footer needs
// ~775px, so the last card sits below the bottom edge and is unreachable without scrolling.
//
// Three contracts, in order of how badly each one bit:
//   1. a drag scrolls the list;
//   2. the last card becomes reachable;
//   3. the drag does NOT take whatever card the finger lifted over.
//
// Usage: node test_scripts/verify-scroll.mjs [seed]
import { chromium } from 'playwright';

const SEED = Number(process.argv[2] ?? 1337);
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';

// GAME_HEIGHT clamps to its 620 minimum here — the case where the lists overflow.
const VIEWPORT = { width: 1512, height: 900 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);
await page.evaluate((s) => window.__startBenchGame(s, 'ascent'), SEED);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(700);

const designHeight = await page.evaluate(() => window.__phaserGame.scale.height);
check('viewport drives the 620 design height', designHeight === 620, `GAME_HEIGHT ${designHeight}`);

// Walk forward until a prompt whose list actually overflows is on screen. The founder pick fits
// inside its 399px viewport at this height; the four-card power draft is the one that does not.
// Prompts that fit are answered through `resolveAscentPrompt` — the same door play-ascent.mjs uses.
const found = await page.evaluate(async () => {
  const TICK = await import('/src/systems/ascent/AscentTick.ts');
  const RES = await import('/src/systems/ascent/AscentResolver.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const seen = [];
  for (let step = 0; step < 400; step += 1) {
    const st = window.__mandateState;
    const prompt = st.pendingAscentPrompt;
    if (prompt) {
      if (prompt.kind === 'run-over' || st.isDefeated) break;
      ui.events.emit('state-changed');
      // `activeScrollAreas` is private only to TypeScript; at runtime it is a plain field.
      const area = (ui.activeScrollAreas ?? []).find((a) => a.maxScroll > 0);
      if (area) {
        return {
          kind: prompt.kind,
          seen,
          bounds: { x: area.bounds.x, y: area.bounds.y, width: area.bounds.width, height: area.bounds.height },
          maxScroll: area.maxScroll,
        };
      }
      seen.push(prompt.kind);
      const id = prompt.options?.[0]?.id
        ?? prompt.cards?.[0]
        ?? prompt.targets?.[0]?.landId
        ?? prompt.heroes?.[0]?.id
        ?? 'skip';
      if (!RES.resolveAscentPrompt(st, id)) st.pendingAscentPrompt = undefined;
      continue;
    }
    TICK.advanceAscentTick(st);
  }
  return null;
});

if (!found) {
  console.log('FAIL could not reach a prompt with an overflowing list');
  await browser.close();
  process.exit(1);
}

console.log(`\nprompt: ${found.kind}   list ${found.bounds.width}x${found.bounds.height}   maxScroll ${Math.round(found.maxScroll)}\n`);
check('the list actually overflows its viewport', found.maxScroll > 0, `maxScroll ${Math.round(found.maxScroll)}`);

// Design units -> page pixels, through the canvas's own box.
const box = await page.evaluate(() => {
  const r = window.__phaserGame.canvas.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, dw: window.__phaserGame.scale.width, dh: window.__phaserGame.scale.height };
});
const toPage = (dx, dy) => ({ x: box.x + (dx / box.dw) * box.w, y: box.y + (dy / box.dh) * box.h });

const readState = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const area = (ui.activeScrollAreas ?? []).find((a) => a.maxScroll > 0);
  return {
    scrollY: area ? area.scrollY : null,
    contentY: area ? area.content.y : null,
    promptKind: window.__mandateState.pendingAscentPrompt?.kind ?? null,
  };
});

const before = await readState();

// A real finger: press near the bottom of the list and drag upward, past the 6px slop.
const startDesign = { x: found.bounds.x + found.bounds.width / 2, y: found.bounds.y + found.bounds.height - 40 };
const start = toPage(startDesign.x, startDesign.y);
const dragDistancePx = (200 / box.dh) * box.h;

await page.mouse.move(start.x, start.y);
await page.mouse.down();
// Several small steps, the way a finger actually moves — one big jump can skip the move handler.
for (let i = 1; i <= 8; i += 1) {
  await page.mouse.move(start.x, start.y - (dragDistancePx * i) / 8);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(120);

const afterDrag = await readState();

check(
  'a finger drag scrolls the list',
  afterDrag.scrollY !== null && before.scrollY !== null && afterDrag.scrollY > before.scrollY + 20,
  `scrollY ${Math.round(before.scrollY ?? -1)} -> ${Math.round(afterDrag.scrollY ?? -1)}`,
);
check(
  'the content moved with it',
  afterDrag.contentY !== null && afterDrag.contentY < (before.contentY ?? 0) - 20,
  `content.y ${Math.round(before.contentY ?? 0)} -> ${Math.round(afterDrag.contentY ?? 0)}`,
);
check(
  'the drag did not choose a card',
  afterDrag.promptKind === before.promptKind && afterDrag.promptKind !== null,
  `prompt ${before.promptKind} -> ${afterDrag.promptKind}`,
);

// Drag to the very bottom and confirm the end of the list is reachable.
for (let pass = 0; pass < 6; pass += 1) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(start.x, start.y - (dragDistancePx * i) / 6);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(40);
}
const atBottom = await readState();
check(
  'the last card is reachable',
  atBottom.scrollY !== null && atBottom.scrollY >= found.maxScroll - 1,
  `scrollY ${Math.round(atBottom.scrollY ?? -1)} of ${Math.round(found.maxScroll)}`,
);
check('scrolling to the end still chose nothing', atBottom.promptKind === before.promptKind);

// And a clean tap — no travel — must still choose. Fixing the drag must not break the tap.
const tapDesign = { x: found.bounds.x + found.bounds.width / 2, y: found.bounds.y + 40 };
const tap = toPage(tapDesign.x, tapDesign.y);
await page.mouse.move(tap.x, tap.y);
await page.mouse.down();
await page.waitForTimeout(40);
await page.mouse.up();
await page.waitForTimeout(300);

const afterTap = await readState();
check(
  'a clean tap still chooses',
  afterTap.promptKind !== before.promptKind,
  `prompt ${before.promptKind} -> ${afterTap.promptKind}`,
);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: lists scroll by finger and a drag never chooses' : 'FAIL: scrolling is still broken');

await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
