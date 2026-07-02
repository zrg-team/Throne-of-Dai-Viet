import { ORDERS_PER_SEASON, PLAYER_KINGDOM_ID } from '../game/constants';
import { GAMEPLAY_MAP_CONFIG } from '../game/gameplayConfig';
import { generateKingHero, heroTemplates } from '../data/heroes';
import { kingdomTemplates } from '../data/kingdoms';
import { politicsCardTemplates } from '../data/politicsCards';
import { computeCentroid, computeNeighbors, generateHexMap, type MapGenConfig } from '../map/hexMapGenerator';
import { refreshAllLandOutputs } from '../systems/ResourceSystem';
import { refreshPlayerVisibility } from '../systems/LandSystem';
import { createInitialCourtState } from '../systems/CourtSystem';
import { recomputeOpinion } from '../systems/DiplomacySystem';
import { createInitialMandate } from '../systems/empire/MandateSystem';
import { initDirectives } from '../systems/empire/DirectiveSystem';
import type { Army, CampaignConfig, GameState, Kingdom, Land, LandTemplate, ResourceBag, TerrainSummary } from './types';
import { landTypeLabel, t } from '../i18n';

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

function createRandomMapConfig(): MapGenConfig {
  return {
    ...GAMEPLAY_MAP_CONFIG,
    seed: randomInt(1_000_000_000),
  };
}

const NAME_PREFIXES = [
  'An', 'Bạch', 'Bình', 'Cẩm', 'Cửu', 'Đại', 'Đông', 'Hà', 'Hải', 'Hoàng',
  'Hồng', 'Lam', 'Linh', 'Long', 'Nam', 'Ngọc', 'Phong', 'Phú', 'Quảng',
  'Sơn', 'Tân', 'Thanh', 'Thiên', 'Thủy', 'Trường', 'Vân', 'Việt', 'Xuân'
];

const NAME_CORES = [
  'Châu', 'Giang', 'Hải', 'Khê', 'Lâm', 'Lĩnh', 'Phong', 'Sơn', 'Thành',
  'Trấn', 'Viên', 'Xuyên', 'Động', 'Quan', 'Đô', 'Hương', 'Thôn', 'Ấp',
  'Bình', 'Cảng', 'Cốc', 'Đèo', 'Lộ', 'Phủ', 'Quận', 'Trại', 'Vực'
];

const NAME_SUFFIXES = [
  '', '', '',
  'Thượng',
  'Hạ',
  'Đông',
  'Tây',
  'Nam',
  'Bắc'
];

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function pick<T>(items: T[]): T {
  return items[randomInt(items.length)];
}

