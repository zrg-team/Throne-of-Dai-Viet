import { PLAYER_KINGDOM_ID } from '../game/constants';
import { heroTemplates } from '../data/heroes';
import { politicsCardTemplates } from '../data/politicsCards';
import { createHeroDraft } from './HeroSystem';
import { eraSeatBonus } from './empire/MandateSystem';
import type { CourtModifier, CourtPositionId, CourtState, GameState, Hero, HeroStats, ResourceBag } from '../state/types';
import { heroName, t } from '../i18n';

export const ALL_COURT_POSITIONS: CourtPositionId[] = [
  'marshal',
  'quartermaster',
  'treasurer',
  'steward',
  'chancellor',
  'spymaster',
  'censor',
  'masterOfHorse',
];

/** Seats unlocked from the start, before any public halls are built. */
const BASE_SEATS: CourtPositionId[] = ['marshal', 'treasurer', 'steward'];

export const COURT_POSITION_LABELS: Record<CourtPositionId, string> = {
  marshal: 'Marshal',
  quartermaster: 'Quartermaster',
  treasurer: 'Treasurer',
  steward: 'Steward',
  chancellor: 'Chancellor',
  spymaster: 'Spymaster',
  censor: 'Censor',
  masterOfHorse: 'Master of Horse',
};

export function getCourtPositionLabel(positionId: CourtPositionId): string {
  return t(`courtPosition.${positionId}`);
}

export const COURT_POSITION_DESCRIPTIONS: Record<CourtPositionId, string> = {
  marshal: 'Martial: army power. Logistics: recruitment speed.',
  quartermaster: 'Logistics: recruitment speed and faster peaceful acquisition.',
  treasurer: 'Administration: gold output, cheaper and faster construction.',
  steward: 'Administration: food and supply output.',
  chancellor: 'Diplomacy: influence per turn and more frequent court opportunities.',
  spymaster: 'Diplomacy: faster peaceful acquisition. Martial: more frequent crises.',
  censor: 'Loyalty: stability regen and faster hero arrivals (Favor).',
  masterOfHorse: 'Renown: army morale regen, recruitment speed, and Favor.',
};

export interface CourtBonuses {
  goldOutputMult: number;
  foodOutputMult: number;
  suppliesOutputMult: number;
  buildingCostMult: number;
  buildSpeedBonus: number;
  recruitSpeedMult: number;
  armyPowerMult: number;
  armyMoraleRegen: number;
  stabilityRegen: number;
  influenceRegen: number;
  favorPerTick: number;
  acquisitionSpeedMult: number;
  acquisitionCostMult: number;
  cardFrequencyMult: number;
  resourceRateModifier: Partial<ResourceBag>;
  buildingGoldUpkeepMult: number;
  buildingSuppliesUpkeepMult: number;
  marketGoldOutputMult: number;
  recruitmentSupplyCostMult: number;
  upgradeSpeedBonus: number;
  armyXpMult: number;
  armyGoldUpkeepMult: number;
  battleSupplyCostMult: number;
  nextArmyLevelBonus: number;
  nextArmyArchersBonus: number;
  nextArmyHeavyBonus: number;
  armyLevelCapBonus: number;
}

type NumericCourtBonusKey = Exclude<keyof CourtBonuses, 'resourceRateModifier'>;
type CourtBonusDelta = Partial<Record<NumericCourtBonusKey, number>>;

const BASE_STABILITY_REGEN = 0.15;
const BASE_INFLUENCE_REGEN = 0.05;
const BASE_FAVOR_PER_TICK = 0.5;

/** Maps a seated hero's stats to the kingdom-wide bonuses their position grants. */
export const COURT_POSITION_EFFECTS: Record<CourtPositionId, (stats: HeroStats) => CourtBonusDelta> = {
  marshal: (stats) => ({
    armyPowerMult: stats.martial * 0.003,
    recruitSpeedMult: stats.logistics * 0.0015,
  }),
  quartermaster: (stats) => ({
    recruitSpeedMult: stats.logistics * 0.003,
    acquisitionSpeedMult: stats.logistics * 0.003,
  }),
  treasurer: (stats) => ({
    goldOutputMult: stats.administration * 0.004,
    buildingCostMult: -stats.administration * 0.002,
    buildSpeedBonus: stats.administration >= 60 ? 1 : 0,
  }),
  steward: (stats) => ({
    foodOutputMult: stats.administration * 0.004,
    suppliesOutputMult: stats.administration * 0.003,
  }),
  chancellor: (stats) => ({
    influenceRegen: stats.diplomacy * 0.04,
    cardFrequencyMult: stats.diplomacy * 0.003,
  }),
  spymaster: (stats) => ({
    acquisitionSpeedMult: stats.diplomacy * 0.003,
    cardFrequencyMult: stats.martial * 0.002,
  }),
  censor: (stats) => ({
    stabilityRegen: stats.loyalty * 0.04,
    favorPerTick: stats.loyalty * 0.01,
  }),
  masterOfHorse: (stats) => ({
    armyMoraleRegen: stats.renown * 0.04,
    recruitSpeedMult: stats.renown * 0.002,
    favorPerTick: stats.renown * 0.01,
  }),
};

