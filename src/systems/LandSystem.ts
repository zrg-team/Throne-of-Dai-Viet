import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../game/constants';
import { applyResourceDelta, canSpend } from './ResourceSystem';
import type { GameState, Land } from '../state/types';

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

export function getNearestPlayerArmy(state: GameState, targetLandId: string) {
  return state.armies.find((army) => {
    return army.kingdomId === PLAYER_KINGDOM_ID && isAdjacent(state, army.landId, targetLandId);
  });
}

export function acquireLand(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);

  if (!land || land.ownerId !== NEUTRAL_OWNER_ID) {
    return false;
  }

  const cost = {
    gold: land.type === 'market' ? 55 : 40,
    influence: land.type === 'temple' ? 30 : 20,
  };

  if (!canSpend(state, cost)) {
    state.message = 'Not enough gold or influence to acquire this land.';
    return false;
  }

  applyResourceDelta(state, { gold: -cost.gold, influence: -cost.influence });
  land.ownerId = PLAYER_KINGDOM_ID;
  land.loyalty = Math.max(land.loyalty, 68);
  state.message = `${land.name} joins Đại Việt peacefully.`;
  return true;
}

export function upgradeLand(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);

  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) {
    return false;
  }

  if (land.upgradeLevel >= 2) {
    state.message = `${land.name} is already developed for the MVP.`;
    return false;
  }

  if (!canSpend(state, { gold: land.upgrade.costGold })) {
    state.message = 'Not enough gold to upgrade this land.';
    return false;
  }

  applyResourceDelta(state, { gold: -land.upgrade.costGold });
  land.upgradeLevel += 1;
  land.defense += land.upgrade.defense ?? 0;
  state.message = `${land.upgrade.name} completed in ${land.name}.`;
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
