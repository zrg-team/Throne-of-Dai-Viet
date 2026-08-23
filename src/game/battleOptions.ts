/**
 * Two dials the player owns: how hard the enemy is to out-think, and how fast a round goes by.
 *
 * They are preferences rather than run state — they belong to the browser the way the language and
 * the map theme do, not to a reign — so they live beside those in `localStorage` and not in a
 * snapshot. A player who changes the speed mid-siege should not find it reverted by loading a save
 * made before they changed it.
 *
 * **Both default to exactly what the game did before this file existed.** Every harness in
 * `test_scripts/` is tuned against that behaviour, and a setting whose default quietly moves the
 * baseline turns every regression fingerprint into a question about which dial was set.
 */

export type BattleDifficulty = 'easy' | 'medium' | 'hard' | 'nightmare';
export type BattleSpeed = 'slow' | 'normal' | 'fast';

export const BATTLE_DIFFICULTIES: BattleDifficulty[] = ['easy', 'medium', 'hard', 'nightmare'];
export const BATTLE_SPEEDS: BattleSpeed[] = ['slow', 'normal', 'fast'];

interface DifficultyProfile {
  /**
   * Added to the beats the invader hesitates before ordering its answer. Positive is slower.
   *
   * This is the whole of the difficulty axis, and deliberately so: the fight is a race between the
   * player spotting a matchup and the enemy answering it, so *how long the answer takes* is the one
   * number that changes how hard it is to play without changing what the rules are. Nothing here
   * touches damage, morale or the odds — a harder enemy is a quicker one, not a stronger one.
   *
   * It used to lengthen their walk instead. Since the wind rework every walk is one flat beat and
   * the delay moved to hesitation — beats they stand countered before ordering — which is worth
   * strictly more to the player: a hesitating invader is being countered at full tilt, where a
   * walking one had zeroed the tilt for both sides. See `advanceEnemyFormation`.
   */
  readonly reactDelay: number;
  /**
   * Whether they re-form out of an even matchup as well as a losing one.
   *
   * Normally an invader only answers when the ring is actually against them, which is what gives a
   * player the window the whole design depends on: counter, hold it while they walk, spend the
   * advantage before they arrive. Turning this on removes the even-matchup rest, so there is never
   * a beat where they are content.
   */
  readonly answersEven: boolean;
  /**
   * How long the speech bubbles over the two hosts stay up, in ms. `Infinity` keeps them for as
   * long as the sentence is true; `0` never draws them at all.
   *
   * The bubbles are the fight in words — "their spears are set", "we are spread loose" — and on
   * the default setting they now fade, so the drawn formation is what a player learns to read.
   * Hard fades faster; nightmare has no bubbles, only the picture. Both sides, deliberately: a
   * player who ordered a shape knows what they ordered, and a bubble repeating it back was one
   * more thing on a screen that wants the eye on the men.
   */
  readonly bubbleMs: number;
}

const DIFFICULTY: Record<BattleDifficulty, DifficultyProfile> = {
  // Two extra beats is a long window — enough to counter, watch it land, and still spend a beat or
  // two inside the advantage before they answer.
  easy: { reactDelay: 2, answersEven: false, bubbleMs: Infinity },
  // What the fight has always done. See the file's note on defaults.
  medium: { reactDelay: 0, answersEven: false, bubbleMs: 2400 },
  hard: { reactDelay: -1, answersEven: false, bubbleMs: 1100 },
  // Fastest they can be re-formed at all, never a beat of contentment, and no words on the field.
  nightmare: { reactDelay: -2, answersEven: true, bubbleMs: 0 },
};

interface SpeedProfile {
  /** Beats the simulation resolves per economy tick. */
  readonly beatsPerTick: number;
  /** Milliseconds the screen holds one beat while it drains them. */
  readonly tickMs: number;
}

/**
 * The two numbers move together, and that is not a convenience.
 *
 * `advanceBattle` resolves a burst of beats on the economy tick; the screen drains one per
 * `tickMs`. If their product drifts from `ASCENT_TICK_MS` (3500) the view either runs dry and sits
 * on a still picture for the rest of the season, or falls further behind the simulation every
 * tick until it is showing a fight that finished. Each profile below is sized so a tick's worth
 * plays out just inside the tick that produced it, which is the rule `BATTLE_TICK_MS`'s own comment
 * was written to keep.
 */
const SPEED: Record<BattleSpeed, SpeedProfile> = {
  // A beat is shown for 875 ms now, up from 560. At 560 a 28-beat fight was over in 25 s and read
  // as a dice roll — "no game feeling at all" — and every number on the rails stepped faster than
  // the eye could settle on it. The product still matches the world tick.
  slow: { beatsPerTick: 3, tickMs: 1166 },
  normal: { beatsPerTick: 4, tickMs: 875 },
  fast: { beatsPerTick: 6, tickMs: 583 },
};

const DIFFICULTY_KEY = 'mandate:battle:difficulty:v1';
const SPEED_KEY = 'mandate:battle:speed:v1';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  // Guarded because the systems are imported directly by headless harnesses, and a preference that
  // throws where there is no storage would take the whole fight down with it.
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
  } catch {
    return fallback;
  }
}

let difficulty: BattleDifficulty | undefined;
let speed: BattleSpeed | undefined;

export function getBattleDifficulty(): BattleDifficulty {
  difficulty ??= read(DIFFICULTY_KEY, BATTLE_DIFFICULTIES, 'medium');
  return difficulty;
}

export function setBattleDifficulty(value: BattleDifficulty): void {
  difficulty = value;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DIFFICULTY_KEY, value);
  } catch { /* a browser with storage refused is still a browser that can play */ }
}

export function getBattleSpeed(): BattleSpeed {
  speed ??= read(SPEED_KEY, BATTLE_SPEEDS, 'normal');
  return speed;
}

export function setBattleSpeed(value: BattleSpeed): void {
  speed = value;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SPEED_KEY, value);
  } catch { /* as above */ }
}

/** Beats of hesitation before the invader orders its answer. See `DifficultyProfile.reactDelay`. */
export function battleReactDelay(): number {
  return DIFFICULTY[getBattleDifficulty()].reactDelay;
}

/** Whether the invader answers an even matchup as well as a losing one. */
export function battleAnswersEven(): boolean {
  return DIFFICULTY[getBattleDifficulty()].answersEven;
}

/** How long a speech bubble over a host lingers. See `DifficultyProfile.bubbleMs`. */
export function battleBubbleMs(): number {
  return DIFFICULTY[getBattleDifficulty()].bubbleMs;
}

export function battleBeatsPerTick(): number {
  return SPEED[getBattleSpeed()].beatsPerTick;
}

export function battleTickMs(): number {
  return SPEED[getBattleSpeed()].tickMs;
}
