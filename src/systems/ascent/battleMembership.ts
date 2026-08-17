import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { Army, AscentBattle, GameState } from '../../state/types';

/**
 * Who is in a fight.
 *
 * A leaf module on purpose: it imports nothing but types, so the invasion tick, the war system
 * and the autopilot can all ask "is this host engaged?" without pulling `BattleSystem` — and its
 * import of `InvasionSystem` — into a cycle.
 *
 * Membership is explicit (`battle.ourArmyIds` / `theirArmyIds`) rather than "whoever stands on
 * the contested province". That distinction is the whole reason the watched battle exists at
 * all: an invader makes contact from the *adjacent* land, so a fight keyed on the province
 * opened with nobody across the field and was over before its first beat — every "watched"
 * defence resolved as a hidden roll inside the tick that opened it. Enrolment is re-run every
 * beat (`enrolArrivals`), which is what keeps relief simple: a host that marches in is enrolled
 * the beat it arrives, and one that is destroyed is simply no longer alive.
 */

export function hostHeadcount(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

function alive(state: GameState, ids: string[] | undefined, broken: string[]): Army[] {
  if (!ids || ids.length === 0) return [];
  const wanted = new Set(ids);
  return state.armies.filter(
    (army) => wanted.has(army.id) && hostHeadcount(army) > 0 && !broken.includes(army.id),
  );
}

/** Every host of ours still in the line — every column, not just the one that started it. */
export function ourHosts(state: GameState, battle: AscentBattle): Army[] {
  return alive(state, battle.ourArmyIds, battle.brokenHostIds);
}

export function theirHosts(state: GameState, battle: AscentBattle): Army[] {
  return alive(state, battle.theirArmyIds, battle.brokenHostIds);
}

/** The strongest host of ours present — the one the melee maths treats as the line. */
export function battleLine(state: GameState, battle: AscentBattle): Army | undefined {
  return ourHosts(state, battle).sort((a, b) => hostHeadcount(b) - hostHeadcount(a))[0];
}

/** True while `armyId` is fighting in the live engagement, on either side. */
export function isEngaged(state: GameState, armyId: string): boolean {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) return false;
  return (battle.ourArmyIds ?? []).includes(armyId) || (battle.theirArmyIds ?? []).includes(armyId);
}

/**
 * Brings the rolls up to date with the field.
 *
 * Defence: our side is every host of ours standing on the province; theirs is every hostile
 * host on it, plus every invader standing *next to* it that is either the host which made
 * contact or is marching on this province — the wave at the gates. A coalition converging on
 * one province is one battle, not three rolls.
 *
 * Offence: our side is only the hosts committed to the assault (they stand on their origin, so
 * geography would enrol nothing) plus any host of ours that has since reached the target;
 * theirs is every hostile host on the target — including the garrison levy raised for it.
 *
 * Returns how many joined each side this beat, so the fight can announce relief.
 */
export function enrolArrivals(state: GameState, battle: AscentBattle): { ours: number; theirs: number } {
  const ours = new Set(battle.ourArmyIds ?? []);
  const theirs = new Set(battle.theirArmyIds ?? []);
  const oursBefore = ours.size;
  const theirsBefore = theirs.size;
  const land = state.lands.find((candidate) => candidate.id === battle.landId);
  const neighbours = new Set(land?.neighbors ?? []);
  const invasions = state.invasions ?? [];

  for (const army of state.armies) {
    if (hostHeadcount(army) <= 0) continue;
    if (army.kingdomId === PLAYER_KINGDOM_ID) {
      if (army.landId === battle.landId && !ours.has(army.id)) {
        ours.add(army.id);
        // A host caught on the province stands and fights. Its march is dropped here rather
        // than left to complete: a column that was mid-leg when contact came kept walking,
        // arrived elsewhere the next tick, and the field it had been counted on emptied — the
        // line "broke" at round zero with nobody having struck a blow.
        state.movementOrders = state.movementOrders.filter((order) => order.armyId !== army.id);
      }
      continue;
    }
    if (army.landId === battle.landId) {
      // A hostile host on the ground itself. In a defence it must belong to the fight — the
      // invading kingdom or any invader; on an assault every defender of the province fights.
      const invading = invasions.some((record) => record.armyId === army.id);
      if (battle.role === 'offence' || army.kingdomId === battle.kingdomId || invading) theirs.add(army.id);
      continue;
    }
    if (battle.role === 'offence') continue;
    if (!neighbours.has(army.landId)) continue;
    if (army.id === battle.invaderArmyId) {
      theirs.add(army.id);
      continue;
    }
    const record = invasions.find((candidate) => candidate.armyId === army.id);
    if (record && record.targetLandId === battle.landId) theirs.add(army.id);
  }

  battle.ourArmyIds = [...ours];
  battle.theirArmyIds = [...theirs];
  return { ours: ours.size - oursBefore, theirs: theirs.size - theirsBefore };
}
