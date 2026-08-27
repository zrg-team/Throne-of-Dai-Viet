import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  MAX_ARMY_SOLDIERS,
  MIN_ARMY_SOLDIERS,
  MIN_MUSTER_SUPPLY_SHARE,
  RECRUIT_HUMAN_RESERVE,
  SUPPLY_FOOD_RESERVE,
  SUPPLY_STORE_RESERVE,
  SUPPLY_TICKS_HELD,
  recruitSoldiers,
} from '../../game/ascentConfig';
import { releaseHeroAssignment } from '../CourtSystem';
import { refreshAllLandOutputs } from '../ResourceSystem';
import { getMusterEstimate, getRecruitmentLand, musterLimit, queueRecruitment } from '../WarSystem';
import { pushToast } from '../empire/notifications';
import { chargeAmbition } from './AmbitionSystem';
import { findFreeCommander } from './AutopilotSystem';
import { heroName, t } from '../../i18n';
import type { ArmyComposition, ArmyOrders, GameState, Land } from '../../state/types';

/**
 * Raising a host by hand (Dragon Ascent).
 *
 * The Army lane's "raise a host" used to be one tap: `raiseHostNow` picked the commander, the
 * size, the baggage and the doctrine, and the player learned what they had bought when it
 * mustered. The form now shows every one of those and lets the player set them, with the same
 * limits the autopilot keeps and the same arithmetic `queueRecruitment` will run — so the number
 * the form quotes is the number the muster costs.
 */

/** What the raise-host form submits. */
export interface MusterPlan {
  heroId?: string;
  soldiers: number;
  rations: number;
  provisions: number;
  composition: ArmyComposition;
  orders: ArmyOrders;
}

export interface MusterLimits {
  land?: Land;
  minSoldiers: number;
  maxSoldiers: number;
  /** Food and supplies the realm can hand over above its own reserves. */
  foodSpare: number;
  suppliesSpare: number;
  /** Food and supplies the realm holds at all. */
  foodHeld: number;
  suppliesHeld: number;
}

export function musterLimits(state: GameState): MusterLimits {
  // What the realm can pay for, not a flat number. `musterLimit` reads people, purse and stores
  // through the same superlinear price `queueRecruitment` charges — see `musterCost`. The old
  // ceiling was `MAX_ARMY_SOLDIERS`, a constant of 2,200 with nothing behind it, and it was
  // reported as exactly the wall it was.
  return {
    land: getRecruitmentLand(state),
    minSoldiers: MIN_ARMY_SOLDIERS,
    maxSoldiers: Math.max(MIN_ARMY_SOLDIERS, musterLimit(state)),
    foodSpare: Math.max(0, Math.floor(state.resources.food - SUPPLY_FOOD_RESERVE)),
    suppliesSpare: Math.max(0, Math.floor(state.resources.supplies - SUPPLY_STORE_RESERVE)),
    foodHeld: Math.max(0, Math.floor(state.resources.food)),
    suppliesHeld: Math.max(0, Math.floor(state.resources.supplies)),
  };
}

/** Rations and provisions a host of this size carries for `SUPPLY_TICKS_HELD` seasons. */
export function fullBaggage(soldiers: number): { rations: number; provisions: number } {
  return {
    rations: Math.max(1, Math.ceil(soldiers / 100)) * SUPPLY_TICKS_HELD,
    provisions: Math.max(1, Math.ceil(soldiers / 150)) * SUPPLY_TICKS_HELD,
  };
}

/** Seasons a host of `soldiers` eats on `rations`, mirroring `progressArmyLogistics`. */
export function baggageSeasons(soldiers: number, rations: number, provisions: number): { food: number; goods: number } {
  return {
    food: Math.floor(rations / Math.max(1, Math.ceil(soldiers / 100))),
    goods: Math.floor(provisions / Math.max(1, Math.ceil(soldiers / 150))),
  };
}

/**
 * The plan the form opens with — exactly what `raiseHostNow` would have raised: as many men as
 * the land and the granary can carry, a full baggage train if the stores allow, balanced
 * doctrine, and a standing order to hold the province it musters at.
 */
export function defaultMusterPlan(state: GameState, heroId?: string): MusterPlan {
  const limits = musterLimits(state);
  const rationsPerSoldier = (SUPPLY_TICKS_HELD / 100) * MIN_MUSTER_SUPPLY_SHARE;
  const soldiersTheFarmsCanFeed = Math.floor(limits.foodSpare / rationsPerSoldier);
  const soldiers = Math.max(
    limits.minSoldiers,
    Math.min(recruitSoldiers(Math.max(0, state.resources.humans - RECRUIT_HUMAN_RESERVE)), soldiersTheFarmsCanFeed, limits.maxSoldiers),
  );
  const want = fullBaggage(soldiers);
  return {
    heroId: heroId ?? findFreeCommander(state),
    soldiers,
    rations: Math.min(want.rations, limits.foodSpare),
    provisions: Math.min(want.provisions, limits.suppliesSpare),
    composition: 'balanced',
    orders: { kind: 'defend', landId: limits.land?.id ?? '' },
  };
}

