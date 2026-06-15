import { ORDERS_PER_SEASON } from '../game/constants';
import { GAMEPLAY_MAP_CONFIG } from '../game/gameplayConfig';
import { generateKingHero, heroTemplates } from '../data/heroes';
import { kingdomTemplates } from '../data/kingdoms';
import { landTemplates } from '../data/lands';
import { politicsCardTemplates } from '../data/politicsCards';
import { computeCentroid, computeNeighbors, generateHexMap, type MapGenConfig } from '../map/hexMapGenerator';
import { refreshAllLandOutputs } from '../systems/ResourceSystem';
import { refreshPlayerVisibility } from '../systems/LandSystem';
import { createInitialCourtState } from '../systems/CourtSystem';
import type { GameState, Land, LandTemplate, ResourceBag, TerrainSummary } from './types';

const MAP_CONFIG: MapGenConfig = GAMEPLAY_MAP_CONFIG;

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

function createGeneratedNeutralDistrict(index: number): LandTemplate {
  const types: LandTemplate['type'][] = ['farm', 'iron', 'market', 'farm', 'iron'];
  const type = types[index % types.length];
  const label = String(index + 1).padStart(2, '0');
  const typeName = type === 'iron' ? 'Ridge' : type === 'market' ? 'Road Town' : 'Grassland';

  return {
    id: `frontier-${label}`,
    name: `Frontier ${typeName} ${label}`,
    type,
    ownerId: 'neutral',
    defense: type === 'iron' ? 24 + (index % 6) : type === 'market' ? 17 + (index % 4) : 11 + (index % 5),
    loyalty: 58 + (index % 18),
    buildings: [],
    special: 'Remote neutral district generated from map settings.',
  };
}

function createConfiguredLandTemplates(): LandTemplate[] {
  const templates = structuredClone(landTemplates);
  const currentNeutralCount = templates.filter((land) => land.ownerId === 'neutral').length;
  const extrasNeeded = Math.max(0, GAMEPLAY_MAP_CONFIG.neutralDistrictTarget - currentNeutralCount);

  for (let index = 0; index < extrasNeeded; index += 1) {
    templates.push(createGeneratedNeutralDistrict(index));
  }

  return templates;
}

function createLands(): { lands: Land[]; hexTiles: GameState['hexTiles'] } {
  const templates = createConfiguredLandTemplates();
  const { tiles, landHexes } = generateHexMap(templates, MAP_CONFIG);
  const neighbors = computeNeighbors(tiles);

  const lands: Land[] = templates.map((template) => {
    const hexes = landHexes.get(template.id) ?? [];
    const centroid = hexes.length > 0 ? computeCentroid(hexes, MAP_CONFIG.hexSize) : { x: 0, y: 0 };
    const summary = createEmptyTerrainSummary();
    for (const tile of tiles) {
      if (tile.landId === template.id) {
        summary[tile.terrain] += 1;
      }
    }
    const nonWaterTiles = Math.max(1, hexes.length - summary.water);
    return {
      ...template,
      x: centroid.x,
      y: centroid.y,
      neighbors: Array.from(neighbors.get(template.id) ?? []).sort(),
      buildingCapacity: Math.max(1, Math.floor(nonWaterTiles / 7)),
      terrainSummary: summary,
      outputs: { ...EMPTY_RESOURCE_BAG },
      isVisible: false,
      isExplored: false,
    };
  });

  return { lands, hexTiles: tiles };
}

export function createInitialGameState(): GameState {
  const { lands, hexTiles } = createLands();

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
    mapSettings: { ...GAMEPLAY_MAP_CONFIG },
    hexTiles,
    mapConfig: MAP_CONFIG,
    lands,
    kingdoms: structuredClone(kingdomTemplates),
    armies: [
      {
        id: 'rival-host',
        kingdomId: 'northern-rival',
        name: 'Rival Host',
        landId: 'cao-bang',
        units: {
          spearmen: 1050,
          archers: 520,
          heavyInfantry: 120,
        },
        morale: 73,
        supply: 84,
        rations: 300,
        provisions: 200,
      },
    ],
    heroes: [generateKingHero()],
    heroDeck: structuredClone(heroTemplates),
    politicsDeck: structuredClone(politicsCardTemplates),
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
