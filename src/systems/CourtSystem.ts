import { PLAYER_KINGDOM_ID } from '../game/constants';
import { heroTemplates } from '../data/heroes';
import { politicsCardTemplates } from '../data/politicsCards';
import { createHeroDraft } from './HeroSystem';
import type { CourtPositionId, CourtState, GameState, Hero, HeroStats } from '../state/types';

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

/** Seats unlocked from the start, before any shrines are built. */
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
  cardFrequencyMult: number;
}

type CourtBonusDelta = Partial<Record<keyof CourtBonuses, number>>;

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
    acquisitionSpeedMult: -stats.logistics * 0.003,
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
    acquisitionSpeedMult: -stats.diplomacy * 0.003,
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

function getShrineFavor(state: GameState): number {
  let favor = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    for (const building of land.buildings) {
      if (building.type === 'shrine') {
        favor += building.level * 0.4;
      }
    }
  }
  return favor;
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
    cardFrequencyMult: 0,
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
      delta[key as keyof CourtBonuses] += value ?? 0;
    }
  }

  return {
    goldOutputMult: 1 + delta.goldOutputMult,
    foodOutputMult: 1 + delta.foodOutputMult,
    suppliesOutputMult: 1 + delta.suppliesOutputMult,
    buildingCostMult: clamp(1 + delta.buildingCostMult, 0.6, 1),
    buildSpeedBonus: Math.round(delta.buildSpeedBonus),
    recruitSpeedMult: 1 + delta.recruitSpeedMult,
    armyPowerMult: 1 + delta.armyPowerMult,
    armyMoraleRegen: delta.armyMoraleRegen,
    stabilityRegen: BASE_STABILITY_REGEN + delta.stabilityRegen,
    influenceRegen: BASE_INFLUENCE_REGEN + delta.influenceRegen,
    favorPerTick: BASE_FAVOR_PER_TICK + delta.favorPerTick + getShrineFavor(state),
    acquisitionSpeedMult: clamp(1 + delta.acquisitionSpeedMult, 0.4, 1),
    cardFrequencyMult: clamp(1 + delta.cardFrequencyMult, 0.5, 2),
  };
}

/** Recomputes which court seats are unlocked based on shrines built on player lands. */
export function refreshCourtSeats(state: GameState): void {
  const shrineLevels = state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .reduce((sum, land) => sum + land.buildings.filter((building) => building.type === 'shrine').reduce((s, b) => s + b.level, 0), 0);

  const bonusSeats = ALL_COURT_POSITIONS.filter((positionId) => !BASE_SEATS.includes(positionId));
  state.court.unlockedSeats = [...BASE_SEATS, ...bonusSeats.slice(0, shrineLevels)];

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
    state.message = `The ${COURT_POSITION_LABELS[positionId]} seat is not yet built.`;
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
  state.message = `${hero.name} takes the seat of ${COURT_POSITION_LABELS[positionId]}.`;
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
  state.message = `${hero.name} governs ${land.name}.`;
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

  state.court.stability = clamp(state.court.stability + bonuses.stabilityRegen - ungovernedPenalty, 0, 100);
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
