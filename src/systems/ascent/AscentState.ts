import { BASE_DRAFT_WEIGHTS, REROLL_BASE_COST, WAVE_GRACE_TICKS, xpToNextLevel } from '../../game/ascentConfig';
import type { AscentPrompt, AscentPromptKind, AscentState, GameState } from '../../state/types';

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
    wavesSurvived: 0,
    heroesSummoned: 0,
  };
}

/**
 * Prompt priority, highest first. A plain table rather than a chain of `if`s in the UI,
 * so the ordering is one place to read and retune.
 *
 * The reasoning: terminal states first; then setup; then closure on what just happened;
 * then the time-critical defence; then the choices that keep the conquest moving; and
 * rewards last, so a wave landing never gets buried behind a card draft.
 */
const PROMPT_PRIORITY: Record<AscentPromptKind, number> = {
  'run-over': 0,
  founder: 1,
  'wave-result': 2,
  'empire-response': 3,
  'march-order': 4,
  'hero-summon': 5,
  'power-draft': 6,
};

/**
 * Queues a decision. Only one prompt of a kind can be outstanding — a second march order
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
}
