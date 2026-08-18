import { isEndlessMode, PLAYER_KINGDOM_ID } from '../../game/constants';
import { getLegTicks } from '../../game/movementConfig';
import { GARRISON_LEVY_FLOOR, LEVY_POWER_PER_MAN } from '../../game/ascentConfig';
import { findLand, getAcquisitionTicksRequired } from '../LandSystem';
import { attackLand, createBattlePreview, grantGeneralExperience, issueMoveOrder } from '../WarSystem';
import {
  applyResourceDelta,
  getFocusDefenseMult,
  getFocusGarrisonMult,
  refreshAllLandOutputs,
} from '../ResourceSystem';
import { getPlayerMilitary } from '../DiplomacySystem';
import { addMandate } from './MandateSystem';
import {
  openingVolleyShare,
  pursuitLossShare,
  soundTheBronzeDrum,
  tryReformBrokenHost,
} from '../ascent/DoctrineSystem';
import { pushToast } from './notifications';
import type { Army, Difficulty, GameState, InvasionRecord, Kingdom, Land, PendingBattle } from '../../state/types';
import { t } from '../../i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function totalUnits(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

export function difficultyArmyScale(difficulty: Difficulty | undefined): number {
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
  // Belt and braces over the aggressor filters: a crown sworn to the player never lands a
  // host on them, whatever future caller asks for it.
  if (state.kingdoms.find((k) => k.id === kingdomId)?.vassalage) return;
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

  // Staging stays at the far edge, deliberately.
  //
  // Hosts walk one district per tick across a forty-two district map, so the far-edge muster is a
  // large part of why contact is rare — and staging them nearer was tried here. Measured across
  // three pinned-RNG seeds it collapsed two of the three runs to a single province: the approach
  // march is not padding, it is the window the realm uses to raise and move a host. Shortening it
  // needs the wave *budget* softened in the same change, which is a balance pass of its own.
  const staging = neutralEdges;

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
    const stage = staging[i % staging.length];
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

    // A host already in the line of a watched engagement is fought there, on the battle's own
    // beats. Contacting it again here would resolve the same fight a second time underneath the
    // one being watched. (Read off the state directly: this file must not import the battle.)
    const live = state.ascent?.activeBattle;
    if (live && !live.over && (live.theirArmyIds ?? []).includes(army.id)) {
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
        advanceInvader(state, army, step);
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
      clearInvaderMarch(state, army.id);
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
      clearInvaderMarch(state, army.id);
      if (maybeRequestBattleDecision(state, army, record, stepLand)) continue;
      resolveInvaderBattle(state, army, record, stepLand);
    } else {
      advanceInvader(state, army, step);
    }
  }
}

/**
 * Moves an invader one province along, as a march the player can watch.
 *
 * Empire keeps the original bare assignment. In Dragon Ascent the host is given a real
 * `MovementOrder` instead, because `ArmyRenderer` gates the entire march presentation on one
 * existing — the road curve, the leg tween timed by terrain, the dust, the marching column and the
 * destination arrow are all inside `if (order && order.path.length > 0)`. Without an order a host
 * hard-snaps between provinces, which is why invasions appeared rather than approached.
 *
 * The order is deliberately one leg long and re-issued each tick. Invader routing is decided a hop
 * at a time by `findInvasionStep` against a target that the enemy director may re-point at any
 * moment, so handing the movement system a long path would let a host keep walking a route its
 * command has already abandoned.
 */
function advanceInvader(state: GameState, army: Army, step: string): void {
  if (state.gameMode !== 'ascent') {
    army.landId = step;
    return;
  }

  const existing = state.movementOrders.find((order) => order.armyId === army.id);
  if (existing && existing.path[0] === step) {
    existing.progress += 1;
    if (existing.progress < existing.legRequired) return;
    // The leg is done: the host arrives, and the order is spent.
    army.landId = step;
    state.movementOrders = state.movementOrders.filter((order) => order !== existing);
    return;
  }

  const stepLand = findLand(state, step);
  const legRequired = stepLand ? getLegTicks(army, stepLand) : 1;
  state.movementOrders = state.movementOrders.filter((order) => order.armyId !== army.id);
  // A one-tick leg would mean the marker never renders mid-march, so the tween never plays.
  if (legRequired <= 1) {
    army.landId = step;
    return;
  }
  state.movementOrders.push({ armyId: army.id, path: [step], progress: 1, legRequired });
}

