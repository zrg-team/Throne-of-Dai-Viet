import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  BATTLE_ADVANCE_PER_TICK,
  BATTLE_BASE_ROUNDS,
  BATTLE_BEATS_PER_TICK,
  BATTLE_CHARGE_COVER,
  BATTLE_CHARGE_MORALE,
  BATTLE_CHARGE_TRADE,
  BATTLE_FOCUS_MULT,
  BATTLE_HOLD_TRADE,
  BATTLE_MAX_ROUNDS,
  BATTLE_MORALE_PER_LOSS,
  BATTLE_MORALE_WIN_GAIN,
  BATTLE_RALLY_BASE,
  BATTLE_RESERVE_SHARE,
  BATTLE_ROUND_BITE,
  BATTLE_RALLY_DESPERATION,
  BATTLE_ROUT_LOSS_SHARE,
  BATTLE_ROUT_MORALE,
  BATTLE_SPREAD_MULT,
  BATTLE_VOLLEY_BITE,
  BATTLE_WITHDRAW_RECOVERY,
} from '../../game/ascentConfig';
import { raiseGarrisonLevy, resolveBattleRecord } from '../empire/InvasionSystem';
import { pushToast } from '../empire/notifications';
import { armyPower, issueMoveOrder, terrainDefenseMultiplier } from '../WarSystem';
import { findLand } from '../LandSystem';
import { battleLine, enrolArrivals, hostHeadcount, ourHosts, theirHosts } from './battleMembership';
import { t } from '../../i18n';
import type { Army, AscentBattle, BattlePosture, GameState, PendingBattle } from '../../state/types';

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
function worthWatching(state: GameState, landId: string, isGreat: boolean): boolean {
  if (isGreat || state.ascent?.capitalLandId === landId) return true;
  return findLand(state, landId)?.ownerId === PLAYER_KINGDOM_ID;
}

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
function summonAdjacentRelief(state: GameState, landId: string): void {
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

  switch (personality) {
    // Cautious powers spend other people's soldiers reluctantly: they hold unless clearly ahead.
    case 'economic':
    case 'diplomatic':
      return theirEdge > 18 ? 'press' : 'hold';
    // A defensive doctrine shoots first and only closes once it has the upper hand.
    case 'defensive':
      return theirEdge > 8 ? 'press' : 'hold';
    // Aggressive and expansionist powers come on hard, and only steady up if badly beaten.
    default:
      return theirEdge < -20 ? 'hold' : 'press';
  }
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

export function fightRound(state: GameState): void {
  const ascent = state.ascent;
  const battle = ascent?.activeBattle;
  if (!ascent || !battle || battle.over) return;

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
  battle.theirPosture = enemyPosture(state, battle);

  // The invader is always coming; we advance only when told to. Charging also closes faster,
  // which is half of why it is worth doing.
  battle.theirAdvance = Math.min(1, battle.theirAdvance + BATTLE_ADVANCE_PER_TICK);
  battle.ourAdvance = charging
    ? Math.min(1, battle.ourAdvance + BATTLE_ADVANCE_PER_TICK * 1.5)
    : Math.max(0, battle.ourAdvance - BATTLE_ADVANCE_PER_TICK * 0.5);

  const met = battle.ourAdvance + battle.theirAdvance >= 1;

  if (!met) {
    // ── Archery: the approach is a phase, not dead time ────────────────────
    //
    // Arrows are the one exchange where numbers do not answer numbers: a host with bowmen hurts
    // one without, and the side that closes faster eats less of it. That asymmetry is what gives
    // both orders a real case, and it makes composition legible without any new data.
    const bows = (hosts: Army[]): number => hosts.reduce((total, host) => total + host.units.archers, 0);
    const ourVolley = bows(ours) * BATTLE_VOLLEY_BITE * (battle.ourMorale / 100);
    const theirVolley = bows(theirs) * BATTLE_VOLLEY_BITE * (battle.theirMorale / 100);
    const cover = charging ? BATTLE_CHARGE_COVER : 1;

    // Spread across the hosts present, so arriving relief is shot at too.
    const ourLoss = ours.reduce((total, host) => total + bleedCount(host, (theirVolley * cover) / ours.length), 0);
    const theirLoss = theirs.reduce((total, host) => total + bleedCount(host, ourVolley / theirs.length), 0);

    battle.ourNow = ours.reduce((total, host) => total + totalUnits(host), 0);
    battle.theirNow = theirs.reduce((total, host) => total + totalUnits(host), 0);
    if (ourLoss > 0 || theirLoss > 0) {
      battle.log.push(t('ascent.battle.volley', { ours: ourLoss, theirs: theirLoss }));
    }
    // Deliberately does not spend the round budget: the approach is the opening, not the fight.
    return;
  }

  // ── First contact ────────────────────────────────────────────────────────
  if (battle.round === 0 && charging) {
    battle.ourMorale = setMorale(defender, battle.ourMorale + BATTLE_CHARGE_MORALE);
    battle.log.push(t('ascent.battle.charged'));
  }

  const sum = (hosts: Army[]): number => hosts.reduce((total, host) => total + armyPower(state, host), 0);
  const ourPower = Math.max(1, sum(ours) * battle.terrainEdge);
  const theirPower = Math.max(1, sum(theirs));
  // Each side's losses are its own exposure times the other's aggression, so a cautious enemy
  // is genuinely a different fight from a reckless one rather than the same fight relabelled.
  const ourTrade = charging ? BATTLE_CHARGE_TRADE : BATTLE_HOLD_TRADE;
  const theirTrade = battle.theirPosture === 'press' ? BATTLE_CHARGE_TRADE : BATTLE_HOLD_TRADE;
  const fuzz = (): number => 0.9 + Math.random() * 0.2;

  const ourShare = BATTLE_ROUND_BITE * (theirPower / (ourPower + theirPower)) * 2
    * ourTrade.taken * theirTrade.dealt * fuzz();
  const theirShare = BATTLE_ROUND_BITE * (ourPower / (ourPower + theirPower)) * 2
    * ourTrade.dealt * theirTrade.taken * fuzz();

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
  const ourDrop = (ourLoss / Math.max(1, battle.ourStart)) * BATTLE_MORALE_PER_LOSS;
  const theirDrop = (theirLoss / Math.max(1, battle.theirStart)) * BATTLE_MORALE_PER_LOSS;
  const wonExchange = theirLoss > ourLoss;
  // Applied to *every* host on the side, not just the one the maths treats as the line, so a
  // battered relief column carries its own heart rather than borrowing the vanguard's.
  for (const host of ours) setMorale(host, host.morale - ourDrop + (wonExchange ? BATTLE_MORALE_WIN_GAIN : 0));
  for (const host of theirs) setMorale(host, host.morale - theirDrop + (wonExchange ? 0 : BATTLE_MORALE_WIN_GAIN));
  battle.ourMorale = defender.morale;
  battle.theirMorale = invader.morale;

  // Hosts break one at a time. Losing a host is a setback, not the battle — which is what makes
  // bringing a second column worth the march, and what stops one bad exchange ending everything.
  for (const host of [...ours, ...theirs]) {
    if (host.morale > BATTLE_ROUT_MORALE) continue;
    battle.brokenHostIds.push(host.id);
    battle.log.push(t('ascent.battle.hostBreaks', { name: host.name }));
    // A host that runs is cut down as it goes, exactly as a whole side is.
    bleed(host, BATTLE_ROUT_LOSS_SHARE);
  }

  battle.ourLostTotal += ourLoss;
  battle.round += 1;
  battle.ourNow = ours.reduce((total, host) => total + totalUnits(host), 0);
  battle.theirNow = theirs.reduce((total, host) => total + totalUnits(host), 0);
  battle.log.push(t('ascent.battle.exchange', { round: battle.round, ours: ourLoss, theirs: theirLoss }));

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
export function advanceBattle(state: GameState): void {
  const battle = state.ascent?.activeBattle;
  if (!battle) return;

  for (let beat = 0; beat < BATTLE_BEATS_PER_TICK && !battle.over; beat += 1) {
    fightRound(state);
  }
  if (battle.over) finishBattle(state, battle.posture);
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

  // The field decides. A side that broke has lost — the shared code is told so outright rather
  // than being asked to roll again over a fight the player just watched end. Only a fight that
  // ran to its round limit, or one the player left, is still settled by the old odds roll.
  const resolved = battle.outcome === 'they-rout'
    ? 'attack'
    : battle.outcome === 'we-rout'
      ? 'delegate'
      : decision === 'retreat' ? 'retreat' : decision === 'press' ? 'attack' : 'delegate';
  const forced = battle.outcome === 'they-rout' ? 'defence' : battle.outcome === 'we-rout' ? 'invader' : undefined;
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
  });
  if (history.length > 24) history.splice(0, history.length - 24);

  ascent.activeBattle = undefined;
  resolveBattleRecord(state, battleRecord(battle), resolved, forced);
  // A rout breaks *every* host that came to the field, not only the one that made contact:
  // a coalition that ran does not get to try the same gate again next tick, one column at a time.
  if (forced === 'defence') {
    for (const id of invaderIds) resolveBattleRecord(state, battleRecord(battle, id), 'delegate', 'defence');
  }
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
