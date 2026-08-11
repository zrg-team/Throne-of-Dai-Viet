import type { HexTile, MapGenConfig } from '../map/hexMapGenerator';

export type ResourceKey = 'food' | 'supplies' | 'gold' | 'humans';

export type LandType = 'castle' | 'farm' | 'market' | 'iron' | 'temple' | 'enemyCastle' | 'wilderness';

export type LandBuildingType =
  | 'farm' | 'mine' | 'market' | 'wall' | 'tower' | 'barracks' | 'communalHall'
  // Era-unlocked advanced districts (empire mode): new economic levers that only become
  // available as the realm advances, so later eras genuinely expand what you can build.
  | 'harbor' | 'workshop' | 'guild' | 'university';

/**
 * A province's economic focus. Chosen by the player to tilt a district hard toward one
 * role (with a trade-off elsewhere), so each land becomes a live decision rather than a
 * uniform build queue. `balanced` is the neutral default.
 */
export type LandSpecialization = 'balanced' | 'breadbasket' | 'mining' | 'trade' | 'populous' | 'fortress';

/**
 * Realm-wide tax stance — a live "guns vs. butter" lever. Heavier taxes fill the treasury
 * but cost stability and slow population growth; a lenient hand does the reverse.
 */
export type TaxPolicy = 'lenient' | 'balanced' | 'harsh';

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
  /** Player-chosen economic focus for this province. Absent = 'balanced'. */
  specialization?: LandSpecialization;
}

/** Authored land data before hex-map generation fills in position/adjacency. */
export type LandTemplate = Omit<Land, 'x' | 'y' | 'neighbors' | 'buildingCapacity' | 'terrainSummary' | 'outputs' | 'isVisible' | 'isExplored' | 'population' | 'localSoldiers' | 'hasVillage' | 'trust'>;

export type GameMode = 'rival' | 'campaign' | 'empire' | 'ascent';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'ironman';

/** A pausing intelligence alert — a spy/agent warns of an incoming attack so the player can act. */
export interface ThreatAlert {
  id: string;
  kind: 'incoming' | 'coalition' | 'vassalage';
  kingdomId: string;
  kingdomName: string;
  warlordName?: string;
  /** Seasons of lead time before the host musters. */
  turns: number;
  /** How the host compares to the player's defensible strength: 'weaker' | 'even' | 'stronger'. */
  strength: 'weaker' | 'even' | 'stronger';
}

/** A field engagement awaiting the player's tactical call. */
export interface PendingBattle {
  invaderArmyId: string;
  landId: string;
  landName: string;
  kingdomId: string;
  kingdomName: string;
  isGreat: boolean;
  /** Pre-computed odds so the decision screen can show the stakes. */
  attackerPower: number;
  defenderPower: number;
}

/** An off-map empire's army marching on the realm (empire mode). Keyed to an `Army.id`. */
export interface InvasionRecord {
  armyId: string;
  kingdomId: string;
  /** 'raid' pillages a border district then withdraws; 'conquest' besieges to capture land. */
  intent: 'raid' | 'conquest';
  /** Land the host is currently marching toward. */
  targetLandId?: string;
  /** Set once a raider has pillaged; it then turns for the map edge and despawns. */
  pillaged?: boolean;
  /** Edge land a withdrawing raider heads back to before despawning. */
  exitLandId?: string;
  /** Part of a telegraphed Great Invasion (boss coalition); yields larger spoils. */
  great?: boolean;
}

export interface KingdomKing {
  name: string;
  personality: KingdomPersonality;
  age: number;
}

export interface CampaignConfig {
  seaSides: 0 | 1 | 2 | 3;
  difficulty: Difficulty;
  /** Optional dynasty founder chosen at setup (empire mode) — a starting Legendary hero. */
  founderId?: string;
}

export interface CampaignScore {
  turnsAlive: number;
  armiesDefeated: number;
  largestArmyDefeated: number;
  peakLandsHeld: number;
}

export interface DynastyStatus {
  farmerUnrest: number;
  nobleRelations: number;
  consecutiveLowStability: number;
}

export interface SpyReport {
  id: string;
  tick: number;
  message: string;
}

