import { hasCapstone } from '../decree/SchoolSystem';
import { proclamationInForce, tattooedArms, SAT_THAT_ROUT_FLOOR } from '../decree/rules';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  BATTLE_ADVANCE_PER_TICK,
  BATTLE_APPROACH_MAX_BEATS,
  BATTLE_BASE_ROUNDS,
  BATTLE_BEATS_PER_TICK,
  BATTLE_CHARGE_COVER,
  BATTLE_CHARGE_MORALE,
  BATTLE_CHARGE_TRADE,
  BATTLE_COUNTER_MORALE,
  BATTLE_FOCUS_MULT,
  BATTLE_HOLD_TRADE,
  BATTLE_LOOSE_TRADE,
  BATTLE_LOOSE_VOLLEY,
  BATTLE_POSTURE_COUNTER,
  BATTLE_MAX_ROUNDS,
  BATTLE_MOMENT_TICKS,
  BATTLE_MOMENT_BONUS_BEATS,
  BATTLE_MOMENT_EARLIEST,
  BATTLE_MOMENT_GAP,
  BATTLE_MOMENTS_PER_FIGHT,
  BATTLE_MORALE_PER_LOSS,
  BATTLE_MORALE_WIN_GAIN,
  BATTLE_RALLY_BASE,
  BATTLE_REFORM_COST,
  BATTLE_RESERVE_SHARE,
  BATTLE_ROUND_BITE,
  BATTLE_RALLY_DESPERATION,
  BATTLE_ROUT_LOSS_SHARE,
  BATTLE_ROUT_MORALE,
  BATTLE_SPREAD_MULT,
  BATTLE_VOLLEY_BITE,
  BATTLE_WITHDRAW_RECOVERY,
} from '../../game/ascentConfig';
import { raiseEnemyGarrisonLevy, raiseGarrisonLevy, resolveBattleRecord } from '../empire/InvasionSystem';
import { pushToast } from '../empire/notifications';
import {
  applyAttackOutcome, armyPower, compositionMatchup, issueMoveOrder, terrainDefenseMultiplier,
} from '../WarSystem';
import { occupyEmptyLand } from '../AcquisitionSystem';
import { findLand } from '../LandSystem';
import { landGarrisonPower } from './PowerSystem';
import { battleLine, enrolArrivals, hostHeadcount, ourHosts, theirHosts } from './battleMembership';
import { isAutoHost } from './armyOrders';
import { t } from '../../i18n';
import { BATTLE_MOMENTS, eligibleMoments } from '../../data/ascent/battleMoments';
import type { BattleMomentDef, MomentContext, MomentEffect } from '../../data/ascent/battleMoments';
import type {
  Army, AscentBattle, BattleBeatHost, BattleMoment, BattleMomentAnswer, BattlePosture,
  GameState, Land, PendingBattle,
} from '../../state/types';

// Re-exported so the screen and the harness keep one import for the fight's vocabulary.
export { battleLine, isEngaged, ourHosts, theirHosts } from './battleMembership';

/**
 * The fight you can actually watch — and, more to the point, one worth watching.
 *
 * The first version of this was a metronome. `bleed` scaled every unit type equally so
 * composition never shifted, `armyPower` stayed linear in headcount, and the power ratio barely
 * moved — which meant losses per beat were near-constant and nothing surprising could happen.
 * Worse, of the two postures one was strictly better: holding traded 7% more efficiently *and*
 * lost fewer men, with the only counterweight an end-of-fight bonus the player never saw. With
 * no tipping point and no real choice, "leave it to my generals" was the correct answer, and a
 * screen whose skip button is right has failed.
 *
 * Three things fix that, and all three reuse machinery that was already sitting here:
 *
 *  - **Morale is the currency.** `armyPower` already multiplies by `army.morale / 100`, and no
 *    battle code ever touched it. Writing morale down as casualties mount makes a sagging line
 *    compound into collapse on its own — the tipping point, for free.
 *  - **The approach is the archery phase.** `army.units.archers` already exists. Arrows fly
 *    while the lines close, so bringing bowmen pays off visibly and four dead seconds become
 *    the opening.
 *  - **Charging buys cover.** Closing fast means eating less of their fire. That is what finally
 *    gives charge a case against hold's better melee trade.
 */

const totalUnits = hostHeadcount;

/**
 * How many beats the queue keeps before the oldest are dropped.
 *
 * A screen that is open drains this every `BATTLE_TICK_MS`, so it never fills. A headless run
 * never drains at all, and a long engagement would otherwise grow an entry per beat forever —
 * `verify-ascent` fights hundreds of them in one run.
 */
const BEAT_QUEUE_CAP = 64;

/** A side's columns as the view needs them: who is standing, how many, and how steady. */
function beatHosts(hosts: Army[]): BattleBeatHost[] {
  return hosts.map((host) => ({ id: host.id, men: totalUnits(host), morale: Math.round(host.morale) }));
}

/**
 * Writes down what this beat looked like, for a screen that will replay it later.
 *
 * Called at the end of every beat and nowhere else. It reads state and pushes an object — it
 * never calls `Math.random`, so the simulation's RNG order is untouched and every mode's
 * regression fingerprint holds.
 */
function recordBeat(
  battle: AscentBattle,
  phase: 'approach' | 'clash',
  ours: Army[],
  theirs: Army[],
  ourLoss: number,
  theirLoss: number,
  line?: string,
  broke?: string[],
): void {
  const beats = (battle.beats ??= []);
  beats.push({
    phase,
    round: battle.round,
    ourNow: battle.ourNow,
    theirNow: battle.theirNow,
    ourAdvance: battle.ourAdvance,
    theirAdvance: battle.theirAdvance,
    ourMorale: battle.ourMorale,
    theirMorale: battle.theirMorale,
    ourLoss: Math.round(ourLoss),
    theirLoss: Math.round(theirLoss),
    ourHosts: beatHosts(ours),
    theirHosts: beatHosts(theirs),
    line,
    broke: broke && broke.length > 0 ? broke : undefined,
  });
  if (beats.length > BEAT_QUEUE_CAP) beats.splice(0, beats.length - BEAT_QUEUE_CAP);
}

/**
 * Whether this fight is worth stopping the game for: **a wave that reached ground we hold.**
 *
 * Not "any fight we are losing" — that odds clause was tried and barely filtered anything, since
 * a single intercepting host is almost always weaker than a wave, so "not clearly winning"
 * described 47 of 48 engagements. A rule that admits everything is not a rule.
 *
 * But the two-clause version that replaced it (a Great Invasion, or the capital) was far too
 * narrow in the other direction: measured, the live battle — the best thing this mode has —
 * opened **0.4 times per run**, so most players never saw it at all and auto-resolve became the
 * sensible default by neglect.
 *
 * Whose ground it is turns out to be the honest filter. A host we sent to storm someone else's
 * walls is a march, and the mode's fantasy is not marching; it is watching the realm you built
 * hold the line. That distinction cuts the same 48 engagements down without an odds clause, and
 * the once-per-wave cap in `beginBattle` does the rest.
 */
/**
 * Whose ground it is turned out to be too generous on its own.
 *
 * Measured after that rule shipped: the screen opened **28.3 times per run** against a design
 * target of 3–5, because every wave and every raid that touched any owned province qualified. A
 * showpiece that opens two dozen times a run is not a showpiece, it is a chore — and the auto-
 * resolve toggle becomes the sensible default by neglect, which is the exact failure the watchable
 * battle was built to fix.
 *
 * So ownership is now the *first* gate rather than the only one, and an ordinary defence must also
 * be genuinely in doubt. The capital and a Great Invasion still always open: those are the fights
 * the run turns on, and a player who is about to lose their seat should never learn about it from
 * a strip of text.
 */
/**
 * The odds a defence would be fought at, as the selection gate reads them.
 *
 * Walls and field hosts on one side; everything standing on the province or one hop from it on the
 * other, because the invader that made contact is stood on the *adjacent* land when this is asked.
 */
function watchOdds(state: GameState, land: Land): { defence: number; attack: number; columns: number } {
  const defence = landGarrisonPower(state, land)
    + state.armies
      .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === land.id)
      .reduce((sum, army) => sum + armyPower(state, army), 0);
  const near = state.armies.filter((army) => army.kingdomId !== PLAYER_KINGDOM_ID
    && (army.landId === land.id || land.neighbors.includes(army.landId)));
  return {
    defence,
    attack: near.reduce((sum, army) => sum + armyPower(state, army), 0),
    columns: near.length,
  };
}

/** How many enemy columns stand on a province or one hop from it. Used to break ties. */
export function enemyColumnsAt(state: GameState, land: Land): number {
  return watchOdds(state, land).columns;
}

