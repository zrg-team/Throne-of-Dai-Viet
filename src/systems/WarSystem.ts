import { PLAYER_KINGDOM_ID } from '../game/constants';
import { getLegTicks } from '../game/movementConfig';
import {
  ARMY_LOW_RATION_TICKS,
  ARMY_MORALE_LOSS_LOW_RATIONS,
  ARMY_MORALE_LOSS_NO_PROVISIONS,
  ARMY_MORALE_LOSS_NO_RATIONS,
  ARMY_PROVISION_USE_PER_150,
  ARMY_RATION_USE_PER_100,
  ARMY_STARVATION_ATTRITION,
  RECRUIT_BASE_PER_TICK,
  RECRUIT_BARRACKS_BONUS,
} from '../game/gameplayConfig';
import { checkVictory, findLand, getAcquisitionTicksRequired, getSiegeOrder, isAdjacent, refreshPlayerVisibility } from './LandSystem';
import { applyResourceDelta, canSpend, getBarracksLevel, refreshAllLandOutputs } from './ResourceSystem';
import { getCourtBonuses } from './CourtSystem';
import type { Army, BattlePreview, GameState, Land, RecruitmentOrder, SiegeOrder } from '../state/types';

function armyPower(state: GameState, army: Army): number {
  const unitPower =
    army.units.spearmen * 1 +
    army.units.archers * 1.25 +
    army.units.heavyInfantry * 1.8;
  const powerMult = army.kingdomId === PLAYER_KINGDOM_ID ? getCourtBonuses(state).armyPowerMult : 1;
  return unitPower * (army.morale / 100) * (army.supply / 100) * powerMult;
}

function defenderPower(state: GameState, targetLand: Land): number {
  const defendingArmy = state.armies.find(
    (army) => army.kingdomId === targetLand.ownerId && army.landId === targetLand.id,
  );

  const garrison = targetLand.defense * 35;
  return garrison + (defendingArmy ? armyPower(state, defendingArmy) : 0);
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

  const attackerPower = armyPower(state, army);
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

/**
 * Shortest path of land ids from `fromLandId` to `toLandId`, excluding `fromLandId`
 * (so the last entry is always `toLandId`). Every land along the way except the
 * destination must belong to the player, since marching through hostile or
 * unclaimed territory isn't allowed - the destination itself may be neutral or
 * enemy-owned and is resolved as a battle on arrival. Returns undefined if no
 * such route exists.
 */
export function findLandPath(state: GameState, fromLandId: string, toLandId: string): string[] | undefined {
  if (fromLandId === toLandId) {
    return undefined;
  }

  const cameFrom = new Map<string, string>();
  const visited = new Set<string>([fromLandId]);
  const queue: string[] = [fromLandId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const land = findLand(state, current);
    if (!land) {
      continue;
    }

    for (const neighborId of land.neighbors) {
      if (visited.has(neighborId)) {
        continue;
      }
      visited.add(neighborId);
      cameFrom.set(neighborId, current);

      if (neighborId === toLandId) {
        const path: string[] = [neighborId];
        let step = current;
        while (step !== fromLandId) {
          path.unshift(step);
          step = cameFrom.get(step) as string;
        }
        return path;
      }

      const neighborLand = findLand(state, neighborId);
      if (neighborLand?.ownerId === PLAYER_KINGDOM_ID) {
        queue.push(neighborId);
      }
    }
  }

  return undefined;
}

/** Total ticks an army would need to march the given path, leg by leg. */
function getTotalPathTicks(state: GameState, army: Army, path: string[]): number {
  return path.reduce((sum, landId) => {
    const land = findLand(state, landId);
    return sum + (land ? getLegTicks(army, land) : 0);
  }, 0);
}

/**
 * Issues a march order for `armyId` toward `targetLandId`, replacing any order
 * already in progress (re-routing from the army's current position). The army
 * advances one land per leg via `progressMovementOrders`, with the per-leg
 * duration determined by the army's speed and the target land's terrain.
 */
export function issueMoveOrder(state: GameState, armyId: string, targetLandId: string): boolean {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army) {
    return false;
  }

  const path = findLandPath(state, army.landId, targetLandId);
  if (!path) {
    state.message = 'No route to that land through your territory.';
    return false;
  }

  state.movementOrders = state.movementOrders.filter((order) => order.armyId !== armyId);

  const firstLand = findLand(state, path[0]);
  if (!firstLand) {
    return false;
  }

  state.movementOrders.push({
    armyId,
    path,
    progress: 0,
    legRequired: getLegTicks(army, firstLand),
  });

  const targetLand = findLand(state, targetLandId);
  const totalTicks = getTotalPathTicks(state, army, path);
  state.selectedArmyId = undefined;
  state.message = `${army.name} marches toward ${targetLand?.name ?? targetLandId} (${totalTicks} ${totalTicks === 1 ? 'tick' : 'ticks'}).`;
  return true;
}

