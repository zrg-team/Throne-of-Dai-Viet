// The fight screen has to answer three questions, and it answered none of them.
//
//   "why would I change?"  — the dock named the enemy's shape (`họ: Thế Nỏ`), which is a fact about
//                            vocabulary, not a situation. Now it says what they are *doing* and
//                            what standing here costs, in men.
//   "did my tap register?" — a formation is instant to order and slow to arrive. The chips were a
//                            bare `add.zone` with only `pointerup`, so for one to two beats after
//                            the press nothing on screen moved: indistinguishable from a dead
//                            button. Now the chip dips, a seal stamps it, and a bar runs the walk.
//   "did that help?"       — nothing ever said so. Now a landing that actually counters is stamped.
//
// The three marks are deliberately separate. Merging them tells the player the wrong thing: at
// 0 ms the order is *issued*, not *done*, and only the flare means the shape has changed.
//
// Everything animated here is drawn from state, never tweened, because `battleOrderSignature`
// includes `reformBeats` — the strip is torn down and rebuilt on every beat of a re-form.
//
//   node test_scripts/verify/verify-battle-feedback.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://localhost:5173';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
// 620 on purpose: `GAME_HEIGHT` clamps there, the field is at its 150 floor, and the dock has
// already once printed straight through the lane's Close button.
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
await page.waitForTimeout(700);
await page.evaluate(() => {
  const s = window.__phaserGame.scene.getScene('BattleArenaScene');
  s.ourMen = 2400; s.theirMen = 2200; s.martial = 70;
  s.startFight();
});
await page.waitForFunction(
  () => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle',
  null, { timeout: 20000 });
await page.waitForTimeout(1400);

/** Everything the dock is currently drawing, by kind. */
const dock = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const layer = ui.battleUi.orders;
  const zones = [], texts = [], graphics = [], icons = [];
  layer.list.forEach((o) => {
    if (o.type === 'Zone' && o.input) zones.push({ x: o.x, y: o.y, w: o.width, h: o.height });
    else if (o.type === 'Text') texts.push(o.text);
    else if (o.type === 'Graphics') graphics.push({ x: o.x, y: o.y });
    else if (o.type === 'Container') icons.push({ x: o.x, y: o.y });
  });
  zones.sort((a, b) => a.y - b.y);
  const rect = window.__phaserGame.canvas.getBoundingClientRect();
  return {
    zones, texts, graphics: graphics.length, icons: icons.length,
    visible: layer.visible,
    // The canvas rect, NOT `scale.displayScale`: that folds in deviceScaleFactor and Playwright's
    // mouse works in CSS pixels.
    rect: { left: rect.left, top: rect.top, k: rect.width / 390 },
  };
});

const opening = await dock();
const stances = opening.zones.filter((z) => z.h === 30);
const chips = opening.zones.filter((z) => z.h > 30);
check(stances.length === 4 && chips.length === 5,
  'the dock offers four tempos and five shapes',
  `${stances.length} stances, ${chips.length} chips`);

// ── the chips say what they are, in words a player arrives with ────────────
check(opening.icons >= 5, 'every shape carries a glyph', `${opening.icons} icons`);
const VERBS = ['SPEARS', 'CHARGE', 'SPREAD', 'SHIELDS', 'VOLLEY'];
const shown = VERBS.filter((v) => opening.texts.includes(v));
check(shown.length === 5, 'and an order rather than a name', shown.join(' '));
// And nothing else. The Vietnamese name used to sit permanently under every verb — a word the
// reader could not read directly below one they could, five times across the busiest strip on the
// screen, on a chip whose second line is needed for `re-forming · 2`.
const VN = ['Chông', 'Xung', 'Tán', 'Quy', 'Nỏ'];
check(VN.every((v) => !opening.texts.includes(v)),
  'and nothing but the order — the vocabulary lesson is off the chip',
  VN.filter((v) => opening.texts.includes(v)).join(' ') || 'none');

// ── the threat, in plain words, over the men it belongs to ─────────────────
//
// It was a line in the dock, a hundred and eighty points below the two blocks of figures it was
// about; the reader had to take on trust which host it meant. It is a speech bubble over the host
// itself now, and both sides get one.
const bubbles = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const texts = [];
  const walk = (o) => {
    if (o.type === 'Text') texts.push(o.text);
    if (o.list) o.list.forEach(walk);
  };
  ui.battleUi.bubbles.list.forEach(walk);
  return { texts, said: ui.battleUi.bubbleSaid };
});
const THREATS = ['their spears are set', 'their horse is coming', 'they are swarming loose',
  'they are locked up tight', 'their arrows are falling'];
