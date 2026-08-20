import type { TranslationKey } from '../i18n';
import type { CardIconId } from '../ui/CardIcons';

/**
 * The manual's table of contents.
 *
 * Structure here, prose in `i18n/catalogs/guide.ts`, drawing in `GuideScene`. The split matters
 * because the three change for different reasons: a retune of `ascentConfig` rewrites a paragraph,
 * a new lane on the action bar adds an entry, and neither should require touching the page that
 * lays them out.
 *
 * Keys are spelled out as literals rather than assembled from the id. A composed key is a key the
 * compiler cannot check, and this catalog's failure mode is a crash at import — `validateCatalogs`
 * refuses a missing string — so a typo here would take the whole game down rather than print an
 * empty heading. Written out, `TranslationKey` catches it while the file is still open.
 */
export type GuideTab = 'start' | 'run' | 'screens' | 'after';

export const GUIDE_TABS: readonly GuideTab[] = ['start', 'run', 'screens', 'after'];

export interface GuideEntry {
  id: string;
  tab: GuideTab;
  /** The glyph inked beside the heading. Ids are about meaning, so several entries may share one. */
  icon: CardIconId;
  heading: TranslationKey;
  /** The paragraph. Optional: two entries are a heading and a list, with nothing to say between. */
  body?: TranslationKey;
  /** Points under the paragraph, each a line of its own with a marker. */
  points?: readonly TranslationKey[];
}

/**
 * Every entry, in reading order.
 *
 * Four pages of five or six, not one page of twenty-two. The length is the design: a manual a
 * player will actually finish is one where each tab ends inside a couple of screens, and the tab
 * they need — the run, the screens — is one press from the front of it rather than eleven
 * paragraphs down.
 */
export const GUIDE_ENTRIES: readonly GuideEntry[] = [
  // ── Start: what the thing is, and which button to press ──────────────────
  {
    id: 'what',
    tab: 'start',
    icon: 'scroll',
    heading: 'guide.start.what.h',
    body: 'guide.start.what.b',
  },
  {
    id: 'modes',
    tab: 'start',
    icon: 'banner',
    heading: 'guide.start.modes.h',
    body: 'guide.start.modes.b',
    points: ['guide.start.modes.p1', 'guide.start.modes.p2', 'guide.start.modes.p3'],
  },
  {
    id: 'ascent',
    tab: 'start',
    icon: 'crown',
    heading: 'guide.start.ascent.h',
    body: 'guide.start.ascent.b',
  },
  {
    id: 'first',
    tab: 'start',
    icon: 'hourglass',
    heading: 'guide.start.first.h',
    points: [
      'guide.start.first.p1',
      'guide.start.first.p2',
      'guide.start.first.p3',
      'guide.start.first.p4',
    ],
  },

  // ── The run: the clock, and everything it brings to the door ─────────────
  {
    id: 'clock',
    tab: 'run',
    icon: 'hourglass',
    heading: 'guide.run.clock.h',
    body: 'guide.run.clock.b',
  },
  {
    id: 'phases',
    tab: 'run',
    icon: 'scroll',
    heading: 'guide.run.phases.h',
    body: 'guide.run.phases.b',
  },
  {
    id: 'prompts',
    tab: 'run',
    icon: 'branch',
    heading: 'guide.run.prompts.h',
    body: 'guide.run.prompts.b',
  },
  {
    id: 'draft',
    tab: 'run',
    icon: 'spark',
    heading: 'guide.run.draft.h',
    body: 'guide.run.draft.b',
  },
  {
    id: 'champions',
    tab: 'run',
    icon: 'person',
    heading: 'guide.run.champions.h',
    body: 'guide.run.champions.b',
  },
  {
    id: 'conquest',
    tab: 'run',
    icon: 'blade',
    heading: 'guide.run.conquest.h',
    body: 'guide.run.conquest.b',
  },
  {
    id: 'ambition',
    tab: 'run',
    icon: 'scales',
    heading: 'guide.run.ambition.h',
    body: 'guide.run.ambition.b',
    points: ['guide.run.ambition.p1', 'guide.run.ambition.p2', 'guide.run.ambition.p3'],
  },
  {
    id: 'end',
    tab: 'run',
    icon: 'skull',
    heading: 'guide.run.end.h',
    body: 'guide.run.end.b',
  },

  // ── Screens: every mark on the glass, named ──────────────────────────────
  {
    id: 'hud',
    tab: 'screens',
    icon: 'shield',
    heading: 'guide.screens.hud.h',
    body: 'guide.screens.hud.b',
    points: [
      'guide.screens.hud.p1',
      'guide.screens.hud.p2',
      'guide.screens.hud.p3',
      'guide.screens.hud.p4',
    ],
  },
  {
    id: 'bar',
    tab: 'screens',
    icon: 'ladder',
    heading: 'guide.screens.bar.h',
    body: 'guide.screens.bar.b',
    points: [
      'guide.screens.bar.p1',
      'guide.screens.bar.p2',
      'guide.screens.bar.p3',
      'guide.screens.bar.p4',
    ],
  },
  {
    id: 'map',
    tab: 'screens',
    icon: 'banner',
    heading: 'guide.screens.map.h',
    body: 'guide.screens.map.b',
  },
  {
    id: 'pause',
    tab: 'screens',
    icon: 'hourglass',
    heading: 'guide.screens.pause.h',
    body: 'guide.screens.pause.b',
  },

  // ── After: what a defeat is worth, and where the rest of the game lives ──
  {
    id: 'score',
    tab: 'after',
    icon: 'purse',
    heading: 'guide.after.score.h',
    body: 'guide.after.score.b',
  },
  {
    id: 'legacy',
    tab: 'after',
    icon: 'coin',
    heading: 'guide.after.legacy.h',
    body: 'guide.after.legacy.b',
  },
  {
    id: 'codex',
    tab: 'after',
    icon: 'person',
    heading: 'guide.after.codex.h',
    body: 'guide.after.codex.b',
  },
  {
    id: 'history',
    tab: 'after',
    icon: 'scroll',
    heading: 'guide.after.history.h',
    body: 'guide.after.history.b',
  },
  {
    id: 'settings',
    tab: 'after',
    icon: 'gear',
    heading: 'guide.after.settings.h',
    body: 'guide.after.settings.b',
  },
];
