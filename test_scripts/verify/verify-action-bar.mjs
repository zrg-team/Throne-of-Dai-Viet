// The bottom strip has to hold six or seven labels across 390 units without a word touching its
// own border, its neighbour, or the status dot stamped on its corner — in both languages, and in
// Dragon Ascent both with and without the Battle button a live siege adds.
//
// This exists because the bar shipped with the labels drawn straight through their buttons:
// Phaser's word wrap only breaks on spaces, so "Heroes" (40 units) simply overflowed a 47-unit
// lane, and Vietnamese wrapped to two lines that filled the button top to bottom and ran under the
// dot. Every number below is read off the live display list, not the layout function, so a label
// that renders wider than it was laid out for still fails.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://localhost:5173';

const browser = await chromium.launch();
const errors = [];
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

/** Every lane's rectangle, the type inside it, and every dot drawn over it. */
const readBar = (uiKey, battleLive) => page.evaluate(async ([key, live]) => {
  const { actionBarSlots, ACTION_BUTTON_HEIGHT } = await import('/src/ui/ActionBar.ts');
  const { GAME_WIDTH } = await import('/src/game/constants.ts');
  const scene = window.__phaserGame.scene.getScene(key);
  const bar = scene.actionBar;
  if (live) {
    bar.context = () => ({ battleLive: true });
    bar.refresh();
  }
  const slots = actionBarSlots(scene.state.gameMode, live ? { battleLive: true } : {});

  const dots = bar.list
    .filter((c) => c.type === 'Arc')
    .map((c) => ({ x: c.x, y: c.y, r: c.radius }));

  const labels = [];
  for (const child of bar.list) {
    if (!child.list) continue;
    const text = child.list.find((c) => c.type === 'Text' && c.text);
    if (!text) continue;
    labels.push({
      text: text.text.replace('\n', ' / '),
      fontSize: Number.parseFloat(text.style.fontSize),
      // The label is origin-centred inside its button, so its box is the button's centre ± half.
      left: child.x + text.x - text.width / 2,
      right: child.x + text.x + text.width / 2,
      top: child.y + text.y - text.height / 2,
      bottom: child.y + text.y + text.height / 2,
      button: { x: child.x, y: child.y },
    });
  }
  return { slots, labels, dots, height: ACTION_BUTTON_HEIGHT, width: GAME_WIDTH };
}, [uiKey, battleLive]);

for (const mode of ['ascent', 'empire', 'campaign', 'rival']) {
  for (const lang of ['en', 'vi']) {
    for (const battleLive of mode === 'ascent' ? [false, true] : [false]) {
      await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((l) => localStorage.setItem('mandate:language:v1', l), lang);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
      await page.evaluate((m) => window.__startBenchGame(1337, m), mode);
      const worldKey = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
      const uiKey = mode === 'ascent' ? 'ConquestUIScene' : 'UIScene';
      await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), worldKey, { timeout: 30000 });
      await page.waitForTimeout(1200);

      const { slots, labels, dots, height, width } = await readBar(uiKey, battleLive);
      const tag = `${mode}/${lang}${battleLive ? '/siege' : ''}`;

      // 1 · Every button is on the screen, and no two of them touch.
      const lanes = slots.filter((s) => !s.system);
      const offscreen = slots.filter((s) => s.x < 0 || s.x + s.width > width);
      check(`${tag}: every button inside the screen`, offscreen.length === 0,
        offscreen.map((s) => `${s.action}@${s.x}+${s.width}`).join(', '));
      const gaps = slots.slice(1).map((s, i) => Math.round(s.x - (slots[i].x + slots[i].width)));
      check(`${tag}: buttons keep 3 units of daylight`, gaps.every((g) => g >= 3), `gaps ${gaps.join(',')}`);

      // 2 · No label crosses its own button. 4 units in from each edge is the border plus its
      // wobble; a word inside that is on paper, a word outside it is on ink.
      const spill = labels.filter((l) => l.left < l.button.x + 4
        || l.right > l.button.x + (lanes.find((s) => s.x === l.button.x)?.width ?? 0) - 4
        || l.top < l.button.y + 3 || l.bottom > l.button.y + height - 3);
      check(`${tag}: no label spills out of its button`, spill.length === 0,
        spill.map((l) => `${l.text} [${Math.round(l.left)}..${Math.round(l.right)}]`).join(', '));

      // 3 · One type size for the whole row, and never below the readable floor.
      const sizes = [...new Set(labels.map((l) => l.fontSize))];
      check(`${tag}: the row is set in one size`, sizes.length === 1, `sizes ${sizes.join(',')}`);
      check(`${tag}: type stays readable`, sizes.every((s) => s >= 9), `sizes ${sizes.join(',')}`);

      // 4 · The status dots sit on the corners, not on the words.
      const hit = [];
      for (const dot of dots) {
        for (const l of labels) {
          const nx = Math.max(l.left, Math.min(dot.x, l.right));
          const ny = Math.max(l.top, Math.min(dot.y, l.bottom));
          if ((nx - dot.x) ** 2 + (ny - dot.y) ** 2 < dot.r ** 2) hit.push(`${l.text}`);
        }
      }
      check(`${tag}: no status dot lands on a label`, hit.length === 0, hit.join(', '));
    }
  }
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
