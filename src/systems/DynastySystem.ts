import { isCampaignMode, PLAYER_KINGDOM_ID } from '../game/constants';
import type { GameState } from '../state/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function avgLoyalty(state: GameState): number {
  const owned = state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID);
  if (owned.length === 0) return 100;
  return owned.reduce((sum, l) => sum + l.loyalty, 0) / owned.length;
}

function humansInArmies(state: GameState): number {
  return state.armies
    .filter((a) => a.kingdomId === PLAYER_KINGDOM_ID)
    .reduce((sum, a) => sum + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
}

export function tickDynastyStatus(state: GameState): void {
  if (!isCampaignMode(state.gameMode) || !state.dynastyStatus) return;

  const ds = state.dynastyStatus;

  // --- Farmer unrest ---
  let unrestDelta = 0;
  if (state.resources.food < 50) unrestDelta += 3;
  if (avgLoyalty(state) < 50) unrestDelta += 2;
  const totalHumans = state.resources.humans + humansInArmies(state);
  if (totalHumans > 0 && humansInArmies(state) / totalHumans > 0.45) unrestDelta += 4;
  if (state.resources.food > 200 && state.resourceRates.food > 0) unrestDelta -= 3;
  if (avgLoyalty(state) > 70) unrestDelta -= 2;
  ds.farmerUnrest = clamp(ds.farmerUnrest + unrestDelta, 0, 100);

  // --- Noble relations ---
  let nobleDelta = 0;
  if (state.resources.gold > 150 && state.resourceRates.gold > 0) nobleDelta += 2;
  const seatedCount = Object.keys(state.court.seats).length;
  if (seatedCount >= 3) nobleDelta += 1;
  if (state.resources.gold < 0) nobleDelta -= 3;
  const hasUnpaid = state.armies.some((a) => a.kingdomId === PLAYER_KINGDOM_ID && (a.unpaidTicks ?? 0) > 0);
  if (hasUnpaid) nobleDelta -= 2;
  ds.nobleRelations = clamp(ds.nobleRelations + nobleDelta, 0, 100);

  // --- Dynasty stability composite ---
  const dynastyStability =
    state.court.stability * 0.4 +
    (100 - ds.farmerUnrest) * 0.35 +
    ds.nobleRelations * 0.25;

  if (dynastyStability < 20) {
    ds.consecutiveLowStability += 1;
  } else {
    ds.consecutiveLowStability = 0;
  }

  if (ds.consecutiveLowStability >= 3) {
    state.isDefeated = true;
    state.defeatReason = 'collapse';
  }
}

export function checkCampaignDefeat(state: GameState): void {
  if (!isCampaignMode(state.gameMode) || state.isDefeated) return;
  const playerOwns = state.lands.some((l) => l.ownerId === PLAYER_KINGDOM_ID);
  if (!playerOwns) {
    state.isDefeated = true;
    state.defeatReason = 'conquest';
  }
}
