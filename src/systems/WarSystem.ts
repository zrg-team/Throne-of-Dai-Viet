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
import { occupyEmptyLand } from './AcquisitionSystem';
import { checkVictory, findLand, getAcquisitionTicksRequired, getSiegeOrder, isAdjacent, refreshPlayerVisibility } from './LandSystem';
import { applyResourceDelta, canSpend, getArmyGoldUpkeep, getBarracksLevel, refreshAllLandOutputs } from './ResourceSystem';
import { getCourtBonuses } from './CourtSystem';
import { eraIndex } from './empire/MandateSystem';
import type { Army, ArmyComposition, BattlePreview, BattleStance, GameState, Land, RecruitmentOrder, SiegeOrder, UnitCounts } from '../state/types';
import { t, tickLabel } from '../i18n';

const MAX_ARMY_LEVEL = 5;

function totalUnits(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

function getArmyExperienceToNext(level: number): number {
  return 100 + (level - 1) * 60;
}

function getOwnedBarracksLevel(state: GameState): number {
  return state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .reduce((sum, land) => sum + getBarracksLevel(land), 0);
}

function getArmyLevelCap(state: GameState): number {
  return Math.min(MAX_ARMY_LEVEL, 1 + getOwnedBarracksLevel(state) + getCourtBonuses(state).armyLevelCapBonus);
}

function armyPower(state: GameState, army: Army): number {
  const unitPower =
    army.units.spearmen * 1 +
    army.units.archers * 1.25 +
    army.units.heavyInfantry * 1.8;
  const powerMult = army.kingdomId === PLAYER_KINGDOM_ID ? getCourtBonuses(state).armyPowerMult : 1;
  const levelMult = 1 + Math.max(0, army.level - 1) * 0.08;
  // Elite armies (era/barracks-unlocked royal guard) fight above their weight.
  const eliteMult = 1 + (army.elite ?? 0) * 0.18;
  // A capable general lifts the whole host — keeping veteran commanders alive matters.
  const general = army.generalHeroId ? state.heroes.find((h) => h.id === army.generalHeroId) : undefined;
  const generalMult = general ? 1 + (general.stats.martial / 100) * 0.25 : 1;
  return unitPower * (army.morale / 100) * (army.supply / 100) * powerMult * levelMult * eliteMult * generalMult;
}

/** Elite tier for a freshly-mustered army: rises with barracks and era (levy → trained → royal guard). */
function computeEliteTier(state: GameState, barracksLevel: number): number {
  const eraBonus = eraIndex(state.mandate?.era ?? 'founding') >= 2 ? 1 : 0;
  return Math.min(2, (barracksLevel >= 2 ? 1 : 0) + eraBonus);
}

/**
 * A victorious general grows in renown — martial skill climbs and, at milestones, they
 * earn a trait. Makes commanders worth protecting and gives heroes a battle arc.
 */
export function grantGeneralExperience(state: GameState, army: Army, victory: boolean): void {
  if (!victory || army.kingdomId !== PLAYER_KINGDOM_ID || !army.generalHeroId) return;
  const general = state.heroes.find((h) => h.id === army.generalHeroId);
  if (!general) return;
  general.battlesWon = (general.battlesWon ?? 0) + 1;
  if (general.battlesWon % 3 === 0 && general.stats.martial < 100) {
    general.stats.martial = Math.min(100, general.stats.martial + 4);
    general.traits ??= [];
    if (general.battlesWon >= 9 && !general.traits.includes('conqueror')) general.traits.push('conqueror');
    else if (!general.traits.includes('veteran')) general.traits.push('veteran');
  }
}

/**
 * Rock-paper-scissors between the three arms: spearmen rout heavy infantry (pikes vs
 * armour), heavy infantry crush archers (close and break them), archers shred spearmen
 * (outrange). Returns a ±multiplier on the attacker's power from how its composition
 * matches the defender's — so scouting the enemy and building a counter-force pays off.
 */
function compositionMatchup(attacker: UnitCounts, defenderArmy?: Army): number {
  if (!defenderArmy) return 1;
  const frac = (u: UnitCounts) => {
    const t = Math.max(1, u.spearmen + u.archers + u.heavyInfantry);
    return { s: u.spearmen / t, a: u.archers / t, h: u.heavyInfantry / t };
  };
  const A = frac(attacker);
  const D = frac(defenderArmy.units);
  const advantage = A.s * D.h + A.h * D.a + A.a * D.s; // we counter them
  const disadvantage = A.h * D.s + A.a * D.h + A.s * D.a; // they counter us
  return 1 + (advantage - disadvantage) * 0.4;
}

/** Heavy/archer shares for a chosen army doctrine; the remainder is spearmen. */
function compositionShares(comp: ArmyComposition, bonuses: ReturnType<typeof getCourtBonuses>): { heavyShare: number; archerShare: number } {
  switch (comp) {
    case 'spears': return { heavyShare: 0.1, archerShare: 0.2 };   // anti-cavalry wall (counters shock)
    case 'archers': return { heavyShare: 0.15, archerShare: 0.55 }; // ranged host (counters spears)
    case 'shock': return { heavyShare: 0.5, archerShare: 0.2 };    // heavy assault (counters archers)
    default:
      return {
        heavyShare: Math.min(0.28, 0.1 + bonuses.nextArmyHeavyBonus),
        archerShare: Math.min(0.45, 0.28 + bonuses.nextArmyArchersBonus),
      };
  }
}

/** Defensive terrain multiplier: mountains/hills/forests/rivers favour the defender, open plains don't. */
function terrainDefenseMultiplier(land: Land): number {
  const ts = land.terrainSummary;
  const total = Math.max(1, ts.plains + ts.fields + ts.riceFields + ts.forest + ts.mountains + ts.hills + ts.water);
  const rugged = (ts.mountains * 1.0 + ts.hills * 0.6 + ts.forest * 0.4 + ts.water * 0.7) / total;
  return 1 + Math.min(0.35, rugged * 0.5);
}

function defenderPower(state: GameState, targetLand: Land): number {
  const defendingArmy = state.armies.find(
    (army) => army.kingdomId === targetLand.ownerId && army.landId === targetLand.id,
  );

  // Walls + local militia hold a district against small raids, but a serious host can
  // only be stopped by a standing field army — so keeping an army alive matters, and
  // turtling behind walls is no longer a win button (see WarSystem rebalance).
  const garrison = (targetLand.defense * 16 + targetLand.localSoldiers * 2.5) * terrainDefenseMultiplier(targetLand);
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

  const defArmy = state.armies.find((a) => a.kingdomId === land.ownerId && a.landId === land.id);
  const attackerPower = armyPower(state, army) * compositionMatchup(army.units, defArmy);
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
    state.message = t('msg.noRoute');
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
  state.message = t('msg.marches', { army: army.name, land: targetLand?.name ?? targetLandId, ticks: totalTicks, tickLabel: tickLabel(totalTicks) });
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
      if (nextLand.ownerId === 'neutral' && !nextLand.hasVillage) {
        occupyEmptyLand(state, army.id, nextLandId);
      } else {
        attackLand(state, army.id, nextLandId);
      }
      state.movementOrders = state.movementOrders.filter((candidate) => candidate !== order);
      continue;
    }

    army.landId = nextLandId;
    if (order.path.length === 0) {
      state.movementOrders = state.movementOrders.filter((candidate) => candidate !== order);
      state.message = t('msg.arrives', { army: army.name, land: nextLand.name });
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
export function queueRecruitment(state: GameState, heroId: string, soldiers: number, rations: number, provisions: number, composition: ArmyComposition = 'balanced'): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero || hero.assignedTo) {
    state.message = t('msg.chooseCommander');
    return false;
  }

  const available = Math.max(0, state.resources.humans);
  const total = clamp(Math.floor(soldiers), 100, Math.max(100, available));
  const courtBonuses = getCourtBonuses(state);
  const suppliesCost = Math.max(5, Math.ceil((total / 130) * courtBonuses.recruitmentSupplyCostMult));
  const rationsCost = Math.max(0, Math.floor(rations));
  const provisionsCost = Math.max(0, Math.floor(provisions));

  if (total > state.resources.humans) {
    state.message = t('msg.notEnoughHumansArmy');
    return false;
  }

  if (!canSpend(state, { food: rationsCost })) {
    state.message = t('msg.needFoodArmy', { amount: rationsCost });
    return false;
  }

  if (!canSpend(state, { supplies: suppliesCost + provisionsCost })) {
    state.message = t('msg.needSuppliesArmy', { amount: suppliesCost + provisionsCost });
    return false;
  }

  const capital = findRecruitmentLand(state);
  if (!capital) {
    state.message = t('msg.noOwnedCityArmy');
    return false;
  }

  if (getRecruitmentOrder(state, capital.id)) {
    state.message = t('msg.alreadyTraining', { land: capital.name });
    return false;
  }

  const barracksLevel = getBarracksLevel(capital);
  const perTick = RECRUIT_BASE_PER_TICK * (1 + barracksLevel * RECRUIT_BARRACKS_BONUS) * courtBonuses.recruitSpeedMult;
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
    composition,
  });
  hero.assignedTo = id;
  refreshAllLandOutputs(state);
  state.message = t('msg.recruitingArmy', { total, land: capital.name, ticks: required, tickLabel: tickLabel(required) });
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
    const bonuses = getCourtBonuses(state);
    const barracksLevel = getBarracksLevel(land);
    const level = Math.min(getArmyLevelCap(state), Math.max(1, 1 + Math.floor(barracksLevel / 2) + bonuses.nextArmyLevelBonus));
    const { heavyShare, archerShare } = compositionShares(order.composition ?? 'balanced', bonuses);
    const heavy = Math.floor(total * heavyShare);
    const archers = Math.floor(total * archerShare);
    const army: Army = {
      id: order.id,
      kingdomId: PLAYER_KINGDOM_ID,
      name: `${state.armies.filter((candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID).length + 1} Army`,
      landId: land.id,
      units: {
        spearmen: Math.max(0, total - archers - heavy),
        archers,
        heavyInfantry: heavy,
      },
      generalHeroId: order.heroId,
      morale: 82,
      supply: 88,
      rations: order.rations,
      provisions: order.provisions,
      level,
      experience: 0,
      experienceToNextLevel: getArmyExperienceToNext(level),
      unpaidTicks: 0,
      elite: computeEliteTier(state, barracksLevel),
    };

    state.armies.push(army);
    consumeNextArmyModifiers(state);

    const hero = state.heroes.find((candidate) => candidate.id === order.heroId);
    if (hero) {
      hero.assignedTo = army.id;
    }

    state.selectedArmyId = army.id;
    state.isPaused = false;
    state.message = t('msg.finishedTraining', { army: army.name, land: land.name });
  }

  state.recruitmentOrders = state.recruitmentOrders.filter((order) => !completed.includes(order));
  refreshAllLandOutputs(state);
  return true;
}

