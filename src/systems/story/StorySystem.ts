import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { applyResourceDelta, canSpend } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from '../ascent/AscentState';
import { storyTemplate, storyTemplates } from '../../data/stories';
import { storyText } from '../../i18n/story';
import { findEcho, recordEcho } from './echoes';
import type {
  ActiveStory,
  ChronicleEntry,
  GameState,
  Hero,
  Kingdom,
  Land,
  StoryOpening,
  StoryVolume,
  StoryWatch,
} from '../../state/types';
import type { StoryCtx, StoryFragment, StoryTemplate, StoryWorldDelta } from './types';

/**
 * The Chronicle.
 *
 * A story is not a chain of beats with a counter. It is a pool of fragments, a bag of numbers
 * recording what has happened, and a rule for choosing: when something happens in the world the
 * story wakes, scores every fragment against the state and its own memory, and speaks whichever
 * one fits — drawing at random among the best few so the same situation does not always produce
 * the same line. Then it writes to memory and goes quiet.
 *
 * That is salience-based narrative rather than branching narrative, and the reason it matters is
 * that a branching tree is a map a player learns, while a pool is a personality they only ever
 * get to know. Nothing here counts progress, because there is no length to be a fraction of.
 *
 * Ascent only. Every entry point returns immediately in the other modes, which is what keeps
 * `verify-modes-regression` byte-identical.
 */

/**
 * Stories running at once.
 *
 * Five rather than four: with a catalogue this size, four concurrent slots and one seed attempt
 * every few seasons meant a run only ever met a third of it. The ceiling is on *pausing* volume,
 * which the prompt budget already holds independently — most of what these five say is whispers,
 * which cost nothing.
 */
const MAX_ACTIVE_STORIES = 5;

/** Seasons between seeding attempts. Stories arrive quietly and rarely. */
const SEED_INTERVAL = 6;

/** A story says nothing for at least this many seasons after speaking. */
const MIN_QUIET = 3;

/** Whispers per tick, across all stories. Two ambient lines at once reads as noise. */
const WHISPERS_PER_TICK = 1;

/** Temperature bleeds off on its own, so a story that is ignored cools rather than detonating. */
const COOL_PER_TICK = 0.06;

/** Treasury above this is "somebody has started counting". */
const HOARD_GOLD = 700;

/** Seasons an offer stands before it quietly stops being available. Never counted down on screen. */
const OFFER_SEASONS = 26;

let storySeq = 0;

// ── World delta ─────────────────────────────────────────────────────────────

function snapshot(state: GameState): StoryWatch {
  return {
    lands: state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length,
    heroes: state.heroes.length,
    gold: Math.round(state.resources.gold),
    food: Math.round(state.resources.food),
    battlesWon: state.campaignScore?.armiesDefeated ?? 0,
    wavesSurvived: state.ascent?.wavesSurvived ?? 0,
    courtSeatsFilled: Object.values(state.court.seats).filter(Boolean).length,
  };
}

function worldDelta(state: GameState, before: StoryWatch): StoryWorldDelta {
  const now = snapshot(state);
  const foodRate = state.resourceRates.food;
  return {
    lostLand: now.lands < before.lands,
    gainedLand: now.lands > before.lands,
    lostHero: now.heroes < before.heroes,
    gainedHero: now.heroes > before.heroes,
    wonBattle: now.battlesWon > before.battlesWon,
    waveBroken: now.wavesSurvived > before.wavesSurvived,
    starving: foodRate < 0 && state.resources.food / Math.max(1, -foodRate) <= 4,
    hoarding: now.gold >= HOARD_GOLD,
    seatEmptied: now.courtSeatsFilled < before.courtSeatsFilled,
  };
}

// ── Context ─────────────────────────────────────────────────────────────────

