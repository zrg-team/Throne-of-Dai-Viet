import { PLAYER_KINGDOM_ID } from '../game/constants';
import { getBuildingLevelCap } from './empire/MandateSystem';
import { getCourtBonuses, getLandGovernorOutputMult } from './CourtSystem';
import type { BuildOrder, GameState, Land, LandBuildingType, ResourceBag, ResourceKey, Season } from '../state/types';
import { buildingLabel, buildBuildingLabel, formatResourceList, resourceLabel, t } from '../i18n';

export type BuildingCategory = 'production' | 'military' | 'public';

export interface BuildingEconomySpec {
  type: LandBuildingType;
  category: BuildingCategory;
  baseCost: Partial<ResourceBag>;
  buildLabor: number;
  buildTicks: number;
  laborPerLevel: number;
  output: Partial<ResourceBag>;
  upkeep: Partial<ResourceBag>;
  defensePerLevel?: number;
}

export interface BuildOption {
  type: LandBuildingType;
  label: string;
  cost: Partial<ResourceBag>;
  labor: number;
  ticks: number;
  category: BuildingCategory;
  upkeep: Partial<ResourceBag>;
  output: Partial<ResourceBag>;
  canBuild: boolean;
  reason?: string;
}

export interface UpgradeOption {
  index: number;
  type: LandBuildingType;
  level: number;
  maxLevel: number;
  cost: Partial<ResourceBag>;
  labor: number;
  ticks: number;
  category: BuildingCategory;
  upkeep: Partial<ResourceBag>;
  output: Partial<ResourceBag>;
  canUpgrade: boolean;
  reason?: string;
}

export interface LaborStatus {
  available: number;
  required: number;
  efficiency: number;
}

export interface PublicBuildingEffects {
  favorPerTick: number;
  stabilityPerTick: number;
  influencePerTick: number;
  growthBonus: number;
  publicLevels: number;
}

export const BUILDING_LABELS: Record<LandBuildingType, string> = {
  farm: 'Build Farm',
  mine: 'Build Mine',
  market: 'Build Market',
  wall: 'Build Wall',
  tower: 'Build Tower',
  barracks: 'Build Barracks',
  communalHall: 'Build Communal Hall',
};

const RESOURCE_KEYS: ResourceKey[] = ['food', 'supplies', 'gold', 'humans'];
const BUILDING_ORDER: LandBuildingType[] = ['farm', 'mine', 'market', 'wall', 'tower', 'barracks', 'communalHall'];
const PRODUCTION_BUILDINGS = new Set<LandBuildingType>(['farm', 'mine', 'market']);

const UPGRADE_COST_MULTIPLIERS = [2.1, 3.3];
const OUTPUT_MULTIPLIERS = [1, 1.55, 2.15];
const UPKEEP_MULTIPLIERS = [1, 1.35, 1.8];

export const BUILDING_ECONOMY: Record<LandBuildingType, BuildingEconomySpec> = {
  farm: {
    type: 'farm',
    category: 'production',
    baseCost: { gold: 32 },
    buildLabor: 2,
    buildTicks: 3,
    laborPerLevel: 2,
    output: { food: 9 },
    upkeep: {},
  },
  mine: {
    type: 'mine',
    category: 'production',
    baseCost: { gold: 38, food: 8 },
    buildLabor: 3,
    buildTicks: 4,
    laborPerLevel: 3,
    output: { supplies: 8, gold: 1 },
    upkeep: { food: 1 },
  },
  market: {
    type: 'market',
    category: 'production',
    baseCost: { supplies: 28, food: 8 },
    buildLabor: 3,
    buildTicks: 4,
    laborPerLevel: 3,
    output: { gold: 9, supplies: 2 },
    upkeep: { food: 1 },
  },
  wall: {
    type: 'wall',
    category: 'military',
    baseCost: { gold: 42 },
    buildLabor: 2,
    buildTicks: 3,
    laborPerLevel: 0,
    output: {},
    upkeep: {},
    defensePerLevel: 8,
  },
  tower: {
    type: 'tower',
    category: 'military',
    baseCost: { gold: 58 },
    buildLabor: 3,
    buildTicks: 4,
    laborPerLevel: 0,
    output: {},
    upkeep: { gold: 1 },
    defensePerLevel: 14,
  },
  barracks: {
    type: 'barracks',
    category: 'military',
    baseCost: { gold: 56, supplies: 24 },
    buildLabor: 3,
    buildTicks: 4,
    laborPerLevel: 0,
    output: {},
    upkeep: { gold: 2, food: 1 },
  },
  communalHall: {
    type: 'communalHall',
    category: 'public',
    baseCost: { supplies: 26 },
    buildLabor: 2,
    buildTicks: 4,
    laborPerLevel: 0,
    output: {},
    upkeep: { food: 1 },
  },
};