check(bubbles.texts.some((line) => THREATS.includes(line)),
  'a bubble over their host says what they are doing',
  bubbles.texts.join(' | '));
const OURS = ['our spears are set', 'our horse is massing', 'we are spread loose',
  'we are locked up tight', 'our arrows are falling'];
check(bubbles.texts.some((line) => OURS.includes(line)),
  'and one over ours says what we are doing — which nothing ever said before',
  bubbles.said.ours);
check(!opening.texts.some((line) => THREATS.includes(line) || line.startsWith('họ:')),
  'and neither the old vocabulary line nor the threat is left in the dock');

// ── the fight's one red line, where the eye starts ─────────────────────────
const notice = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  return { text: ui.battleUi.notice.text, y: Math.round(ui.battleUi.notice.y) };
});
check(notice.text.length > 0 && notice.y < 160,
  'the urgent line is in the header, beside the commander',
  `"${notice.text}" at y=${notice.y}`);

// ── the press ──────────────────────────────────────────────────────────────
const wired = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const zones = ui.battleUi.orders.list.filter((o) => o.type === 'Zone' && o.input && o.height > 30);
  // A chip that only listens for `pointerup` cannot dip under the thumb, which is the whole bug.
  return zones.every((z) => z.listenerCount('pointerdown') > 0 && z.listenerCount('pointerup') > 0);
});
check(wired, 'every chip listens for the press, not just the release');

// Order a shape that is NOT what we hold, through the real input system.
const tap = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const b = window.__mandateState.ascent.activeBattle;
  const RING = ['chong', 'xung', 'tan', 'quy', 'no'];
  // The shape that counters theirs — so the landing is one the game should actually celebrate.
  const want = RING.find((id) => {
    const d = (RING.indexOf(b.theirFormation) - RING.indexOf(id) + 5) % 5;
    return (d === 1 || d === 2) && id !== b.ourFormation;
  }) ?? RING.find((id) => id !== b.ourFormation);
  const zones = ui.battleUi.orders.list
    .filter((o) => o.type === 'Zone' && o.input && o.height > 30)
    .sort((a, c) => a.x - c.x);
  const z = zones[RING.indexOf(want)];
  const rect = window.__phaserGame.canvas.getBoundingClientRect();
  const k = rect.width / 390;
  return {
    want, theirs: b.theirFormation,
    x: rect.left + (z.x + z.width / 2) * k,
    y: rect.top + (z.y + z.height / 2) * k,
  };
});
await page.mouse.move(tap.x, tap.y);
await page.mouse.down();
await page.waitForTimeout(90);
const pressed = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  return ui.battleUi.orders.list.some((o) => o.type === 'Graphics' && o.scaleX < 1);
});
check(pressed, 'and dips under it while it is held down');
await page.mouse.up();
await page.waitForTimeout(120);

const ordered = await page.evaluate(() => {
  const b = window.__mandateState.ascent.activeBattle;
  return {
    target: b.formationTarget ?? null,
    beats: b.reformBeats ?? 0,
    total: b.reformTotalBeats ?? 0,
  };
});
check(ordered.target === tap.want, 'the tap is taken as an order', `${ordered.target}`);
check(ordered.total >= 1 && ordered.total >= ordered.beats,
  'and the walk records how long it is, so the bar can know its own length',
  `${ordered.beats} of ${ordered.total}`);

// ── the order in flight ────────────────────────────────────────────────────
const walking = await dock();
check(walking.texts.some((line) => line.startsWith('re-forming')),
  'the chip says it is walking');
const walkingBubble = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  return ui.battleUi.bubbleSaid.ours;
});
check(/^re-forming/.test(walkingBubble),
  'and our own bubble says why the exchange has just got worse', walkingBubble);
check(walking.texts.includes('no shape yet — this is what the change costs'),
  'with the price of the change still beside the dials');
// The seal and the bar are extra graphics that only exist mid-walk.
check(walking.graphics > opening.graphics,
  'a seal and a transit bar are drawn while it walks',
  `${opening.graphics} → ${walking.graphics} graphics`);

