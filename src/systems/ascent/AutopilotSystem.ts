import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  AUTOBUILD_GOLD_RESERVE,
  DEFENSIVE_POSTURE_RATIO,
  MARCH_MIN_WIN_CHANCE,
  MIN_ARMY_SOLDIERS,
  RECRUIT_HUMAN_RESERVE,
  REMNANT_SHARE,
  recruitSoldiers,
  SUPPLY_FOOD_RESERVE,
  SUPPLY_STORE_RESERVE,
  SUPPLY_TICKS_HELD,
  targetArmyCount,
} from '../../game/ascentConfig';
import {
  buildDistrictBuilding,
  getBuildOptions,
  getBuildOrder,
  getUpgradeOptions,
  upgradeDistrictBuilding,
  applyResourceDelta,
  type BuildOption,
  type UpgradeOption,
} from '../ResourceSystem';
import { disbandArmy, getRecruitmentOrder, issueMoveOrder, queueRecruitment } from '../WarSystem';
import { frontWinChance } from './MarchOrderSystem';
import type { GameState, Land, LandBuildingType } from '../../state/types';

/**
 * The "auto-fire" layer. Every tick this files the orders a human player would file by
 * hand — and *only* through the public order APIs (`buildDistrictBuilding`,
 * `upgradeDistrictBuilding`, `queueRecruitment`, `issueMoveOrder`). It never mutates
 * economy or combat state directly, so all the existing math is reused unchanged and a
 * balance change in ResourceSystem/WarSystem automatically applies here too.
 *
 * One order of each kind per tick, so the realm grows at a readable pace rather than
 * emptying the treasury the instant it can afford something.
 */

/** Buildings worth extra weight when a wave is about to outclass us. */
const DEFENSIVE_BUILDINGS: LandBuildingType[] = ['wall', 'tower', 'barracks'];

function playerLands(state: GameState): Land[] {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

/** Are we outmatched by the incoming wave? Tilts the build priority toward defence. */
function underPressure(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent || ascent.power <= 0) return false;
  return ascent.threat / ascent.power > DEFENSIVE_POSTURE_RATIO;
}

/**
 * Net value of a building per season: what it produces, minus what it costs to keep,
 * weighted toward the resources that convert into military strength.
 */
function optionScore(option: BuildOption | UpgradeOption, defensive: boolean, isCapital: boolean): number {
  const out = option.output;
  const keep = option.upkeep;
  const produced = (out.gold ?? 0) * 3 + (out.food ?? 0) + (out.supplies ?? 0) * 2.5 + (out.humans ?? 0) * 0.4;
  const consumed = (keep.gold ?? 0) * 3 + (keep.supplies ?? 0) * 2.5 + (keep.food ?? 0);
  // Fortifications always carry weight, not only under pressure: home defence in this mode
  // is the walls' job, which is what frees the field host to stay on the offensive.
  //
  // The capital is weighted hardest of all, because losing it ends the run outright while
  // losing any other province is a setback. Invaders with conquest intent march straight at
  // it, and an unwalled seat falls to the fourth wave no matter how much ground was taken.
  const base = DEFENSIVE_BUILDINGS.includes(option.type) ? (defensive ? 18 : 7) : 0;
  const defenceBonus = isCapital ? base * 3 : base;
  // Cheaper and faster options win ties, so early ticks are never idle.
  return produced - consumed + defenceBonus - option.ticks * 0.5;
}

/** Files at most one build order: the best-scoring affordable building across the realm. */
function autoBuild(state: GameState): boolean {
  const defensive = underPressure(state);
  let best: { landId: string; type: LandBuildingType; score: number } | undefined;

  for (const land of playerLands(state)) {
    if (getBuildOrder(state, land.id)) continue;
    const isCapital = land.id === state.ascent?.capitalLandId;
    for (const option of getBuildOptions(state, land)) {
      if (!option.canBuild) continue;
      const score = optionScore(option, defensive, isCapital);
      if (!best || score > best.score) {
        best = { landId: land.id, type: option.type, score };
      }
    }
  }

  if (!best) return false;
  return buildDistrictBuilding(state, best.landId, best.type);
}

/** Files at most one upgrade order. Only runs when there was nothing new worth building. */
function autoUpgrade(state: GameState): boolean {
  const defensive = underPressure(state);
  let best: { landId: string; index: number; score: number } | undefined;

  for (const land of playerLands(state)) {
    if (getBuildOrder(state, land.id)) continue;
    const isCapital = land.id === state.ascent?.capitalLandId;
    const options = getUpgradeOptions(state, land);
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (!option.canUpgrade) continue;
      const score = optionScore(option, defensive, isCapital);
      if (!best || score > best.score) {
        best = { landId: land.id, index, score };
      }
    }
  }

  if (!best) return false;
  return upgradeDistrictBuilding(state, best.landId, best.index);
}

