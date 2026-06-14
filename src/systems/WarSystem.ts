import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../game/constants';
import { checkVictory, findLand, isAdjacent } from './LandSystem';
import { applyResourceDelta } from './ResourceSystem';
import type { Army, BattlePreview, GameState, Land } from '../state/types';

function armyPower(army: Army): number {
  const unitPower =
    army.units.spearmen * 1 +
    army.units.archers * 1.25 +
    army.units.heavyInfantry * 1.8;
  return unitPower * (army.morale / 100) * (army.supply / 100);
}

function defenderPower(state: GameState, targetLand: Land): number {
  const defendingArmy = state.armies.find(
    (army) => army.kingdomId === targetLand.ownerId && army.landId === targetLand.id,
  );

  const garrison = targetLand.defense * 35;
  return garrison + (defendingArmy ? armyPower(defendingArmy) : 0);
}

export function createBattlePreview(
  state: GameState,
  attackerArmyId: string,
  targetLandId: string,
): BattlePreview | undefined {
  const army = state.armies.find((candidate) => candidate.id === attackerArmyId);
  const land = findLand(state, targetLandId);

  if (!army || !land || !isAdjacent(state, army.landId, land.id)) {
    return undefined;
  }

  const attackerPower = armyPower(army);
  const targetPower = defenderPower(state, land);
  const winChance = Math.round((attackerPower / Math.max(1, attackerPower + targetPower)) * 100);

  return {
    attackerArmyId,
    targetLandId,
    winChance,
    attackerPower: Math.round(attackerPower),
    defenderPower: Math.round(targetPower),
  };
}

export function moveArmy(state: GameState, armyId: string, targetLandId: string): boolean {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  const targetLand = findLand(state, targetLandId);

  if (!army || !targetLand || army.hasMoved) {
    return false;
  }

  if (!isAdjacent(state, army.landId, targetLandId)) {
    state.message = 'Armies can move only to adjacent lands.';
    return false;
  }

  if (targetLand.ownerId !== PLAYER_KINGDOM_ID && targetLand.ownerId !== NEUTRAL_OWNER_ID) {
    return attackLand(state, army.id, targetLand.id);
  }

  army.landId = targetLandId;
  army.hasMoved = true;
  state.awaitingMoveArmyId = undefined;
  state.message = `${army.name} moves to ${targetLand.name}.`;
  return true;
}

export function createPlayerArmy(state: GameState, heroId: string | undefined, soldiers: number): boolean {
  const available = Math.max(0, state.resources.manpower);
  const total = clamp(Math.floor(soldiers), 100, Math.max(100, available));

  if (total > state.resources.manpower) {
    state.message = 'Not enough manpower to raise that army.';
    return false;
  }

  const capital = findLand(state, 'thang-long') ?? state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (!capital) {
    state.message = 'No owned city can raise an army.';
    return false;
  }

  const id = `army-${state.armies.length + 1}-${state.turn}`;
  const army: Army = {
    id,
    kingdomId: PLAYER_KINGDOM_ID,
    name: `${state.armies.filter((candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID).length + 1} Army`,
    landId: capital.id,
    units: {
      spearmen: Math.floor(total * 0.62),
      archers: Math.floor(total * 0.28),
      heavyInfantry: Math.max(0, total - Math.floor(total * 0.62) - Math.floor(total * 0.28)),
    },
    generalHeroId: heroId,
    morale: heroId ? 82 : 70,
    supply: 88,
    hasMoved: false,
  };

  state.resources.manpower -= total;
  state.armies.push(army);

  const hero = heroId ? state.heroes.find((candidate) => candidate.id === heroId) : undefined;
  if (hero) {
    hero.assignedTo = id;
  }

  state.awaitingMoveArmyId = id;
  state.isPaused = false;
  state.message = `${army.name} raised at ${capital.name}. Tap an adjacent land to move.`;
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function attackLand(state: GameState, armyId: string, targetLandId: string): boolean {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  const targetLand = findLand(state, targetLandId);
  const preview = createBattlePreview(state, armyId, targetLandId);

  if (!army || !targetLand || !preview) {
    return false;
  }

  const victory = preview.attackerPower >= preview.defenderPower * 0.72;
  const lossRate = victory ? 0.16 : 0.32;

  army.units.spearmen = Math.max(0, Math.floor(army.units.spearmen * (1 - lossRate)));
  army.units.archers = Math.max(0, Math.floor(army.units.archers * (1 - lossRate * 0.9)));
  army.units.heavyInfantry = Math.max(0, Math.floor(army.units.heavyInfantry * (1 - lossRate * 0.75)));
  army.morale = victory ? Math.min(100, army.morale + 6) : Math.max(30, army.morale - 14);
  army.supply = Math.max(25, army.supply - 10);
  army.hasMoved = true;
  state.awaitingMoveArmyId = undefined;
  state.latestBattlePreview = undefined;

  if (victory) {
    const defeatedArmies = state.armies.filter(
      (candidate) => candidate.kingdomId === targetLand.ownerId && candidate.landId === targetLand.id,
    );
    for (const defeatedArmy of defeatedArmies) {
      defeatedArmy.landId = findRetreatLand(state, targetLand) ?? defeatedArmy.landId;
      defeatedArmy.morale = Math.max(25, defeatedArmy.morale - 18);
    }

    targetLand.ownerId = PLAYER_KINGDOM_ID;
    targetLand.loyalty = Math.max(45, targetLand.loyalty - 15);
    army.landId = targetLand.id;
    applyResourceDelta(state, { stability: targetLand.type === 'enemyCastle' ? 8 : -2 });
    state.message = `Victory at ${targetLand.name}. The land is captured.`;
    checkVictory(state);
    return true;
  }

  applyResourceDelta(state, { stability: -5 });
  state.message = `Defeat at ${targetLand.name}. The army falls back.`;
  return false;
}

function findRetreatLand(state: GameState, land: Land): string | undefined {
  return land.neighbors.find((neighborId) => {
    const neighbor = findLand(state, neighborId);
    return neighbor?.ownerId === land.ownerId;
  });
}
