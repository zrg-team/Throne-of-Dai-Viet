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
import {
  applyResourceDelta,
  canSpend,
  getArmyGoldUpkeep,
  getBarracksLevel,
  getFocusDefenseMult,
  getFocusGarrisonMult,
  refreshAllLandOutputs,
} from './ResourceSystem';
import { getCourtBonuses } from './CourtSystem';
import { eraIndex } from './empire/MandateSystem';
import {
  ARMY_DRILL_FOOD_BASE,
  ARMY_DRILL_GOLD_BASE,
  ARMY_DRILL_LEVEL_ESCALATION,
  ARMY_DRILL_XP_SHARE,
  ARMY_EQUIP_GOLD_BASE,
  ARMY_EQUIP_PER_SOLDIER,
  ARMY_EQUIP_SUPPLIES_BASE,
  ARMY_EQUIP_TIER_ESCALATION,
  ARMY_REINFORCE_GOLD_PER_SOLDIER,
  ARMY_REINFORCE_SOLDIERS,
  ARMY_REINFORCE_SUPPLY_GAIN,
} from '../game/ascentConfig';
import type {
  Army,
  ArmyComposition,
  ArmyOrders,
  BattlePreview,
  BattleStance,
  GameState,
  Land,
  MovementOrder,
  RecruitmentOrder,
  ResourceBag,
  SiegeOrder,
  UnitCounts,
} from '../state/types';
import { heroName, t, tickLabel } from '../i18n';
import { pushToast } from './empire/notifications';

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

