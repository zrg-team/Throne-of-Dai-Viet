import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../game/constants';
import { getAcquisitionOrder, findLand, isLandVisibleToPlayer, refreshPlayerVisibility } from './LandSystem';
import { applyResourceDelta, canSpend, refreshAllLandOutputs } from './ResourceSystem';
import { getCourtBonuses } from './CourtSystem';
import type { AcquisitionMethod, AcquisitionOrder, Army, GameState, Hero, Land, ResourceBag } from '../state/types';
import { formatResourceList, heroName, t } from '../i18n';

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_TRUST = 40;
const INTIMIDATION_REQUIRED = 100;
const RESIST_FACTOR = 4;
const MIN_INTIMIDATION_RATIO = 0.5;
const BRIBE_SUCCESS_BASE = 85;
const BRIBE_NOBLE_PENALTY = 0.9;
const BRIBE_MIN_CHANCE = 0.25;
const BRIBE_MAX_CHANCE = 0.9;
const DIPLOMACY_TRUST_THRESHOLD_BASE = 65;
const DIPLOMACY_SUPPLIES_BASE = 10;
const DIPLOMACY_ASSIGNMENT_PREFIX = 'diplomacy-';
const SETTLE_HUMANS_BASE = 80;
const SETTLE_TICKS_BASE = 4;

const BUILDING_ACQUISITION_BONUS: Partial<Record<string, Partial<ResourceBag>>> = {
  farm: { food: 8 },
  mine: { supplies: 6 },
  market: { gold: 10 },
};

// ─── Derived Scores ───────────────────────────────────────────────────────────

export function getLandTrust(land: Land, kingdomId: string): number {
  return land.trust[kingdomId] ?? BASE_TRUST;
}

export function getNoblePower(land: Land): number {
  return land.localSoldiers
    + land.buildings.length * 4
    + land.buildingCapacity * 2
    + Math.floor(land.population / 20);
}

export function getBribeSuccessChance(land: Land): number {
  const raw = (BRIBE_SUCCESS_BASE - getNoblePower(land) * BRIBE_NOBLE_PENALTY) / 100;
  return Math.min(BRIBE_MAX_CHANCE, Math.max(BRIBE_MIN_CHANCE, raw));
}

export function getGoldBribeCost(state: GameState, land: Land): number {
  const bonuses = getCourtBonuses(state);
  return Math.ceil((20 + land.defense * 0.5 + land.buildingCapacity * 2 + land.localSoldiers * 1.5) * bonuses.acquisitionCostMult);
}

export function getDiplomacyThreshold(land: Land): number {
  return DIPLOMACY_TRUST_THRESHOLD_BASE + getNoblePower(land) * 0.3;
}

export function getDiplomacySuppliesCost(state: GameState, land: Land): number {
  const bonuses = getCourtBonuses(state);
  return Math.ceil((DIPLOMACY_SUPPLIES_BASE + getNoblePower(land) * 0.5) * bonuses.acquisitionCostMult);
}

export function getSettleHumansCost(): number {
  return SETTLE_HUMANS_BASE;
}

export function getSettleTicks(land: Land): number {
  return Math.max(3, SETTLE_TICKS_BASE + land.buildingCapacity);
}

export function getDiplomacyAssignment(landId: string): string {
  return `${DIPLOMACY_ASSIGNMENT_PREFIX}${landId}`;
}

export function getAssignedDiplomaticHero(state: GameState, order: AcquisitionOrder): Hero | undefined {
  if (order.method !== 'diplomacy' || !order.heroId) return undefined;
  const hero = state.heroes.find((h) => h.id === order.heroId);
  return hero?.assignedTo === getDiplomacyAssignment(order.landId) ? hero : undefined;
}

function releaseDiplomaticHero(state: GameState, order: AcquisitionOrder, addFatigue: boolean): void {
  const hero = getAssignedDiplomaticHero(state, order);
  if (!hero) return;
  hero.assignedTo = undefined;
  if (addFatigue) {
    hero.fatigue = Math.min(100, hero.fatigue + 20);
  }
}

// ─── Resource Bonus ───────────────────────────────────────────────────────────