function buildOrderKindLabel(kind: BuildOrder['kind']): string {
  return t(kind === 'upgrade' ? 'order.upgrading' : 'order.building').toLowerCase();
}

function outputMultiplier(level: number): number {
  return OUTPUT_MULTIPLIERS[Math.max(0, Math.min(level - 1, OUTPUT_MULTIPLIERS.length - 1))] ?? 1;
}

function upkeepMultiplier(level: number): number {
  return UPKEEP_MULTIPLIERS[Math.max(0, Math.min(level - 1, UPKEEP_MULTIPLIERS.length - 1))] ?? 1;
}

function upgradeCostMultiplier(level: number): number {
  return UPGRADE_COST_MULTIPLIERS[Math.max(0, Math.min(level - 1, UPGRADE_COST_MULTIPLIERS.length - 1))] ?? 1;
}

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

export function getBuildingCategory(type: LandBuildingType): BuildingCategory {
  return BUILDING_ECONOMY[type].category;
}

export function getPublicBuildingEffects(state: GameState): PublicBuildingEffects {
  const publicLevels = state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .reduce((sum, land) => (
      sum + land.buildings
        .filter((building) => getBuildingCategory(building.type) === 'public')
        .reduce((buildingSum, building) => buildingSum + building.level, 0)
    ), 0);

  return {
    publicLevels,
    favorPerTick: publicLevels * 0.4,
    stabilityPerTick: publicLevels * 0.08,
    influencePerTick: publicLevels * 0.04,
    growthBonus: publicLevels,
  };
}

export function refreshAllLandOutputs(state: GameState): void {
  const labor = getLaborStatus(state);
  const courtBonuses = getCourtBonuses(state);

  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      land.outputs = calculateLandOutputs(state, land, 1);
      continue;
    }

    const governorMult = getLandGovernorOutputMult(state, land.id);
    const outputs = calculateLandOutputs(state, land, labor.efficiency * governorMult);
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
  const waterBonus = land.terrainSummary.water > 0 ? 2 : 0;
  const riceBonus = land.terrainSummary.riceFields > 0 ? 2 : 0;
  const mountainBonus = land.terrainSummary.mountains > land.terrainSummary.hills ? 2 : 0;

  if (land.type === 'castle' || land.type === 'enemyCastle') {
    outputs.gold += 8 + roads;
    outputs.supplies += 3 + Math.floor(roads);
  }

  if (land.type === 'market' || land.type === 'temple') {
    outputs.gold += 3 + roads;
    outputs.supplies += Math.max(1, Math.floor(roads / 2));
  }

  for (const building of land.buildings) {
    const spec = BUILDING_ECONOMY[building.type];
    if (spec.category !== 'production') {
      continue;
    }

    const multiplier = outputMultiplier(building.level) * efficiency;
    if (building.type === 'farm') {
      outputs.food += (spec.output.food ?? 0) * multiplier + (waterBonus + riceBonus) * multiplier;
    } else if (building.type === 'mine') {
      outputs.supplies += ((spec.output.supplies ?? 0) + mountainBonus) * multiplier;
      outputs.gold += (spec.output.gold ?? 0) * multiplier;
    } else if (building.type === 'market') {
      const marketMult = land.ownerId === PLAYER_KINGDOM_ID ? getCourtBonuses(state).marketGoldOutputMult : 1;
      outputs.gold += ((spec.output.gold ?? 0) + roads * 2) * multiplier * marketMult;
      outputs.supplies += ((spec.output.supplies ?? 0) + Math.floor(roads / 2)) * multiplier;
    }
  }

  for (const key of RESOURCE_KEYS) {
    outputs[key] = Math.round(outputs[key]);
  }

  return outputs;
}