/** Consumes rations/provisions for every player-owned army each tick, applying morale penalties, starvation attrition, and disbandment. */
export function progressArmyLogistics(state: GameState): boolean {
  const disbanded: Army[] = [];
  const unpaidDisbanded = new Set<string>();
  const moraleRegen = getCourtBonuses(state).armyMoraleRegen;
  const treasuryCannotPay = state.resources.gold <= 0 && state.resourceRates.gold < 0;

  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID) {
      continue;
    }

    const total = totalUnits(army);
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

    if (treasuryCannotPay && getArmyGoldUpkeep(army) > 0) {
      army.unpaidTicks = (army.unpaidTicks ?? 0) + 1;
      army.morale -= 8;
      if (army.unpaidTicks === 3) {
        army.units.spearmen = Math.floor(army.units.spearmen * 0.85);
        army.units.archers = Math.floor(army.units.archers * 0.85);
        army.units.heavyInfantry = Math.floor(army.units.heavyInfantry * 0.85);
      }
      if (army.unpaidTicks >= 5) {
        disbanded.push(army);
        unpaidDisbanded.add(army.id);
        continue;
      }
    } else {
      army.unpaidTicks = Math.max(0, (army.unpaidTicks ?? 0) - 1);
    }

    army.morale += moraleRegen + Math.max(0, army.level - 1) * 0.25;
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
    const returnedHumans = totalUnits(army);
    if (returnedHumans > 0) {
      applyResourceDelta(state, { humans: returnedHumans });
    }

    if (army.generalHeroId) {
      const hero = state.heroes.find((candidate) => candidate.id === army.generalHeroId);
      if (hero) {
        hero.assignedTo = undefined;
      }
    }

    if (state.selectedArmyId === army.id) {
      state.selectedArmyId = undefined;
    }

    state.message = unpaidDisbanded.has(army.id)
      ? t('msg.unpaidDisbanded', { army: army.name, humans: returnedHumans })
      : t('msg.starvedDisbanded', { army: army.name, humans: returnedHumans });
  }

  state.armies = state.armies.filter((army) => !disbanded.includes(army));
  refreshAllLandOutputs(state);
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function attackLand(state: GameState, armyId: string, targetLandId: string, stance: BattleStance = 'balanced'): boolean {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  const targetLand = findLand(state, targetLandId);
  const preview = createBattlePreview(state, armyId, targetLandId);

  if (!army || !targetLand || !preview) {
    return false;
  }

  if (getSiegeOrder(state, targetLandId)) {
    state.message = t('msg.alreadyUnderSiege', { land: targetLand.name });
    return false;
  }

  // Honest, probabilistic combat: the win chance shown is the actual chance. The
  // chosen stance trades odds against casualties — Assault presses harder (better
  // odds, bloodier), Cautious holds back (worse odds, fewer losses).
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const stanceMod = stance === 'assault'
    ? { pow: 1.18, loss: 1.4 }
    : stance === 'cautious'
      ? { pow: 0.85, loss: 0.6 }
      : { pow: 1, loss: 1 };
  const attAdj = preview.attackerPower * stanceMod.pow;
  const effectiveChance = clamp(Math.round((attAdj / (attAdj + preview.defenderPower)) * 100), 10, 90);
  const victory = Math.random() * 100 < effectiveChance;
  const margin = Math.abs(effectiveChance - 50) / 50; // 0 = coin-flip, 1 = lopsided
  const lossRate = clamp(((victory ? 0.14 : 0.34) + (1 - margin) * 0.1) * stanceMod.loss, 0.08, 0.6);
  const supplyCost = Math.max(2, Math.ceil((totalUnits(army) / 420) * getCourtBonuses(state).battleSupplyCostMult));

  army.units.spearmen = Math.max(0, Math.floor(army.units.spearmen * (1 - lossRate)));
  army.units.archers = Math.max(0, Math.floor(army.units.archers * (1 - lossRate * 0.9)));
  army.units.heavyInfantry = Math.max(0, Math.floor(army.units.heavyInfantry * (1 - lossRate * 0.75)));
  army.morale = victory ? Math.min(100, army.morale + 6) : Math.max(30, army.morale - 14);
  army.supply = Math.max(25, army.supply - 10);
  state.latestBattlePreview = undefined;
  applyResourceDelta(state, { supplies: -supplyCost });
  awardBattleExperience(state, army, preview.defenderPower, victory);
  grantGeneralExperience(state, army, victory);

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
    state.message = t('msg.victoryAt', { land: targetLand.name, ticks: siegeTicks, tickLabel: tickLabel(siegeTicks) });
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

  state.message = t('msg.defeatAt', { land: targetLand.name });
  state.latestBattleResult = {
    attackerArmyId: armyId,
    targetLandId,
    victory: false,
    attackerPower: preview.attackerPower,
    defenderPower: preview.defenderPower,
  };
  return false;
}