function worthWatching(state: GameState, landId: string, isGreat: boolean): boolean {
  const ascent = state.ascent;
  // The arena exists to watch one specific matchup. Every clause below asks whether a fight is
  // worth interrupting a *run* for, which is not a question the arena is asking.
  if (ascent?.arena) return true;
  const land = findLand(state, landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) return false;

  const { defence, attack } = watchOdds(state, land);
  if (defence <= 0 || attack <= 0) return false;
  const ratio = attack / defence;

  // A Great Invasion is the wave the run turns on, and it has a floor but no ceiling.
  //
  // It used to be unconditional on the grounds that a great wave is usually in band anyway. It is
  // not: with the capital's exemption gone, **every single remaining walkover was a Great Invasion
  // on the seat** — nine of ten, at 0.02 to 0.15, each running the full twenty-two rounds with the
  // defence never dropping below 64% strength. A wave the realm has already beaten is not a
  // turning point because it was labelled one.
  //
  // No ceiling, though. A great invasion the player is losing badly is exactly the fight they have
  // to be in the room for, and the ordinary band's upper limit would hide it.
  if (isGreat) return ratio >= GREAT_WATCH_MIN;

  // The capital keeps its priority and loses its exemption.
  //
  // It used to open unconditionally, and that single clause is most of why the screen was boring.
  // Measured over 44 watched fights across six seeded runs: **73% were on the seat**, and the seat
  // turns out the realm's largest levy — 2,574 against 269, 4,237 against 66, 5,303 against 136.
  // Median opening odds across everything watched were **0.20** and 64% were walkovers. The screen
  // was mostly being used to show the player a garrison of four thousand stepping on a raid.
  //
  // A seat genuinely at risk still always opens: nobody should learn they are about to lose their
  // capital from a strip of text, and neither should a player whose grace clock is already running.
  // Below that mark the seat queues up with everywhere else.
  const isCapital = ascent?.capitalLandId === landId;
  if (isCapital && (ratio >= CAPITAL_AT_RISK_RATIO || (ascent?.capitalLostTicks ?? 0) > 0)) return true;

  // A defence is rationed, not merely filtered.
  //
  // The odds band was tried on its own first and barely moved the count — 28.3 openings a run
  // became 25.9 — because with provincial militia most defences *are* genuinely in doubt, so the
  // band admits nearly all of them. Being worth watching and being worth *stopping the game for*
  // are different questions, and only the second one is bounded.
  if (ascent && ascent.wave - (ascent.lastWatchedWave ?? -99) < ORDINARY_WATCH_WAVE_GAP) return false;

  // In doubt, measured the honest way: what is actually standing here against what actually
  // defends here. A raid the province will brush off, and an assault it cannot survive, are both
  // decided before the first exchange — neither is worth stopping the game for.
  return ratio >= WATCH_ODDS_BAND_MIN && ratio <= WATCH_ODDS_BAND_MAX;
}

/**
 * The band of attacker-to-defender power in which a defence is worth watching.
 *
 * Narrowed from 0.55-2.20. The old floor admitted a fight the province wins by a factor of two,
 * which is a result and not a battle; the old ceiling admitted one it loses by the same margin.
 */
const WATCH_ODDS_BAND_MIN = 0.65;
const WATCH_ODDS_BAND_MAX = 1.8;
/**
 * What "the seat is genuinely at risk" means: the enemy brings at least this share of the line
 * standing on the capital. Below it the capital is an ordinary defence and takes its turn.
 */
const CAPITAL_AT_RISK_RATIO = 0.6;
/**
 * The floor a Great Invasion must clear. Lower than the ordinary band's, because a great wave
 * earns some benefit of the doubt; there is deliberately no matching ceiling.
 */
const GREAT_WATCH_MIN = 0.5;
/**
 * Waves of quiet before a defence may take the screen again. Great Invasions ignore it.
 *
 * Dropped from two to one when the capital and the great waves stopped being exempt: those two
 * clauses had been supplying most of the run's fights, and with both rationed the screen opened
 * 3.2 times a run against a design target of four to six. The gap exists to stop a second fight
 * every wave, and at one wave of quiet it still does.
 */
const ORDINARY_WATCH_WAVE_GAP = 1;

/** Share of a host's strength held back at camp, available to commit mid-fight. */
function splitReserve(army: Army): { spearmen: number; archers: number; heavyInfantry: number } {
  const take = (n: number): number => Math.floor(n * BATTLE_RESERVE_SHARE);
  const reserve = {
    spearmen: take(army.units.spearmen),
    archers: take(army.units.archers),
    heavyInfantry: take(army.units.heavyInfantry),
  };
  army.units.spearmen -= reserve.spearmen;
  army.units.archers -= reserve.archers;
  army.units.heavyInfantry -= reserve.heavyInfantry;
  return reserve;
}

export function beginBattle(state: GameState): boolean {
  const ascent = state.ascent;
  const pending = state.pendingBattle;
  if (!ascent || !pending || ascent.activeBattle) return false;
  if (pending.role === 'offence') return beginAssault(state, pending);

  const invader = state.armies.find((army) => army.id === pending.invaderArmyId);
  if (!invader) return false;
  if (!worthWatching(state, pending.landId, pending.isGreat)) return false;

  // One watched engagement per province per wave.
  //
  // The cap exists because `maybeRequestBattleDecision` fires on every tick an invader stands on a
  // contested province, not once per battle, so a single siege of the capital used to raise the
  // modal again and again. But keying it on the wave alone meant a wave that struck three
  // provinces was watchable at exactly one of them, and combined with the field-host requirement
  // above, a measured run opened the battle screen **zero** times in 320 ticks. Keying it on the
  // province keeps the repeat-suppression that motivated the cap and lets a wave that attacks on
  // two fronts be fought on both.
  const watchKey = `${ascent.wave}:${pending.landId}`;
  if (ascent.lastWatchedKey === watchKey) return false;

  // Who is actually on the field. Rolled explicitly, because the invader that made contact is
  // standing on the *adjacent* province — keyed on the ground itself, every watched defence used
  // to open against nobody and end, as a hidden roll, inside the tick that opened it.
  const draft: AscentBattle = {
    ...emptyBattle(pending),
    role: 'defence',
    key: watchKey,
  };
  enrolArrivals(state, draft);
  if (theirHosts(state, draft).length === 0) return false;

  // The province's own walls turn out beside whatever host stands there — not only when nobody
  // does. Measured, a 333-man host standing in the capital *replaced* seventeen hundred men of
  // walls, because the levy was raised only for an empty province; the odds roll had always
  // counted both. Raised here, after every gate, so a fight that is not opened after all is
  // still rolled against walls counted once.
  const land = findLand(state, pending.landId);
  if (land && !state.armies.some((army) => army.isLevy && army.landId === land.id)) {
    raiseGarrisonLevy(state, land);
    enrolArrivals(state, draft);
  }
  const ours = ourHosts(state, draft);
  const defender = battleLine(state, draft);
  if (!defender) return false;

  ascent.lastWatchedKey = watchKey;
  ascent.lastWatchedWave = ascent.wave;

  // The reserve is held back from a field host when there is one — men at camp, not walls —
  // and the rally is whichever general is on the field, not whichever host happens to be largest.
  const fieldHosts = ours.filter((host) => !host.isLevy).sort((a, b) => totalUnits(b) - totalUnits(a));
  const reserveHost = fieldHosts[0] ?? defender;
  const reserve = splitReserve(reserveHost);
  const theirs = theirHosts(state, draft);
  const oursTotal = ours.reduce((n, h) => n + totalUnits(h), 0);
  const theirsTotal = theirs.reduce((n, h) => n + totalUnits(h), 0);
  const scale = Math.min(1, (theirsTotal + oursTotal) / 2400);
  const totalRounds = Math.round(BATTLE_BASE_ROUNDS + (BATTLE_MAX_ROUNDS - BATTLE_BASE_ROUNDS) * scale);
  const generalId = fieldHosts.find((host) => host.generalHeroId)?.generalHeroId;
  const general = state.heroes.find((hero) => hero.id === generalId);

  ascent.activeBattle = {
    ...draft,
    reserveHostId: reserveHost.id,
    totalRounds,
    ourStartMorale: defender.morale,
    ourMorale: defender.morale,
    theirMorale: invader.morale,
    ourHostCount: ours.length,
    theirHostCount: theirs.length,
    // Summed across every host present, not just the strongest. Reading these off one army made
    // a two-column defence open showing only its vanguard's numbers.
    ourStart: oursTotal + reserve.spearmen + reserve.archers + reserve.heavyInfantry,
    theirStart: theirsTotal,
    ourNow: oursTotal,
    theirNow: theirsTotal,
    reserve,
    // Rally is the general's, so a host with nobody at its head simply does not get one.
    rallySpent: !general,
    rallyPower: general ? Math.round(BATTLE_RALLY_BASE + general.stats.martial * 0.25) : 0,
    // The ground the defender is standing on. Already used by `defenderPower`; stated on the
    // screen here so intercepting on high ground becomes a decision back on the map.
    terrainEdge: land ? terrainDefenseMultiplier(land) : 1,
  };

  // The engagement now owns its own record: `finishBattle` rebuilds what the invasion code needs
  // from the battle itself. Leaving the pending record in place let the next tick "resolve" the
  // same fight a second time, underneath the one being watched.
  state.pendingBattle = undefined;
  state.isPaused = false;

  // Deliberately does *not* raise a prompt.
  //
  // A prompt goes through `drainAscentPrompts`, which sets `isPaused`, which stops
  // `ConquestScene.update` — and a frozen world is incompatible with marching reinforcements to
  // the fight. The battle is ordinary state now: the tick advances it, and the screen opens
  // itself when it starts (see `ConquestUIScene.maybeAutoOpenBattle`) and holds the world only
  // until the first order is given.
  pushToast(state, t('ascent.battle.begins', { land: pending.landName, kingdom: pending.kingdomName }), 'threat');

  // Relief marches itself. Requiring the player's host to be standing on the exact contested
  // province was one of the four gates that multiplied into a screen seen 0.8 times per run —
  // one army on a map of ten provinces is almost never on the right one. A host one province
  // away now turns for the fight on its own; `enrolArrivals` picks it up the beat it arrives, so
  // the map's real distances stay the clock and nothing teleports.
  summonAdjacentRelief(state, pending.landId);
  return true;
}

/**
 * A host of ours storming someone else's province, watched.
 *
 * Every offensive used to be a hidden roll by design (`worthWatching` admits only ground we
 * hold). The player's own attacks — a standing order to storm, a claim with a chosen host — now
 * open the same screen: our hosts stand on their origin and close on the walls, which are turned
 * out as a garrison levy sized to what the odds roll would have valued them at.
 */
