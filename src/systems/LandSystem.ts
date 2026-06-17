import { PLAYER_KINGDOM_ID } from '../game/constants';
import type { GameState, Land } from '../state/types';
import { t } from '../i18n';

/** Larger, better-defended, more developed districts take longer to siege or settle. */
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

export function checkVictory(state: GameState): void {
  const enemyCastles = state.lands.filter(
    (land) => land.type === 'enemyCastle' && land.ownerId !== PLAYER_KINGDOM_ID,
  );
  state.victory = enemyCastles.length === 0;

  if (state.victory) {
    state.message = t('msg.victory');
  }
}