function makeCtx(state: GameState, story: ActiveStory, world: StoryWorldDelta): StoryCtx {
  return {
    state,
    story,
    world,
    quietFor: state.turn - story.lastSpokeTurn,
    age: state.turn - story.seededTurn,
    hero: () => state.heroes.find((candidate) => candidate.id === story.cast.heroId),
    otherHero: () => state.heroes.find((candidate) => candidate.id === story.cast.otherHeroId),
    land: () => state.lands.find((candidate) => candidate.id === story.cast.landId),
    rival: () => state.kingdoms.find((candidate) => candidate.id === story.cast.kingdomId),
    recall: (key) => story.memory[key] ?? 0,
    remember: (key, value) => { story.memory[key] = value; },
    bump: (key, by = 1) => {
      story.memory[key] = (story.memory[key] ?? 0) + by;
      return story.memory[key];
    },
    said: (fragmentId) => story.spoken.includes(fragmentId),
    heat: (by) => { story.temperature = Math.max(0, story.temperature + by); },
    sharing: () => (state.stories ?? []).filter((other) => other.id !== story.id && sharesSubject(other, story)).length,
    echoOf: (templateId, fragmentId) => findEcho(templateId, fragmentId)?.name,
    leaveEcho: (name) => recordEcho(story.templateId, story.spoken[story.spoken.length - 1] ?? '', name),
  };
}

/** True when two stories have taken an interest in the same person, place or court. */
function sharesSubject(a: ActiveStory, b: ActiveStory): boolean {
  return Boolean(
    (a.cast.heroId && (a.cast.heroId === b.cast.heroId || a.cast.heroId === b.cast.otherHeroId))
    || (a.cast.landId && a.cast.landId === b.cast.landId)
    || (a.cast.kingdomId && a.cast.kingdomId === b.cast.kingdomId),
  );
}

/** Interpolation available to every fragment of a story, without the fragment asking. */
export function storyParams(state: GameState, story: ActiveStory): Record<string, string | number> {
  const hero = state.heroes.find((candidate) => candidate.id === story.cast.heroId);
  const other = state.heroes.find((candidate) => candidate.id === story.cast.otherHeroId);
  const land = state.lands.find((candidate) => candidate.id === story.cast.landId);
  const rival = state.kingdoms.find((candidate) => candidate.id === story.cast.kingdomId);
  return {
    hero: hero?.name ?? '',
    other: other?.name ?? '',
    land: land?.name ?? '',
    rival: rival?.name ?? '',
    // Echo: the season a thing happened, so a fragment can quote it back by name and date.
    season: story.memory.echoTurn ?? 0,
    year: Math.max(1, Math.round((story.memory.echoTurn ?? state.turn) / 4)),
  };
}

// ── Seeding ─────────────────────────────────────────────────────────────────

function activeFor(state: GameState, templateId: string): boolean {
  return (state.stories ?? []).some((story) => story.templateId === templateId);
}

/**
 * Considers starting one story. Nothing is announced — a story seeds latent, marks its cast,
 * and begins watching. The player cannot count how many are running.
 */
function trySeed(state: GameState): void {
  const stories = state.stories ?? [];
  if (stories.length >= MAX_ACTIVE_STORIES) return;

  const eligible: StoryTemplate[] = [];
  for (const template of storyTemplates) {
    if (state.turn < (template.minTurn ?? 0)) continue;
    if (!template.allowMultiple && activeFor(state, template.id)) continue;
    if (!template.allowMultiple && (state.storiesEnded ?? []).includes(template.id)) continue;
    eligible.push(template);
  }
  if (eligible.length === 0) return;

  /**
   * A template the run has not touched yet is favoured heavily over one it has.
   *
   * Without this the catalogue is a lottery re-rolled every seed tick, and a run samples the same
   * handful of favourites: measured across three runs with nineteen templates, two of them —
   * including the one that only exists when the player has been *efficient* — never seeded once.
   * A large catalogue is only large if a run actually walks around it.
   */
  const seen = new Set([
    ...(state.storiesEnded ?? []),
    ...stories.map((story) => story.templateId),
  ]);
  const weightOf = (template: StoryTemplate) =>
    template.seedWeight * (seen.has(template.id) ? 1 : 3.5);

  const total = eligible.reduce((sum, template) => sum + weightOf(template), 0);
  let roll = Math.random() * total;
  let chosen = eligible[eligible.length - 1];
  for (const template of eligible) {
    roll -= weightOf(template);
    if (roll <= 0) { chosen = template; break; }
  }

  const cast = chosen.seed(state);
  if (!cast) return;

  storySeq += 1;
  stories.push({
    id: `story-${state.turn}-${storySeq}`,
    templateId: chosen.id,
    cast,
    memory: {},
    temperature: 0,
    seededTurn: state.turn,
    // Counts as having "spoken" at seed so it observes the quiet period before its first line.
    lastSpokeTurn: state.turn,
    spoken: [],
  });
  state.stories = stories;
}