function beginAssault(state: GameState, pending: PendingBattle): boolean {
  const ascent = state.ascent!;
  const land = findLand(state, pending.landId);
  const attackers = (pending.attackerArmyIds ?? [])
    .map((id) => state.armies.find((army) => army.id === id))
    .filter((army): army is Army => Boolean(army && army.kingdomId === PLAYER_KINGDOM_ID && totalUnits(army) > 0));
  if (!land || attackers.length === 0) return false;

  const key = `off:${state.turn}:${pending.landId}`;
  const draft: AscentBattle = {
    ...emptyBattle(pending),
    role: 'offence',
    key,
    ourArmyIds: attackers.map((army) => army.id),
    approachBeats: 0,
  };
  // The walls stand up to be fought. Only once: a second assault on the same province while
  // one garrison is still on its feet fights that garrison.
  if (!state.armies.some((army) => army.isLevy && army.kingdomId !== PLAYER_KINGDOM_ID && army.landId === land.id)) {
    raiseEnemyGarrisonLevy(state, land);
  }
  enrolArrivals(state, draft);
  const theirs = theirHosts(state, draft);
  const ours = ourHosts(state, draft);
  const line = battleLine(state, draft);
  if (!line || theirs.length === 0) return false;

  ascent.lastAssaultKey = key;
  const fieldHosts = ours.slice().sort((a, b) => totalUnits(b) - totalUnits(a));
  const reserveHost = fieldHosts[0];
  const reserve = splitReserve(reserveHost);
  const oursTotal = ours.reduce((n, h) => n + totalUnits(h), 0);
  const theirsTotal = theirs.reduce((n, h) => n + totalUnits(h), 0);
  const scale = Math.min(1, (theirsTotal + oursTotal) / 2400);
  const totalRounds = Math.round(BATTLE_BASE_ROUNDS + (BATTLE_MAX_ROUNDS - BATTLE_BASE_ROUNDS) * scale);
  const generalId = fieldHosts.find((host) => host.generalHeroId)?.generalHeroId;
  const general = state.heroes.find((hero) => hero.id === generalId);

  ascent.activeBattle = {
    ...draft,
    reserveHostId: reserveHost.id,
    totalRounds,
    ourStartMorale: line.morale,
    ourMorale: line.morale,
    theirMorale: theirs[0].morale,
    ourHostCount: ours.length,
    theirHostCount: theirs.length,
    ourStart: oursTotal + reserve.spearmen + reserve.archers + reserve.heavyInfantry,
    theirStart: theirsTotal,
    ourNow: oursTotal,
    theirNow: theirsTotal,
    reserve,
    rallySpent: !general,
    rallyPower: general ? Math.round(BATTLE_RALLY_BASE + general.stats.martial * 0.25) : 0,
    // The ground is theirs this time: the edge goes to the walls, not to us.
    terrainEdge: terrainDefenseMultiplier(land),
  };
  state.pendingBattle = undefined;
  state.isPaused = false;
  pushToast(state, t('ascent.battle.assaultBegins', { land: land.name }), 'threat');
  return true;
}

/** A battle at its opening beat, before anyone has been counted. */
function emptyBattle(pending: PendingBattle): AscentBattle {
  return {
    landId: pending.landId,
    landName: pending.landName,
    invaderArmyId: pending.invaderArmyId,
    kingdomId: pending.kingdomId,
    kingdomName: pending.kingdomName,
    isGreat: pending.isGreat,
    round: 0,
    totalRounds: BATTLE_BASE_ROUNDS,
    posture: 'hold',
    theirPosture: 'press',
    brokenHostIds: [],
    ourLostTotal: 0,
    focusHostId: undefined,
    ourStartMorale: 0,
    ourAdvance: 0,
    theirAdvance: 0,
    ourMorale: 0,
    theirMorale: 0,
    ourHostCount: 0,
    theirHostCount: 0,
    ourStart: 0,
    theirStart: 0,
    ourNow: 0,
    theirNow: 0,
    reserve: { spearmen: 0, archers: 0, heavyInfantry: 0 },
    reserveSpent: false,
    rallySpent: true,
    rallyPower: 0,
    terrainEdge: 1,
    outcome: 'fighting',
    log: [],
    over: false,
    ourArmyIds: [],
    theirArmyIds: [],
  };
}

/** The invasion record a finished fight hands back to the shared invasion code. */
function battleRecord(battle: AscentBattle, invaderArmyId = battle.invaderArmyId): PendingBattle {
  return {
    invaderArmyId,
    landId: battle.landId,
    landName: battle.landName,
    kingdomId: battle.kingdomId,
    kingdomName: battle.kingdomName,
    isGreat: battle.isGreat,
    attackerPower: 0,
    defenderPower: 0,
  };
}

/** Orders idle player hosts on neighbouring provinces to march to the contested one. */
export function summonAdjacentRelief(state: GameState, landId: string): void {
  const land = findLand(state, landId);
  if (!land) return;
  const neighbours = new Set(land.neighbors);
  const capitalId = state.ascent?.capitalLandId;
  const candidates = state.armies.filter(
    (army) => army.kingdomId === PLAYER_KINGDOM_ID
      && !army.isLevy
      && neighbours.has(army.landId)
      // The seat keeps its garrison. Relief drawn from the capital left it to a roll it lost,
      // and the run ended while its hosts were winning the fight next door.
      && army.landId !== capitalId
      // Only hosts the autopilot may move, or one whose own standing order is to defend this very
      // province: a host told to hold its ground, or to go somewhere else, is not pulled off it.
      && (isAutoHost(army) || (army.orders?.kind === 'defend' && army.orders.landId === landId))
      && totalUnits(army) > 0
      && !state.movementOrders.some((order) => order.armyId === army.id)
      && !state.siegeOrders.some((order) => order.armyId === army.id),
  );
  for (const army of candidates.slice(0, 2)) {
    if (issueMoveOrder(state, army.id, landId)) {
      pushToast(state, t('ascent.battle.relief', { name: army.name, land: land.name }), 'info');
    }
  }
}

/**
 * What the invader decides to do this beat.
 *
 * Until now the enemy had no posture at all: it advanced, it traded on fixed multipliers, and
 * it never reacted to anything. Beating something that cannot respond is arithmetic rather than
 * skill, and it was the single largest thing holding this screen at 7.
 *
 * Doctrine comes from `kingdom.personality`, which already exists with six values and an
 * established weighting precedent (`personalityWeight`, InvasionSystem). On top of the
 * personality sits a reactive layer both share — press a line that is wavering, steady your own
 * when it is — so the player is reading an opponent rather than a script.
 *
 * The invader deliberately gets no reserve and no rally. That asymmetry is the player's edge,
 * and it is what keeps a fair fight winnable.
 */
function enemyPosture(state: GameState, battle: AscentBattle): BattlePosture {
  const kingdom = state.kingdoms.find((candidate) => candidate.id === battle.kingdomId);
  const personality = kingdom?.personality ?? 'aggressive';
  const theirEdge = battle.theirMorale - battle.ourMorale;

  // Every branch is deterministic on state the player can see. That is what keeps the ring a read
  // rather than a guessing game: `battleTelegraph` shows this same value before the beat resolves,
  // and it must be the stance actually taken or the whole thing collapses into a coin flip.
  const bows = theirBowShare(state, battle);
  switch (personality) {
    // Cautious powers spend other people's soldiers reluctantly: they stand off and shoot while
    // they have the archers for it, and only close when clearly ahead.
    case 'economic':
    case 'diplomatic':
      if (theirEdge > 18) return 'press';
      return bows > 0.3 ? 'loose' : 'hold';
    // A defensive doctrine shoots first and only closes once it has the upper hand.
    case 'defensive':
      if (theirEdge > 8) return 'press';
      return bows > 0.22 ? 'loose' : 'hold';
    // Aggressive and expansionist powers come on hard, and only steady up if badly beaten.
    default:
      return theirEdge < -20 ? 'hold' : 'press';
  }
}

/**
 * How one side's arms meet the other's, summed across every host on the field.
 *
 * `compositionMatchup` compares two hosts; a field can hold several a side, so the two sides are
 * pooled into one notional force each. Pooling rather than averaging per-pair, because a wing of
 * archers behind a wall of spears is one army's composition, not two armies' worth of separate
 * matchups.
 */
function matchupAcross(mine: Army[], theirs: Army[]): number {
  const pool = (hosts: Army[]): { spearmen: number; archers: number; heavyInfantry: number } => hosts.reduce(
    (total, host) => ({
      spearmen: total.spearmen + host.units.spearmen,
      archers: total.archers + host.units.archers,
      heavyInfantry: total.heavyInfantry + host.units.heavyInfantry,
    }),
    { spearmen: 0, archers: 0, heavyInfantry: 0 },
  );
  const foe = pool(theirs);
  if (foe.spearmen + foe.archers + foe.heavyInfantry <= 0) return 1;
  return compositionMatchup(pool(mine), { units: foe } as Army);
}

/**
 * The stance cycle: charge > loose > brace > charge.
 *
 * Charge closes before the volleys tell; loose shoots a line that is standing still; a braced
 * line breaks a rush. Returns what `attacker` gets for meeting `defender` with this stance.
 */
export function posturesCounter(attacker: BattlePosture, defender: BattlePosture): boolean {
  return (attacker === 'press' && defender === 'loose')
    || (attacker === 'loose' && defender === 'hold')
    || (attacker === 'hold' && defender === 'press');
}

/** The trade a stance makes before the counter is applied. */
function tradeFor(posture: BattlePosture): { dealt: number; taken: number } {
  if (posture === 'press') return BATTLE_CHARGE_TRADE;
  if (posture === 'loose') return BATTLE_LOOSE_TRADE;
  return BATTLE_HOLD_TRADE;
}

/**
 * A stance's trade with the ring folded in.
 *
 * Countering deals harder and takes less; being countered is the mirror. Applied to the trade
 * rather than to the final loss so that it composes with everything else the exchange already
 * multiplies by, instead of becoming a special case bolted onto the end.
 */
function tradeAgainst(mine: BattlePosture, theirs: BattlePosture): { dealt: number; taken: number } {
  const base = tradeFor(mine);
  if (posturesCounter(mine, theirs)) {
    return { dealt: base.dealt * BATTLE_POSTURE_COUNTER.dealt, taken: base.taken * BATTLE_POSTURE_COUNTER.taken };
  }
  if (posturesCounter(theirs, mine)) {
    return { dealt: base.dealt * BATTLE_POSTURE_COUNTER.taken, taken: base.taken * BATTLE_POSTURE_COUNTER.dealt };
  }
  return base;
}

