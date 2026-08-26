/**
 * More than one field at a time.
 *
 * **Why it was one.** `maybeRequestBattleDecision` refused outright while anything was live, and
 * the comment there says what the alternative had been: *queuing froze the second invader for the
 * length of the first fight, and a three-host wave took three fights' worth of seasons to land.*
 * Both answers were wrong in the same way — a wave that strikes three provinces is one event, and
 * the game was either showing a third of it or stalling two thirds of it. Measured over four
 * 400-tick runs, a run settles 20–96 engagements and the screen opened for 6–15; the rest were
 * hidden dice.
 *
 * **The third answer.** The fights all run. `activeBattle` is the one the player is *standing on*
 * — the screen, the dials, the stamina pips, all unchanged — and `sideBattles` are the rest, held
 * by their generals on the same beat clock. Nobody waits, and moving between them is a tap.
 *
 * **How the beat code reaches a side fight.** Every function in `BattleSystem` reads
 * `state.ascent.activeBattle` off the state rather than taking a battle argument — `fightRound`,
 * `generalPlaysBeat`, `raiseMoment`, `finishBattle`, nineteen of them. Threading a parameter
 * through all nineteen would be a far larger and far riskier diff than the feature, so `withFocus`
 * moves the focus, runs the beat, and puts it back. One function knows the trick and it is
 * commented where it happens; nothing else in the codebase has to learn a new way to read a fight.
 */
import { MAX_LIVE_BATTLES } from '../../game/ascentConfig';
import type { AscentBattle, GameState } from '../../state/types';

/** Every fight still being fought, the player's own first. */
export function liveBattles(state: GameState): AscentBattle[] {
  const ascent = state.ascent;
  if (!ascent) return [];
  const all = [ascent.activeBattle, ...(ascent.sideBattles ?? [])];
  return all.filter((battle): battle is AscentBattle => Boolean(battle) && !battle!.over);
}

/** How many fields the realm is holding right now. */
export function liveBattleCount(state: GameState): number {
  return liveBattles(state).length;
}

/**
 * True when another front would still fit under the cap.
 *
 * `landId` buys the dynasty's seat one slot past it. The cap is a budget on the player's
 * *attention* — three fields is the most a thumb can hold — and past it a contact is settled by
 * `resolveInvaderBattle`'s die roll. That is a fair trade for a border province and not one for
 * the capital: losing the seat ends the run, and a run must not end on a roll nobody was shown.
 * The extra field opens delegated like every other side front, so it costs no attention either.
 */
export function hasRoomForAnotherFront(state: GameState, landId?: string): boolean {
  const seat = Boolean(landId) && landId === state.ascent?.capitalLandId;
  return liveBattleCount(state) < MAX_LIVE_BATTLES + (seat ? 1 : 0);
}

/** The fight on a given province, wherever it is being held. */
export function battleAt(state: GameState, landId: string): AscentBattle | undefined {
  return liveBattles(state).find((battle) => battle.landId === landId);
}

/** True when this host is standing in the line of *any* live fight, not only the watched one. */
export function inAnyBattle(state: GameState, armyId: string): boolean {
  return liveBattles(state).some((battle) => (battle.ourArmyIds ?? []).includes(armyId));
}

/**
 * Files a newly opened engagement.
 *
 * The player's hands are already on a field, so this one goes to a general — `delegated` from the
 * first beat rather than after the grace window, because there is nobody to grant a grace window
 * to. Returns false when the cap is full; the caller settles it the old way, as an odds roll.
 */
export function addSideBattle(state: GameState, battle: AscentBattle): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  // By name, so the dynasty's seat gets the slot past the cap here too. Checked without it, a
  // capital contact that arrived while a field was already open was refused the extra slot
  // `beginBattle` had just granted it and went back to being a die roll.
  if (!hasRoomForAnotherFront(state, battle.landId)) return false;
  battle.delegated = true;
  (ascent.sideBattles ??= []).push(battle);
  // Two fights at once changes what the player should be *doing*, not merely how well it is
  // going, and the count is what the screen needs to say so.
  ascent.frontsOpened = liveBattleCount(state);
  // The world stops only when there is nobody on a field — then the board comes up and the whole
  // question is which one to hold. A player already in a fight is *told* (the fronts chip on the
  // near corner names the others) and not stopped: freezing a running battle to announce another
  // one is the stall that reads as the fight having died.
  if (!ascent.activeBattle || ascent.activeBattle.over) state.isStrategyPause = true;
  return true;
}

/**
 * Moves the player's attention to the fight on `landId`.
 *
 * The fight they leave is handed to its general on the way out — a field with nobody on either
 * dial is the one state this mode has already decided is not allowed to exist (see the auto-
 * delegate window in `AscentTick`), and here the player has *chosen* to be elsewhere, so it
 * happens at once rather than after eight beats of a host standing flat.
 */
export function focusBattle(state: GameState, landId: string): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  const sides = ascent.sideBattles ?? [];
  const index = sides.findIndex((battle) => battle.landId === landId && !battle.over);
  if (index < 0) return false;

  const taking = sides[index];
  sides.splice(index, 1);
  const leaving = ascent.activeBattle;
  if (leaving && !leaving.over) {
    leaving.delegated = true;
    sides.push(leaving);
  }
  ascent.activeBattle = taking;
  // Taken back by the hand that asked for it. The take-back chip says so on the screen this
  // opens, so a focused fight is never one the player has to hand *back* to themselves.
  taking.delegated = false;
  ascent.sideBattles = sides;
  return true;
}

/**
 * Runs `beat` with the focus moved onto `battle`, and puts it back afterwards.
 *
 * Returns false when the beat ended the fight — `finishBattle` clears `activeBattle`, which under
 * a moved focus means *this* battle is over — so the caller drops it from the list. The restore is
 * in a `finally` because a throw inside a beat that left the focus on a side fight would hand the
 * player somebody else's battle screen.
 */
export function withFocus(state: GameState, battle: AscentBattle, beat: () => void): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  const held = ascent.activeBattle;
  ascent.activeBattle = battle;
  let survived = true;
  try {
    beat();
    survived = ascent.activeBattle === battle;
  } finally {
    ascent.activeBattle = held;
  }
  return survived;
}

/**
 * Puts somebody on the empty chair.
 *
 * Called when the watched fight ends: if a general is still holding a field somewhere, the player
 * is moved to it rather than being returned to a map with a war on it and no way into the war.
 * Worst first — besieged, then outnumbered — so the promotion is the fight that most needs a
 * pair of hands, not whichever happened to open first.
 */
export function promoteNextFront(state: GameState): AscentBattle | undefined {
  const ascent = state.ascent;
  if (!ascent || ascent.activeBattle) return undefined;
  const sides = (ascent.sideBattles ?? []).filter((battle) => !battle.over);
  if (sides.length === 0) {
    ascent.sideBattles = [];
    return undefined;
  }
  sides.sort((a, b) => (b.theirNow / Math.max(1, b.ourNow)) - (a.theirNow / Math.max(1, a.ourNow)));
  const next = sides.shift() as AscentBattle;
  ascent.sideBattles = sides;
  ascent.activeBattle = next;
  // Still the general's, deliberately. The player did not ask to be here; the screen offers the
  // take-back chip and the fight goes on properly held until they press it.
  return next;
}
