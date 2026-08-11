import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  BATTLE_ADVANCE_PER_TICK,
  BATTLE_BASE_ROUNDS,
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

/** The defender the player actually has standing on the contested province. */
export function battleDefender(state: GameState, landId: string): Army | undefined {
  return state.armies.find(
    (army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === landId && totalUnits(army) > 0,
  );
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
    ourAdvance: 0,
    theirAdvance: 0,
    ourMorale: defender.morale,
    theirMorale: invader.morale,
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

  enqueueAscentPrompt(state, { kind: 'battle' });
  return true;
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

  const invader = state.armies.find((army) => army.id === battle.invaderArmyId);
  const defender = battleDefender(state, battle.landId);
  if (!invader || !defender) {
    battle.over = true;
    battle.outcome = 'fighting';
    return;
  }

  const charging = battle.posture === 'press';

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
    const ourVolley = defender.units.archers * BATTLE_VOLLEY_BITE * (battle.ourMorale / 100);
    const theirVolley = invader.units.archers * BATTLE_VOLLEY_BITE * (battle.theirMorale / 100);
    const cover = charging ? BATTLE_CHARGE_COVER : 1;

    const ourLoss = bleedCount(defender, theirVolley * cover);
    const theirLoss = bleedCount(invader, ourVolley);

    battle.ourNow = totalUnits(defender);
    battle.theirNow = totalUnits(invader);
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

  const ourPower = Math.max(1, armyPower(state, defender) * battle.terrainEdge);
  const theirPower = Math.max(1, armyPower(state, invader));
  const trade = charging ? BATTLE_CHARGE_TRADE : BATTLE_HOLD_TRADE;
  const fuzz = (): number => 0.9 + Math.random() * 0.2;

  const ourShare = BATTLE_ROUND_BITE * (theirPower / (ourPower + theirPower)) * 2 * trade.taken * fuzz();
  const theirShare = BATTLE_ROUND_BITE * (ourPower / (ourPower + theirPower)) * 2 * trade.dealt * fuzz();

  const ourLoss = bleed(defender, Math.min(0.9, ourShare));
  const theirLoss = bleed(invader, Math.min(0.9, theirShare));

  // Morale follows the exchange: bleeding costs heart, and winning the exchange restores a
  // little of it. Because `armyPower` reads morale, the side that starts losing keeps losing.
  const ourDrop = (ourLoss / Math.max(1, battle.ourStart)) * BATTLE_MORALE_PER_LOSS;
  const theirDrop = (theirLoss / Math.max(1, battle.theirStart)) * BATTLE_MORALE_PER_LOSS;
  const wonExchange = theirLoss > ourLoss;
  battle.ourMorale = setMorale(defender, battle.ourMorale - ourDrop + (wonExchange ? BATTLE_MORALE_WIN_GAIN : 0));
  battle.theirMorale = setMorale(invader, battle.theirMorale - theirDrop + (wonExchange ? 0 : BATTLE_MORALE_WIN_GAIN));

  battle.round += 1;
  battle.ourNow = totalUnits(defender);
  battle.theirNow = totalUnits(invader);
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
  // Fresh troops steady the line as well as thicken it.
  battle.ourMorale = setMorale(defender, battle.ourMorale + BATTLE_CHARGE_MORALE);
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

  battle.rallySpent = true;
  battle.ourMorale = setMorale(defender, battle.ourMorale + battle.rallyPower);
  battle.log.push(t('ascent.battle.rallied', { n: battle.rallyPower }));
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

  ascent.activeBattle = undefined;
  resolvePendingBattle(
    state,
    decision === 'retreat' ? 'retreat' : decision === 'press' ? 'attack' : 'delegate',
  );
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
