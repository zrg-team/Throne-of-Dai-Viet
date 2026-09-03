/**
 * The Cabinet of Seals (Phase 3) — the persistent card collection.
 *
 * Verifies the loop end to end in the headless engine: a rubbing spends and reveals under the
 * summon gacha's pity shape, ×3 combines raise a level, a levelled card is applied at its level
 * and drafts with the steeper weight, the opening hand applies stacks and charges ambition, the
 * ceremony grows a bind step, and the store survives garbage.
 *
 * Runs in a fresh Playwright context, so the developer's real localStorage is never touched.
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

const result = await page.evaluate(async () => {
  const cab = await import('/src/state/cabinet.ts');
  const legacy = await import('/src/state/legacy.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { rollPowerDraftCards, takePowerCard } = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { advanceCeremony } = await import('/src/systems/ascent/Ceremony.ts');
  const { resolveAscentPrompt, endAscentRun } = await import('/src/systems/ascent/AscentResolver.ts');

  // Deterministic for the whole page lifetime, like verify-ascent.
  let s = 1337 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const out = {};
  const wipe = () => {
    localStorage.removeItem('mandate:cabinet:v1');
    localStorage.removeItem('mandate:dynasty:v1');
    localStorage.removeItem('mandate:legacy:v1');
    cab.resetCabinetCache();
  };

  // ── Garbage tolerance ────────────────────────────────────────────────────
  const junk = [
    '{{{not json',
    '"a string"',
    '{"cards":{"iron-levy":{"level":1e999,"copies":"x"},"no-such-card":{"level":2,"copies":1}},"rubbings":-4,"openingHand":["ghost","iron-levy"],"learnedRecipes":42}',
  ];
  out.garbage = junk.every((raw) => {
    localStorage.setItem('mandate:cabinet:v1', raw);
    cab.resetCabinetCache();
    try {
      const store = cab.getCabinet();
      return Number.isFinite(store.rubbings) && store.rubbings >= 0
        && !('no-such-card' in store.cards)
        && store.openingHand.every((id) => id !== 'ghost');
    } catch { return false; }
  });

  // ── Round trip ───────────────────────────────────────────────────────────
  wipe();
  cab.addRubbings(3);
  const added = cab.addCabinetCard('iron-levy');
  cab.resetCabinetCache();
  const reread = cab.getCabinet();
  out.roundTrip = added?.outcome === 'new'
    && reread.rubbings === 3
    && reread.cards['iron-levy']?.level === 1
    && reread.cards['iron-levy']?.copies === 1;

  // ── Rubbing reveal honours the pity table ────────────────────────────────
  wipe();
  cab.addRubbings(1);
  // Hard pity: 8 dry pulls owed — the ninth must be gold-or-better and say so.
  localStorage.setItem('mandate:cabinet:v1', JSON.stringify({ ...cab.getCabinet(), rubbingPity: 8 }));
  cab.resetCabinetCache();
  const pityPull = cab.revealRubbing();
  out.hardPity = Boolean(pityPull && pityPull.pityUsed
    && (pityPull.rarity === 'gold' || pityPull.rarity === 'jade')
    && pityPull.remaining === 0);
  out.pityResets = cab.getCabinet().rubbingPity === 0;
  // Spending honesty: no rubbings, no reveal.
  out.noFreePulls = cab.revealRubbing() === undefined;

  // ── Combine: ×3 → Lv2, ×5 → Lv3, melt past the top ───────────────────────
  wipe();
  cab.addCabinetCard('iron-levy');
  cab.addCabinetCard('iron-levy');
  out.notReadyAtTwo = !cab.canCombine('iron-levy');
  cab.addCabinetCard('iron-levy');
  out.readyAtThree = cab.canCombine('iron-levy');
  out.combineTo2 = cab.combineCard('iron-levy') && cab.getCabinet().cards['iron-levy'].level === 2;
  for (let i = 0; i < 5; i += 1) cab.addCabinetCard('iron-levy');
  out.combineTo3 = cab.combineCard('iron-levy') && cab.getCabinet().cards['iron-levy'].level === 3;
  const legacyBefore = legacy.getLegacy().points;
  const melted = cab.addCabinetCard('iron-levy');
  out.meltPastTop = melted?.outcome === 'melted'
    && melted.meltedLegacy > 0
    && legacy.getLegacy().points === legacyBefore + melted.meltedLegacy;

  // ── The levelled card drafts heavier (×1.6 at Lv3) ───────────────────────
  // Counted BEFORE the take below: a taken stack earns the focus bonus (×2.2), which would
  // lift the offer rate on its own and make this check pass with the cabinet weight broken.
  const state1 = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.weightMult = cab.cabinetWeightMult(2) === 1.3 && cab.cabinetWeightMult(3) === 1.6;
  const offers = (state) => {
    let hits = 0;
    for (let i = 0; i < 300; i += 1) {
      if (rollPowerDraftCards(state).includes('iron-levy')) hits += 1;
    }
    return hits;
  };
  const lifted = offers(state1);

  // ── The levelled card is applied at its level ────────────────────────────
  // iron-levy is Lv3 in the cabinet now: taking one stack must apply the Lv3 effect (+18%),
  // not the Lv1 one — the stack index buys copies, the cabinet level buys depth.
  takePowerCard(state1, 'iron-levy');
  const mod = state1.activeCourtModifiers.find((m) => m.label === 'asc:iron-levy:1');
  out.appliedAtLevel = Math.abs((mod?.armyPowerModifier ?? 0) - 0.18) < 1e-9;
  wipe();
  const state2 = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const flat = offers(state2);
  // ×1.6 on a bronze in a wide pool lifts its offer rate well clear of noise over 300 rolls.
  out.draftsHeavier = lifted > flat * 1.15;
  out.draftsHeavierDetail = `${lifted} vs ${flat}`;

  // ── Opening hand: stacks applied, ambition charged ───────────────────────
  wipe();
  cab.addCabinetCard('bronze-drums');
  cab.setOpeningHand(['bronze-drums']);
  const handed = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  wipe();
  const bare = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.handStacks = (handed.ascent?.cardStacks['bronze-drums'] ?? 0) === 1
    && handed.activeCourtModifiers.some((m) => m.label === 'asc:bronze-drums:1');
  out.handAmbition = ((handed.ascent?.ambition ?? 0) - (bare.ascent?.ambition ?? 0)) === 2;
  // Slots clamp: without Deep Shelf only one slot may be filled.
  cab.addCabinetCard('iron-levy');
  cab.addCabinetCard('bronze-drums');
  cab.setOpeningHand(['iron-levy', 'bronze-drums']);
  out.handClamped = cab.openingHand().length === cab.openingHandSlots()
    && cab.openingHandSlots() === 1;

  // ── The ceremony grows a bind step ───────────────────────────────────────
  wipe();
  const run = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  if (run.ascent) {
    run.ascent.cardStacks = { 'iron-levy': 2, 'bronze-drums': 1, 'royal-guard': 1 };
    run.ascent.ceremonyStage = 'reckoning';
  }
  advanceCeremony(run);
  const bindPrompt = run.pendingAscentPrompt;
  out.bindRaised = bindPrompt?.kind === 'bind-card'
    && bindPrompt.options.length === 3
    // Best rarity first: the gold royal-guard leads the fan.
    && bindPrompt.options[0] === 'royal-guard';
  out.bindRefusesStray = resolveAscentPrompt(run, 'no-such-card') === false
    && cab.getCabinet().cards['no-such-card'] === undefined;
  const bound = resolveAscentPrompt(run, 'iron-levy');
  out.bindLands = bound && cab.getCabinet().cards['iron-levy']?.copies === 1;
  out.bindAdvances = run.pendingAscentPrompt?.kind === 'next-reign';

  // ── The run's end always pays a rubbing ──────────────────────────────────
  wipe();
  const dying = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  endAscentRun(dying);
  out.runEndRubbing = cab.getCabinet().rubbings === 1;
  endAscentRun(dying); // re-entrant: the legacyBanked guard must hold the rubbing too
  out.runEndOnce = cab.getCabinet().rubbings === 1;

  wipe();
  return out;
});

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

console.log('=== CABINET STORE ===');
check('garbage-tolerant parse', result.garbage);
check('save round-trip', result.roundTrip);
console.log('=== RUBBINGS ===');
check('hard pity guarantees gold-or-better', result.hardPity);
check('pity resets after a high pull', result.pityResets);
check('no reveal without a rubbing banked', result.noFreePulls);
check('run end pays exactly one rubbing', result.runEndRubbing && result.runEndOnce);
console.log('=== COMBINE ===');
check('two copies do not combine', result.notReadyAtTwo);
check('three copies combine to Lv2', result.readyAtThree && result.combineTo2);
check('five more combine to Lv3', result.combineTo3);
check('a copy past Lv3 melts to Legacy', result.meltPastTop);
console.log('=== THE RUN READS THE CABINET ===');
check('card applies at its cabinet level', result.appliedAtLevel);
check('draft weight steps 1.3 / 1.6', result.weightMult);
check('levelled card drafts heavier', result.draftsHeavier, result.draftsHeavierDetail);
check('opening hand applies one stack', result.handStacks);
check('opening hand charges +2 ambition', result.handAmbition);
check('hand clamps to earned slots', result.handClamped);
console.log('=== THE CEREMONY ===');
check('bind step raises played cards, best first', result.bindRaised);
check('a stray id binds nothing', result.bindRefusesStray);
check('binding files the card', result.bindLands);
check('bind advances to next-reign', result.bindAdvances);
console.log('=== THE PAGE TAKES TAPS ===');
// The page: every tap on it was eaten by the scroll area's own hit zone, because the area was
// never parented (`addTo`). A press on the hero button must turn the page to the scratch.
await page.evaluate(async () => {
  localStorage.setItem('mandate:language:v1', 'vi');
  const cab = await import('/src/state/cabinet.ts');
  localStorage.setItem('mandate:cabinet:v1', JSON.stringify({ rubbings: 8, rubbingPity: 0, cards: {}, hand: [], deeds: [] }));
  cab.resetCabinetCache?.();
  const g = window.__phaserGame;
  for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key);
  g.scene.start('CabinetScene');
});
await page.waitForTimeout(900);
const tapAt = async (find, label) => {
  const spot = await page.evaluate((find) => {
    const g = window.__phaserGame; const sc = g.scene.getScene('CabinetScene');
    const walk = (o, acc) => { acc.push(o); if (o.list) o.list.forEach((c) => walk(c, acc)); return acc; };
    const all = walk({ list: sc.children.list }, []).filter((o) => o.input?.enabled);
    const hit = find === 'hero' ? all.find((o) => o.type === 'Rectangle' && o.input.hitArea.width > 300 && o.input.hitArea.height === 44)
      : all.filter((o) => o.type === 'Zone' && o.width === 83)[1];
    if (!hit) return null;
    const m = hit.getWorldTransformMatrix();
    const w = hit.input.hitArea?.width ?? hit.width, h = hit.input.hitArea?.height ?? hit.height;
    const origin = hit.type === 'Rectangle' ? 0.5 : 0;
    const r = g.canvas.getBoundingClientRect();
    const sx = r.width / g.scale.gameSize.width, sy = r.height / g.scale.gameSize.height;
    return { x: r.x + (m.tx + (0.5 - origin) * w) * sx, y: r.y + (m.ty + (0.5 - origin) * h) * sy };
  }, find);
  if (!spot) return null;
  await page.mouse.move(spot.x, spot.y); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  await page.waitForTimeout(500);
  return page.evaluate(() => { const sc = window.__phaserGame.scene.getScene('CabinetScene'); return { mode: sc.mode, filter: sc.filter }; });
};
const filterTap = await tapAt('filter', 'filter');
check('a tap on a binder filter inside the list lands', filterTap?.filter === 'held', JSON.stringify(filterTap));
const heroTap = await tapAt('hero', 'hero');
check('a press on the scratch button turns the page to the scratch', heroTap?.mode === 'rubbing', JSON.stringify(heroTap));
console.log('=== A PRESS ON THE CARD VIEW STAYS ON THE CARD VIEW ===');
// Close fires on the press (every InkUI button does). The release that follows used to be
// delivered to whatever the close had just revealed — and the binder's tiles act on release, so
// a tile under Close opened its own view: *click on the modal also clicks the bottom*. The list
// is scrolled so a held tile sits under Close, then Close is pressed two ways: down and up in one
// task (a WebView's duplicated mouse pair, a tap on a heavy frame), and a real 80 ms press.
await page.evaluate(async () => {
  const cab = await import('/src/state/cabinet.ts');
  localStorage.setItem('mandate:cabinet:v1', JSON.stringify({ rubbings: 2, rubbingPity: 0, cards: { 'feigned-retreat': { level: 1, copies: 1 }, 'salt-roads': { level: 1, copies: 2 }, 'bronze-drum': { level: 1, copies: 1 } }, hand: [], deeds: [] }));
  cab.resetCabinetCache?.();
  const g = window.__phaserGame;
  for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key);
  g.scene.start('CabinetScene');
  const canvas = g.canvas;
  const toClient = (x, y) => {
    const rect = canvas.getBoundingClientRect();
    return { clientX: rect.left + (x / g.scale.gameSize.width) * rect.width, clientY: rect.top + (y / g.scale.gameSize.height) * rect.height };
  };
  const fire = (type, x, y) => canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mousedown' ? 1 : 0, ...toClient(x, y) }));
  window.__tap = (x, y) => { fire('mousedown', x, y); fire('mouseup', x, y); };
});
await page.waitForTimeout(900);
/** The centre of a view button's hit rectangle, in design units. */
const viewButton = (label) => page.evaluate((label) => {
  const sc = window.__phaserGame.scene.getScene('CabinetScene');
  const hit = sc.viewObjects.find((o) => o.type === 'Container' && o.list?.some((c) => c.type === 'Text' && c.text === label));
  const rect = hit?.list.find((c) => c.type === 'Rectangle' && c.input?.enabled);
  if (!rect) return null;
  const m = rect.getWorldTransformMatrix();
  return { x: m.tx, y: m.ty };
}, label);
const snapshot = () => page.evaluate(async () => {
  const cab = await import('/src/state/cabinet.ts');
  const sc = window.__phaserGame.scene.getScene('CabinetScene');
  return { view: sc.viewObjects.length, filter: sc.filter, mode: sc.mode, hand: cab.openingHand().slice(), scroll: Math.round(-(sc.scroll?.content.y ?? 0)) };
});
/** Scrolls the list so a held tile sits where Close will be, then opens the view. */
const openOverTile = async () => {
  await page.evaluate(() => {
    const sc = window.__phaserGame.scene.getScene('CabinetScene');
    sc.closeCardView();
    sc.filter = 'held';
    sc.pendingScroll = 0;
    sc.render();
    // The binder's tiles begin around 700 units down the list; Close sits around 480 on the page.
    sc.scroll.setScroll(320);
    sc.openCardView('feigned-retreat', { x: 40, y: 400, width: 100, height: 140 });
  });
  await page.waitForTimeout(500);
};
const tileUnder = (x, y) => page.evaluate(({ x, y }) => {
  const sc = window.__phaserGame.scene.getScene('CabinetScene');
  const walk = (o, acc) => { acc.push(o); if (o.list) o.list.forEach((c) => walk(c, acc)); return acc; };
  const zones = walk({ list: sc.children.list }, []).filter((o) => o.type === 'Zone' && o.input?.enabled && o.width < 200);
  return zones.some((z) => { const m = z.getWorldTransformMatrix(); return x >= m.tx && x <= m.tx + z.width && y >= m.ty && y <= m.ty + z.height; });
}, { x, y });