// ── the payoff ─────────────────────────────────────────────────────────────
// Landing is beat-quantised, so poll rather than sleeping on a guess.
let landed = null;
for (let i = 0; i < 30 && !landed; i += 1) {
  await page.waitForTimeout(250);
  landed = await page.evaluate(() => {
    const b = window.__mandateState.ascent?.activeBattle;
    return b && b.landedBeat !== undefined ? { beat: b.landedBeat, said: b.landedCountered } : null;
  });
}
check(landed !== null, 'the order arrives and the arrival is recorded');

// Whether it *should* have been celebrated cannot be judged after the fact: the invader changes
// shape on its own clock, so by the next poll it is answering a different question. Checked
// against the rule itself instead, over all twenty-five pairs, through the same exported function
// the fight calls.
const verdicts = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const F = await import('/src/data/ascent/formations.ts');
  const wrong = [];
  F.FORMATION_RING.forEach((ours) => {
    F.FORMATION_RING.forEach((theirs) => {
      const battle = { ourFormation: ours, theirFormation: theirs, round: 3, approachBeats: 2 };
      B.markFormationLanded(battle);
      if (battle.landedCountered !== F.formationBeats(ours, theirs)) wrong.push(`${ours}>${theirs}`);
      if (battle.landedBeat !== 5) wrong.push(`${ours}>${theirs} beat ${battle.landedBeat}`);
    });
  });
  return wrong;
});
check(verdicts.length === 0,
  'and it only claims to have countered when the ring says it does — all 25 pairs',
  verdicts.slice(0, 4).join(' '));

// ── the price ──────────────────────────────────────────────────────────────
// Measured, not re-derived: the dock prints what the exchange actually spent, so a second copy of
// the formula cannot drift away from the fight it claims to describe.
let priced = null;
for (let i = 0; i < 20 && !priced; i += 1) {
  await page.waitForTimeout(250);
  priced = await page.evaluate(() => {
    const b = window.__mandateState.ascent?.activeBattle;
    if (!b?.lastBeatLoss) return null;
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const texts = ui.battleUi.orders.list.filter((o) => o.type === 'Text').map((o) => o.text);
    return { loss: b.lastBeatLoss, texts, log: b.log.slice(-3) };
  });
}
check(priced !== null, 'the exchange records what the beat cost');
if (priced) {
  const want = `−${Math.round(priced.loss.ours)}`;
  check(priced.texts.some((line) => line.includes(want)),
    'and the dock prints it, in men',
    `${want} in "${priced.texts.find((l) => l.includes('men a beat')) ?? '(not shown)'}"`);
  // The same number the ribbon reports, which is the sim's own account of the beat.
  const ribbon = priced.log.find((l) => l.includes('we lose'));
  check(ribbon === undefined || ribbon.includes(String(Math.round(priced.loss.ours))),
    'the same number the log reports — one exchange, one arithmetic',
    ribbon ?? '(no exchange line yet)');
}

// ── the QTE is untouched ───────────────────────────────────────────────────
const qte = await page.evaluate(() => {
  const st = window.__mandateState;
  const b = st.ascent.activeBattle;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  // Raise one by hand rather than waiting for the deck to roll it.
  b.moment = { id: 'scout-taken', raisedAtBeat: b.round, ticksLeft: 1 };
  ui.buildBattleMoment(b);
  return { dials: ui.battleUi.orders.visible, plate: ui.battleUi.moment.list.length };
});
check(qte.dials === false,
  'a Moment still takes both dials away — and the new band with them',
  `orders.visible ${qte.dials}`);
check(qte.plate > 0, 'and still puts its question up', `${qte.plate} objects in the moment layer`);

// ── it all fits on the smallest screen ─────────────────────────────────────
// The way out is the two exits at the foot now — the lane's Close button is not drawn on this
// screen at all, because leaving the field already does what closing it did.
const fit = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const zones = ui.battleUi.orders.list
    .filter((o) => o.type === 'Zone' && o.input)
    .map((o) => o.y + o.height);
  const exits = ui.battleUi.exits.list.filter((o) => o.type === 'Zone').map((o) => o.y);
  return {
    dockBottom: Math.max(...zones),
    closeTop: exits.length ? Math.min(...exits) : Infinity,
    exitCount: exits.length,
  };
});
check(fit.exitCount === 2 && fit.dockBottom <= fit.closeTop,
  'the dock clears the way out at 390×620',
  `dock ends ${Math.round(fit.dockBottom)}, exits start ${Math.round(fit.closeTop)}`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the dock does not answer the player');
