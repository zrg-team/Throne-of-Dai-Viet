import type { HexTile, MapGenConfig } from '../map/hexMapGenerator';

export type ResourceKey = 'food' | 'supplies' | 'gold' | 'humans';

export type LandType = 'castle' | 'farm' | 'market' | 'iron' | 'temple' | 'enemyCastle' | 'wilderness';

export type LandBuildingType = 'farm' | 'mine' | 'market' | 'wall' | 'tower' | 'barracks' | 'communalHall';

/** A constructed building on a district: its type and current upgrade level. */
export interface LandBuildingInstance {
  type: LandBuildingType;
  level: number;
}

export type MapRenderMode = 'terrain' | 'control';

export type HeroType = 'general' | 'governor' | 'minister' | 'agent';

export type UnitType = 'militia' | 'spearmen' | 'archers' | 'crossbowmen' | 'heavyInfantry' | 'lightCavalry' | 'royalGuard' | 'warElephants' | 'siegeEngine' | 'riverMarines';

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
  buildings: LandBuildingInstance[];
  buildingCapacity: number;
  terrainSummary: TerrainSummary;
  outputs: ResourceBag;
  isVisible: boolean;
  isExplored: boolean;
  special: string;
  /** People living here. Gained as humans resource on acquisition. */
  population: number;
  /** Local militia strength. Drives noble power and affects all acquisition methods. */
  localSoldiers: number;
  /** Whether a settled community exists. Gates which acquisition methods are available. */
  hasVillage: boolean;
  /** Per-kingdom trust (0–100). Defaults to 40 when not set. */
  trust: Record<string, number>;
}

/** Authored land data before hex-map generation fills in position/adjacency. */
export type LandTemplate = Omit<Land, 'x' | 'y' | 'neighbors' | 'buildingCapacity' | 'terrainSummary' | 'outputs' | 'isVisible' | 'isExplored' | 'population' | 'localSoldiers' | 'hasVillage' | 'trust'>;

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
  /** Food units carried by the army; depletes each economy tick. */
  rations: number;
  /** Supply units carried by the army; depletes each economy tick and affects march speed/morale. */
  provisions: number;
  level: number;
  experience: number;
  experienceToNextLevel: number;
  unpaidTicks?: number;
}

/** An in-progress march: an army advancing one land per leg toward `path`'s last entry. */
export interface MovementOrder {
  armyId: string;
  /** Remaining land ids to visit, in order. The last entry is the final destination. */
  path: string[];
  /** Ticks accumulated toward completing the current leg (path[0]). */
  progress: number;
  /** Ticks required to complete the current leg (path[0]). */
  legRequired: number;
}

/** Core hero stats (0-100). Drive court position bonuses and land assignment bonuses. */
export interface HeroStats {
  /** Army power in battle. */
  martial: number;
  /** Recruitment speed, build/upgrade speed, march speed. */
  logistics: number;
  /** Resource output %, building cost reduction. */
  administration: number;
  /** Influence gain, peaceful acquisition speed. */
  diplomacy: number;
  /** Stability regen, land loyalty regen. */
  loyalty: number;
  /** Favor generation, army morale regen, recruitment via fame. */
  renown: number;
}

export interface Hero {
  id: string;
  name: string;
  type: HeroType;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  upkeepGold: number;
  description: string;
  effect: string;
  stats: HeroStats;
  /** While seated in court, biases the politics card draw toward this card type. */
  cardBias?: PoliticsCard['type'];
  /** While seated in court, adds this card template to the active politics deck. */
  signatureCardId?: string;
  assignedTo?: string;
  fatigue: number;
}

export interface CourtModifier {
  id: string;
  label: string;
  remainingTicks?: number;
  resourceRateModifier?: Partial<ResourceBag>;
  recruitSpeedModifier?: number;
  courtCardSpeedModifier?: number;
  armyXpModifier?: number;
  buildingCostModifier?: number;
  buildSpeedBonus?: number;
  upgradeSpeedBonus?: number;
  acquisitionCostModifier?: number;
  armyGoldUpkeepModifier?: number;
  buildingGoldUpkeepModifier?: number;
  buildingSuppliesUpkeepModifier?: number;
  marketGoldOutputModifier?: number;
  recruitmentSupplyCostModifier?: number;
  nextArmyLevelBonus?: number;
  nextArmyArchersBonus?: number;
  nextArmyHeavyBonus?: number;
  battleSupplyCostModifier?: number;
  armyLevelCapBonus?: number;
}

