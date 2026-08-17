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
 *
 * `garrison` is offered in Dragon Ascent only, and `fortress` means something different there:
 * see `ASCENT_FOCUS_MULT` in `ResourceSystem`. The classic modes keep the original six and the
 * original numbers.
 */
export type LandSpecialization =
  | 'balanced' | 'breadbasket' | 'mining' | 'trade' | 'populous' | 'fortress' | 'garrison';

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
  /**
   * What this host is trying to do, assigned when it spawns (Dragon Ascent).
   *
   * `spearhead` goes for the most valuable province, `flanker` for the weakest-held one — and each
   * flanker picks a different target so a coalition genuinely spreads out rather than queueing
   * down one road. `raider` pillages a border province and withdraws. `withdrawing` is the state a
   * host enters when it decides it cannot win the fight in front of it.
   *
   * Optional so it round-trips through the save with no migration; hosts without one fall back to
   * the original capital-or-nearest behaviour.
   */
  plan?: 'spearhead' | 'flanker' | 'raider' | 'withdrawing';
  /** Ticks the host has wanted to withdraw. Hysteresis, so a host does not oscillate. */
  retreatTicks?: number;
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
  /**
   * A province's own garrison, turned out to fight as a host for the length of one battle.
   *
   * Raised by `raiseGarrisonLevy` and dissolved the moment the engagement ends — survivors go
   * back into the province's `localSoldiers`. It exists because a watchable battle needs an
   * `Army` on the defending tile, and without it every province the field hosts were not
   * standing on resolved its defence as a silent dice roll.
   */
  isLevy?: boolean;
  /**
   * Militia a garrison levy actually drew from its province, so dissolving it returns at most
   * what it took — the walls' share of the turnout must not become standing militia.
   */
  levyDrawn?: number;
  /**
   * The host's standing order (Dragon Ascent). Absent means `auto`: the autopilot may march it,
   * send it home, or leave it — the original behaviour, kept for old saves, the royal host and
   * every host raised by the autopilot itself. Any other order takes the host out of the
   * autopilot's hands: it is moved only by the order, and never dissolved as a remnant.
   */
  orders?: ArmyOrders;
}

/**
 * What a host of the player's is doing until told otherwise (Dragon Ascent).
 *
 *  - `auto`   — the autopilot commands it (march on the front, intercept, go home).
 *  - `defend` — hold `landId`; walk back if displaced and the road is open, otherwise hold here.
 *  - `attack` — reach and storm `landId`; falls back to `defend` where it stands once the land is
 *               taken or the assault is thrown back. `force` storms below the odds gate.
 *  - `follow` — keep station with another host of ours, on its province or the nearest owned one.
 *  - `hunt`   — pursue an enemy host until it is caught or gone (`issueHuntOrder`, re-issued).
 *
 * `holding` / `struck` are the order's own memory, so a change of state is announced once and
 * the tick never spins on an unreachable target.
 */
export type ArmyOrders =
  | { kind: 'auto' }
  | { kind: 'defend'; landId: string; holding?: boolean }
  | { kind: 'attack'; landId: string; struck?: boolean; holding?: boolean; force?: boolean }
  | { kind: 'follow'; armyId: string; holding?: boolean }
  | { kind: 'hunt'; armyId: string };

/** An in-progress march: an army advancing one land per leg toward `path`'s last entry. */
export interface MovementOrder {
  armyId: string;
  /** Remaining land ids to visit, in order. The last entry is the final destination. */
  path: string[];
  /** Ticks accumulated toward completing the current leg (path[0]). */
  progress: number;
  /** Ticks required to complete the current leg (path[0]). */
  legRequired: number;
  /**
   * The host being hunted, if this march is a pursuit.
   *
   * A pursuit differs from a march in that its destination moves: `progressMovementOrders`
   * re-paths toward the quarry's current province whenever it has shifted, and drops the order
   * when the quarry is gone. Optional, so it round-trips through the save with no migration.
   */
  pursueArmyId?: string;
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