/** Drops a host's march order — it has arrived, or is about to fight instead of walking. */
function clearInvaderMarch(state: GameState, armyId: string): void {
  state.movementOrders = state.movementOrders.filter((order) => order.armyId !== armyId);
}

function chooseTarget(state: GameState, army: Army, record: InvasionRecord): Land | undefined {
  const here = findLand(state, army.landId);
  const owned = playerLands(state);
  if (owned.length === 0 || !here) {
    return undefined;
  }

  // In Ascent the enemy director assigns each host a province and a reason for wanting it — a
  // spearhead goes for the prize, a flanker for weakly-held ground, and each flanker takes a
  // different one so a coalition spreads. Honour that if the target is still the player's; if it
  // has already fallen or been retaken, fall through to the original reading.
  if (state.gameMode === 'ascent' && record.targetLandId) {
    const assigned = owned.find((land) => land.id === record.targetLandId);
    if (assigned) return assigned;
  }

  if (record.intent === 'conquest') {
    // The frontier absorbs the wave. A war host cannot march straight past the border at the
    // dynasty's seat; it has to reduce whatever it meets first.
    //
    // This was Bamboo Palisade's effect, gated behind a silver card that a run drew perhaps once.
    // It is the default rule of the map now, because it is what makes width into depth — and
    // width buying nothing was half the reason expanding was survival-neutral. Measured before
    // this: a realm peaked at 6.8 provinces and ended holding 3.1, because a conquest host walked
    // through all of them to the capital. The card now buys militia instead (see
    // `palisadeMilitiaBonus`), which is the same fantasy priced as an upgrade rather than a gate.
    // Ascent only, deliberately. Empire mode shares this spawner but not this design: its threat
    // curve, its province count and its whole difficulty budget were tuned against war hosts that
    // march at the seat, and `verify-modes-regression` holds that behaviour byte-identical.
    if (state.gameMode === 'ascent') return nearestLand(here, owned);
    return playerCapital(state) ?? nearestLand(here, owned);
  }
  return nearestLand(here, owned);
}

/**
 * Turns a province's garrison out as a host, so a defence with no field army is still a battle.
 *
 * Ascent only, and only for the watchable path. `defenderPower` already counted the garrison when
 * resolving a fight, so the *outcome* was never wrong — but `beginBattle` needs an `Army` standing
 * on the tile, and the realm's hosts are usually somewhere else. The result was that the mode's
 * best screen never opened: the wave arrived, a number was compared against another number, and
 * the province changed hands with nothing to watch or steer.
 *
 * The levy is drawn from `localSoldiers` and dissolved by `dissolveGarrisonLevies` the moment the
 * engagement ends, so it never shows up as a standing host, never draws upkeep across seasons, and
 * cannot be marched. Survivors go home to the province they came from.
 */
export function raiseGarrisonLevy(state: GameState, land: Land): Army | undefined {
  if (state.gameMode !== 'ascent' || state.ascent?.autoResolveBattles) return undefined;

  // Drawn from the walls as well as the militia, because militia alone is almost always nothing.
  //
  // `localSoldiers` is seeded on the capital and on essentially nowhere else — measured, the
  // *median* player province carries zero — so a levy mustered from it could never form on the
  // provinces that actually need one. `defense` is the term every province has, and it is what
  // `defenderPower` already values a garrison by (16 per point against 2.5 per militiaman).
  //
  // Sized in *battle power*, not in bodies. The turnout used to be `militia + defense × 6` men,
  // which reads as the same strength but is not: a levy man is worth ~0.58 power in the field
  // (`armyPower` at the levy's morale and supply), so the walls came out at a fifth of what the
  // odds roll gives them, and every province a wave reached fell in the field where the roll had
  // held it. Dividing the garrison's power by the levy's power-per-man keeps the watched fight
  // and the hidden roll worth the same; `levyDrawn` keeps the walls' share out of the militia.
  // A province set to raise soldiers turns out more of them; one set to defend turns out its walls.
  // Both multipliers are 1 for every other focus, and outside Ascent this whole function returns
  // early anyway.
  const drawn = Math.floor(
    ((land.localSoldiers * 2.5 + land.defense * 16) / LEVY_POWER_PER_MAN)
    * getFocusGarrisonMult(state, land)
    * getFocusDefenseMult(state, land),
  );
  // Below a company there is nothing to form a line with — but the province is still ours, and
  // whose ground it is turns out to be the honest test of what is worth watching. A thin
  // garrison turns out a token company rather than surrendering the fight to a hidden roll;
  // `levyDrawn` remembers what it really took, so the conjured share never becomes militia.
  const muster = Math.max(GARRISON_LEVY_FLOOR, drawn);

  const levy: Army = {
    id: `levy-${land.id}-${state.turn}`,
    kingdomId: PLAYER_KINGDOM_ID,
    name: t('battle.levyOf', { land: land.name }),
    landId: land.id,
    units: {
      spearmen: Math.round(muster * 0.6),
      archers: Math.round(muster * 0.25),
      heavyInfantry: Math.round(muster * 0.15),
    },
    // Townsmen behind their own walls. Steadier than the first version's 70: sized to the same
    // power as the walls (see above), a levy that opened fifteen heart below the invader broke
    // first in every even exchange, and lost in the field the fights the odds roll had it winning.
    morale: 80,
    supply: 80,
    rations: 999,
    provisions: 999,
    level: 1,
    experience: 0,
    experienceToNextLevel: 120,
    isLevy: true,
    levyDrawn: land.localSoldiers,
  };
  land.localSoldiers = 0;
  state.armies.push(levy);
  return levy;
}

