// The manual's "play a guided run" button: does it reach a real run, and does the coach follow it?
//
// Driven the way a player drives it — front page, How to Play, press the button — because the
// whole feature is a handoff across three scenes (GuideScene starts ConquestScene, which launches
// ConquestUIScene, which reads a module flag neither of them carries) and every part that can
// break is in the seams rather than in any one of them.
//
// No `?tour=1` here on purpose. A guided run must coach a *driven* browser too, or the flag is not
// really doing what it claims: `hasSeenRunTour` refuses under `navigator.webdriver`, and the guided
// path is supposed to bypass that refusal because the player explicitly asked for it.
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

/** The world-position of the first button on a scene whose label matches. */
const buttonAt = (sceneKey, pattern) => page.evaluate(([key, source]) => {
  const scene = window.__phaserGame.scene.getScene(key);
  const re = new RegExp(source);
  const walk = (list) => {
    for (const child of list ?? []) {
      const label = child.list?.find?.((k) => k.type === 'Text' && re.test(k.text));
      if (label) {
        const m = label.getWorldTransformMatrix();
        return { x: m.tx, y: m.ty };
      }
      const deeper = child.list ? walk(child.list) : null;
      if (deeper) return deeper;
    }
    return null;
  };
  return walk(scene?.children?.list);
}, [sceneKey, pattern]);

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(1200);

// ── Front page → How to Play ────────────────────────────────────────────────
const howTo = await buttonAt('MenuScene', 'How to Play');
check('the front page has a How to Play door', Boolean(howTo));
if (!howTo) { await browser.close(); process.exit(1); }
await page.mouse.click(howTo.x, howTo.y);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('GuideScene'), null, { timeout: 8000 })
  .catch(() => check('How to Play opens', false));
await page.waitForTimeout(700);

// ── The guided-run button, on the tab the reader lands on ───────────────────
const play = await buttonAt('GuideScene', 'Play a guided run');
check('the manual offers a guided run on the tab it opens', Boolean(play));
if (!play) { await browser.close(); process.exit(1); }

await page.mouse.click(play.x, play.y);
const reached = await page.waitForFunction(
  () => window.__phaserGame.scene.isActive('ConquestUIScene'),
  null,
  { timeout: 20000 },
).then(() => true).catch(() => false);
check('pressing it starts a real Dragon Ascent run', reached);
await page.waitForTimeout(1500);

// The run opens behind its own cards; answer them the way the other ascent scripts do.
const barUp = () => page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
  .children.list.some((c) => c.constructor?.name === 'ActionBar' && c.visible));
for (let guard = 0; guard < 24 && !(await barUp()); guard += 1) {
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    if (!scene.openPromptKey) return;
    scene.events.emit('ui:ascent-choice', String(scene.openPromptKey).split(',').pop() || 'ok');
  });
  await page.waitForTimeout(500);
}
check('the run reaches a playable frame', await barUp());

const guided = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  return { guidedRun: scene.guidedRun, tourUp: Boolean(scene.runTour), shown: [...scene.tourStagesShown] };
});
check('the run knows it is a guided one', guided.guidedRun === true, JSON.stringify(guided));
check('the coach started on the opening cards', guided.shown.length > 0, JSON.stringify(guided));

/** Presses whatever the tour's forward button says until the card is gone. */
const closeTour = async () => {
  for (let guard = 0; guard < 10; guard += 1) {
    const gone = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      if (!scene.runTour) return true;
      for (const child of scene.children.list) {
        const label = child.list?.find?.((k) => k.type === 'Text'
          // Every label the forward button can carry: mid-walkthrough cards finish with
          // "Got it", and only the map-and-bar stage offers to start playing.
          && /^(Next|Got it|Start playing|Tiếp|Đã rõ|Vào chơi)$/.test(k.text));
        if (label) {
          child.list.find((k) => k.type === 'Rectangle')
            ?.emit('pointerup', { id: 7, downTime: 0 }, 0, 0, { stopPropagation() {} });
          return false;
        }
      }
      return false;
    });
    if (gone) return true;
    await page.waitForTimeout(200);
  }
  return page.evaluate(() => !window.__phaserGame.scene.getScene('ConquestUIScene').runTour);
};
check('the opening cards can all be dismissed', await closeTour());

// ── The world stops while a card is being read ──────────────────────────────
//
// The fault this guards: a stage is chosen against the screen as it is when the stage opens, but
// the `Copilot` then runs its own steps to the end without asking again. With the clock still
// turning underneath, a doctrine card could arrive on card two of four — and card three would go
// on to explain the action bar while pointing at a bar that card had hidden. Measured before the
// fix: the coach described one screen while the player was looking at another.
const halted = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.tourStagesShown.clear();
  scene.state.isStrategyPause = false;
  scene.openPromptKey = '';
  scene.renderActionBar();
  const duringCard = scene.state.isStrategyPause;
  return { raised: Boolean(scene.runTour), duringCard };
});
check('a coach card stops the clock', halted.raised && halted.duringCard === true,
  JSON.stringify(halted));
await closeTour();
const released = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
  .state.isStrategyPause);
check('and hands it back when the card closes', released === false, String(released));

// A player who stopped the clock themselves must not find it running again afterwards.
const kept = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.tourStagesShown.clear();
  scene.state.isStrategyPause = true;
  scene.renderActionBar();
  return Boolean(scene.runTour);
});
check('a card was raised over a paused run', kept);
await closeTour();
const stillPaused = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
  .state.isStrategyPause);