await openOverTile();
const closeAt = await viewButton('Đóng');
const staged = closeAt ? await tileUnder(closeAt.x, closeAt.y) : false;
check('a held tile is staged under Close', staged, JSON.stringify(closeAt));
const before = await snapshot();
if (closeAt) await page.evaluate(({ x, y }) => window.__tap(x, y), closeAt);
await page.waitForTimeout(500);
const afterOneTask = await snapshot();
check('a one-task tap on Close closes the view, and the tile beneath does not open its own',
  before.view > 0 && afterOneTask.view === 0 && afterOneTask.filter === before.filter && afterOneTask.mode === 'cabinet',
  JSON.stringify(afterOneTask));

await openOverTile();
const closeAgain = await viewButton('Đóng');
if (closeAgain) {
  const frame = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); const s = window.__phaserGame.scale.gameSize; return { ox: c.left, oy: c.top, kx: c.width / s.width, ky: c.height / s.height }; });
  await page.mouse.move(frame.ox + closeAgain.x * frame.kx, frame.oy + closeAgain.y * frame.ky);
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
}
await page.waitForTimeout(500);
const afterReal = await snapshot();
check('a real 80 ms press on Close closes the view, and the tile beneath does not open its own',
  afterReal.view === 0 && afterReal.filter === before.filter && afterReal.mode === 'cabinet', JSON.stringify(afterReal));