function getBuildingLaborRequired(state: GameState): number {
  let required = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    for (const building of land.buildings) {
      const spec = BUILDING_ECONOMY[building.type];
      required += Math.ceil(spec.laborPerLevel * building.level * upkeepMultiplier(building.level));
    }
  }
  return required;
}

function getConstructionLaborRequired(state: GameState): number {
  return state.buildOrders.reduce((sum, order) => {
    const level = order.kind === 'upgrade' ? 2 : 1;
    return sum + Math.ceil(BUILDING_ECONOMY[order.building].buildLabor * upkeepMultiplier(level));
  }, 0);
}

function getPlayerTroops(state: GameState): number {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
    .reduce((sum, army) => sum + army.units.spearmen + army.units.archers + army.units.heavyInfantry, 0);
}

export function getArmyGoldUpkeep(army: { units: { spearmen: number; archers: number; heavyInfantry: number }; level: number }): number {
  const total = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
  return Math.ceil(total / 250) + army.level;
}

function getTotalArmyGoldUpkeep(state: GameState): number {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
    .reduce((sum, army) => sum + getArmyGoldUpkeep(army), 0);
}

export function getLaborStatus(state: GameState): LaborStatus {
  const available = Math.max(0, Math.floor(state.resources.humans / 40));
  const required = getBuildingLaborRequired(state) + getConstructionLaborRequired(state);
  return {
    available,
    required,
    efficiency: required <= 0 ? 1 : Math.min(1, Math.max(0.45, available / required)),
  };
}

function addBag(target: ResourceBag, delta: Partial<ResourceBag>, sign = 1): void {
  for (const [key, value] of Object.entries(delta)) {
    if (!RESOURCE_KEYS.includes(key as ResourceKey)) {
      continue;
    }
    target[key as ResourceKey] += Math.round((value ?? 0) * sign);
  }
}

function getSeasonFarmMultiplier(season: Season): number {
  switch (season) {
    case 'Spring': return 1.1;
    case 'Autumn': return 1.25;
    case 'Winter': return 0.8;
    case 'Summer':
    default: return 1;
  }
}

function getPopulationFoodMultiplier(season: Season): number {
  return season === 'Winter' ? 1.15 : 1;
}