/** Advances every in-progress march by one tick, moving armies and resolving arrivals/battles. */
export function progressMovementOrders(state: GameState): boolean {
  let changed = false;

  for (const order of [...state.movementOrders]) {
    const army = state.armies.find((candidate) => candidate.id === order.armyId);
    if (!army) {
      state.movementOrders = state.movementOrders.filter((candidate) => candidate !== order);
      continue;
    }

    order.progress += 1;
    if (order.progress < order.legRequired) {
      continue;
    }

    changed = true;
    const nextLandId = order.path.shift() as string;
    order.progress = 0;
    const nextLand = findLand(state, nextLandId);
    if (!nextLand) {
      state.movementOrders = state.movementOrders.filter((candidate) => candidate !== order);
      continue;
    }

    if (nextLand.ownerId !== PLAYER_KINGDOM_ID) {
      attackLand(state, army.id, nextLandId);
      state.movementOrders = state.movementOrders.filter((candidate) => candidate !== order);
      continue;
    }

    army.landId = nextLandId;
    if (order.path.length === 0) {
      state.movementOrders = state.movementOrders.filter((candidate) => candidate !== order);
      state.message = `${army.name} arrives at ${nextLand.name}.`;
    } else {
      const nextTarget = findLand(state, order.path[0]);
      order.legRequired = nextTarget ? getLegTicks(army, nextTarget) : 1;
    }
  }

  return changed;
}

export function getRecruitmentOrder(state: GameState, landId: string) {
  return state.recruitmentOrders.find((order) => order.landId === landId);
}

/**
 * Reserves the humans/supplies for a new army and queues a `RecruitmentOrder`
 * that gathers soldiers over several ticks. Barracks at the recruiting
 * district reduce the time required - see `progressRecruitmentOrders`.
 */
export function queueRecruitment(state: GameState, heroId: string, soldiers: number, rations: number, provisions: number): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero || hero.assignedTo) {
    state.message = 'Choose a commander before creating an army.';
    return false;
  }

  const available = Math.max(0, state.resources.humans);
  const total = clamp(Math.floor(soldiers), 100, Math.max(100, available));
  const suppliesCost = Math.max(8, Math.ceil(total / 130));
  const rationsCost = Math.max(0, Math.floor(rations));
  const provisionsCost = Math.max(0, Math.floor(provisions));

  if (total > state.resources.humans) {
    state.message = 'Not enough humans to raise that army.';
    return false;
  }

  if (!canSpend(state, { food: rationsCost })) {
    state.message = `Need ${rationsCost} food to send with that army.`;
    return false;
  }

  if (!canSpend(state, { supplies: suppliesCost + provisionsCost })) {
    state.message = `Need ${suppliesCost + provisionsCost} supplies to equip and provision that army.`;
    return false;
  }

  const capital = findLand(state, 'thang-long') ?? state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (!capital) {
    state.message = 'No owned city can raise an army.';
    return false;
  }

  if (getRecruitmentOrder(state, capital.id)) {
    state.message = `${capital.name} is already training a new army.`;
    return false;
  }

  const barracksLevel = getBarracksLevel(capital);
  const perTick = RECRUIT_BASE_PER_TICK * (1 + barracksLevel * RECRUIT_BARRACKS_BONUS) * getCourtBonuses(state).recruitSpeedMult;
  const required = Math.max(1, Math.ceil(total / perTick));

  applyResourceDelta(state, { humans: -total, food: -rationsCost, supplies: -(suppliesCost + provisionsCost) });

  const id = `army-${state.armies.length + state.recruitmentOrders.length + 1}-${state.turn}`;
  state.recruitmentOrders.push({
    id,
    landId: capital.id,
    heroId,
    totalSoldiers: total,
    rations: rationsCost,
    provisions: provisionsCost,
    progress: 0,
    required,
  });
  hero.assignedTo = id;
  refreshAllLandOutputs(state);
  state.message = `Recruiting ${total} soldiers at ${capital.name}. Ready in ${required} ${required === 1 ? 'tick' : 'ticks'}.`;
  return true;
}

