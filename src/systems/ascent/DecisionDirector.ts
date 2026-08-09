import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { SUMMON_EVERY_N_WAVES } from '../../game/ascentConfig';
import { buildConquestTargets, offerConquestPrompt } from './ConquestSystem';
import {
  buildLawOptions,
  findHeroNeedingPosting,
  offerAppointment,
  offerLawChoice,
  offerParliament,
  progressAscentCourtCooldown,
} from './CourtLaneSystem';
import { offerEnvoy, pickEnvoyTarget } from './EnvoySystem';
import { offerRivalDemand, rivalDemandReady, tickRivalCooldowns } from './RivalDirector';
import { offerHeroSummon } from './SummonSystem';
import { offerPowerDraft } from './PowerDraftSystem';
import type { AscentPromptKind, GameState } from '../../state/types';

/**
 * The pacing contract.
 *
 * Seven independent systems can each demand the player's attention, and left to themselves
 * they turn the run into a slideshow of modals with no play between them. Everything about
 * *when* the game interrupts lives here, in one readable table, rather than being smeared
 * across each system's tick.
 */

/** Ticks of real play required between one prompt being raised and the next. */
const MIN_GAP_TICKS = 2;

/** Ticks a kind stays quiet after being answered. Event-driven kinds are absent on purpose. */
const PROMPT_COOLDOWN: Partial<Record<AscentPromptKind, number>> = {
  'conquer-target': 3,
  'court-appointment': 2,
  'law-choice': 6,
  envoy: 10,
};

/**
 * Ticks of nothing-to-do before the director stops waiting for a natural trigger and raises
 * the best available prompt anyway. This is the mechanical guarantee behind "the run never
 * has a stretch where there is nothing new".
 */
const STARVATION_TICKS = 4;

/**
 * Order the director tries kinds in. Time-critical first, then the follow-up that finishes a
 * decision already begun, then the choices that move the run forward, then rewards — a wave
 * landing must never be buried behind a card draft.
 */
const CONSIDER_ORDER: AscentPromptKind[] = [
  // Rivals speak first among the scheduled cards: a demand is time-critical in a way a
  // card draft is not, and it is the pressure that was missing from the run entirely.
  'rival-demand',
  'court-appointment',
  'conquer-target',
  'power-draft',
  'hero-choice',
  'law-choice',
  'parliament',
  'envoy',
];

export function tickPromptCooldowns(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  for (const kind of Object.keys(ascent.promptCooldowns) as AscentPromptKind[]) {
    const value = ascent.promptCooldowns[kind] ?? 0;
    if (value <= 1) delete ascent.promptCooldowns[kind];
    else ascent.promptCooldowns[kind] = value - 1;
  }
  progressAscentCourtCooldown(state);
  tickRivalCooldowns(state);
}

/** Starts a kind's quiet period. Called by the resolver when a prompt is answered. */
export function startPromptCooldown(state: GameState, kind: AscentPromptKind): void {
  const ascent = state.ascent;
  const ticks = PROMPT_COOLDOWN[kind];
  if (!ascent || !ticks) return;
  ascent.promptCooldowns[kind] = ticks;
}

// ── Readiness ───────────────────────────────────────────────────────────────

/** True when a kind has something real to say — not merely that its timer elapsed. */
function isReady(state: GameState, kind: AscentPromptKind): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  if ((ascent.promptCooldowns[kind] ?? 0) > 0) return false;

  switch (kind) {
    case 'court-appointment':
      return Boolean(findHeroNeedingPosting(state));

    case 'conquer-target': {
      if (ascent.marchCooldown > 0) return false;
      // Only worth asking when a host is actually free to act on the answer, or when a
      // bloodless method (bribe, claim, settle) is affordable regardless of armies.
      const idleHost = state.armies.some(
        (army) =>
          army.kingdomId === PLAYER_KINGDOM_ID &&
          !state.movementOrders.some((order) => order.armyId === army.id) &&
          !state.siegeOrders.some((order) => order.armyId === army.id),
      );
      const targets = buildConquestTargets(state);
      const takeable = targets.filter((target) => target.methods.some((method) => !method.blockedReason));
      if (takeable.length === 0) return false;
      return idleHost || takeable.some((target) =>
        target.methods.some((method) => !method.blockedReason && method.method !== 'siege' && method.method !== 'occupy'));
    }

    case 'power-draft':
      return ascent.pendingLevelUps > 0;

    case 'hero-choice':
      // Two sources: the court's Favor draft has already paid out, or a wave milestone is due.
      return Boolean(state.activeHeroDraft?.length)
        || (Math.floor(ascent.wavesSurvived / SUMMON_EVERY_N_WAVES) > ascent.summonsDone && state.heroDeck.length > 0);

    case 'law-choice':
      return buildLawOptions(state).length > 0;

    case 'parliament':
      return ascent.courtCardCooldown <= 0 && state.politicsDeck.length > 0;

    // `pickEnvoyTarget` already filters to courts worth visiting, so a target existing *is*
    // the readiness condition.
    case 'envoy':
      return Boolean(pickEnvoyTarget(state));

    case 'rival-demand':
      return rivalDemandReady(state);

    default:
      return false;
  }
}

/** Raises one prompt of the given kind. Returns false when its producer declined. */
function raise(state: GameState, kind: AscentPromptKind): boolean {
  switch (kind) {
    case 'court-appointment': {
      const hero = findHeroNeedingPosting(state);
      return Boolean(hero && offerAppointment(state, hero.id));
    }
    case 'conquer-target':
      return offerConquestPrompt(state);
    case 'power-draft':
      offerPowerDraft(state);
      return true;
    case 'hero-choice':
      return offerHeroSummon(state);
    case 'law-choice':
      return offerLawChoice(state);
    case 'parliament':
      return offerParliament(state);
    case 'envoy':
      return offerEnvoy(state);
    case 'rival-demand':
      return offerRivalDemand(state);
    default:
      return false;
  }
}

/**
 * Raises at most one prompt per tick.
 *
 * A wave response or a run ending is queued by its own system and outranks anything decided
 * here — this only governs the seven recurring decisions. Those two deliberately bypass the
 * gap rule (a host arriving cannot wait two seasons for a polite pause), which is why they are
 * not in `CONSIDER_ORDER`; everything scheduled here does respect it.
 */
export function tickDecisionDirector(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  // Something is already waiting: do not stack a second decision behind it.
  if (state.pendingAscentPrompt || ascent.promptQueue.length > 0) return;

  const starving = ascent.idleTicks >= STARVATION_TICKS;
  if (!starving && state.turn - ascent.lastPromptTurn < MIN_GAP_TICKS) return;

  for (const kind of CONSIDER_ORDER) {
    if (!isReady(state, kind)) continue;
    if (!raise(state, kind)) continue;
    // `lastPromptTurn` is stamped by `drainAscentPrompts`, which every prompt passes through.
    ascent.idleTicks = 0;
    return;
  }

  // Nothing was ready. When that persists, `refreshAscentLaneState` keeps raising
  // `decisionPressure`, which the HUD reads to nudge the player toward a lane button.
}