  // ── Portrait identity (see ui/faces/heroLook.ts) ──
  /**
   * Who this person is, for the portrait. **Not** a style axis: the wardrobe is chosen from
   * this, and the seed only picks within what it allows.
   *
   * Required, because it is not a style axis and must never be left to a seed: before this
   * existed, every one of the five heroes the game names as a woman rendered with facial
   * hair. `resolveHeroLook` still reads the Vietnamese honorific out of the name (Bà, Nữ,
   * Công Chúa, Ông) as a safety net for any hero reconstructed from an older save.
   */
  sex: 'man' | 'woman';
  /** Monastics get a wardrobe of their own — shaven, kesa, and nothing else. */
  monastic?: boolean;
  /**
   * Which century this hero dresses in. Đại Việt did not wear one costume for a thousand
   * years, and the roster already spans the dynasties by name. Unset means "pick from the
   * common eras by seed", which is what keeps a drafted roster visually varied.
   */
  era?: HeroEra;
}

/**
 * The dress eras the portrait system knows. Each is a different wardrobe, not a palette swap:
 * the Nguyễn reform of 1744 replaced the crossed lapel with a standing collar, so a Nguyễn
 * official in áo giao lĩnh is simply the wrong century.
 */
export type HeroEra = 'dinh' | 'ly' | 'tran' | 'le' | 'tayson' | 'nguyen';

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
  /**
   * Extra provinces the realm may court at once (Dragon Ascent). A plain count, not a share —
   * it is summed, never folded into a multiplier. See `getClaimSlots`.
   */
  claimSlotBonus?: number;
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
  /** Standing order stamped on the host the moment it musters (Dragon Ascent). */
  orders?: ArmyOrders;
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
export type AscentLane = 'build' | 'heroes' | 'court' | 'army' | 'affairs' | 'battle' | 'chronicle' | 'ledger';

// ── The Chronicle (Sử Ký) ───────────────────────────────────────────────────
//
// Stories are not quests. A story is a persistent object with a cast it has taken an
// interest in, a bag of numbers recording what has happened, and a pool of fragments it
// picks from by *salience* rather than in order. It has no length, so nothing here counts
// beats or reports progress — see `systems/story/StorySystem.ts`.

/**
 * How loudly a fragment speaks.
 *
 * `whisper` is the bulk of every pool and costs nothing: one line in the header strip, no
 * pause, no prompt-queue slot. `card` pauses and asks. `blow` pauses and *tells* — no
 * options, something has happened. A story that only ever asks is a story the player
 * controls, and control is the opposite of drama.
 */
export type StoryVolume = 'whisper' | 'card' | 'blow';

/**
 * The generic woodblock band behind a card. Chosen by tag, never by story.
 *
 * Deliberately not per-story art: a template binds a random hero and a random province, so a
 * picture specific to one instance is a lie on every other map. The same band appearing
 * across many stories is correct rather than a compromise.
 */
export type StoryBand =
  | 'court' | 'river' | 'field' | 'coast' | 'mountain' | 'march'
  | 'fire' | 'granary' | 'night' | 'crowd' | 'shrine' | 'border';

/** The subjects a story has bound. Any of them may be absent. */
export interface StoryCast {
  heroId?: string;
  otherHeroId?: string;
  landId?: string;
  kingdomId?: string;
}

/** A story instance living in the save. */
export interface ActiveStory {
  id: string;
  templateId: string;
  cast: StoryCast;
  /** Flat bag of numbers. Story progress is just another number — no special machinery. */
  memory: Record<string, number>;
  /**
   * Every fragment this story has spoken, in order, with the season it fired.
   *
   * `spoken` already holds the ids, but ids without seasons cannot be read back as a story —
   * and reading the story back is the whole point of the story page. The screen renders this
   * as "Đã xảy ra": the case the story has been building, finally on one screen. Optional so
   * saves from before the page load cleanly; those fall back to `spoken` without dates.
   */
  history?: { fragmentId: string; turn: number }[];
  /** Hidden closeness-to-acting. Never shown; the only tell is how often it whispers. */
  temperature: number;
  seededTurn: number;
  lastSpokeTurn: number;
  /** Fragment ids already fired. Ids are an append-only compatibility contract. */
  spoken: string[];
  /** Set when a card/blow is waiting for the decision director to raise it. */
  waiting?: string;
  /**
   * An offer currently hanging on one of this story's subjects.
   *
   * Deliberately *not* `waiting`. An opening must not silence the story that made it — a player
   * who ignores an offer would otherwise mute that story for the rest of the run, which is the
   * opposite of "ignoring it is free and is also an answer".
   */
  offer?: string;
  /** Season the offer stops being available. It goes without announcing that it has. */
  offerUntil?: number;
}

