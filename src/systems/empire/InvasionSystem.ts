import { isEndlessMode, PLAYER_KINGDOM_ID } from '../../game/constants';
import { findLand, getAcquisitionTicksRequired } from '../LandSystem';
import { createBattlePreview, grantGeneralExperience, issueMoveOrder } from '../WarSystem';
import { applyResourceDelta, refreshAllLandOutputs } from '../ResourceSystem';
import { getPlayerMilitary } from '../DiplomacySystem';
import { addMandate } from './MandateSystem';
import {
  openingVolleyShare,
  pursuitLossShare,
  shieldsTheCapital,
  soundTheBronzeDrum,
  tryReformBrokenHost,
} from '../ascent/DoctrineSystem';
import { pushToast } from './notifications';
import type { Army, Difficulty, GameState, InvasionRecord, Kingdom, Land } from '../../state/types';
import { t } from '../../i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function totalUnits(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

function difficultyArmyScale(difficulty: Difficulty | undefined): number {
  if (difficulty === 'easy') return 0.7;
  if (difficulty === 'hard') return 1.35;
  if (difficulty === 'ironman') return 1.7;
  return 1.0;
}

/**
 * Ceiling on a wave's total size as a multiple of the player's defensible military
 * (troops + garrison). This keeps a telegraphed host a beatable *wall* that tracks the
 * player's power instead of an unwinnable spike — a prepared realm can repel it, an
 * unprepared one loses ground rather than the whole realm to a 0-vs-thousands wipe.
 */
function defensibleCapRatio(difficulty: Difficulty | undefined): number {
  if (difficulty === 'easy') return 1.25;
  if (difficulty === 'hard') return 2.1;
  if (difficulty === 'ironman') return 2.6;
  return 1.7;
}

function personalityWeight(kingdom: Kingdom): number {
  if (kingdom.personality === 'aggressive') return 1.15;
  if (kingdom.personality === 'expansionist') return 1.08;
  if (kingdom.personality === 'economic') return 0.85;
  return 0.95;
}

function playerLands(state: GameState): Land[] {
  return state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID);
}

function playerCapital(state: GameState): Land | undefined {
  return state.lands.find((l) => l.ownerId === PLAYER_KINGDOM_ID && l.type === 'castle');
}

function nearestLand(from: Land, candidates: Land[]): Land | undefined {
  let best: Land | undefined;
  let bestDist = Infinity;
  for (const land of candidates) {
    const d = (land.x - from.x) ** 2 + (land.y - from.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = land;
    }
  }
  return best;
}

/** First land to move to along the shortest path from `fromId` to `toId`, across any owner. */
function findInvasionStep(state: GameState, fromId: string, toId: string): string | undefined {
  if (fromId === toId) {
    return undefined;
  }
  const cameFrom = new Map<string, string>();
  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];

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
      if (neighborId === toId) {
        let step = neighborId;
        while (cameFrom.get(step) !== fromId) {
          step = cameFrom.get(step) as string;
        }
        return step;
      }
      queue.push(neighborId);
    }
  }
  return undefined;
}

function applyInvaderLosses(army: Army, rate: number): void {
  army.units.spearmen = Math.max(0, Math.floor(army.units.spearmen * (1 - rate)));
  army.units.archers = Math.max(0, Math.floor(army.units.archers * (1 - rate)));
  army.units.heavyInfantry = Math.max(0, Math.floor(army.units.heavyInfantry * (1 - rate)));
}

function despawnInvasion(state: GameState, record: InvasionRecord): void {
  state.armies = state.armies.filter((a) => a.id !== record.armyId);
  state.siegeOrders = state.siegeOrders.filter((o) => o.armyId !== record.armyId);
  state.invasions = (state.invasions ?? []).filter((r) => r !== record);
}