export interface CampaignEvent {
  id: string;
  type: 'bandit-raid' | 'flood' | 'drought' | 'noble-uprising' | 'merchant-bounty' | 'plague' | 'dynasty-attack';
  scheduledTick: number;
  sourceKingdomId?: string;
  targetLandId?: string;
  resolved: boolean;
}

/** Source category of an opinion modifier, used for icons/grouping in the UI. */
export type OpinionSource =
  | 'gift'
  | 'trade'
  | 'tribute'
  | 'treaty'
  | 'request'
  | 'war'
  | 'raid'
  | 'trait'
  | 'reputation';

/**
 * A single reason an empire's opinion of the player is higher or lower. Opinion
 * (cached as `Kingdom.relations`) is the personality baseline plus the sum of these.
 * Modifiers with a `decay` shrink toward 0 each tick (temporary); without it they
 * persist while their condition holds (standing).
 */
export interface OpinionModifier {
  id: string;
  label: string;
  value: number;
  /** Per-tick magnitude reduction toward 0. Omit for standing modifiers. */
  decay?: number;
  source: OpinionSource;
}

/** A binding agreement between an empire and the player. */
export interface Treaty {
  type: 'non-aggression';
  /** Turn the treaty lapses. */
  expiresTurn: number;
}

export interface Kingdom {
  id: string;
  name: string;
  color: number;
  personality: KingdomPersonality;
  isDefeated: boolean;
  king?: KingdomKing;
  /** Cached opinion 0-100 = baseline + sum(opinionModifiers). Source of truth is the modifier list. */
  relations?: number;
  hostilityTimer?: number;
  /** Itemised reasons behind `relations`. */
  opinionModifiers?: OpinionModifier[];
  /** Rises each time the player gifts; raises the cost and dampens the gain of further gifts. Decays over time. */
  giftFatigue?: number;
  /** 0-100; how much they believe the player's word. Gates treaty acceptance; lost by breaking deals. */
  trust?: number;
  /** Active treaties with the player. */
  treaties?: Treaty[];
  /** Escalation meter; rises with low opinion + low fear, triggers an invasion when it tops out. */
  warAppetite?: number;
  /** Evolving military-strength index (empire sim, ~20-120). Drives invasion size/odds and inter-empire wars. */
  power?: number;
  /** Internal order 0-100 (empire sim). Low → less aggressive, vulnerable to conquest/collapse. */
  stability?: number;
  /** Hero id seated as the player's ambassador here (standing opinion gain + intel). */
  ambassadorHeroId?: string;
  /** Cumulative years this empire has existed under its current identity (reset on rebirth). */
  age?: number;
}

/** One option on a foreign-affairs event card. */
export interface ForeignChoice {
  id: string;
  label: string;
  description: string;
  /** Resources spent (negative) or gained (positive) when chosen. */
  delta?: Partial<ResourceBag>;
  /** Decaying opinion change with the asking empire. */
  opinionDelta?: number;
  /** Standing opinion change with the asking empire (e.g. a marriage bond). */
  opinionStanding?: number;
  /** Opinion change with a named third-party empire (`ForeignCard.rivalId`). */
  rivalOpinionDelta?: number;
  prestigeDelta?: number;
  trustDelta?: number;
  /** Adds escalation pressure toward an invasion by the asking empire. */
  provoke?: number;
  /** Clears the asking empire's war preparations. */
  appease?: boolean;
  /** Choice is only credible with a standing army (leverage gate). */
  requiresArmy?: boolean;
}

/** An empire-tied dilemma presented to the player (Phase 3 foreign event deck). */
export interface ForeignCard {
  id: string;
  kingdomId: string;
  kingdomName: string;
  rivalId?: string;
  rivalName?: string;
  title: string;
  description: string;
  choices: ForeignChoice[];
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
  /** Elite tier (0 = levy, 1 = trained, 2 = royal guard); each tier adds battle power. */
  elite?: number;
  /**
   * Full command delegated to this army's hero: the general autonomously marches to
   * intercept the nearest incoming invasion, so the player can let a trusted hero run the
   * frontier instead of micro-managing every march.
   */
  autoDefend?: boolean;
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
  /** 0 = fresh, 100 = exhausted. Reframed as "Energy" (100 - fatigue) in the hero hub;
   *  active hero actions (missions/abilities) spend it, resting recovers it. */
  fatigue: number;
  /** Battles won while commanding (empire mode); a veteran general grows in martial skill. */
  battlesWon?: number;
  /** Missions completed (empire mode); drives renown growth and earned traits. */
  missionsDone?: number;
  /** Earned traits (e.g. "Veteran", "Conqueror") shown on the hero card. */
  traits?: string[];
}