/** Advances every in-progress recruitment by one tick, mustering the army once `required` ticks pass. */
export function progressRecruitmentOrders(state: GameState): boolean {
  const completed: RecruitmentOrder[] = [];

  for (const order of state.recruitmentOrders) {
    order.progress += 1;
    if (order.progress >= order.required) {
      completed.push(order);
    }
  }

  if (completed.length === 0) {
    return false;
  }

  for (const order of completed) {
    const land = findLand(state, order.landId);
    if (!land) {
      continue;
    }

    const total = order.totalSoldiers;
    const army: Army = {
      id: order.id,
      kingdomId: PLAYER_KINGDOM_ID,
      name: `${state.armies.filter((candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID).length + 1} Army`,
      landId: land.id,
      units: {
        spearmen: Math.floor(total * 0.62),
        archers: Math.floor(total * 0.28),
        heavyInfantry: Math.max(0, total - Math.floor(total * 0.62) - Math.floor(total * 0.28)),
      },
      generalHeroId: order.heroId,
      morale: 82,
      supply: 88,
      rations: order.rations,
      provisions: order.provisions,
    };

    state.armies.push(army);

    const hero = state.heroes.find((candidate) => candidate.id === order.heroId);
    if (hero) {
      hero.assignedTo = army.id;
    }

    state.selectedArmyId = army.id;
    state.isPaused = false;
    state.message = `${army.name} finished training at ${land.name}.`;
  }

  state.recruitmentOrders = state.recruitmentOrders.filter((order) => !completed.includes(order));
  refreshAllLandOutputs(state);
  return true;
}

