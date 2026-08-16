import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../../game/constants';
import { MARCH_HOLD_TICKS, MARCH_REPROMPT_TICKS, XP_PER_LAND_TAKEN } from '../../game/ascentConfig';
import {
  bribeLand,
  claimBlockedReason,
  getBribeSuccessChance,
  getDiplomacySuppliesCost,
  getDiplomacyThreshold,
  getGoldBribeCost,
  getLandTrust,
  getNoblePower,
  getSettleHumansCost,
  getSettleTicks,
  settleLand,
  startDiplomaticClaim,
  startIntimidation,
} from '../AcquisitionSystem';
import { findLand, getAcquisitionOrder, getSiegeOrder } from '../LandSystem';
import { armyPower, createBattlePreview, findLandPath, issueMoveOrder } from '../WarSystem';
import { enqueueAscentPrompt } from './AscentState';
import { chargeAmbition } from './AmbitionSystem';
import { addAscentXp, landGarrisonPower } from './PowerSystem';
import { heroName, t } from '../../i18n';
import type {
  Army,
  AscentConquestMethod,
  AscentLaneState,
  ConquestMethodOption,
  ConquestTarget,
  GameState,
  Hero,
  Land,
} from '../../state/types';

const CONQUEST_METHODS: AscentConquestMethod[] = ['bribe', 'diplomacy', 'intimidation', 'settle', 'occupy', 'siege'];

/** How many provinces to offer. Enough for a real choice, few enough to read at a glance. */
const MAX_CONQUEST_TARGETS = 4;

export function ensureAscentLaneState(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  ascent.laneState ??= { conquer: 'ready', court: 'ready', world: 'ready', lastDecisionTurn: {} };
  ascent.laneState.lastDecisionTurn ??= {};
  ascent.conquestPlans ??= [];
  ascent.decisionPressure ??= 0;
  ascent.idleTicks ??= 0;
  ascent.promptCooldowns ??= {};
  ascent.promptWaiting ??= {};
  ascent.famineCooldown ??= 0;
  ascent.autoResolveBattles ??= false;
  ascent.lastWatchedWave ??= -1;
  ascent.drawnCourtCards ??= [];
  ascent.lastPromptTurn ??= 0;
  ascent.courtCardCooldown ??= 3;
  ascent.defenceSamples ??= [];
  ascent.raidCooldown ??= 0;
  ascent.tributeCooldown ??= 0;
  ascent.coalitionCooldownTicks ??= 0;
  ascent.vassalCooldown ??= 0;
  ascent.coalitionPending ??= false;
  ascent.reservedHeroIds ??= [];
  ascent.reserveSeatMark ??= 0;
  ascent.laneStats ??= {
    conquestsByMethod: emptyMethodTally(),
    appointments: 0,
    edictsEnacted: 0,
    parliamentAnswered: 0,
    envoyActions: {},
  };
  ascent.laneStats.conquestsByMethod ??= emptyMethodTally();
  for (const method of CONQUEST_METHODS) {
    ascent.laneStats.conquestsByMethod[method] ??= 0;
  }
  ascent.laneStats.appointments ??= 0;
  ascent.laneStats.edictsEnacted ??= 0;
  ascent.laneStats.parliamentAnswered ??= 0;
  ascent.laneStats.envoyActions ??= {};
}

function emptyMethodTally(): Record<AscentConquestMethod, number> {
  return Object.fromEntries(CONQUEST_METHODS.map((method) => [method, 0])) as Record<AscentConquestMethod, number>;
}

// ── Lane status ─────────────────────────────────────────────────────────────

