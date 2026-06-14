import { ORDERS_PER_SEASON } from '../game/constants';
import { heroTemplates } from '../data/heroes';
import { kingdomTemplates } from '../data/kingdoms';
import { landTemplates } from '../data/lands';
import { politicsCardTemplates } from '../data/politicsCards';
import { computeCentroid, computeNeighbors, generateHexMap, type MapGenConfig } from '../map/hexMapGenerator';
import type { GameState, Land } from './types';

const MAP_CONFIG: MapGenConfig = {
  cols: 18,
  rows: 30,
  hexSize: 18,
  seed: 1337,
  riverHexCount: 40,
};

function createLands(): { lands: Land[]; hexTiles: GameState['hexTiles'] } {
  const templates = structuredClone(landTemplates);
  const { tiles, landHexes } = generateHexMap(templates, MAP_CONFIG);
  const neighbors = computeNeighbors(tiles);

  const lands: Land[] = templates.map((template) => {
    const hexes = landHexes.get(template.id) ?? [];
    const centroid = hexes.length > 0 ? computeCentroid(hexes, MAP_CONFIG.hexSize) : { x: 0, y: 0 };
    return {
      ...template,
      x: centroid.x,
      y: centroid.y,
      neighbors: Array.from(neighbors.get(template.id) ?? []).sort(),
    };
  });

  return { lands, hexTiles: tiles };
}

export function createInitialGameState(): GameState {
  const { lands, hexTiles } = createLands();

  return {
    year: 1,
    season: 'Spring',
    turn: 1,
    realtimeSeconds: 0,
    ordersRemaining: ORDERS_PER_SEASON,
    resources: {
      food: 120,
      gold: 90,
      manpower: 850,
      stability: 78,
      influence: 42,
    },
    hexTiles,
    mapConfig: MAP_CONFIG,
    lands,
    kingdoms: structuredClone(kingdomTemplates),
    armies: [
      {
        id: 'first-army',
        kingdomId: 'dai-viet',
        name: '1st Army',
        landId: 'thang-long',
        units: {
          spearmen: 1200,
          archers: 500,
          heavyInfantry: 0,
        },
        morale: 76,
        supply: 85,
        hasMoved: false,
      },
      {
        id: 'north-host',
        kingdomId: 'north-lords',
        name: 'Mountain Host',
        landId: 'north-castle',
        units: {
          spearmen: 950,
          archers: 600,
          heavyInfantry: 120,
        },
        morale: 72,
        supply: 82,
        hasMoved: false,
      },
      {
        id: 'south-host',
        kingdomId: 'south-league',
        name: 'Port Guard',
        landId: 'south-castle',
        units: {
          spearmen: 900,
          archers: 450,
          heavyInfantry: 160,
        },
        morale: 70,
        supply: 80,
        hasMoved: false,
      },
    ],
    heroes: [],
    heroDeck: structuredClone(heroTemplates),
    politicsDeck: structuredClone(politicsCardTemplates),
    activeHeroDraft: undefined,
    activePoliticsCard: undefined,
    pendingCourtRequest: undefined,
    isPaused: false,
    selectedLandId: undefined,
    awaitingMoveArmyId: undefined,
    latestBattlePreview: undefined,
    message: 'Mandate begins at Thăng Long Castle. Tap a land to inspect it.',
    victory: false,
  };
}