/**
 * A line in the Chronicle. Stored as key + params rather than resolved text, so the record
 * re-translates when the player changes language.
 */
export interface ChronicleEntry {
  id: string;
  templateId: string;
  fragmentId: string;
  turn: number;
  params: Record<string, string | number>;
  /** Ended well, ended badly, or simply stopped. Drives the entry's accent only. */
  tone: NotificationKind;
}

/**
 * What the world looked like last tick, so stories can notice what changed without every
 * other system having to push events at them.
 */
export interface StoryWatch {
  lands: number;
  heroes: number;
  gold: number;
  food: number;
  battlesWon: number;
  wavesSurvived: number;
  courtSeatsFilled: number;
}

/**
 * One resource's row in the ledger: what came in, what went out, what was left.
 *
 * The header strip has only ever shown the net figure, which is why the player could watch
 * every number rise for ten years and still not know why — a net with no breakdown teaches
 * nothing. Gross and demand are the two halves the strip was hiding.
 */
export interface AscentLedgerLine {
  gross: number;
  demand: number;
  net: number;
}

/** A place that is currently going without, and what kind of want it is. */
export interface AscentShortfall {
  landId: string;
  kind: 'food' | 'supplies' | 'gold';
  /** Season it was first noticed, so the ledger can say how long it has stood. */
  sinceTurn: number;
}

/** The realm's books, recomputed every economy tick (ascent only). */
export interface AscentLedger {
  food: AscentLedgerLine;
  supplies: AscentLedgerLine;
  gold: AscentLedgerLine;
  shortfalls: AscentShortfall[];
}

/** An optional offer a story hangs on a subject the player already visits. Never an order. */
export interface StoryOpening {
  storyId: string;
  fragmentId: string;
  /** Resolved text key for the line shown in the sheet. */
  textKey: string;
  params: Record<string, string | number>;
  /** Label on the tappable row. */
  actionKey: string;
}

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
  /**
   * Step two: how to take it. Raised by resolving `conquer-target`, or by tapping the map.
   *
   * `notice` carries the outcome of the attempt the player just made here, when that attempt
   * was made and refused — a bribe the nobles pocketed, a march no host was free to take. The
   * sheet re-opens with it stated, because a refusal that closes the sheet silently is
   * indistinguishable from a tap that never registered.
   */
  | { kind: 'conquer-method'; target: ConquestTarget; notice?: string }
  /** A champion arrives — from the gacha roll or from the court's Favor draft. */
  | { kind: 'hero-choice'; heroIds: string[]; source: 'summon' | 'court'; pityUsed: boolean }
  /** Where the new champion serves. Always follows a `hero-choice`. */
  | { kind: 'court-appointment'; heroId: string; options: AppointmentOption[] }
  /** A permanent law: an edict/wonder from REALM_PROJECTS, or the tax dial. */
  | { kind: 'law-choice'; projectIds: string[]; points: number; taxOptions: TaxPolicy[] }
  /** The court speaks: one card drawn from `state.politicsDeck`. */
  | { kind: 'parliament'; cardId: string }
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
    }
  /**
   * One fragment of a running story, speaking loudly enough to stop the world.
   *
   * Carries no beat number and no total, on purpose: the player must not be able to tell
   * whether this is the second thing this story has said or the ninth. `options` is empty
   * for a `blow`, which tells rather than asks.
   */
  | {
      kind: 'story-beat';
      storyId: string;
      templateId: string;
      fragmentId: string;
      volume: StoryVolume;
      band?: StoryBand;
      /** Portrait shown beside the band, when a person is speaking. */
      speakerHeroId?: string;
      /** Interpolation for the title/body/option text keys. */
      params: Record<string, string | number>;
      options: StoryPromptOption[];
      /** One line from a seated hero. Not neutral — see `advisorFor`. */
      advisorHeroId?: string;
      advisorKey?: string;
    };

