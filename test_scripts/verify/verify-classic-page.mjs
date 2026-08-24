// The classic-modes page: Skirmish first, and the coach that explains it the first time.
//
// Three things are under test and they fail in different ways. The ordering is data — easy to get
// right, easy to regress when somebody adds a fourth mode. The tour is a lifecycle — it shares a
// scene with the front page's tour, and the guard that takes a tour down when the player navigates
// away has to tell the two apart or it destroys the wrong one and marks the wrong flag. And the
// arrow is geometry: the card is pinned to the foot of the sheet for one-handed reach, so the only
// thing joining it to the card it describes is that mark.
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

/** Presses the first button on MenuScene whose label matches. */
const press = (source) => page.evaluate((pattern) => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const re = new RegExp(pattern);
  for (const child of scene.children.list) {
    const label = child.list?.find?.((k) => k.type === 'Text' && re.test(k.text));
    if (label) {
      child.list.find((k) => k.type === 'Rectangle')
        ?.emit('pointerup', { id: 3, downTime: 0 }, 0, 0, { stopPropagation() {} });
      return true;
    }
  }
  return false;
}, source);

// `?tour=1` throughout: every tour here is suppressed under `navigator.webdriver`, which is what
// keeps the other hundred-odd scripts working.
// This script's labels and tour controls are intentionally asserted in English; Vietnamese is the
// product default now, so make the fixture language explicit instead of inheriting that fallback.
await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));
await page.goto(`${BASE}/?capture=1&tour=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(1400);

// Get the front page's tour out of the way the way a player would.
for (let card = 0; card < 6; card += 1) {
  if (!(await press('^(Next|Close)$'))) break;
  await page.waitForTimeout(260);
}
check('the front-page tour can be dismissed',
  await page.evaluate(() => !window.__phaserGame.scene.getScene('MenuScene').copilot));

check('Classic Modes opens', await press('Classic Modes'));
await page.waitForTimeout(900);

// ── The order of the three cards ────────────────────────────────────────────
const cards = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const found = [];
  for (const child of scene.children.list) {
    const label = child.list?.find?.((k) => k.type === 'Text'
      && /Skirmish|Throne of Empires|Start Campaign|Giao Tranh/.test(k.text));
    if (label) found.push({ text: label.text, y: child.y });
  }
  return found.sort((a, b) => a.y - b.y).map((c) => c.text);
});
check('the page still offers all three modes', cards.length === 3, JSON.stringify(cards));
check('Skirmish is the first of them', /Skirmish|Giao Tranh/.test(cards[0] ?? ''),
  JSON.stringify(cards));
check('and it is no longer called The Field',
  !cards.some((text) => /The Field/.test(text)), JSON.stringify(cards));

// ── The coach on this page ──────────────────────────────────────────────────
const tour = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const headings = [];
  for (const child of scene.children.list) {
    const text = child.type === 'Text' ? child : undefined;
    if (text && text.depth >= 900) headings.push(text.text);
  }
  return { up: Boolean(scene.copilot), belongsTo: scene.copilotFor, headings };
});
check('the classic page teaches itself the first time', tour.up, JSON.stringify(tour));
check('and the scene knows which page the tour belongs to', tour.belongsTo === 'classic',
  String(tour.belongsTo));
check('it opens on the skirmish', tour.headings.some((h) => /Skirmish|Giao Tranh/.test(h)),
  JSON.stringify(tour.headings));

// The arrow, and the foot-of-the-sheet placement it exists to compensate for.
const geometry = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  let cardTop = 0;
  let arrows = 0;
  for (const child of scene.children.list) {
    if (child.depth === 901 && child.type === 'Graphics') cardTop = child.y || 0;
    if (child.depth === 902 && child.type === 'Graphics') arrows += 1;
  }
  const panel = scene.children.list.find((c) => c.depth === 901);
  return {
    arrows,
    panelY: panel?.y ?? -1,
    cardTop,
    target: scene.tourTargets.skirmish ?? null,
    height: window.__phaserGame.scale.gameSize.height,
  };
});
check('the card draws an arrow toward what it is describing', geometry.arrows >= 1,
  JSON.stringify(geometry));
check('the skirmish card has a measured rectangle to point at',
  Boolean(geometry.target) && geometry.target.height > 20, JSON.stringify(geometry.target));

// ── Navigating away must not confuse the two tours ──────────────────────────
const away = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  scene.mode = 'main';
  scene.render();
  return {
    copilot: Boolean(scene.copilot),
    frontSeen: localStorage.getItem('mandate:tour:v1'),
    classicSeen: localStorage.getItem('mandate:tour:classic:v1'),
  };
});
check('leaving the page takes its tour down with it', away.copilot === false);
check('and marks the CLASSIC flag, not the front page\'s',
  away.classicSeen === 'seen', JSON.stringify(away));

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${passed}/${passed + failed} checks passed`);
console.log(failed
  ? 'FAIL: the classic page does not lead with Skirmish or does not teach it'
  : 'PASS: Skirmish leads the page and the page explains it');
process.exit(failed ? 1 : 0);