/**
 * The walls of a province the player is storming, turned out as a host so the assault has
 * something to fight (Dragon Ascent). Sized like the player's own levy — the garrison term of
 * `defenderPower` divided by a levy man's battle power — so the fought assault and the odds roll
 * agree on what those walls are worth. Nothing is drawn from the province's militia: the levy is
 * a picture of its defence, and is dropped by `dissolveGarrisonLevies` when the fight ends.
 */
export function raiseEnemyGarrisonLevy(state: GameState, land: Land): Army | undefined {
  if (state.gameMode !== 'ascent') return undefined;
  const men = Math.max(GARRISON_LEVY_FLOOR, Math.floor((land.localSoldiers * 2.5 + land.defense * 16) / LEVY_POWER_PER_MAN));
  const levy: Army = {
    id: `garrison-${land.id}-${state.turn}`,
    kingdomId: land.ownerId,
    name: t('ascent.battle.garrisonOf', { land: land.name }),
    landId: land.id,
    units: {
      spearmen: Math.round(men * 0.6),
      archers: Math.round(men * 0.25),
      heavyInfantry: Math.round(men * 0.15),
    },
    morale: 80,
    supply: 80,
    rations: 999,
    provisions: 999,
    level: 1,
    experience: 0,
    experienceToNextLevel: 120,
    isLevy: true,
    levyDrawn: 0,
  };
  state.armies.push(levy);
  return levy;
}

/**
 * Sends every surviving levy home. Called once no engagement is live, so a levy exists for exactly
 * the battle it was raised for.
 */
export function dissolveGarrisonLevies(state: GameState): void {
  const levies = state.armies.filter((army) => army.isLevy);
  if (levies.length === 0) return;
  for (const levy of levies) {
    const land = findLand(state, levy.landId);
    // Only what is left, and only if the province is still ours — a levy that lost its home has
    // nowhere to go back to.
    if (land && land.ownerId === PLAYER_KINGDOM_ID) {
      // At most what the province gave: the walls' share of the turnout goes back to the walls.
      land.localSoldiers += Math.min(totalUnits(levy), levy.levyDrawn ?? totalUnits(levy));
    }
  }
  state.armies = state.armies.filter((army) => !army.isLevy);
}

/**
 * Requests the player's tactical decision when an invader reaches a district defended by a
 * FIELD army (not just a garrison) — unless that army's hero holds full command (`autoDefend`),
 * in which case the general decides and the fight auto-resolves. Returns true when it deferred
 * the battle to the player (the caller must then skip auto-resolution this tick).
 */