function calculateBuildingUpkeep(state: GameState): ResourceBag {
  const upkeep = emptyResourceBag();
  const courtBonuses = getCourtBonuses(state);

  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    for (const building of land.buildings) {
      const spec = BUILDING_ECONOMY[building.type];
      for (const [key, value] of Object.entries(spec.upkeep)) {
        const resourceKey = key as ResourceKey;
        const courtMult = resourceKey === 'gold'
          ? courtBonuses.buildingGoldUpkeepMult
          : resourceKey === 'supplies'
            ? courtBonuses.buildingSuppliesUpkeepMult
            : 1;
        upkeep[resourceKey] += Math.ceil((value ?? 0) * building.level * upkeepMultiplier(building.level) * courtMult);
      }
    }
  }

  return upkeep;
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

  rates.food = Math.round(rates.food * getSeasonFarmMultiplier(state.season));

  const courtBonuses = getCourtBonuses(state);
  for (const [key, value] of Object.entries(courtBonuses.resourceRateModifier)) {
    if (key !== 'humans') {
      rates[key as ResourceKey] += value ?? 0;
    }
  }

  const buildingUpkeep = calculateBuildingUpkeep(state);
  addBag(rates, buildingUpkeep, -1);

  const playerTroops = getPlayerTroops(state);
  const heroUpkeep = state.heroes.reduce((sum, hero) => sum + hero.upkeepGold, 0);
  const populationFoodUpkeep = Math.ceil((state.resources.humans / 140) * getPopulationFoodMultiplier(state.season));
  const armyRealmFoodPressure = Math.ceil(playerTroops / 300);
  const suppliesUpkeep = Math.ceil(playerTroops / 650);
  const armyGoldUpkeep = Math.ceil(getTotalArmyGoldUpkeep(state) * courtBonuses.armyGoldUpkeepMult);

  rates.food -= populationFoodUpkeep + armyRealmFoodPressure;
  rates.supplies -= suppliesUpkeep;
  rates.gold -= heroUpkeep + armyGoldUpkeep;

  const foodNetBeforeHumanGrowth = rates.food;
  const ownedLandCount = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  const stabilityBonus = state.court.stability >= 70 ? 1 : state.court.stability < 40 ? -1 : 0;
  const publicGrowthBonus = getPublicBuildingEffects(state).growthBonus;
  const eventGrowthModifier = courtBonuses.resourceRateModifier.humans ?? 0;

  if (foodNetBeforeHumanGrowth < 0) {
    rates.humans = state.resources.food <= 0
      ? -Math.max(1, Math.ceil(Math.abs(foodNetBeforeHumanGrowth) / 5))
      : 0;
  } else {
    rates.humans = Math.max(0, ownedLandCount + Math.floor(foodNetBeforeHumanGrowth / 10) + stabilityBonus + publicGrowthBonus + eventGrowthModifier);
  }

  return rates;
}

export function collectPlayerIncome(state: GameState): void {
  refreshAllLandOutputs(state);
  const hadFoodShortage = state.resourceRates.food < 0 && state.resources.food + state.resourceRates.food <= 0;
  const hadSuppliesShortage = state.resourceRates.supplies < 0 && state.resources.supplies + state.resourceRates.supplies <= 0;
  if (hadFoodShortage && state.resourceRates.humans >= 0) {
    state.resourceRates.humans = -Math.max(1, Math.ceil(Math.abs(state.resourceRates.food) / 5));
  }
  applyResourceDelta(state, state.resourceRates);

  if (hadFoodShortage) {
    for (const army of state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)) {
      army.morale = Math.max(25, army.morale - 4);
      army.supply = Math.max(20, army.supply - 6);
    }
    state.message = t('msg.foodEmpty');
  }

  if (hadSuppliesShortage) {
    for (const army of state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)) {
      army.supply = Math.max(15, army.supply - 5);
    }
    state.message = t('msg.suppliesEmpty');
  }
}

export function getBuildOrder(state: GameState, landId: string): BuildOrder | undefined {
  return state.buildOrders.find((order) => order.landId === landId);
}

