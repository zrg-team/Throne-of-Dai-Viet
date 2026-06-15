import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../game/constants';
import { isLandVisibleToPlayer } from './LandSystem';
import { calculateLandOutputs } from './ResourceSystem';
import type { GameState, Kingdom, Land, LandBuildingType } from '../state/types';

export function runBotTurns(state: GameState): void {
  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) {
      continue;
    }

    runSingleBot(state, kingdom);
  }
}

function runSingleBot(state: GameState, kingdom: Kingdom): void {
  const ownedLands = state.lands.filter((land) => land.ownerId === kingdom.id);
  if (ownedLands.length === 0) {
    kingdom.isDefeated = true;
    return;
  }

  const buildTarget = pickBuildTarget(ownedLands, state.turn);
  if (buildTarget) {
    const building = chooseBuilding(buildTarget);
    if (building && buildTarget.buildings.length < buildTarget.buildingCapacity) {
      buildTarget.buildings.push({ type: building, level: 1 });
      buildTarget.outputs = calculateLandOutputs(state, buildTarget);
      if (isLandVisibleToPlayer(state, buildTarget.id)) {
        state.message = `${kingdom.name} develops ${buildTarget.name}.`;
      }
      return;
    }
  }

  const frontier = ownedLands
    .flatMap((land) => land.neighbors)
    .map((neighborId) => state.lands.find((land) => land.id === neighborId))
    .filter((land): land is Land => Boolean(land));

  const neutralTarget = frontier
    .filter((land) => land.ownerId === NEUTRAL_OWNER_ID)
    .sort((a, b) => scoreNeutralTarget(b) - scoreNeutralTarget(a))[0];

  if (neutralTarget && state.turn % 2 === 0) {
    neutralTarget.ownerId = kingdom.id;
    neutralTarget.loyalty = Math.max(neutralTarget.loyalty, 58);
    if (isLandVisibleToPlayer(state, neutralTarget.id)) {
      state.message = `${kingdom.name} claims ${neutralTarget.name}.`;
    }
    return;
  }

  const playerTarget = frontier.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (playerTarget && state.turn % 4 === 0) {
    playerTarget.loyalty = Math.max(20, playerTarget.loyalty - 8);
    state.message = `${kingdom.name} pressures ${playerTarget.name}.`;
  }
}

function pickBuildTarget(lands: Land[], turn: number): Land | undefined {
  const candidates = lands.filter((land) => land.buildings.length < land.buildingCapacity);
  if (candidates.length === 0 || turn % 3 !== 0) {
    return undefined;
  }
  return candidates[turn % candidates.length];
}

function chooseBuilding(land: Land): LandBuildingType | undefined {
  const grass = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
  const ore = land.terrainSummary.mountains + land.terrainSummary.hills;
  const city = land.terrainSummary.fortress + land.terrainSummary.shrine;

  if (grass >= ore && grass >= 4) {
    return 'farm';
  }
  if (ore >= 3) {
    return 'mine';
  }
  if (city > 0 || land.neighbors.length >= 3) {
    return 'market';
  }
  return undefined;
}

function scoreNeutralTarget(land: Land): number {
  return land.buildingCapacity * 3 + land.terrainSummary.riceFields + land.terrainSummary.mountains + land.neighbors.length;
}