check('a pause the player set themselves survives the card', stillPaused === true);
await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.state.isStrategyPause = false;
  scene.tourStagesShown.clear();
});

// ── The staged moments, walked in the order a run reaches them ──────────────
//
// Forced rather than waited for: `muster` needs the first wave two seasons out and `aftermath` a
// wave survived, which is minutes of real clock. The condition is what is under test.
//
// Each pass closes the standing card FIRST. Without that the checks read one stage behind — the
// coach raises one card per frame, so a pass that leaves the previous one up simply returns it
// again, and every assertion after the first fails for a reason that is entirely the harness's.
const stage = async (setup) => {
  await closeTour();
  await page.evaluate((source) => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    // eslint-disable-next-line no-new-func
    new Function('scene', 'state', 'ascent', source)(scene, scene.state, scene.state.ascent);
    scene.renderActionBar();
  }, setup);
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    return { up: Boolean(scene.runTour), shown: [...scene.tourStagesShown] };
  });
};

let seen = await stage('');
check('a clear frame raises the map-and-bar walkthrough',
  seen.shown.includes('opening'), JSON.stringify(seen.shown));

seen = await stage('scene.promptsAnswered = 1;');
check('answering a decision raises the decision card',
  seen.shown.includes('decision'), JSON.stringify(seen.shown));

seen = await stage('ascent.wave = 0; ascent.ticksToWave = 2;');
check('the first muster raises the muster card',
  seen.shown.includes('muster'), JSON.stringify(seen.shown));

seen = await stage('ascent.wavesSurvived = 1;');
check('surviving a wave raises the aftermath card',
  seen.shown.includes('aftermath'), JSON.stringify(seen.shown));

seen = await stage('scene.promptsAnswered = 4; ascent.wavesSurvived = 3;');
check('no stage fires twice', seen.up === false, JSON.stringify(seen));

const overCard = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.tourStagesShown.clear();
  ['mandate', 'founder', 'court'].forEach((id) => scene.tourStagesShown.add(id));
  scene.openPromptKey = 'law-choice:probe';
  scene.renderActionBar();
  const raised = Boolean(scene.runTour);
  scene.openPromptKey = '';
  return raised;
});
check('no map-or-bar stage fires while a card owns the screen', overCard === false);

// ── The walkthrough opens on the very first card, not after it ──────────────
//
// The whole complaint that produced this stage: a new player's first screen is the throne card,
// asking a permanent question about three options they have never seen, and the coach used to wait
// for a clear frame — so it opened by explaining the readout band to somebody who had already
// guessed. `?tour=1` is needed because a first run is what is under test and `hasSeenRunTour`
// refuses under `navigator.webdriver`.
const first = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const firstErrors = [];
first.on('pageerror', (e) => firstErrors.push(e.message));
first.on('console', (m) => { if (m.type() === 'error') firstErrors.push(m.text()); });
await first.goto(`${BASE}/?capture=1&tour=1`, { waitUntil: 'domcontentloaded' });
await first.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
await first.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await first.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
await first.waitForTimeout(1800);

const onFirstCard = await first.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  return {
    promptKey: scene.openPromptKey,
    tourUp: Boolean(scene.runTour),
    shown: [...scene.tourStagesShown],
    stages: scene.tourStages().map((s) => s.id),
  };
});
check('the very first thing on screen is a decision card',
  onFirstCard.promptKey.startsWith('mandate'), onFirstCard.promptKey);
check('the coach is already up over it, with nothing to wait for',
  onFirstCard.tourUp && onFirstCard.shown.includes('mandate'), JSON.stringify(onFirstCard));
check('the walkthrough is more than the opening four',
  onFirstCard.stages.length >= 7, JSON.stringify(onFirstCard.stages));
check('it covers the throne, the founder and the court appointment',
  ['mandate', 'founder', 'court'].every((id) => onFirstCard.stages.includes(id)),
  JSON.stringify(onFirstCard.stages));

// Marking the tour seen must not switch off the rest of this run's stages — it did, and a player
// got exactly one card ever.
const keepsGoing = await first.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.runTourDone = true;              // what closing the first card does
  scene.openPromptKey = 'founder:probe';
  scene.renderActionBar();
  return { tourUp: Boolean(scene.runTour), shown: [...scene.tourStagesShown] };
});
check('a stage closing does not end the walkthrough',
  keepsGoing.tourUp && keepsGoing.shown.includes('founder'), JSON.stringify(keepsGoing));

// And the map/bar stages still wait for a frame the player can actually see.
const waitsForClear = await first.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.tourStagesShown.add('court');
  scene.openPromptKey = 'law-choice:probe';   // a card with no stage of its own
  scene.renderActionBar();
  const raised = Boolean(scene.runTour);
  scene.openPromptKey = '';
  return raised;
});
check('a stage about the map does not speak over a card', waitsForClear === false);

firstErrors.forEach((e) => errors.push(`first-run: ${e}`));
await first.close();

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${passed}/${passed + failed} checks passed`);
console.log(failed
  ? 'FAIL: the guided run does not reach the game or does not coach it'
  : 'PASS: the manual opens a real run and coaches it step by step');
process.exit(failed ? 1 : 0);