/** Spoils for destroying an invading host: Mandate, loot gold, and freed prisoners. */
function grantRepelSpoils(state: GameState, hostSize: number, record: InvasionRecord): void {
  state.invasionsRepelled = (state.invasionsRepelled ?? 0) + 1;
  const great = record.great === true;
  const mandate = Math.max(5, Math.round(hostSize / 32)) * (great ? 3 : 1);
  addMandate(state, mandate);
  const lootGold = Math.round(hostSize / 12) * (great ? 2 : 1);
  const prisoners = Math.round(hostSize / 8);
  applyResourceDelta(state, { gold: lootGold, humans: prisoners });
  pushToast(state, t('empire.spoils', { gold: lootGold, prisoners, mandate }), 'reward');
}

function recordArmyDefeated(state: GameState, total: number): void {
  if (!state.campaignScore) {
    return;
  }
  state.campaignScore.armiesDefeated += 1;
  state.campaignScore.largestArmyDefeated = Math.max(state.campaignScore.largestArmyDefeated, total);
}

// ─────────────────────────────────────────────────────────────────────────────
// Spawning an invasion
// ─────────────────────────────────────────────────────────────────────────────

/** Options for a directed/telegraphed spawn (used by the ThreatDirector). */
export interface InvasionSpawnOptions {
  /** Force a specific number of hosts (a boss coalition), overriding the relations roll. */
  forceCoalition?: number;
  /** Multiplier on each host's size, for named Great Invasions. */
  sizeMult?: number;
  /** Names the hosts after a warlord (Great Invasion flavour). */
  warlordName?: string;
  /** Force conquest intent (a Great Invasion always marches on the capital). */
  forceConquest?: boolean;
  /** Force raid intent: pillage a border district and withdraw, never march on the capital. */
  forceRaid?: boolean;
  /**
   * Exact soldier budget to split across the hosts, bypassing the random roll *and* the
   * defensible-total clamp.
   *
   * The clamp sizes a wave against `getPlayerMilitary` — a raw headcount that knows nothing
   * about army level, elite tier, generals or the court's `armyPowerMult`. That is right for
   * empire mode, where none of those stack far. Dragon Ascent multiplies all four through its
   * Power Draft, so a clamped wave there is sized against a number several times smaller than
   * what will actually defend, and every card the player takes widens the gap. When the caller
   * has computed the budget from real defensive power, it must be honoured verbatim.
   */
  totalSoldiers?: number;
}