/** What share of the invader's strength is bowmen — the thing that decides whether they stand off. */
function theirBowShare(state: GameState, battle: AscentBattle): number {
  const hosts = theirHosts(state, battle);
  const men = hosts.reduce((total, host) => total + totalUnits(host), 0);
  if (men <= 0) return 0;
  return hosts.reduce((total, host) => total + host.units.archers, 0) / men;
}

/**
 * The stance the invader will take on the next beat, for the screen to print.
 *
 * Resolved from the same function the fight uses and nothing else. A telegraph that could differ
 * from what happens is worse than none: it would teach the player a rule the game does not keep.
 */
export function battleTelegraph(state: GameState): BattlePosture | undefined {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) return undefined;
  const offence = battle.role === 'offence';
  const theirs = theirHosts(state, battle);
  if (theirs.length === 0) return undefined;
  if (offence && theirs.every((host) => host.isLevy)) return 'hold';
  return enemyPosture(state, battle);
}

/** Strips a share of a host's strength, spread across its unit types. */
function bleed(army: Army, share: number): number {
  const before = totalUnits(army);
  const keep = Math.max(0, 1 - share);
  army.units.spearmen = Math.floor(army.units.spearmen * keep);
  army.units.archers = Math.floor(army.units.archers * keep);
  army.units.heavyInfantry = Math.floor(army.units.heavyInfantry * keep);
  return before - totalUnits(army);
}

/** Kills a flat number of men, taken from the front ranks first. */
function bleedCount(army: Army, count: number): number {
  const before = totalUnits(army);
  let left = Math.max(0, Math.round(count));
  for (const key of ['spearmen', 'heavyInfantry', 'archers'] as const) {
    const take = Math.min(army.units[key], left);
    army.units[key] -= take;
    left -= take;
    if (left <= 0) break;
  }
  return before - totalUnits(army);
}

/**
 * Morale is written straight onto the army, not held beside it.
 *
 * `armyPower` reads `army.morale`, so this is what makes a failing line get weaker as it fails —
 * the compounding collapse that gives the fight a shape. It also means the state of a host
 * coming out of a battle is carried by the same field every other system already reads.
 */
function setMorale(army: Army, value: number): number {
  const next = Math.max(0, Math.min(100, value));
  army.morale = next;
  return next;
}

// ── Moments: a decision with a deadline ─────────────────────────────────────

/**
 * Does the fight have a question worth asking right now, and which one?
 *
 * Every trigger reads state `fightRound` already computes. What changed is the size of the deck:
 * there were three questions, each fired once, so a player two fights into a run had already read
 * every card the mode would ever show them. Thirty now, in `data/ascent/battleMoments.ts`, drawn at
 * random from whichever are true — see the note there.
 *
 * The draw is seeded off the fight rather than off `Math.random`. Not for reproducibility's own
 * sake: the simulation's random call order is a fixture that every mode's regression fingerprint
 * depends on, and adding a roll here would move all four of them for a feature that only exists in
 * one. This costs nothing — the seed already varies per fight, per beat and per question asked.
 */
function raiseMoment(state: GameState, battle: AscentBattle, ours: Army[], theirs: Army[]): void {
  if (battle.moment || battle.over) return;
  if ((battle.momentsRaised ?? 0) >= BATTLE_MOMENTS_PER_FIGHT) return;
  // Never on the opening beats: a fight that begins with a decision has not earned one yet.
  //
  // Measured against the *whole* fight rather than against `battle.round`, which does not count
  // the approach — the fight's own comment says so: "the approach does not spend the round
  // budget". So every question about the approach (the volleys, the crossing, catching them
  // striking camp) was gated behind a counter that is still zero while the approach is happening.
  // Five of the thirty were unreachable for that reason alone.
  const beat = (battle.approachBeats ?? 0) + battle.round;
  if (beat < BATTLE_MOMENT_EARLIEST) return;
  // And spaced, so the budget is not spent in the first six beats of a twenty-six beat fight.
  if (battle.momentLastBeat !== undefined && beat - battle.momentLastBeat < BATTLE_MOMENT_GAP) return;

  const asked = battle.momentIds ?? [];
  const context = momentContext(state, battle, ours, theirs);
  let pool = eligibleMoments(context, asked);
  // One question about the approach per fight, at most — see `BattleMomentDef.opening`.
  if (asked.some((id) => BATTLE_MOMENTS.find((def) => def.id === id)?.opening)) {
    pool = pool.filter((def) => !def.opening);
  }
  if (pool.length === 0) return;

  const chosen = pickMoment(pool, momentSeed(battle));
  const general = state.heroes.find((hero) => hero.id === ours.find((host) => host.generalHeroId)?.generalHeroId);

  setMoment(battle, {
    id: chosen.id,
    raisedAtBeat: battle.round,
    ticksLeft: BATTLE_MOMENT_TICKS,
    generalName: general ? general.name : undefined,
    generalMartial: general ? general.stats.martial : (battle.delegated ? battle.generalMartial ?? 45 : 0),
    hostId: chosen.hostId?.(context),
    subject: chosen.subject?.(context),
  });
  battle.momentLastBeat = beat;
}

/** Everything the deck's triggers are allowed to read, gathered once. */
function momentContext(
  state: GameState, battle: AscentBattle, ours: Army[], theirs: Army[],
): MomentContext {
  const land = state.lands.find((candidate) => candidate.id === battle.landId);
  const terrain = land?.terrainSummary;
  const wet = terrain ? terrain.riceFields + terrain.water + terrain.fields : 0;
  const broken = terrain ? terrain.forest + terrain.hills + terrain.mountains : 0;
  const ourNow = ours.reduce((n, host) => n + totalUnits(host), 0);
  const theirNow = theirs.reduce((n, host) => n + totalUnits(host), 0);
  return {
    battle,
    ours,
    theirs,
    round: battle.round,
    // The whole fight's clock, approach included — `round` stays at zero until the lines meet.
    beat: (battle.approachBeats ?? 0) + battle.round,
    left: battle.totalRounds - battle.round,
    phase: battle.ourAdvance + battle.theirAdvance >= 1 ? 'clash' : 'approach',
    ourMorale: battle.ourMorale,
    theirMorale: battle.theirMorale,
    ourNow,
    theirNow,
    odds: theirNow / Math.max(1, ourNow),
    ourSpent: 1 - ourNow / Math.max(1, battle.ourStart),
    theirSpent: 1 - theirNow / Math.max(1, battle.theirStart),
    reserveMen: battle.reserve.spearmen + battle.reserve.archers + battle.reserve.heavyInfantry,
    // The band has to be wide: a host breaks at `BATTLE_ROUT_MORALE` and one bad exchange can
    // carry it from fifty to thirty in a single beat, so a narrow window is simply stepped over.
    wavering: theirs.find((host) => host.morale <= BATTLE_ROUT_MORALE + 18),
    failing: ours.find((host) => host.morale <= BATTLE_ROUT_MORALE + 18),
    terrainEdge: battle.terrainEdge,
    wetGround: wet > broken,
    brokenGround: broken >= wet,
    isGreat: Boolean(battle.isGreat),
    role: battle.role ?? 'defence',
    arms: battle.ourMatchup ?? 1,
  };
}

/**
 * A weighted draw with no `Math.random` in it.
 *
 * mulberry32, inline, because `src/systems` imports nothing from the UI and this is four lines.
 */
function pickMoment(pool: BattleMomentDef[], seed: number): BattleMomentDef {
  let s = (seed >>> 0) || 1;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const roll = ((t ^ (t >>> 14)) >>> 0) / 4294967296;

  const total = pool.reduce((sum, def) => sum + (def.weight ?? 1), 0);
  let cursor = roll * total;
  for (const def of pool) {
    cursor -= def.weight ?? 1;
    if (cursor <= 0) return def;
  }
  return pool[pool.length - 1];
}

