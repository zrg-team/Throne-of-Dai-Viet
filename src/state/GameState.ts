import { ORDERS_PER_SEASON, PLAYER_KINGDOM_ID } from '../game/constants';
import { GAMEPLAY_MAP_CONFIG } from '../game/gameplayConfig';
import { generateKingHero, heroTemplates } from '../data/heroes';
import { kingdomTemplates } from '../data/kingdoms';
import { politicsCardTemplates } from '../data/politicsCards';
import { computeCentroid, computeNeighbors, generateHexMap, type MapGenConfig } from '../map/hexMapGenerator';
import { refreshAllLandOutputs } from '../systems/ResourceSystem';
import { refreshPlayerVisibility } from '../systems/LandSystem';
import { createInitialCourtState } from '../systems/CourtSystem';
import type { GameState, Land, LandTemplate, ResourceBag, TerrainSummary } from './types';

const EMPTY_RESOURCE_BAG: ResourceBag = {
  food: 0,
  supplies: 0,
  gold: 0,
  humans: 0,
};

function createEmptyTerrainSummary(): TerrainSummary {
  return {
    plains: 0,
    fields: 0,
    riceFields: 0,
    forest: 0,
    mountains: 0,
    hills: 0,
    water: 0,
    fortress: 0,
    shrine: 0,
  };
}

function createInitialTrust(ownerId: string): Record<string, number> {
  const trust = Object.fromEntries(kingdomTemplates.map((kingdom) => [kingdom.id, 40])) as Record<string, number>;

  if (ownerId === PLAYER_KINGDOM_ID) {
    trust[PLAYER_KINGDOM_ID] = 82;
    trust['northern-rival'] = 18;
  } else if (ownerId === 'northern-rival') {
    trust[PLAYER_KINGDOM_ID] = 18;
    trust['northern-rival'] = 82;
  }

  return trust;
}

const NAME_PREFIXES = ['Amber', 'Bamboo', 'Cloud', 'Copper', 'Dragon', 'Eastern', 'Golden', 'Hidden', 'Jade', 'Lotus', 'Mist', 'Pine', 'Red', 'River', 'Silver', 'Southern', 'Stone', 'Sun', 'Tiger', 'Western'];
const NAME_CORES = ['Basin', 'Ford', 'Gate', 'Heights', 'Hollow', 'Lake', 'March', 'Meadow', 'Pass', 'Plain', 'Reach', 'Ridge', 'Road', 'Terrace', 'Valley', 'Village', 'Ward', 'Watch'];

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function pick<T>(items: T[]): T {
  return items[randomInt(items.length)];
}

function createRandomMapConfig(): MapGenConfig {
  return {
    ...GAMEPLAY_MAP_CONFIG,
    seed: randomInt(1_000_000_000),
  };
}

function createRandomLandName(index: number, used: Set<string>): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const name = `${pick(NAME_PREFIXES)} ${pick(NAME_CORES)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Frontier District ${String(index + 1).padStart(2, '0')}`;
  used.add(fallback);
  return fallback;
}

function createGeneratedNeutralDistrict(index: number, usedNames: Set<string>): LandTemplate {
  const types: LandTemplate['type'][] = ['farm', 'iron', 'market', 'temple', 'farm', 'iron', 'market', 'wilderness', 'wilderness'];
  const type = pick(types);
  const name = createRandomLandName(index, usedNames);

  const isWilderness = type === 'wilderness';
  return {
    id: `district-${String(index + 1).padStart(2, '0')}`,
    name,
    type,
    ownerId: 'neutral',
    defense: isWilderness ? 3 + randomInt(6) : type === 'iron' ? 22 + randomInt(9) : type === 'market' ? 16 + randomInt(8) : type === 'temple' ? 15 + randomInt(6) : 10 + randomInt(8),
    loyalty: 55 + randomInt(23),
    buildings: [],
    special: isWilderness ? 'Uninhabited wilderness. No village, no garrison.' : `Random ${type} district with generated terrain and resources.`,
  };
}

function createConfiguredLandTemplates(): LandTemplate[] {
  const usedNames = new Set<string>();
  const districtCount = GAMEPLAY_MAP_CONFIG.neutralDistrictTarget + 2;
  const templates: LandTemplate[] = [];

  for (let index = 0; index < districtCount; index += 1) {
    templates.push(createGeneratedNeutralDistrict(index, usedNames));
  }

  return templates;
}