export interface CourtEffect extends Partial<Omit<CourtModifier, 'id' | 'label' | 'remainingTicks'>> {
  resourceDelta?: Partial<ResourceBag>;
  durationTicks?: number;
  permanent?: boolean;
  freeBuilding?: LandBuildingType;
  freeUpgrade?: LandBuildingType;
  freeHeroDraft?: true | HeroType;
  completeBuildOrder?: boolean;
  completeUpgradeOrder?: boolean;
  restoreArmyReadiness?: boolean;
  defenseBoost?: number;
  favorDelta?: number;
  stabilityDelta?: number;
  influenceDelta?: number;
  nextCourtCardSoon?: boolean;
  extraCourtDraw?: boolean;
  duplicateNextCourtChoice?: boolean;
}

export interface PoliticsChoice {
  id: string;
  label: string;
  description: string;
  effects: CourtEffect;
}

export interface PoliticsCard {
  id: string;
  title: string;
  type: 'problem' | 'law' | 'opportunity' | 'crisis';
  seasons?: Season[];
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

export interface BattleResult {
  attackerArmyId: string;
  targetLandId: string;
  victory: boolean;
  attackerPower: number;
  defenderPower: number;
  /** Ticks until the besieged district falls; only set when `victory` is true. */
  siegeTicks?: number;
}

/** An in-progress siege: a victorious army occupies the land while it slowly falls to the attacker. */
export interface SiegeOrder {
  landId: string;
  armyId: string;
  attackerKingdomId: string;
  /** Land the besieging army marched from, used if the player retreats instead of waiting it out. */
  fromLandId: string;
  progress: number;
  required: number;
}

export type AcquisitionMethod = 'bribe' | 'diplomacy' | 'intimidation' | 'settle' | 'occupy' | 'conquest';

export interface AcquisitionOrder {
  landId: string;
  buyerId: string;
  progress: number;
  required: number;
  costGold: number;
  method: AcquisitionMethod;
  /** Hero assigned to a diplomatic claim. */
  heroId?: string;
  /** Army applying pressure in an intimidation order. */
  armyId?: string;
}

export interface BuildOrder {
  landId: string;
  building: LandBuildingType;
  kind: 'build' | 'upgrade';
  /** Index into land.buildings; only set for kind === 'upgrade'. */
  buildingIndex?: number;
  progress: number;
  required: number;
}

/** An in-progress training order: a new army being assembled at `landId` over several ticks. */
export interface RecruitmentOrder {
  id: string;
  landId: string;
  heroId: string;
  totalSoldiers: number;
  rations: number;
  provisions: number;
  progress: number;
  required: number;
}

export type CourtPositionId =
  | 'marshal'
  | 'quartermaster'
  | 'treasurer'
  | 'steward'
  | 'chancellor'
  | 'spymaster'
  | 'censor'
  | 'masterOfHorse';

/** Kingdom-wide court state: seated heroes, unlocked seats, and political stats. */
export interface CourtState {
  /** Position id -> seated hero id. */
  seats: Partial<Record<CourtPositionId, string>>;
  /** Positions the player can currently assign heroes to. */
  unlockedSeats: CourtPositionId[];
  /** Internal order; low stability raises rebellion/crisis risk. 0-100. */
  stability: number;
  /** Diplomatic capital; spent on peaceful actions, gained from court bonuses. 0-100. */
  influence: number;
  /** Accumulates each economy tick; a new hero draft arrives once it reaches favorThreshold. */
  favor: number;
  favorThreshold: number;
  /** Economy ticks remaining before the next politics card may be drawn. */
  cardCooldown: number;
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
  activeCourtModifiers: CourtModifier[];
  court: CourtState;
  activeHeroDraft?: Hero[];
  activePoliticsCard?: PoliticsCard;
  pendingCourtRequest?: PoliticsCard;
  isPaused: boolean;
  selectedLandId?: string;
  selectedArmyId?: string;
  latestBattlePreview?: BattlePreview;
  latestBattleResult?: BattleResult;
  acquisitionOrders: AcquisitionOrder[];
  buildOrders: BuildOrder[];
  movementOrders: MovementOrder[];
  siegeOrders: SiegeOrder[];
  recruitmentOrders: RecruitmentOrder[];
  message: string;
  victory: boolean;
}
