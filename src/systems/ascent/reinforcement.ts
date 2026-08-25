/**
 * Sending a host to a fight that is already on.
 *
 * The engine has taken relief since the membership rewrite: `enrolArrivals` reads the field fresh
 * every beat, so a host of ours that reaches the province is simply in the line, announced, and
 * worth a jolt of morale. What the game never had was a way to *ask* for it. The army screen
 * offered Defend here / March to / Attack / Follow / Hunt, and a player who worked out that
 * "march to the besieged province" was the reinforce button still had no idea whether the host
 * would arrive before the fight ended — and for our own assaults, on someone else's ground,
 * "march to" did not list the target at all.
 *
 * This module is that question and that answer: who could come, how long they would take, and
 * whether that is soon enough. It files orders only through `setArmyOrders`, like every other
 * hand on a host, so the standing-order rules (one order at a time, never pull a levy, a claim
 * pins) all hold.
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { battleBeatsPerTick } from '../../game/battleOptions';
import { t } from '../../i18n';
import type { Army, AscentBattle, GameState } from '../../state/types';
import { findLand } from '../LandSystem';
import { findLandPath, getTotalPathTicks } from '../WarSystem';
import { isEngagedHost, isPinnedByClaim } from './armyOrders';
import { hostHeadcount } from './battleMembership';
import { setArmyOrders } from './StandingOrders';

export interface ReinforcementCandidate {
  army: Army;
  men: number;
  /** Seasons until it stands in the line; undefined when no road reaches the fight. */
  etaTicks?: number;
  /** Whether that is before the fight's clock runs out. */
  inTime: boolean;
  /** Already marching for this fight. */
  enRoute: boolean;
  /** Why it cannot be sent, when it cannot. */
  blockedReason?: string;
}

/** Seasons the fight has left on its clock, at the player's tempo. */
export function battleTicksLeft(battle: AscentBattle): number {
  return Math.max(1, Math.ceil((battle.totalRounds - battle.round) / battleBeatsPerTick()));
}

/**
 * Where a host would have to stand to be in this fight: the province itself for a defence, any
 * owned province beside it for an assault (attackers stand on their origin — see `beginAssault`).
 */
function rallyPointFor(state: GameState, army: Army, battle: AscentBattle): { landId: string; path: string[] } | undefined {
  const land = findLand(state, battle.landId);
  if (!land) return undefined;
  if (battle.role !== 'offence') {
    if (army.landId === land.id) return { landId: land.id, path: [] };
    const path = findLandPath(state, army.landId, land.id);
    return path ? { landId: land.id, path } : undefined;
  }
  let best: { landId: string; path: string[] } | undefined;
  for (const neighbourId of land.neighbors) {
    const neighbour = findLand(state, neighbourId);
    if (!neighbour || neighbour.ownerId !== PLAYER_KINGDOM_ID) continue;
    if (neighbour.id === army.landId) return { landId: neighbour.id, path: [] };
    const path = findLandPath(state, army.landId, neighbour.id);
    if (path && (!best || path.length < best.path.length)) best = { landId: neighbour.id, path };
  }
  return best;
}

/** True when this host's standing order already points it at this fight. */
export function isMarchingToBattle(army: Army, battle: AscentBattle): boolean {
  const orders = army.orders;
  if (!orders) return false;
  if (battle.role === 'offence') return orders.kind === 'attack' && orders.landId === battle.landId;
  return orders.kind === 'defend' && orders.landId === battle.landId;
}

/** Every host of ours not already in the line, nearest first. */
export function reinforcementCandidates(state: GameState, battle: AscentBattle): ReinforcementCandidate[] {
  const ticksLeft = battleTicksLeft(battle);
  const rows: ReinforcementCandidate[] = [];
  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID || army.isLevy) continue;
    if (isEngagedHost(state, army.id)) continue;
    const men = hostHeadcount(army);
    if (men <= 0) continue;
    const rally = rallyPointFor(state, army, battle);
    const etaTicks = rally ? getTotalPathTicks(state, army, rally.path) : undefined;
    const enRoute = isMarchingToBattle(army, battle);
    let blockedReason: string | undefined;
    if (army.refit) blockedReason = t('ascent.army.refitBusy');
    else if (!rally) blockedReason = t('ascent.reinforce.noRoad');
    else if (isPinnedByClaim(state, army)) blockedReason = t('ascent.reinforce.pinned');
    else if (state.siegeOrders.some((order) => order.armyId === army.id)) blockedReason = t('ascent.reinforce.besieging');
    rows.push({
      army,
      men,
      etaTicks,
      inTime: etaTicks !== undefined && etaTicks < ticksLeft,
      enRoute,
      blockedReason,
    });
  }
  return rows.sort((a, b) => {
    if (a.enRoute !== b.enRoute) return a.enRoute ? -1 : 1;
    if (Boolean(a.blockedReason) !== Boolean(b.blockedReason)) return a.blockedReason ? 1 : -1;
    return (a.etaTicks ?? 999) - (b.etaTicks ?? 999) || b.men - a.men;
  });
}

/** The relief already on the road: how many hosts, how many men, and when the first arrives. */
export function reinforcementsEnRoute(state: GameState, battle: AscentBattle): { hosts: number; men: number; etaTicks: number } {
  const marching = reinforcementCandidates(state, battle).filter((row) => row.enRoute && !row.blockedReason);
  return {
    hosts: marching.length,
    men: marching.reduce((sum, row) => sum + row.men, 0),
    etaTicks: marching.reduce((best, row) => Math.min(best, row.etaTicks ?? best), Number.POSITIVE_INFINITY),
  };
}

/**
 * Sends a host to the fight. A defence is a standing order to hold the province, which marches
 * it there; an assault is an order to storm the target, which marches it to the nearest owned
 * neighbour — where `enrolArrivals` takes it into the line before the order can strike alone.
 */
export function sendReinforcement(state: GameState, battle: AscentBattle, armyId: string): boolean {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army) return false;
  const row = reinforcementCandidates(state, battle).find((candidate) => candidate.army.id === armyId);
  if (!row || row.blockedReason) return false;
  const ok = battle.role === 'offence'
    ? setArmyOrders(state, armyId, { kind: 'attack', landId: battle.landId, force: true })
    : setArmyOrders(state, armyId, { kind: 'defend', landId: battle.landId });
  if (!ok) return false;
  battle.log.push(t('ascent.reinforce.sent', { army: army.name, men: row.men, n: row.etaTicks ?? 0 }));
  return true;
}