/** Varies per fight, per beat and per question already asked, so a run never repeats a draw. */
function momentSeed(battle: AscentBattle): number {
  let hash = 2166136261;
  for (const ch of `${battle.key ?? battle.landId}:${battle.round}:${battle.momentsRaised ?? 0}`) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function setMoment(battle: AscentBattle, moment: BattleMoment): void {
  battle.moment = moment;
  battle.momentsRaised = (battle.momentsRaised ?? 0) + 1;
  (battle.momentIds ??= []).push(moment.id);
}

/**
 * Applies one answer's effects to the fight.
 *
 * The vocabulary is small and every entry in it is a lever the fight already has — see
 * `MomentEffect`. Scaled by `weight`, which is 1 when the player answered and the general's skill
 * when the general did: a commander's judgement is worth something, but never as much as being
 * there. Costs are *not* scaled — a decision that spends men spends them whoever made it.
 */
function applyMomentEffect(
  state: GameState, battle: AscentBattle, effect: MomentEffect, moment: BattleMoment, weight: number,
): void {
  const gain = (value: number, base: number): number => base + (value - base) * weight;

  battle.momentBonus = {
    beats: BATTLE_MOMENT_BONUS_BEATS,
    dealt: gain(effect.dealt ?? 1, 1),
    // `fightRound` reads `momentBonus.morale` as heart added per beat; the instant heart below is
    // separate and is written straight onto the line.
    morale: 0,
    taken: gain(effect.taken ?? 1, 1),
  };

  if (effect.posture) battle.posture = effect.posture;
  if (effect.focus === 'subject' && moment.hostId) battle.focusHostId = moment.hostId;
  if (effect.focus === 'clear') battle.focusHostId = undefined;

  if (effect.morale) {
    battle.ourMorale = clampMorale(battle.ourMorale + gain(effect.morale, 0));
    for (const host of ourHosts(state, battle)) setMorale(host, host.morale + gain(effect.morale, 0));
  }
  if (effect.theirMorale) {
    battle.theirMorale = clampMorale(battle.theirMorale + gain(effect.theirMorale, 0));
    for (const host of theirHosts(state, battle)) setMorale(host, host.morale + gain(effect.theirMorale, 0));
  }

  if (effect.advance) {
    battle.ourAdvance = Math.max(0, Math.min(1, battle.ourAdvance + effect.advance));
  }
  if (effect.rounds) {
    battle.totalRounds = Math.max(battle.round + 1, battle.totalRounds + effect.rounds);
  }
  if (effect.loss) applyMomentLosses(ourHosts(state, battle), effect.loss);
  if (effect.theirLoss) applyMomentLosses(theirHosts(state, battle), effect.theirLoss * weight);

  if (effect.reserve && !battle.reserveSpent) commitReserve(state);
  if (effect.rally && !battle.rallySpent) rally(state);
}

/** Men taken off a line at once, spread across its hosts in proportion to their size. */
function applyMomentLosses(hosts: Army[], share: number): void {
  const cut = Math.max(0, Math.min(0.5, share));
  if (cut <= 0) return;
  for (const host of hosts) {
    host.units.spearmen = Math.max(0, Math.round(host.units.spearmen * (1 - cut)));
    host.units.archers = Math.max(0, Math.round(host.units.archers * (1 - cut)));
    host.units.heavyInfantry = Math.max(0, Math.round(host.units.heavyInfantry * (1 - cut)));
  }
}

function clampMorale(value: number): number {
  return Math.max(0, Math.min(100, value));
}


/**
 * Answers the open Moment, and hands the player something for it.
 *
 * `commit` spends: it buys a sharp, short bonus and takes a risk. `steady` conserves: it buys
 * heart instead of edge. Both are scaled by the general's martial, which is what makes appointing
 * a good one to a host worth doing — the same number decides how well they answer for you when
 * the timer runs out.
 */
export function answerBattleMoment(state: GameState, answer: BattleMomentAnswer, byGeneral = false): boolean {
  const battle = state.ascent?.activeBattle;
  const moment = battle?.moment;
  if (!battle || !moment || battle.over) return false;

  // A commander's judgement is worth something, but never as much as being there. Answering
  // yourself is the full effect; a general answering for you is scaled by what they are.
  // Steeper than the 0.55 + 0.4x it was: 0.68 at martial 60 against 0.85 at 90, so the appointment
  // is worth making. Measured, it moves the delegation gap much less than it looks like it should
  // — 5.5 points below skilled play before, 6.0 after, against a gate of 8 to 15 — because most of
  // what a delegated fight decides is `generalPlaysBeat`'s stance each beat, not the two or three
  // Moments. The gate is still unmet and the lever that would meet it is that one, not this.
  const skill = 0.35 + (moment.generalMartial ?? 0) / 100 * 0.55;
  const weight = byGeneral ? skill : 1;

  const def = BATTLE_MOMENTS.find((candidate) => candidate.id === moment.id);
  if (!def) { battle.moment = undefined; return false; }
  const effect = answer === 'commit' ? def.commit : def.steady;

  applyMomentEffect(state, battle, effect, moment, weight);
  battle.log.push(t(`ascent.moment.said.${effect.says}` as Parameters<typeof t>[0], {
    subject: moment.subject ?? battle.kingdomName,
  }));

  battle.moment = undefined;
  return true;
}

/**
 * Ages the open Moment by one tick of the world, and lets the general answer it when it runs out.
 *
 * The lapse is the delegation, which is the point: a player who looked away, or who handed this
 * host to its general on purpose, gets a decent answer rather than a penalty. What they lose is
 * the difference between a good commander's judgement and their own.
 *
 * Returns true while the Moment still stands — `advanceBattle` reads that and holds the fight,
 * which is what gives the player a window at all.
 */
function ageMoment(state: GameState, battle: AscentBattle): boolean {
  const moment = battle.moment;
  if (!moment) return false;
  moment.ticksLeft -= 1;
  if (moment.ticksLeft > 0) return true;
  // A cautious commander steadies the line; a bold one commits. Their martial decides which they
  // are as well as how well it goes, so a host's commander is a real appointment.
  const bold = (moment.generalMartial ?? 0) >= 60;
  answerBattleMoment(state, bold ? 'commit' : 'steady', true);
  return false;
}

export function fightRound(state: GameState): void {
  const ascent = state.ascent;
  const battle = ascent?.activeBattle;
  if (!ascent || !battle || battle.over) return;

  // The commander gives their orders for this beat, if the field is theirs.
  //
  // Here rather than in `advanceBattle` because the beat is the unit a commander acts on, and
  // because `advanceBattle` is not the only thing that runs a beat — `battle-lab` drives
  // `fightRound` directly, so a general placed one level up simply never played and every martial
  // value scored identically. A harness that cannot reach the code it is grading is not grading it.
  if (battle.delegated) generalPlaysBeat(state, battle);

  // Read the field fresh each beat rather than holding references from when the fight opened.
  // That single choice is what makes reinforcement work: a host that marched in since the last
  // beat is simply enrolled, and one that was destroyed is simply no longer alive.
  enrolArrivals(state, battle);
  const ours = ourHosts(state, battle);
  const theirs = theirHosts(state, battle);
  const defender = ours[0];
  const invader = theirs[0];
  if (!invader || !defender) {
    battle.over = true;
    battle.outcome = ours.length > 0 ? 'they-rout' : 'we-rout';
    return;
  }

  // Relief that arrived since the last beat is worth announcing — it is the payoff for having
  // left the fight to go and fetch it.
  const ourCount = ours.length;
  const theirCount = theirs.length;
  if (ourCount > battle.ourHostCount) {
    battle.log.push(t('ascent.battle.reliefArrived', { n: ourCount - battle.ourHostCount }));
    battle.ourMorale = setMorale(defender, battle.ourMorale + BATTLE_CHARGE_MORALE);
  }
  if (theirCount > battle.theirHostCount) {
    battle.log.push(t('ascent.battle.enemyRelief', { n: theirCount - battle.theirHostCount }));
  }
  battle.ourHostCount = ourCount;
  battle.theirHostCount = theirCount;
  // Relief widens the denominator too, so the strength bars never read past full.
  battle.ourStart = Math.max(battle.ourStart, ours.reduce((total, host) => total + totalUnits(host), 0));
  battle.theirStart = Math.max(battle.theirStart, theirs.reduce((total, host) => total + totalUnits(host), 0));

  const charging = battle.posture === 'press';
  const loosing = battle.posture === 'loose';
  const offence = battle.role === 'offence';
  // How the two sides' arms meet, written before the branch rather than inside the melee.
  // It is true of the hosts, not of the phase — a spear wall is wrong against heavy infantry
  // while they are still a bowshot apart — and leaving it until after contact meant the screen
  // could not state it during the approach and the deck could not ask about it.
  battle.ourMatchup = matchupAcross(ours, theirs);
  battle.theirMatchup = matchupAcross(theirs, ours);
  // Walls do not sally: a garrison-only defence holds its ground and shoots.
  battle.theirPosture = offence && theirs.every((host) => host.isLevy) ? 'hold' : enemyPosture(state, battle);

  if (offence) {
    // We are the ones coming. Holding is closing under shields — slower, and under fewer arrows;
    // pressing is the rush. Either way the assault reaches the walls; a defender that never
    // sallies cannot stall it at the approach forever.
    battle.approachBeats = (battle.approachBeats ?? 0) + 1;
    battle.ourAdvance = Math.min(1, battle.ourAdvance + BATTLE_ADVANCE_PER_TICK * (charging ? 1.5 : 1));
    if (battle.approachBeats >= BATTLE_APPROACH_MAX_BEATS) battle.ourAdvance = 1;
  } else {
    // The invader is always coming; we advance only when told to. Charging also closes faster,
    // which is half of why it is worth doing.
    //
    // Counted here too. `approachBeats` was incremented only on the assault path, where it caps
    // the approach — but it is also the only clock a defence has before contact, since
    // `battle.round` deliberately does not move until the lines meet. Without it every question
    // about a defensive approach sat behind a counter that was permanently zero.
    battle.approachBeats = (battle.approachBeats ?? 0) + 1;
    battle.theirAdvance = Math.min(1, battle.theirAdvance + BATTLE_ADVANCE_PER_TICK);
    // Loosing opens the range rather than merely refusing to close: a host that means to shoot
    // wants the ground between it and them, which is what makes it lose to a charge.
    battle.ourAdvance = charging
      ? Math.min(1, battle.ourAdvance + BATTLE_ADVANCE_PER_TICK * 1.5)
      : Math.max(0, battle.ourAdvance - BATTLE_ADVANCE_PER_TICK * (loosing ? 0.6 : 0.5));
  }

  const met = battle.ourAdvance + battle.theirAdvance >= 1;

  if (!met) {
    // ── Archery: the approach is a phase, not dead time ────────────────────
    //
    // Arrows are the one exchange where numbers do not answer numbers: a host with bowmen hurts
    // one without, and the side that closes faster eats less of it. That asymmetry is what gives
    // both orders a real case, and it makes composition legible without any new data.
    const bows = (hosts: Army[]): number => hosts.reduce((total, host) => total + host.units.archers, 0);
    // A host that has chosen to shoot, shoots harder — this is the whole of what `loose` buys on
    // the approach, and it is why an arrow-heavy host wants the lines apart.
    const ourVolley = bows(ours) * BATTLE_VOLLEY_BITE * (battle.ourMorale / 100) * (loosing ? BATTLE_LOOSE_VOLLEY : 1);
    const theirVolley = bows(theirs) * BATTLE_VOLLEY_BITE * (battle.theirMorale / 100)
      * (battle.theirPosture === 'loose' ? BATTLE_LOOSE_VOLLEY : 1);
    const cover = charging ? BATTLE_CHARGE_COVER : 1;

    // Spread across the hosts present, so arriving relief is shot at too.
    const ourLoss = ours.reduce((total, host) => total + bleedCount(host, (theirVolley * cover) / ours.length), 0);
    const theirLoss = theirs.reduce((total, host) => total + bleedCount(host, ourVolley / theirs.length), 0);

    battle.ourNow = ours.reduce((total, host) => total + totalUnits(host), 0);
    battle.theirNow = theirs.reduce((total, host) => total + totalUnits(host), 0);
    let volleyLine: string | undefined;
    if (ourLoss > 0 || theirLoss > 0) {
      volleyLine = t('ascent.battle.volley', { ours: ourLoss, theirs: theirLoss });
      battle.log.push(volleyLine);
    }
    // The approach can ask a question too, and until now it could not.
    //
    // `raiseMoment` was called once, at the foot of the melee path, past this early return — so
    // every question about closing the ground (the volleys, the crossing, catching them still
    // striking camp) was unreachable no matter what its trigger said. Measured across sixty
    // engagements, five of the thirty fired zero times for this reason alone.
    raiseMoment(state, battle, ours, theirs);
    recordBeat(battle, 'approach', ours, theirs, ourLoss, theirLoss, volleyLine);
    // Deliberately does not spend the round budget: the approach is the opening, not the fight.
    return;
  }

  // ── First contact ────────────────────────────────────────────────────────
  if (battle.round === 0 && charging) {
    battle.ourMorale = setMorale(defender, battle.ourMorale + BATTLE_CHARGE_MORALE);
    battle.log.push(t('ascent.battle.charged'));
  }

  const sum = (hosts: Army[]): number => hosts.reduce((total, host) => total + armyPower(state, host), 0);
  // The ground's edge goes to whoever is defending it.
  // Composition, at last, in the one place that shows the player both sides of it.
  //
  // `compositionMatchup` — spearmen rout heavy, heavy crush archers, archers shred spears — has
  // been written, commented and correct in `WarSystem` since the classic odds roll, with exactly
  // one call site. The watched fight never used it, so the screen that draws both armies' arms
  // was the only place in the game where they did not matter.
  const ourArms = battle.ourMatchup ?? 1;
  const theirArms = battle.theirMatchup ?? 1;
  const ourPower = Math.max(1, sum(ours) * (offence ? 1 : battle.terrainEdge) * ourArms);
  const theirPower = Math.max(1, sum(theirs) * (offence ? battle.terrainEdge : 1) * theirArms);
  // Each side's losses are its own exposure times the other's aggression, so a cautious enemy
  // is genuinely a different fight from a reckless one rather than the same fight relabelled.
  const ourTrade = tradeAgainst(battle.posture, battle.theirPosture);
  const theirTrade = tradeAgainst(battle.theirPosture, battle.posture);
  // A line that changed its footing this beat is still finding it. Applied to both sides from the
  // same rule, so an enemy that flip-flops pays exactly what the player would.
  const ourReform = battle.lastPosture !== undefined && battle.lastPosture !== battle.posture
    ? BATTLE_REFORM_COST : 1;
  const theirReform = battle.lastTheirPosture !== undefined && battle.lastTheirPosture !== battle.theirPosture
    ? BATTLE_REFORM_COST : 1;
  battle.lastPosture = battle.posture;
  battle.lastTheirPosture = battle.theirPosture;
  const fuzz = (): number => 0.9 + Math.random() * 0.2;

  // What a Moment bought, while it lasts. Half the deck answers a question by *protecting* the
  // line rather than by sharpening it — bracing, giving ground, plugging a pass — and without
  // this term every one of those answers would have been a placebo.
  const momentTaken = battle.momentBonus?.taken ?? 1;
  const momentDealt = battle.momentBonus?.dealt ?? 1;
  const ourShare = BATTLE_ROUND_BITE * (theirPower / (ourPower + theirPower)) * 2
    * ourTrade.taken * theirTrade.dealt * theirReform * momentTaken * fuzz();
  const theirShare = BATTLE_ROUND_BITE * (ourPower / (ourPower + theirPower)) * 2
    * ourTrade.dealt * theirTrade.taken * ourReform * momentDealt * fuzz();

  // Losses land across every host present, so relief shares the burden rather than watching.
  const ourLoss = ours.reduce((total, host) => total + bleed(host, Math.min(0.9, ourShare)), 0);

  // Focus concentrates everything we have on one of their hosts. Breaking a column outright
  // removes its share of their power for the rest of the fight, so concentrating is how you win
  // a battle you are losing on total numbers — at the cost of letting the others work freely.
  const focused = battle.focusHostId
    ? theirs.find((host) => host.id === battle.focusHostId)
    : undefined;
  const theirLoss = focused
    ? bleed(focused, Math.min(0.9, theirShare * BATTLE_FOCUS_MULT))
      + theirs.filter((h) => h !== focused)
        .reduce((total, host) => total + bleed(host, Math.min(0.9, theirShare * BATTLE_SPREAD_MULT)), 0)
    : theirs.reduce((total, host) => total + bleed(host, Math.min(0.9, theirShare)), 0);

  // Morale follows the exchange: bleeding costs heart, and winning the exchange restores a
  // little of it. Because `armyPower` reads morale, the side that starts losing keeps losing.
  //
  // Measured against the *engaged* line, not against `ourStart`. `ourStart` counts everything the
  // side brought — including the reserve, which by construction is standing at camp and not being
  // shot at, and including relief that widened the denominator when it arrived. Traced through a
  // real fight: a host of 351 with 134 in reserve took 28% casualties and lost **one point** of
  // heart, because the men at camp were absorbing the shock of the line's losses on paper. The
  // enemy, who had no reserve, fell from 85 to 46 over the same exchanges — the two sides were
  // running different morale models without anyone deciding they should.
  //
  // Dividing by what is actually standing there also makes the drop compound: the smaller a host
  // gets, the larger a share each further loss is, so a line that starts going breaks instead of
  // grinding down at a constant rate. That is what the constant's own doc comment claims it does.
  const ourEngaged = Math.max(1, ours.reduce((n, h) => n + totalUnits(h), 0) + ourLoss);
  const theirEngaged = Math.max(1, theirs.reduce((n, h) => n + totalUnits(h), 0) + theirLoss);
  const ourDrop = (ourLoss / ourEngaged) * BATTLE_MORALE_PER_LOSS;
  const theirDrop = (theirLoss / theirEngaged) * BATTLE_MORALE_PER_LOSS;
  const wonExchange = theirLoss > ourLoss;
  // Applied to *every* host on the side, not just the one the maths treats as the line, so a
  // battered relief column carries its own heart rather than borrowing the vanguard's.
  // Being countered costs heart as well as men — see `BATTLE_COUNTER_MORALE`. This is what lets
  // a stance win a fight rather than merely trade well through one.
  const ourCountered = posturesCounter(battle.theirPosture, battle.posture) ? BATTLE_COUNTER_MORALE : 0;
  const theirCountered = posturesCounter(battle.posture, battle.theirPosture) ? BATTLE_COUNTER_MORALE : 0;
  const momentMorale = battle.momentBonus?.morale ?? 0;
  for (const host of ours) {
    setMorale(host, host.morale - ourDrop - ourCountered + momentMorale + (wonExchange ? BATTLE_MORALE_WIN_GAIN : 0));
  }
  for (const host of theirs) {
    setMorale(host, host.morale - theirDrop - theirCountered + (wonExchange ? 0 : BATTLE_MORALE_WIN_GAIN));
  }
  battle.ourMorale = defender.morale;
  battle.theirMorale = invader.morale;

  // Hosts break one at a time. Losing a host is a setback, not the battle — which is what makes
  // bringing a second column worth the march, and what stops one bad exchange ending everything.
  const brokeThisBeat: string[] = [];
  // Sát Thát — the arm tattoos of 1285. Trần soldiers cut "kill the Mongols" into their own
  // forearms before the second Yuan invasion, and this is the mechanical shape of that: our hosts
  // hold to a fifth strength rather than breaking at the usual morale. Only ours — the invader
  // never swore anything. The price is on the other side of the trade, in `SAT_THAT_RECRUIT_MULT`:
  // men who will not run are also men who cannot be replaced.
  // Measured against the side's opening strength rather than each host's own, because a host is
  // an `Army` and carries no record of what it marched in with — `battle.ourStart` is the only
  // honest starting figure either side has.
// Sát Thát vĩnh cửu, the militarist capstone, goes further than the oath it is named for: the
  // floor drops to zero, so our hosts fight until they are destroyed and never break at all.
  // The proclamation holds the line exactly as the capstone does, for one wave instead of forever.
  const eternal = hasCapstone(state, 'binh') || proclamationInForce(state);
  const swornFloor = eternal ? 0 : tattooedArms(state) ? battle.ourStart * (SAT_THAT_ROUT_FLOOR / 100) : -1;
  for (const host of [...ours, ...theirs]) {
    if (swornFloor >= 0 && ours.includes(host) && battle.ourNow > swornFloor) continue;
    if (host.morale > BATTLE_ROUT_MORALE) continue;
    battle.brokenHostIds.push(host.id);
    brokeThisBeat.push(host.id);
    battle.log.push(t('ascent.battle.hostBreaks', { name: host.name }));
    // A host that runs is cut down as it goes, exactly as a whole side is.
    bleed(host, BATTLE_ROUT_LOSS_SHARE);
  }

  battle.ourLostTotal += ourLoss;
  battle.round += 1;
  battle.ourNow = ours.reduce((total, host) => total + totalUnits(host), 0);
  battle.theirNow = theirs.reduce((total, host) => total + totalUnits(host), 0);
  // A question the fight has just produced. `advanceBattle` stops here until it is answered.
  raiseMoment(state, battle, ours, theirs);
  if (battle.momentBonus) {
    battle.momentBonus.beats -= 1;
    if (battle.momentBonus.beats <= 0) battle.momentBonus = undefined;
  }

  const exchangeLine = t('ascent.battle.exchange', { round: battle.round, ours: ourLoss, theirs: theirLoss });
  battle.log.push(exchangeLine);
  recordBeat(battle, 'clash', ours, theirs, ourLoss, theirLoss, exchangeLine, brokeThisBeat);

  // ── Does anyone break? ───────────────────────────────────────────────────
  // A side is beaten when it has no host left in the line, not when its strongest wavers.
  if (theirHosts(state, battle).length === 0) {
    battle.outcome = 'they-rout';
    battle.log.push(t('ascent.battle.theyBreak', { kingdom: battle.kingdomName }));
    battle.over = true;
    return;
  }
  if (ourHosts(state, battle).length === 0) {
    battle.outcome = 'we-rout';
    battle.log.push(t('ascent.battle.weBreak'));
    battle.over = true;
    return;
  }
  if (battle.round >= battle.totalRounds) {
    battle.outcome = 'spent';
    battle.over = true;
  }
}

/**
 * Advances a live engagement by a tick's worth of beats, and closes it out when it ends.
 *
 * Called from the economy tick rather than from the view: the fight belongs to the world now,
 * so it carries on whether or not anyone is looking at it. The view animates what this produces.
 */
/** The stance that answers each stance, as the ring defines it. */
const COUNTER_OF: Record<BattlePosture, BattlePosture> = { press: 'hold', hold: 'loose', loose: 'press' };

/**
 * Whether the commander reads this beat correctly.
 *
 * `martial` is the share of beats they get right; on the rest they fall back to their habit. This
 * is deliberately a hash rather than `Math.random`: every harness in the repo drives the same
 * systems, and drawing here would shift the RNG order for every mode's fingerprint. The same
 * commander in the same fight also has to make the same decisions twice, or two runs of the lab at
 * one martial value measure noise.
 */
function generalReadsBeat(battle: AscentBattle, martial: number): boolean {
  const h = Math.imul(((battle.round + 1) * 2654435761) ^ Math.round(battle.ourStart), 2246822519) >>> 0;
  return (h % 100) < martial;
}

/**
 * The commander's beat, when the player has handed over the field.
 *
 * A great commander reads the enemy's stance and answers it; a poor one holds what they have and
 * keeps their one-shots in hand, which is what makes a bad appointment lose slowly rather than
 * catastrophically. The one-shots are doctrine rather than a read — any commander commits the
 * reserve once the lines have met — so they are spent on the beats they get right *and* wrong,
 * only later when the read fails.
 */
function generalPlaysBeat(state: GameState, battle: AscentBattle): void {
  const martial = battle.generalMartial ?? 0;
  const met = battle.ourAdvance + battle.theirAdvance >= 1;
  if (generalReadsBeat(battle, martial)) {
    const next = battleTelegraph(state);
    if (next) setBattlePosture(state, COUNTER_OF[next]);
    if (met) {
      if (!battle.reserveSpent) commitReserve(state);
      else if (!battle.rallySpent && battle.ourMorale < BATTLE_ROUT_MORALE + 12) rally(state);
    }
    return;
  }
  // Their habit. Not a reset to `hold`: reverting the stance every beat they misread is worse than
  // standing still, and measured it cost a martial-90 commander fourteen points against skilled
  // play. They keep the line they are already in and spend the reserve late.
  if (met && !battle.reserveSpent && battle.ourNow <= battle.ourStart * 0.55) commitReserve(state);
  if (met && battle.reserveSpent && !battle.rallySpent && battle.ourMorale < BATTLE_ROUT_MORALE + 6) rally(state);
}

/**
 * Hands the rest of the engagement to whoever holds the field, or takes it back.
 *
 * Reversible on purpose, and mid-beat. The plan's rule for this switch is two states and one tap:
 * a player who hands over because they are bored of a fight they are winning must be able to take
 * the field back the moment it turns.
 */
export function delegateBattle(state: GameState, delegated: boolean): void {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) return;
  battle.delegated = delegated;
  if (!delegated) {
    battle.log.push(t('ascent.battle.tookBack'));
    return;
  }
  const general = state.heroes.find(
    (hero) => hero.id === ourHosts(state, battle).find((host) => host.generalHeroId)?.generalHeroId,
  );
  battle.generalName = general?.name;
  battle.generalMartial = general ? general.stats.martial : 45;
  battle.log.push(general
    ? t('ascent.battle.handedTo', { name: general.name })
    : t('ascent.battle.handedToOfficers'));
}