export function disbandArmy(state: GameState, armyId: string): boolean {
  const army = state.armies.find((candidate) => candidate.id === armyId && candidate.kingdomId === PLAYER_KINGDOM_ID);
  if (!army) {
    return false;
  }

  const returnedHumans = totalUnits(army);
  applyResourceDelta(state, { humans: returnedHumans });
  if (army.generalHeroId) {
    const hero = state.heroes.find((candidate) => candidate.id === army.generalHeroId);
    if (hero) {
      hero.assignedTo = undefined;
    }
  }

  state.movementOrders = state.movementOrders.filter((order) => order.armyId !== army.id);
  state.siegeOrders = state.siegeOrders.filter((order) => order.armyId !== army.id);
  state.armies = state.armies.filter((candidate) => candidate.id !== army.id);
  if (state.selectedArmyId === army.id) {
    state.selectedArmyId = undefined;
  }
  if (state.latestBattlePreview?.attackerArmyId === army.id) {
    state.latestBattlePreview = undefined;
  }
  state.message = t('msg.disbands', { army: army.name, humans: returnedHumans });
  refreshAllLandOutputs(state);
  return true;
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
  state.message = t('msg.withdraws', { army: army.name, land: land.name });
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
    state.message = t('msg.landFalls', { land: land.name });
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

function findRecruitmentLand(state: GameState): Land | undefined {
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  return owned
    .slice()
    .sort((a, b) => {
      const aScore = (a.type === 'castle' ? 100 : 0) + getBarracksLevel(a) * 20 + (a.terrainSummary.fortress + a.terrainSummary.shrine);
      const bScore = (b.type === 'castle' ? 100 : 0) + getBarracksLevel(b) * 20 + (b.terrainSummary.fortress + b.terrainSummary.shrine);
      return bScore - aScore;
    })[0];
}

function awardBattleExperience(state: GameState, army: Army, defenderPowerValue: number, victory: boolean): void {
  if (army.kingdomId !== PLAYER_KINGDOM_ID) {
    return;
  }

  const gain = Math.max(8, Math.ceil((defenderPowerValue / 80) * (victory ? 1 : 0.35) * getCourtBonuses(state).armyXpMult));
  army.experience += gain;
  const cap = getArmyLevelCap(state);
  while (army.level < cap && army.experience >= army.experienceToNextLevel) {
    army.experience -= army.experienceToNextLevel;
    army.level += 1;
    army.experienceToNextLevel = getArmyExperienceToNext(army.level);
    army.morale = Math.min(100, army.morale + 5);
  }
}

function consumeNextArmyModifiers(state: GameState): void {
  state.activeCourtModifiers = state.activeCourtModifiers.filter((modifier) => {
    return !modifier.nextArmyLevelBonus && !modifier.nextArmyArchersBonus && !modifier.nextArmyHeavyBonus;
  });
}