/** A card's option, resolved for display. */
export interface StoryPromptOption {
  id: string;
  cost?: Partial<ResourceBag>;
  affordable: boolean;
  /** Text key suffix for a reason the option is closed, when it is. */
  blockedKey?: string;
}

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
  /** What the invader is doing this beat, from its doctrine. */
  theirPosture: BattlePosture;
  /** Hosts that have broken and left the line, either side. */
  brokenHostIds: string[];
  /** Men of ours lost so far, so an orderly withdrawal can recover its stragglers. */
  ourLostTotal: number;
  /** The enemy host the line is concentrating on, if any. */
  focusHostId?: string;
  /** Morale we opened with, so a rally can be scaled by how far the line has sagged. */
  ourStartMorale: number;
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
  /** Hosts present on each side last beat, so arriving relief can be announced. */
  ourHostCount: number;
  theirHostCount: number;
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
  /**
   * Which side of the field is ours. `defence` is an invader striking ground we hold — the
   * original engagement; `offence` is a host of ours storming someone else's province. Absent
   * on saves written before assaults were watchable, and read as `defence`.
   */
  role?: 'defence' | 'offence';
  /** Identity of the engagement, so the screen opens itself once per fight and not per beat. */
  key?: string;
  /**
   * The hosts on each side, by id. Membership is explicit rather than "whoever stands on the
   * province": the invader that opens a defence is standing on the *adjacent* land when contact
   * is made, and an assault's own hosts stand on their origin. Enrolment happens per beat (see
   * `enrolArrivals`), so relief still simply appears the beat it arrives.
   */
  ourArmyIds?: string[];
  theirArmyIds?: string[];
  /** Beats spent closing on an assault, so a defender that never advances cannot stall the fight. */
  approachBeats?: number;
  /** The host the reserve was held back from, so committing it (or returning it) refills that host. */
  reserveHostId?: string;
}

/** One finished engagement, kept so the run can be read back — and measured. */
export interface AscentBattleRecord {
  turn: number;
  key: string;
  landId: string;
  landName: string;
  role: 'defence' | 'offence';
  outcome: 'they-rout' | 'we-rout' | 'spent' | 'retreat';
  rounds: number;
  ourStart: number;
  theirStart: number;
  ourEnd: number;
  theirEnd: number;
  theirHosts: number;
  ourHosts: number;
  /** True when a garrison levy stood in the line (no field host of ours, or not only one). */
  levyFought: boolean;
}

/** Why a Dragon Ascent run ended. Shown on the summary so a loss is legible. */
export type AscentEndCause = 'capital' | 'annihilated';

/** The acts of growth that charge ambition. See `AMBITION_COSTS`. */
export type AmbitionReason = 'province' | 'card' | 'host';

/**
 * Where in a wave cycle the run currently stands. Derived from the wave countdown rather than
 * stored — see `ascentPhaseFor`.
 */