// ── Choosing what to say ────────────────────────────────────────────────────

/** Default ceiling on a repeatable fragment. Three of anything is already a lot to hear. */
const DEFAULT_MAX_TIMES = 3;

function timesSaid(ctx: StoryCtx, fragmentId: string): number {
  return ctx.story.spoken.filter((id) => id === fragmentId).length;
}

function candidates(template: StoryTemplate, ctx: StoryCtx, whispersOnly: boolean): StoryFragment[] {
  return template.fragments.filter((fragment) => {
    if (whispersOnly && (fragment.volume !== 'whisper' || fragment.opening)) return false;
    if (!fragment.repeatable && ctx.said(fragment.id)) return false;
    if (fragment.repeatable && timesSaid(ctx, fragment.id) >= (fragment.maxTimes ?? DEFAULT_MAX_TIMES)) return false;
    // Already on the table; picking it again would replace the offer with itself.
    if (ctx.story.offer === fragment.id) return false;
    if (fragment.quiet !== undefined && ctx.quietFor < fragment.quiet) return false;
    if (fragment.when && !fragment.when(ctx)) return false;
    return true;
  });
}

/**
 * Scores every candidate, then draws at random among the strongest.
 *
 * The draw is what stops the same state always producing the same line, and the band it draws
 * from is deliberately narrow: widening it makes a story say things that do not fit the moment,
 * which is exactly the "random flavour text" reading this design has to avoid.
 */
/**
 * How strongly each volume is favoured in the draw, so the authored weights express *fit* and
 * this expresses *pacing*.
 *
 * Measured without it: only 49% of fragments were whispers against a design target of ~70%. The
 * cause is structural rather than authorial — a story that picks a card goes quiet until the
 * decision director gets round to raising it, so every card it picks costs it several seasons of
 * whispers it would otherwise have spoken. Weighting the draw restores the intended mix without
 * touching a single fragment's own weight.
 */
const VOLUME_BIAS: Record<StoryVolume, number> = {
  whisper: 2.1,
  card: 1,
  // Blows already gate hard on temperature and on two whispers having run first; they do not
  // need suppressing here as well.
  blow: 1,
};

function pickFragment(template: StoryTemplate, ctx: StoryCtx, whispersOnly = false): StoryFragment | undefined {
  const scored = candidates(template, ctx, whispersOnly).map((fragment) => ({
    fragment,
    // Each retelling is worth less than the last, so a repeatable line fades out rather than
    // stopping abruptly at its ceiling.
    score: ((fragment.weight ?? 1) + (fragment.salience?.(ctx) ?? 0))
      * VOLUME_BIAS[fragment.volume]
      / (1 + timesSaid(ctx, fragment.id)),
  })).filter((entry) => entry.score > 0);
  if (scored.length === 0) return undefined;

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  const band = scored.filter((entry) => entry.score >= best * 0.6).slice(0, 4);
  return band[Math.floor(Math.random() * band.length)].fragment;
}

// ── Speaking ────────────────────────────────────────────────────────────────

function record(state: GameState, story: ActiveStory, fragment: StoryFragment): void {
  const chronicle = state.chronicle ?? [];
  storySeq += 1;
  const entry: ChronicleEntry = {
    id: `chron-${state.turn}-${storySeq}`,
    templateId: story.templateId,
    fragmentId: fragment.id,
    turn: state.turn,
    params: storyParams(state, story),
    tone: fragment.tone ?? 'info',
  };
  chronicle.push(entry);
  if (chronicle.length > 60) chronicle.splice(0, chronicle.length - 60);
  state.chronicle = chronicle;
}

