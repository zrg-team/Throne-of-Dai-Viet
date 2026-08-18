// Verifies the Chronicle (Sử Ký) — the salience-based story system in Dragon Ascent.
//
// Drives real runs through the real tick, because the whole feature is about reading live state:
// a test that called the story model directly could not tell you whether a story ever actually
// speaks during play. That distinction has cost this project before — a passing suite for a Build
// screen whose rows were dead, because every test called the screen's methods instead of pressing
// its buttons.
//
// Run against a dev server on http://localhost:5173.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto((process.env.DEV_URL ?? 'http://127.0.0.1:5173') + '/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { storyTemplates } = await import('/src/data/stories/index.ts');
  const { hasStoryText } = await import('/src/i18n/story/index.ts');
  const { setLanguage } = await import('/src/i18n/index.ts');

  const out = { runs: [], coverage: { missing: [] }, ended: 0 };

  // ── Text coverage: every fragment must have every string it can ever need ──
  //
  // Checked in *both* languages, and Vietnamese is the source, so a missing vi line is the real
  // failure — English falls back cleanly, Vietnamese has nothing behind it.
  for (const template of storyTemplates) {
    // The story page's headers are content too: every story must say what its person wants,
    // what a silent stretch is waiting for, and what hangs on it — or the page falls back to
    // placeholders. `stake` became mandatory when the depth pass reached all templates.
    for (const pageKey of ['want', 'waiting', 'stake']) {
      if (!hasStoryText(`${template.id}.${pageKey}`)) out.coverage.missing.push(`${template.id}.${pageKey}`);
    }
    for (const fragment of template.fragments) {
      const need = [`${template.id}.${fragment.id}.chronicle`];
      // An opening never renders as a card — it is a row in a sheet — so it needs the line and
      // its action label, not a title/body/options set.
      if (fragment.opening) {
        need.push(`${template.id}.${fragment.id}.line`);
      } else if (fragment.volume === 'whisper') need.push(`${template.id}.${fragment.id}.line`);
      else {
        need.push(`${template.id}.${fragment.id}.title`, `${template.id}.${fragment.id}.body`);
        if (fragment.options?.length) {
          for (const option of fragment.options) {
            need.push(`${template.id}.${fragment.id}.${option.id}`);
            need.push(`${template.id}.${fragment.id}.${option.id}.d`);
            if (option.blockedKey) need.push(`${template.id}.${fragment.id}.${option.blockedKey}`);
          }
        } else {
          need.push(`${template.id}.${fragment.id}.ok`);
        }
      }
      if (fragment.opening) need.push(`${template.id}.${fragment.id}.${fragment.opening.actionKey}`);
      for (const key of need) {
        if (!hasStoryText(key)) out.coverage.missing.push(key);
      }
    }
  }

  // Vietnamese must resolve too — the whole point of writing it first.
  setLanguage('vi');
  const { storyText } = await import('/src/i18n/story/index.ts');
  out.coverage.viMissing = [];
  for (const template of storyTemplates) {
    for (const fragment of template.fragments) {
      const key = `${template.id}.${fragment.id}.chronicle`;
      if (storyText(key, {}) === key) out.coverage.viMissing.push(key);
    }
  }
  setLanguage('en');

  // ── Drive several seeded runs ────────────────────────────────────────────
  const firstChoice = (st, p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': {
        const open = p.target.methods.filter((m) => !m.blockedReason);
        return open.length > 0 ? open[0].method : 'back';
      }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': return 'decline';
      case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
      case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'empire-response': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      // The Chronicle: take an affordable option when there is one, acknowledge a blow otherwise.
      case 'story-beat':
        return p.options.length
          ? (p.options.find((o) => o.affordable) ?? p.options[0]).id
          : 'ok';
      default: return 'ok';
    }
  };

  for (const seed of [20260816, 777333, 424242]) {
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const run = {
      seed,
      prompts: 0,
      storyPrompts: 0,
      whispers: 0,
      endings: 0,
      fragmentsFired: 0,
      blows: 0,
      cards: 0,
      templatesSeen: new Set(),
      fired: [],
      openings: 0,
      turns: 0,
    };

    let spokenBefore = 0;
    for (let i = 0; i < 320; i += 1) {
      const chronicleBefore = st.chronicle?.length ?? 0;
      advanceAscentTick(st);
      run.turns = st.turn;

      // A whisper is a chronicle entry that appeared without a prompt being raised.
      let guard = 0;
      while (st.pendingAscentPrompt && guard < 8) {
        guard += 1;
        const p = st.pendingAscentPrompt;
        run.prompts += 1;
        if (p.kind === 'story-beat') {
          run.storyPrompts += 1;
          if (p.volume === 'blow') run.blows += 1; else run.cards += 1;
          run.templatesSeen.add(p.templateId);
          run.fired.push(`${p.templateId}/${p.fragmentId}`);
        }
        if (p.kind === 'run-over') { out.ended += 1; break; }
        resolveAscentPrompt(st, firstChoice(st, p));
      }
      if (st.isDefeated) break;

      const gained = (st.chronicle?.length ?? 0) - chronicleBefore;
      if (gained > 0) run.endings += gained;

      // Fragments fired this tick, counted before a terminal can carry its story away.
      const spokenNow = (st.stories ?? []).reduce((sum, story) => sum + story.spoken.length, 0);
      run.fragmentsFired += Math.max(0, spokenNow - spokenBefore) + gained;
      spokenBefore = spokenNow;

      // Openings: a story hanging an offer on a province the player already visits.
      for (const story of st.stories ?? []) {
        if (story.offer) run.openings += 1;
      }
    }

    for (const entry of st.chronicle ?? []) run.fired.push(`${entry.templateId}/${entry.fragmentId}`);
    for (const story of st.stories ?? []) run.templatesSeen.add(story.templateId);

    run.templatesSeen = [...run.templatesSeen];
    run.chronicle = (st.chronicle ?? []).map((c) => `${c.templateId}/${c.fragmentId}`);
    run.liveStories = (st.stories ?? []).length;
    run.memoryWritten = (st.stories ?? []).some((story) => Object.keys(story.memory).length > 0);
    // Repetition is measured against what each story *said*, not against the Chronicle, which now
    // holds only endings. A pool that says the same thing twice in one run is the failure mode
    // this model is most exposed to, so it is checked at the source.
    run.dupes = [];
    for (const story of st.stories ?? []) {
      const tmpl = storyTemplates.find((tm) => tm.id === story.templateId);
      for (const id of new Set(story.spoken)) {
        const frag = tmpl?.fragments.find((f) => f.id === id);
        const times = story.spoken.filter((other) => other === id).length;
        // `repeatable` is an authored property meaning "this may recur" — but it is capped, and
        // exceeding the cap is a real failure.
        const allowed = frag?.repeatable ? (frag.maxTimes ?? 3) : 1;
        if (times > allowed) run.dupes.push(`${story.templateId}/${id} ×${times}`);
      }
    }
    run.spokenTotal = (st.stories ?? []).reduce((sum, story) => sum + story.spoken.length, 0);
    out.runs.push(run);
  }

  // ── Mode isolation: nothing may run outside ascent ───────────────────────
  const { createEmpireGameState } = await import('/src/state/GameState.ts');
  const { tickStories } = await import('/src/systems/story/StorySystem.ts');
  const empire = createEmpireGameState({ seaSides: 1, difficulty: 'normal' });
  for (let i = 0; i < 40; i += 1) tickStories(empire);
  out.empireUntouched = !empire.stories && !empire.chronicle && !empire.storyWatch;

  return out;
});

