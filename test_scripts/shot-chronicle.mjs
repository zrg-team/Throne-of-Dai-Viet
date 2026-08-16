// Renders the Chronicle's two surfaces to disk so they can be looked at.
//
// Model tests proved the story system runs; they cannot prove a screen draws or a button works.
// This drives a real run until a story card is live, shoots it, then opens the Chronicle lane
// from the action bar the way a player would and shoots that.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('test_scripts/shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

await page.goto('http://localhost:5173/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

// Build a run that has a story card open, then hand it to the live scene.
const report = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');

  let s = 20260816 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const choice = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': {
        const open = p.target.methods.filter((m) => !m.blockedReason);
        return open.length ? open[0].method : 'back';
      }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': return 'decline';
      default: return (p.options?.find((o) => o.affordable) ?? p.options?.[0])?.id ?? 'ok';
    }
  };

  let found = null;
  for (let i = 0; i < 400 && !found; i += 1) {
    advanceAscentTick(st);
    let guard = 0;
    while (st.pendingAscentPrompt && guard < 8) {
      guard += 1;
      const p = st.pendingAscentPrompt;
      if (p.kind === 'story-beat') { found = { templateId: p.templateId, fragmentId: p.fragmentId, volume: p.volume }; break; }
      if (p.kind === 'run-over') break;
      resolveAscentPrompt(st, choice(p));
    }
  }

  window.__shotState = st;
  return {
    found,
    chronicle: (st.chronicle ?? []).length,
    live: (st.stories ?? []).length,
    turn: st.turn,
  };
});

console.log('run:', JSON.stringify(report));

// Hand the prepared state to the real scenes and let them draw it.
await page.evaluate(async () => {
  const game = window.__phaserGame;
  game.scene.start('ConquestScene', { state: window.__shotState });
});
await page.waitForTimeout(3000);
await page.screenshot({ path: 'test_scripts/shots/chronicle-card.png' });
console.log('wrote test_scripts/shots/chronicle-card.png');

// Now the lane. Built as a *separate* run driven past its story cards, because the action bar
// hides itself whenever a prompt owns the modal layer — the bar cannot be pressed from the card.
await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');

  let s = 20260816 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const choice = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': {
        const open = p.target.methods.filter((m) => !m.blockedReason);
        return open.length ? open[0].method : 'back';
      }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': return 'decline';
      default: return (p.options?.find((o) => o.affordable) ?? p.options?.[0])?.id ?? 'ok';
    }
  };

  // Long enough that several stories have run their course and been recorded.
  for (let i = 0; i < 220; i += 1) {
    advanceAscentTick(st);
    let guard = 0;
    while (st.pendingAscentPrompt && guard < 8) {
      guard += 1;
      if (st.pendingAscentPrompt.kind === 'run-over') break;
      resolveAscentPrompt(st, choice(st.pendingAscentPrompt));
    }
    if (st.isDefeated) break;
  }
  // Answer anything still open so the bar is reachable.
  let guard = 0;
  while (st.pendingAscentPrompt && guard < 10) {
    guard += 1;
    resolveAscentPrompt(st, choice(st.pendingAscentPrompt));
  }
  st.isPaused = false;
  window.__laneState = st;
  window.__laneReport = {
    chronicle: (st.chronicle ?? []).length,
    live: (st.stories ?? []).length,
    pending: st.pendingAscentPrompt?.kind ?? null,
  };
});

const laneReport = await page.evaluate(() => window.__laneReport);
console.log('lane state:', JSON.stringify(laneReport));

await page.evaluate(() => {
  window.__phaserGame.scene.start('ConquestScene', { state: window.__laneState });
});
await page.waitForTimeout(2500);

// Ask the bar itself where its button is, rather than guessing a coordinate.
const slot = await page.evaluate(async () => {
  const { actionBarSlots } = await import('/src/ui/ActionBar.ts');
  const found = actionBarSlots('ascent', {}).find((sl) => sl.action === 'chronicle');
  return found ? { x: found.x + found.width / 2 } : null;
});
if (!slot) throw new Error('no chronicle button on the action bar');

await page.mouse.click(slot.x, 844 - 18);
await page.waitForTimeout(1400);
await page.screenshot({ path: 'test_scripts/shots/chronicle-lane.png' });
console.log(`wrote test_scripts/shots/chronicle-lane.png (button at x=${Math.round(slot.x)})`);

// The story page: one story, whole — its people, what has happened, what hangs, what can be
// done. Driven through the scene's own entry point; the tap path from the lane list is already
// exercised by verify-chronicle.
const storyShot = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = window.__laneState;
  const withHistory = (st.stories ?? []).filter((s) => s.spoken.length > 0)
    .sort((a, b) => b.spoken.length - a.spoken.length)[0];
  if (!withHistory) return null;
  ui.showStoryPage(withHistory.id);
  return { id: withHistory.id, spoken: withHistory.spoken.length };
});
await page.waitForTimeout(900);
if (storyShot) {
  await page.screenshot({ path: 'test_scripts/shots/story-page.png' });
  console.log(`wrote test_scripts/shots/story-page.png (${storyShot.id}, ${storyShot.spoken} beats)`);
} else {
  console.log('no spoken story to shoot — story-page.png NOT written');
}

// The ledger: gross, demand, net, and where it is short. Through the real lane opener — the
// scene guards the header tap against an open overlay, so calling the drawer directly would
// stack it over the story page, which no player can do.
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeOverlay?.() ?? (ui.openPromptKey = '');
  ui.modalLayer.removeAll(true);
  ui.openLane('ledger');
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'test_scripts/shots/ledger.png' });
console.log('wrote test_scripts/shots/ledger.png');

if (errors.length) console.log('ERRORS:', errors.slice(0, 4).join(' | '));
await browser.close();
