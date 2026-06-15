import { PLAYER_KINGDOM_ID } from '../game/constants';
import { BUILD_TICKS_REQUIRED, MAX_BUILDING_LEVEL, UPGRADE_TICKS_REQUIRED } from '../game/gameplayConfig';
import { getCourtBonuses, getLandGovernorOutputMult } from './CourtSystem';
import type { BuildOrder, GameState, Land, LandBuildingType, ResourceBag, ResourceKey } from '../state/types';

export interface BuildOption {
  type: LandBuildingType;
  label: string;
  cost: Partial<ResourceBag>;
  canBuild: boolean;
  reason?: string;
}

export interface UpgradeOption {
  index: number;
  type: LandBuildingType;
  level: number;
  maxLevel: number;
  cost: Partial<ResourceBag>;
  canUpgrade: boolean;
  reason?: string;
}

export interface LaborStatus {
  required: number;
  efficiency: number;
}

export const BUILDING_LABELS: Record<LandBuildingType, string> = {
  farm: 'Build Farm',
  mine: 'Build Mine',
  market: 'Build Market',
  wall: 'Build Wall',
  tower: 'Build Tower',
  barracks: 'Build Barracks',
  shrine: 'Build Shrine',
};

/** One-time construction cost (gold + supplies), paid when the build order is queued. */
const BUILDING_COSTS: Record<LandBuildingType, Partial<ResourceBag>> = {
  farm: { gold: 36, supplies: 10 },
  mine: { gold: 46, supplies: 17 },
  market: { gold: 66, supplies: 22 },
  wall: { gold: 54, supplies: 24 },
  tower: { gold: 84, supplies: 30 },
  barracks: { gold: 72, supplies: 26 },
  shrine: { gold: 75, supplies: 12 },
};

/** Multiplies BUILDING_COSTS to get the cost of upgrading from level N to N+1 (index N-1). High on purpose. */
const UPGRADE_COST_MULTIPLIERS = [2.5, 4];

/** Output multiplier for a building at the given level (1x / 1.6x / 2.2x). */
function buildingOutputMultiplier(level: number): number {
  return 1 + (level - 1) * 0.6;
}

const DEFENSE_BONUSES: Partial<Record<LandBuildingType, number>> = {
  wall: 6,
  tower: 10,
};

/** Recurring per-tick upkeep per level: labor (humans) plus gold/supplies maintenance. */
const BUILDING_UPKEEP: Record<LandBuildingType, { humans: number; gold?: number; supplies?: number }> = {
  farm: { humans: 2, gold: 1 },
  mine: { humans: 2, gold: 1 },
  market: { humans: 2, gold: 2 },
  wall: { humans: 1, gold: 1 },
  tower: { humans: 2, gold: 2 },
  barracks: { humans: 1, gold: 1 },
  shrine: { humans: 1, gold: 1 },
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
  const efficiency = calculateLaborEfficiency(state);
  const courtBonuses = getCourtBonuses(state);

  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      land.outputs = calculateLandOutputs(state, land, 1);
      continue;
    }

    const governorMult = getLandGovernorOutputMult(state, land.id);
    const outputs = calculateLandOutputs(state, land, efficiency * governorMult);
    outputs.gold = Math.round(outputs.gold * courtBonuses.goldOutputMult);
    outputs.food = Math.round(outputs.food * courtBonuses.foodOutputMult);
    outputs.supplies = Math.round(outputs.supplies * courtBonuses.suppliesOutputMult);
    land.outputs = outputs;
  }

  state.resourceRates = calculatePlayerResourceRates(state);
}

