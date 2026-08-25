import {
  BASE_DRAFT_WEIGHTS,
  COALITION_COOLDOWN_TICKS,
  RAID_INTERVAL_TICKS,
  REROLL_BASE_COST,
  TRIBUTE_COOLDOWN_TICKS,
  VASSAL_COOLDOWN_TICKS,
  WAVE_GRACE_TICKS,
  xpToNextLevel,
} from '../../game/ascentConfig';
import type { AscentConquestMethod, AscentLaneStats, AscentPrompt, AscentPromptKind, AscentState, GameState } from '../../state/types';

function createLaneStats(): AscentLaneStats {
  const methods: AscentConquestMethod[] = ['bribe', 'diplomacy', 'intimidation', 'settle', 'occupy', 'siege'];
  return {
    conquestsByMethod: Object.fromEntries(methods.map((method) => [method, 0])) as Record<AscentConquestMethod, number>,
    appointments: 0,
    edictsEnacted: 0,
    parliamentAnswered: 0,
    envoyActions: {},
    rivalAnswers: 0,
  };
}

export function createAscentState(): AscentState {
  return {
    wave: 0,
    ticksToWave: WAVE_GRACE_TICKS,
    bossTelegraphed: false,
    waveInFlight: false,
    lastWaveBoss: false,
    invasionsLastTick: 0,
    power: 0,
    powerPrev: 0,
    peakPower: 0,
    threat: 0,
    defensePower: 0,
    level: 1,
    xp: 0,
    xpToNext: xpToNextLevel(1),
    pendingLevelUps: 0,
    cardStacks: {},
    retiredCards: [],
    draftWeights: { ...BASE_DRAFT_WEIGHTS },
    summonPity: 0,
    summonsDone: 0,
    rerollCost: REROLL_BASE_COST,
    frontLandId: undefined,
    frontBlocked: false,
    capitalLostTicks: 0,
    marchCooldown: 0,
    promptQueue: [],
    autopilotStats: { builds: 0, upgrades: 0, recruits: 0, marches: 0 },
    laneState: { conquer: 'ready', court: 'ready', world: 'ready', lastDecisionTurn: {} },
    conquestPlans: [],
    decisionPressure: 0,
    idleTicks: 0,
    laneStats: createLaneStats(),
    wavesSurvived: 0,
    heroesSummoned: 0,
    promptCooldowns: {},
    promptWaiting: {},
    famineCooldown: 0,
    autoResolveBattles: false,
    autoMusterSilently: false,
    autoClaimSilently: false,
    lastWatchedWave: -1,
    lastPromptTurn: 0,
    drawnCourtCards: [],
    courtCardCooldown: 3,
    defenceSamples: [],
    ambition: 0,
    ambitionThisWave: 0,
    waveHeat: 1,
    ambitionSpent: 0,
    ambitionPeak: 0,
    warPurchases: 0,
    twiceBornWave: -1,
    raidCooldown: RAID_INTERVAL_TICKS,
    tributeCooldown: TRIBUTE_COOLDOWN_TICKS,
    coalitionCooldownTicks: COALITION_COOLDOWN_TICKS,
    vassalCooldown: VASSAL_COOLDOWN_TICKS,
    coalitionPending: false,
    reservedHeroIds: [],
    reserveSeatMark: 0,
  };
}

/**
 * Prompt priority, highest first. A plain table rather than a chain of `if`s in the UI,
 * so the ordering is one place to read and retune.
 *
 * The reasoning: terminal states first; then setup; then closure on what just happened; then
 * the time-critical defence; then the second half of a decision already begun (picking *how*
 * to take a province, or where a champion serves — leaving either half-finished is the most
 * confusing thing the queue can do); then the choices that keep the run moving; rewards last,
 * so a wave landing never gets buried behind a card draft.
 */
const PROMPT_PRIORITY: Record<AscentPromptKind, number> = {
  'run-over': 0,
  mandate: 0.5,
  founder: 1,
  'wave-result': 2,
  'empire-response': 3,
  'conquer-method': 4,
  'court-appointment': 5,
  'conquer-target': 6,
  'law-choice': 7,
  // Just below the standing law it is a cousin of. A sac, du, hich or le is raised by the
  // world rather than reached for, so it should not push aside a decision the player has
  // already half-made — but it outranks the court and the envoy, because a hich is only ever
  // offered in the two seasons before a Great Invasion and is worthless a season later.
  'decree-offer': 7.5,
  // Just above the laws it will shape. Four cards in a whole run, each governing the era that
  // follows it, so it should not queue behind an edict it is about to change the value of.
  doctrine: 6.5,
  parliament: 8,
  // Between the parliament and the envoy: a host is worth more than a letter and less than a law,
  // and a muster the player has been asked about must not queue behind a draft.
  'muster-proposal': 8.5,
  envoy: 9,
  'rival-demand': 3.5,
  // Above the rival demands: an empty granary is already costing the realm morale and
  // population every single tick it goes unanswered.
  famine: 3.2,
  'hero-choice': 10,
  'power-draft': 11,
  // Below every decision that moves the run and above the reward draft. A blow that has already
  // been telegraphed by two whispers should not jump ahead of a wave landing, but it must not sit
  // behind a card draft either — the world has already changed by the time it speaks.
  'story-beat': 9.5,
};