/** Applies a fragment's own effect and books the consequences of having spoken. */
function fire(state: GameState, story: ActiveStory, fragment: StoryFragment, ctx: StoryCtx): void {
  story.spoken.push(fragment.id);
  story.lastSpokeTurn = state.turn;
  if (fragment.heat) ctx.heat(fragment.heat);
  fragment.effect?.(ctx);

  if (fragment.terminal) {
    record(state, story, fragment);
    state.stories = (state.stories ?? []).filter((candidate) => candidate.id !== story.id);
    state.storiesEnded = [...(state.storiesEnded ?? []), story.templateId];
  }
}

/** A whisper: one line in the header strip. No pause, no queue slot, no acknowledgement. */
function whisper(state: GameState, story: ActiveStory, fragment: StoryFragment, ctx: StoryCtx): void {
  const params = storyParams(state, story);
  pushToast(
    state,
    storyText(`${story.templateId}.${fragment.id}.line`, params),
    fragment.tone ?? 'info',
  );
  fire(state, story, fragment, ctx);
}

// ── The tick ────────────────────────────────────────────────────────────────

/**
 * One story tick. Seeds occasionally, cools every story, and lets at most one whisper through.
 *
 * Cards and blows are not spoken here — they are *marked* on the story and raised by the
 * decision director, which owns the pacing contract for everything that pauses the world.
 */
export function tickStories(state: GameState): void {
  if (state.gameMode !== 'ascent' || !state.ascent) return;

  const before = state.storyWatch ?? snapshot(state);
  const world = worldDelta(state, before);
  state.storyWatch = snapshot(state);

  if (state.turn % SEED_INTERVAL === 0) trySeed(state);

  const stories = state.stories ?? [];
  let whispersLeft = WHISPERS_PER_TICK;

  // Collision. Two stories that have bound the same hero or province do not both get to talk
  // about him in the same season — the hotter one speaks and the other waits, which reads as the
  // two of them contending for the same subject rather than as the world double-narrating it.
  const spokenSubjects: ActiveStory[] = [];

  for (const story of [...stories].sort((a, b) => b.temperature - a.temperature)) {
    const template = storyTemplate(story.templateId);
    if (!template) continue;

    story.temperature = Math.max(0, story.temperature - COOL_PER_TICK);

    // An offer that stood long enough goes, without announcing that it has.
    if (story.offer && state.turn >= (story.offerUntil ?? 0)) {
      story.offer = undefined;
      story.offerUntil = undefined;
    }

    const ctx = makeCtx(state, story, world);
    if (ctx.quietFor < MIN_QUIET) continue;
    if (spokenSubjects.some((other) => sharesSubject(other, story))) continue;

    // A story already holding a card for the director may still whisper — indeed it *should*.
    // "A story heating up whispers more often, about smaller things" is the only tell the player
    // ever gets that something is coming, and going mute the moment a card is queued deletes it.
    const fragment = pickFragment(template, ctx, Boolean(story.waiting));
    if (!fragment) continue;
    spokenSubjects.push(story);

    // An opening is not speech. It hangs an offer on a subject and stands there — but it does
    // *not* stop the story talking, or a player who never takes the offer would silence it.
    if (fragment.opening) {
      story.offer = fragment.id;
      story.offerUntil = state.turn + OFFER_SEASONS;
      // Deliberately not marked as spoken and not counted against the quiet period: making an
      // offer is not the same as having said something.
      spokenSubjects.pop();
      continue;
    }

    if (fragment.volume === 'whisper') {
      if (whispersLeft <= 0) continue;
      whispersLeft -= 1;
      whisper(state, story, fragment, ctx);
      continue;
    }

    // Cards and blows pause the world, so they go through the director's budget.
    story.waiting = fragment.id;
  }
}

// ── Bridge to the decision director ─────────────────────────────────────────

interface Waiting {
  story: ActiveStory;
  template: StoryTemplate;
  fragment: StoryFragment;
}

function firstWaiting(state: GameState): Waiting | undefined {
  for (const story of state.stories ?? []) {
    if (!story.waiting) continue;
    const template = storyTemplate(story.templateId);
    const fragment = template?.fragments.find((candidate) => candidate.id === story.waiting);
    if (!template || !fragment) continue;
    return { story, template, fragment };
  }
  return undefined;
}