export function getAcquisitionResourceBonus(land: Land): Partial<ResourceBag> {
  const bonus: Partial<ResourceBag> = {};
  for (const building of land.buildings) {
    const base = BUILDING_ACQUISITION_BONUS[building.type];
    if (!base) continue;
    const mult = 1 + (building.level - 1) * 0.6;
    for (const [key, value] of Object.entries(base) as Array<[keyof ResourceBag, number]>) {
      bonus[key] = (bonus[key] ?? 0) + Math.round(value * mult);
    }
  }
  return bonus;
}

// ─── Completion ───────────────────────────────────────────────────────────────

const LOYALTY_BY_METHOD: Record<AcquisitionMethod, number> = {
  bribe: 68,
  diplomacy: 85,
  intimidation: 50,
  settle: 65,
  occupy: 55,
  conquest: 60,
};

function completeLandAcquisition(state: GameState, land: Land, order: AcquisitionOrder): void {
  land.ownerId = PLAYER_KINGDOM_ID;
  land.loyalty = Math.max(land.loyalty, LOYALTY_BY_METHOD[order.method]);

  if (land.population > 0) {
    applyResourceDelta(state, { humans: land.population });
  }

  const bonus = getAcquisitionResourceBonus(land);
  if (Object.keys(bonus).length > 0) {
    applyResourceDelta(state, bonus);
  }

  if (order.method === 'intimidation') {
    land.trust[PLAYER_KINGDOM_ID] = Math.max(0, getLandTrust(land, PLAYER_KINGDOM_ID) - 15);
  }

  releaseDiplomaticHero(state, order, true);

  const popMsg = land.population > 0 ? t('msg.populationBonus', { population: land.population }) : '';
  const bonusKeys = formatResourceList(bonus);
  const bonusMsg = bonusKeys ? t('msg.resourceBonus', { bonus: bonusKeys }) : '';

  const methodMessages: Record<AcquisitionMethod, string> = {
    bribe: t('msg.acquiredBribe', { land: land.name, popMsg, bonusMsg }),
    diplomacy: t('msg.acquiredDiplomacy', { land: land.name, popMsg, bonusMsg }),
    intimidation: t('msg.acquiredIntimidation', { land: land.name, popMsg, bonusMsg }),
    settle: t('msg.acquiredSettle', { land: land.name }),
    occupy: t('msg.acquiredOccupy', { land: land.name }),
    conquest: t('msg.acquiredConquest', { land: land.name }),
  };
  state.message = methodMessages[order.method];
}

// ─── Bribe ────────────────────────────────────────────────────────────────────

export function bribeLand(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== NEUTRAL_OWNER_ID || !land.hasVillage) return false;

  if (getAcquisitionOrder(state, landId)) {
    state.message = t('msg.acquisitionProgress', { land: land.name });
    return false;
  }

  const hasOwnedNeighbor = land.neighbors.some((nId) => findLand(state, nId)?.ownerId === PLAYER_KINGDOM_ID);
  if (!hasOwnedNeighbor) {
    state.message = t('msg.neutralAdjacentOnly');
    return false;
  }

  const cost = getGoldBribeCost(state, land);
  if (!canSpend(state, { gold: cost })) {
    state.message = t('msg.needGoldBribe', { cost });
    return false;
  }

  applyResourceDelta(state, { gold: -cost });

  const successChance = getBribeSuccessChance(land);
  if (Math.random() > successChance) {
    land.trust[PLAYER_KINGDOM_ID] = Math.max(0, getLandTrust(land, PLAYER_KINGDOM_ID) - 25);
    state.message = t('msg.bribeRefused', { land: land.name });
    return false;
  }

  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    progress: 0,
    required: 1,
    costGold: cost,
    method: 'bribe',
  });
  refreshPlayerVisibility(state);
  state.message = t('msg.bribeAccepted', { land: land.name });
  return true;
}

// ─── Diplomatic Claim ─────────────────────────────────────────────────────────