function armySize(army: { units: { spearmen: number; archers: number; heavyInfantry: number } }): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

/**
 * Sends shattered hosts home.
 *
 * Armies in this game only ever shrink — nothing heals them — so a fifty-soldier remnant is
 * militarily useless yet still counts against the target host number, which quietly blocks
 * raising a fresh one forever. `disbandArmy` returns its survivors to the population, so the
 * levy going home is also how manpower gets recycled into the next real host.
 */
function autoDisbandRemnants(state: GameState): void {
  const remnants = state.armies.filter(
    (army) =>
      army.kingdomId === PLAYER_KINGDOM_ID &&
      armySize(army) < MIN_ARMY_SOLDIERS * REMNANT_SHARE &&
      !state.siegeOrders.some((order) => order.armyId === army.id),
  );
  for (const army of remnants) {
    disbandArmy(state, army.id);
  }
}

/** A hero with no posting, best martial first — the natural commander for a new host. */
export function findFreeCommander(state: GameState): string | undefined {
  return state.heroes
    .filter((hero) => !hero.assignedTo)
    .sort((a, b) => b.stats.martial - a.stats.martial)[0]?.id;
}

/**
 * Keeps the realm at its target number of standing hosts. `queueRecruitment` handles the
 * land choice, the cost, and the muster timer; we only decide *whether* and *how big*.
 */
function autoRecruit(state: GameState): boolean {
  const lands = playerLands(state);
  const inFlight = state.recruitmentOrders.length;
  // Only hosts that could actually fight count toward the target.
  const standing = state.armies.filter(
    (army) => army.kingdomId === PLAYER_KINGDOM_ID && armySize(army) >= MIN_ARMY_SOLDIERS * REMNANT_SHARE,
  ).length;
  if (standing + inFlight >= targetArmyCount(lands.length)) return false;

  // One muster at a time per land; bail early rather than spam a failing call.
  if (lands.some((land) => getRecruitmentOrder(state, land.id))) return false;

  const commanderId = findFreeCommander(state);
  if (!commanderId) return false;

  const affordable = state.resources.humans - RECRUIT_HUMAN_RESERVE;
  if (affordable < MIN_ARMY_SOLDIERS) return false;

  // Muster with as much of a baggage train as the realm can actually spare — demanding a
  // full one up front makes `queueRecruitment` fail outright in a poor realm, so no host
  // ever gets raised at all. `autoResupply` tops it up over the following seasons.
  const soldiers = recruitSoldiers(affordable);
  const wantRations = Math.max(1, Math.ceil(soldiers / 100)) * SUPPLY_TICKS_HELD;
  const wantProvisions = Math.max(1, Math.ceil(soldiers / 150)) * SUPPLY_TICKS_HELD;
  const rations = Math.min(wantRations, Math.max(0, Math.floor(state.resources.food - SUPPLY_FOOD_RESERVE)));
  const provisions = Math.min(wantProvisions, Math.max(0, Math.floor(state.resources.supplies - SUPPLY_STORE_RESERVE)));
  return queueRecruitment(state, commanderId, soldiers, rations, provisions);
}

/**
 * Marches idle hosts at the designated front. `progressMovementOrders` runs the arrival
 * battle and pushes the siege by itself, so this is the whole of the offensive loop —
 * there is no new combat code anywhere in this mode.
 */
function autoMarch(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  ascent.frontBlocked = false;
  if (!ascent.frontLandId) return false;

  const front = state.lands.find((land) => land.id === ascent.frontLandId);
  if (!front || front.ownerId === PLAYER_KINGDOM_ID) {
    // The front fell (or was taken some other way) — clear it so a new March Order is asked for.
    ascent.frontLandId = undefined;
    return false;
  }

  // A general will not throw the host at walls it cannot break. Holding here is what makes
  // the power curve the thing that opens the map: keep compounding and the odds come to you.
  if (frontWinChance(state) < MARCH_MIN_WIN_CHANCE) {
    ascent.frontBlocked = true;
    return false;
  }

  const idle = state.armies.filter(
    (army) =>
      army.kingdomId === PLAYER_KINGDOM_ID &&
      !state.movementOrders.some((order) => order.armyId === army.id) &&
      !state.siegeOrders.some((order) => order.armyId === army.id),
  );
  if (idle.length === 0) return false;

  // Always leave one host at home once there are two to split. The capital falling ends
  // the run, so committing the last defender to an offensive is never worth the ground.
  const garrisonKeep = idle.length > 1 ? 1 : 0;
  const marchers = idle.slice(0, Math.max(1, idle.length - garrisonKeep));

  let marched = false;
  for (const army of marchers) {
    if (issueMoveOrder(state, army.id, front.id)) {
      marched = true;
    }
  }

  // No host could find a route — the realm's territory no longer connects to this front
  // (a province between here and there changed hands). Flag it so a fresh March Order is
  // raised; otherwise the run stays pinned on an unreachable target forever, quietly
  // stops expanding, and the player is never told why.
  if (!marched) {
    ascent.frontBlocked = true;
  }
  return marched;
}

