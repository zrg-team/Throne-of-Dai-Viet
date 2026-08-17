import type { GameState, TaxPolicy } from '../state/types';

/**
 * The tax dial as a continuous 0..1 rate.
 *
 * Dragon Ascent sets `state.taxRate` from a slider; empire mode and older saves only carry the
 * three-stance `taxPolicy`, so the stances map onto the points of the dial that reproduce their
 * exact classic numbers (lenient ×0.82 gold at 0.2, harsh ×1.28 at 0.8 — see `taxGoldMult`).
 *
 * Deliberately a leaf module: both ResourceSystem and CourtSystem need these curves, and those
 * two are not allowed to import each other.
 */
export function currentTaxRate(state: GameState): number {
  if (typeof state.taxRate === 'number') return Math.max(0, Math.min(1, state.taxRate));
  switch (state.taxPolicy ?? 'balanced') {
    case 'lenient': return 0.2;
    case 'harsh': return 0.8;
    default: return 0.5;
  }
}

/** ×0.7 at the dial's floor, ×1.0 dead centre, ×1.3 wide open. */
export function taxGoldMult(rate: number): number {
  return Number((1 + (rate - 0.5) * 0.6).toFixed(2));
}

/**
 * Per-tick stability drift from the stance alone, fatigue not included.
 *
 * Two slopes rather than one so the classic stances keep their exact old numbers: +0.4 at the
 * lenient point (0.2) and −0.5 at the harsh point (0.8) — squeezing always hurt a little more
 * than easing off helped, and that asymmetry is kept.
 */
export function taxStabilityBase(rate: number): number {
  const lean = 0.5 - rate;
  return Number((lean >= 0 ? lean * (0.4 / 0.3) : lean * (0.5 / 0.3)).toFixed(2));
}

/** Population growth delta: +2 at the lenient point, −2 at the harsh point. */
export function taxGrowthDelta(rate: number): number {
  return Number(((0.5 - rate) * (2 / 0.3)).toFixed(1));
}

/**
 * Per-tick fatigue drift. Past 0.65 resentment compounds (the classic harsh stance lands at
 * +0.6/tick); below 0.35 it heals fast (lenient lands at −0.8); the middle band heals slowly.
 */
export function taxFatigueDrift(rate: number): number {
  if (rate > 0.65) return Number(((rate - 0.65) * 4).toFixed(2));
  if (rate < 0.35) return -Number(((0.35 - rate) * (0.8 / 0.15)).toFixed(2));
  return -0.3;
}

/** The stance a given dial position reads as, for everything that still thinks in stances. */
export function policyForRate(rate: number): TaxPolicy {
  if (rate < 0.35) return 'lenient';
  if (rate > 0.65) return 'harsh';
  return 'balanced';
}

/** Writes the dial. Keeps `taxPolicy` in step so stance-readers stay coherent with the slider. */
export function setTaxRate(state: GameState, rate: number): void {
  state.taxRate = Math.max(0, Math.min(1, rate));
  state.taxPolicy = policyForRate(state.taxRate);
}