export function refreshAscentLaneState(state: GameState): AscentLaneState | undefined {
  const ascent = state.ascent;
  if (!ascent) return undefined;
  ensureAscentLaneState(state);

  const claiming = state.acquisitionOrders.some((order) => order.buyerId === PLAYER_KINGDOM_ID)
    || state.siegeOrders.some((order) => order.attackerKingdomId === PLAYER_KINGDOM_ID);
  const targets = buildConquestTargets(state);
  ascent.laneState.conquer = claiming
    ? 'busy'
    : targets.some((target) => target.methods.some((method) => !method.blockedReason))
      ? 'ready'
      : 'blocked';

  // The court is "ready" when a decision is genuinely waiting: an unposted hero, an unspent
  // edict point, or a court that is about to speak. Alert when stability is sliding.
  const unposted = state.heroes.some((hero) => !hero.assignedTo);
  const edictPoints = state.mandate?.edictPoints ?? 0;
  ascent.laneState.court = state.court.stability < 35
    ? 'alert'
    : unposted || edictPoints > 0
      ? 'ready'
      : 'busy';

  const capital = state.lands.find((land) => land.id === ascent.capitalLandId);
  const capitalLost = Boolean(capital && capital.ownerId !== PLAYER_KINGDOM_ID);
  const ratio = ascent.defensePower > 0 ? ascent.threat / ascent.defensePower : 99;
  ascent.laneState.world = capitalLost || ratio >= 1.1
    ? 'alert'
    : state.invasions?.length
      ? 'busy'
      : 'ready';

  const pressureLanes = ['conquer', 'court', 'world'] as const;
  const anyReady = pressureLanes
    .some((lane) => ascent.laneState[lane] === 'ready' || ascent.laneState[lane] === 'alert');
  const anyBusy = Boolean(claiming || state.buildOrders.length || state.movementOrders.length || state.invasions?.length);
  ascent.idleTicks = anyReady || anyBusy ? 0 : ascent.idleTicks + 1;
  ascent.decisionPressure = anyReady || anyBusy
    ? Math.max(0, ascent.decisionPressure - 1)
    : ascent.decisionPressure + 1;

  return ascent.laneState;
}

// ── Targets ─────────────────────────────────────────────────────────────────

/**
 * Every province bordering the realm, each carrying the full menu of ways to take it.
 *
 * Ordering puts takeable provinces first, then the best odds — a list that led with an
 * unreachable fortress would read as "there is nothing to do here".
 */
export function buildConquestTargets(state: GameState): ConquestTarget[] {
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const seen = new Set<string>();
  const targets: ConquestTarget[] = [];

  for (const land of owned) {
    for (const neighborId of land.neighbors) {
      if (seen.has(neighborId)) continue;
      seen.add(neighborId);
      const candidate = state.lands.find((item) => item.id === neighborId);
      if (!candidate || candidate.ownerId === PLAYER_KINGDOM_ID || !candidate.isVisible) continue;
      targets.push(buildConquestTarget(state, candidate));
    }
  }

  return targets
    .sort((a, b) => {
      const aOpen = a.methods.some((method) => !method.blockedReason) ? 0 : 1;
      const bOpen = b.methods.some((method) => !method.blockedReason) ? 0 : 1;
      return aOpen - bOpen || b.bestChance - a.bestChance || a.garrison - b.garrison;
    })
    .slice(0, MAX_CONQUEST_TARGETS);
}

/** The full menu for one province, whether or not it is currently on the prompt. */
export function buildConquestTarget(state: GameState, land: Land): ConquestTarget {
  const methods = buildMethodOptions(state, land);
  const open = methods.filter((method) => !method.blockedReason);
  const busy = getAcquisitionOrder(state, land.id)
    ? t('ascent.conquer.busyClaim')
    : getSiegeOrder(state, land.id)
      ? t('ascent.conquer.busySiege')
      : undefined;

  return {
    landId: land.id,
    landName: land.name,
    landKind: land.ownerId !== NEUTRAL_OWNER_ID ? 'rival' : land.hasVillage ? 'village' : 'wilderness',
    ownerName: state.kingdoms.find((kingdom) => kingdom.id === land.ownerId)?.name,
    garrison: Math.round(landGarrisonPower(state, land)),
    rewardTag: rewardTag(land),
    bestChance: open.reduce((best, method) => Math.max(best, method.chance), 0),
    hasCertainMethod: open.some((method) => method.chance >= 100),
    methods,
    busyReason: busy,
  };
}

