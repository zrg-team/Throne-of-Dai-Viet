import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  BATTLE_ADVANCE_PER_TICK,
  BATTLE_BASE_ROUNDS,
  BATTLE_BEATS_PER_TICK,
  BATTLE_CHARGE_COVER,
  BATTLE_CHARGE_MORALE,
  BATTLE_CHARGE_TRADE,
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
  BATTLE_VOLLEY_BITE,
} from '../../game/ascentConfig';
import { resolvePendingBattle } from '../empire/InvasionSystem';
import { armyPower, terrainDefenseMultiplier } from '../WarSystem';
import { findLand } from '../LandSystem';
import { enqueueAscentPrompt } from './AscentState';
import { t } from '../../i18n';
import type { Army, AscentBattle, BattlePosture, GameState } from '../../state/types';

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

function totalUnits(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

/**
 * Every host of ours standing on the contested province — not just the one that started the
 * fight.
 *
 * This *is* the reinforcement mechanic, and it needs no timers, no arrival events and no new
 * bookkeeping. `progressMovementOrders` already walks armies to lands, so a host ordered to the
 * battle simply appears here the beat it arrives, and the map's real distances become the clock.
 * The same is true of the enemy: a second invader reaching the province joins theirs.
 */
export function ourHosts(state: GameState, landId: string): Army[] {
  return state.armies.filter(
    (army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === landId && totalUnits(army) > 0,
  );
}

export function theirHosts(state: GameState, landId: string, kingdomId: string): Army[] {
  return state.armies.filter(
    (army) => army.kingdomId !== PLAYER_KINGDOM_ID && army.landId === landId && totalUnits(army) > 0
      && (army.kingdomId === kingdomId || (state.invasions ?? []).some((r) => r.armyId === army.id)),
  );
}

/** The strongest host of ours present — the one the melee maths treats as the line. */
export function battleDefender(state: GameState, landId: string): Army | undefined {
  return ourHosts(state, landId).sort((a, b) => totalUnits(b) - totalUnits(a))[0];
}

/**
 * Whether this fight is worth stopping the game for.
 *
 * Deliberately just these two, and not "any fight we are losing". That odds clause was tried
 * and barely filtered anything: a single intercepting host is almost always weaker than a wave
 * sized against the realm's whole contested defence, so "not clearly winning" described 47 of
 * 48 engagements. A rule that admits everything is not a rule.
 */
function worthWatching(state: GameState, landId: string, isGreat: boolean): boolean {
  return isGreat || state.ascent?.capitalLandId === landId;
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
  const defender = battleDefender(state, pending.landId);
  if (!invader || !defender) return false;
  if (!worthWatching(state, pending.landId, pending.isGreat)) return false;

  // At most one watched engagement per wave: `maybeRequestBattleDecision` fires on every tick an
  // invader stands on a contested province, not once per battle, so a single siege of the capital
  // raised the modal again and again.
  if (ascent.lastWatchedWave === ascent.wave) return false;
  ascent.lastWatchedWave = ascent.wave;

  const reserve = splitReserve(defender);
  const scale = Math.min(1, (totalUnits(invader) + totalUnits(defender)) / 2400);
  const totalRounds = Math.round(BATTLE_BASE_ROUNDS + (BATTLE_MAX_ROUNDS - BATTLE_BASE_ROUNDS) * scale);
  const land = findLand(state, pending.landId);
  const general = state.heroes.find((hero) => hero.id === defender.generalHeroId);

  ascent.activeBattle = {
    landId: pending.landId,
    landName: pending.landName,
    invaderArmyId: pending.invaderArmyId,
    kingdomId: pending.kingdomId,
    kingdomName: pending.kingdomName,
    isGreat: pending.isGreat,
    round: 0,
    totalRounds,
    posture: 'hold',
    theirPosture: 'press',
    ourStartMorale: defender.morale,
    ourAdvance: 0,
    theirAdvance: 0,
    ourMorale: defender.morale,
    theirMorale: invader.morale,
    ourHostCount: ourHosts(state, pending.landId).length,
    theirHostCount: theirHosts(state, pending.landId, pending.kingdomId).length,
    ourStart: totalUnits(defender) + reserve.spearmen + reserve.archers + reserve.heavyInfantry,
    theirStart: totalUnits(invader),
    ourNow: totalUnits(defender),
    theirNow: totalUnits(invader),
    reserve,
    reserveSpent: false,
    // Rally is the general's, so a host with nobody at its head simply does not get one.
    rallySpent: !general,
    rallyPower: general ? Math.round(BATTLE_RALLY_BASE + general.stats.martial * 0.25) : 0,
    // The ground the defender is standing on. Already used by `defenderPower`; stated on the
    // screen here so intercepting on high ground becomes a decision back on the map.
    terrainEdge: land ? terrainDefenseMultiplier(land) : 1,
    outcome: 'fighting',
    log: [],
    over: false,
  };

  // Deliberately does *not* raise a prompt.
  //
  // A prompt goes through `drainAscentPrompts`, which sets `isPaused`, which stops
  // `ConquestScene.update` — and a frozen world is incompatible with marching reinforcements to
  // the fight. The battle is ordinary state now: the tick advances it, and the player opens the
  // screen when they want to watch or intervene. The Pause button still stops everything.
  return true;
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
  // beat is simply in this list, and one that was destroyed is simply not.
  const ours = ourHosts(state, battle.landId);
  const theirs = theirHosts(state, battle.landId, battle.kingdomId);
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
  const theirLoss = theirs.reduce((total, host) => total + bleed(host, Math.min(0.9, theirShare)), 0);

  // Morale follows the exchange: bleeding costs heart, and winning the exchange restores a
  // little of it. Because `armyPower` reads morale, the side that starts losing keeps losing.
  const ourDrop = (ourLoss / Math.max(1, battle.ourStart)) * BATTLE_MORALE_PER_LOSS;
  const theirDrop = (theirLoss / Math.max(1, battle.theirStart)) * BATTLE_MORALE_PER_LOSS;
  const wonExchange = theirLoss > ourLoss;
  battle.ourMorale = setMorale(defender, battle.ourMorale - ourDrop + (wonExchange ? BATTLE_MORALE_WIN_GAIN : 0));
  battle.theirMorale = setMorale(invader, battle.theirMorale - theirDrop + (wonExchange ? 0 : BATTLE_MORALE_WIN_GAIN));

  battle.round += 1;
  battle.ourNow = ours.reduce((total, host) => total + totalUnits(host), 0);
  battle.theirNow = theirs.reduce((total, host) => total + totalUnits(host), 0);
  battle.log.push(t('ascent.battle.exchange', { round: battle.round, ours: ourLoss, theirs: theirLoss }));

  // ── Does anyone break? ───────────────────────────────────────────────────
  if (battle.theirMorale <= BATTLE_ROUT_MORALE) {
    battle.outcome = 'they-rout';
    battle.log.push(t('ascent.battle.theyBreak', { kingdom: battle.kingdomName }));
    battle.over = true;
    return;
  }
  if (battle.ourMorale <= BATTLE_ROUT_MORALE) {
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
export function commitReserve(state: GameState): boolean {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.reserveSpent || battle.over) return false;
  const defender = battleDefender(state, battle.landId);
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
  const defender = battleDefender(state, battle.landId);
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

  if (battle && !battle.reserveSpent) {
    const defender = battleDefender(state, battle.landId);
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
  if (battle?.outcome === 'we-rout') {
    for (const host of ourHosts(state, battle.landId)) bleed(host, BATTLE_ROUT_LOSS_SHARE);
  }
  const resolved = battle?.outcome === 'they-rout'
    ? 'attack'
    : battle?.outcome === 'we-rout'
      ? 'delegate'
      : decision === 'retreat' ? 'retreat' : decision === 'press' ? 'attack' : 'delegate';

  ascent.activeBattle = undefined;
  resolvePendingBattle(state, resolved);
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
