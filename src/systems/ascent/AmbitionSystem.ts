import { hasCapstone } from '../decree/SchoolSystem';
import { marchSouth, NAM_TIEN_AMBITION_MULT } from '../decree/rules';
import {
  AMBITION_DECAY_PER_WAVE,
  AMBITION_HEAT_MAX,
  AMBITION_PER_HOST,
  AMBITION_PER_POWER_CARD,
  AMBITION_PER_PROVINCE,
  AMBITION_PRESSURE_PER_POINT,
  AMBITION_SPOILS_SEASONS,
} from '../../game/ascentConfig';
import { applyResourceDelta } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { t } from '../../i18n';
import type { AmbitionReason, GameState } from '../../state/types';

/**
 * Ambition: the realm's growth, priced.
 *
 * Every act that makes the realm larger adds to a counter, the counter multiplies the next
 * wave, and it decays when the realm consolidates. That is the entire system — one number
 * doing two jobs, which is what makes the decision honest: the same figure that buys the
 * run's rewards is the figure that sizes the thing coming to take them back.
 *
 * The rule for what charges: **the realm gained something durable.** A province joining the
 * realm charges whether the player ordered it or the autopilot bought it — an empire that
 * grows in its sleep still draws attention, and exempting routine expansion would let a
 * passive run accumulate a free realm. What does *not* charge is anything the player cannot
 * see themselves choosing: buildings and upgrades fire several times a season from the
 * autopilot, and folding them in would swamp the counter with noise nobody could read,
 * which is the failure this replaced in the first place.
 */

/** What each act of growth costs. */
export const AMBITION_COSTS: Record<AmbitionReason, number> = {
  province: AMBITION_PER_PROVINCE,
  card: AMBITION_PER_POWER_CARD,
  host: AMBITION_PER_HOST,
};

/** Standing ambition — what the next wave will be sized against. */
export function ambitionOf(state: GameState): number {
  return Math.max(0, state.ascent?.ambition ?? 0);
}

/**
 * The multiplier a given standing ambition puts on a wave.
 *
 * Capped: a player who spends everything in one season should meet a monster, not an
 * arithmetic certainty. A run that cannot be recovered from is a run nobody finishes.
 *
 * Takes the bare number rather than the state so the HUD can quote the same figure the wave
 * director will use, without either of them owning the formula.
 */
export function heatFor(ambition: number): number {
  return Math.min(AMBITION_HEAT_MAX, 1 + Math.max(0, ambition) * AMBITION_PRESSURE_PER_POINT);
}

/** The multiplier standing ambition puts on the next wave. */
export function ambitionHeat(state: GameState): number {
  return heatFor(ambitionOf(state));
}

/**
 * Charges ambition for an act of growth.
 *
 * `times` exists for the batch case — several provinces can join in one tick when a claim and
 * a siege land together, and charging once would under-price the season.
 */
export function chargeAmbition(state: GameState, reason: AmbitionReason, times = 1): void {
  const ascent = state.ascent;
  if (!ascent || times <= 0) return;

  // Nam tiến — the March South. Four centuries of Lê and Nguyễn expansion, and the only decree in
  // the game that touches this dial. Taking ground still charges ambition, but at half rate, so an
  // expansionist run stops being punished by its own central mechanic for doing the thing it is
  // built to do. Costed dearly on the other side: three weight, and twelve points of Sĩ.
  // The two discounts do NOT stack. Multiplied, Nam tiến's 0.5 and Trúc Lâm's 0.6 become 0.3, and a
  // realm holding both outgrows the only pressure this mode has: measured, waves fell to under a
  // tenth of the realm's defence and `verify-ascent`'s "waves track the realm" check went red. The
  // better of the two applies, so each decree is worth exactly what its card says and no more.
  const discounts = [
    marchSouth(state) ? NAM_TIEN_AMBITION_MULT : 1,
    hasCapstone(state, 'phat') ? 0.6 : 1,
  ];
  const cost = AMBITION_COSTS[reason] * times * Math.min(...discounts);
  ascent.ambition = ambitionOf(state) + cost;
  ascent.ambitionSpent = (ascent.ambitionSpent ?? 0) + cost;
  // What the player spent *this* cycle, so the Court phase can show the dial climbing as they
  // commit rather than only reporting the total after the fact.
  ascent.ambitionThisWave = (ascent.ambitionThisWave ?? 0) + cost;
}

/**
 * Sheds a share of standing ambition. Called once as each wave is raised, so "hold and
 * consolidate" is a move with a mechanical payoff rather than a way of skipping your turn.
 */
export function decayAmbition(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  ascent.ambition = Math.max(0, ambitionOf(state) * (1 - AMBITION_DECAY_PER_WAVE));
  // Below a point the counter is noise; rounding it away keeps the readout honest and stops a
  // long tail of 0.3s implying the realm is still under suspicion when it plainly is not.
  if (ascent.ambition < 0.5) ascent.ambition = 0;
  ascent.ambitionThisWave = 0;
}

/**
 * Pays the spoils of an ambitious season, on a wave survived.
 *
 * The reward arc: an ambitious realm takes more from the field it held than a cautious one,
 * in manpower to muster with, grain to march on and stores to carry. That is what makes the
 * counter a purchase rather than a tax — the same number that summoned the host pays for the
 * army that meets the next one.
 *
 * Paid off the realm's *own* income, so it scales with the realm rather than needing its own
 * curve, and so it stays a proportional reward on a small realm and a large one alike.
 */
export function payAmbitionSpoils(state: GameState, heat: number): void {
  const over = Math.max(0, heat - 1);
  if (over <= 0) return;

  const rates = state.resourceRates;
  const seasons = AMBITION_SPOILS_SEASONS * over;
  const humans = Math.round(Math.max(0, rates.humans) * seasons);
  const food = Math.round(Math.max(0, rates.food) * seasons);
  const supplies = Math.round(Math.max(0, rates.supplies) * seasons);
  if (humans + food + supplies <= 0) return;

  applyResourceDelta(state, { humans, food, supplies });
  pushToast(state, t('ascent.ambition.spoils', { n: humans }), 'reward');
}

/**
 * Peak ambition reached this run, for the summary. Tracked rather than derived because the
 * counter decays — the interesting number is how far the player pushed it, not where it
 * happened to be when the run ended.
 */
export function recordAmbitionPeak(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.ambitionPeak = Math.max(ascent.ambitionPeak ?? 0, ambitionOf(state));
}