/**
 * Builds one card per acquisition path the province admits.
 *
 * Methods the province cannot ever admit (bribing empty wilderness, settling a walled town)
 * are omitted entirely; methods it admits but the realm cannot currently afford or staff come
 * through with a `blockedReason` and render greyed. That distinction is the whole teaching
 * surface of this mode: the player sees *why* an option is shut, and what would open it.
 */
export function buildMethodOptions(state: GameState, land: Land): ConquestMethodOption[] {
  const busy = getAcquisitionOrder(state, land.id)
    ? t('ascent.conquer.busyClaim')
    : getSiegeOrder(state, land.id)
      ? t('ascent.conquer.busySiege')
      : undefined;

  const options: ConquestMethodOption[] = [];
  const neutral = land.ownerId === NEUTRAL_OWNER_ID;

  if (neutral && land.hasVillage) {
    options.push(bribeOption(state, land));
    options.push(diplomacyOption(state, land));
    options.push(intimidationOption(state, land));
  }

  if (neutral && !land.hasVillage) {
    options.push(settleOption(state, land));
    options.push(occupyOption(state, land));
  }

  // Force is always on the table for a settled province, and the only path to a rival's.
  if (!neutral || land.hasVillage) {
    options.push(siegeOption(state, land));
  }

  if (busy) {
    for (const option of options) option.blockedReason ??= busy;
  }

  // Every method that files an acquisition order competes for the realm's claim parties. Siege and
  // occupation do not: one is a host reducing a province, the other a host walking onto empty
  // ground, and neither ties up an envoy. Shown greyed with the reason rather than hidden, which is
  // this file's standing contract — see the note on `buildMethodOptions` above.
  const claimBlocked = claimBlockedReason(state);
  if (claimBlocked) {
    for (const option of options) {
      if (CLAIM_METHODS.has(option.method)) option.blockedReason ??= claimBlocked;
    }
  }
  return options;
}

/** The methods that occupy one of the realm's claim slots. */
const CLAIM_METHODS: ReadonlySet<string> = new Set(['bribe', 'diplomacy', 'intimidation', 'settle']);

function bribeOption(state: GameState, land: Land): ConquestMethodOption {
  const cost = getGoldBribeCost(state, land);
  const chance = Math.round(getBribeSuccessChance(land) * 100);
  return {
    method: 'bribe',
    cost: { gold: cost },
    ticks: 1,
    loyalty: 68,
    chance,
    // The gold is spent before the roll and is lost on refusal, so an unaffordable bribe is a
    // hard block rather than a gamble the player can talk themselves into.
    blockedReason: state.resources.gold < cost
      ? t('ascent.conquer.needGold', { cost, have: Math.floor(state.resources.gold) })
      : undefined,
  };
}

function diplomacyOption(state: GameState, land: Land): ConquestMethodOption {
  const cost = getDiplomacySuppliesCost(state, land);
  const hero = bestDiplomat(state);
  const trust = getLandTrust(land, PLAYER_KINGDOM_ID);
  const threshold = getDiplomacyThreshold(land);
  const gain = Math.max(0.5, 1 + (hero?.stats.administration ?? 0) * 0.03);

  return {
    method: 'diplomacy',
    cost: { supplies: cost },
    ticks: Math.max(1, Math.ceil((threshold - trust) / gain)),
    loyalty: 85,
    // Diplomacy cannot fail once started — it only takes time — so the "chance" it shows is
    // how far along the trust already is, which is what actually varies between provinces.
    chance: Math.round(Math.min(99, Math.max(20, (trust / Math.max(1, threshold)) * 100))),
    heroId: hero?.id,
    blockedReason: !hero
      ? t('ascent.conquer.needHero')
      : state.resources.supplies < cost
        ? t('ascent.conquer.needSupplies', { cost, have: Math.floor(state.resources.supplies) })
        : undefined,
  };
}