export function advanceBattle(state: GameState): void {
  const battle = state.ascent?.activeBattle;
  if (!battle) return;

  // A Moment holds the fight. Without this the window is consumed inside the same burst that
  // opened it and the player never sees the question, let alone answers it.
  if (battle.moment) {
    // A delegated fight does not hold the screen waiting for an answer nobody is going to give.
    // The commander answers it now, at the quality their martial buys.
    if (battle.delegated) battle.moment.ticksLeft = 0;
    if (ageMoment(state, battle)) return;
  }

  for (let beat = 0; beat < BATTLE_BEATS_PER_TICK && !battle.over; beat += 1) {
    fightRound(state);
    if (!battle.moment) continue;
    // A commander does not stop the war to think.
    //
    // Breaking the burst is right when a player is going to be asked: the question reaches the
    // screen with the rest of the tick still ahead of it. It is wrong when the field has been
    // handed over, because the answer is already decided — and holding the burst for it cost the
    // general five of every six beats. Measured on a delegated fight: four beats in nine seconds,
    // against the eighteen a watched fight resolves in the same time.
    if (battle.delegated) {
      battle.moment.ticksLeft = 0;
      ageMoment(state, battle);
      continue;
    }
    // Stop the burst the instant one is raised, so the question reaches the screen with the rest
    // of the tick still ahead of it rather than already spent.
    break;
  }
  // `finishBattle` asks what the host was *told*, not which of three stances it was in when the
  // last beat landed. Loosing is a way of holding the ground, so it resolves as holding.
  if (battle.over) finishBattle(state, battle.posture === 'press' ? 'press' : 'hold');
}