// A tap on the sheet's own content — the face, the ladder — is the sheet's, not the veil's.
await openOverTile();
const inside = await page.evaluate(() => {
  const sc = window.__phaserGame.scene.getScene('CabinetScene');
  const label = sc.viewObjects.find((o) => o.type === 'Text' && /Thang cấp|The ladder/.test(o.text));
  return label ? { x: label.x + 40, y: label.y + 30 } : null;
});
if (inside) await page.evaluate(({ x, y }) => window.__tap(x, y), inside);
await page.waitForTimeout(400);
const afterInside = await snapshot();
check('a one-task tap on the ladder text keeps the view open', afterInside.view > 0, JSON.stringify(afterInside));
if (inside) {
  const frame = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); const s = window.__phaserGame.scale.gameSize; return { ox: c.left, oy: c.top, kx: c.width / s.width, ky: c.height / s.height }; });
  await page.mouse.move(frame.ox + 60 * frame.kx, frame.oy + 150 * frame.ky);
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
}
await page.waitForTimeout(400);
const afterFace = await snapshot();
check('a real press on the card face keeps the view open', afterFace.view > 0, JSON.stringify(afterFace));
// The list under the sheet is deaf: a drag and a wheel over the page move nothing while the view is up.
const scrollBefore = (await snapshot()).scroll;
{
  const frame = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); const s = window.__phaserGame.scale.gameSize; return { ox: c.left, oy: c.top, kx: c.width / s.width, ky: c.height / s.height }; });
  await page.mouse.move(frame.ox + 195 * frame.kx, frame.oy + 760 * frame.ky);
  await page.mouse.down();
  for (let y = 760; y >= 560; y -= 20) { await page.mouse.move(frame.ox + 195 * frame.kx, frame.oy + y * frame.ky); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.mouse.move(frame.ox + 195 * frame.kx, frame.oy + 300 * frame.ky);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(300);
}
const afterScrollTry = await snapshot();
check('a drag and a wheel over the page move nothing while the view is up, and the drag does not close it', afterScrollTry.scroll === scrollBefore && afterScrollTry.view > 0, JSON.stringify({ before: scrollBefore, after: afterScrollTry }));
await page.evaluate(() => window.__tap(195, 800));
await page.waitForTimeout(400);
const afterOutside = await snapshot();
check('a tap on the veil outside the sheet still closes it', afterOutside.view === 0, JSON.stringify(afterOutside));

