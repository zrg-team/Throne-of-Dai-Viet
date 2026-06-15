import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../game/constants';
import { applyResourceDelta, canSpend, refreshAllLandOutputs } from './ResourceSystem';
import { getCourtBonuses } from './CourtSystem';
import type { GameState, Land } from '../state/types';

/** Larger, better-defended, more developed districts take longer to peacefully annex. */
export function getAcquisitionTicksRequired(land: Land): number {
  const valueScore = land.defense + land.buildingCapacity * 2 + (land.terrainSummary.fortress + land.terrainSummary.shrine) * 4;
  return Math.max(2, Math.min(6, Math.round(valueScore / 12)));
}

export function findLand(state: GameState, landId: string): Land | undefined {
  return state.lands.find((land) => land.id === landId);
}

export function isAdjacent(state: GameState, fromLandId: string, toLandId: string): boolean {
  const fromLand = findLand(state, fromLandId);
  return fromLand?.neighbors.includes(toLandId) ?? false;
}

export function getPlayerArmyAtLand(state: GameState, landId: string) {
  return state.armies.find((army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === landId);
}

export function isLandVisibleToPlayer(state: GameState, landId: string): boolean {
  return findLand(state, landId)?.isVisible ?? false;
}

export function refreshPlayerVisibility(state: GameState): void {
  const visibleLandIds = new Set<string>();

  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }

    visibleLandIds.add(land.id);
    for (const neighborId of land.neighbors) {
      visibleLandIds.add(neighborId);
    }
  }

  for (const order of state.acquisitionOrders) {
    if (order.buyerId === PLAYER_KINGDOM_ID) {
      visibleLandIds.add(order.landId);
    }
  }

  for (const land of state.lands) {
    land.isVisible = visibleLandIds.has(land.id);
    land.isExplored = land.isExplored || land.isVisible;
  }
}

export function getAcquisitionOrder(state: GameState, landId: string) {
  return state.acquisitionOrders.find((order) => order.landId === landId);
}

export function getSiegeOrder(state: GameState, landId: string) {
  return state.siegeOrders.find((order) => order.landId === landId);
}

export function acquireLand(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);

  if (!land || land.ownerId !== NEUTRAL_OWNER_ID) {
    return false;
  }

  if (getAcquisitionOrder(state, landId)) {
    state.message = `${land.name} is already being acquired.`;
    return false;
  }

  const hasOwnedNeighbor = land.neighbors.some((neighborId) => findLand(state, neighborId)?.ownerId === PLAYER_KINGDOM_ID);
  if (!hasOwnedNeighbor) {
    state.message = 'You can buy only neutral land adjacent to your districts.';
    return false;
  }

  const cost = {
    gold: 24 + Math.ceil(land.defense * 0.5) + Math.ceil(land.buildingCapacity * 2),
  };

  if (!canSpend(state, cost)) {
    state.message = `Need ${cost.gold} gold to buy this land.`;
    return false;
  }

  applyResourceDelta(state, { gold: -cost.gold });
  const baseRequired = getAcquisitionTicksRequired(land);
  const required = Math.max(1, Math.round(baseRequired * getCourtBonuses(state).acquisitionSpeedMult));
  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    progress: 0,
    required,
    costGold: cost.gold,
  });
  refreshPlayerVisibility(state);
  state.message = `Acquiring ${land.name}. Progress will complete over ${required} economy ticks.`;
  return true;
}

export function progressAcquisitions(state: GameState): boolean {
  const completed: string[] = [];

  for (const order of state.acquisitionOrders) {
    order.progress += 1;
    if (order.progress >= order.required) {
      completed.push(order.landId);
    }
  }

  if (completed.length === 0) {
    return false;
  }

  for (const landId of completed) {
    const land = findLand(state, landId);
    const order = getAcquisitionOrder(state, landId);
    if (!land || !order || land.ownerId !== NEUTRAL_OWNER_ID) {
      continue;
    }

    land.ownerId = order.buyerId;
    land.loyalty = Math.max(land.loyalty, 68);
    if (order.buyerId === PLAYER_KINGDOM_ID) {
      state.message = `${land.name} joins Đại Việt peacefully.`;
    }
  }

  state.acquisitionOrders = state.acquisitionOrders.filter((order) => !completed.includes(order.landId));
  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  return true;
}

export function checkVictory(state: GameState): void {
  const enemyCastles = state.lands.filter(
    (land) => land.type === 'enemyCastle' && land.ownerId !== PLAYER_KINGDOM_ID,
  );
  state.victory = enemyCastles.length === 0;

  if (state.victory) {
    state.message = 'Victory! All rival castles have fallen to Đại Việt.';
  }
}