export function getBuildOptions(state: GameState, land: Land): BuildOption[] {
  const activeOrder = getBuildOrder(state, land.id);

  return BUILDING_ORDER.map((type) => {
    const spec = BUILDING_ECONOMY[type];
    const terrainReason = getBuildingTerrainBlocker(land, type);
    const capacityReason = land.buildings.length >= land.buildingCapacity ? t('reason.noCapacity') : undefined;
    const duplicateReason = type === 'market' && land.buildings.filter((building) => building.type === 'market').length >= getMarketLimit(land)
      ? t('reason.marketLimit')
      : (type === 'wall' || type === 'tower' || type === 'barracks' || type === 'communalHall') && land.buildings.some((building) => building.type === type)
        ? t('reason.alreadyBuilt', { building: buildingLabel(type) })
        : undefined;
    const activeOrderReason = activeOrder
      ? t('reason.alreadyOrder', {
        kind: buildOrderKindLabel(activeOrder.kind),
        building: buildingLabel(activeOrder.building),
        progress: activeOrder.progress,
        required: activeOrder.required,
      })
      : undefined;
    const cost = scaleResourceBag(spec.baseCost, getCourtBonuses(state).buildingCostMult);
    const costReason = !canSpend(state, cost) ? formatCostBlocker(cost) : undefined;
    const reason = terrainReason ?? capacityReason ?? duplicateReason ?? activeOrderReason ?? costReason;

    return {
      type,
      label: buildBuildingLabel(type),
      cost,
      labor: spec.buildLabor,
      ticks: Math.max(1, spec.buildTicks - getCourtBonuses(state).buildSpeedBonus),
      category: spec.category,
      upkeep: getScaledUpkeep(type, 1),
      output: getScaledOutput(type, 1),
      canBuild: !reason,
      reason,
    };
  });
}

export function getUpgradeOptions(state: GameState, land: Land): UpgradeOption[] {
  const activeOrder = getBuildOrder(state, land.id);

  const buildingCap = getBuildingLevelCap(state);
  return land.buildings.map((building, index) => {
    const spec = BUILDING_ECONOMY[building.type];
    const atMaxLevel = building.level >= buildingCap;
    const activeOrderReason = activeOrder
      ? t('reason.alreadyOrder', {
        kind: buildOrderKindLabel(activeOrder.kind),
        building: buildingLabel(activeOrder.building),
        progress: activeOrder.progress,
        required: activeOrder.required,
      })
      : undefined;
    const cost = scaleResourceBag(spec.baseCost, upgradeCostMultiplier(building.level) * getCourtBonuses(state).buildingCostMult);
    const costReason = !atMaxLevel && !canSpend(state, cost) ? formatCostBlocker(cost) : undefined;
    const reason = atMaxLevel ? t('reason.maxLevel') : (activeOrderReason ?? costReason);
    const nextLevel = Math.min(buildingCap, building.level + 1);

    return {
      index,
      type: building.type,
      level: building.level,
      maxLevel: buildingCap,
      cost,
      labor: Math.ceil(spec.buildLabor * upkeepMultiplier(nextLevel)),
      ticks: Math.max(1, spec.buildTicks - getCourtBonuses(state).buildSpeedBonus - getCourtBonuses(state).upgradeSpeedBonus),
      category: spec.category,
      upkeep: getScaledUpkeep(building.type, nextLevel),
      output: getScaledOutput(building.type, nextLevel),
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
    state.message = option.reason ?? t('msg.cannotBuildHere');
    return false;
  }

  applyResourceDelta(state, Object.fromEntries(Object.entries(option.cost).map(([key, value]) => [key, -(value ?? 0)])));
  state.buildOrders.push({
    landId,
    building,
    kind: 'build',
    progress: 0,
    required: option.ticks,
  });
  state.message = t('msg.startedConstruction', { building: buildingLabel(building), land: land.name, ticks: option.ticks });
  refreshAllLandOutputs(state);
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
    state.message = option.reason ?? t('msg.cannotUpgrade');
    return false;
  }

  applyResourceDelta(state, Object.fromEntries(Object.entries(option.cost).map(([key, value]) => [key, -(value ?? 0)])));
  state.buildOrders.push({
    landId,
    building: option.type,
    kind: 'upgrade',
    buildingIndex,
    progress: 0,
    required: option.ticks,
  });
  state.message = t('msg.startedUpgrade', {
    building: buildingLabel(option.type),
    level: option.level + 1,
    land: land.name,
    ticks: option.ticks,
  });
  refreshAllLandOutputs(state);
  return true;
}

export function destroyDistrictBuilding(state: GameState, landId: string, buildingIndex: number): boolean {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) {
    return false;
  }

  if (getBuildOrder(state, land.id)) {
    state.message = t('msg.finishBeforeDestroy');
    return false;
  }

  const building = land.buildings[buildingIndex];
  if (!building) {
    return false;
  }

  const label = buildingLabel(building.type);
  const defenseBonus = BUILDING_ECONOMY[building.type].defensePerLevel;
  if (defenseBonus) {
    land.defense = Math.max(0, land.defense - defenseBonus * building.level);
  }
  land.buildings.splice(buildingIndex, 1);
  refreshAllLandOutputs(state);
  state.message = t('msg.destroyedBuilding', { building: label, land: land.name });
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

    const label = buildingLabel(order.building);
    const defenseBonus = BUILDING_ECONOMY[order.building].defensePerLevel;

    if (order.kind === 'upgrade' && order.buildingIndex !== undefined) {
      const instance = land.buildings[order.buildingIndex];
      if (instance) {
        instance.level += 1;
        if (defenseBonus) {
          land.defense += defenseBonus;
        }
        state.message = t('msg.upgradedBuilding', { building: label, level: instance.level, land: land.name });
      }
    } else {
      land.buildings.push({ type: order.building, level: 1 });
      if (defenseBonus) {
        land.defense += defenseBonus;
      }
      state.message = t('msg.completedBuilding', { building: label, land: land.name });
    }
  }

  state.buildOrders = state.buildOrders.filter((order) => !completed.includes(order));
  refreshAllLandOutputs(state);
  return true;
}