const ALL_SIGNATURE_CARD_IDS = new Set(
  heroTemplates.map((hero) => hero.signatureCardId).filter((id): id is string => Boolean(id)),
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCommunalHallLevels(state: GameState): number {
  let levels = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    for (const building of land.buildings) {
      if (building.type === 'communalHall') {
        levels += building.level;
      }
    }
  }
  return levels;
}

function getMarketStabilityPressure(state: GameState): number {
  return state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .reduce((sum, land) => (
      sum + land.buildings
        .filter((building) => building.type === 'market')
        .reduce((buildingSum, building) => buildingSum + building.level * 0.02, 0)
    ), 0);
}

/** Aggregates every seated hero's position effects into the kingdom-wide bonus set. */
export function getCourtBonuses(state: GameState): CourtBonuses {
  const delta: Required<CourtBonusDelta> = {
    goldOutputMult: 0,
    foodOutputMult: 0,
    suppliesOutputMult: 0,
    buildingCostMult: 0,
    buildSpeedBonus: 0,
    recruitSpeedMult: 0,
    armyPowerMult: 0,
    armyMoraleRegen: 0,
    stabilityRegen: 0,
    influenceRegen: 0,
    favorPerTick: 0,
    acquisitionSpeedMult: 0,
    acquisitionCostMult: 0,
    cardFrequencyMult: 0,
    buildingGoldUpkeepMult: 0,
    buildingSuppliesUpkeepMult: 0,
    marketGoldOutputMult: 0,
    recruitmentSupplyCostMult: 0,
    upgradeSpeedBonus: 0,
    armyXpMult: 0,
    armyGoldUpkeepMult: 0,
    battleSupplyCostMult: 0,
    nextArmyLevelBonus: 0,
    nextArmyArchersBonus: 0,
    nextArmyHeavyBonus: 0,
    armyLevelCapBonus: 0,
  };

  for (const [positionId, heroId] of Object.entries(state.court.seats)) {
    if (!heroId) {
      continue;
    }
    const hero = state.heroes.find((candidate) => candidate.id === heroId);
    if (!hero) {
      continue;
    }
    const effects = COURT_POSITION_EFFECTS[positionId as CourtPositionId](hero.stats);
    for (const [key, value] of Object.entries(effects)) {
      delta[key as NumericCourtBonusKey] += value ?? 0;
    }
  }

  const resourceRateModifier: Partial<ResourceBag> = {};
  for (const modifier of state.activeCourtModifiers) {
    if (modifier.resourceRateModifier) {
      for (const [key, value] of Object.entries(modifier.resourceRateModifier)) {
        const resourceKey = key as keyof ResourceBag;
        resourceRateModifier[resourceKey] = (resourceRateModifier[resourceKey] ?? 0) + (value ?? 0);
      }
    }
    delta.recruitSpeedMult += modifier.recruitSpeedModifier ?? 0;
    delta.cardFrequencyMult += modifier.courtCardSpeedModifier ?? 0;
    delta.armyPowerMult += 0;
    delta.buildingCostMult += modifier.buildingCostModifier ?? 0;
    delta.buildSpeedBonus += modifier.buildSpeedBonus ?? 0;
    delta.upgradeSpeedBonus += modifier.upgradeSpeedBonus ?? 0;
    delta.acquisitionCostMult += modifier.acquisitionCostModifier ?? 0;
    delta.armyXpMult += modifier.armyXpModifier ?? 0;
    delta.buildingGoldUpkeepMult += modifier.buildingGoldUpkeepModifier ?? 0;
    delta.buildingSuppliesUpkeepMult += modifier.buildingSuppliesUpkeepModifier ?? 0;
    delta.marketGoldOutputMult += modifier.marketGoldOutputModifier ?? 0;
    delta.recruitmentSupplyCostMult += modifier.recruitmentSupplyCostModifier ?? 0;
    delta.armyGoldUpkeepMult += modifier.armyGoldUpkeepModifier ?? 0;
    delta.battleSupplyCostMult += modifier.battleSupplyCostModifier ?? 0;
    delta.nextArmyLevelBonus += modifier.nextArmyLevelBonus ?? 0;
    delta.nextArmyArchersBonus += modifier.nextArmyArchersBonus ?? 0;
    delta.nextArmyHeavyBonus += modifier.nextArmyHeavyBonus ?? 0;
    delta.armyLevelCapBonus += modifier.armyLevelCapBonus ?? 0;
  }

  const filledSeatCount = Object.values(state.court.seats).filter(Boolean).length;
  const publicLevels = getCommunalHallLevels(state);

  return {
    goldOutputMult: 1 + delta.goldOutputMult,
    foodOutputMult: 1 + delta.foodOutputMult,
    suppliesOutputMult: 1 + delta.suppliesOutputMult,
    buildingCostMult: clamp(1 + delta.buildingCostMult, 0.6, 1),
    buildSpeedBonus: Math.round(delta.buildSpeedBonus),
    recruitSpeedMult: 1 + delta.recruitSpeedMult,
    armyPowerMult: 1 + delta.armyPowerMult,
    armyMoraleRegen: delta.armyMoraleRegen,
    stabilityRegen: BASE_STABILITY_REGEN + delta.stabilityRegen + publicLevels * 0.08,
    influenceRegen: BASE_INFLUENCE_REGEN + delta.influenceRegen + publicLevels * 0.04,
    favorPerTick: BASE_FAVOR_PER_TICK + delta.favorPerTick + publicLevels * 0.4,
    acquisitionSpeedMult: clamp(1 + delta.acquisitionSpeedMult, 0.4, 1.8),
    acquisitionCostMult: clamp(1 + delta.acquisitionCostMult, 0.45, 1.4),
    cardFrequencyMult: clamp(1 + filledSeatCount * 0.22 + delta.cardFrequencyMult, 0.5, 3.5),
    resourceRateModifier,
    buildingGoldUpkeepMult: clamp(1 + delta.buildingGoldUpkeepMult, 0.35, 1.5),
    buildingSuppliesUpkeepMult: clamp(1 + delta.buildingSuppliesUpkeepMult, 0.35, 1.5),
    marketGoldOutputMult: clamp(1 + delta.marketGoldOutputMult, 0.4, 2.5),
    recruitmentSupplyCostMult: clamp(1 + delta.recruitmentSupplyCostMult, 0.45, 1.5),
    upgradeSpeedBonus: Math.round(delta.upgradeSpeedBonus),
    armyXpMult: clamp(1 + delta.armyXpMult, 0.5, 3),
    armyGoldUpkeepMult: clamp(1 + delta.armyGoldUpkeepMult, 0.35, 1.8),
    battleSupplyCostMult: clamp(1 + delta.battleSupplyCostMult, 0.35, 1.5),
    nextArmyLevelBonus: Math.max(0, Math.round(delta.nextArmyLevelBonus)),
    nextArmyArchersBonus: Math.max(0, delta.nextArmyArchersBonus),
    nextArmyHeavyBonus: Math.max(0, delta.nextArmyHeavyBonus),
    armyLevelCapBonus: Math.max(0, Math.round(delta.armyLevelCapBonus)),
  };
}