/** Why the plan cannot be mustered as it stands, or nothing when it can. */
export function musterBlockedReason(state: GameState, plan: MusterPlan): string | undefined {
  const limits = musterLimits(state);
  const estimate = getMusterEstimate(state, plan.soldiers);
  if (!plan.heroId) return t('ascent.raise.blocked.commander');
  const hero = state.heroes.find((candidate) => candidate.id === plan.heroId);
  if (!hero) return t('ascent.raise.blocked.commander');
  const at = hero.assignedTo;
  if (at && (at.startsWith('diplomacy-') || at.startsWith('ambassador:') || state.recruitmentOrders.some((order) => order.id === at))) {
    return t('ascent.raise.blocked.commanderBusy', { hero: heroName(hero) });
  }
  // A champion already at the head of a host is not free to raise another. `releaseHeroAssignment`
  // below would happily take them off it — the host keeps its men and loses its general, and the
  // player is never told. A seat or a governorship is different: those are postings a muster is
  // *meant* to be able to call someone back from, which is why only the field is blocked here.
  if (state.armies.some((army) => army.generalHeroId === hero.id)) {
    return t('ascent.raise.blocked.commanderHost', { hero: heroName(hero) });
  }
  if (!estimate.land) return t('msg.noOwnedCityArmy');
  if (estimate.alreadyTraining) {
    return t('ascent.raise.blocked.training', { land: estimate.land.name, n: estimate.trainingTicksLeft });
  }
  if (plan.soldiers > state.resources.humans - RECRUIT_HUMAN_RESERVE) {
    return t('ascent.raise.blocked.people', { have: Math.floor(state.resources.humans), need: plan.soldiers + RECRUIT_HUMAN_RESERVE, reserve: RECRUIT_HUMAN_RESERVE });
  }
  if (plan.rations > limits.foodHeld) {
    return t('ascent.raise.blocked.food', { have: limits.foodHeld, need: plan.rations });
  }
  const suppliesNeed = estimate.suppliesCost + plan.provisions;
  if (suppliesNeed > limits.suppliesHeld) {
    return t('ascent.raise.blocked.supplies', { have: limits.suppliesHeld, need: suppliesNeed });
  }
  return undefined;
}

/**
 * Musters the plan. A commander taken from a seat or a province is released first (the muster
 * refuses a posted hero); the standing order rides on the recruitment order and lands on the host.
 */
export function raiseHostWithPlan(state: GameState, plan: MusterPlan): { ok: boolean; reason?: string } {
  const reason = musterBlockedReason(state, plan);
  if (reason) return { ok: false, reason };
  const hero = state.heroes.find((candidate) => candidate.id === plan.heroId)!;
  if (hero.assignedTo) {
    const wasGovernor = state.lands.some((land) => land.id === hero.assignedTo);
    releaseHeroAssignment(state, hero);
    if (wasGovernor) refreshAllLandOutputs(state);
  }
  const limits = musterLimits(state);
  const soldiers = Math.max(limits.minSoldiers, Math.min(limits.maxSoldiers, Math.floor(plan.soldiers)));
  const orders: ArmyOrders = plan.orders.kind === 'defend' && !plan.orders.landId
    ? { kind: 'defend', landId: limits.land?.id ?? '' }
    : plan.orders;
  const before = state.message;
  const ok = queueRecruitment(state, hero.id, soldiers, plan.rations, plan.provisions, plan.composition, orders);
  if (!ok) return { ok: false, reason: state.message !== before ? state.message : undefined };
  chargeAmbition(state, 'host');
  const estimate = getMusterEstimate(state, soldiers);
  pushToast(state, t('ascent.raise.queued', {
    hero: heroName(hero),
    n: soldiers,
    land: estimate.land?.name ?? '',
    ticks: state.recruitmentOrders.find((order) => order.heroId === hero.id)?.required ?? estimate.ticks,
  }), 'info');
  return { ok: true };
}

/** Every muster under way, for the Army lane's muster section. */
export function musterRows(state: GameState): Array<{ orderId: string; land?: Land; heroName: string; soldiers: number; progress: number; required: number; composition: ArmyComposition; orders?: ArmyOrders }> {
  return state.recruitmentOrders.map((order) => {
    const hero = state.heroes.find((candidate) => candidate.id === order.heroId);
    return {
      orderId: order.id,
      land: state.lands.find((land) => land.id === order.landId && land.ownerId === PLAYER_KINGDOM_ID),
      heroName: hero ? heroName(hero) : '—',
      soldiers: order.totalSoldiers,
      progress: order.progress,
      required: order.required,
      composition: order.composition ?? 'balanced',
      orders: order.orders,
    };
  });
}