/** Replaces the on-map `launchDynastyAttack` for empire mode: spawns one or more off-map hosts at the frontier. */
export function launchOffMapInvasion(state: GameState, kingdomId: string | undefined, opts: InvasionSpawnOptions = {}): void {
  if (!isEndlessMode(state.gameMode) || !kingdomId) {
    return;
  }
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId && !k.isDefeated && k.id !== PLAYER_KINGDOM_ID);
  if (!kingdom) {
    return;
  }

  const capital = playerCapital(state) ?? playerLands(state)[0];
  if (!capital) {
    return;
  }

  // Frontier staging grounds: neutral districts far from the capital.
  const neutralEdges = state.lands
    .filter((l) => l.ownerId === 'neutral')
    .sort((a, b) => ((b.x - capital.x) ** 2 + (b.y - capital.y) ** 2) - ((a.x - capital.x) ** 2 + (a.y - capital.y) ** 2));
  if (neutralEdges.length === 0) {
    return;
  }

  const relations = kingdom.relations ?? 50;
  const conquestChance =
    0.4 + (relations < 35 ? 0.3 : relations < 50 ? 0.1 : 0) + (personalityWeight(kingdom) > 1 ? 0.18 : 0);
  const intent: InvasionRecord['intent'] = opts.forceRaid
    ? 'raid'
    : opts.forceConquest || Math.random() < conquestChance ? 'conquest' : 'raid';

  // Conquest with very cold relations can field a coalition of 2-3 hosts.
  let armyCount = 1;
  if (opts.forceCoalition) {
    armyCount = opts.forceCoalition;
  } else if (intent === 'conquest') {
    if (relations < 25 && Math.random() < 0.4) armyCount = 3;
    else if (relations < 40 && Math.random() < 0.5) armyCount = 2;
  }

  const scale = difficultyArmyScale(state.campaignConfig?.difficulty) * personalityWeight(kingdom) * (opts.sizeMult ?? 1);
  const growth = 1 + Math.min(1.4, state.turn * 0.02); // later invasions hit harder, but the ramp is bounded

  // Pre-roll each host's raw size, then clamp the *total* to a defensible multiple of the
  // player's military so even a 3-host coalition can't become an unwinnable wall of thousands.
  const rawSizes = Array.from({ length: armyCount }, () => Math.round((180 + Math.floor(Math.random() * 140)) * scale * growth));
  const rawTotal = rawSizes.reduce((sum, s) => sum + s, 0);

  // An explicit budget replaces both the roll and the clamp: the caller has already sized this
  // wave against something more honest than a headcount (see `totalSoldiers`).
  let clampFactor: number;
  if (opts.totalSoldiers !== undefined) {
    clampFactor = rawTotal > 0 ? opts.totalSoldiers / rawTotal : 1;
  } else {
    const capFloor = 260 * armyCount * difficultyArmyScale(state.campaignConfig?.difficulty);
    const totalCap = Math.max(capFloor, getPlayerMilitary(state) * defensibleCapRatio(state.campaignConfig?.difficulty));
    clampFactor = rawTotal > totalCap ? totalCap / rawTotal : 1;
  }

  state.invasions ??= [];
  for (let i = 0; i < armyCount; i += 1) {
    const stage = neutralEdges[i % neutralEdges.length];
    const size = Math.max(100, Math.round(rawSizes[i] * clampFactor));
    const army: Army = {
      id: `invasion-${kingdomId}-${state.turn}-${i}`,
      kingdomId,
      name: opts.warlordName
        ? `${opts.warlordName}'s Host`
        : `${kingdom.name} ${intent === 'conquest' ? 'War Host' : 'Raiders'}`,
      landId: stage.id,
      units: {
        spearmen: Math.floor(size * 0.6),
        archers: Math.floor(size * 0.28),
        heavyInfantry: Math.floor(size * 0.12),
      },
      morale: 85,
      supply: 90,
      rations: 350,
      provisions: 250,
      level: 2,
      experience: 0,
      experienceToNextLevel: 160,
    };
    state.armies.push(army);
    state.invasions.push({ armyId: army.id, kingdomId, intent, great: Boolean(opts.warlordName) });
  }

  state.message = t('empire.invade.muster', { kingdom: kingdom.name, armies: armyCount });
  if (opts.warlordName) {
    pushToast(state, t('empire.invade.greatMuster', { warlord: opts.warlordName, kingdom: kingdom.name }), 'threat');
  } else {
    pushToast(state, t('empire.invade.muster', { kingdom: kingdom.name, armies: armyCount }), 'threat');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Marching + resolving invasions each tick
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-command: armies whose hero holds full command (`autoDefend`) march themselves to the
 * owned district nearest the closest incoming host, to meet it there — so the player can hand
 * frontier defence to a trusted general instead of micro-managing every march.
 */
export function tickAutoDefend(state: GameState): void {
  if (!isEndlessMode(state.gameMode) || !state.invasions || state.invasions.length === 0) return;
  const invaders = state.armies.filter((a) => a.kingdomId !== PLAYER_KINGDOM_ID && totalUnits(a) > 0 && state.invasions!.some((r) => r.armyId === a.id));
  if (invaders.length === 0) return;
  const owned = playerLands(state);
  if (owned.length === 0) return;

  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID || !army.autoDefend || totalUnits(army) <= 0) continue;
    // Busy marching or besieging — leave the current order be.
    if (state.movementOrders.some((o) => o.armyId === army.id)) continue;
    if (state.siegeOrders.some((o) => o.armyId === army.id)) continue;
    const here = findLand(state, army.landId);
    if (!here) continue;
    // Nearest incoming host, then the owned district closest to it (where it will strike).
    let nearestInv: Army | undefined; let invDist = Infinity;
    for (const inv of invaders) {
      const il = findLand(state, inv.landId);
      if (!il) continue;
      const d = (il.x - here.x) ** 2 + (il.y - here.y) ** 2;
      if (d < invDist) { invDist = d; nearestInv = inv; }
    }
    const invLand = nearestInv ? findLand(state, nearestInv.landId) : undefined;
    if (!invLand) continue;
    const threatened = nearestLand(invLand, owned);
    if (threatened && threatened.id !== army.landId) {
      issueMoveOrder(state, army.id, threatened.id);
    }
  }
}