function createRandomLandName(index: number, used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const prefix = pick(NAME_PREFIXES);
    const core = pick(NAME_CORES);
    const suffix = pick(NAME_SUFFIXES);

    const name = suffix
      ? `${prefix} ${core} ${suffix}`
      : `${prefix} ${core}`;

    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }

  const fallback = `Biên Trấn ${String(index + 1).padStart(2, '0')}`;
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
    special: isWilderness ? t('special.wilderness') : t('special.randomDistrict', { type: landTypeLabel(type) }),
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
    playerStart.name = `${playerStart.name}`;
    playerStart.type = 'castle';
    playerStart.ownerId = PLAYER_KINGDOM_ID;
    playerStart.defense = Math.max(playerStart.defense, 48);
    playerStart.loyalty = 100;
    playerStart.buildings = [{ type: 'market', level: 1 }, { type: 'farm', level: 1 }];
    playerStart.special = t('special.playerCapital');
    playerStart.hasVillage = true;
    playerStart.population = 120 + randomInt(40);
    playerStart.localSoldiers = Math.floor(playerStart.defense * 0.7);
    playerStart.trust = createInitialTrust(playerStart.ownerId);
  }

  if (rivalStart) {
    rivalStart.name = `${rivalStart.name}`;
    rivalStart.type = 'enemyCastle';
    rivalStart.ownerId = 'northern-rival';
    rivalStart.defense = Math.max(rivalStart.defense, 50);
    rivalStart.loyalty = 94;
    rivalStart.buildings = [{ type: 'market', level: 1 }, { type: 'mine', level: 1 }];
    rivalStart.special = t('special.rivalCapital');
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

const RIVAL_KINGDOM_IDS_FOR_CAMPAIGN = ['northern-rival', 'southern-rival', 'eastern-rival'];

const ROYAL_NAMES = [
  'Lý Công', 'Trần Hưng', 'Nguyễn Văn', 'Lê Lợi', 'Đinh Bộ',
  'Trịnh Kiểm', 'Nguyễn Hoàng', 'Lê Thánh', 'Phùng Hưng', 'Triệu Quang',
  'Bùi Thị', 'Quách Mãnh', 'Đoàn Thượng', 'Hồ Quý', 'Mạc Đăng',
];

function pickRoyalName(): string {
  return ROYAL_NAMES[randomInt(ROYAL_NAMES.length)];
}

function createCampaignMapConfig(config: CampaignConfig): MapGenConfig {
  return {
    ...GAMEPLAY_MAP_CONFIG,
    seed: randomInt(1_000_000_000),
    seaBorderSides: config.seaSides,
  };
}

function createCampaignLands(
  mapConfig: MapGenConfig,
  rivalKingdomIds: string[],
): { lands: Land[]; hexTiles: GameState['hexTiles']; playerStartId: string; rivalStartIds: string[] } {
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

  const largest = findLargestConnectedComponent(lands);
  const playerStartId = pickCenterLand(largest).id;
  const rivalStartIds = pickPeripheryLands(largest, playerStartId, rivalKingdomIds.length).map((l) => l.id);

  const playerStart = lands.find((l) => l.id === playerStartId);
  if (playerStart) {
    playerStart.type = 'castle';
    playerStart.ownerId = PLAYER_KINGDOM_ID;
    playerStart.defense = Math.max(playerStart.defense, 52);
    playerStart.loyalty = 100;
    playerStart.buildings = [{ type: 'market', level: 1 }, { type: 'farm', level: 1 }];
    playerStart.special = t('special.playerCapital');
    playerStart.hasVillage = true;
    playerStart.population = 130 + randomInt(40);
    playerStart.localSoldiers = Math.floor(playerStart.defense * 0.7);
    playerStart.trust = createInitialTrust(PLAYER_KINGDOM_ID);
  }

  for (let i = 0; i < rivalStartIds.length; i += 1) {
    const rivalLand = lands.find((l) => l.id === rivalStartIds[i]);
    const kingdomId = rivalKingdomIds[i];
    if (rivalLand && kingdomId) {
      rivalLand.type = 'enemyCastle';
      rivalLand.ownerId = kingdomId;
      rivalLand.defense = Math.max(rivalLand.defense, 46);
      rivalLand.loyalty = 90 + randomInt(8);
      rivalLand.buildings = [{ type: 'market', level: 1 }, { type: 'mine', level: 1 }];
      rivalLand.special = t('special.rivalCapital');
      rivalLand.hasVillage = true;
      rivalLand.population = 100 + randomInt(40);
      rivalLand.localSoldiers = Math.floor(rivalLand.defense * 0.7);
      rivalLand.trust = createInitialTrust(rivalLand.ownerId);
    }
  }

  return { lands, hexTiles: tiles, playerStartId, rivalStartIds };
}

function pickCenterLand(lands: Land[]): Land {
  const avgX = lands.reduce((sum, l) => sum + l.x, 0) / lands.length;
  const avgY = lands.reduce((sum, l) => sum + l.y, 0) / lands.length;
  let best = lands[0];
  let bestDist = Infinity;
  for (const land of lands) {
    const d = (land.x - avgX) ** 2 + (land.y - avgY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = land;
    }
  }
  return best;
}

function pickPeripheryLands(lands: Land[], excludeId: string, count: number): Land[] {
  const candidates = lands.filter((l) => l.id !== excludeId);
  const chosen: Land[] = [];
  const usedIds = new Set<string>([excludeId]);

  for (let pick = 0; pick < count; pick += 1) {
    let bestLand: Land | undefined;
    let bestMinDist = -1;

    for (const land of candidates) {
      if (usedIds.has(land.id)) {
        continue;
      }
      let minDist = Infinity;
      for (const used of [...usedIds].map((id) => lands.find((l) => l.id === id)!).filter(Boolean)) {
        const d = (land.x - used.x) ** 2 + (land.y - used.y) ** 2;
        if (d < minDist) {
          minDist = d;
        }
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestLand = land;
      }
    }

    if (!bestLand) {
      break;
    }
    chosen.push(bestLand);
    usedIds.add(bestLand.id);
  }

  return chosen;
}

function getDifficultyArmyScale(difficulty: CampaignConfig['difficulty']): number {
  if (difficulty === 'easy') return 0.70;
  if (difficulty === 'hard') return 1.35;
  if (difficulty === 'ironman') return 1.65;
  return 1.0;
}

export function createCampaignGameState(config: CampaignConfig): GameState {
  const mapConfig = createCampaignMapConfig(config);
  const { lands, hexTiles, rivalStartIds } = createCampaignLands(mapConfig, RIVAL_KINGDOM_IDS_FOR_CAMPAIGN);

  const allKingdoms: Kingdom[] = structuredClone(
    kingdomTemplates.filter((k) => k.id === PLAYER_KINGDOM_ID || RIVAL_KINGDOM_IDS_FOR_CAMPAIGN.includes(k.id)),
  );

  for (const kingdom of allKingdoms) {
    if (kingdom.id !== PLAYER_KINGDOM_ID) {
      kingdom.king = {
        name: pickRoyalName(),
        personality: kingdom.personality,
        age: randomInt(12),
      };
      kingdom.relations = 50;
      kingdom.opinionModifiers = [];
      kingdom.giftFatigue = 0;
      recomputeOpinion(kingdom);
    }
  }

  const armyScale = getDifficultyArmyScale(config.difficulty);
  const armies: Army[] = [];
  for (let i = 0; i < RIVAL_KINGDOM_IDS_FOR_CAMPAIGN.length; i += 1) {
    const kingdomId = RIVAL_KINGDOM_IDS_FOR_CAMPAIGN[i];
    const landId = rivalStartIds[i];
    if (!landId) {
      continue;
    }
    const kingdom = allKingdoms.find((k) => k.id === kingdomId);
    armies.push({
      id: `${kingdomId}-host`,
      kingdomId,
      name: `${kingdom?.name ?? 'Rival'} Army`,
      landId,
      units: {
        spearmen: Math.floor(800 * armyScale),
        archers: Math.floor(350 * armyScale),
        heavyInfantry: Math.floor(80 * armyScale),
      },
      morale: 70,
      supply: 80,
      rations: 250,
      provisions: 150,
      level: 1,
      experience: 0,
      experienceToNextLevel: 100,
    });
  }

  const state: GameState = {
    year: 1,
    season: 'Spring',
    turn: 1,
    realtimeSeconds: 0,
    ordersRemaining: ORDERS_PER_SEASON,
    resources: { food: 140, supplies: 65, gold: 100, humans: 580 },
    resourceRates: { ...EMPTY_RESOURCE_BAG },
    mapRenderMode: 'terrain',
    mapSettings: { ...GAMEPLAY_MAP_CONFIG, seed: mapConfig.seed },
    hexTiles,
    mapConfig,
    lands,
    kingdoms: allKingdoms,
    armies,
    heroes: [generateKingHero()],
    heroDeck: structuredClone(heroTemplates),
    politicsDeck: structuredClone(politicsCardTemplates),
    activeCourtModifiers: [],
    court: createInitialCourtState(),
    activeHeroDraft: undefined,
    activePoliticsCard: undefined,
    pendingCourtRequest: undefined,
    isPaused: false,
    isStrategyPause: false,
    selectedLandId: undefined,
    selectedArmyId: undefined,
    latestBattlePreview: undefined,
    latestBattleResult: undefined,
    acquisitionOrders: [],
    buildOrders: [],
    movementOrders: [],
    siegeOrders: [],
    recruitmentOrders: [],
    message: t('msg.campaignStart'),
    victory: false,
    gameMode: 'campaign',
    campaignConfig: config,
    dynastyStatus: { farmerUnrest: 15, nobleRelations: 60, consecutiveLowStability: 0 },
    campaignScore: { turnsAlive: 0, armiesDefeated: 0, largestArmyDefeated: 0, peakLandsHeld: 1 },
    spyReports: [],
    scheduledCampaignEvents: [],
    isDefeated: false,
    defeatReason: undefined,
  };

  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  return state;
}

const EMPIRE_KINGDOM_IDS = ['northern-rival', 'southern-rival', 'eastern-rival', 'western-rival'];

/**
 * "Throne of Empires" mode. The player holds the centre of the map among neutral
 * districts to expand into; the rival kingdoms are off-map "Empires" that own no
 * territory and never appear on the board — they pressure the realm only through
 * court cards, foreign affairs, and invasions (see InvasionSystem). Endless: there
 * is no elimination victory, only survival and the high-score screen on defeat.
 */
export function createEmpireGameState(config: CampaignConfig): GameState {
  const mapConfig = createCampaignMapConfig(config);
  // Empty rival list → player castle + neutral districts only, no enemy castles.
  const { lands, hexTiles } = createCampaignLands(mapConfig, []);

  const allKingdoms: Kingdom[] = structuredClone(
    kingdomTemplates.filter((k) => k.id === PLAYER_KINGDOM_ID || EMPIRE_KINGDOM_IDS.includes(k.id)),
  );

  for (const kingdom of allKingdoms) {
    if (kingdom.id !== PLAYER_KINGDOM_ID) {
      kingdom.king = {
        name: pickRoyalName(),
        personality: kingdom.personality,
        age: randomInt(12),
      };
      kingdom.relations = 50;
      kingdom.opinionModifiers = [];
      kingdom.giftFatigue = 0;
      recomputeOpinion(kingdom);
    }
  }

  const state: GameState = {
    year: 1,
    season: 'Spring',
    turn: 1,
    realtimeSeconds: 0,
    ordersRemaining: ORDERS_PER_SEASON,
    resources: { food: 150, supplies: 70, gold: 110, humans: 600 },
    resourceRates: { ...EMPTY_RESOURCE_BAG },
    mapRenderMode: 'terrain',
    mapSettings: { ...GAMEPLAY_MAP_CONFIG, seed: mapConfig.seed },
    hexTiles,
    mapConfig,
    lands,
    kingdoms: allKingdoms,
    armies: [],
    heroes: [generateKingHero()],
    heroDeck: structuredClone(heroTemplates),
    politicsDeck: structuredClone(politicsCardTemplates),
    activeCourtModifiers: [],
    court: createInitialCourtState(),
    activeHeroDraft: undefined,
    activePoliticsCard: undefined,
    pendingCourtRequest: undefined,
    isPaused: false,
    isStrategyPause: false,
    selectedLandId: undefined,
    selectedArmyId: undefined,
    latestBattlePreview: undefined,
    latestBattleResult: undefined,
    acquisitionOrders: [],
    buildOrders: [],
    movementOrders: [],
    siegeOrders: [],
    recruitmentOrders: [],
    message: t('msg.campaignStart'),
    victory: false,
    gameMode: 'empire',
    campaignConfig: config,
    dynastyStatus: { farmerUnrest: 15, nobleRelations: 60, consecutiveLowStability: 0 },
    campaignScore: { turnsAlive: 0, armiesDefeated: 0, largestArmyDefeated: 0, peakLandsHeld: 1 },
    spyReports: [],
    scheduledCampaignEvents: [],
    invasions: [],
    toasts: [],
    mandate: createInitialMandate(),
    greatInvasionEras: [],
    threatBudget: 0,
    invasionsRepelled: 0,
    wondersBuilt: 0,
    isDefeated: false,
    defeatReason: undefined,
  };

  initDirectives(state);
  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  return state;
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
    isStrategyPause: false,
    selectedLandId: undefined,
    selectedArmyId: undefined,
    latestBattlePreview: undefined,
    latestBattleResult: undefined,
    acquisitionOrders: [],
    buildOrders: [],
    movementOrders: [],
    siegeOrders: [],
    recruitmentOrders: [],
    message: t('msg.initial'),
    victory: false,
    gameMode: 'rival',
    campaignConfig: undefined,
    dynastyStatus: undefined,
    campaignScore: undefined,
    spyReports: [],
    scheduledCampaignEvents: [],
    isDefeated: false,
    defeatReason: undefined,
  };

  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  return state;
}