export function armyPower(state: GameState, army: Army): number {
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

/**
 * The best elite tier any host can reach: levy → trained → royal guard.
 *
 * Shared by the muster (which sets the starting tier) and `upgradeArmy` (which buys the way up),
 * so equipment cannot be bought past the ceiling the game is built around.
 */
export const MAX_ELITE_TIER = 2;

/** Elite tier for a freshly-mustered army: rises with barracks and era (levy → trained → royal guard). */
function computeEliteTier(state: GameState, barracksLevel: number): number {
  const eraBonus = eraIndex(state.mandate?.era ?? 'founding') >= 2 ? 1 : 0;
  return Math.min(MAX_ELITE_TIER, (barracksLevel >= 2 ? 1 : 0) + eraBonus);
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
 * Battlefield stakes (empire mode): when a host led by a general is routed, the commander
 * risks their life — mostly a grievous wound (a long recovery, via the Energy system), and
 * rarely death, a permanent loss. The king is never at risk. Returns the fate for the
 * result screen, and applies wounds/removal as a side effect.
 */
function resolveGeneralFate(state: GameState, army: Army): { fate?: 'wounded' | 'slain'; name?: string } {
  if (state.gameMode !== 'empire' || army.kingdomId !== PLAYER_KINGDOM_ID || !army.generalHeroId) return {};
  const general = state.heroes.find((h) => h.id === army.generalHeroId);
  if (!general || general.id === 'king') return {};

  const roll = Math.random();
  if (roll < 0.06) {
    army.generalHeroId = undefined;
    state.heroes = state.heroes.filter((h) => h.id !== general.id);
    state.heroMissions = (state.heroMissions ?? []).filter((m) => m.heroId !== general.id);
    return { fate: 'slain', name: heroName(general) };
  }
  if (roll < 0.3) {
    general.fatigue = Math.min(100, general.fatigue + 45);
    return { fate: 'wounded', name: heroName(general) };
  }
  return {};
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
export function terrainDefenseMultiplier(land: Land): number {
  const ts = land.terrainSummary;
  const total = Math.max(1, ts.plains + ts.fields + ts.riceFields + ts.forest + ts.mountains + ts.hills + ts.water);
  const rugged = (ts.mountains * 1.0 + ts.hills * 0.6 + ts.forest * 0.4 + ts.water * 0.7) / total;
  return 1 + Math.min(0.35, rugged * 0.5);
}

function defenderPower(state: GameState, targetLand: Land): number {
  // A garrison levy *is* the walls turned out (Dragon Ascent); the walls are counted below, so
  // the levy is not counted again as an army. Inert elsewhere: no other mode raises one.
  const defendingArmy = state.armies.find(
    (army) => army.kingdomId === targetLand.ownerId && army.landId === targetLand.id && !army.isLevy,
  );

  // Walls + local militia hold a district against small raids, but a serious host can
  // only be stopped by a standing field army — so keeping an army alive matters, and
  // turtling behind walls is no longer a win button (see WarSystem rebalance).
  // A province set to defend holds harder than its wall count says — the whole point of that focus
  // in Ascent. `getFocusDefenseMult` returns 1 in every other mode and for every other focus.
  const garrison = (targetLand.defense * 16 + targetLand.localSoldiers * 2.5)
    * terrainDefenseMultiplier(targetLand)
    * getFocusDefenseMult(state, targetLand);
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

  const defArmy = state.armies.find((a) => a.kingdomId === land.ownerId && a.landId === land.id && !a.isLevy);
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

/** Traversal rule for `findLandPath`: whether a march may pass *through* this province. */
export type LandTraversalPredicate = (land: Land) => boolean;

/** The default rule, unchanged: a player host marches only across its own ground. */
const playerOwnedTraversal: LandTraversalPredicate = (land) => land.ownerId === PLAYER_KINGDOM_ID;

/**
 * Shortest path of land ids from `fromLandId` to `toLandId`, excluding `fromLandId`
 * (so the last entry is always `toLandId`). Every land along the way except the
 * destination must satisfy `canTraverse`, since marching through hostile or
 * unclaimed territory isn't allowed - the destination itself may be neutral or
 * enemy-owned and is resolved as a battle on arrival. Returns undefined if no
 * such route exists.
 *
 * `canTraverse` defaults to "the player owns it", which is what every pre-existing caller means
 * and relies on. It is a parameter because two callers legitimately need other rules: a host
 * hunting an enemy across ground nobody owns, and an invader marching on the player, neither of
 * which is confined to the player's provinces.
 */
export function findLandPath(
  state: GameState,
  fromLandId: string,
  toLandId: string,
  canTraverse: LandTraversalPredicate = playerOwnedTraversal,
): string[] | undefined {
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
      if (neighborLand && canTraverse(neighborLand)) {
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
  // A garrison levy is its province's own walls turned out; it exists for one battle and cannot
  // be marched (see `raiseGarrisonLevy`). And a host in the line of a watched engagement stays in
  // it — the fight is left through the battle's own orders, never by walking off the field
  // mid-exchange, which is what the autopilot did to the capital's levy the first time a fight
  // outlived its opening tick. Both are Ascent-only states; the read is inert elsewhere.
  if (army.isLevy) {
    return false;
  }
  const live = state.ascent?.activeBattle;
  if (live && !live.over
    && ((live.ourArmyIds ?? []).includes(armyId) || (live.theirArmyIds ?? []).includes(armyId))) {
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

// ─── Improving a standing host ────────────────────────────────────────────────

/** The three ways a host can be made better without raising a new one. */
export type ArmyUpgradeKind = 'equip' | 'reinforce' | 'drill';

export interface ArmyUpgradeOption {
  kind: ArmyUpgradeKind;
  cost: Partial<ResourceBag>;
  /** What the player gets, already computed — e.g. soldiers added, tier reached. */
  gain: number;
  available: boolean;
  /** Why not, when `available` is false. */
  reason?: string;
}

/** Soldiers a reinforcement would actually add, capped by the people available. */
function reinforcementSize(state: GameState): number {
  return Math.max(0, Math.min(ARMY_REINFORCE_SOLDIERS, Math.floor(state.resources.humans)));
}

/**
 * What each upgrade would cost this host, and whether it can be bought.
 *
 * Quoted rather than merely charged, because the detail screen shows all three side by side and
 * the choice between "more men", "better kit" and "more drill" is only a choice if their prices
 * are visible together.
 */
export function getArmyUpgradeOptions(state: GameState, armyId: string): ArmyUpgradeOption[] {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army) return [];

  const size = totalUnits(army);
  const tier = army.elite ?? 0;
  const equipCost: Partial<ResourceBag> = {
    gold: Math.round((ARMY_EQUIP_GOLD_BASE + size * ARMY_EQUIP_PER_SOLDIER) * ARMY_EQUIP_TIER_ESCALATION ** tier),
    supplies: Math.round((ARMY_EQUIP_SUPPLIES_BASE + size * ARMY_EQUIP_PER_SOLDIER) * ARMY_EQUIP_TIER_ESCALATION ** tier),
  };

  const recruits = reinforcementSize(state);
  const reinforceCost: Partial<ResourceBag> = {
    gold: Math.round(recruits * ARMY_REINFORCE_GOLD_PER_SOLDIER),
    humans: recruits,
  };

  const levelCap = getArmyLevelCap(state);
  const drillCost: Partial<ResourceBag> = {
    gold: Math.round(ARMY_DRILL_GOLD_BASE * ARMY_DRILL_LEVEL_ESCALATION ** Math.max(0, army.level - 1)),
    food: Math.round(ARMY_DRILL_FOOD_BASE * ARMY_DRILL_LEVEL_ESCALATION ** Math.max(0, army.level - 1)),
  };

  return [
    {
      kind: 'equip',
      cost: equipCost,
      gain: tier + 1,
      available: tier < MAX_ELITE_TIER && canSpend(state, equipCost),
      reason: tier >= MAX_ELITE_TIER
        ? t('ascent.army.equipMaxed')
        : !canSpend(state, equipCost) ? t('ascent.army.cannotAfford') : undefined,
    },
    {
      kind: 'reinforce',
      cost: reinforceCost,
      gain: recruits,
      available: recruits > 0 && canSpend(state, reinforceCost),
      reason: recruits <= 0
        ? t('ascent.army.noPeople')
        : !canSpend(state, reinforceCost) ? t('ascent.army.cannotAfford') : undefined,
    },
    {
      kind: 'drill',
      cost: drillCost,
      gain: army.level + 1,
      available: army.level < levelCap && canSpend(state, drillCost),
      // The barracks gate the ceiling, so drill cannot outrun the buildings that justify it.
      reason: army.level >= levelCap
        ? t('ascent.army.drillCapped', { cap: levelCap })
        : !canSpend(state, drillCost) ? t('ascent.army.cannotAfford') : undefined,
    },
  ];
}

/**
 * Spends resources to improve a host that already exists.
 *
 * One entry point for all three axes so the prices, the caps and the messages stay in one place.
 * `reinforce` is the significant one: it is the first thing in the game that makes an army grow,
 * and it is what makes "a few strong hosts" a real alternative to "many weak ones" rather than a
 * strategy the rules quietly forbid.
 */
export function upgradeArmy(state: GameState, armyId: string, kind: ArmyUpgradeKind): boolean {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army || army.kingdomId !== PLAYER_KINGDOM_ID) return false;

  const option = getArmyUpgradeOptions(state, armyId).find((candidate) => candidate.kind === kind);
  if (!option || !option.available) {
    if (option?.reason) state.message = option.reason;
    return false;
  }

  const spend: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(option.cost)) {
    spend[key as keyof ResourceBag] = -(value ?? 0);
  }
  applyResourceDelta(state, spend);

  if (kind === 'equip') {
    army.elite = Math.min(MAX_ELITE_TIER, (army.elite ?? 0) + 1);
    state.message = t('msg.armyEquipped', { army: army.name, tier: army.elite });
    return true;
  }

  if (kind === 'reinforce') {
    // Fresh men join in the host's own proportions, so a cavalry-heavy army stays one.
    const added = option.gain;
    const size = Math.max(1, totalUnits(army));
    const archers = Math.round(added * (army.units.archers / size));
    const heavy = Math.round(added * (army.units.heavyInfantry / size));
    army.units.archers += archers;
    army.units.heavyInfantry += heavy;
    army.units.spearmen += Math.max(0, added - archers - heavy);
    // They arrive with their own baggage, which lifts a starving host off the floor.
    army.supply = Math.min(100, army.supply + ARMY_REINFORCE_SUPPLY_GAIN);
    army.rations = Math.min(100, (army.rations ?? 0) + ARMY_REINFORCE_SUPPLY_GAIN);
    state.message = t('msg.armyReinforced', { army: army.name, n: added });
    return true;
  }

  army.experience += Math.round(army.experienceToNextLevel * ARMY_DRILL_XP_SHARE);
  while (army.experience >= army.experienceToNextLevel && army.level < getArmyLevelCap(state)) {
    army.experience -= army.experienceToNextLevel;
    army.level += 1;
    army.experienceToNextLevel = getArmyExperienceToNext(army.level);
  }
  state.message = t('msg.armyDrilled', { army: army.name, level: army.level });
  return true;
}

/**
 * Sends a host hunting an enemy army rather than a province.
 *
 * The difference from `issueMoveOrder` is that the destination is a host, not a place: the order
 * carries `pursueArmyId` and re-paths each tick. Interception is the point — a raider crossing the
 * realm could previously only be answered by guessing which province it would hit and standing
 * there.
 */
export function issueHuntOrder(state: GameState, armyId: string, quarryArmyId: string): boolean {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  const quarry = state.armies.find((candidate) => candidate.id === quarryArmyId);
  if (!army || !quarry || army.id === quarry.id) {
    return false;
  }

  const path = findLandPath(state, army.landId, quarry.landId, pursuitTraversal);
  if (!path) {
    state.message = t('msg.noRoute');
    return false;
  }

  state.movementOrders = state.movementOrders.filter((order) => order.armyId !== armyId);
  const firstLand = findLand(state, path[0]);
  state.movementOrders.push({
    armyId,
    path,
    progress: 0,
    legRequired: firstLand ? getLegTicks(army, firstLand) : 1,
    pursueArmyId: quarryArmyId,
  });

  state.selectedArmyId = undefined;
  state.message = t('msg.hunts', { army: army.name, quarry: quarry.name });
  return true;
}

/**
 * Ground a hunting host may cross: anything but a province held by a rival that is not the quarry.
 *
 * A pursuit that could only cross the player's own provinces would be no pursuit at all — the
 * quarry is, by definition, standing somewhere the player does not hold.
 */
const pursuitTraversal: LandTraversalPredicate = (land) => land.ownerId === PLAYER_KINGDOM_ID
  || land.ownerId === 'neutral';

/**
 * Keeps a pursuit pointed at its quarry. Returns false when the hunt is over and the order should
 * be dropped — the quarry is dead, or there is no longer a way to reach it.
 */
function repathPursuit(state: GameState, army: Army, order: MovementOrder): boolean {
  const quarry = state.armies.find((candidate) => candidate.id === order.pursueArmyId);
  if (!quarry) {
    state.message = t('msg.pursuitLost', { army: army.name });
    return false;
  }

  const destination = order.path[order.path.length - 1];
  if (destination === quarry.landId) {
    return true;
  }

  const path = findLandPath(state, army.landId, quarry.landId, pursuitTraversal);
  if (!path) {
    state.message = t('msg.pursuitLost', { army: army.name });
    return false;
  }

  order.path = path;
  const firstLand = findLand(state, path[0]);
  // Re-pathing restarts the leg: the host turns rather than teleporting its accumulated progress
  // onto a different road.
  order.progress = 0;
  order.legRequired = firstLand ? getLegTicks(army, firstLand) : 1;
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

    // Invader marches are owned by `tickInvasions`, which advances them a hop at a time against a
    // target its own director may re-point. They carry a `MovementOrder` purely so the renderer
    // draws them marching; advancing them here as well would move them twice a tick and resolve
    // their arrivals with the player's rules.
    if (army.kingdomId !== PLAYER_KINGDOM_ID) {
      continue;
    }

    // A pursuit chases a moving target, so its route is only good for as long as the quarry stays
    // put. Re-path before spending the tick, not after, or the host walks a leg toward where the
    // enemy was.
    if (order.pursueArmyId && !repathPursuit(state, army, order)) {
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
export function queueRecruitment(
  state: GameState,
  heroId: string,
  soldiers: number,
  rations: number,
  provisions: number,
  composition: ArmyComposition = 'balanced',
  orders?: ArmyOrders,
): boolean {
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
    // Stamped onto the host the moment it musters (Dragon Ascent standing orders). Absent for
    // every other caller, so nothing changes for the classic modes.
    ...(orders ? { orders } : {}),
  });
  hero.assignedTo = id;
  refreshAllLandOutputs(state);
  state.message = t('msg.recruitingArmy', { total, land: capital.name, ticks: required, tickLabel: tickLabel(required) });
  return true;
}

/** The province a new host would muster at — the same choice `queueRecruitment` makes. */
export function getRecruitmentLand(state: GameState): Land | undefined {
  return findRecruitmentLand(state);
}

/**
 * How long a muster of `soldiers` would take and what it costs to arm, before anything is spent.
 * The same arithmetic `queueRecruitment` runs, exposed so a form can quote it honestly.
 */
export function getMusterEstimate(state: GameState, soldiers: number): {
  land?: Land;
  ticks: number;
  suppliesCost: number;
  alreadyTraining: boolean;
  trainingTicksLeft: number;
} {
  const land = findRecruitmentLand(state);
  const courtBonuses = getCourtBonuses(state);
  const total = Math.max(100, Math.floor(soldiers));
  const suppliesCost = Math.max(5, Math.ceil((total / 130) * courtBonuses.recruitmentSupplyCostMult));
  const barracksLevel = land ? getBarracksLevel(land) : 0;
  const perTick = RECRUIT_BASE_PER_TICK * (1 + barracksLevel * RECRUIT_BARRACKS_BONUS) * courtBonuses.recruitSpeedMult;
  const ticks = Math.max(1, Math.ceil(total / perTick));
  const training = land ? getRecruitmentOrder(state, land.id) : undefined;
  return {
    land,
    ticks,
    suppliesCost,
    alreadyTraining: Boolean(training),
    trainingTicksLeft: training ? Math.max(0, training.required - training.progress) : 0,
  };
}

/** The unit split a doctrine musters under the current court, as shares of one. */
export function getCompositionShares(state: GameState, composition: ArmyComposition): { spearmen: number; archers: number; heavyInfantry: number } {
  const { heavyShare, archerShare } = compositionShares(composition, getCourtBonuses(state));
  return { spearmen: Math.max(0, 1 - heavyShare - archerShare), archers: archerShare, heavyInfantry: heavyShare };
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

    // A province set to raise soldiers musters a fuller host from the same order. 1 everywhere else.
    const total = Math.round(order.totalSoldiers * getFocusGarrisonMult(state, land));
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

    // The standing order the muster was given (Dragon Ascent). Only ever present there.
    if (order.orders) army.orders = order.orders;

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
  // Wages bite when the treasury cannot cover the season's bill — not only once it hits zero.
  //
  // The gate was `gold <= 0 && goldRate < 0`, which requires a realm to be simultaneously broke
  // and losing money. Nothing in a measured run ever satisfied it, so `unpaidTicks` never
  // incremented and the entire wage mechanic below — morale loss, desertion, disbandment — was
  // unreachable code. A standing army you cannot afford should be a problem before it is a
  // catastrophe, so this now fires while the coffers can still be seen to be emptying.
  const treasuryCannotPay = state.resourceRates.gold < 0
    && state.resources.gold + state.resourceRates.gold <= 0;

  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    // A garrison levy exists for one battle: it is fed and paid by the province it came from,
    // and it goes home the moment the fight ends. Wages and rations do not apply — counting
    // them disbanded the capital's own turnout for arrears in the middle of the siege it was
    // raised to fight.
    if (army.isLevy) {
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
      // Said out loud (Dragon Ascent): a host that dissolves for arrears used to be a host that
      // simply vanished, and "why did my army disappear" was the question every run raised.
      if (state.gameMode === 'ascent' && (army.unpaidTicks === 1 || army.unpaidTicks === 3)) {
        pushToast(state, t('ascent.army.arrears', { army: army.name, ticks: 5 - army.unpaidTicks }), 'threat');
      }
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
    // Retaking the dynasty's own seat (Dragon Ascent) is a liberation, not a siege: the walls
    // and the people are the realm's, so the gates open the season the field is won. The
    // grace clock the capital's fall starts is shorter than a full siege would take, and a
    // realm that won the battle to get back in should not lose the run to the arithmetic.
    const liberatingSeat = state.gameMode === 'ascent'
      && army.kingdomId === PLAYER_KINGDOM_ID
      && state.ascent?.capitalLandId === targetLand.id;
    const siegeTicks = liberatingSeat ? 1 : getAcquisitionTicksRequired(targetLand);
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

  const fate = resolveGeneralFate(state, army);
  state.message = t('msg.defeatAt', { land: targetLand.name });
  state.latestBattleResult = {
    attackerArmyId: armyId,
    targetLandId,
    victory: false,
    attackerPower: preview.attackerPower,
    defenderPower: preview.defenderPower,
    generalFate: fate.fate,
    generalName: fate.name,
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

  // A siege does not advance while its besieger is fighting for the ground it is besieging: a
  // watched engagement on the province (Dragon Ascent) contests it. Measured before this, the
  // capital was captured mid-battle by a host that was itself in the line, three beats before
  // the defenders routed it. Inert elsewhere — no other mode has a live battle.
  const live = state.ascent?.activeBattle;
  const engaged = new Set(live && !live.over ? [...(live.ourArmyIds ?? []), ...(live.theirArmyIds ?? [])] : []);

  for (const order of state.siegeOrders) {
    if (engaged.has(order.armyId) && live?.landId === order.landId) continue;
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