export function tickInvasions(state: GameState): void {
  if (!isEndlessMode(state.gameMode) || !state.invasions || state.invasions.length === 0) {
    return;
  }

  for (const record of [...state.invasions]) {
    const army = state.armies.find((a) => a.id === record.armyId);
    if (!army || totalUnits(army) <= 0) {
      // Already wiped out by the player elsewhere.
      if (army) {
        despawnInvasion(state, record);
      } else {
        state.invasions = (state.invasions ?? []).filter((r) => r !== record);
      }
      continue;
    }

    // A host mid-siege stays put until progressSiegeOrders resolves it.
    if (state.siegeOrders.some((o) => o.armyId === army.id)) {
      continue;
    }

    // A raider that has done its damage marches back to the frontier and vanishes.
    if (record.pillaged) {
      const exitId = record.exitLandId;
      if (!exitId || army.landId === exitId) {
        state.message = t('empire.invade.withdraw', { kingdom: kingdomName(state, record.kingdomId) });
        despawnInvasion(state, record);
        continue;
      }
      const step = findInvasionStep(state, army.landId, exitId);
      if (step) {
        army.landId = step;
      } else {
        despawnInvasion(state, record);
      }
      continue;
    }

    const target = chooseTarget(state, army, record);
    if (!target) {
      // Nothing left to attack (player eliminated) — let defeat checks handle it.
      continue;
    }

    const here = findLand(state, army.landId);
    const adjacentToTarget = here?.neighbors.includes(target.id) ?? false;

    if (target.ownerId === PLAYER_KINGDOM_ID && adjacentToTarget) {
      if (maybeRequestBattleDecision(state, army, record, target)) continue;
      resolveInvaderBattle(state, army, record, target);
      continue;
    }

    // March one land closer.
    const step = findInvasionStep(state, army.landId, target.id);
    if (!step) {
      continue;
    }
    const stepLand = findLand(state, step);
    if (stepLand?.ownerId === PLAYER_KINGDOM_ID) {
      if (maybeRequestBattleDecision(state, army, record, stepLand)) continue;
      resolveInvaderBattle(state, army, record, stepLand);
    } else {
      army.landId = step;
    }
  }
}

function chooseTarget(state: GameState, army: Army, record: InvasionRecord): Land | undefined {
  const here = findLand(state, army.landId);
  const owned = playerLands(state);
  if (owned.length === 0 || !here) {
    return undefined;
  }
  if (record.intent === 'conquest') {
    // Bamboo Palisade turns the realm's own width into depth: a war host can no longer march
    // straight past the frontier at the dynasty's seat, and has to reduce whatever it meets
    // first. Ascent-only — `shieldsTheCapital` returns false in every other mode.
    if (shieldsTheCapital(state)) return nearestLand(here, owned);
    return playerCapital(state) ?? nearestLand(here, owned);
  }
  return nearestLand(here, owned);
}

/**
 * Requests the player's tactical decision when an invader reaches a district defended by a
 * FIELD army (not just a garrison) — unless that army's hero holds full command (`autoDefend`),
 * in which case the general decides and the fight auto-resolves. Returns true when it deferred
 * the battle to the player (the caller must then skip auto-resolution this tick).
 */