/** Commits the host held back at camp. One-shot, and the reason to keep watching. */
/** The host the reserve belongs to — the one it was drawn from, or the line if that host is gone. */
function reserveHostOf(state: GameState, battle: AscentBattle): Army | undefined {
  const own = state.armies.find((army) => army.id === battle.reserveHostId && totalUnits(army) > 0);
  return own ?? battleLine(state, battle);
}

export function commitReserve(state: GameState): boolean {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.reserveSpent || battle.over) return false;
  const defender = reserveHostOf(state, battle);
  if (!defender) return false;

  defender.units.spearmen += battle.reserve.spearmen;
  defender.units.archers += battle.reserve.archers;
  defender.units.heavyInfantry += battle.reserve.heavyInfantry;
  battle.reserveSpent = true;
  battle.ourNow = totalUnits(defender);
  // Fresh troops steady the line as well as thicken it — and the more desperate the line, the
  // more their arrival is worth. The counterweight is that a host which breaks before you commit
  // takes the reserve down with it, so holding them back is a gamble in both directions.
  const sag = Math.max(0, (battle.ourStartMorale - battle.ourMorale) / Math.max(1, battle.ourStartMorale));
  battle.ourMorale = setMorale(defender, battle.ourMorale + BATTLE_CHARGE_MORALE * (1 + sag * 2));
  battle.log.push(t('ascent.battle.reserveIn', {
    n: battle.reserve.spearmen + battle.reserve.archers + battle.reserve.heavyInfantry,
  }));
  return true;
}

/** The general steadies the host. One-shot, scaled by their martial — see `rallyPower`. */
export function rally(state: GameState): boolean {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.rallySpent || battle.over) return false;
  const defender = battleLine(state, battle);
  if (!defender) return false;

  // Scaled by the ground already lost, so a rally spent on a fresh host is largely wasted and
  // one spent on a wavering line is worth several times as much. That is what turns it from a
  // reminder into a decision: waiting pays, right up until the line breaks and it never gets
  // spent at all.
  const sag = Math.max(0, (battle.ourStartMorale - battle.ourMorale) / Math.max(1, battle.ourStartMorale));
  const gained = Math.round(battle.rallyPower * (1 + sag * BATTLE_RALLY_DESPERATION));
  battle.rallySpent = true;
  battle.ourMorale = setMorale(defender, battle.ourMorale + gained);
  battle.log.push(t('ascent.battle.rallied', { n: gained }));
  return true;
}

/**
 * Ends the engagement and lets the shared invasion code decide what it meant.
 *
 * The reserve is returned first whatever happens — men held at camp were never in the fight and
 * must not be quietly deleted by a retreat or a rout.
 */
/**
 * Puts the fight that just ended in front of the player.
 *
 * Everything this card shows was already being written down and then thrown away: the butcher's
 * bill, what the field cost, whether the walls turned out, who held the line. The screen closed on
 * a strip of message text, so the most consequential thing in the mode ended by simply vanishing.
 *
 * It also gathers the fights the generals settled alone since the last card. Delegation is meant to
 * be a legitimate way to play, and a run-wide switch that makes two thirds of the war disappear
 * into silence is not that — it is a way of turning the game off.
 */
function raiseAftermath(state: GameState): void {
  const ascent = state.ascent;
  const history = ascent?.battleHistory;
  if (!ascent || !history?.length) return;
  // The arena already returns to its own setup screen carrying the result. A card on top of that
  // would be the same news twice.
  if (ascent.arena) return;
  const record = history[history.length - 1];

  // A fight the generals fought alone does not stop the game to report itself.
  //
  // The first version raised a card for every finished fight and then tried to gather the
  // delegated ones underneath it — which could never find any, because each of them had already
  // raised and cleared its own card. Measured over a 260-tick run with two fights handed over,
  // every dispatch section came back empty.
  //
  // So a delegated fight waits. A fight the player watched carries the whole backlog with it, and
  // if the player is delegating everything the backlog still surfaces once a wave, which is what
  // stops a run-wide hand-over from turning the war silent.
  const from = Math.min(ascent.aftermathReported ?? 0, history.length);
  const backlog = history.slice(from, history.length - 1).filter((r) => r.delegated);
  if (record.delegated) {
    if (ascent.lastDispatchWave === ascent.wave) return;
    ascent.lastDispatchWave = ascent.wave;
  }
  ascent.pendingAftermath = { record, alsoFought: backlog };
  ascent.aftermathReported = history.length;
}