function maybeRequestBattleDecision(state: GameState, army: Army, record: InvasionRecord, land: Land): boolean {
  if (state.pendingBattle) return true;
  // One watched engagement at a time. A contact made elsewhere while a fight is live is settled
  // the old way, by the odds roll, rather than queued: queuing froze the second invader for the
  // length of the first fight, and a three-host wave took three fights' worth of seasons to
  // land — battles filled seven ticks in ten and the next wave arrived on top of the last.
  const live = state.ascent?.activeBattle;
  if (live && !live.over) return false;
  const defender = state.armies.find((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id && totalUnits(a) > 0);
  // `autoDefend` means two different things: 'march home to intercept' (tickAutoDefend) and
  // 'fight without asking' (here). Dragon Ascent needs the first and not the second, so it
  // asks regardless unless the player has handed battles back to their generals. Inert in
  // every other mode.
  const ascentWatches = state.gameMode === 'ascent' && !state.ascent?.autoResolveBattles;
  // Nobody in the field. In Dragon Ascent the province turns out its own garrison — see
  // `raiseGarrisonLevy`, mustered by `beginBattle` once every other gate has passed, so a fight
  // that is not opened after all is still rolled against the walls counted once. Without a levy,
  // every province the hosts happened not to be standing on resolved its defence as a silent
  // dice roll, and a measured 320-tick run opened the battle screen exactly zero times.
  if (!defender && !ascentWatches) return false;
  if (defender?.autoDefend && !ascentWatches) return false;
  // The host standing here was told its general fights its own battles. Same question the sheet
  // asks, answered per host rather than per run.
  if (defender?.autoResolve) return false;
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
  // An assault of ours that will not be watched after all takes the roll it always took.
  if (pb.role === 'offence') {
    const attacker = pb.attackerArmyIds?.[0];
    if (attacker) attackLand(state, attacker, pb.landId);
    return;
  }
  resolveBattleRecord(state, pb, decision);
}

/**
 * Settles one invader's contact with a province.
 *
 * Split from `resolvePendingBattle` so a watched engagement, which owns its record itself, can
 * hand the outcome back without a `pendingBattle` on the state. `forced` states what the field
 * already decided — a side that broke has lost, and is not asked to roll again.
 */
export function resolveBattleRecord(
  state: GameState,
  pb: PendingBattle,
  decision: 'attack' | 'delegate' | 'retreat',
  forced?: 'defence' | 'invader',
): void {
  const army = state.armies.find((a) => a.id === pb.invaderArmyId);
  const land = findLand(state, pb.landId);
  const record = state.invasions?.find((r) => r.armyId === pb.invaderArmyId);
  if (!army || !land || !record) return;
  if (decision === 'retreat') {
    // Pull the field army to safety; the district falls to whatever garrison remains.
    retreatDefenders(state, land);
    resolveInvaderBattle(state, army, record, land, 1, forced);
    return;
  }
  // Attack: seize the initiative for a real defender edge. Delegate: a steady hero-led stand.
  resolveInvaderBattle(state, army, record, land, decision === 'attack' ? 1.22 : 1.06, forced);
}

function resolveInvaderBattle(
  state: GameState,
  army: Army,
  record: InvasionRecord,
  land: Land,
  defenderBonus = 1,
  forced?: 'defence' | 'invader',
): void {
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
  const victory = forced
    ? forced === 'invader'
    : preview.attackerPower >= preview.defenderPower * defenderBonus * siegeMult * fuzz;

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
    // A bloodied raider gives up and withdraws; a war host keeps grinding — unless it was
    // broken in the field, in which case it has been seen to run and does not get to try the
    // same gate again next tick. A host that runs leaves its dead, its baggage and its
    // stragglers behind: the spoils of a rout are the spoils of the fight, scaled to what it
    // lost, not withheld until the last man is hunted down.
    if (record.intent === 'raid' || forced === 'defence') {
      record.pillaged = true;
      record.plan = 'withdrawing';
      record.exitLandId = farthestNeutralFromCapital(state)?.id;
      if (forced === 'defence') {
        recordArmyDefeated(state, preTotal);
        grantRepelSpoils(state, Math.max(40, preTotal - totalUnits(army)), record);
        state.message = t('empire.invade.repelled', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
      }
      // A besieger that broke leaves the walls it was sitting under: the siege is lifted and
      // the host falls back to the ground it came from. Left in place, a broken host's siege
      // ran on and captured the province it had just been beaten in front of.
      const siege = state.siegeOrders.find((order) => order.armyId === army.id);
      if (siege) {
        state.siegeOrders = state.siegeOrders.filter((order) => order !== siege);
        army.landId = siege.fromLandId;
      }
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
  // The walls do not retreat: a garrison levy stays where it was raised and is dissolved back
  // into its province by `dissolveGarrisonLevies` once the fighting stops.
  const defenders = state.armies.filter((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id && !a.isLevy);
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