export type AscentPhase = 'aftermath' | 'court' | 'muster';

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
  /** True while the player has handed battles back to their generals. Reversible from Settings. */
  autoResolveBattles: boolean;
  /** Wave whose engagement has already been watched. Kept for saves written before `lastWatchedKey`. */
  lastWatchedWave: number;
  /** `wave:landId` of the engagement already watched, so a siege asks once per province, not per tick. */
  lastWatchedKey?: string;
  /** The last few engagements, newest last. Optional so old saves need no migration. */
  battleHistory?: AscentBattleRecord[];
  /** Commanded hosts already warned about being a remnant, so the toast fires once per host. */
  remnantWarnedIds?: string[];
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

  // ── Ambition (see systems/ascent/AmbitionSystem.ts) ──
  /**
   * Standing ambition: how much the realm has recently taken, and therefore how much larger
   * the next wave will be. Charged by growth, shed at each wave. **This is what waves are
   * sized against** — see `waveTargetPower`.
   */
  ambition: number;
  /** Charged this cycle, so the Court phase can show the dial climbing as the player commits. */
  ambitionThisWave: number;
  /**
   * The ambition multiplier locked in when the current wave was raised.
   *
   * Snapshotted rather than read live because the counter decays the moment the wave is
   * named: without this the host that actually spawns would be smaller than the number the
   * player was quoted while deciding, which is precisely the kind of quiet lie that makes a
   * readout worthless.
   */
  waveHeat: number;
  /** Every point ever charged, for the run summary. */
  ambitionSpent: number;
  /** The highest the counter reached — how far the player actually pushed it. */
  ambitionPeak: number;
  /**
   * Walls and companies bought off the response card this run. Each one makes every later gold
   * price dearer — see `warPurchaseMultiplier`. This is what bounds how much survival a
   * treasury can simply buy.
   */
  warPurchases: number;
  /** Wave in which Twice-Born last reformed a broken host, so it fires once per wave. */
  twiceBornWave: number;

  /**
   * Turn a hostile host was last on or beside the player's ground.
   *
   * The floor under `EnemyCommandDirector`'s randomised cadence measures from this, so a run of
   * quiet rolls cannot reproduce the "ten minutes, no battle" defect. Optional: an in-flight save
   * from before this existed reads as 0, which simply forces contact on the next tick.
   */
  lastContactTurn?: number;
  /** Whether the "capital left ungarrisoned" strike has already fired for this exposure. */
  capitalExposedFired?: boolean;
  /** Live rival count last tick, so an empire collapsing is seen as a transition. */
  lastRivalCount?: number;
  /** Rivals whose ground the realm already borders, so a *new* frontier is what triggers a strike. */
  borderedRivalIds?: string[];

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
  /** Play-earned edicts already announced, so each "within reach" toast fires exactly once. */
  knownEdictIds?: string[];
}

export interface GameState {
  year: number;
  season: Season;
  turn: number;
  /**
   * Ticks the current season has been held, 0-based. Optional so old saves load: absent reads as 0,
   * which costs a resumed run at most one short season. See `SEASON_TICKS`.
   */
  seasonTick?: number;
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
  /** The tax dial as a continuous 0..1 rate (Dragon Ascent's slider). Absent = read `taxPolicy`. */
  taxRate?: number;
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

  // ── The Chronicle (ascent only; optional so older saves load unchanged) ──
  /** Stories currently running. Most are latent — seeded with no announcement at all. */
  stories?: ActiveStory[];
  /** What has already happened, in past tense. Never a task list. */
  chronicle?: ChronicleEntry[];
  /** Last tick's world snapshot, so a story can notice what changed. */
  storyWatch?: StoryWatch;
  /** Story cards raised so far, against total prompts — holds the ~15% budget. */
  storyPromptsRaised?: number;
  /** The realm's books: gross, demand and net per resource, plus who is going without. */
  ascentLedger?: AscentLedger;
  /**
   * Provinces whose officials have stopped collecting because they have not been paid.
   *
   * An unpaid province's gold output is withheld until the treasury recovers — the coin
   * shortfall made visible as a *place*, not a subtraction. The line the player sees is the
   * same one the Reed Banner uses ("X paid no tax this season"), on purpose: from the throne,
   * a rebellion and an unpaid clerk look identical until you go and find out.
   */
  unpaidLandIds?: string[];
  /** Last season each shortfall kind was announced, so the header does not nag every tick. */
  shortfallToastTurns?: Partial<Record<'food' | 'supplies' | 'gold' | 'goldRatchet', number>>;
  /**
   * Templates that have already run their course this run.
   *
   * A finished story must not seed again: six stories told once each is the design, and a
   * template re-seeding mid-run puts the same opening line in the Chronicle twice, which is
   * precisely the visible repetition a salience pool is most exposed to.
   */
  storiesEnded?: string[];

  isDefeated: boolean;
  defeatReason?: 'conquest' | 'collapse';
}
