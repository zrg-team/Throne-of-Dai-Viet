import { PLAYER_KINGDOM_ID } from '../game/constants';
import { BUILD_TICKS_REQUIRED } from '../game/gameplayConfig';
import type { BuildOrder, GameState, Land, LandBuildingType, ResourceBag, ResourceKey } from '../state/types';

export interface BuildOption {
  type: LandBuildingType;
  label: string;
  cost: Partial<ResourceBag>;
  canBuild: boolean;
  reason?: string;
}

const BUILDING_LABELS: Record<LandBuildingType, string> = {
  farm: 'Build Farm',
  mine: 'Build Mine',
  market: 'Build Market',
};

const BUILDING_COSTS: Record<LandBuildingType, Partial<ResourceBag>> = {
  farm: { gold: 30, supplies: 8 },
  mine: { gold: 38, supplies: 14 },
  market: { gold: 55, supplies: 18 },
};

const RESOURCE_KEYS: ResourceKey[] = ['food', 'supplies', 'gold', 'humans'];

export function emptyResourceBag(): ResourceBag {
  return {
    food: 0,
    supplies: 0,
    gold: 0,
    humans: 0,
  };
}

export function canSpend(state: GameState, cost: Partial<ResourceBag>): boolean {
  return Object.entries(cost).every(([key, value]) => {
    const resourceKey = key as ResourceKey;
    return state.resources[resourceKey] >= Math.abs(value ?? 0);
  });
}

export function applyResourceDelta(state: GameState, delta: Partial<ResourceBag> | Record<string, number>): void {
  for (const [key, value] of Object.entries(delta)) {
    if (!RESOURCE_KEYS.includes(key as ResourceKey)) {
      continue;
    }

    const resourceKey = key as ResourceKey;
    state.resources[resourceKey] = Math.max(0, state.resources[resourceKey] + (value ?? 0));
  }
}

export function refreshAllLandOutputs(state: GameState): void {
  for (const land of state.lands) {
    land.outputs = calculateLandOutputs(land);
  }
  state.resourceRates = calculatePlayerResourceRates(state);
}

export function calculateLandOutputs(land: Land): ResourceBag {
  const outputs = emptyResourceBag();
  const roads = land.neighbors.length;
  const waterBonus = land.terrainSummary.water > 0 ? 8 : 0;
  const riceBonus = land.terrainSummary.riceFields > 0 ? 4 : 0;
  const mountainBonus = land.terrainSummary.mountains > land.terrainSummary.hills ? 4 : 0;

  if (land.type === 'castle' || land.type === 'enemyCastle') {
    outputs.gold += 18 + roads * 2;
    outputs.supplies += 6 + Math.floor(roads * 1.5);
    outputs.humans += 7;
  }

  if (land.type === 'market' || land.type === 'temple') {
    outputs.gold += 6 + roads * 2;
    outputs.supplies += Math.max(1, Math.floor(roads / 2));
    outputs.humans += 2;
  }

  for (const building of land.buildings) {
    if (building === 'farm') {
      outputs.food += 14 + waterBonus + riceBonus;
      outputs.humans += 1;
    }
    if (building === 'mine') {
      outputs.supplies += 14 + mountainBonus;
      outputs.gold += 3;
    }
    if (building === 'market') {
      outputs.gold += 14 + roads * 3;
      outputs.supplies += 3 + roads * 2;
      outputs.humans += 3;
    }
  }

  return outputs;
}

export function calculatePlayerResourceRates(state: GameState): ResourceBag {
  const rates = emptyResourceBag();

  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    rates.food += land.outputs.food;
    rates.supplies += land.outputs.supplies;
    rates.gold += land.outputs.gold;
  }

  const playerTroops = state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
    .reduce(
      (sum, army) => sum + army.units.spearmen + army.units.archers + army.units.heavyInfantry,
      0,
    );
  const heroUpkeep = state.heroes.reduce((sum, hero) => sum + hero.upkeepGold, 0);
  const foodUpkeep = Math.ceil(playerTroops / 250) + Math.ceil(state.resources.humans / 120);
  const suppliesUpkeep = Math.ceil(playerTroops / 650);

  rates.food -= foodUpkeep;
  rates.supplies -= suppliesUpkeep;
  rates.gold -= heroUpkeep;

  const foodAfterUpkeep = rates.food;
  const ownedLandCount = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  rates.humans = foodAfterUpkeep >= 0
    ? Math.max(1, Math.floor(ownedLandCount + foodAfterUpkeep / 8))
    : -Math.max(1, Math.ceil(Math.abs(foodAfterUpkeep) / 6));

  return rates;
}

