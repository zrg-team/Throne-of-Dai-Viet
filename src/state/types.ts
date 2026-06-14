import type { HexTile, MapGenConfig } from '../map/hexMapGenerator';

export type ResourceKey = 'food' | 'gold' | 'manpower' | 'stability' | 'influence';

export type LandType = 'castle' | 'farm' | 'market' | 'iron' | 'temple' | 'enemyCastle';

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
  gold: number;
  manpower: number;
  stability: number;
  influence: number;
}

export interface LandBonus {
  resource: ResourceKey;
  amount: number;
}

export interface LandUpgrade {
  id: string;
  name: string;
  costGold: number;
  description: string;
  bonus: Partial<ResourceBag>;
  defense?: number;
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
  bonus: LandBonus;
  neighbors: string[];
  upgradeLevel: number;
  upgrade: LandUpgrade;
  special: string;
}

/** Authored land data before hex-map generation fills in position/adjacency. */
export type LandTemplate = Omit<Land, 'x' | 'y' | 'neighbors'>;

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
  effects: Partial<ResourceBag>;
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

export interface GameState {
  year: number;
  season: Season;
  turn: number;
  realtimeSeconds: number;
  ordersRemaining: number;
  resources: ResourceBag;
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
  message: string;
  victory: boolean;
}
