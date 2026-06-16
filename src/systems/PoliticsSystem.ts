import { applyResourceDelta } from './ResourceSystem';
import { BUILDING_LABELS, progressBuildOrders, refreshAllLandOutputs } from './ResourceSystem';
import { createHeroDraft } from './HeroSystem';
import { MAX_BUILDING_LEVEL } from '../game/gameplayConfig';
import { PLAYER_KINGDOM_ID } from '../game/constants';
import { addCourtModifier, getCourtBonuses } from './CourtSystem';
import type { CourtEffect, GameState, HeroType, Land, LandBuildingType, ResourceBag } from '../state/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Picks the next court card, weighting crises higher when stability is low and biasing toward seated heroes' favored card types. */
export function drawPoliticsCard(state: GameState): void {
  if (state.activePoliticsCard || state.pendingCourtRequest || state.politicsDeck.length === 0) {
    return;
  }

  const weights = state.politicsDeck.map((card) => {
    let weight = 1;

    if (card.type === 'crisis' && state.court.stability < 35) {
      weight *= 2.5;
    }

    for (const heroId of Object.values(state.court.seats)) {
      const hero = state.heroes.find((candidate) => candidate.id === heroId);
      if (hero?.cardBias === card.type) {
        weight *= 1.5;
      }
    }

    return weight;
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * totalWeight;
  let index = 0;
  for (; index < weights.length - 1; index += 1) {
    roll -= weights[index];
    if (roll <= 0) {
      break;
    }
  }

  const card = state.politicsDeck[index];
  state.pendingCourtRequest = card;
  state.isPaused = true;
  state.message = `Court requests attention: ${card.title}`;
}

/** Decrements the court card cooldown each economy tick, drawing a new card and resetting the cooldown once it elapses. */
export function progressPoliticsCooldown(state: GameState): void {
  if (state.activePoliticsCard || state.pendingCourtRequest) {
    return;
  }

  state.court.cardCooldown -= 1;
  if (state.court.cardCooldown > 0) {
    return;
  }

  drawPoliticsCard(state);
  const bonuses = getCourtBonuses(state);
  state.court.cardCooldown = Math.max(1, Math.round(5 / bonuses.cardFrequencyMult));
}

export function choosePoliticsCard(state: GameState, choiceId: string): boolean {
  const card = state.activePoliticsCard;

  if (!card) {
    return false;
  }

  const choice = card.choices.find((candidate) => candidate.id === choiceId);

  if (!choice) {
    return false;
  }

  applyCourtEffect(state, choice.label, choice.effects);

  state.activePoliticsCard = undefined;
  state.isPaused = false;
  if (choice.effects.nextCourtCardSoon) {
    state.court.cardCooldown = 1;
  }
  if (choice.effects.extraCourtDraw) {
    drawPoliticsCard(state);
  }
  state.message = `${choice.label}: ${choice.description}`;
  return true;
}

function applyCourtEffect(state: GameState, label: string, effect: CourtEffect): void {
  if (effect.resourceDelta) {
    applyResourceDelta(state, effect.resourceDelta);
  }

  const modifier = createModifier(label, effect);
  if (modifier) {
    addCourtModifier(state, modifier);
  }

  if (effect.freeBuilding) {
    grantFreeBuilding(state, effect.freeBuilding);
  }
  if (effect.freeUpgrade) {
    grantFreeUpgrade(state, effect.freeUpgrade);
  }
  if (effect.freeHeroDraft) {
    createHeroDraft(state, effect.freeHeroDraft === true ? undefined : effect.freeHeroDraft);
  }
  if (effect.completeBuildOrder) {
    completeOrderOfKind(state, 'build');
  }
  if (effect.completeUpgradeOrder) {
    completeOrderOfKind(state, 'upgrade');
  }
  if (effect.restoreArmyReadiness) {
    for (const army of state.armies.filter((candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID)) {
      army.morale = 100;
      army.supply = 100;
    }
  }
  if (effect.defenseBoost) {
    const land = pickOwnedLand(state, (candidate) => candidate.ownerId === PLAYER_KINGDOM_ID);
    if (land) {
      land.defense += effect.defenseBoost;
    }
  }

  refreshAllLandOutputs(state);
}

function createModifier(label: string, effect: CourtEffect) {
  const modifierKeys: Array<keyof CourtEffect> = [
    'resourceRateModifier',
    'recruitSpeedModifier',
    'courtCardSpeedModifier',
    'armyXpModifier',
    'buildingCostModifier',
    'buildSpeedBonus',
    'upgradeSpeedBonus',
    'acquisitionCostModifier',
    'armyGoldUpkeepModifier',
    'buildingGoldUpkeepModifier',
    'buildingSuppliesUpkeepModifier',
    'marketGoldOutputModifier',
    'recruitmentSupplyCostModifier',
    'nextArmyLevelBonus',
    'nextArmyArchersBonus',
    'nextArmyHeavyBonus',
    'battleSupplyCostModifier',
    'armyLevelCapBonus',
  ];

  if (!modifierKeys.some((key) => typeof effect[key] !== 'undefined')) {
    return undefined;
  }

  return {
    id: `court-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    label,
    remainingTicks: effect.permanent ? undefined : effect.durationTicks ?? 1,
    resourceRateModifier: effect.resourceRateModifier,
    recruitSpeedModifier: effect.recruitSpeedModifier,
    courtCardSpeedModifier: effect.courtCardSpeedModifier,
    armyXpModifier: effect.armyXpModifier,
    buildingCostModifier: effect.buildingCostModifier,
    buildSpeedBonus: effect.buildSpeedBonus,
    upgradeSpeedBonus: effect.upgradeSpeedBonus,
    acquisitionCostModifier: effect.acquisitionCostModifier,
    armyGoldUpkeepModifier: effect.armyGoldUpkeepModifier,
    buildingGoldUpkeepModifier: effect.buildingGoldUpkeepModifier,
    buildingSuppliesUpkeepModifier: effect.buildingSuppliesUpkeepModifier,
    marketGoldOutputModifier: effect.marketGoldOutputModifier,
    recruitmentSupplyCostModifier: effect.recruitmentSupplyCostModifier,
    nextArmyLevelBonus: effect.nextArmyLevelBonus,
    nextArmyArchersBonus: effect.nextArmyArchersBonus,
    nextArmyHeavyBonus: effect.nextArmyHeavyBonus,
    battleSupplyCostModifier: effect.battleSupplyCostModifier,
    armyLevelCapBonus: effect.armyLevelCapBonus,
  };
}

function pickOwnedLand(state: GameState, predicate: (land: Land) => boolean): Land | undefined {
  return state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID && predicate(land))
    .sort((a, b) => b.buildingCapacity - b.buildings.length - (a.buildingCapacity - a.buildings.length))[0];
}

function isSingletonBuilding(type: LandBuildingType): boolean {
  return type === 'wall' || type === 'tower' || type === 'barracks' || type === 'shrine';
}

function grantFreeBuilding(state: GameState, type: LandBuildingType): void {
  const land = pickOwnedLand(state, (candidate) => {
    if (candidate.buildings.length >= candidate.buildingCapacity) {
      return false;
    }
    return !isSingletonBuilding(type) || !candidate.buildings.some((building) => building.type === type);
  });

  if (!land) {
    state.message = `No district has room for a free ${BUILDING_LABELS[type].replace('Build ', '')}.`;
    return;
  }

  land.buildings.push({ type, level: 1 });
  if (type === 'wall') {
    land.defense += 6;
  } else if (type === 'tower') {
    land.defense += 10;
  }
}

function grantFreeUpgrade(state: GameState, type: LandBuildingType): void {
  for (const land of state.lands.filter((candidate) => candidate.ownerId === PLAYER_KINGDOM_ID)) {
    const building = land.buildings.find((candidate) => candidate.type === type && candidate.level < MAX_BUILDING_LEVEL);
    if (building) {
      building.level += 1;
      if (type === 'wall') {
        land.defense += 6;
      } else if (type === 'tower') {
        land.defense += 10;
      }
      return;
    }
  }

  grantFreeBuilding(state, type);
}

function completeOrderOfKind(state: GameState, kind: 'build' | 'upgrade'): void {
  const order = state.buildOrders.find((candidate) => candidate.kind === kind);
  if (!order) {
    return;
  }
  order.progress = order.required;
  progressBuildOrders(state);
}
