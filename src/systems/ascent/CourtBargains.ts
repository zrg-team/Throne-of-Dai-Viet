/**
 * **Two bargains that need a warm court: calling a host home, and trading grain for coin.**
 *
 * Both exist to give a relationship a use the player reaches for *during* a crisis rather than
 * between them. Standing that only pays off eventually is standing the player forgets to build.
 */
import {
  BUYOFF_GOLD_PER_TICK_PER_HUNDRED,
  BUYOFF_MIN_RELATIONS,
  CAMPAIGN_TICKS_BASE,
} from '../../game/ascentConfig';
import { hasModifier } from '../DiplomacySystem';
import { TRADE_CHARTER_ID } from '../ForeignAffairsSystem';
import { pushToast } from '../empire/notifications';
import { farthestNeutralFromCapital } from '../empire/InvasionSystem';
import { t } from '../../i18n';
import type { GameState, InvasionRecord, Kingdom } from '../../state/types';

// ── Asking a court to call its host home ────────────────────────────────────

/** The court's hosts currently standing on our map, freshest first. */
export function hostsInTheField(state: GameState, kingdomId: string): InvasionRecord[] {
  return (state.invasions ?? [])
    .filter((record) => record.kingdomId === kingdomId && !record.pillaged)
    .sort((a, b) => (b.campaignTicks ?? CAMPAIGN_TICKS_BASE) - (a.campaignTicks ?? CAMPAIGN_TICKS_BASE));
}

/**
 * What it costs to buy one host off the field.
 *
 * Priced against **what the court would be giving up** — the season it has left times the men it
 * has in the field — rather than a flat figure. So buying off a fresh invasion is ruinous and
 * buying off a spent one is merely expensive, which makes *when* to ask the decision rather than
 * whether the option exists.
 *
 * It is deliberately a use for gold at the exact moment the player most wants one. The emergency
 * levy answers a crisis with men; this answers it with a relationship, and a run that invested in
 * the courts should have an answer a run that invested in walls does not.
 */
export function buyoffCost(state: GameState, record: InvasionRecord): number {
  const army = state.armies.find((candidate) => candidate.id === record.armyId);
  const men = army ? army.units.spearmen + army.units.archers + army.units.heavyInfantry : 400;
  const seasons = Math.max(1, record.campaignTicks ?? CAMPAIGN_TICKS_BASE);
  return Math.round(seasons * (men / 100) * BUYOFF_GOLD_PER_TICK_PER_HUNDRED);
}

/** Whether this court will hear the offer, and why not if it will not. */
export function buyoffRefusal(state: GameState, kingdom: Kingdom): 'standing' | 'no-host' | undefined {
  if ((kingdom.relations ?? 50) < BUYOFF_MIN_RELATIONS) return 'standing';
  if (hostsInTheField(state, kingdom.id).length === 0) return 'no-host';
  return undefined;
}

/**
 * Pays a court to withdraw its most committed host.
 *
 * Turns it for home through the same `pillaged` path a spent raider uses, so nothing downstream
 * needs to learn a new state — the host marches to the frontier and despawns, and the war board,
 * the map markers and the wave director's slot count all follow on their own.
 */
export function buyOffHost(state: GameState, kingdomId: string): boolean {
  const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
  if (!kingdom || buyoffRefusal(state, kingdom)) return false;

  const record = hostsInTheField(state, kingdomId)[0];
  if (!record) return false;
  const cost = buyoffCost(state, record);
  if (state.resources.gold < cost) return false;

  state.resources.gold -= cost;
  record.plan = 'withdrawing';
  record.pillaged = true;
  record.exitLandId = farthestNeutralFromCapital(state)?.id;
  // A besieger called home lifts its siege first, or the province it was told to leave falls to
  // it anyway on the next pass.
  const army = state.armies.find((candidate) => candidate.id === record.armyId);
  const siege = army && state.siegeOrders.find((order) => order.armyId === army.id);
  if (army && siege) {
    state.siegeOrders = state.siegeOrders.filter((order) => order !== siege);
    army.landId = siege.fromLandId;
  }
  pushToast(state, t('ascent.envoy.buyoffDone', { kingdom: kingdom.name }), 'reward');
  return true;
}

// ── The exchange ────────────────────────────────────────────────────────────

/**
 * Gold a hundred grain fetches at this court, and what a hundred costs to buy from them.
 *
 * The rate is the court's own: an `economic` power with its granaries full sells cheap and pays
 * little; a court whose stability has collapsed is hungry and will pay dearly for rice. That is
 * the whole reason this mechanic earns its place — it gives the four courts *different economies*
 * rather than different numbers, and turns a relationship into infrastructure the player checks
 * on rather than a figure they nudge upward.
 */
export function exchangeRate(kingdom: Kingdom): { buy: number; sell: number } {
  const hunger = Math.min(1, Math.max(0, (60 - (kingdom.stability ?? 50)) / 60));
  const plenty = kingdom.personality === 'economic' ? 0.75 : 1;
  // What they pay us for grain rises with their hunger; what they charge us for it rises too.
  return {
    sell: Math.round((22 + hunger * 46) * (2 - plenty)),
    buy: Math.round((34 + hunger * 60) * plenty),
  };
}

/**
 * A charter has to be standing — this is what a trade agreement is finally *for*.
 *
 * `proposeTrade` used to buy twenty gold and a decaying goodwill and nothing else, which made it
 * the option nobody took. Now it opens the exchange for as long as it holds.
 */
export function canTrade(kingdom: Kingdom): boolean {
  return hasModifier(kingdom, TRADE_CHARTER_ID);
}

/** Sells grain for coin (`'sell'`) or buys it with coin (`'buy'`), a hundred at a time. */
export function tradeGrain(state: GameState, kingdomId: string, way: 'buy' | 'sell', lots = 1): boolean {
  const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
  if (!kingdom || !canTrade(kingdom)) return false;
  const rate = exchangeRate(kingdom);
  const food = 100 * lots;

  if (way === 'sell') {
    if (state.resources.food < food) return false;
    state.resources.food -= food;
    state.resources.gold += rate.sell * lots;
    return true;
  }
  const cost = rate.buy * lots;
  if (state.resources.gold < cost) return false;
  state.resources.gold -= cost;
  state.resources.food += food;
  return true;
}
