import type { HexTile, MapGenConfig } from '../map/hexMapGenerator';

export type ResourceKey = 'food' | 'supplies' | 'gold' | 'humans';

export type LandType = 'castle' | 'farm' | 'market' | 'iron' | 'temple' | 'enemyCastle';

export type LandBuildingType = 'farm' | 'mine' | 'market';

export type MapRenderMode = 'terrain' | 'control';

export type HeroType = 'general' | 'governor' | 'minister' | 'agent';

export type UnitType = 'spearmen' | 'archers' | 'heavyInfantry';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export type KingdomPersonality =
  | 'player'
  | 'aggressive'
  | 'defensive'
  | 'economic'
  | 'diplomatic'
  | 'expansionist';

export interface ResourceBag {
  food: number;
  supplies: number;
  gold: number;
  humans: number;
}

export interface TerrainSummary {
  plains: number;
  fields: number;
  riceFields: number;
  forest: number;
  mountains: number;
  hills: number;
  water: number;
  fortress: number;
  shrine: number;
}

export interface Land {
  id: string;
  name: string;
  type: LandType;
  ownerId: string;
  /** Centroid of this land's hex tiles, computed at map generation time. */
  x: number;
  y: number;
  defense: number;
  loyalty: number;
  neighbors: string[];
  buildings: LandBuildingType[];
  buildingCapacity: number;
  terrainSummary: TerrainSummary;
  outputs: ResourceBag;
  isVisible: boolean;
  isExplored: boolean;
  special: string;
}

/** Authored land data before hex-map generation fills in position/adjacency. */
export type LandTemplate = Omit<Land, 'x' | 'y' | 'neighbors' | 'buildingCapacity' | 'terrainSummary' | 'outputs' | 'isVisible' | 'isExplored'>;

export interface Kingdom {
  id: string;
  name: string;
  color: number;
  personality: KingdomPersonality;
  isDefeated: boolean;
}

export interface UnitCounts {
  spearmen: number;
  archers: number;
  heavyInfantry: number;
}

export interface Army {
  id: string;
  kingdomId: string;
  name: string;
  landId: string;
  units: UnitCounts;
  generalHeroId?: string;
  morale: number;
  supply: number;
  hasMoved: boolean;
}

export interface Hero {
  id: string;
  name: string;
  type: HeroType;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  upkeepGold: number;
  description: string;
  effect: string;
  assignedTo?: string;
  fatigue: number;
}

export interface PoliticsChoice {
  id: string;
  label: string;
  description: string;
  effects: Record<string, number>;
}

export interface PoliticsCard {
  id: string;
  title: string;
  type: 'problem' | 'law' | 'opportunity' | 'crisis';
  description: string;
  choices: [PoliticsChoice, PoliticsChoice];
}

export interface BattlePreview {
  attackerArmyId: string;
  targetLandId: string;
  winChance: number;
  attackerPower: number;
  defenderPower: number;
}

export interface AcquisitionOrder {
  landId: string;
  buyerId: string;
  progress: number;
  required: number;
  costGold: number;
}

export interface BuildOrder {
  landId: string;
  building: LandBuildingType;
  progress: number;
  required: number;
}

export interface GameState {
  year: number;
  season: Season;
  turn: number;
  realtimeSeconds: number;
  ordersRemaining: number;
  resources: ResourceBag;
  resourceRates: ResourceBag;
  mapRenderMode: MapRenderMode;
  mapSettings: MapGenConfig & { neutralDistrictTarget: number };
  hexTiles: HexTile[];
  mapConfig: MapGenConfig;
  lands: Land[];
  kingdoms: Kingdom[];
  armies: Army[];
  heroes: Hero[];
  heroDeck: Hero[];
  politicsDeck: PoliticsCard[];
  activeHeroDraft?: Hero[];
  activePoliticsCard?: PoliticsCard;
  pendingCourtRequest?: PoliticsCard;
  isPaused: boolean;
  selectedLandId?: string;
  awaitingMoveArmyId?: string;
  latestBattlePreview?: BattlePreview;
  acquisitionOrders: AcquisitionOrder[];
  buildOrders: BuildOrder[];
  message: string;
  victory: boolean;
}