/** True when some story is holding a card or a blow the director could raise. */
export function storyBeatReady(state: GameState): boolean {
  if (state.gameMode !== 'ascent') return false;
  return Boolean(firstWaiting(state));
}

/**
 * The advisor line's speaker: whoever holds the seat most relevant to the story.
 *
 * Deliberately not a neutral narrator. A hero with low loyalty or high renown gives advice that
 * serves themselves, and nothing in the interface marks it — which is what finally gives
 * `loyalty` a meaning beyond a number on a card.
 */
function advisorFor(state: GameState, story: ActiveStory): Hero | undefined {
  const seated = Object.values(state.court.seats)
    .map((heroId) => state.heroes.find((hero) => hero.id === heroId))
    .filter((hero): hero is Hero => Boolean(hero) && hero!.id !== story.cast.heroId);
  if (seated.length === 0) return undefined;
  // The most self-interested voice in the room speaks first.
  return seated.sort((a, b) => (b.stats.renown - b.stats.loyalty) - (a.stats.renown - a.stats.loyalty))[0];
}

/** Builds the pausing prompt for whichever story is holding one. Returns false when none is. */
export function offerStoryBeat(state: GameState): boolean {
  const waiting = firstWaiting(state);
  if (!waiting) return false;
  const { story, fragment } = waiting;

  const params = storyParams(state, story);
  const ctx = makeCtx(state, story, worldDelta(state, state.storyWatch ?? snapshot(state)));
  const advisor = fragment.volume === 'card' ? advisorFor(state, story) : undefined;

  // Only one story may hold the queue at a time. Bail *before* clearing `waiting`, so a
  // fragment is never silently lost when the queue declines it — a story that forgot what it
  // was about to say is the one bug in this system a player could never diagnose.
  if (state.pendingAscentPrompt?.kind === 'story-beat'
    || state.ascent?.promptQueue.some((queued) => queued.kind === 'story-beat')) {
    return false;
  }

  state.storyPromptsRaised = (state.storyPromptsRaised ?? 0) + 1;
  story.waiting = undefined;

  const speaker = story.cast.heroId
    ? state.heroes.find((hero) => hero.id === story.cast.heroId)
    : undefined;

  // Enqueued rather than pushed live: the queue owns priority and the pause contract.
  enqueueAscentPrompt(state, {
    kind: 'story-beat',
    storyId: story.id,
    templateId: story.templateId,
    fragmentId: fragment.id,
    volume: fragment.volume,
    band: fragment.band,
    speakerHeroId: speaker?.id,
    params,
    advisorHeroId: advisor?.id,
    advisorKey: advisor ? `${story.templateId}.${fragment.id}.advice` : undefined,
    options: (fragment.options ?? []).map((option) => ({
      id: option.id,
      cost: option.cost,
      affordable: (!option.cost || canSpend(state, option.cost))
        && (option.enabled ? option.enabled(ctx) : true),
      blockedKey: option.blockedKey,
    })),
  });
  return true;
}

/**
 * Answers a story card, or dismisses a blow.
 *
 * A blow has no options; acknowledging it applies its effect, which is the point — you do not
 * get to choose, you get to live with it.
 */
export function resolveStoryBeat(state: GameState, storyId: string, fragmentId: string, choiceId: string): boolean {
  const story = (state.stories ?? []).find((candidate) => candidate.id === storyId);
  if (!story) return true; // The story ended underneath us; clear the prompt rather than wedge it.

  const template = storyTemplate(story.templateId);
  const fragment = template?.fragments.find((candidate) => candidate.id === fragmentId);
  if (!fragment) return true;

  const ctx = makeCtx(state, story, worldDelta(state, state.storyWatch ?? snapshot(state)));

  if (fragment.volume === 'blow' || !fragment.options?.length) {
    fire(state, story, fragment, ctx);
    return true;
  }

  const option = fragment.options.find((candidate) => candidate.id === choiceId);
  if (!option) {
    // Close it rather than refuse it. Reporting the prompt unhandled leaves it live forever and
    // the run sits on a card whose buttons do nothing — a far worse failure than a fragment that
    // resolves without applying anything.
    fire(state, story, fragment, ctx);
    return true;
  }
  if (option.cost && !canSpend(state, option.cost)) return false;
  if (option.enabled && !option.enabled(ctx)) return false;

  if (option.cost) {
    applyResourceDelta(state, Object.fromEntries(
      Object.entries(option.cost).map(([key, value]) => [key, -(value ?? 0)]),
    ));
  }
  // Echo: remember *when* this was answered, so a later fragment can quote the season back.
  ctx.remember('echoTurn', state.turn);
  ctx.remember(`chose_${option.id}`, 1);
  option.apply(ctx);
  fire(state, story, fragment, ctx);
  return true;
}