export function addCourtModifier(state: GameState, modifier: CourtModifier): void {
  state.activeCourtModifiers.push(modifier);
}

function progressCourtModifiers(state: GameState): void {
  for (const modifier of state.activeCourtModifiers) {
    if (typeof modifier.remainingTicks === 'number') {
      modifier.remainingTicks -= 1;
    }
  }
  state.activeCourtModifiers = state.activeCourtModifiers.filter((modifier) => {
    return typeof modifier.remainingTicks !== 'number' || modifier.remainingTicks > 0;
  });
}

/** Recomputes which court seats are unlocked based on Communal Halls built on player lands. */
export function refreshCourtSeats(state: GameState): void {
  const communalHallLevels = getCommunalHallLevels(state);
  // Empire-mode eras grant seats on top of Communal Hall seats (see MandateSystem).
  const eraSeats = eraSeatBonus(state);

  const bonusSeats = ALL_COURT_POSITIONS.filter((positionId) => !BASE_SEATS.includes(positionId));
  state.court.unlockedSeats = [...BASE_SEATS, ...bonusSeats.slice(0, communalHallLevels + eraSeats)];

  for (const positionId of Object.keys(state.court.seats) as CourtPositionId[]) {
    if (!state.court.unlockedSeats.includes(positionId)) {
      removeHeroFromPosition(state, positionId);
    }
  }
}

/** Clears whatever duty (army command, court seat, governorship) a hero currently holds. */
function releaseHeroAssignment(state: GameState, hero: Hero): void {
  if (!hero.assignedTo) {
    return;
  }

  if (hero.assignedTo.startsWith('court:')) {
    const positionId = hero.assignedTo.slice('court:'.length) as CourtPositionId;
    delete state.court.seats[positionId];
  } else {
    const army = state.armies.find((candidate) => candidate.generalHeroId === hero.id);
    if (army) {
      army.generalHeroId = undefined;
    }
  }

  hero.assignedTo = undefined;
}

