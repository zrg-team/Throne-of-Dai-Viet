/**
 * The Dynasty Ledger — Tông Phả (docs/26-the-dynasty-ledger.html, Phase 2).
 *
 * Drives the store, the ceremony and the six live read sites headlessly, then boots the rendered
 * mode once to prove the two new prompt kinds actually draw something.
 *
 * Two traps this script is shaped around:
 *   - prompts are driven **explicitly**. `autoDefend` and the autopilots answer cards on their
 *     own, so a harness that waits for one to appear can wait for ever;
 *   - `run-over` and `next-reign` are terminal — the resolver hands them to the scene rather than
 *     clearing them — so every drain loop here is bounded.
 *
 * Usage: node test_scripts/verify/verify-dynasty.mjs   (a dev server must already be running)
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

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

// ── 1. The store: parse, level curve, picks, persistence ────────────────────
console.log('=== STORE ===');
const store = await page.evaluate(async () => {
  const d = await import('/src/state/dynasty.ts');
  const out = {};

  // Garbage in localStorage must fall back to defaults, not throw.
  localStorage.setItem('mandate:dynasty:v1', '{not json at all');
  out.garbage = d.getDynasty();
  localStorage.setItem('mandate:dynasty:v1', JSON.stringify({ xp: 'lots', traits: ['no-such-trait'], level: -4 }));
  out.shaped = d.getDynasty();

  // The published curve: step(n) = 2000 * 1.12^(n-1).
  out.steps = [1, 10, 15, 25].map((n) => d.dynastyXpStep(n));

  localStorage.removeItem('mandate:dynasty:v1');
  // One typical run score. The dossier's pacing says a ~6,000 run buys the first few levels.
  out.levelsFrom6000 = d.addRunXp(6000, {
    founder: { id: 'h1', name: 'Lê Duyệt', type: 'general', sex: 'man' },
    house: 'Lê',
  });
  const after = d.getDynasty();
  out.after = { xp: after.xp, level: after.level, picks: after.pendingPicks, reigns: after.reigns, house: after.house };
  out.progress = d.dynastyProgress();

  // A pick is two of the un-owned traits, never more.
  out.offer = d.rollTraitOffer();
  out.tookUnoffered = d.chooseTrait('not-a-trait');
  out.took = d.chooseTrait(out.offer[0]);
  out.tookTwice = d.chooseTrait(out.offer[0]);
  out.owns = d.hasTrait(out.offer[0]);
  out.picksLeft = d.getDynasty().pendingPicks;

  // Survives a re-read (this is the round trip the save gate asks for).
  out.reread = d.getDynasty().traits;
  return out;
});

check('garbage localStorage falls back to defaults',
  store.garbage.xp === 0 && store.garbage.level === 0 && store.garbage.traits.length === 0);
check('wrong-typed fields are coerced, unknown trait ids dropped',
  store.shaped.xp === 0 && store.shaped.level === 0 && store.shaped.traits.length === 0,
  JSON.stringify(store.shaped));
check('level curve is 2000 x 1.12^(n-1)',
  store.steps[0] === 2000 && store.steps[1] === 5546 && store.steps[2] === 9774 && store.steps[3] === 30357,
  store.steps.join(' / '));
check('a ~6,000 run banks XP and produces level-ups',
  store.after.xp === 6000 && store.levelsFrom6000 >= 1 && store.after.level === store.levelsFrom6000,
  `xp ${store.after.xp}, levels ${store.levelsFrom6000}`);
check('reigns and house are recorded', store.after.reigns === 1 && store.after.house === 'Lê');
check('the offer is exactly two un-owned traits', store.offer.length === 2 && store.offer[0] !== store.offer[1],
  store.offer.join(' / '));
check('an un-offered id is refused, a real one is taken once',
  store.tookUnoffered === false && store.took === true && store.tookTwice === false);
check('the choice persists across a re-read', store.owns === true && store.reread.includes(store.offer[0]));
check('one pick is spent per choice', store.picksLeft === store.levelsFrom6000 - 1,
  `${store.picksLeft} left of ${store.levelsFrom6000}`);

// ── 2. The six live read sites ──────────────────────────────────────────────
console.log('\n=== READ SITES ===');
const sites = await page.evaluate(async () => {
  const d = await import('/src/state/dynasty.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { rollPowerDraftCards, offerPowerDraft } = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { getMusterEstimate } = await import('/src/systems/WarSystem.ts');
  const { adoptDoctrine } = await import('/src/systems/ascent/RealmDoctrineSystem.ts');
  const { getCourtBonuses } = await import('/src/systems/CourtSystem.ts');

  const seed = (n) => {
    let s = n >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const withTraits = (traits) => {
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({
      xp: 0, level: 9, traits, pendingPicks: 0, reigns: 3, bestScore: 0, respecs: 0,
    }));
  };

  const out = {};

  // Draft size, and the free first reroll.
  withTraits([]);
  seed(1337);
  let state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  state.ascent.pendingLevelUps = 1;
  out.draftBare = rollPowerDraftCards(state).length;
  offerPowerDraft(state);
  out.rerollBare = state.ascent.rerollCost;

  withTraits(['wide-draft', 'first-reroll-free']);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  state.ascent.pendingLevelUps = 1;
  out.draftWide = rollPowerDraftCards(state).length;
  offerPowerDraft(state);
  out.rerollFree = state.ascent.rerollCost;

  // Founder count.
  withTraits([]);
  out.founderBare = d.founderOptionCount();
  withTraits(['second-founder']);
  out.founderWide = d.founderOptionCount();
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const founderPrompt = state.pendingAscentPrompt?.kind === 'founder'
    ? state.pendingAscentPrompt
    : state.ascent.promptQueue.find((p) => p.kind === 'founder');
  out.founderDealt = founderPrompt?.options.length ?? 0;

  // Muster tempo.
  withTraits([]);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.musterBare = getMusterEstimate(state, 900).ticks;
  withTraits(['quartermaster']);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.musterFast = getMusterEstimate(state, 900).ticks;

  // Old Roads: the opening trade seed, through the ordinary court pipeline.
  withTraits([]);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.marketBare = getCourtBonuses(state).marketGoldOutputMult ?? 1;
  withTraits(['old-roads']);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.marketRoads = getCourtBonuses(state).marketGoldOutputMult ?? 1;

  // Twin Doctrine: a second course stands beside the first from era 2.
  withTraits(['twin-doctrine']);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  adoptDoctrine(state, 'enrich');
  out.firstCourse = state.ascent.doctrine;
  // ERA_ORDER is founding / rivalry / empires / mandate — the second slot opens at index 1.
  state.mandate.era = 'rivalry';
  adoptDoctrine(state, 'fortify');
  out.twin = [state.ascent.doctrine, state.ascent.doctrine2];

  withTraits([]);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  adoptDoctrine(state, 'enrich');
  state.mandate.era = 'rivalry';
  adoptDoctrine(state, 'fortify');
  out.single = [state.ascent.doctrine, state.ascent.doctrine2];

  return out;
});

check('Wide Draft lays out one card more', sites.draftWide === sites.draftBare + 1,
  `${sites.draftBare} -> ${sites.draftWide}`);
check('First Reroll Free opens the draft at nothing',
  sites.rerollBare > 0 && sites.rerollFree === 0, `${sites.rerollBare} -> ${sites.rerollFree}`);
check('Second Founder deals five champions, not three',
  sites.founderBare === 3 && sites.founderWide === 5 && sites.founderDealt === 5,
  `dealt ${sites.founderDealt}`);
check('Quartermaster takes one season off a muster',
  sites.musterFast === Math.max(1, sites.musterBare - 1) && sites.musterBare > 1,
  `${sites.musterBare} -> ${sites.musterFast}`);
check('Old Roads seeds the market trade bonus',
  Math.abs(sites.marketBare - 1) < 1e-9 && sites.marketRoads > 1,
  `${sites.marketBare} -> ${sites.marketRoads}`);
check('Twin Doctrine fills a second slot from era 2',
  sites.twin[0] === 'enrich' && sites.twin[1] === 'fortify',
  sites.twin.join(' + '));
check('without the trait a second choice replaces the first',
  sites.single[0] === 'fortify' && sites.single[1] === undefined, sites.single.join(' + '));

// ── 3. The ceremony chain ───────────────────────────────────────────────────
console.log('\n=== CEREMONY ===');
const ceremony = await page.evaluate(async () => {
  const d = await import('/src/state/dynasty.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { endAscentRun, resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { advanceCeremony } = await import('/src/systems/ascent/Ceremony.ts');

  let s = 4242 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  localStorage.removeItem('mandate:dynasty:v1');
  const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  // A reign worth several levels, so the chain has more than one step to walk.
  state.ascent.wavesSurvived = 40;
  state.ascent.peakPower = 9000;
  state.ascent.heroesSummoned = 6;
  state.pendingAscentPrompt = undefined;
  state.ascent.promptQueue = [];

  const out = { stages: [] };
  endAscentRun(state);
  const banked = d.getDynasty();
  out.bankedXp = banked.xp;
  out.bankedPicks = banked.pendingPicks;
  out.afterEnd = state.pendingAscentPrompt?.kind;

  // Double-bank guard: a re-entrant tick must not pay the house twice.
  endAscentRun(state);
  out.xpAfterSecondEnd = d.getDynasty().xp;

  // The Reckoning's button walks the chain one step at a time.
  let guard = 0;
  let more = advanceCeremony(state);
  while (more && guard++ < 20) {
    const prompt = state.pendingAscentPrompt;
    out.stages.push(prompt.kind);
    if (prompt.kind === 'dynasty-level') {
      out.lastOffer = prompt.options.slice();
      out.paused = state.isPaused;
      resolveAscentPrompt(state, prompt.options[0]);
      // The resolver chains straight into the next step without unpausing.
      more = Boolean(state.pendingAscentPrompt);
      if (more) out.chained = state.pendingAscentPrompt.kind;
    } else {
      // next-reign is terminal: its own button starts the run.
      more = false;
    }
  }
  out.finalStage = state.ascent.ceremonyStage;
  out.traitsAfter = d.getDynasty().traits.slice();
  out.picksAfter = d.getDynasty().pendingPicks;

  // A house with nothing to say restarts immediately — the ceremony must not add a step.
  const quiet = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  quiet.ascent.ceremonyStage = 'reign';
  quiet.pendingAscentPrompt = undefined;
  out.quietAdvance = advanceCeremony(quiet);

  // The trait chosen in the ceremony is true for the very next run.
  const next = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const founderPrompt = next.pendingAscentPrompt?.kind === 'founder'
    ? next.pendingAscentPrompt
    : next.ascent.promptQueue.find((p) => p.kind === 'founder');
  out.nextFounderCount = founderPrompt?.options.length ?? 0;
  out.nextExpected = d.founderOptionCount();
  return out;
});

check('endAscentRun banks dynasty XP', ceremony.bankedXp > 0, `${ceremony.bankedXp} xp`);
check('XP banks exactly once (guarded like legacyBanked)',
  ceremony.xpAfterSecondEnd === ceremony.bankedXp);
check('the Reckoning still leads the chain', ceremony.afterEnd === 'run-over');
check('the chain raises a dynasty-level card and then the next reign',
  ceremony.stages[0] === 'dynasty-level' && ceremony.stages[ceremony.stages.length - 1] === 'next-reign',
  ceremony.stages.join(' -> '));
check('the level card offers two traits and holds the world paused',
  ceremony.lastOffer?.length === 2 && ceremony.paused === true);
check('answering it chains without unpausing', Boolean(ceremony.chained), ceremony.chained ?? 'nothing followed');
check('every pick is spent by the end of the chain', ceremony.picksAfter === 0
  && ceremony.traitsAfter.length === ceremony.bankedPicks,
  `${ceremony.traitsAfter.length} taken of ${ceremony.bankedPicks}`);
check('the ceremony closes', ceremony.finalStage === 'reign' || ceremony.finalStage === 'done',
  ceremony.finalStage);
check('a house with nothing to say adds no step', ceremony.quietAdvance === false);
check('the ceremony choice is in force on the very next run',
  ceremony.nextFounderCount === ceremony.nextExpected,
  `${ceremony.nextFounderCount} dealt, ${ceremony.nextExpected} expected`);

// ── 4. The rendered screens ─────────────────────────────────────────────────
console.log('\n=== SCREENS ===');
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

const screens = await page.evaluate(async () => {
  const game = window.__phaserGame;
  const scene = game.scene.getScene('ConquestScene');
  const ui = game.scene.getScene('ConquestUIScene');
  const { endAscentRun } = await import('/src/systems/ascent/AscentResolver.ts');
  const state = scene.state;

  // `promptScrollBody` puts a page's cards inside its scroll area, not in `modalLayer`, so a
  // scrolling prompt legitimately shows a small modalLayer count. Both are read.
  const drawn = () => ({
    key: ui.openPromptKey,
    objects: ui.modalLayer.length,
    scrolled: (ui.activeScrollAreas ?? []).reduce((sum, area) => sum + area.content.length, 0),
  });

  // Answer whatever the opening left standing, then end the run by hand.
  state.pendingAscentPrompt = undefined;
  state.ascent.promptQueue = [];
  state.ascent.wavesSurvived = 30;
  state.ascent.peakPower = 7000;
  endAscentRun(state);
  scene.refresh();
  ui.events.emit('state-changed');
  game.step(performance.now(), 16);
  const reckoning = drawn();

  // The Reckoning's "go again" walks the ceremony rather than restarting the mode.
  ui.events.emit('ui:ascent-ceremony');
  game.step(performance.now(), 16);
  const grows = drawn();

  const prompt = state.pendingAscentPrompt;
  if (prompt?.kind === 'dynasty-level') {
    ui.events.emit('ui:ascent-choice', prompt.options[0]);
    game.step(performance.now(), 16);
  }
  let guard = 0;
  while (state.pendingAscentPrompt?.kind === 'dynasty-level' && guard++ < 10) {
    ui.events.emit('ui:ascent-choice', state.pendingAscentPrompt.options[0]);
    game.step(performance.now(), 16);
  }
  if (!state.pendingAscentPrompt) {
    ui.events.emit('ui:ascent-ceremony');
    game.step(performance.now(), 16);
  }
  const nextReign = drawn();
  return { reckoning, grows, nextReign, stage: state.ascent.ceremonyStage };
});

check('the Reckoning still draws', screens.reckoning.key.startsWith('run-over') && screens.reckoning.objects > 5,
  `${screens.reckoning.key} / ${screens.reckoning.objects} objects`);
check('"go again" opens the dynasty card rather than restarting',
  screens.grows.key.startsWith('dynasty-level') && screens.grows.objects >= 4 && screens.grows.scrolled > 4,
  `${screens.grows.key} / ${screens.grows.objects} chrome + ${screens.grows.scrolled} in the scroll`);
check('the chain ends on the next-reign screen',
  screens.nextReign.key.startsWith('next-reign') && screens.nextReign.objects > 5,
  `${screens.nextReign.key} / ${screens.nextReign.objects} objects`);

// ── 5. The menu sheet ───────────────────────────────────────────────────────
const sheet = await page.evaluate(() => {
  const game = window.__phaserGame;
  const menu = game.scene.getScene('MenuScene');
  game.scene.stop('ConquestUIScene');
  game.scene.stop('ConquestScene');
  game.scene.start('MenuScene');
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        menu.mode = 'dynasty';
        menu.render();
        resolve({ objects: menu.content.length, ok: true });
      } catch (err) {
        resolve({ ok: false, message: String(err && err.message) });
      }
    }, 600);
  });
});
check('the dynasty sheet renders on the menu', sheet.ok === true && sheet.objects > 8,
  sheet.ok ? `${sheet.objects} objects` : sheet.message);


// ── 6. The save round trip, in a real browser ───────────────────────────────
//
// `getDynasty` is exercised headlessly above; this proves the file itself survives a genuine
// reload — a fresh module graph, a fresh parse, nothing carried in memory — and that no shape of
// junk can take the store down. The `1e999` case is a regression: `Math.max(0, Math.floor(Number(x)
// || 0))` passes `Infinity` straight through, and an infinite level made the step-summing walk
// hang the menu the moment the sheet was opened.
console.log('\n=== SAVE ROUND TRIP ===');
{
  const trip = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const tripErrors = [];
  trip.on('pageerror', (e) => tripErrors.push(`PAGEERROR: ${e.message}`));
  await trip.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await trip.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

  const written = await trip.evaluate(async () => {
    const d = await import('/src/state/dynasty.ts');
    localStorage.removeItem('mandate:dynasty:v1');
    d.addRunXp(9000, { founder: { id: 'h1', name: 'Trần Quốc Tuấn', type: 'general', sex: 'man' }, house: 'Trần' });
    d.chooseTrait(d.rollTraitOffer()[0]);
    return d.getDynasty();
  });

  await trip.reload({ waitUntil: 'domcontentloaded' });
  await trip.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  const reloaded = await trip.evaluate(async () => {
    const d = await import('/src/state/dynasty.ts');
    const s = d.getDynasty();
    return { store: s, owns: d.hasTrait(s.traits[0]) };
  });

  check('the store survives a real page reload',
    reloaded.store.xp === written.xp
    && reloaded.store.level === written.level
    && reloaded.store.reigns === written.reigns
    && reloaded.store.traits.join(',') === written.traits.join(','),
    `xp ${reloaded.store.xp}, level ${reloaded.store.level}, traits ${reloaded.store.traits.join('/')}`);
  check('the founder snapshot and house survive',
    reloaded.store.founder?.name === 'Trần Quốc Tuấn' && reloaded.store.house === 'Trần');
  check('a chosen trait is still in force after the reload', reloaded.owns === true);

  const garbage = await trip.evaluate(async () => {
    const out = {};
    const d = await import('/src/state/dynasty.ts');
    const junk = [
      '', '{', 'null', '[]', '"a string"', '{"traits":"wide-draft"}',
      // The hang: an infinite level walked the curve for ever.
      '{"xp":{"a":1},"level":1e999}',
      '{"xp":1e999,"level":1e999,"pendingPicks":1e999,"reigns":-5,"respecs":"x"}',
    ];
    for (const text of junk) {
      localStorage.setItem('mandate:dynasty:v1', text);
      try {
        const s = d.getDynasty();
        const p = d.dynastyProgress(s);
        out[text.slice(0, 24) || '(empty)'] = `${s.xp}/${s.level}/${s.traits.length}/${s.pendingPicks}/${p.need}`;
      } catch (err) {
        out[text.slice(0, 24) || '(empty)'] = `THREW ${err.message}`;
      }
    }
    return out;
  });
  // Every one must reduce to a fresh house, and `dynastyProgress` must return a finite next step.
  const allDefault = Object.values(garbage).every((v) => v === '0/0/0/0/2000');
  check('every shape of garbage falls back to defaults and terminates', allDefault,
    JSON.stringify(garbage));
  check('the round-trip page raises no error', tripErrors.length === 0, tripErrors.slice(0, 3).join(' | '));
  await trip.close();
}

// ── 7. Renouncing asks twice ────────────────────────────────────────────────
//
// Driven through real taps, not by calling the handler: the point of the confirm is that the first
// press does not fire, and only the input path can prove that. **No `deviceScaleFactor` here** —
// at 2 the canvas backing store doubles while CSS stays 390, so a game coordinate divided by
// `scale.displayScale` lands off the right edge and every tap silently misses.
console.log('\n=== RESPEC ===');
{
  const seat = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const seatErrors = [];
  seat.on('pageerror', (e) => seatErrors.push(`PAGEERROR: ${e.message}`));
  seat.on('console', (m) => { if (m.type() === 'error') seatErrors.push(`CONSOLE: ${m.text()}`); });
  await seat.addInitScript(() => {
    localStorage.setItem('mandate:language:v1', 'en');
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({
      xp: 22400, level: 7, traits: ['wide-draft', 'quartermaster', 'deep-shelf', 'old-roads'],
      pendingPicks: 0, reigns: 4, bestScore: 8120, respecs: 0,
      founder: { id: 'h-le', name: 'Lê Duyệt', type: 'general', sex: 'man', era: 'le' },
      house: 'Lê Duyệt',
    }));
    localStorage.setItem('mandate:legacy:v1', JSON.stringify({
      points: 640, bestScore: 8120, ascensions: 1, perks: [], codes: ['confucian'],
    }));
  });
  await seat.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await seat.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await seat.waitForTimeout(1200);

  // Read the display list for the row's own bounds; a fixed offset taps the gap between two rows.
  const findRespec = () => seat.evaluate(() => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    for (const obj of menu.content) {
      if (!obj.list) continue;
      const text = obj.list.find((part) => part.type === 'Text');
      if (text && /Renounce/i.test(text.text)) {
        const b = obj.getBounds();
        return { label: text.text, x: b.centerX, y: b.centerY };
      }
    }
    return null;
  });
  const noteText = () => seat.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').content
    .filter((o) => o.type === 'Text' && /ascension|table|biography/i.test(o.text))
    .map((o) => o.text).join(' | '));
  const goto = (mode) => seat.evaluate((m) => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    menu.mode = m;
    menu.render();
  }, mode);
  const readStore = () => seat.evaluate(async () => (await import('/src/state/dynasty.ts')).getDynasty());

  await goto('dynasty');
  await seat.waitForTimeout(400);

  // Game coordinates to page pixels, measured off the DOM rather than off the ScaleManager.
  //
  // `page.mouse` works in CSS pixels and neither ScaleManager rectangle reliably reports them:
  // `displaySize` is the backing store (double under a deviceScaleFactor of 2) and `canvasBounds`
  // came back at *half* the sheet under that same setting. Either way the derived coordinate lands
  // somewhere the button is not, the click hits nothing, and the check passes vacuously. The canvas
  // element's own bounding box is the space the mouse is actually in.
  const box = await seat.locator('canvas').boundingBox();
  const sheet = await seat.evaluate(() => window.__phaserGame.scale.gameSize.width);
  const frame = { ox: box.x, oy: box.y, k: box.width / sheet };
  const tap = async (point) => {
    await seat.mouse.click(frame.ox + point.x * frame.k, frame.oy + point.y * frame.k);
    await seat.waitForTimeout(400);
  };

  const resting = await findRespec();
  check('the respec row is drawn at rest',
    Boolean(resting) && !/tap again/i.test(resting.label), resting?.label);
  check('the resting note says what it costs', /per ascension/i.test(await noteText()));

  await tap(resting);
  const armed = await findRespec();
  const afterFirst = await readStore();
  check('one tap arms rather than fires', /tap again/i.test(armed?.label ?? ''), armed?.label);
  check('the armed row warns what is lost', /table/i.test(await noteText()));
  check('one tap changes nothing in the store',
    afterFirst.traits.length === 4 && afterFirst.respecs === 0,
    `${afterFirst.traits.length} traits, ${afterFirst.respecs} respecs`);

  // An armed destructive control must never survive a navigation and be waiting, half-pressed.
  await goto('main');
  await goto('dynasty');
  await seat.waitForTimeout(400);
  const returned = await findRespec();
  check('leaving the page disarms it',
    Boolean(returned) && !/tap again/i.test(returned.label), returned?.label);

  await tap(returned);
  await tap(await findRespec());
  const afterSecond = await readStore();
  check('the second tap renounces, refunds the picks and spends the respec',
    afterSecond.traits.length === 0 && afterSecond.pendingPicks === 4 && afterSecond.respecs === 1,
    `${afterSecond.traits.length} traits, ${afterSecond.pendingPicks} picks, ${afterSecond.respecs} respecs`);

  // Nothing left to renounce: the row goes entirely rather than standing there disabled. A
  // control for an action with no object is noise.
  await goto('main');
  await goto('dynasty');
  await seat.waitForTimeout(400);
  check('with no traits held the row is not drawn at all', (await findRespec()) === null);

  // Traits held but no ascension banked: the row stands, refuses, and says how one is earned.
  await seat.evaluate(() => {
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({
      xp: 22400, level: 7, traits: ['wide-draft', 'quartermaster'],
      pendingPicks: 0, reigns: 4, bestScore: 8120, respecs: 0,
    }));
    localStorage.setItem('mandate:legacy:v1', JSON.stringify({
      points: 640, bestScore: 8120, ascensions: 0, perks: [], codes: [],
    }));
  });
  await goto('main');
  await goto('dynasty');
  await seat.waitForTimeout(400);
  const owed = await findRespec();
  check('with none owed the row says how another is earned',
    /ascending|biography/i.test(await noteText()), await noteText());
  await tap(owed);
  const refused = await readStore();
  check('with none owed a tap neither arms nor fires',
    !/tap again/i.test((await findRespec())?.label ?? '')
    && refused.traits.length === 2 && refused.respecs === 0,
    `${refused.traits.length} traits, ${refused.respecs} respecs`);
  check('the respec page raises no error', seatErrors.length === 0, seatErrors.slice(0, 3).join(' | '));
  await seat.close();
}

// ── 8. Vietnamese boots ─────────────────────────────────────────────────────
//
// Key parity is a compile-time guarantee (`satisfies Record<keyof typeof enAscent, string>`), but
// `validateCatalogs()` throws at *module scope* — so only a real boot in vi proves the invariant.
console.log('\n=== VIETNAMESE ===');
{
  const vi = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const viErrors = [];
  vi.on('pageerror', (e) => viErrors.push(`PAGEERROR: ${e.message}`));
  vi.on('console', (m) => { if (m.type() === 'error') viErrors.push(`CONSOLE: ${m.text()}`); });
  // Set before navigation: the language is read at import time, so an afterwards is too late.
  // A populated house too, or the sheet falls to its never-played branch and the Vietnamese the
  // full page is actually built out of — the longest strings in the catalog — is never drawn.
  await vi.addInitScript(() => {
    localStorage.setItem('mandate:language:v1', 'vi');
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({
      xp: 22400, level: 7, traits: ['wide-draft', 'quartermaster', 'deep-shelf', 'old-roads'],
      pendingPicks: 1, reigns: 4, bestScore: 8120, respecs: 0,
      founder: { id: 'h-le', name: 'Lê Duyệt', type: 'general', sex: 'man', era: 'le' },
      house: 'Lê Duyệt',
    }));
    localStorage.setItem('mandate:legacy:v1', JSON.stringify({
      points: 640, bestScore: 8120, ascensions: 1, perks: [], codes: ['confucian'],
    }));
  });
  await vi.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  const booted = await vi.waitForFunction(
    () => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  await vi.waitForTimeout(1000);
  await vi.evaluate(() => window.__startBenchGame(1337, 'ascent'));
  const ran = await vi.waitForFunction(
    () => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  await vi.waitForTimeout(800);
  const sheetDrew = await vi.evaluate(() => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    try {
      menu.mode = 'dynasty';
      menu.render();
      return menu.content.length;
    } catch {
      return -1;
    }
  });
  check('the game boots in Vietnamese and reaches a run', booted && ran);
  // The full sheet, not the never-played branch: portrait, bar, eight chips, record and respec.
  check('the full dynasty sheet draws in Vietnamese', sheetDrew > 30, `${sheetDrew} objects`);
  // Nothing may overflow the sheet in the longer language — the back bar is the last thing on the
  // page and it must still be inside it.
  const viFits = await vi.evaluate(() => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    const height = window.__phaserGame.scale.gameSize.height;
    let lowest = 0;
    for (const obj of menu.content) {
      const b = obj.getBounds?.();
      if (b) lowest = Math.max(lowest, b.bottom);
    }
    return { lowest: Math.round(lowest), height };
  });
  check('the Vietnamese sheet fits the sheet', viFits.lowest <= viFits.height,
    `lowest ${viFits.lowest} of ${viFits.height}`);
  check('the Vietnamese boot raises no error', viErrors.length === 0, viErrors.slice(0, 3).join(' | '));
  await vi.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the ledger banks, the ceremony walks, and every trait is read where it says it is'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