function intimidationOption(state: GameState, land: Land): ConquestMethodOption {
  const army = bestAdjacentOwnedArmy(state, land);
  const power = army ? armyPower(state, army) : 0;
  const needed = Math.max(1, land.localSoldiers * 0.5);
  return {
    method: 'intimidation',
    ticks: army ? Math.max(1, Math.ceil(100 / Math.max(1, power / Math.max(1, land.localSoldiers * 4)))) : 0,
    loyalty: 50,
    chance: 100,
    armyId: army?.id,
    blockedReason: !army
      ? t('ascent.conquer.needBorderHost')
      : power < needed
        ? t('ascent.conquer.hostTooWeak')
        : undefined,
  };
}

function settleOption(state: GameState, land: Land): ConquestMethodOption {
  const cost = getSettleHumansCost();
  return {
    method: 'settle',
    cost: { humans: cost },
    ticks: getSettleTicks(land),
    loyalty: 65,
    chance: 100,
    blockedReason: state.resources.humans < cost
      ? t('ascent.conquer.needHumans', { cost, have: Math.floor(state.resources.humans) })
      : undefined,
  };
}

function occupyOption(state: GameState, land: Land): ConquestMethodOption {
  const army = bestReachableArmy(state, land);
  return {
    method: 'occupy',
    ticks: 1,
    loyalty: 55,
    chance: 100,
    armyId: army?.id,
    blockedReason: army ? undefined : t('ascent.conquer.needHost'),
  };
}

function siegeOption(state: GameState, land: Land): ConquestMethodOption {
  const { chance, armyId } = bestBattle(state, land);
  return {
    method: 'siege',
    ticks: 3,
    loyalty: 45,
    chance,
    armyId,
    blockedReason: !armyId ? t('ascent.conquer.needHost') : undefined,
  };
}

// ── Execution ───────────────────────────────────────────────────────────────

/** What came of one attempt: whether it was made, whether it took, and why it did not. */
export interface ConquestAttempt {
  /** The attempt was made. The prompt is answered either way — see the note on failure below. */
  attempted: boolean;
  /** It took. When false the province is no closer to being yours, and may have cost you. */
  ok: boolean;
  /** Why it did not take, phrased for the player. Only set when the attempt fell short. */
  reason?: string;
}

/**
 * Commits to one method against one province, through the same public APIs the classic
 * modes use. Every branch is an existing function — this mode adds no conquest maths.
 *
 * Whether the attempt was *made* is not the same as whether it worked. A refused bribe has
 * already spent the gold (`bribeLand` pays before it rolls), so reporting that as "not handled"
 * would leave the card open and hand the player unlimited free retries on a purchase they
 * already made.
 *
 * But the two used to collapse into one `true` on the way out, and the caller had no way to
 * tell them apart. The outcome went to `state.message` and to the conquest plan's `status`,
 * and this mode reads neither — so a bribe the nobles refused looked exactly like a tap that
 * did not register: the sheet closed, the gold was gone, and nothing was underway. The reason
 * is returned now, so the caller can put it in front of the player.
 */