function maybeRequestBattleDecision(state: GameState, army: Army, record: InvasionRecord, land: Land): boolean {
  if (state.pendingBattle) return true;
  const defender = state.armies.find((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id && totalUnits(a) > 0);
  if (!defender) return false;
  // `autoDefend` means two different things: 'march home to intercept' (tickAutoDefend) and
  // 'fight without asking' (here). Dragon Ascent needs the first and not the second, so it
  // asks regardless unless the player has handed battles back to their generals. Inert in
  // every other mode.
  const ascentWatches = state.gameMode === 'ascent' && !state.ascent?.autoResolveBattles;
  if (defender.autoDefend && !ascentWatches) return false;
  const preview = createBattlePreview(state, army.id, land.id);
  if (!preview) return false;
  state.pendingBattle = {
    invaderArmyId: army.id,
    landId: land.id,
    landName: land.name,
    kingdomId: record.kingdomId,
    kingdomName: kingdomName(state, record.kingdomId),
    isGreat: Boolean(record.great),
    attackerPower: preview.attackerPower,
    defenderPower: preview.defenderPower,
  };
  state.isPaused = true;
  return true;
}

/** Resolves a battle the player was asked to decide. Attack = first-strike edge; retreat = save the host. */
export function resolvePendingBattle(state: GameState, decision: 'attack' | 'delegate' | 'retreat'): void {
  const pb = state.pendingBattle;
  state.pendingBattle = undefined;
  state.isPaused = false;
  if (!pb) return;
  const army = state.armies.find((a) => a.id === pb.invaderArmyId);
  const land = findLand(state, pb.landId);
  const record = state.invasions?.find((r) => r.armyId === pb.invaderArmyId);
  if (!army || !land || !record) return;
  if (decision === 'retreat') {
    // Pull the field army to safety; the district falls to whatever garrison remains.
    retreatDefenders(state, land);
    resolveInvaderBattle(state, army, record, land, 1);
    return;
  }
  // Attack: seize the initiative for a real defender edge. Delegate: a steady hero-led stand.
  resolveInvaderBattle(state, army, record, land, decision === 'attack' ? 1.22 : 1.06);
}

function resolveInvaderBattle(state: GameState, army: Army, record: InvasionRecord, land: Land, defenderBonus = 1): void {
  // Fire Arrows: the volley lands before the lines meet, so it is spent on the approach whether
  // the defence then holds or breaks. Applied ahead of the preview so the odds the battle
  // resolves on are the odds after the arrows have fallen.
  const volley = openingVolleyShare(state);
  if (volley > 0) applyInvaderLosses(army, volley);

  const preview = createBattlePreview(state, army.id, land.id);
  if (!preview) {
    return;
  }
  const preTotal = totalUnits(army);
  // Walls give the defender a slight edge, but big/Great hosts bring siege and negate
  // much of it — you must meet them in the field. A small ±10% fuzz lets close fights
  // swing (drama) while a clearly stronger side still prevails (preparation over luck).
  const fuzz = 0.9 + Math.random() * 0.2;
  const siegeMult = record.great ? 0.72 : preTotal > 1000 ? 0.8 : 0.85;
  const victory = preview.attackerPower >= preview.defenderPower * defenderBonus * siegeMult * fuzz;

  if (!victory) {
    applyInvaderLosses(army, 0.4);
    army.morale = Math.max(20, army.morale - 16);
    awardDefenderXp(state, land, preview.defenderPower);

    if (totalUnits(army) < 40) {
      recordArmyDefeated(state, preTotal);
      grantRepelSpoils(state, preTotal, record);
      state.message = t('empire.invade.repelled', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
      despawnInvasion(state, record);
      return;
    }
    // A bloodied raider gives up and withdraws; a war host keeps grinding.
    if (record.intent === 'raid') {
      record.pillaged = true;
      record.exitLandId = farthestNeutralFromCapital(state)?.id;
    }
    return;
  }

  // Invader wins the field.
  applyInvaderLosses(army, 0.16);
  // Feigned Retreat: a pursuit out of formation costs the attacker more than the ground was
  // worth. This is the card that makes losing a province a move rather than only a loss.
  const pursuit = pursuitLossShare(state);
  if (pursuit > 0) applyInvaderLosses(army, pursuit);
  retreatDefenders(state, land);

  if (record.intent === 'raid') {
    pillage(state, land);
    record.pillaged = true;
    record.exitLandId = farthestNeutralFromCapital(state)?.id;
    state.message = t('empire.invade.raidHit', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
    return;
  }

  // Conquest: occupy and lay siege; progressSiegeOrders flips ownership.
  const fromLandId = army.landId;
  army.landId = land.id;
  state.siegeOrders.push({
    landId: land.id,
    armyId: army.id,
    attackerKingdomId: army.kingdomId,
    fromLandId,
    progress: 0,
    required: getAcquisitionTicksRequired(land),
  });
  state.message = t('empire.invade.besiege', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
}

function retreatDefenders(state: GameState, land: Land): void {
  const defenders = state.armies.filter((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id);
  for (const defender of defenders) {
    // The Bronze Drum steadies everyone still standing — ordinary on one front, and worth the
    // slot the moment the realm is fighting on three.
    soundTheBronzeDrum(state, defender.id);

    // Twice-Born: once a wave, a broken host reforms at the seat instead of scattering. It keeps
    // its men and finds its heart again, which is what makes it something to plan a defence
    // around rather than a consolation.
    if (tryReformBrokenHost(state, defender)) continue;

    const retreat = land.neighbors
      .map((id) => findLand(state, id))
      .find((l) => l?.ownerId === PLAYER_KINGDOM_ID);
    if (retreat) {
      defender.landId = retreat.id;
    }
    defender.morale = Math.max(25, defender.morale - 18);
    applyInvaderLosses(defender, 0.18);
  }
}

function awardDefenderXp(state: GameState, land: Land, defenderPower: number): void {
  const defender = state.armies.find((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id);
  if (!defender) {
    return;
  }
  defender.experience += Math.max(8, Math.round(defenderPower / 90));
  grantGeneralExperience(state, defender, true);
  while (defender.level < 5 && defender.experience >= defender.experienceToNextLevel) {
    defender.experience -= defender.experienceToNextLevel;
    defender.level += 1;
    defender.experienceToNextLevel = 100 + (defender.level - 1) * 60;
    defender.morale = Math.min(100, defender.morale + 5);
  }
}

function pillage(state: GameState, land: Land): void {
  land.loyalty = Math.max(15, land.loyalty - 22);
  const lootGold = Math.min(state.resources.gold, 25);
  const lootFood = Math.min(state.resources.food, 35);
  applyResourceDelta(state, { gold: -lootGold, food: -lootFood });
  if (land.buildings.length > 0) {
    land.buildings.splice(Math.floor(Math.random() * land.buildings.length), 1);
  }
  if (state.dynastyStatus) {
    state.dynastyStatus.farmerUnrest = Math.min(100, state.dynastyStatus.farmerUnrest + 10);
  }
  refreshAllLandOutputs(state);
}

function farthestNeutralFromCapital(state: GameState): Land | undefined {
  const capital = playerCapital(state) ?? playerLands(state)[0];
  if (!capital) {
    return undefined;
  }
  return state.lands
    .filter((l) => l.ownerId === 'neutral')
    .sort((a, b) => ((b.x - capital.x) ** 2 + (b.y - capital.y) ** 2) - ((a.x - capital.x) ** 2 + (a.y - capital.y) ** 2))[0];
}

function kingdomName(state: GameState, kingdomId: string): string {
  return state.kingdoms.find((k) => k.id === kingdomId)?.name ?? kingdomId;
}