export function finishBattle(state: GameState, decision: 'press' | 'hold' | 'retreat'): void {
  const ascent = state.ascent;
  const battle = ascent?.activeBattle;
  if (!ascent) return;
  if (!battle) {
    // Nothing being watched: the shared code still owns whatever record is waiting.
    if (state.pendingBattle) resolveBattleRecord(state, takePending(state), decision === 'press' ? 'attack' : decision === 'retreat' ? 'retreat' : 'delegate');
    return;
  }

  if (!battle.reserveSpent) {
    const defender = reserveHostOf(state, battle);
    if (defender) {
      defender.units.spearmen += battle.reserve.spearmen;
      defender.units.archers += battle.reserve.archers;
      defender.units.heavyInfantry += battle.reserve.heavyInfantry;
    }
  }

  // `outcome` used to be computed and thrown away: routing them, being routed, and grinding to
  // the round limit all resolved identically, so the most dramatic thing that can happen in the
  // fight carried no consequence at all.
  //
  // Breaking them is a decisive win. Being broken is *worse than withdrawing* — a routing host
  // is cut down as it runs — which is what makes pulling out in time a real skill rather than a
  // button nobody presses.
  if (battle.outcome === 'we-rout') {
    for (const host of ourHosts(state, battle)) bleed(host, BATTLE_ROUT_LOSS_SHARE);
  }

  // A withdrawal ordered in time is an orderly one: the host keeps its formation, and the
  // stragglers and lightly wounded rejoin it over the following days. A rout does not — men who
  // run are ridden down, which is what `BATTLE_ROUT_LOSS_SHARE` above models.
  //
  // This is what finally makes pulling out a *tactical* skill and not only a strategic one.
  // Deliberately done by recovering losses rather than by weakening `hold`: making the standing
  // orders trade worse to justify retreat would have undone the dominated-option-free balance
  // that took two passes to earn. Withdrawal now earns its keep on its own terms.
  // A field held is a field the wounded can be carried off: a share of a winning side's losses
  // rejoin the host over the following days, exactly as they do after an orderly withdrawal.
  // Without this every won battle still cost a fifth of the host, and a realm that fought and
  // won each wave shrank as surely as one that lost — the roll it replaced never bled a winner.
  if (decision === 'retreat' && battle.outcome !== 'we-rout' || battle.outcome === 'they-rout') {
    const hosts = ourHosts(state, battle);
    const recovered = Math.round(battle.ourLostTotal * BATTLE_WITHDRAW_RECOVERY);
    if (hosts.length > 0 && recovered > 0) {
      const each = Math.floor(recovered / hosts.length);
      for (const host of hosts) {
        host.units.spearmen += Math.round(each * 0.6);
        host.units.archers += Math.round(each * 0.25);
        host.units.heavyInfantry += Math.round(each * 0.15);
      }
    }
  }

  if (battle.role === 'offence') {
    finishAssault(state, battle, decision);
    return;
  }

  // The field decides — including when nobody broke.
  //
  // A rout on either side was already settled outright, but a fight that simply ran out of rounds
  // used to be handed back to the old odds roll, which re-decided from the top a battle the player
  // had just spent five minutes steering. Measured, that was **68% of all engagements**: 21.3
  // fought per run, 6.4 won by breaking them, 0.5 lost by being broken, and the other 14.4 thrown
  // to a die. A tactical screen whose result is overruled two times in three is decoration.
  //
  // So an exhausted field is scored on what the exhaustion produced: whichever side kept more of
  // what it brought has held the ground. `ourStart` and `theirStart` already track that, and both
  // widen when relief arrives, so a defence that was reinforced is judged on the whole force it
  // ended up committing rather than on the vanguard it opened with.
  const heldShare = battle.ourNow / Math.max(1, battle.ourStart);
  const theirShare = battle.theirNow / Math.max(1, battle.theirStart);
  const spentWinner: 'defence' | 'invader' | undefined = battle.outcome === 'spent'
    ? (heldShare >= theirShare ? 'defence' : 'invader')
    : undefined;

  const resolved = battle.outcome === 'they-rout'
    ? 'attack'
    : battle.outcome === 'we-rout'
      ? 'delegate'
      : decision === 'retreat' ? 'retreat' : decision === 'press' ? 'attack' : 'delegate';
  const forced = battle.outcome === 'they-rout'
    ? 'defence'
    : battle.outcome === 'we-rout'
      ? 'invader'
      // A withdrawal the player ordered is still a withdrawal — the field is given up by choice,
      // and `BATTLE_WITHDRAW_RECOVERY` above has already paid them back for ordering it in time.
      : decision === 'retreat' ? undefined : spentWinner;
  const invaderIds = (battle.theirArmyIds ?? []).filter((id) => id !== battle.invaderArmyId);

  // Written down before the shared code moves anyone: the chronicle and the harness both read it.
  const ourIds = battle.ourArmyIds ?? [];
  const history = (ascent.battleHistory ??= []);
  history.push({
    turn: state.turn,
    key: battle.key ?? `${battle.landId}`,
    landId: battle.landId,
    landName: battle.landName,
    role: battle.role ?? 'defence',
    outcome: battle.outcome === 'fighting' ? (decision === 'retreat' ? 'retreat' : 'spent') : battle.outcome,
    rounds: battle.round,
    ourStart: battle.ourStart,
    theirStart: battle.theirStart,
    ourEnd: battle.ourNow,
    theirEnd: battle.theirNow,
    theirHosts: (battle.theirArmyIds ?? []).length,
    ourHosts: ourIds.length,
    levyFought: state.armies.some((army) => army.isLevy && ourIds.includes(army.id)),
    generalName: battle.delegated ? battle.generalName : undefined,
    kingdomName: battle.kingdomName,
    year: state.year,
    season: state.season,
    delegated: battle.delegated,
    wave: ascent.wave,
  });
  raiseAftermath(state);
  if (history.length > 24) history.splice(0, history.length - 24);

  ascent.activeBattle = undefined;
  resolveBattleRecord(state, battleRecord(battle), resolved, forced);
  // A rout breaks *every* host that came to the field, not only the one that made contact:
  // a coalition that ran does not get to try the same gate again next tick, one column at a time.
  if (forced === 'defence') {
    for (const id of invaderIds) resolveBattleRecord(state, battleRecord(battle, id), 'delegate', 'defence');
  }
}

/** What an assault of ours came to, applied through the same consequence the odds roll uses. */
function finishAssault(state: GameState, battle: AscentBattle, decision: 'press' | 'hold' | 'retreat'): void {
  const ascent = state.ascent!;
  const land = findLand(state, battle.landId);
  const attackers = (battle.ourArmyIds ?? [])
    .map((id) => state.armies.find((army) => army.id === id))
    .filter((army): army is Army => Boolean(army && army.kingdomId === PLAYER_KINGDOM_ID && totalUnits(army) > 0))
    .sort((a, b) => totalUnits(b) - totalUnits(a));
  const theirs = theirHosts(state, battle);
  const ourPower = attackers.reduce((n, h) => n + armyPower(state, h), 0);
  const theirPower = theirs.reduce((n, h) => n + armyPower(state, h), 0) * battle.terrainEdge;

  const history = (ascent.battleHistory ??= []);
  history.push({
    turn: state.turn,
    key: battle.key ?? `${battle.landId}`,
    landId: battle.landId,
    landName: battle.landName,
    generalName: battle.delegated ? battle.generalName : undefined,
    kingdomName: battle.kingdomName,
    year: state.year,
    season: state.season,
    delegated: battle.delegated,
    wave: ascent.wave,
    role: 'offence',
    outcome: battle.outcome === 'fighting' ? (decision === 'retreat' ? 'retreat' : 'spent') : battle.outcome,
    rounds: battle.round,
    ourStart: battle.ourStart,
    theirStart: battle.theirStart,
    ourEnd: battle.ourNow,
    theirEnd: battle.theirNow,
    theirHosts: (battle.theirArmyIds ?? []).length,
    ourHosts: (battle.ourArmyIds ?? []).length,
    levyFought: false,
  });
  raiseAftermath(state);
  if (history.length > 24) history.splice(0, history.length - 24);

  // The walls are a picture of the province's defence, not a host: they go back into the walls.
  state.armies = state.armies.filter((army) => !(army.isLevy && army.kingdomId !== PLAYER_KINGDOM_ID && army.landId === battle.landId));
  ascent.activeBattle = undefined;

  const primary = attackers[0];
  if (!primary || !land) return;
  if (decision === 'retreat' && battle.outcome !== 'we-rout' && battle.outcome !== 'they-rout') {
    // An orderly withdrawal: the host keeps its ground and its formation (recovery was applied
    // above), and its standing order settles into holding where it stands.
    state.message = t('msg.defeatAt', { land: land.name });
    return;
  }
  const victory = battle.outcome === 'they-rout'
    ? true
    : battle.outcome === 'we-rout'
      ? false
      : Math.random() * 100 < Math.min(90, Math.max(10, Math.round((ourPower / Math.max(1, ourPower + theirPower)) * 100)));
  const preview = { attackerPower: Math.round(ourPower), defenderPower: Math.round(theirPower) };
  if (land.ownerId === 'neutral' && !land.hasVillage) {
    // Empty wilderness someone was camped on: the walk-in it would have been, once cleared.
    if (victory) occupyEmptyLand(state, primary.id, land.id);
    else state.message = t('msg.defeatAt', { land: land.name });
    return;
  }
  applyAttackOutcome(state, primary, land, preview, victory);
}

/** Takes the waiting record off the state, un-pausing the world it paused. */
function takePending(state: GameState): PendingBattle {
  const pending = state.pendingBattle as PendingBattle;
  state.pendingBattle = undefined;
  state.isPaused = false;
  return pending;
}

/** Concentrates the line on one of their hosts, or spreads it again when cleared. */
export function setBattleFocus(state: GameState, hostId?: string): void {
  const battle = state.ascent?.activeBattle;
  if (battle && !battle.over) battle.focusHostId = hostId;
}

/** Switches standing orders between beats. */
export function setBattlePosture(state: GameState, posture: BattlePosture): void {
  const battle = state.ascent?.activeBattle;
  if (battle && !battle.over) battle.posture = posture;
}

/** A snapshot for the view, so the scene never reaches into army internals itself. */
export function battleView(state: GameState): AscentBattle | undefined {
  return state.ascent?.activeBattle;
}