// The positive control: with no view up, the same drag DOES scroll the list.
{
  const frame = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); const s = window.__phaserGame.scale.gameSize; return { ox: c.left, oy: c.top, kx: c.width / s.width, ky: c.height / s.height }; });
  const before = (await snapshot()).scroll;
  // The list sits at its far end after the staging scroll, so the finger travels DOWN (the list scrolls back up).
  await page.mouse.move(frame.ox + 195 * frame.kx, frame.oy + 560 * frame.ky);
  await page.mouse.down();
  for (let y = 560; y <= 760; y += 20) { await page.mouse.move(frame.ox + 195 * frame.kx, frame.oy + y * frame.ky); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = (await snapshot()).scroll;
  check('with no view up, the same drag scrolls the list (the lock is a lock, not a dead list)', after !== before, `${before} -> ${after}`);
}
// Back from the deck returns to the page that opened it.
{
  const frame = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); const s = window.__phaserGame.scale.gameSize; return { ox: c.left, oy: c.top, kx: c.width / s.width, ky: c.height / s.height }; });
  await page.mouse.move(frame.ox + 195 * frame.kx, frame.oy + 815 * frame.ky);
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  await page.waitForTimeout(900);
  const where = await page.evaluate(() => { const g = window.__phaserGame; return { menu: g.scene.isActive('MenuScene'), mode: g.scene.getScene('MenuScene').mode }; });
  check('Back from the deck lands on the dynasty page, not the front page', where.menu && where.mode === 'dynasty', JSON.stringify(where));
  await page.evaluate(() => { const g = window.__phaserGame; for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key); g.scene.start('CabinetScene'); });
  await page.waitForTimeout(900);
}
await openOverTile();
const slotAt = await viewButton('Đưa vào tay bài mở đầu');
if (slotAt) await page.evaluate(({ x, y }) => window.__tap(x, y), slotAt);
await page.waitForTimeout(600);
const afterSlot = await snapshot();
check('a one-task tap on Slot puts the card in the hand, keeps the view open, and touches nothing beneath',
  afterSlot.hand.length === 1 && afterSlot.hand[0] === 'feigned-retreat' && afterSlot.view > 0 && afterSlot.filter === before.filter,
  JSON.stringify(afterSlot));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the Cabinet of Seals loop holds — reveal, combine, draft weight, opening hand, bind'
  : 'FAIL: the cabinet loop is broken — see the checks above');
process.exit(failed.length === 0 ? 0 : 1);