/** The kind of active mission a hero can be dispatched on (empire mode). One per hero type. */
export type HeroMissionKind = 'raid' | 'sabotage' | 'taxCircuit' | 'quellUnrest';

/** An in-flight hero mission that resolves after a number of economy ticks (empire mode). */
export interface HeroMission {
  id: string;
  heroId: string;
  kind: HeroMissionKind;
  /** Rival empire the mission acts against (raid/sabotage). */
  targetKingdomId?: string;
  ticksRemaining: number;
  totalTicks: number;
}

/** A personal hero dilemma the roster raises for a decision (empire mode). */
export type HeroEventKind = 'ambition' | 'exhaustion' | 'loyalty';

/** A pending hero-authored decision card, resolved via a two-way choice. */
export interface HeroEvent {
  id: string;
  heroId: string;
  kind: HeroEventKind;
}

export interface CourtModifier {
  id: string;
  label: string;
  remainingTicks?: number;
  resourceRateModifier?: Partial<ResourceBag>;
  recruitSpeedModifier?: number;
  courtCardSpeedModifier?: number;
  /** Additive share on army battle power (0.08 = +8%). Summed across modifiers into `armyPowerMult`. */
  armyPowerModifier?: number;
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
  relationsAllDelta?: number;
  hostilityResetAll?: boolean;
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
  /** Fate of the commanding general on a defeat (empire-mode battlefield stakes). */
  generalFate?: 'wounded' | 'slain';
  /** Name of the general whose fate is reported, for the result screen. */
  generalName?: string;
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
/** Chosen army composition doctrine — shapes the spearmen/archer/heavy mix (unit counters). */
export type ArmyComposition = 'balanced' | 'spears' | 'archers' | 'shock';

/** Pre-battle tactical plan — trades win chance against casualties. */
export type BattleStance = 'assault' | 'balanced' | 'cautious';

export interface RecruitmentOrder {
  id: string;
  landId: string;
  heroId: string;
  totalSoldiers: number;
  rations: number;
  provisions: number;
  progress: number;
  required: number;
  composition?: ArmyComposition;
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

/** Visual accent shared by transient toasts and the persistent event log. */
export type NotificationKind = 'info' | 'reward' | 'threat' | 'milestone';

/** A transient on-screen notification pushed by gameplay systems (empire mode). */
export interface Toast {
  id: string;
  text: string;
  /** Visual accent: neutral info, a reward/gain, a warning/threat, or a milestone. */
  kind: NotificationKind;
  /** Economy tick the toast was created on; the UI expires it after a few ticks. */
  createdTurn: number;
}

/**
 * A persistent notification entry. Every gameplay notification (empire toasts and
 * campaign event messages) is appended here so the player can open a paused log and
 * read the full history — the single source of truth behind the notification bell.
 */
export interface GameEvent {
  id: string;
  text: string;
  kind: NotificationKind;
  /** Economy tick the event occurred on. */
  turn: number;
  /** False until the player opens the log; drives the unread badge count. */
  read: boolean;
}

export type DirectiveTier = 'short' | 'medium' | 'epic';

/**
 * A live objective shown on the Directives board (empire mode). Its `metricKey`
 * selects a pure evaluator over GameState; when `current` reaches `target` the
 * directive completes and pays out Mandate + optional resources.
 */
export interface Directive {
  id: string;
  templateId: string;
  tier: DirectiveTier;
  metricKey: string;
  target: number;
  /** Metric value captured when the directive was issued (for delta-based goals). */
  baseline: number;
  current: number;
  rewardMandate: number;
  rewardResources?: Partial<ResourceBag>;
  /** Turn by which a timed (prep) directive must complete, else it fails. */
  deadline?: number;
  complete: boolean;
  failed?: boolean;
}

export type EraId = 'founding' | 'rivalry' | 'empires' | 'mandate';

/** Kingdom-wide progression track (empire mode). Fills from directives + battles. */
export interface MandateState {
  points: number;
  era: EraId;
  /** Ids of edicts the player has enacted (permanent CourtModifiers). */
  edicts: string[];
  /** Unspent points available to enact edicts. */
  edictPoints: number;
  /** Era transitions already announced, so we only fire the toast/unlock once. */
  reachedEras: EraId[];
  /** Set true once the player has reached the final era (ascension unlocked). */
  ascensionReady?: boolean;
  /** Set true when the Ascension directive completes — triggers the prestige win. */
  ascended?: boolean;
  /** True once the ascension directive has been issued, so it is only issued once. */
  ascensionIssued?: boolean;
}

/** A telegraphed major invasion the player can prepare for or defuse (empire mode). */
export interface Ultimatum {
  id: string;
  kingdomId: string;
  targetLandId?: string;
  /** Economy turn the host will muster. */
  dueTurn: number;
  /** Total soldiers the announced host will field. */
  hostSize: number;
  /** True for a once-per-era named-warlord coalition. */
  isGreatInvasion: boolean;
  warlordName?: string;
  /** Set when the player defuses it via pact/tribute before dueTurn. */
  defused?: boolean;
}

// ── Dragon Ascent (`gameMode: 'ascent'`) ────────────────────────────────────
// An endless auto-conquest run: the empire plays itself and the player's whole
// input is a stream of pausing card prompts. See systems/ascent/.

/** Power Draft card rarity. Maps onto the Hero rarity ladder for summons. */
export type AscentRarity = 'bronze' | 'silver' | 'gold' | 'jade';

/**
 * The screens the bottom action bar opens. Deliberately the classic modes' menu — Build /
 * Heroes / Court / Army / Affairs — so this mode is navigated the same way the rest of the
 * game already is. Conquest is not here: like the classic modes, it is reached by selecting
 * a province on the map.
 */
export type AscentLane = 'build' | 'heroes' | 'court' | 'army' | 'affairs';

export type AscentLaneStatus = 'ready' | 'busy' | 'alert' | 'blocked';

export type AscentConquestMethod = 'bribe' | 'diplomacy' | 'intimidation' | 'settle' | 'occupy' | 'siege';

/** Live pressure per system, used for the bar's status dots and the idle/starvation counters. */
export interface AscentLaneState {
  conquer: AscentLaneStatus;
  court: AscentLaneStatus;
  world: AscentLaneStatus;
  lastDecisionTurn: Partial<Record<'conquer' | 'court' | 'world', number>>;
}

export interface AscentConquestPlan {
  id: string;
  landId: string;
  method: AscentConquestMethod;
  heroId?: string;
  armyId?: string;
  createdTurn: number;
  status: 'queued' | 'executing' | 'blocked' | 'complete' | 'failed';
  reason?: string;
}

/** Cumulative run activity — drives the run summary and the verify script. */
export interface AscentLaneStats {
  conquestsByMethod: Record<AscentConquestMethod, number>;
  appointments: number;
  edictsEnacted: number;
  parliamentAnswered: number;
  envoyActions: Record<string, number>;
  /** Demands answered — the counterpart to `envoyActions`, which the player initiates. */
  rivalAnswers?: number;
}

/** One stack level of a Power Draft card: what it applies, and the numbers printed on the card. */
export interface PowerCardLevel {
  /** Applied via `applyCourtEffect`. Use `permanent: true` for stacking cards. */
  effect: CourtEffect;
  /** Raw values the i18n card template interpolates (e.g. `{ pct: 8 }`). */
  display: Record<string, number>;
}

export interface PowerCardDef {
  id: string;
  rarity: AscentRarity;
  maxStacks: number;
  /** `levels[n]` is the payload for taking the card the (n+1)-th time; the last entry repeats. */
  levels: PowerCardLevel[];
  /** Only offered when this holds (e.g. needs a standing army). */
  requires?: (state: GameState) => boolean;
  /** When this and `evolvesWith` are both maxed, both retire and `evolvesInto` is granted. */
  evolvesWith?: string;
  evolvesInto?: string;
  /** Relative weight inside its rarity bucket. Defaults to 1. */
  weight?: number;
  /** Evolution results are granted, never rolled. */
  evolutionOnly?: boolean;
}

/** One counter-play offered on the Empire Response prompt. */
export interface EmpireResponseOption {
  id: 'send-host' | 'hire-mercenaries' | 'fortify' | 'buy-off' | 'endure';
  /** For `send-host`: the hero picked inline on the same modal. */
  heroId?: string;
  cost?: Partial<ResourceBag>;
  /**
   * Projected win chance 0-100 — present only on the options that actually change *this*
   * battle. Absent on `send-host` (its levy is still mustering when the host lands) and on
   * `buy-off` (there is no battle to win), because quoting odds there duplicated Endure's
   * number and made five distinct answers read as one.
   */
  winChance?: number;
  delayTicks?: number;
  momentum?: number;
  /** For `send-host`: how large the levy being raised is. */
  soldiers?: number;
  /** For `fortify`: points of permanent provincial defence bought. */
  defence?: number;
  affordable: boolean;
}

/**
 * One way to take a province. Every method a province admits is offered — the ones the realm
 * cannot afford or staff right now come through greyed with a concrete `blockedReason`, because
 * seeing the locked options is how the player learns the system.
 */
export interface ConquestMethodOption {
  method: AscentConquestMethod;
  /** Resources spent up front. `humans` for settle, `gold` for bribe, `supplies` for diplomacy. */
  cost?: Partial<ResourceBag>;
  /** Ticks until the province flips, once started. */
  ticks: number;
  /** Loyalty the province starts with under your banner. */
  loyalty: number;
  /** 0-100: success odds for bribe, battle odds for siege, 100 for the certain methods. */
  chance: number;
  /** The hero or host this method would commit, resolved for the card's detail line. */
  heroId?: string;
  armyId?: string;
  /** Why it cannot be chosen right now; `undefined` means takeable. */
  blockedReason?: string;
}

/** One province card on the Conquer prompt. */
export interface ConquestTarget {
  landId: string;
  landName: string;
  landKind: 'wilderness' | 'village' | 'rival';
  /** Name of the current holder, for rival-held provinces. */
  ownerName?: string;
  garrison: number;
  /** i18n key suffix for the province's draw (`gold` | `food` | `iron` | `shrine` | `plain`). */
  rewardTag: string;
  /** Best chance across every takeable method. Drives ordering, not the card's headline. */
  bestChance: number;
  /** True when at least one open method cannot fail — the province is takeable at no risk. */
  hasCertainMethod: boolean;
  methods: ConquestMethodOption[];
  /** Set when a claim or siege is already running here. */
  busyReason?: string;
}

/** One answer to a famine. Each spends a different store, so the choice is a real trade. */
export interface FamineOption {
  id: 'buy-grain' | 'slaughter-herds' | 'requisition' | 'endure';
  cost?: Partial<ResourceBag>;
  /** Food this option puts back in the granary. */
  food?: number;
  affordable: boolean;
}

/** One posting offered on the Appointment prompt. */
export interface AppointmentOption {
  /** `court:<positionId>` · `governor:<landId>` · `general:<armyId>`. */
  id: string;
  role: 'court' | 'governor' | 'general';
  /** Resolved seat / province / host name. */
  title: string;
  /** The concrete bonus this hero's stats produce there, e.g. `+23% army power`. */
  effect: string;
  /** Who they would displace, if anyone. */
  detail?: string;
}

/** One answer to a rival's demand. */
export interface RivalDemandOption {
  id: 'pay' | 'refuse' | 'buy-off' | 'endure' | 'submit' | 'defy';
  cost?: Partial<ResourceBag>;
  affordable: boolean;
}

/** One action offered on the Envoy prompt. */
export interface EnvoyOption {
  id: 'gift' | 'trade' | 'tribute' | 'ambassador' | 'ignore';
  cost?: Partial<ResourceBag>;
  influenceCost?: number;
  /** For `ambassador`: the hero posted to that court. */
  heroId?: string;
  affordable: boolean;
}

/** Every pausing decision Dragon Ascent can raise. Exactly one is live at a time. */
export type AscentPrompt =
  | { kind: 'founder'; options: string[] }
  | { kind: 'power-draft'; cards: string[]; rerollCost: number; level: number }
  /** Step one of a conquest: which province. */
  | { kind: 'conquer-target'; targets: ConquestTarget[] }
  /** Step two: how to take it. Raised by resolving `conquer-target`, or by tapping the map. */
  | { kind: 'conquer-method'; target: ConquestTarget }
  /** A champion arrives — from the gacha roll or from the court's Favor draft. */
  | { kind: 'hero-choice'; heroIds: string[]; source: 'summon' | 'court'; pityUsed: boolean }
  /** Where the new champion serves. Always follows a `hero-choice`. */
  | { kind: 'court-appointment'; heroId: string; options: AppointmentOption[] }
  /** A permanent law: an edict/wonder from REALM_PROJECTS, or the tax dial. */
  | { kind: 'law-choice'; projectIds: string[]; points: number; taxOptions: TaxPolicy[] }
  /** The court speaks: one card drawn from `state.politicsDeck`. */
  | { kind: 'parliament'; cardId: string }
  /** A field engagement the player can watch and steer. Reads `ascent.activeBattle`. */
  | { kind: 'battle' }
  /** The granary is empty and still draining. What the realm does about it. */
  | { kind: 'famine'; shortfall: number; options: FamineOption[] }
  /** A rival empire makes a demand of its own: tribute, coalition, or submission. */
  | {
      kind: 'rival-demand';
      demand: 'tribute' | 'coalition' | 'vassalage';
      kingdomId: string;
      kingdomName: string;
      gold?: number;
      ticks?: number;
      memberNames?: string[];
      options: RivalDemandOption[];
    }
  /** A rival empire, and what to do about it. */
  | { kind: 'envoy'; kingdomId: string; kingdomName: string; relations: number; power: number; options: EnvoyOption[] }
  | {
      kind: 'empire-response';
      wave: number;
      threat: number;
      kingdomId: string;
      kingdomName: string;
      ticksToArrival: number;
      options: EmpireResponseOption[];
    }
  | { kind: 'wave-result'; wave: number; survived: boolean; lines: string[] }
  | {
      kind: 'run-over';
      score: number;
      legacyEarned: number;
      /** How the dynasty actually fell, so the summary can say something specific. */
      cause: AscentEndCause;
      /** Name of the province whose loss ended it, when there was one. */
      landName?: string;
      /** Best single-run score before this one — the number the player is chasing. */
      previousBest: number;
      legacyTotal: number;
    };

export type AscentPromptKind = AscentPrompt['kind'];

/** How a host is fighting this exchange. A trade, not a strictly-better setting. */
export type BattlePosture = 'press' | 'hold';

/** A field engagement in progress, exchange by exchange. */
export interface AscentBattle {
  landId: string;
  landName: string;
  invaderArmyId: string;
  kingdomId: string;
  kingdomName: string;
  isGreat: boolean;
  round: number;
  totalRounds: number;
  posture: BattlePosture;
  /**
   * How far each line has left its own camp, 0 (at the tents) to 1 (at the enemy's).
   * Drives where the soldiers are drawn, and is what makes posture *visible*: pressing walks
   * your line across the field, holding keeps it on its own ground.
   */
  ourAdvance: number;
  theirAdvance: number;
  /**
   * Battle morale, mirrored onto `army.morale` every beat. `armyPower` multiplies by it, so a
   * line that starts failing keeps failing — this is the fight's tipping point.
   */
  ourMorale: number;
  theirMorale: number;
  /** Men held at camp at the outset, committed once mid-fight. */
  reserve: { spearmen: number; archers: number; heavyInfantry: number };
  reserveSpent: boolean;
  /** The general's one steadying moment. Absent entirely when nobody leads the host. */
  rallySpent: boolean;
  rallyPower: number;
  /** Defensive multiplier of the ground being fought over (`terrainDefenseMultiplier`). */
  terrainEdge: number;
  outcome: 'fighting' | 'they-rout' | 'we-rout' | 'spent';
  /** Headcounts at the outset, so the strength bars have a denominator. */
  ourStart: number;
  theirStart: number;
  ourNow: number;
  theirNow: number;
  /** One line per exchange, oldest first. */
  log: string[];
  /** Set once the last exchange has run or a host has broken. */
  over: boolean;
}

/** Why a Dragon Ascent run ended. Shown on the summary so a loss is legible. */
export type AscentEndCause = 'capital' | 'annihilated';

export interface AscentState {
  /** Wave counter. Threat scales as BASE * GROWTH^wave; every 4th wave is a Great Invasion. */
  wave: number;
  ticksToWave: number;
  bossTelegraphed: boolean;
  /** True between a wave launching and the last of its hosts leaving the map. */
  waveInFlight: boolean;
  /** Whether the wave currently in flight is a Great Invasion. */
  lastWaveBoss: boolean;
  /** Invasion count at the end of the previous tick, to detect a wave finishing. */
  invasionsLastTick: number;
  /** Cached POWER and last tick's value, so the HUD can tween the delta ticker. */
  power: number;
  powerPrev: number;
  peakPower: number;
  /** The incoming wave's power, for the THREAT readout. Measured from live hosts when a
   *  wave is on the map, projected from the curve between waves. */
  threat: number;
  /** What the realm can actually field against a wave: hosts + fortifications. THREAT is
   *  coloured against this rather than against POWER, which includes the economy. */
  defensePower: number;
  level: number;
  /** Momentum toward the next Power Draft. */
  xp: number;
  xpToNext: number;
  /** Level-ups earned but not yet drafted — drafts stack rather than being dropped. */
  pendingLevelUps: number;
  /** How many times each Power Draft card has been taken. */
  cardStacks: Record<string, number>;
  /** Cards consumed by an evolution; never offered again. */
  retiredCards: string[];
  /** Per-rarity draft weights. Live on state so they can drift within a run. */
  draftWeights: Record<AscentRarity, number>;
  /** Summons since the last gold-or-better result (soft pity). */
  summonPity: number;
  summonsDone: number;
  /** Gold cost of the next reroll in the open draft; doubles per use, resets on resolve. */
  rerollCost: number;
  /** The province the autopilot is marching on. */
  frontLandId?: string;
  /** The seat of the dynasty. Losing it for too long ends the run — see `checkAscentDefeat`. */
  capitalLandId?: string;
  /** Consecutive ticks the capital has been in enemy hands. Resets the moment it is retaken. */
  capitalLostTicks: number;
  /** True when the front is too strong to storm, so hosts are holding at the border. */
  frontBlocked: boolean;
  /** Ticks before another Conquer prompt may be raised, so holding does not re-prompt at once. */
  marchCooldown: number;
  promptQueue: AscentPrompt[];
  /** Cumulative autopilot activity — drives the run summary and the verify script. */
  autopilotStats: { builds: number; upgrades: number; recruits: number; marches: number };
  laneState: AscentLaneState;
  conquestPlans: AscentConquestPlan[];
  decisionPressure: number;
  idleTicks: number;
  laneStats: AscentLaneStats;
  wavesSurvived: number;
  heroesSummoned: number;

