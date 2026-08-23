// Proves the whisper line draws.
//
// Ascent never rendered whispers at all: `pushToast` writes `state.message` / `toasts` /
// `eventLog`, all three read only by `UIScene`, and Ascent runs `ConquestUIScene`. A model test
// can show a whisper *fired*; only a screenshot can show it reached a player. That distinction is
// the entire bug this file exists to guard.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('test_scripts/shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

await page.goto((process.env.DEV_URL ?? 'http://localhost:5173') + '/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

// A run far enough in to have live stories, with no card owning the screen.
const report = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');

  let s = 20260816 >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st.ascent.autoResolveBattles = true;
  const choice = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': { const o = p.target.methods.filter((m) => !m.blockedReason); return o.length ? o[0].method : 'back'; }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': return 'decline';
      default: return (p.options?.find((o) => o.affordable) ?? p.options?.[0])?.id ?? 'ok';
    }
  };
  for (let i = 0; i < 120 && !st.isDefeated; i += 1) {
    advanceAscentTick(st);
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 8) {
      if (st.pendingAscentPrompt.kind === 'run-over') break;
      resolveAscentPrompt(st, choice(st.pendingAscentPrompt));
    }
  }
  // Clear anything holding the modal layer so the strip has the screen to itself.
  st.pendingAscentPrompt = undefined;
  if (st.ascent) { st.ascent.promptQueue = []; st.ascent.pendingAftermath = undefined; }
  st.lastStoryOutcome = undefined;
  window.__shotState = st;
  return { turn: st.turn, live: (st.stories ?? []).length,
           logWithRef: (st.eventLog ?? []).filter((e) => e.ref).length };
});
console.log('run:', JSON.stringify(report));

await page.evaluate(() => {
  window.__phaserGame.scene.start('ConquestScene', { state: window.__shotState });
});
await page.waitForTimeout(2500);

// Push a whisper through the real path — `whisper()` → `pushToast` with a story ref — and let the
// live scene draw it. Nothing here reaches into the strip; it only speaks and waits.
const spoke = await page.evaluate(async () => {
  const { pushToast } = await import('/src/systems/empire/notifications.ts');
  const { storyText } = await import('/src/i18n/story.ts').catch(() => import('/src/i18n/story/index.ts'));
  const game = window.__phaserGame;
  const scene = game.scene.getScene('ConquestUIScene');
  const st = scene?.state ?? window.__shotState;
  const story = (st.stories ?? [])[0];
  if (!story) return { ok: false, why: 'no live story' };
  const line = storyText(`${story.templateId}.${story.spoken[story.spoken.length - 1] ?? ''}.line`, {});
  const text = line.includes('.') && line.split('.').length > 2
    ? 'Có người ở ngoài cổng từ sáng, không chịu về.'
    : line;
  pushToast(st, text, 'info', { storyId: story.id, templateId: story.templateId, fragmentId: story.spoken[0] ?? 'x' });
  scene?.refresh?.();
  return { ok: true, text, template: story.templateId };
});
console.log('spoke:', JSON.stringify(spoke));

// The strip fades in over ~420ms and holds ~4.5s.
await page.waitForTimeout(1200);
await page.screenshot({ path: 'test_scripts/shots/whisper-line.png' });
console.log('wrote test_scripts/shots/whisper-line.png');

// Is anything actually on screen? Ask the scene for the strip's own bounds.
const visible = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const bounds = scene?.whispers?.tapBounds?.() ?? [];
  return { bounds, hasStrip: Boolean(scene?.whispers) };
});
console.log('strip:', JSON.stringify(visible));

// And the permanent half: the Chronicle's "Đã nghe" list.
await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene?.showChronicleScreen?.();
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'test_scripts/shots/whisper-heard.png' });
console.log('wrote test_scripts/shots/whisper-heard.png');

await browser.close();
if (errors.length) console.log('ERRORS:', errors.slice(0, 3).join(' | '));
console.log(visible.bounds.length > 0
  ? 'PASS: the whisper strip is on screen and occupies real pixels'
  : 'FAIL: nothing drawn — the strip is not rendering');