export function calculateLandOutputs(state: GameState, land: Land, efficiency = 1): ResourceBag {
  const outputs = emptyResourceBag();
  const ownedNeighbors = land.neighbors.filter((neighborId) => state.lands.find((other) => other.id === neighborId)?.ownerId === PLAYER_KINGDOM_ID).length;
  const roads = Math.floor(land.neighbors.length / 3) + ownedNeighbors * 2;
  const waterBonus = land.terrainSummary.water > 0 ? 8 : 0;
  const riceBonus = land.terrainSummary.riceFields > 0 ? 4 : 0;
  const mountainBonus = land.terrainSummary.mountains > land.terrainSummary.hills ? 4 : 0;

  if (land.type === 'castle' || land.type === 'enemyCastle') {
    outputs.gold += 8 + roads;
    outputs.supplies += 3 + Math.floor(roads);
    outputs.humans += 7;
  }

  if (land.type === 'market' || land.type === 'temple') {
    outputs.gold += 3 + roads;
    outputs.supplies += Math.max(1, Math.floor(roads / 2));
    outputs.humans += 2;
  }

  for (const building of land.buildings) {
    const multiplier = buildingOutputMultiplier(building.level) * efficiency;
    if (building.type === 'farm') {
      outputs.food += (7 + waterBonus * 0.6 + riceBonus * 0.6) * multiplier;
      outputs.humans += 1 * multiplier;
    }
    if (building.type === 'mine') {
      outputs.supplies += (7 + mountainBonus * 0.75) * multiplier;
      outputs.gold += 2 * multiplier;
    }
    if (building.type === 'market') {
      outputs.gold += (7 + roads * 2) * multiplier;
      outputs.supplies += (2 + roads) * multiplier;
      outputs.humans += 2 * multiplier;
    }
  }

  for (const key of RESOURCE_KEYS) {
    outputs[key] = Math.round(outputs[key]);
  }

  return outputs;
}

/** Total per-tick humans required to staff every building on player-owned lands, scaled by level. */
function getTotalLaborRequired(state: GameState): number {
  let required = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    for (const building of land.buildings) {
      required += BUILDING_UPKEEP[building.type].humans * building.level;
    }
  }
  return required;
}

/**
 * Fraction (0.4-1) of full output that player buildings produce based on
 * available population vs. total labor required to staff them.
 */
export function calculateLaborEfficiency(state: GameState): number {
  const required = getTotalLaborRequired(state);
  if (required <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0.4, state.resources.humans / required));
}