// ── Assertions ──────────────────────────────────────────────────────────────
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n── Text coverage ──');
check('every fragment has all the text it can need',
  result.coverage.missing.length === 0,
  result.coverage.missing.slice(0, 6).join(', '));
check('every fragment resolves in Vietnamese',
  result.coverage.viMissing.length === 0,
  result.coverage.viMissing.slice(0, 6).join(', '));

console.log('\n── Runs ──');
const total = { prompts: 0, storyPrompts: 0, whispers: 0, endings: 0, fragmentsFired: 0, blows: 0, cards: 0, openings: 0 };
const allTemplates = new Set();
for (const run of result.runs) {
  for (const key of Object.keys(total)) total[key] += run[key] ?? 0;
  for (const id of run.templatesSeen) allTemplates.add(id);
  console.log(`  seed ${run.seed}: ${run.turns} seasons · ${run.chronicle.length} recorded · `
    + `${run.storyPrompts} pausing (${run.cards} cards, ${run.blows} blows) · ${run.liveStories} live`);
}

const spoken = total.fragmentsFired;
check('stories seed and speak across runs', spoken > 0, `${spoken} fragments fired`);
check('stories reach an ending', total.endings > 0, `${total.endings} recorded endings`);
check('stories write memory', result.runs.some((r) => r.memoryWritten));
check('more than one story reaches play', allTemplates.size >= 2, [...allTemplates].join(', '));
check('blows land — something happens without being asked', total.blows > 0, `${total.blows} blows`);
check('cards are raised', total.cards > 0, `${total.cards} cards`);
check('openings are offered', total.openings > 0, `${total.openings} opening-seasons`);

const share = total.storyPrompts / Math.max(1, total.prompts);
check('story cards stay inside the prompt budget',
  share <= 0.25,
  `${(share * 100).toFixed(1)}% of ${total.prompts} prompts (target ~15%)`);

// The design's headline pacing claim: roughly seven in ten fragments are whispers, which pause
// nothing and spend no prompt budget at all. If cards dominate, the Chronicle is a modal queue.
const whisperShare = (spoken - total.storyPrompts) / Math.max(1, spoken);
check('most of what a story says pauses nothing',
  whisperShare >= 0.5,
  `${(whisperShare * 100).toFixed(0)}% silent (${spoken - total.storyPrompts} of ${spoken}); target ~70%`);

const dupes = result.runs.flatMap((r) => r.dupes);
check('no fragment repeats inside one run', dupes.length === 0, dupes.slice(0, 6).join(', '));

console.log('\n── Isolation ──');
check('the other modes are never touched', result.empireUntouched);

console.log('\n── Console ──');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
