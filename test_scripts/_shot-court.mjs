// Throwaway: shoot the ascent court screen so the new authority/estates block can be looked at.
//
// Modelled on shot-ascent-core.mjs, which is the path that actually works: prompts are answered
// through `resolveAscentPrompt` and every mutation is followed by a `state-changed` emit. Hand
// -ticking `advanceAscentTick` off to the side leaves the scene latched on the founding card —
// its `openPromptKey` never reconciles and the shot comes back showing Year 1.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
mkdirSync('output/decree', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

const kind = () => page.evaluate(() => window.__mandateState.pendingAscentPrompt?.kind ?? null);
const answer = () => page.evaluate(async () => {
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const st = window.__mandateState;
  const p = st.pendingAscentPrompt;
  if (!p) return;
  const pick = (() => {
    switch (p.kind) {
      case 'mandate': case 'founder': case 'doctrine': return p.options[0]?.id ?? p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': return p.target?.methods?.[0]?.method ?? 'cancel';
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0]?.id ?? 'reserve';
      case 'law-choice': return 'hold';
      default: return 'skip';
    }
  })();
  if (!resolveAscentPrompt(st, pick)) st.ascent.promptQueue.shift();
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});

// Play far enough that the realm has provinces and the court has something to show.
for (let i = 0; i < 26; i += 1) {
  if (await page.evaluate(() => window.__mandateState?.isDefeated)) break;
  const k = await kind();
  // `run-over` reloads the page out from under the harness — resolving it destroys the execution
  // context and every later evaluate throws. Stop at the Reckoning instead of answering it.
  if (k === 'run-over') break;
  // Some resolutions end the run and reload the page, which destroys the execution context and
  // makes every later evaluate throw. Stop on that rather than crashing the harness.
  if (k) { try { await answer(); } catch { break; } continue; }
  await page.evaluate(() => window.advanceTime(3600));
}

// Hand-place a court worth looking at: points on hand, three standing laws, one estate in open
// grievance so the crisis line renders too.
const info = await page.evaluate(async () => {
  const { enactProject } = await import('/src/systems/empire/EdictSystem.ts');
  const D = await import('/src/systems/DecreeSystem.ts');
  const st = window.__mandateState;
  st.mandate.edictPoints = 8;
  for (const id of ['levy-reform', 'land-survey', 'meritocracy']) enactProject(st, id);
  st.mandate.estates.nong = 22;
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
  return {
    turn: st.turn,
    lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
    edicts: st.mandate.edicts.length,
    weight: D.standingWeight(st),
    cap: D.authorityCap(st),
    obedience: Math.round(D.averageCompliance(st)),
  };
});
console.log('state', JSON.stringify(info));

// `openLane` refuses to open while `state.pendingAscentPrompt` is set, so clear the live card and
// the queue behind it before asking for the lane. Freezing the world too, or the next tick raises
// another card and takes the screen straight back.
await page.evaluate(() => {
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  st.isStrategyPause = true;
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await page.waitForTimeout(200);
await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').openLane('court'));
await page.waitForTimeout(500);
await page.screenshot({ path: 'output/decree/court.png' });

const lane = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const found = [];
  const walk = (o) => {
    if (!o) return;
    if (o.type === 'Text' && o.text) found.push(o.text);
    if (o.list) o.list.forEach(walk);
  };
  walk(ui.modalLayer);
  return { key: ui.openPromptKey, texts: found };
});
console.log('promptKey:', lane.key);
console.log('lane text:', lane.texts.join(' | '));
console.log('shot -> output/decree/court.png');
await browser.close();