function createLands(mapConfig: MapGenConfig): { lands: Land[]; hexTiles: GameState['hexTiles']; playerStartId: string; rivalStartId: string } {
  const templates = createConfiguredLandTemplates();
  const { tiles, landHexes } = generateHexMap(templates, mapConfig);
  const neighbors = computeNeighbors(tiles);

  const lands: Land[] = templates.map((template) => {
    const hexes = landHexes.get(template.id) ?? [];
    const centroid = hexes.length > 0 ? computeCentroid(hexes, mapConfig.hexSize) : { x: 0, y: 0 };
    const summary = createEmptyTerrainSummary();
    for (const tile of tiles) {
      if (tile.landId === template.id) {
        summary[tile.terrain] += 1;
      }
    }
    const nonWaterTiles = Math.max(1, hexes.length - summary.water);
    const buildingCapacity = Math.max(1, Math.floor(nonWaterTiles / 7));
    const isWilderness = template.type === 'wilderness';
    const hasVillage = !isWilderness && (summary.fortress > 0 || summary.shrine > 0 || buildingCapacity >= 2 || template.defense > 12);
    const grassTiles = summary.plains + summary.fields + summary.riceFields + summary.forest;
    const cityTiles = summary.fortress + summary.shrine;
    const population = isWilderness ? 0 : Math.max(0, grassTiles * 7 + cityTiles * 15 + randomInt(20) - 5);
    const localSoldiers = isWilderness ? 0 : Math.max(0, Math.floor(template.defense * 0.7) + randomInt(6));
    return {
      ...template,
      x: centroid.x,
      y: centroid.y,
      neighbors: Array.from(neighbors.get(template.id) ?? []).sort(),
      buildingCapacity,
      terrainSummary: summary,
      outputs: { ...EMPTY_RESOURCE_BAG },
      isVisible: false,
      isExplored: false,
      population,
      localSoldiers,
      hasVillage,
      trust: createInitialTrust(template.ownerId),
    };
  });

  const [playerStartId, rivalStartId] = pickFarthestStartPair(lands);
  const playerStart = lands.find((land) => land.id === playerStartId);
  const rivalStart = lands.find((land) => land.id === rivalStartId);

  if (playerStart) {
    playerStart.name = `${playerStart.name} Capital`;
    playerStart.type = 'castle';
    playerStart.ownerId = PLAYER_KINGDOM_ID;
    playerStart.defense = Math.max(playerStart.defense, 48);
    playerStart.loyalty = 100;
    playerStart.buildings = [{ type: 'market', level: 1 }, { type: 'farm', level: 1 }];
    playerStart.special = 'Your randomized starting capital.';
    playerStart.hasVillage = true;
    playerStart.population = 120 + randomInt(40);
    playerStart.localSoldiers = Math.floor(playerStart.defense * 0.7);
    playerStart.trust = createInitialTrust(playerStart.ownerId);
  }

  if (rivalStart) {
    rivalStart.name = `${rivalStart.name} Rival Capital`;
    rivalStart.type = 'enemyCastle';
    rivalStart.ownerId = 'northern-rival';
    rivalStart.defense = Math.max(rivalStart.defense, 50);
    rivalStart.loyalty = 94;
    rivalStart.buildings = [{ type: 'market', level: 1 }, { type: 'mine', level: 1 }];
    rivalStart.special = 'Randomized rival capital. Capture it to win the campaign.';
    rivalStart.hasVillage = true;
    rivalStart.population = 100 + randomInt(40);
    rivalStart.localSoldiers = Math.floor(rivalStart.defense * 0.7);
    rivalStart.trust = createInitialTrust(rivalStart.ownerId);
  }

  return { lands, hexTiles: tiles, playerStartId, rivalStartId };
}

function pickFarthestStartPair(lands: Land[]): [string, string] {
  const largest = findLargestConnectedComponent(lands);
  let best: [Land, Land] = [largest[0] ?? lands[0], largest[1] ?? lands[0]];
  let bestDistance = -1;

  for (let i = 0; i < largest.length; i += 1) {
    for (let j = i + 1; j < largest.length; j += 1) {
      const a = largest[i];
      const b = largest[j];
      const distance = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (distance > bestDistance) {
        best = [a, b];
        bestDistance = distance;
      }
    }
  }

  return [best[0].id, best[1].id];
}

function findLargestConnectedComponent(lands: Land[]): Land[] {
  const byId = new Map(lands.map((land) => [land.id, land]));
  const visited = new Set<string>();
  let largest: Land[] = [];

  for (const land of lands) {
    if (visited.has(land.id)) {
      continue;
    }
    const component: Land[] = [];
    const queue = [land.id];
    visited.add(land.id);
    while (queue.length > 0) {
      const current = byId.get(queue.shift() as string);
      if (!current) {
        continue;
      }
      component.push(current);
      for (const neighborId of current.neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
    if (component.length > largest.length) {
      largest = component;
    }
  }

  return largest.length > 1 ? largest : lands;
}

export function createInitialGameState(): GameState {
  const mapConfig = createRandomMapConfig();
  const { lands, hexTiles, rivalStartId } = createLands(mapConfig);

  const state: GameState = {
    year: 1,
    season: 'Spring',
    turn: 1,
    realtimeSeconds: 0,
    ordersRemaining: ORDERS_PER_SEASON,
    resources: {
      food: 120,
      supplies: 55,
      gold: 90,
      humans: 540,
    },
    resourceRates: { ...EMPTY_RESOURCE_BAG },
    mapRenderMode: 'terrain',
    mapSettings: { ...GAMEPLAY_MAP_CONFIG, seed: mapConfig.seed },
    hexTiles,
    mapConfig,
    lands,
    kingdoms: structuredClone(kingdomTemplates),
    armies: [
      {
        id: 'rival-host',
        kingdomId: 'northern-rival',
        name: 'Rival Host',
        landId: rivalStartId,
        units: {
          spearmen: 1050,
          archers: 520,
          heavyInfantry: 120,
        },
        morale: 73,
        supply: 84,
        rations: 300,
        provisions: 200,
        level: 1,
        experience: 0,
        experienceToNextLevel: 100,
      },
    ],
    heroes: [generateKingHero()],
    heroDeck: structuredClone(heroTemplates),
    politicsDeck: structuredClone(politicsCardTemplates),
    activeCourtModifiers: [],
    court: createInitialCourtState(),
    activeHeroDraft: undefined,
    activePoliticsCard: undefined,
    pendingCourtRequest: undefined,
    isPaused: false,
    selectedLandId: undefined,
    selectedArmyId: undefined,
    latestBattlePreview: undefined,
    latestBattleResult: undefined,
    acquisitionOrders: [],
    buildOrders: [],
    movementOrders: [],
    siegeOrders: [],
    recruitmentOrders: [],
    message: 'Expansion race begins. Buy nearby neutral land, build districts, then capture the rival capital.',
    victory: false,
  };

  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  return state;
}
