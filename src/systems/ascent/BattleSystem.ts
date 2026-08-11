import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  BATTLE_BASE_ROUNDS,
  BATTLE_BREAK_SHARE,
  BATTLE_HOLD_TRADE,
  BATTLE_MAX_ROUNDS,
  BATTLE_PRESS_TRADE,
  BATTLE_ROUND_BITE,
} from '../../game/ascentConfig';
import { resolvePendingBattle } from '../empire/InvasionSystem';
import { armyPower } from '../WarSystem';
import { enqueueAscentPrompt } from './AscentState';
import { t } from '../../i18n';
import type { Army, AscentBattle, BattlePosture, GameState } from '../../state/types';

/**
 * The fight you can actually watch.
 *
 * Every battle in this mode used to resolve invisibly: `maybeRequestBattleDecision` raised a
 * `pendingBattle`, and the tick threw it away with `resolvePendingBattle(state, 'delegate')`
 * before anything could render it. A player spent ten minutes building an army and never once
 * saw it fight.
 *
 * This runs the engagement as a handful of exchanges the player can intervene in, then hands
 * the decisive blow back to the shared `resolvePendingBattle`. That hand-off is deliberate and
 * load-bearing: province capture, siege orders, pillage, despawn and spoils all stay in the
 * tested empire-mode path, and `resolveInvaderBattle` reads live army state — so the outcome
 * follows from the exchange the player just watched rather than being computed twice.
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
 * Without a filter, every collision between a marching host and an intercepting one opens the
 * modal: measured, 48 engagements in a 196-season run, which pushed a run's total decisions
 * from ~66 to 141 and re-created exactly the modal spam an earlier pass had to rescue this mode
 * from. Most of those were two tired hosts brushing past each other on a border province.
 *
 * So the game stops for the fights whose outcome the player would actually want to change: the
 * seat of the dynasty, a Great Invasion, or any battle the odds say is going badly. Everything
 * else is what generals are for, and resolves the way it always did.
 */
function worthWatching(state: GameState, landId: string, isGreat: boolean): boolean {
  // Deliberately just these two, and not "any fight we are losing".
  //
  // That odds clause was tried and barely filtered anything: a single intercepting host is
  // almost always weaker than a wave sized against the realm's whole contested defence, so
  // "not clearly winning" described 47 of 48 engagements. A rule that admits everything is not
  // a rule. The seat of the dynasty and a named Great Invasion are the fights whose outcome is
  // worth a player's whole attention; the rest is what generals are for.
  return isGreat || state.ascent?.capitalLandId === landId;
}

/**
 * Opens the engagement from whatever `maybeRequestBattleDecision` staged, and queues the prompt.
 *
 * Returns false when there is nothing to watch — no invader, or no host of ours present — so
 * the caller can fall back to letting the shared code resolve it silently.
 */
export function beginBattle(state: GameState): boolean {
  const ascent = state.ascent;
  const pending = state.pendingBattle;
  if (!ascent || !pending || ascent.activeBattle) return false;

  const invader = state.armies.find((army) => army.id === pending.invaderArmyId);
  const defender = battleDefender(state, pending.landId);
  if (!invader || !defender) return false;
  if (!worthWatching(state, pending.landId, pending.isGreat)) return false;

  // At most one watched engagement per wave.
  //
  // `maybeRequestBattleDecision` fires on every tick an invader stands on a contested province,
  // not once per battle — so a single siege of the capital raised the modal again and again.
  // Measured, that was 48-67 "engagements" a run even after narrowing to capital-and-boss
  // fights, and it tripled a run's decisions. One per wave makes each one an event.
  if (ascent.lastWatchedWave === ascent.wave) return false;
  ascent.lastWatchedWave = ascent.wave;

  // Bigger engagements last longer, so a decisive clash between small hosts does not drag and
  // a great invasion is not over in one exchange.
  const scale = Math.min(1, (totalUnits(invader) + totalUnits(defender)) / 2400);
  const totalRounds = Math.round(BATTLE_BASE_ROUNDS + (BATTLE_MAX_ROUNDS - BATTLE_BASE_ROUNDS) * scale);

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
    ourStart: totalUnits(defender),
    theirStart: totalUnits(invader),
    ourNow: totalUnits(defender),
    theirNow: totalUnits(invader),
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

/**
 * One exchange.
 *
 * Casualties are proportional to the *other* side's battle power, so the same `armyPower` that
 * decides the real outcome drives what the player watches — and the ±10% roll is the same
 * `Uniform(0.9, 1.1)` shape `resolveInvaderBattle` uses, so the odds quoted on the response
 * card stay honest against what happens here.
 *
 * Posture is a genuine trade rather than a strictly-better button: pressing the attack hurts
 * them more and costs you more, holding the line does the reverse.
 */
export function fightRound(state: GameState): void {
  const ascent = state.ascent;
  const battle = ascent?.activeBattle;
  if (!ascent || !battle || battle.over) return;

  const invader = state.armies.find((army) => army.id === battle.invaderArmyId);
  const defender = battleDefender(state, battle.landId);
  if (!invader || !defender) {
    battle.over = true;
    return;
  }

  const ourPower = Math.max(1, armyPower(state, defender));
  const theirPower = Math.max(1, armyPower(state, invader));
  const trade = battle.posture === 'press' ? BATTLE_PRESS_TRADE : BATTLE_HOLD_TRADE;
  const fuzz = (): number => 0.9 + Math.random() * 0.2;

  // Each side's losses scale with how outmatched it is, so a mismatch shows in the bars
  // immediately rather than only in the verdict.
  const ourShare = BATTLE_ROUND_BITE * (theirPower / (ourPower + theirPower)) * 2 * trade.taken * fuzz();
  const theirShare = BATTLE_ROUND_BITE * (ourPower / (ourPower + theirPower)) * 2 * trade.dealt * fuzz();

  const ourLoss = bleed(defender, Math.min(0.9, ourShare));
  const theirLoss = bleed(invader, Math.min(0.9, theirShare));

  battle.round += 1;
  battle.ourNow = totalUnits(defender);
  battle.theirNow = totalUnits(invader);
  battle.log.push(t('ascent.battle.exchange', {
    round: battle.round,
    ours: ourLoss,
    theirs: theirLoss,
  }));

  // A host that has lost most of its strength breaks before the last scheduled exchange.
  const ourBroken = battle.ourNow <= battle.ourStart * BATTLE_BREAK_SHARE;
  const theirBroken = battle.theirNow <= battle.theirStart * BATTLE_BREAK_SHARE;
  if (battle.round >= battle.totalRounds || ourBroken || theirBroken) {
    battle.over = true;
  }
}

/**
 * Ends the engagement and lets the shared invasion code decide what it meant.
 *
 * `press` and `hold` map onto the existing defender bonuses; `retreat` onto the existing
 * withdrawal branch, which already pulls the field army clear and leaves the province to
 * whatever garrison remains.
 */
export function finishBattle(state: GameState, decision: 'press' | 'hold' | 'retreat'): void {
  const ascent = state.ascent;
  if (!ascent) return;

  ascent.activeBattle = undefined;
  resolvePendingBattle(
    state,
    decision === 'retreat' ? 'retreat' : decision === 'press' ? 'attack' : 'delegate',
  );
}

/** Switches posture between exchanges. */
export function setBattlePosture(state: GameState, posture: BattlePosture): void {
  const battle = state.ascent?.activeBattle;
  if (battle && !battle.over) battle.posture = posture;
}

/** A snapshot for the view, so the scene never reaches into army internals itself. */
export function battleView(state: GameState): AscentBattle | undefined {
  return state.ascent?.activeBattle;
}