export function collectPlayerIncome(state: GameState): void {
  refreshAllLandOutputs(state);
  applyResourceDelta(state, state.resourceRates);

  if (state.resourceRates.food < 0 && state.resources.food <= 0) {
    for (const army of state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)) {
      army.morale = Math.max(25, army.morale - 4);
      army.supply = Math.max(20, army.supply - 6);
    }
    state.message = 'Food stores are empty. Humans decline and armies lose readiness.';
  }

  if (state.resourceRates.supplies < 0 && state.resources.supplies <= 0) {
    for (const army of state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)) {
      army.supply = Math.max(15, army.supply - 5);
    }
    state.message = 'Supply stores are empty. Army logistics suffer.';
  }
}

export function getBuildOrder(state: GameState, landId: string): BuildOrder | undefined {
  return state.buildOrders.find((order) => order.landId === landId);
}

export function getBuildOptions(state: GameState, land: Land): BuildOption[] {
  const activeOrder = getBuildOrder(state, land.id);

  return (['farm', 'mine', 'market'] as LandBuildingType[]).map((type) => {
    const terrainReason = getBuildingTerrainBlocker(land, type);
    const capacityReason = land.buildings.length >= land.buildingCapacity ? 'No free district capacity.' : undefined;
    const duplicateReason = type === 'market' && land.buildings.filter((building) => building === 'market').length >= getMarketLimit(land)
      ? 'Market limit reached for this district.'
      : undefined;
    const activeOrderReason = activeOrder
      ? `Already building ${BUILDING_LABELS[activeOrder.building].replace('Build ', '')} (${activeOrder.progress}/${activeOrder.required}).`
      : undefined;
    const cost = BUILDING_COSTS[type];
    const costReason = !canSpend(state, cost) ? formatCostBlocker(cost) : undefined;
    const reason = terrainReason ?? capacityReason ?? duplicateReason ?? activeOrderReason ?? costReason;

    return {
      type,
      label: BUILDING_LABELS[type],
      cost,
      canBuild: !reason,
      reason,
    };
  });
}

export function buildDistrictBuilding(state: GameState, landId: string, building: LandBuildingType): boolean {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) {
    return false;
  }

  const option = getBuildOptions(state, land).find((candidate) => candidate.type === building);
  if (!option) {
    return false;
  }

  if (!option.canBuild) {
    state.message = option.reason ?? 'That building cannot be built here.';
    return false;
  }

  applyResourceDelta(state, Object.fromEntries(Object.entries(option.cost).map(([key, value]) => [key, -(value ?? 0)])));
  state.buildOrders.push({
    landId,
    building,
    progress: 0,
    required: BUILD_TICKS_REQUIRED,
  });
  state.message = `${option.label.replace('Build ', '')} construction started in ${land.name}. Ready in ${BUILD_TICKS_REQUIRED} economy ticks.`;
  return true;
}

export function progressBuildOrders(state: GameState): boolean {
  const completed: BuildOrder[] = [];

  for (const order of state.buildOrders) {
    order.progress += 1;
    if (order.progress >= order.required) {
      completed.push(order);
    }
  }

  if (completed.length === 0) {
    return false;
  }

  for (const order of completed) {
    const land = state.lands.find((candidate) => candidate.id === order.landId);
    if (!land) {
      continue;
    }

    land.buildings.push(order.building);
    state.message = `${BUILDING_LABELS[order.building].replace('Build ', '')} completed in ${land.name}.`;
  }

  state.buildOrders = state.buildOrders.filter((order) => !completed.includes(order));
  refreshAllLandOutputs(state);
  return true;
}

function getBuildingTerrainBlocker(land: Land, building: LandBuildingType): string | undefined {
  if (building === 'farm') {
    const grassTiles = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
    const existingFarms = land.buildings.filter((candidate) => candidate === 'farm').length;
    return grassTiles >= (existingFarms + 1) * 4 ? undefined : 'Needs more grass, field, or rice tiles.';
  }

  if (building === 'mine') {
    const oreTiles = land.terrainSummary.mountains + land.terrainSummary.hills;
    const existingMines = land.buildings.filter((candidate) => candidate === 'mine').length;
    return oreTiles >= (existingMines + 1) * 3 ? undefined : 'Needs mountain or hill tiles.';
  }

  const hasCityCore = land.terrainSummary.fortress + land.terrainSummary.shrine > 0;
  return hasCityCore || land.neighbors.length >= 3 ? undefined : 'Needs a city core or at least 3 road connections.';
}

function getMarketLimit(land: Land): number {
  return land.terrainSummary.fortress + land.terrainSummary.shrine > 0 ? 2 : 1;
}

function formatCostBlocker(cost: Partial<ResourceBag>): string {
  const parts = Object.entries(cost)
    .map(([key, value]) => `${value} ${key}`)
    .join(', ');
  return `Need ${parts}.`;
}