export function executeConquestMethod(
  state: GameState,
  landId: string,
  method: AscentConquestMethod,
): ConquestAttempt {
  const ascent = state.ascent;
  const land = findLand(state, landId);
  if (!ascent || !land) return { attempted: false, ok: false };
  ensureAscentLaneState(state);

  // The method sheet only ever offers methods this province admits, so an attempt that gets
  // this far is legitimate even when the dice go against it.
  const option = buildMethodOptions(state, land).find((candidate) => candidate.method === method);
  if (!option || option.blockedReason) {
    return { attempted: false, ok: false, reason: option?.blockedReason };
  }

  // `state.message` is the only channel the acquisition systems report a refusal through, and
  // it is a single slot that nothing clears. Remembering what was in it lets a refusal that
  // wrote nothing — a march with no host free to take the order writes nothing — be told apart
  // from one that did, instead of serving last season's news as this attempt's reason.
  const messageBefore = state.message;
  let ok = false;
  switch (method) {
    case 'bribe':
      ok = bribeLand(state, landId);
      break;
    case 'diplomacy': {
      const hero = bestDiplomat(state);
      ok = Boolean(hero && startDiplomaticClaim(state, landId, hero.id));
      break;
    }
    case 'intimidation': {
      const army = bestAdjacentOwnedArmy(state, land);
      ok = Boolean(army && startIntimidation(state, landId, army.id));
      break;
    }
    case 'settle':
      ok = settleLand(state, landId);
      break;
    case 'occupy':
    case 'siege':
      ok = marchBestHostToTarget(state, landId);
      // The sheet offered this because *some* host could reach the province; the march declines
      // when every one of them is already committed elsewhere. Two different questions, so the
      // option's own `blockedReason` cannot answer this one.
      if (!ok) state.message = t('ascent.conquer.noHostFree');
      break;
  }

  const reason = ok
    ? undefined
    : state.message && state.message !== messageBefore
      ? state.message
      : t('ascent.conquer.cameToNothing');

  ascent.conquestPlans.push({
    id: `asc-conquest-${state.turn}-${landId}-${method}`,
    landId,
    method,
    createdTurn: state.turn,
    status: ok ? 'executing' : 'blocked',
    reason,
  });
  ascent.laneState.lastDecisionTurn.conquer = state.turn;

  if (ok) {
    ascent.laneStats.conquestsByMethod[method] += 1;
    // Only a military method sets the front: that is what the autopilot marches at. A bribe
    // or a claim resolves on its own clock and must not pull hosts off their current front.
    if (method === 'occupy' || method === 'siege') {
      ascent.frontLandId = landId;
      ascent.frontBlocked = false;
    }
  }
  // Quiet period either way — a refused bribe should not re-open the same card next tick.
  ascent.marchCooldown = MARCH_REPROMPT_TICKS;
  return { attempted: true, ok, reason };
}

/** Declines to advance; the autopilot consolidates instead, and stays quiet for a while. */
export function holdConquest(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.frontBlocked = false;
  ascent.frontLandId = undefined;
  ascent.marchCooldown = MARCH_HOLD_TICKS;
  ascent.laneState.lastDecisionTurn.conquer = state.turn;
}

/** Raises the province prompt. No-op when there is nothing conquerable to offer. */
export function offerConquestPrompt(state: GameState): boolean {
  const targets = buildConquestTargets(state);
  if (targets.length === 0) return false;
  enqueueAscentPrompt(state, { kind: 'conquer-target', targets });
  return true;
}

/** Raises the method sheet for one province — from the prompt, or from a map tap. */
export function offerConquestMethods(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId === PLAYER_KINGDOM_ID) return false;
  const target = buildConquestTarget(state, land);
  if (target.methods.length === 0) return false;
  enqueueAscentPrompt(state, { kind: 'conquer-method', target });
  return true;
}

/** Best odds any current host has against the standing front. 0 when there is no host. */
export function frontWinChance(state: GameState): number {
  const front = state.lands.find((land) => land.id === state.ascent?.frontLandId);
  return front ? bestBattle(state, front).chance : 0;
}

/** Awards momentum for provinces that changed hands into the realm this tick. */
export function detectConquests(state: GameState, ownedBefore: Set<string>): void {
  const ascent = state.ascent;
  if (!ascent) return;

  let gained = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID || ownedBefore.has(land.id)) continue;
    gained += 1;
    addAscentXp(state, XP_PER_LAND_TAKEN);
    if (ascent.frontLandId === land.id) {
      ascent.frontLandId = undefined;
      ascent.frontBlocked = false;
    }
  }

  // Ambition is charged here rather than at the order, and deliberately regardless of *who*
  // gave it: this is the one place a province is known to have actually joined the realm.
  // Charging at the order would bill the player for bribes that failed and sieges that broke,
  // and exempting the autopilot's routine purchases would let a passive run accumulate a
  // twenty-province empire for free — which is exactly how a declining player used to outlive
  // an engaged one.
  if (gained > 0) chargeAmbition(state, 'province', gained);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function marchBestHostToTarget(state: GameState, landId: string): boolean {
  const candidates = state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
    .filter((army) => !state.siegeOrders.some((order) => order.armyId === army.id))
    .filter((army) => Boolean(findLandPath(state, army.landId, landId)))
    .sort((a, b) => armyPower(state, b) - armyPower(state, a));

  let moved = false;
  // Everything but the last host: one stays home so a wave never lands on an empty realm.
  for (const army of candidates.slice(0, Math.max(1, candidates.length - 1))) {
    moved = issueMoveOrder(state, army.id, landId) || moved;
  }
  if (!moved && candidates[0]) {
    moved = issueMoveOrder(state, candidates[0].id, landId);
  }
  return moved;
}