// ── Openings ────────────────────────────────────────────────────────────────

/**
 * The offer hanging on a subject the player already visits.
 *
 * Never an order, never a deadline, never a reward preview. Ignoring it is free and is also an
 * answer — and in more than one story it is the answer that eventually matters.
 */
export function openingFor(state: GameState, on: 'land' | 'hero' | 'army' | 'rival' | 'treasury', subjectId?: string): StoryOpening | undefined {
  if (state.gameMode !== 'ascent') return undefined;
  for (const story of state.stories ?? []) {
    if (!story.offer) continue;
    const template = storyTemplate(story.templateId);
    const fragment = template?.fragments.find((candidate) => candidate.id === story.offer);
    if (!fragment?.opening || fragment.opening.on !== on) continue;

    if (on === 'land' && subjectId && story.cast.landId !== subjectId) continue;
    if (on === 'hero' && subjectId && story.cast.heroId !== subjectId) continue;
    if (on === 'rival' && subjectId && story.cast.kingdomId !== subjectId) continue;

    return {
      storyId: story.id,
      fragmentId: fragment.id,
      textKey: `${story.templateId}.${fragment.id}.line`,
      params: storyParams(state, story),
      // Fully qualified here so callers never have to know a story's key layout.
      actionKey: `${story.templateId}.${fragment.id}.${fragment.opening.actionKey}`,
    };
  }
  return undefined;
}

/** Takes an opening. The story reads it and moves on; nothing confirms anything. */
export function takeOpening(state: GameState, storyId: string, fragmentId: string): boolean {
  const story = (state.stories ?? []).find((candidate) => candidate.id === storyId);
  const template = story && storyTemplate(story.templateId);
  const fragment = template?.fragments.find((candidate) => candidate.id === fragmentId);
  if (!story || !fragment) return false;

  const ctx = makeCtx(state, story, worldDelta(state, state.storyWatch ?? snapshot(state)));
  const option = fragment.options?.[0];
  if (option) {
    if (option.cost && !canSpend(state, option.cost)) return false;
    if (option.enabled && !option.enabled(ctx)) return false;
    if (option.cost) {
      applyResourceDelta(state, Object.fromEntries(
        Object.entries(option.cost).map(([key, value]) => [key, -(value ?? 0)]),
      ));
    }
    ctx.remember('echoTurn', state.turn);
    option.apply(ctx);
  }
  story.offer = undefined;
  story.offerUntil = undefined;
  fire(state, story, fragment, ctx);
  return true;
}

// ── Marks ───────────────────────────────────────────────────────────────────

/** True when a story has taken an interest in this subject. The only signal it ever gives. */
export function isMarked(state: GameState, kind: 'land' | 'hero' | 'rival', id: string): boolean {
  if (state.gameMode !== 'ascent') return false;
  return (state.stories ?? []).some((story) => {
    if (kind === 'land') return story.cast.landId === id;
    if (kind === 'hero') return story.cast.heroId === id || story.cast.otherHeroId === id;
    return story.cast.kingdomId === id;
  });
}

// ── Helpers shared with the story data ──────────────────────────────────────

export function playerLands(state: GameState): Land[] {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

export function livingRivals(state: GameState): Kingdom[] {
  return state.kingdoms.filter((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated);
}

export function pick<T>(items: T[]): T | undefined {
  return items.length ? items[Math.floor(Math.random() * items.length)] : undefined;
}