export function startDiplomaticClaim(state: GameState, landId: string, heroId?: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== NEUTRAL_OWNER_ID || !land.hasVillage) return false;

  if (getAcquisitionOrder(state, landId)) {
    state.message = t('msg.acquisitionProgress', { land: land.name });
    return false;
  }

  const hasOwnedNeighbor = land.neighbors.some((nId) => findLand(state, nId)?.ownerId === PLAYER_KINGDOM_ID);
  if (!hasOwnedNeighbor) {
    state.message = t('msg.neutralAdjacentOnly');
    return false;
  }

  if (!heroId) {
    state.message = t('msg.assignHeroDiplomacy');
    return false;
  }

  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero) {
    state.message = t('msg.heroUnavailableDiplomacy');
    return false;
  }

  if (hero.assignedTo) {
    state.message = t('msg.heroAlreadyAssigned', { hero: heroName(hero) });
    return false;
  }

  const suppliesCost = getDiplomacySuppliesCost(state, land);
  if (!canSpend(state, { supplies: suppliesCost })) {
    state.message = t('msg.needSuppliesDiplomacy', { cost: suppliesCost });
    return false;
  }

  applyResourceDelta(state, { supplies: -suppliesCost });
  hero.assignedTo = getDiplomacyAssignment(landId);

  const threshold = getDiplomacyThreshold(land);
  const currentTrust = getLandTrust(land, PLAYER_KINGDOM_ID);
  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    // Progress tracks trust toward the threshold so the on-map badge reads correctly.
    progress: Math.floor(currentTrust),
    required: Math.ceil(threshold),
    costGold: 0,
    method: 'diplomacy',
    heroId: hero.id,
  });

  refreshPlayerVisibility(state);
  state.message = t('msg.heroTravels', { hero: heroName(hero), land: land.name, threshold: Math.ceil(threshold), current: Math.floor(currentTrust) });
  return true;
}

// ─── Intimidation ─────────────────────────────────────────────────────────────

export function startIntimidation(state: GameState, landId: string, armyId: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== NEUTRAL_OWNER_ID || !land.hasVillage) return false;

  if (getAcquisitionOrder(state, landId)) {
    state.message = t('msg.acquisitionProgress', { land: land.name });
    return false;
  }

  const army = state.armies.find((a) => a.id === armyId && a.kingdomId === PLAYER_KINGDOM_ID);
  if (!army) return false;

  const armyLand = findLand(state, army.landId);
  if (!armyLand || armyLand.ownerId !== PLAYER_KINGDOM_ID || !armyLand.neighbors.includes(landId)) {
    state.message = t('msg.armyAdjacentThreat', { land: land.name });
    return false;
  }

  const power = computeArmyPower(army);
  if (power < land.localSoldiers * MIN_INTIMIDATION_RATIO) {
    state.message = t('msg.armyTooWeak', { power: Math.round(power), land: land.name, garrison: land.localSoldiers });
    return false;
  }

  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    progress: 0,
    required: INTIMIDATION_REQUIRED,
    costGold: 0,
    method: 'intimidation',
    armyId,
  });

  refreshPlayerVisibility(state);
  state.message = t('msg.armyPressures', { land: land.name });
  return true;
}

function computeArmyPower(army: Army): number {
  const units = army.units.spearmen + army.units.archers * 1.25 + army.units.heavyInfantry * 1.8;
  return units * (army.morale / 100) * (army.supply / 100) * (1 + Math.max(0, army.level - 1) * 0.08);
}

// ─── Settle ───────────────────────────────────────────────────────────────────

export function settleLand(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== NEUTRAL_OWNER_ID || land.hasVillage) return false;

  if (getAcquisitionOrder(state, landId)) {
    state.message = t('msg.acquisitionProgress', { land: land.name });
    return false;
  }

  const hasOwnedNeighbor = land.neighbors.some((nId) => findLand(state, nId)?.ownerId === PLAYER_KINGDOM_ID);
  if (!hasOwnedNeighbor) {
    state.message = t('msg.settleAdjacentOnly');
    return false;
  }

  const humansCost = getSettleHumansCost();
  if (!canSpend(state, { humans: humansCost })) {
    state.message = t('msg.needHumansSettlers', { cost: humansCost });
    return false;
  }

  const required = getSettleTicks(land);
  applyResourceDelta(state, { humans: -humansCost });
  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    progress: 0,
    required,
    costGold: 0,
    method: 'settle',
  });

  refreshPlayerVisibility(state);
  state.message = t('msg.settlersDepart', { land: land.name, seasons: required });
  return true;
}

// ─── Occupy (called from WarSystem when army enters empty neutral land) ────────