function bestReachableArmy(state: GameState, land: Land): Army | undefined {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && Boolean(findLandPath(state, army.landId, land.id)))
    .sort((a, b) => armyPower(state, b) - armyPower(state, a))[0];
}

function bestAdjacentOwnedArmy(state: GameState, land: Land): Army | undefined {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
    .filter((army) => {
      const armyLand = findLand(state, army.landId);
      return Boolean(armyLand && armyLand.ownerId === PLAYER_KINGDOM_ID && armyLand.neighbors.includes(land.id));
    })
    .sort((a, b) => armyPower(state, b) - armyPower(state, a))[0];
}

/** An unposted hero, best at winning a province over by talking. */
/**
 * Who carries the realm's offer. An unposted champion first, then a minister pulled from their
 * desk — sending an envoy is exactly the errand a chancellor runs.
 *
 * The fallback is what makes this method exist at all. With only unposted heroes eligible, the
 * envoy row was blocked in *every single instance* logged across a full run, always with the
 * same reason: the court and the army between them absorb every champion the realm draws, so
 * "needs a hero with no posting" was a permanent state rather than a temporary one. A row that
 * can never be chosen is not teaching the player the system, it is noise on the card.
 *
 * Deliberately not a hero already commanding a host: stripping a general to send them abroad
 * leaves an army leaderless in the middle of a war.
 */
function bestDiplomat(state: GameState): Hero | undefined {
  const rank = (hero: Hero): number => hero.stats.diplomacy + hero.stats.administration;
  const byRank = (a: Hero, b: Hero): number => rank(b) - rank(a);

  const unposted = state.heroes.filter((hero) => !hero.assignedTo).sort(byRank)[0];
  if (unposted) return unposted;
  return state.heroes.filter((hero) => hero.assignedTo?.startsWith('court:')).sort(byRank)[0];
}

/**
 * Honest odds against a province: the real `createBattlePreview` when a host borders it,
 * otherwise its own formula against the garrison so a multi-leg march still shows a truthful
 * number. No host at all reads as 0%, which is the correct warning.
 */
function bestBattle(state: GameState, land: Land): { chance: number; armyId?: string } {
  let best = 0;
  let armyId: string | undefined;

  for (const army of state.armies.filter((candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID)) {
    const preview = createBattlePreview(state, army.id, land.id);
    let chance: number;
    if (preview) {
      chance = preview.winChance;
    } else if (findLandPath(state, army.landId, land.id)) {
      const attack = armyPower(state, army);
      chance = Math.round((attack / Math.max(1, attack + landGarrisonPower(state, land))) * 100);
    } else {
      continue; // unreachable: offering it would hand the player an order their host refuses
    }
    if (!armyId || chance > best) {
      best = chance;
      armyId = army.id;
    }
  }
  return { chance: best, armyId };
}

/** The one-word reason to want this province, shown as the card's reward tag. */
function rewardTag(land: Land): string {
  if (land.terrainSummary.shrine > 0) return 'shrine';
  const { gold, food, supplies } = land.outputs;
  const best = Math.max(gold, food, supplies);
  if (best <= 0) return 'plain';
  if (best === gold) return 'gold';
  if (best === supplies) return 'iron';
  if (best === food) return 'food';
  return 'plain';
}

/** Formats a hero for a method card's detail line. */
export function methodHeroName(state: GameState, heroId: string | undefined): string | undefined {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  return hero ? heroName(hero) : undefined;
}
