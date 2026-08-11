import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { FAMINE_MIN_GAP_TICKS, SUMMON_EVERY_N_WAVES } from '../../game/ascentConfig';
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
import { famineReady, offerFamine, tickFamineCooldown } from './FamineSystem';
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

/**
 * Ticks of real play required between one prompt being raised and the next.
 *
 * Measured at 2, a full run raised ~250 prompts across 320 ticks — one decision every 1.3
 * seasons, roughly every four seconds of wall clock. Half of all ticks ended with a modal
 * open, so the map (the mode's entire art surface, and the thing the autopilot is doing all
 * its work on) was never on screen. The fantasy is "watch your realm fight, step in at the
 * moments that matter"; at a two-tick gap there are no moments that don't matter.
 */
const MIN_GAP_TICKS = 4;

/**
 * Ticks a kind stays quiet after being answered. Event-driven kinds are absent on purpose.
 *
 * `conquer-target` is deliberately the longest of the recurring three. It fires as a *pair*
 * (province, then method), so at a 3-tick cooldown it alone accounted for ~46% of every
 * decision in a run — and the answer was "bribe" 68–90% of the time. Making the same choice
 * fifty times is not a decision, it is data entry.
 *
 * 6 rather than 9: at 9 the realm finished a run holding three to five provinces where it had
 * held twenty-four to thirty-two, and a map that never visibly grows is its own kind of dead
 * run. This is the dial that trades map growth against prompt fatigue.
 */
const PROMPT_COOLDOWN: Partial<Record<AscentPromptKind, number>> = {
  'conquer-target': 6,
  'court-appointment': 5,
  'law-choice': 8,
  envoy: 12,
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
/**
 * Ticks a ready kind may sit outranked before it jumps the queue.
 *
 * A strict priority list starves its own tail. Measured after the gap between prompts was
 * widened to 4: `hero-choice`, `law-choice`, `parliament` and `envoy` fired **zero** times in
 * a 320-tick run at every seed — the first four kinds consumed every slot. Losing the champion
 * summon in particular guts the mode, since the roster and the gacha are its identity.
 *
 * Ageing keeps the ordering meaningful for ordinary contention while guaranteeing that
 * anything with something to say is eventually heard. Counted in real ticks — see the loop in
 * `tickDecisionDirector`, which is why it sits above the gap gate rather than below it.
 *
 * Tuned rather than reasoned: promoting the summon by *reordering* the list instead simply
 * inverted the problem — heroes and their postings took 35% of a run's decisions and the realm
 * stopped expanding at four provinces. Ageing gives the tail a floor without giving it a
 * monopoly.
 */
const KIND_STARVATION_TICKS = 18;

const CONSIDER_ORDER: AscentPromptKind[] = [
  // Famine leads. It is the only scheduled card whose subject is actively costing the realm
  // something every tick it waits, and it was the undiagnosed cause of most lost runs.
  'famine',
  // Rivals speak next among the scheduled cards: a demand is time-critical in a way a
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
  tickFamineCooldown(state);
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

    case 'famine':
      return famineReady(state);

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
    case 'famine':
      return offerFamine(state);

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

  ascent.promptWaiting ??= {};
  const ready = CONSIDER_ORDER.filter((kind) => isReady(state, kind));

  // Age every kind that has something to say, on every tick.
  //
  // Deliberately above the gates below: counting only the ticks on which the director got as
  // far as choosing meant a threshold of 14 was really 14 *raise opportunities*, roughly forty
  // seasons, and the champion summon surfaced two or three times in an entire run. Ageing in
  // real ticks is what makes the number below mean what it says.
  for (const kind of CONSIDER_ORDER) {
    if (ready.includes(kind)) ascent.promptWaiting[kind] = (ascent.promptWaiting[kind] ?? 0) + 1;
    else delete ascent.promptWaiting[kind];
  }

  // Something is already waiting: do not stack a second decision behind it.
  if (state.pendingAscentPrompt || ascent.promptQueue.length > 0) return;

  // Famine bypasses the gap rule, like a wave landing does.
  //
  // It is the one scheduled kind whose readiness is both *transient* and *actively expensive*:
  // the granary crosses into the danger band for a few scattered seasons at a time, and every
  // one of those seasons is costing morale and population. Measured, the crisis was readable on
  // 16 ticks of a 200-tick run and the gap rule swallowed all 16 — the card existed, was
  // correctly wired, and never once appeared. A rule meant to stop modal spam should not be
  // able to suppress the emergency it most needs to surface.
  // Still never on the very next tick, though: the gap rule exists to stop modal chains, and
  // an urgent card is allowed to jump the queue without being allowed to spam it.
  const famineGapOk = state.turn - ascent.lastPromptTurn >= FAMINE_MIN_GAP_TICKS;
  if (ready[0] === 'famine' && famineGapOk && raise(state, 'famine')) {
    delete ascent.promptWaiting.famine;
    ascent.idleTicks = 0;
    return;
  }

  const starving = ascent.idleTicks >= STARVATION_TICKS;
  if (!starving && state.turn - ascent.lastPromptTurn < MIN_GAP_TICKS) return;

  const overdue = ready
    .filter((kind) => (ascent.promptWaiting?.[kind] ?? 0) >= KIND_STARVATION_TICKS)
    .sort((a, b) => (ascent.promptWaiting?.[b] ?? 0) - (ascent.promptWaiting?.[a] ?? 0));

  for (const kind of [...overdue, ...ready]) {
    if (!raise(state, kind)) continue;
    // `lastPromptTurn` is stamped by `drainAscentPrompts`, which every prompt passes through.
    delete ascent.promptWaiting[kind];
    ascent.idleTicks = 0;
    return;
  }

  // Nothing was ready. When that persists, `refreshAscentLaneState` keeps raising
  // `decisionPressure`, which the HUD reads to nudge the player toward a lane button.
}