/** Seats a hero in a court position, vacating any prior duty and bumping a previous occupant, if any. */
export function assignHeroToPosition(state: GameState, heroId: string, positionId: CourtPositionId): boolean {
  if (!state.court.unlockedSeats.includes(positionId)) {
    state.message = t('msg.seatNotBuilt', { seat: getCourtPositionLabel(positionId) });
    return false;
  }

  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) {
    return false;
  }

  if (hero.assignedTo === `court:${positionId}`) {
    return false;
  }

  releaseHeroAssignment(state, hero);

  const previousHeroId = state.court.seats[positionId];
  if (previousHeroId) {
    const previousHero = state.heroes.find((candidate) => candidate.id === previousHeroId);
    if (previousHero) {
      previousHero.assignedTo = undefined;
    }
    state.court.stability = clamp(state.court.stability - 2, 0, 100);
  }

  state.court.seats[positionId] = heroId;
  hero.assignedTo = `court:${positionId}`;
  state.message = t('msg.heroTakesSeat', { hero: heroName(hero), seat: getCourtPositionLabel(positionId) });
  return true;
}

export function removeHeroFromPosition(state: GameState, positionId: CourtPositionId): boolean {
  const heroId = state.court.seats[positionId];
  if (!heroId) {
    return false;
  }

  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (hero) {
    hero.assignedTo = undefined;
  }
  delete state.court.seats[positionId];
  return true;
}

/** Assigns a hero as governor of a player-owned land, replacing any previous governor there. */
export function assignHeroToLand(state: GameState, heroId: string, landId: string): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!hero || !land || land.ownerId !== PLAYER_KINGDOM_ID) {
    return false;
  }

  const previousGovernor = state.heroes.find((candidate) => candidate.assignedTo === landId);
  if (previousGovernor) {
    previousGovernor.assignedTo = undefined;
  }

  releaseHeroAssignment(state, hero);
  hero.assignedTo = landId;
  state.message = t('msg.heroGoverns', { hero: heroName(hero), land: land.name });
  return true;
}

/** Output multiplier a land receives from its assigned governor's administration stat. */
export function getLandGovernorOutputMult(state: GameState, landId: string): number {
  const governor = state.heroes.find((candidate) => candidate.assignedTo === landId);
  return governor ? 1 + governor.stats.administration * 0.004 : 1;
}

/** Adds or removes hero signature cards from the politics deck based on current court seating. */
function syncSignatureCards(state: GameState): void {
  const seatedSignatureIds = new Set<string>();
  for (const heroId of Object.values(state.court.seats)) {
    const hero = state.heroes.find((candidate) => candidate.id === heroId);
    if (hero?.signatureCardId) {
      seatedSignatureIds.add(hero.signatureCardId);
    }
  }

  for (const cardId of seatedSignatureIds) {
    if (!state.politicsDeck.some((card) => card.id === cardId)) {
      const template = politicsCardTemplates.find((card) => card.id === cardId);
      if (template) {
        state.politicsDeck.push(structuredClone(template));
      }
    }
  }

  state.politicsDeck = state.politicsDeck.filter((card) => {
    if (!ALL_SIGNATURE_CARD_IDS.has(card.id)) {
      return true;
    }
    if (seatedSignatureIds.has(card.id)) {
      return true;
    }
    return state.activePoliticsCard?.id === card.id || state.pendingCourtRequest?.id === card.id;
  });
}

/** Advances Favor, hero arrival, stability/influence, and governed-land loyalty by one economy tick. */
export function progressCourt(state: GameState): void {
  progressCourtModifiers(state);
  refreshCourtSeats(state);
  const bonuses = getCourtBonuses(state);

  state.court.favor += bonuses.favorPerTick;
  if (state.court.favor >= state.court.favorThreshold) {
    state.court.favor = 0;
    state.court.favorThreshold = Math.min(40, Math.round(state.court.favorThreshold * 1.12));
    createHeroDraft(state);
  }

  let governedLandCount = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    const governor = state.heroes.find((candidate) => candidate.assignedTo === land.id);
    if (governor) {
      governedLandCount += 1;
      land.loyalty = Math.min(100, land.loyalty + governor.stats.loyalty * 0.05);
    }
  }

  const playerLandCount = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  const ungovernedPenalty = Math.max(0, playerLandCount - governedLandCount - 3) * 0.15;
  const marketPressure = getMarketStabilityPressure(state);

  state.court.stability = clamp(state.court.stability + bonuses.stabilityRegen - ungovernedPenalty - marketPressure, 0, 100);
  state.court.influence = clamp(state.court.influence + bonuses.influenceRegen, 0, 100);

  syncSignatureCards(state);
}

export function createInitialCourtState(): CourtState {
  return {
    seats: {},
    unlockedSeats: [...BASE_SEATS],
    stability: 50,
    influence: 50,
    favor: 0,
    favorThreshold: 12,
    cardCooldown: 3,
  };
}