  // ── Decision scheduler (see systems/ascent/DecisionDirector.ts) ──
  /** Ticks remaining before each prompt kind may be raised again. */
  promptCooldowns: Partial<Record<AscentPromptKind, number>>;
  /** Ticks each kind has been ready to speak but was outranked. Drives starvation promotion. */
  promptWaiting: Partial<Record<AscentPromptKind, number>>;
  /** Seasons before the realm will raise the famine card again. */
  famineCooldown: number;
  /** The engagement currently being watched, if any. */
  activeBattle?: AscentBattle;
  /** Set once the player hands battles back to their generals for the rest of the run. */
  autoResolveBattles: boolean;
  /** Wave whose engagement has already been watched, so a siege asks once, not per tick. */
  lastWatchedWave: number;
  /** Set when the run ends, so the summary can name the cause rather than shrug. */
  endCause?: AscentEndCause;
  /** Province whose fall ended the run. */
  endLandName?: string;
  /** The turn the last prompt was raised, enforcing a gap of real play between modals. */
  lastPromptTurn: number;
  /** Parliament cards already drawn this run — the deck draws without replacement. */
  drawnCourtCards: string[];
  /** Ticks until the court may speak again; mirrors `court.cardCooldown` for this mode. */
  courtCardCooldown: number;
  /**
   * Defensive power recorded at each recent wave. The wave curve reads this `WAVE_LAG` waves
   * back rather than the live figure, so a strong run of picks buys real breathing room
   * instead of instantly inflating the next wave. Only the recent tail is kept.
   */
  defenceSamples: number[];
  /** Ticks until the next border raid may be sent. */
  raidCooldown: number;
  /** Cooldowns on each rival-initiated demand, so they arrive as pressure not as spam. */
  tributeCooldown: number;
  coalitionCooldownTicks: number;
  vassalCooldown: number;
  /** Set when a coalition was endured: the next wave arrives as a multi-empire invasion. */
  coalitionPending: boolean;
  /** Heroes the player chose to hold free; not re-prompted until postings change. */
  reservedHeroIds: string[];
  /** Seat count when the reserve list was last taken, so a new seat reopens the question. */
  reserveSeatMark: number;
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
  isStrategyPause: boolean;
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
  gameMode: GameMode;
  campaignConfig?: CampaignConfig;
  campaignScore?: CampaignScore;
  dynastyStatus?: DynastyStatus;
  spyReports: SpyReport[];
  scheduledCampaignEvents: CampaignEvent[];
  /** Active off-map invasions (empire mode only). */
  invasions?: InvasionRecord[];
  /** Transient notification queue (empire mode). */
  toasts?: Toast[];
  /** Persistent notification history, read via the notification bell/log (all modes). */
  eventLog?: GameEvent[];
  /** Live objectives board (empire mode). */
  directives?: Directive[];
  /** Rotating cursor into the directive template deck, per tier. */
  directiveDeckCursor?: Record<DirectiveTier, number>;
  /** Progression track (empire mode). */
  mandate?: MandateState;
  /** Realm-wide tax stance (empire mode). Absent = 'balanced'. */
  taxPolicy?: TaxPolicy;
  /** Accumulated resentment from sustained heavy taxation — compounds unrest until you ease off. */
  taxFatigue?: number;
  /** A pausing intelligence alert (spy report of an incoming attack) awaiting acknowledgement. */
  pendingThreatAlert?: ThreatAlert;
  /** A field battle awaiting the player's tactical decision (attack / delegate / retreat). */
  pendingBattle?: PendingBattle;
  /** A telegraphed major invasion awaiting its due turn (empire mode). */
  pendingUltimatum?: Ultimatum;
  /** Great Invasions already staged this run, keyed by era, so bosses fire once/era. */
  greatInvasionEras?: EraId[];
  /** Regenerating pressure budget the ThreatDirector spends to spawn invasions. */
  threatBudget?: number;
  /** Cooldown before another Grand Coalition can form against a dominant player. */
  coalitionCooldown?: number;
  /** Count of invasion hosts the player has repelled (drives some directives). */
  invasionsRepelled?: number;
  /** Number of Wonders completed (drives directives + capital art tier). */
  wondersBuilt?: number;
  /** Guards one-time Legacy banking at the terminal (victory/defeat) screen. */
  legacyBanked?: boolean;
  /** Remaining cooldown ticks per royal ability (empire mode). */
  abilityCooldowns?: Record<string, number>;
  /** In-flight hero missions resolving on a tick timer (empire mode). */
  heroMissions?: HeroMission[];
  /** Remaining cooldown ticks per hero signature ability, keyed by heroId (empire mode). */
  heroAbilityCooldowns?: Record<string, number>;
  /** A personal hero dilemma awaiting the player's decision (empire mode). */
  pendingHeroEvent?: HeroEvent;
  /** Ticks until another hero event may surface. */
  heroEventCooldown?: number;
  /** Kingdom-wide diplomatic reputation 0-100; eases deals, raised/lowered by honoring/breaking treaties. */
  prestige?: number;
  /** A foreign-affairs dilemma awaiting the player's decision. */
  pendingForeignCard?: ForeignCard;
  /** Ticks until another foreign event card may appear. */
  foreignCardCooldown?: number;
  /** Dragon Ascent run state (ascent mode only). */
  ascent?: AscentState;
  /** The single live Dragon Ascent decision; set by `drainPromptQueue`, cleared by `resolveAscentPrompt`. */
  pendingAscentPrompt?: AscentPrompt;
  isDefeated: boolean;
  defeatReason?: 'conquest' | 'collapse';
}