export function occupyEmptyLand(state: GameState, armyId: string, landId: string): void {
  const land = findLand(state, landId);
  const army = state.armies.find((a) => a.id === armyId);
  if (!land || !army || land.ownerId !== NEUTRAL_OWNER_ID || land.hasVillage) return;

  const fromLandId = army.landId;
  army.landId = landId;

  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    progress: 0,
    required: 1,
    costGold: 0,
    method: 'occupy',
    armyId,
  });

  state.message = t('msg.armyEntersWilderness', { army: army.name, land: land.name });

  // Resolve immediately next tick via progressAcquisitions, but also record fromLandId on army
  // so the army is already at the new land for pathfinding purposes.
  void fromLandId;
}

// ─── Progress All Acquisition Orders ─────────────────────────────────────────

export function progressAcquisitions(state: GameState): boolean {
  const toComplete: string[] = [];
  const toCancel: string[] = [];

  for (const order of state.acquisitionOrders) {
    if (order.buyerId !== PLAYER_KINGDOM_ID) {
      // Bot conquest: simple tick progression
      order.progress += 1;
      if (order.progress >= order.required) toComplete.push(order.landId);
      continue;
    }

    switch (order.method) {
      case 'bribe':
      case 'settle':
      case 'occupy': {
        order.progress += 1;
        if (order.progress >= order.required) toComplete.push(order.landId);
        break;
      }

      case 'diplomacy': {
        const land = findLand(state, order.landId);
        const hero = order.heroId ? state.heroes.find((h) => h.id === order.heroId) : undefined;
        if (!land) {
          toCancel.push(order.landId);
          break;
        }
        if (!hero || hero.assignedTo !== getDiplomacyAssignment(order.landId)) {
          state.message = t('msg.diplomacyCancelledNoHero', { land: land.name });
          toCancel.push(order.landId);
          break;
        }
        const bonuses = getCourtBonuses(state);
        const gain = (1 + hero.stats.administration * 0.03) * bonuses.acquisitionSpeedMult;
        land.trust[PLAYER_KINGDOM_ID] = Math.min(100, getLandTrust(land, PLAYER_KINGDOM_ID) + gain);
        // Mirror trust into the order so the progress badge advances visibly.
        order.progress = Math.floor(land.trust[PLAYER_KINGDOM_ID]);
        if (land.trust[PLAYER_KINGDOM_ID] >= order.required) toComplete.push(order.landId);
        break;
      }

      case 'intimidation': {
        const land = findLand(state, order.landId);
        const army = order.armyId ? state.armies.find((a) => a.id === order.armyId) : undefined;
        if (!land || !army) {
          toCancel.push(order.landId);
          break;
        }
        const armyLand = findLand(state, army.landId);
        if (!armyLand || !armyLand.neighbors.includes(order.landId)) {
          state.message = t('msg.intimidationCancelledMoved', { land: land.name });
          toCancel.push(order.landId);
          break;
        }
        const power = computeArmyPower(army);
        const gain = power / Math.max(1, land.localSoldiers * RESIST_FACTOR);
        order.progress = Math.min(INTIMIDATION_REQUIRED, order.progress + gain);
        if (order.progress >= INTIMIDATION_REQUIRED) toComplete.push(order.landId);
        break;
      }

      default:
        break;
    }
  }

  for (const order of state.acquisitionOrders) {
    if (toCancel.includes(order.landId)) {
      releaseDiplomaticHero(state, order, false);
    }
  }

  state.acquisitionOrders = state.acquisitionOrders.filter((o) => !toCancel.includes(o.landId));

  if (toComplete.length === 0) return toCancel.length > 0;

  for (const landId of toComplete) {
    const land = findLand(state, landId);
    const order = getAcquisitionOrder(state, landId);
    if (!land || !order || land.ownerId !== NEUTRAL_OWNER_ID) continue;

    if (order.buyerId === PLAYER_KINGDOM_ID) {
      completeLandAcquisition(state, land, order);
    } else {
      // Bot conquest completion
      land.ownerId = order.buyerId;
      land.loyalty = Math.max(land.loyalty, 60);
      const kingdom = state.kingdoms.find((k) => k.id === order.buyerId);
      if (kingdom && isLandVisibleToPlayer(state, landId)) {
        state.message = t('msg.landJoinsKingdom', { land: land.name, kingdom: kingdom.name });
      }
    }
  }

  state.acquisitionOrders = state.acquisitionOrders.filter((o) => !toComplete.includes(o.landId));
  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  return true;
}
