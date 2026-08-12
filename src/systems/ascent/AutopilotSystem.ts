import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  AUTOBUILD_GOLD_RESERVE,
  DEFENSIVE_POSTURE_RATIO,
  MARCH_MIN_WIN_CHANCE,
  MIN_ARMY_SOLDIERS,
  RECRUIT_HUMAN_RESERVE,
  REMNANT_SHARE,
  recruitSoldiers,
  AUTO_CLAIM_INTERVAL_TICKS,
  GOLD_GLUT_SEASONS,
  SCARCITY_CRISIS_MULT,
  SCARCITY_CRISIS_SEASONS,
  SCARCITY_WARNING_MULT,
  SCARCITY_WARNING_SEASONS,
  AUTO_CLAIM_MAX_ORDERS,
  AUTO_CLAIM_MIN_CHANCE,
  AUTO_CLAIM_TREASURY_SHARE,
  MIN_MUSTER_SUPPLY_SHARE,
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
import { bribeLand, getBribeSuccessChance, getGoldBribeCost } from '../AcquisitionSystem';
import { disbandArmy, getRecruitmentOrder, issueMoveOrder, queueRecruitment } from '../WarSystem';
import { frontWinChance } from './ConquestSystem';
import { chargeAmbition } from './AmbitionSystem';
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
 * What one unit per season of each resource is worth to the realm *right now*.
 *
 * The fixed weights this replaces were the single most damaging numbers in the mode. Gold
 * scored 3 and food scored 1, so the autopilot built markets in preference to farms at every
 * opportunity — and a realm that optimises for coin while its granary empties produces exactly
 * what measurement found across every seed: food pinned at zero for hundreds of consecutive
 * seasons, `collectPlayerIncome` docking every host 4 morale and 6 supply per tick, population
 * shrinking, defence quietly collapsing, and a treasury of several hundred thousand gold with
 * nothing to buy. The famine and the idle fortune were never two problems. They were one
 * scoring line.
 *
 * Weighting by scarcity corrects both directions at once: whatever the realm is running out of
 * becomes the most valuable thing it can build, and whatever it is drowning in stops dominating
 * the choice. It also makes the economy self-correcting rather than one-way, which is what lets
 * a realm recover from a bad stretch instead of spiralling.
 */
function outputWeights(state: GameState): Record<'gold' | 'food' | 'supplies' | 'humans', number> {
  const rates = state.resourceRates;
  const held = state.resources;

  /** Seasons of buffer left at the current burn rate; Infinity while a resource is growing. */
  const runway = (stock: number, rate: number): number =>
    rate >= 0 ? Number.POSITIVE_INFINITY : Math.max(0, stock) / Math.max(1, -rate);

  const byScarcity = (base: number, stock: number, rate: number): number => {
    const seasons = runway(stock, rate);
    if (seasons <= SCARCITY_CRISIS_SEASONS) return base * SCARCITY_CRISIS_MULT;
    if (seasons <= SCARCITY_WARNING_SEASONS) return base * SCARCITY_WARNING_MULT;
    return base;
  };

  // Coin the realm cannot spend is not worth building more of. Without this the treasury still
  // runs away in the seeds where trade multipliers compound hardest.
  const goldGlut = rates.gold > 0 && held.gold > rates.gold * GOLD_GLUT_SEASONS;

  return {
    gold: goldGlut ? 1 : 3,
    food: byScarcity(1, held.food, rates.food),
    supplies: byScarcity(2.5, held.supplies, rates.supplies),
    humans: 0.4,
  };
}

/**
 * Net value of a building per season: what it produces, minus what it costs to keep, priced
 * against what the realm is currently short of.
 */
