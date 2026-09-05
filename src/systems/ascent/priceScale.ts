/**
 * The scaled purse: what the realm's routine purchases cost once the realm has outgrown the
 * opening.
 *
 * Every price the war card quotes — walls, sellswords, a buy-off, a gift, an oath — is already
 * pegged to income, so a rich realm keeps deciding about them. The *economy's* prices were not:
 * a farm was 32 gold, a bribed village ~55, a minimum host 70, a reroll 68, a burnt district a
 * few dozen, from the founding to the fall. Measured on a steward's run (focus by aptitude,
 * governors posted, disciplined spending), gross gold went 80 → 330 a season by wave 15 while
 * every one of those prices stood still; the treasury banked 2,500-5,900 with nothing left in
 * it to decide, and the run's economy stopped being a game at about the point it started
 * working. Reported as *"resources become useless in late game when already have a lot"*.
 *
 * The scale is a **sub-linear** function of gross income, not of the treasury. Stock-based
 * pricing is a treadmill — a price that is always a share of what you hold can never be saved
 * toward, and it rewards spending before the price rises. Income-based pricing keeps the shape
 * of every decision ("this is two seasons of income") while a richer realm can still afford
 * *more* decisions per season: at the exponent below a realm earning five times the base pays
 * about two and a half times the price. Growth is still worth having; a single purchase is
 * never again a rounding error.
 *
 * Smoothed toward the live figure a step a season, so a price quoted on a card is the price
 * charged when the card is answered a season or two later — gross moves the tick a province is
 * taken or lost, and a muster card that quoted 180 and charged 205 would be a card that lied.
 *
 * A leaf module on purpose: `ResourceSystem`, `AcquisitionSystem`, `WarSystem` and the Ascent
 * systems all read it, and `ResourceSystem` <-> `CourtSystem` already form an import cycle.
 */
import {
  PRICE_SCALE_BASE_GROSS,
  PRICE_SCALE_EXPONENT,
  PRICE_SCALE_MAX,
  PRICE_SCALE_SMOOTHING,
  TREASURY_GRAFT_FROM,
  TREASURY_GRAFT_SEASONS,
} from '../../game/ascentConfig';
import type { GameState, ResourceBag } from '../../state/types';

/** Gross gold a season as the books last recorded it. Zero before the first tick. */
export function realmGrossGold(state: GameState): number {
  return Math.max(0, state.ascentLedger?.gold.gross ?? 0);
}

/** Where the scale is heading: the live figure, before smoothing. */
export function targetPriceScale(state: GameState): number {
  if (state.gameMode !== 'ascent') return 1;
  const gross = realmGrossGold(state);
  if (gross <= PRICE_SCALE_BASE_GROSS) return 1;
  return Math.min(PRICE_SCALE_MAX, Math.pow(gross / PRICE_SCALE_BASE_GROSS, PRICE_SCALE_EXPONENT));
}

/**
 * The multiplier every routine price wears right now. Exactly 1 outside Dragon Ascent, so the
 * classic economies keep their numbers to the digit.
 */
export function realmPriceScale(state: GameState): number {
  if (state.gameMode !== 'ascent' || !state.ascent) return 1;
  return state.ascent.priceScale ?? 1;
}

/** Steps the smoothed scale toward the live one. Called once per Ascent tick, after the books close. */
export function tickPriceScale(state: GameState): void {
  const ascent = state.ascent;
  if (state.gameMode !== 'ascent' || !ascent) return;
  const target = targetPriceScale(state);
  const current = ascent.priceScale ?? 1;
  const next = current + (target - current) * PRICE_SCALE_SMOOTHING;
  // Two decimals: enough that a quoted price never drifts by a whole coin between seasons.
  ascent.priceScale = Math.round(next * 100) / 100;
}

/** A cost with every resource scaled, rounded up so a scaled price is never below the base one. */
export function scaledCost(state: GameState, cost: Partial<ResourceBag>): Partial<ResourceBag> {
  const scale = realmPriceScale(state);
  if (scale === 1) return cost;
  const out: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(cost) as [keyof ResourceBag, number | undefined][]) {
    if (value === undefined) continue;
    out[key] = Math.ceil(value * scale);
  }
  return out;
}

/**
 * The treasury above which graft begins. A flat 4,000 was calibrated for a realm grossing a few
 * hundred a season; a realm grossing more saves toward larger things (a mercenary company is nine
 * seasons of income) and must not be taxed for holding what one of them costs.
 */
export function treasuryGraftFrom(state: GameState): number {
  return Math.max(TREASURY_GRAFT_FROM, Math.round(realmGrossGold(state) * TREASURY_GRAFT_SEASONS));
}
