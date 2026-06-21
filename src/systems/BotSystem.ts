import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../game/constants';
import { getAcquisitionTicksRequired, getAcquisitionOrder, isLandVisibleToPlayer } from './LandSystem';
import { calculateLandOutputs } from './ResourceSystem';
import type { GameState, Kingdom, Land, LandBuildingType } from '../state/types';
import { t } from '../i18n';

export function runBotTurns(state: GameState): void {
  // Off-map empires hold no territory and don't run on-map economy/expansion.
  if (state.gameMode === 'empire') return;

  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) {
      continue;
    }

    runSingleBot(state, kingdom);
  }
}

export function launchDynastyAttack(state: GameState, kingdomId: string): void {
  // Re-exported from CampaignEventSystem to keep BotSystem as the stable API surface.
  // The actual implementation lives in CampaignEventSystem to avoid circular imports.
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId && !k.isDefeated);
  if (!kingdom) return;

  const capitalLand = state.lands.find(
    (l) => l.ownerId === kingdomId && (l.type === 'enemyCastle' || l.type === 'castle'),
  );
  if (!capitalLand) return;

  const existingStrength = state.armies
    .filter((a) => a.kingdomId === kingdomId)
    .reduce((sum, a) => sum + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
  const attackSize = Math.max(600, Math.floor(existingStrength * 1.8));

  state.armies.push({
    id: `dynasty-attack-${kingdomId}-${state.turn}`,
    kingdomId,
    name: `${kingdom.name} Great Army`,
    landId: capitalLand.id,
    units: {
      spearmen: Math.floor(attackSize * 0.58),
      archers: Math.floor(attackSize * 0.28),
      heavyInfantry: Math.floor(attackSize * 0.14),
    },
    morale: 88,
    supply: 92,
    rations: 400,
    provisions: 300,
    level: 2,
    experience: 0,
    experienceToNextLevel: 160,
  });
}

function runSingleBot(state: GameState, kingdom: Kingdom): void {
  const ownedLands = state.lands.filter((land) => land.ownerId === kingdom.id);
  if (ownedLands.length === 0) {
    kingdom.isDefeated = true;
    return;
  }

  const frontier = ownedLands
    .flatMap((land) => land.neighbors)
    .map((neighborId) => state.lands.find((land) => land.id === neighborId))
    .filter((land): land is Land => Boolean(land));

  const neutralTarget = frontier
    .filter((land) => land.ownerId === NEUTRAL_OWNER_ID)
    .sort((a, b) => scoreNeutralTarget(b) - scoreNeutralTarget(a))[0];

  const hasActiveAcquisition = state.acquisitionOrders.some((order) => order.buyerId === kingdom.id);
  if (neutralTarget && !hasActiveAcquisition && !getAcquisitionOrder(state, neutralTarget.id) && state.turn % 3 === 0) {
    const required = getAcquisitionTicksRequired(neutralTarget);
    state.acquisitionOrders.push({
      landId: neutralTarget.id,
      buyerId: kingdom.id,
      progress: 0,
      required,
      costGold: 0,
      method: 'conquest',
    });
    if (isLandVisibleToPlayer(state, neutralTarget.id)) {
      state.message = t('msg.botClaims', { kingdom: kingdom.name, land: neutralTarget.name });
    }
    return;
  }

  const buildTarget = pickBuildTarget(ownedLands, state.turn);
  if (buildTarget) {
    const building = chooseBuilding(buildTarget);
    if (building && buildTarget.buildings.length < buildTarget.buildingCapacity) {
      buildTarget.buildings.push({ type: building, level: 1 });
      buildTarget.outputs = calculateLandOutputs(state, buildTarget);
      if (isLandVisibleToPlayer(state, buildTarget.id)) {
        state.message = t('msg.botDevelops', { kingdom: kingdom.name, land: buildTarget.name });
      }
      return;
    }
  }

  // In campaign mode, friendly kingdoms (relations > 60) don't pressure the player
  const isFriendlyInCampaign = state.gameMode === 'campaign' && (kingdom.relations ?? 50) > 60;
  const playerTarget = frontier.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (playerTarget && !isFriendlyInCampaign && state.turn % 4 === 0) {
    playerTarget.loyalty = Math.max(20, playerTarget.loyalty - 8);
    state.message = t('msg.botPressures', { kingdom: kingdom.name, land: playerTarget.name });
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