export function getLaborStatus(state: GameState): LaborStatus {
  return {
    required: getTotalLaborRequired(state),
    efficiency: calculateLaborEfficiency(state),
  };
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

  let buildingMaintenanceGold = 0;
  let buildingMaintenanceSupplies = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    for (const building of land.buildings) {
      const upkeep = BUILDING_UPKEEP[building.type];
      buildingMaintenanceGold += (upkeep.gold ?? 0) * building.level;
      buildingMaintenanceSupplies += (upkeep.supplies ?? 0) * building.level;
    }
  }

  rates.food -= foodUpkeep;
  rates.supplies -= suppliesUpkeep + buildingMaintenanceSupplies;
  rates.gold -= heroUpkeep + buildingMaintenanceGold;

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

  return (['farm', 'mine', 'market', 'wall', 'tower', 'barracks', 'shrine'] as LandBuildingType[]).map((type) => {
    const terrainReason = getBuildingTerrainBlocker(land, type);
    const capacityReason = land.buildings.length >= land.buildingCapacity ? 'No free district capacity.' : undefined;
    const duplicateReason = type === 'market' && land.buildings.filter((building) => building.type === 'market').length >= getMarketLimit(land)
      ? 'Market limit reached for this district.'
      : (type === 'wall' || type === 'tower' || type === 'barracks' || type === 'shrine') && land.buildings.some((building) => building.type === type)
        ? `${BUILDING_LABELS[type].replace('Build ', '')} already built here.`
        : undefined;
    const activeOrderReason = activeOrder
      ? `Already ${activeOrder.kind === 'upgrade' ? 'upgrading' : 'building'} ${BUILDING_LABELS[activeOrder.building].replace('Build ', '')} (${activeOrder.progress}/${activeOrder.required}).`
      : undefined;
    const cost = scaleResourceBag(BUILDING_COSTS[type], getCourtBonuses(state).buildingCostMult);
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

export function getUpgradeOptions(state: GameState, land: Land): UpgradeOption[] {
  const activeOrder = getBuildOrder(state, land.id);

  return land.buildings.map((building, index) => {
    const atMaxLevel = building.level >= MAX_BUILDING_LEVEL;
    const activeOrderReason = activeOrder
      ? `Already ${activeOrder.kind === 'upgrade' ? 'upgrading' : 'building'} ${BUILDING_LABELS[activeOrder.building].replace('Build ', '')} (${activeOrder.progress}/${activeOrder.required}).`
      : undefined;
    const cost = scaleResourceBag(BUILDING_COSTS[building.type], (UPGRADE_COST_MULTIPLIERS[building.level - 1] ?? 1) * getCourtBonuses(state).buildingCostMult);
    const costReason = !atMaxLevel && !canSpend(state, cost) ? formatCostBlocker(cost) : undefined;
    const reason = atMaxLevel ? 'Already at maximum level.' : (activeOrderReason ?? costReason);

    return {
      index,
      type: building.type,
      level: building.level,
      maxLevel: MAX_BUILDING_LEVEL,
      cost,
      canUpgrade: !reason,
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
  const required = Math.max(1, BUILD_TICKS_REQUIRED - getCourtBonuses(state).buildSpeedBonus);
  state.buildOrders.push({
    landId,
    building,
    kind: 'build',
    progress: 0,
    required,
  });
  state.message = `${option.label.replace('Build ', '')} construction started in ${land.name}. Ready in ${required} economy ticks.`;
  return true;
}

export function upgradeDistrictBuilding(state: GameState, landId: string, buildingIndex: number): boolean {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) {
    return false;
  }

  const option = getUpgradeOptions(state, land)[buildingIndex];
  if (!option) {
    return false;
  }

  if (!option.canUpgrade) {
    state.message = option.reason ?? 'That building cannot be upgraded right now.';
    return false;
  }

  applyResourceDelta(state, Object.fromEntries(Object.entries(option.cost).map(([key, value]) => [key, -(value ?? 0)])));
  const required = Math.max(1, UPGRADE_TICKS_REQUIRED - getCourtBonuses(state).buildSpeedBonus);
  state.buildOrders.push({
    landId,
    building: option.type,
    kind: 'upgrade',
    buildingIndex,
    progress: 0,
    required,
  });
  state.message = `${BUILDING_LABELS[option.type].replace('Build ', '')} upgrade to level ${option.level + 1} started in ${land.name}. Ready in ${required} economy ticks.`;
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

    const label = BUILDING_LABELS[order.building].replace('Build ', '');
    const defenseBonus = DEFENSE_BONUSES[order.building];

    if (order.kind === 'upgrade' && order.buildingIndex !== undefined) {
      const instance = land.buildings[order.buildingIndex];
      if (instance) {
        instance.level += 1;
        if (defenseBonus) {
          land.defense += defenseBonus;
        }
        state.message = `${label} upgraded to level ${instance.level} in ${land.name}.`;
      }
    } else {
      land.buildings.push({ type: order.building, level: 1 });
      if (defenseBonus) {
        land.defense += defenseBonus;
      }
      state.message = `${label} completed in ${land.name}.`;
    }
  }

  state.buildOrders = state.buildOrders.filter((order) => !completed.includes(order));
  refreshAllLandOutputs(state);
  return true;
}

function getBuildingTerrainBlocker(land: Land, building: LandBuildingType): string | undefined {
  if (building === 'farm') {
    const grassTiles = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
    const existingFarms = land.buildings.filter((candidate) => candidate.type === 'farm').length;
    return grassTiles >= (existingFarms + 1) * 4 ? undefined : 'Needs more grass, field, or rice tiles.';
  }

  if (building === 'mine') {
    const oreTiles = land.terrainSummary.mountains + land.terrainSummary.hills;
    const existingMines = land.buildings.filter((candidate) => candidate.type === 'mine').length;
    return oreTiles >= (existingMines + 1) * 3 ? undefined : 'Needs mountain or hill tiles.';
  }

  const hasCityCore = land.terrainSummary.fortress + land.terrainSummary.shrine > 0;
  return hasCityCore || land.neighbors.length >= 3 ? undefined : 'Needs a city core or at least 3 road connections.';
}

function getMarketLimit(land: Land): number {
  return land.terrainSummary.fortress + land.terrainSummary.shrine > 0 ? 2 : 1;
}

function scaleResourceBag(cost: Partial<ResourceBag>, multiplier: number): Partial<ResourceBag> {
  return Object.fromEntries(
    Object.entries(cost).map(([key, value]) => [key, Math.ceil((value ?? 0) * multiplier)]),
  );
}

/** Sum of levels across all `barracks` buildings on a district - drives recruitment speed. */
export function getBarracksLevel(land: Land): number {
  return land.buildings
    .filter((building) => building.type === 'barracks')
    .reduce((sum, building) => sum + building.level, 0);
}

function formatCostBlocker(cost: Partial<ResourceBag>): string {
  const parts = Object.entries(cost)
    .map(([key, value]) => `${value} ${key}`)
    .join(', ');
  return `Need ${parts}.`;
}
