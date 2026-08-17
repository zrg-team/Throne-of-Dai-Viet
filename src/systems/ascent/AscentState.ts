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
  founder: 1,
  'wave-result': 2,
  'empire-response': 3,
  'conquer-method': 4,
  'court-appointment': 5,
  'conquer-target': 6,
  'law-choice': 7,
  // Just above the laws it will shape. Four cards in a whole run, each governing the era that
  // follows it, so it should not queue behind an edict it is about to change the value of.
  doctrine: 6.5,
  parliament: 8,
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
 * Queues a decision. Only one prompt of a kind can be outstanding — a second conquest prompt
 * while one is already pending would be stale by the time it showed. Power drafts are the
 * exception: they stack as a counter so a level-up earned mid-prompt is never lost.
 */
export function enqueueAscentPrompt(state: GameState, prompt: AscentPrompt): void {
  const ascent = state.ascent;
  if (!ascent) return;

  if (prompt.kind === 'run-over') {
    ascent.promptQueue = [prompt];
    state.pendingAscentPrompt = undefined;
    return;
  }

  const alreadyLive = state.pendingAscentPrompt?.kind === prompt.kind;
  const alreadyQueued = ascent.promptQueue.some((queued) => queued.kind === prompt.kind);
  if (alreadyLive || alreadyQueued) return;

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
  state.pendingAscentPrompt = ascent.promptQueue.shift();
  state.isPaused = true;
  // Stamped here rather than in the decision director, because this is the one place *every*
  // prompt passes through. Stamping it only where the director raises one lets a wave response
  // or a chained follow-up be immediately followed by a fresh card on the very next tick,
  // which is precisely the slideshow the gap rule exists to prevent.
  ascent.lastPromptTurn = state.turn;
}
