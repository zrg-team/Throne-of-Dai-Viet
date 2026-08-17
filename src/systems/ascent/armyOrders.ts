import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { t } from '../../i18n';
import type { Army, ArmyOrders, GameState } from '../../state/types';

/**
 * Reading a host's standing order (Dragon Ascent). A leaf module — types, constants and strings
 * only — so the autopilot, the battle, the invasion tick and the screens can all ask the same
 * question without importing each other.
 */

export function armyOrders(army: Army): ArmyOrders {
  return army.orders ?? { kind: 'auto' };
}

/** True when the autopilot may move, commit or dissolve this host. */
export function isAutoHost(army: Army): boolean {
  return armyOrders(army).kind === 'auto';
}

/** True when a peaceful claim (intimidation, occupation) is standing on this host. */
export function isPinnedByClaim(state: GameState, army: Army): boolean {
  return state.acquisitionOrders.some((order) => order.armyId === army.id);
}

/**
 * True when this host is in the line of the live engagement, on either side — or staged for an
 * assault the tick has yet to open, which for every order's purpose is the same thing.
 */
export function isEngagedHost(state: GameState, armyId: string): boolean {
  if (state.pendingBattle?.attackerArmyIds?.includes(armyId)) return true;
  const live = state.ascent?.activeBattle;
  if (!live || live.over) return false;
  return (live.ourArmyIds ?? []).includes(armyId) || (live.theirArmyIds ?? []).includes(armyId);
}

/** Every host of the player's that takes orders — no garrison levies. */
export function commandableHosts(state: GameState): Army[] {
  return state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy);
}

/** The order as a line for a row: "Defend X — holding at Y", "Attack X — 34%, holding", … */
export function hostOrderLabel(state: GameState, army: Army): string {
  const orders = armyOrders(army);
  const landName = (id: string): string => state.lands.find((land) => land.id === id)?.name ?? id;
  const armyName = (id: string): string => state.armies.find((candidate) => candidate.id === id)?.name ?? id;
  const here = state.lands.find((land) => land.id === army.landId)?.name ?? '';
  switch (orders.kind) {
    case 'auto':
      return t('ascent.orders.auto');
    case 'defend': {
      const base = t('ascent.orders.defend', { land: landName(orders.landId) });
      if (orders.landId === army.landId) return base;
      return orders.holding
        ? `${base} ${t('ascent.orders.holdingLost', { here })}`
        : `${base} ${t('ascent.orders.marchingBack')}`;
    }
    case 'attack': {
      const base = t('ascent.orders.attack', { land: landName(orders.landId) });
      return orders.holding ? `${base} ${t('ascent.orders.holdingOdds')}` : base;
    }
    case 'follow': {
      const base = t('ascent.orders.follow', { army: armyName(orders.armyId) });
      return orders.holding ? `${base} ${t('ascent.orders.holdingUnreachable')}` : base;
    }
    case 'hunt':
      return t('ascent.orders.hunt', { army: armyName(orders.armyId) });
  }
}
