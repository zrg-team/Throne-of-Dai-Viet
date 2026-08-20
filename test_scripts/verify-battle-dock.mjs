// The dock has to fit, and it has to fit on the *short* phone.
//
// `GAME_HEIGHT` clamps as low as 620 and the field takes whatever is left once the bands that
// cannot shrink have been paid for — so a dock that fits the window it was designed in and clips on
// an SE is the single most common regression this screen has. Two strips are taller than one ring
// plus a button row, which is exactly the change that could reintroduce it.
//
// Also checks the one-hand claim rather than asserting it: every tap target measured, none below
// the 44-point floor, none overlapping another, and nothing outside the screen.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify-battle-dock.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://localhost:5173';
const HEIGHT = Number(process.env.HEIGHT ?? 620);
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: HEIGHT } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(700);
await page.evaluate(() => window.__phaserGame.scene.getScene('BattleArenaScene').startFight());
await page.waitForFunction(
  () => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle',
  null, { timeout: 20000 });
await page.waitForTimeout(1200);

const layout = await page.evaluate(() => {
  const game = window.__phaserGame;
  const ui = game.scene.getScene('ConquestUIScene');
  const design = game.scale.gameSize.height;

  // Every tap target the dock offers, in design coordinates. The zones are added at absolute
  // positions inside containers parked at the origin, so their own x/y are already the answer.
  const targets = (container, tag) => {
    const out = [];
    container.list.forEach((o) => {
      if (o.input && o.width && o.height && o.type === 'Zone') {
        out.push({ tag, x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.width), h: Math.round(o.height) });
      }
    });
    return out;
  };

  // The lane's Close button lives in `modalLayer`, not in the dock, and is the thing the dock has
  // historically been printed straight through.
  let closeTop = design;
  game.scene.getScene('ConquestUIScene').modalLayer.list.forEach((o) => {
    if (o.type !== 'Container' || o === ui.battleUi?.orders || o === ui.battleUi?.exits) return;
    const hasText = o.list?.some?.((c) => c.type === 'Text');
    if (!hasText) return;
    const b = o.getBounds();
    if (b.y > design * 0.6 && b.y < closeTop) closeTop = Math.round(b.y);
  });

  // What the fight says should be on offer, so the count is a statement about the dock rather than
  // about this particular arena host's doctrine.
  const battle = window.__mandateState.ascent.activeBattle;
  const gone = Object.entries(ui.ourFormationStates(battle))
    .filter(([, v]) => v === 'gone').map(([k]) => k);
  const stancesRefused = ['withdraw', 'defend', 'balanced', 'press']
    .filter((st) => st !== (battle.stancePending ?? battle.stance)
      && (battle.stanceLockBeats ?? 0) > 0 && st !== 'defend' && st !== 'withdraw').length;

  return {
    design,
    goneShapes: gone,
    expectedTargets: (4 - stancesRefused) + (5 - gone.length),
    fieldHeight: ui.battleUi.fieldHeight,
    dock: targets(ui.battleUi.orders, 'dock'),
    exits: targets(ui.battleUi.exits, 'exit'),
    closeTop,
    ordersVisible: ui.battleUi.orders.visible,
  };
});

// Raise a Moment by hand and look at what the screen does with it.
const held = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const st = window.__mandateState;
  const b = st.ascent.activeBattle;
  b.moment = {
    id: 'charge-coming', raisedAtBeat: b.round, ticksLeft: 1,
    subject: b.kingdomName, generalName: 'Probe', generalMartial: 60,
  };
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.buildBattleMoment(b);
  const texts = [];
  ui.battleUi.moment.list.forEach((o) => { if (o.type === 'Text') texts.push(o.text); });
  const answers = ui.battleUi.moment.list.filter((o) => o.type === 'Container').length;
  return { ordersVisible: ui.battleUi.orders.visible, exitsAlpha: ui.battleUi.exits.alpha, texts, answers };
});

await browser.close();

const all = [...layout.dock, ...layout.exits];

check(layout.design <= 640, 'measured on a short phone', `design height ${layout.design}`);
// Not always nine: a stance the lock refuses and a shape whose block this doctrine never had are
// both *deliberately* untappable, so the count is checked against what the fight says is available
// rather than against a constant.
check(layout.dock.length === layout.expectedTargets,
  'every stance and shape that is offered is tappable',
  `${layout.dock.length} targets, expected ${layout.expectedTargets}`
  + (layout.goneShapes.length ? ` (${layout.goneShapes.join(',')} spent)` : ''));
check(layout.exits.length === 2, 'two exits, and they are not on the dock', `${layout.exits.length} chips`);

// The formation strip is the bottom band and the largest thing on it.
const byY = layout.dock.slice().sort((a, b) => a.y - b.y);
const stance = byY.slice(0, 4);
const shapes = byY.slice(4);
check(stance.every((s) => shapes.every((f) => f.y >= s.y + s.h)),
  'the formation strip sits below the stance strip',
  `stance at ${stance[0]?.y}, shapes at ${shapes[0]?.y}`);
check(shapes.every((f) => f.h >= 44), 'every formation chip clears the 44-point floor',
  `${Math.min(...shapes.map((f) => f.h))} smallest`);
check(shapes[0] && stance[0] && shapes[0].h > stance[0].h,
  'the fast dial is the bigger of the two',
  `shape ${shapes[0]?.h} vs stance ${stance[0]?.h}`);

const bottom = Math.max(...layout.dock.map((z) => z.y + z.h));
check(bottom <= layout.closeTop, 'the dock clears the lane’s Close button',
  `dock ends ${bottom}, Close starts ${layout.closeTop}`);
check(bottom <= layout.design, 'nothing runs off the bottom of the screen',
  `${bottom} of ${layout.design}`);

const overlaps = [];
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const a = all[i]; const b = all[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
      overlaps.push(`${a.tag}@${a.x},${a.y} × ${b.tag}@${b.x},${b.y}`);
    }
  }
}
check(overlaps.length === 0, 'no two tap targets overlap', overlaps.slice(0, 3).join(' | ') || 'none');

const thumb = layout.design - Math.min(...layout.dock.map((z) => z.y));
check(thumb <= 210, 'the whole dock is inside the thumb arc', `${thumb} points from the bottom`);

// The exits are deliberately *outside* it.
const exitBottom = Math.max(...layout.exits.map((z) => z.y + z.h));
check(exitBottom < layout.design - thumb, 'the exits are out of the thumb’s reach',
  `exits end ${exitBottom}, dock starts ${layout.design - thumb}`);

check(held.ordersVisible === false, 'a Moment takes the dock away entirely');
check(held.exitsAlpha < 1, 'and dims the exits too', `alpha ${held.exitsAlpha}`);
check(held.texts.some((tx) => /H\s?E\s?L\s?D|D\s?Ừ\s?N\s?G/.test(tx)),
  'the field says it is held', held.texts.slice(0, 3).join(' / '));
check(held.answers >= 2, 'and offers two answers', `${held.answers} buttons`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the dock does not fit');
