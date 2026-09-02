/**
 * What the battle screen tells the ear about the fight it is showing.
 *
 * The director owns the playing; this owns the *reading* — which track tier a field has earned
 * and how big it is — so the two questions the music asks about a battle are answered in one
 * place instead of at the three call sites that need them.
 */
import { soundDirector } from '../../../ui/sound/SoundDirector';
import type { AscentBattle } from '../../../state/types';

/**
 * The line between a fight and a war: ten thousand men on **each** side.
 *
 * The mode's own threshold, and the one the original brief drew ("if it >10 k soldiers in each
 * side use a epic sound"). Both sides, not the total: twelve thousand men beating two thousand
 * is a massacre, and a massacre does not get a choir.
 */
const EPIC_PER_SIDE = 10_000;

/** Where the bed reaches its (still small) ceiling — twenty thousand men on the field. */
const FULL_INTENSITY_MEN = 20_000;

/**
 * The headcounts the screen is *showing*, not the ones the state has moved on to.
 *
 * The battle view replays beats a tick behind the simulation, so reading the live battle would
 * swell the music for men who have not appeared on screen yet — and, at the end of a rout, for
 * men who are already gone.
 */
function menOnField(battle: AscentBattle): { ours: number; theirs: number } {
  const beat = battle.beats?.[battle.beats.length - 1];
  if (!beat) return { ours: 0, theirs: 0 };
  return { ours: beat.ourNow, theirs: beat.theirNow };
}

function isEpic(battle: AscentBattle): boolean {
  const { ours, theirs } = menOnField(battle);
  return ours >= EPIC_PER_SIDE && theirs >= EPIC_PER_SIDE;
}

/**
 * How loud the bed should be for this field, 0–1 — the director maps it into a band that never
 * leaves "quiet". Both sides count, because a field is as big as everyone standing on it.
 */
function intensity(battle: AscentBattle): number {
  const { ours, theirs } = menOnField(battle);
  return Math.min(1, (ours + theirs) / FULL_INTENSITY_MEN);
}

/** A field is opened: start its bed. Idempotent — reopening the same fight keeps its track. */
export function startBattleMusic(self: { state: unknown }, battle: AscentBattle): void {
  void self;
  const key = battle.key ?? `${battle.landId}:${battle.invaderArmyId}`;
  soundDirector.battleMusic(key, isEpic(battle), intensity(battle));
}

/**
 * A beat passed: keep the volume with it.
 *
 * Only the volume. The *track* is deliberately not re-chosen mid-fight — a field that crosses ten
 * thousand halfway through would otherwise cut to a different piece of music, which is the one
 * thing a bed must never do.
 */
export function updateBattleMusic(self: { state: unknown }, battle: AscentBattle): void {
  void self;
  soundDirector.setBattleIntensity(intensity(battle));
}

/** The screen is left, by any of its doors. */
export function stopBattleMusic(): void {
  soundDirector.stopBattleMusic();
}