function optionScore(
  option: BuildOption | UpgradeOption,
  defensive: boolean,
  isCapital: boolean,
  weight: Record<'gold' | 'food' | 'supplies' | 'humans', number>,
): number {
  const out = option.output;
  const keep = option.upkeep;
  const produced = (out.gold ?? 0) * weight.gold + (out.food ?? 0) * weight.food
    + (out.supplies ?? 0) * weight.supplies + (out.humans ?? 0) * weight.humans;
  // Upkeep is priced on the same scale, so a building whose *running cost* is the very thing
  // the realm is short of stops looking like a bargain the moment the shortage begins.
  const consumed = (keep.gold ?? 0) * weight.gold + (keep.supplies ?? 0) * weight.supplies
    + (keep.food ?? 0) * weight.food;
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
  const weight = outputWeights(state);
  let best: { landId: string; type: LandBuildingType; score: number } | undefined;

  for (const land of playerLands(state)) {
    if (getBuildOrder(state, land.id)) continue;
    const isCapital = land.id === state.ascent?.capitalLandId;
    for (const option of getBuildOptions(state, land)) {
      if (!option.canBuild) continue;
      const score = optionScore(option, defensive, isCapital, weight);
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
  const weight = outputWeights(state);
  let best: { landId: string; index: number; score: number } | undefined;

  for (const land of playerLands(state)) {
    if (getBuildOrder(state, land.id)) continue;
    const isCapital = land.id === state.ascent?.capitalLandId;
    const options = getUpgradeOptions(state, land);
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (!option.canUpgrade) continue;
      const score = optionScore(option, defensive, isCapital, weight);
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

  return raiseHostNow(state);
}

/**
 * Musters one host from whatever the realm can spare, under its best free commander.
 *
 * Shared by the autopilot and by the Army screen's "Raise a host" button. Deliberately does
 * *not* check the target host count: the autopilot applies that gate itself before calling in,
 * while a player pressing the button has decided they want another host regardless — the whole
 * point of having the screen is to be able to overrule the automation.
 */
export function raiseHostNow(state: GameState): boolean {
  const commanderId = findFreeCommander(state);
  if (!commanderId) return false;

  const affordable = state.resources.humans - RECRUIT_HUMAN_RESERVE;
  if (affordable < MIN_ARMY_SOLDIERS) return false;

  // Muster with as much of a baggage train as the realm can actually spare — demanding a
  // full one up front makes `queueRecruitment` fail outright in a poor realm, so no host
  // ever gets raised at all. `autoResupply` tops it up over the following seasons.
  // Muster to what the granary can carry, not to what the muster rolls allow.
  //
  // A host mustered onto an empty granary is worse than no host at all. Measured over a full
  // run: with the realm at zero food this raised a full levy carrying *nothing*,
  // `progressArmyLogistics` starved it over the following seasons, the autopilot saw its
  // numbers fall under `REMNANT_SHARE` and raised another — a sawtooth (1400 → 276 → 1596 →
  // 365 …) that burned the population down and froze the realm at five provinces for a hundred
  // and thirty seasons.
  //
  // Capping the size rather than refusing the muster matters: refusing outright dropped
  // autopilot recruitment to *zero* for an entire run, which trades the sawtooth for a realm
  // that never fields an army at all. A small, fed host beats both.
  const spareFood = Math.max(0, Math.floor(state.resources.food - SUPPLY_FOOD_RESERVE));
  const rationsPerSoldier = (SUPPLY_TICKS_HELD / 100) * MIN_MUSTER_SUPPLY_SHARE;
  const soldiersTheFarmsCanFeed = Math.floor(spareFood / rationsPerSoldier);
  const soldiers = Math.min(recruitSoldiers(affordable), soldiersTheFarmsCanFeed);
  if (soldiers < MIN_ARMY_SOLDIERS) return false;

  const wantRations = Math.max(1, Math.ceil(soldiers / 100)) * SUPPLY_TICKS_HELD;
  const wantProvisions = Math.max(1, Math.ceil(soldiers / 150)) * SUPPLY_TICKS_HELD;
  const rations = Math.min(wantRations, spareFood);
  const provisions = Math.min(wantProvisions, Math.max(0, Math.floor(state.resources.supplies - SUPPLY_STORE_RESERVE)));
  const mustered = queueRecruitment(state, commanderId, soldiers, rations, provisions);
  // A realm putting men under arms is a realm its neighbours start watching. Charged only on a
  // muster that actually went through, and cheaply — `targetArmyCount` bounds the realm's
  // hosts, so this is a handful of points across a run rather than a second treadmill.
  if (mustered) chargeAmbition(state, 'host');
  return mustered;
}

/**
 * Walks a spare host onto neighbouring empty wilderness.
 *
 * The boundary between what the autopilot may take and what it may not is deliberate: nobody
 * lives here, nobody resists, and `progressMovementOrders` routes it to `occupyEmptyLand` with
 * no battle at all — so claiming it is bookkeeping, not a decision. Villages and rival-held
 * provinces are left alone entirely; those are the player's to take, and by which method.
 *
 * Without this the run stalls on empty ground it obviously wants; with it applied any wider,
 * the Conquer lane's choices would be made for the player before they saw them.
 */
function autoClaimWilderness(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent || ascent.frontLandId) return false;

  const idle = state.armies.filter(
    (army) =>
      army.kingdomId === PLAYER_KINGDOM_ID &&
      !state.movementOrders.some((order) => order.armyId === army.id) &&
      !state.siegeOrders.some((order) => order.armyId === army.id),
  );
  // Never the last host: the capital falling ends the run.
  if (idle.length < 2) return false;

  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const seen = new Set<string>();
  for (const land of owned) {
    for (const neighbourId of land.neighbors) {
      if (seen.has(neighbourId)) continue;
      seen.add(neighbourId);
      const neighbour = state.lands.find((candidate) => candidate.id === neighbourId);
      if (!neighbour) continue;
      if (neighbour.ownerId !== NEUTRAL_OWNER_ID || neighbour.hasVillage) continue;
      if (state.acquisitionOrders.some((order) => order.landId === neighbour.id)) continue;

      if (issueMoveOrder(state, idle[0].id, neighbour.id)) return true;
    }
  }
  return false;
}

/**
 * Buys the adjacent villages that are not decisions: certain to accept, and cheap enough
 * against the treasury that no player would ever say no.
 *
 * This extends the same rule `autoClaimWilderness` is built on — "nobody resists, so claiming
 * it is bookkeeping" — to the purchases that are equally foregone. It exists because the run's
 * expansion rate had become welded to its *prompt* rate: the Conquer card is the only way a
 * village is ever taken, so slowing prompts down for pacing (250 decisions a run was a
 * slideshow) also cut the realm from ~30 provinces to 6, and a map that never grows is the
 * clearest possible way to tell a player their choices are not adding up to anything.
 *
 * Both gates matter. `AUTO_CLAIM_MIN_CHANCE` keeps every risky claim on the player's card
 * where it belongs, and `AUTO_CLAIM_TREASURY_SHARE` keeps this from ever spending money the
 * player might need — which also, finally, gives a fat treasury somewhere to go.
 */
function autoPurchaseVillage(state: GameState): boolean {
  // Never while the realm is fighting for its life: coin belongs to the war then.
  if (underPressure(state)) return false;

  // A realm sitting on coin it has no use for buys land faster and pays more for it.
  //
  // The response card used to be the treasury's main outlet, but it now only appears for waves
  // that are genuinely in doubt — most are met and reported without asking — so on a strong run
  // the gold stopped going anywhere and banked to sixty-plus seasons of income again. Tying the
  // pace of routine expansion to the glut gives surplus somewhere to go without touching the
  // prices of anything the player chooses deliberately, and it switches itself off the moment
  // the treasury is no longer embarrassing.
  const rates = state.resourceRates;
  const glutted = rates.gold > 0 && state.resources.gold > rates.gold * GOLD_GLUT_SEASONS;
  const interval = glutted ? Math.max(2, Math.round(AUTO_CLAIM_INTERVAL_TICKS / 2)) : AUTO_CLAIM_INTERVAL_TICKS;
  const share = glutted ? AUTO_CLAIM_TREASURY_SHARE * 2 : AUTO_CLAIM_TREASURY_SHARE;

  if (state.turn % interval !== 0) return false;
  if (state.acquisitionOrders.length >= AUTO_CLAIM_MAX_ORDERS) return false;

  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const ownedIds = new Set(owned.map((land) => land.id));
  const seen = new Set<string>();
  const candidates: Land[] = [];

  for (const land of owned) {
    for (const neighbourId of land.neighbors) {
      if (seen.has(neighbourId) || ownedIds.has(neighbourId)) continue;
      seen.add(neighbourId);
      const neighbour = state.lands.find((candidate) => candidate.id === neighbourId);
      if (!neighbour || neighbour.ownerId !== NEUTRAL_OWNER_ID || !neighbour.hasVillage) continue;
      if (state.acquisitionOrders.some((order) => order.landId === neighbour.id)) continue;
      candidates.push(neighbour);
    }
  }

  // Cheapest first, so the treasury share buys as much ground as it can.
  candidates.sort((a, b) => getGoldBribeCost(state, a) - getGoldBribeCost(state, b));
  for (const land of candidates) {
    const cost = getGoldBribeCost(state, land);
    if (cost > state.resources.gold * share) continue;
    if (getBribeSuccessChance(land) < AUTO_CLAIM_MIN_CHANCE) continue;
    if (bribeLand(state, land.id)) return true;
  }
  return false;
}

/**
 * Marches idle hosts at the front the *player* designated. `progressMovementOrders` runs the
 * arrival battle and pushes the siege by itself, so this is the whole of the offensive loop —
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

  // The player's standing order first; free ground only when there is no front to press.
  if (autoMarch(state) || autoClaimWilderness(state)) {
    ascent.autopilotStats.marches += 1;
  }

  // Routine purchases need no host, so they are not part of the march chain above.
  autoPurchaseVillage(state);

  autoDefend(state);
}