/**
/**
 * Kinds where a second prompt is *the same question asked again with fresher numbers*, not a
 * second thing to decide.
 *
 * A conquest target list, a wave response, a founding gift — each is recomputed from live state
 * every time it is raised, so two of them are one decision, and the newer one is strictly the
 * truer one. These supersede in place: the stale copy goes, the question stays.
 *
 * `power-draft` is here for a different reason and it matters: the draft is backed by the
 * `pendingLevelUps` counter, so a level earned while one is open is already banked and a second
 * card would open the same draft twice for one level.
 *
 * **Everything not in this set stacks.** A second court appointment, a second envoy, a second
 * famine, a second beat of a story is a *different* thing being asked, and dropping it is the
 * game deciding something needed the player and then quietly deciding it did not.
 */
const SUPERSEDED: ReadonlySet<AscentPromptKind> = new Set<AscentPromptKind>([
  'conquer-target', 'conquer-method', 'empire-response', 'wave-result', 'mandate', 'founder',
  'power-draft',
]);

/**
 * How many of one kind may wait at once.
 *
 * Not unbounded: a run that banks eleven court appointments through a long siege hands the player
 * eleven cards the moment it ends, which is its own kind of losing them. Past the cap the *oldest*
 * of that kind gives way, so what survives is what is still true.
 */
const MAX_QUEUED_PER_KIND = 3;

/**
 * Queues a decision.
 *
 * The rule this used to follow was "only one prompt of a kind can be outstanding", and a second
 * was simply dropped on the floor. From the throne that reads as a card removing another card:
 * two champions arrive and you are asked about one, a second province revolts and nobody tells
 * you. Distinct requests now stack; only genuinely-recomputed ones supersede.
 */
export function enqueueAscentPrompt(state: GameState, prompt: AscentPrompt): void {
  const ascent = state.ascent;
  if (!ascent) return;

  if (prompt.kind === 'run-over') {
    // The one card that is allowed to take the screen from everything else, because there is
    // nothing left to answer.
    ascent.promptQueue = [prompt];
    state.pendingAscentPrompt = undefined;
    return;
  }

  if (SUPERSEDED.has(prompt.kind)) {
    // Already on screen: the player is looking at this exact question and the answer they give
    // is applied against live state anyway. Leave it alone rather than swapping the card under
    // their hand mid-read.
    if (state.pendingAscentPrompt?.kind === prompt.kind) return;
    const at = ascent.promptQueue.findIndex((queued) => queued.kind === prompt.kind);
    if (at >= 0) ascent.promptQueue[at] = prompt;
    else ascent.promptQueue.push(prompt);
    return;
  }

  const waiting = ascent.promptQueue.filter((queued) => queued.kind === prompt.kind).length;
  if (waiting >= MAX_QUEUED_PER_KIND) {
    const oldest = ascent.promptQueue.findIndex((queued) => queued.kind === prompt.kind);
    ascent.promptQueue.splice(oldest, 1);
  }
  ascent.promptQueue.push(prompt);
}

/**
 * Promotes the highest-priority queued prompt into the live slot and pauses the run.
 * Called at the end of every tick, and again after each resolution so chained prompts
 * hand over without the map un-pausing and flickering between them.
 */
export function drainAscentPrompts(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  if (state.pendingAscentPrompt) {
    state.isPaused = true;
    return;
  }

  if (ascent.promptQueue.length === 0) {
    state.isPaused = false;
    return;
  }

  ascent.promptQueue.sort((a, b) => PROMPT_PRIORITY[a.kind] - PROMPT_PRIORITY[b.kind]);
  // A card is dropped if the world has already answered it.
  //
  // Only the muster so far, and it is the one that matters: the plan names a *free* commander,
  // chosen when the card was queued, but the card is answered later — and by then that champion
  // may already be at the head of a host or mid-muster with another. The player then reads "the
  // king asks to raise a host" about a king who is standing with his army, which is a question
  // the game has no business asking. (Answering it was worse still: `raiseHostWithPlan` releases
  // the commander, so accepting quietly took the general off the host he was already leading.)
  while (ascent.promptQueue.length > 0) {
    const next = ascent.promptQueue[0];
    if (next.kind !== 'muster-proposal') break;
    const hero = state.heroes.find((candidate) => candidate.id === next.heroId);
    const busy = !hero
      || state.armies.some((army) => army.generalHeroId === hero.id)
      || state.recruitmentOrders.some((order) => order.heroId === hero.id);
    if (!busy) break;
    ascent.promptQueue.shift();
  }
  if (ascent.promptQueue.length === 0) {
    state.isPaused = false;
    return;
  }
  state.pendingAscentPrompt = ascent.promptQueue.shift();
  state.isPaused = true;
  // Stamped here rather than in the decision director, because this is the one place *every*
  // prompt passes through. Stamping it only where the director raises one lets a wave response
  // or a chained follow-up be immediately followed by a fresh card on the very next tick,
  // which is precisely the slideshow the gap rule exists to prevent.
  ascent.lastPromptTurn = state.turn;
  // Same reasoning, same single choke point: this is the only honest count of what the player has
  // actually been shown, and the Chronicle's share is measured against it.
  ascent.promptsRaised = (ascent.promptsRaised ?? 0) + 1;
}