/**
 * Keeps hosts fed.
 *
 * `queueRecruitment` hands an army a one-off stock of rations and provisions and nothing in
 * the game ever tops it up — in the hand-played modes an army is a short campaign, not a
 * standing force. An endless run cannot work that way: without this the host starves inside
 * ten ticks, attrition shreds it, and the realm loses every province it just took.
 *
 * Resupplying here also gives the economy pillar a direct line to the military one: food and
 * supply income is what keeps hosts in the field, so an economy card really does buy war.
 */
function autoResupply(state: GameState): void {
  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;

    const total = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
    if (total <= 0) continue;

    // Mirrors the burn rate in `progressArmyLogistics`.
    const rationUse = Math.max(1, Math.ceil(total / 100));
    const provisionUse = Math.max(1, Math.ceil(total / 150));
    const wantRations = rationUse * SUPPLY_TICKS_HELD;
    const wantProvisions = provisionUse * SUPPLY_TICKS_HELD;

    const foodShort = Math.max(0, wantRations - army.rations);
    const suppliesShort = Math.max(0, wantProvisions - army.provisions);
    if (foodShort <= 0 && suppliesShort <= 0) continue;

    // Never resupply into famine: the realm's own stores come first.
    const food = Math.min(foodShort, Math.max(0, state.resources.food - SUPPLY_FOOD_RESERVE));
    const supplies = Math.min(suppliesShort, Math.max(0, state.resources.supplies - SUPPLY_STORE_RESERVE));
    if (food <= 0 && supplies <= 0) continue;

    applyResourceDelta(state, { food: -food, supplies: -supplies });
    army.rations += food;
    army.provisions += supplies;
  }
}

/**
 * Splits the roster into an offensive host and home defenders.
 *
 * Hosts marching on the front or holding a siege are explicitly NOT put under auto-command:
 * `tickAutoDefend` re-targets any idle auto-command army at the nearest threatened district,
 * which otherwise yanks the attacking host home the moment it arrives and sends it
 * ping-ponging between the front and the capital forever, conquering nothing.
 *
 * Everything else holds full command so raids get intercepted with no player input. The
 * `pendingBattle` safety net in the tick covers the offensive host, whose battles would
 * otherwise raise an empire-mode modal this mode does not render.
 */
function autoDefend(state: GameState): void {
  const mine = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);

  // While a front is set, the strongest host stays committed to it even between orders.
  // Deciding purely from live orders leaves it briefly idle on arrival, which is all
  // `tickAutoDefend` needs to drag it home — and the two then trade it back and forth
  // every tick while the campaign goes nowhere.
  const spearhead = state.ascent?.frontLandId
    ? mine.slice().sort((a, b) => armySize(b) - armySize(a))[0]?.id
    : undefined;

  for (const army of mine) {
    const onOffensive =
      army.id === spearhead ||
      state.movementOrders.some((order) => order.armyId === army.id) ||
      state.siegeOrders.some((order) => order.armyId === army.id);
    army.autoDefend = !onOffensive;
  }
}

export function tickAscentAutopilot(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  autoDisbandRemnants(state);

  if (autoRecruit(state)) {
    ascent.autopilotStats.recruits += 1;
  }

  // Building spends gold that a reroll might want, so leave a small float.
  if (state.resources.gold > AUTOBUILD_GOLD_RESERVE) {
    if (autoBuild(state)) {
      ascent.autopilotStats.builds += 1;
    } else if (autoUpgrade(state)) {
      ascent.autopilotStats.upgrades += 1;
    }
  }

  autoResupply(state);

  if (autoMarch(state)) {
    ascent.autopilotStats.marches += 1;
  }

  autoDefend(state);
}
