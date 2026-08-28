/**
 * **A control may only be activated by a press it was alive to receive.**
 *
 * Reported, twice, and the second time as critical: *modal have a "Close" button — click it — also
 * click on the menu behind.* It is not a stray hit test and it is not a missing overlay: it is one
 * physical press being read by two different controls, half a frame apart.
 *
 * The sequence, exactly:
 *
 *  1. `pointerdown` lands on the sheet's Close button. `InkUI.button` acts on the **press** — that
 *     was a deliberate change, made because waiting for the release read as lag on a phone.
 *  2. Closing tears the sheet down and rebuilds what was under it. The menu, the action bar and
 *     every row on them are **new objects**, created under a finger that is still down.
 *  3. `pointerup` for that same press is delivered by Phaser to whatever is now under the pointer.
 *     Rows and links act on the **release** (`InkUI` list rows, `ActionBar`, the advisor strip,
 *     the whisper line, the battle dock — a dozen sites). One of them fires.
 *
 * So the player pressed once and the game did two things: closed the sheet, and picked whatever
 * the close revealed. Nothing about it is random, which is why it survived a hit-test fix.
 *
 * No amount of overlay geometry can fix this. At the moment of the release the sheet is *gone* —
 * there is nothing left to cover anything, and the control that answers was not on screen when the
 * player decided to press. The question is not "what is under the pointer" but "was this control
 * there when the press began".
 *
 * A monotonic counter answers that in one comparison and with no clock. It is bumped whenever the
 * interface is torn down and rebuilt; every control records the value it was born under; a press
 * records the value that was current when it started. A release then acts only if the control is
 * at least as old as the press.
 *
 * Deliberately **not** bumped on every `refresh` — that runs several times a tick, and refusing a
 * release because a repaint happened between the press and the lift would eat ordinary taps. It is
 * bumped where objects genuinely die and are replaced under the player's finger: overlay
 * transitions.
 */
import Phaser from 'phaser';

/** Bumped when the interface is torn down and rebuilt. Never reset — only ever compared. */
let generation = 0;

/** The generation current when the live press began, so a release can be judged against it. */
let pressGeneration = 0;

/** Key under which a control records the generation it was created in. */
const BORN_KEY = '__uiGen';

/** The generation a control created right now belongs to. */
export function currentGeneration(): number {
  return generation;
}

/**
 * Marks the interface as torn down and rebuilt: everything created from here on is *newer* than
 * any press already in flight, and cannot be activated by one.
 */
export function bumpInputGeneration(): void {
  generation += 1;
}

/**
 * Records that a press has begun, so its release can be checked against what existed at the time.
 *
 * Installed once per scene by `InkUI`. A single value rather than one per pointer id: this is a
 * one-thumb game, and a second finger arriving mid-gesture would at worst make the first one's
 * release stricter, which fails safe.
 */
export function notePressStarted(): void {
  pressGeneration = generation;
}

/**
 * Stamps a control with the generation it was born in. Call where the hit area is created.
 *
 * Anything unstamped reads as generation 0 — as old as the game — so a control that has not opted
 * in behaves exactly as it did before. This has to be additive: there are a dozen release-driven
 * controls and they are not all worth converting at once.
 */
export function markControlBorn(target: Phaser.GameObjects.GameObject): void {
  target.setData(BORN_KEY, generation);
}

/**
 * True when this control appeared *after* the press now being released — so the release is the
 * tail of a gesture aimed at something else, and this control must ignore it.
 */
export function pressPredatesControl(target: Phaser.GameObjects.GameObject): boolean {
  const born = (target.getData(BORN_KEY) as number | undefined) ?? 0;
  return born > pressGeneration;
}