function getScaledOutput(type: LandBuildingType, level: number): Partial<ResourceBag> {
  const output = BUILDING_ECONOMY[type].output;
  return scaleResourceBag(output, outputMultiplier(level));
}

function getScaledUpkeep(type: LandBuildingType, level: number): Partial<ResourceBag> {
  const upkeep = BUILDING_ECONOMY[type].upkeep;
  return scaleResourceBag(upkeep, level * upkeepMultiplier(level));
}

function getBuildingTerrainBlocker(land: Land, building: LandBuildingType): string | undefined {
  if (building === 'farm') {
    const grassTiles = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
    const existingFarms = land.buildings.filter((candidate) => candidate.type === 'farm').length;
    return grassTiles >= (existingFarms + 1) * 4 ? undefined : t('reason.needGrass');
  }

  if (building === 'mine') {
    const oreTiles = land.terrainSummary.mountains + land.terrainSummary.hills;
    const existingMines = land.buildings.filter((candidate) => candidate.type === 'mine').length;
    return oreTiles >= (existingMines + 1) * 3 ? undefined : t('reason.needOre');
  }

  const hasCityCore = land.terrainSummary.fortress + land.terrainSummary.shrine > 0;
  return hasCityCore || land.neighbors.length >= 3 ? undefined : t('reason.needCity');
}

function getMarketLimit(land: Land): number {
  return land.terrainSummary.fortress + land.terrainSummary.shrine > 0 ? 2 : 1;
}

function scaleResourceBag(cost: Partial<ResourceBag>, multiplier: number): Partial<ResourceBag> {
  const scaled: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(cost)) {
    const amount = Math.ceil((value ?? 0) * multiplier);
    if (amount > 0) {
      scaled[key as ResourceKey] = amount;
    }
  }
  return scaled;
}

/** Sum of levels across all `barracks` buildings on a district - drives recruitment speed. */
export function getBarracksLevel(land: Land): number {
  return land.buildings
    .filter((building) => building.type === 'barracks')
    .reduce((sum, building) => sum + building.level, 0);
}

export function formatEconomyLine(values: Partial<ResourceBag>): string {
  const text = formatResourceList(values);
  return text || t('building.none');
}

function formatCostBlocker(cost: Partial<ResourceBag>): string {
  return t('reason.needCost', { parts: formatResourceList(cost) });
}

export function formatLabor(labor: number): string {
  return `${labor} ${resourceLabel('humans')}`;
}
