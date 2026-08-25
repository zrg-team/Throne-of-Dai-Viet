// No card may remove another card.
//
// The queue's old rule was "only one prompt of a kind can be outstanding", and a second was
// dropped on the floor. From the throne that reads as the game deciding something needed you and
// then quietly deciding it did not: two champions arrive and you are asked about one, a second
// province revolts and nobody says so.
//
// This is a unit-level guarantee and is tested as one. A seeded run rarely collides — the world
// pauses while a card is up, so the queue seldom gets deeper than one — which is exactly why the
// defect survived: it almost never showed, and lost a real decision when it did.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto((process.env.DEV_URL ?? 'http://127.0.0.1:5179') + '/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { enqueueAscentPrompt, drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');

  let s = 20260808 >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const fresh = () => {
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.pendingAscentPrompt = undefined;
    st.ascent.promptQueue = [];
    return st;
  };
  const court = (id) => ({ kind: 'court-appointment', options: [{ id, label: id }], seat: 'chancellor' });
  const hero = (id) => ({ kind: 'hero-choice', heroIds: [id], source: 'summon' });
  const drainAll = (st) => {
    const seen = [];
    for (let i = 0; i < 20; i += 1) {
      drainAscentPrompts(st);
      if (!st.pendingAscentPrompt) break;
      seen.push(st.pendingAscentPrompt);
      st.pendingAscentPrompt = undefined;
    }
    return seen;
  };

  const r = {};

  // Two distinct requests of the same kind, queued back to back.
  {
    const st = fresh();
    enqueueAscentPrompt(st, court('a'));
    enqueueAscentPrompt(st, court('b'));
    enqueueAscentPrompt(st, hero('h1'));
    r.distinct = { queued: st.ascent.promptQueue.length, seen: drainAll(st).map((p) => p.options?.[0]?.id ?? p.heroIds?.[0]) };
  }

  // A second arriving while the first is already on screen must wait, not vanish.
  {
    const st = fresh();
    enqueueAscentPrompt(st, court('live'));
    drainAscentPrompts(st);
    const liveId = st.pendingAscentPrompt?.options?.[0]?.id;
    enqueueAscentPrompt(st, court('arrived-while-open'));
    r.whileOpen = { live: liveId, stillQueued: st.ascent.promptQueue.length };
    st.pendingAscentPrompt = undefined;
    r.whileOpen.seenAfter = drainAll(st).map((p) => p.options?.[0]?.id);
  }

  // Recomputed kinds supersede rather than pile up: two conquest lists are one question.
  {
    const st = fresh();
    enqueueAscentPrompt(st, { kind: 'conquer-target', targets: [{ landId: 'old' }] });
    enqueueAscentPrompt(st, { kind: 'conquer-target', targets: [{ landId: 'new' }] });
    r.superseded = { queued: st.ascent.promptQueue.length,
                     survivor: st.ascent.promptQueue[0]?.targets?.[0]?.landId };
  }

  // The cap: past it the OLDEST gives way, so what waits is what is still true.
  {
    const st = fresh();
    for (const id of ['1', '2', '3', '4', '5']) enqueueAscentPrompt(st, court(id));
    r.capped = { queued: st.ascent.promptQueue.length,
                 survivors: st.ascent.promptQueue.map((p) => p.options[0].id) };
  }

  // Priority still orders them: a wave result outranks a court seat.
  {
    const st = fresh();
    enqueueAscentPrompt(st, court('seat'));
    enqueueAscentPrompt(st, { kind: 'wave-result', wave: 1, held: true });
    r.ordered = drainAll(st).map((p) => p.kind);
  }

  // The one card allowed to take the screen: there is nothing left to answer.
  {
    const st = fresh();
    enqueueAscentPrompt(st, court('seat'));
    drainAscentPrompts(st);
    enqueueAscentPrompt(st, { kind: 'run-over', score: 1, legacyEarned: 0, cause: 'annihilated' });
    r.runOver = { live: st.pendingAscentPrompt?.kind ?? null, queued: st.ascent.promptQueue.map((p) => p.kind) };
  }

  return r;
});
await browser.close();

let pass = 0, fail = 0;
const check = (name, ok, note = '') => {
  console.log(`${ok ? ' ok  ' : 'FAIL '} ${name}${note ? '  — ' + note : ''}`);
  ok ? pass++ : fail++;
};

check('two distinct requests of one kind both survive', out.distinct.seen.includes('a') && out.distinct.seen.includes('b'),
  out.distinct.seen.join(', '));
check('a third kind queues alongside them', out.distinct.seen.includes('h1'));
check('one arriving while another is on screen waits rather than vanishing',
  out.whileOpen.stillQueued === 1 && out.whileOpen.seenAfter.includes('arrived-while-open'),
  `live ${out.whileOpen.live}, then ${out.whileOpen.seenAfter.join(', ')}`);
check('a recomputed question supersedes instead of piling up',
  out.superseded.queued === 1 && out.superseded.survivor === 'new',
  `${out.superseded.queued} queued, kept "${out.superseded.survivor}"`);
check('the queue is capped and the oldest gives way',
  out.capped.queued === 3 && out.capped.survivors.join('') === '345',
  out.capped.survivors.join(', '));
check('priority still decides what is asked first', out.ordered[0] === 'wave-result', out.ordered.join(' → '));
check('the Reckoning is still allowed to take the screen',
  out.runOver.live === null && out.runOver.queued.join('') === 'run-over');
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(`\n${pass}/${pass + fail} checks passed`);
console.log(fail === 0 ? 'PASS: cards stack; nothing the player was going to be asked is thrown away'
                       : 'FAIL: a decision can still be dropped');
process.exit(fail === 0 ? 0 : 1);