/** Consumes rations/provisions for every player-owned army each tick, applying morale penalties, starvation attrition, and disbandment. */
export function progressArmyLogistics(state: GameState): boolean {
  const disbanded: Army[] = [];
  const moraleRegen = getCourtBonuses(state).armyMoraleRegen;

  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID) {
      continue;
    }

    const total = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
    if (total <= 0) {
      disbanded.push(army);
      continue;
    }

    const rationUse = Math.max(1, Math.ceil(total / 100) * ARMY_RATION_USE_PER_100);
    const provisionUse = Math.max(1, Math.ceil(total / 150) * ARMY_PROVISION_USE_PER_150);

    army.rations = Math.max(0, army.rations - rationUse);
    army.provisions = Math.max(0, army.provisions - provisionUse);

    if (army.rations <= 0) {
      army.morale -= ARMY_MORALE_LOSS_NO_RATIONS;
      army.units.spearmen = Math.floor(army.units.spearmen * (1 - ARMY_STARVATION_ATTRITION));
      army.units.archers = Math.floor(army.units.archers * (1 - ARMY_STARVATION_ATTRITION));
      army.units.heavyInfantry = Math.floor(army.units.heavyInfantry * (1 - ARMY_STARVATION_ATTRITION));
    } else if (army.rations < rationUse * ARMY_LOW_RATION_TICKS) {
      army.morale -= ARMY_MORALE_LOSS_LOW_RATIONS;
    }

    if (army.provisions <= 0) {
      army.morale -= ARMY_MORALE_LOSS_NO_PROVISIONS;
    }

    army.morale += moraleRegen;
    army.morale = Math.min(100, Math.max(0, army.morale));

    const remaining = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
    if (remaining <= 0 || army.morale <= 0) {
      disbanded.push(army);
    }
  }

  if (disbanded.length === 0) {
    return false;
  }

  for (const army of disbanded) {
    if (army.generalHeroId) {
      const hero = state.heroes.find((candidate) => candidate.id === army.generalHeroId);
      if (hero) {
        hero.assignedTo = undefined;
      }
    }

    if (state.selectedArmyId === army.id) {
      state.selectedArmyId = undefined;
    }

    state.message = `${army.name} has starved and disbanded.`;
  }

  state.armies = state.armies.filter((army) => !disbanded.includes(army));
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

  if (getSiegeOrder(state, targetLandId)) {
    state.message = `${targetLand.name} is already under siege.`;
    return false;
  }

  const victory = preview.attackerPower >= preview.defenderPower * 0.72;
  const lossRate = victory ? 0.16 : 0.32;
  const supplyCost = Math.max(4, Math.ceil((army.units.spearmen + army.units.archers + army.units.heavyInfantry) / 420));

  army.units.spearmen = Math.max(0, Math.floor(army.units.spearmen * (1 - lossRate)));
  army.units.archers = Math.max(0, Math.floor(army.units.archers * (1 - lossRate * 0.9)));
  army.units.heavyInfantry = Math.max(0, Math.floor(army.units.heavyInfantry * (1 - lossRate * 0.75)));
  army.morale = victory ? Math.min(100, army.morale + 6) : Math.max(30, army.morale - 14);
  army.supply = Math.max(25, army.supply - 10);
  state.latestBattlePreview = undefined;
  applyResourceDelta(state, { supplies: -supplyCost });

  if (victory) {
    const defeatedArmies = state.armies.filter(
      (candidate) => candidate.kingdomId === targetLand.ownerId && candidate.landId === targetLand.id,
    );
    for (const defeatedArmy of defeatedArmies) {
      defeatedArmy.landId = findRetreatLand(state, targetLand) ?? defeatedArmy.landId;
      defeatedArmy.morale = Math.max(25, defeatedArmy.morale - 18);
    }

    const fromLandId = army.landId;
    army.landId = targetLand.id;
    const siegeTicks = getAcquisitionTicksRequired(targetLand);
    state.siegeOrders.push({
      landId: targetLand.id,
      armyId: army.id,
      attackerKingdomId: army.kingdomId,
      fromLandId,
      progress: 0,
      required: siegeTicks,
    });
    state.message = `Victory at ${targetLand.name}. The army besieges the district (${siegeTicks} ${siegeTicks === 1 ? 'tick' : 'ticks'} to fall).`;
    state.latestBattleResult = {
      attackerArmyId: armyId,
      targetLandId,
      victory: true,
      attackerPower: preview.attackerPower,
      defenderPower: preview.defenderPower,
      siegeTicks,
    };
    return true;
  }

  state.message = `Defeat at ${targetLand.name}. The army falls back.`;
  state.latestBattleResult = {
    attackerArmyId: armyId,
    targetLandId,
    victory: false,
    attackerPower: preview.attackerPower,
    defenderPower: preview.defenderPower,
  };
  return false;
}

/** Withdraws a besieging army back to the land it marched from, abandoning the siege. */
export function cancelSiege(state: GameState, armyId: string, landId: string): boolean {
  const order = state.siegeOrders.find((candidate) => candidate.armyId === armyId && candidate.landId === landId);
  const army = state.armies.find((candidate) => candidate.id === armyId);
  const land = findLand(state, landId);

  if (!order || !army || !land) {
    return false;
  }

  state.siegeOrders = state.siegeOrders.filter((candidate) => candidate !== order);
  army.landId = order.fromLandId;
  state.message = `${army.name} withdraws from the siege of ${land.name}.`;
  return true;
}

/** Advances every in-progress siege by one tick, capturing the land once `required` ticks pass. */
export function progressSiegeOrders(state: GameState): boolean {
  const completed: SiegeOrder[] = [];

  for (const order of state.siegeOrders) {
    order.progress += 1;
    if (order.progress >= order.required) {
      completed.push(order);
    }
  }

  if (completed.length === 0) {
    return false;
  }

  for (const order of completed) {
    const land = findLand(state, order.landId);
    if (!land) {
      continue;
    }

    land.ownerId = order.attackerKingdomId;
    land.loyalty = Math.max(45, land.loyalty - 15);
    state.message = `${land.name} falls! The district is captured.`;
  }

  state.siegeOrders = state.siegeOrders.filter((order) => !completed.includes(order));
  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  checkVictory(state);
  return true;
}

function findRetreatLand(state: GameState, land: Land): string | undefined {
  return land.neighbors.find((neighborId) => {
    const neighbor = findLand(state, neighborId);
    return neighbor?.ownerId === land.ownerId;
  });
}
