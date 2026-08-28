/**
 * **While a sheet is open, nothing behind it may act — including on the release of the press that
 * closed it.**
 *
 * Reported three times, the last one as *"click close button in modal -> also click on behind
 * bottom bar"*. Two earlier fixes missed, and both misses are worth recording because they are the
 * two obvious wrong answers.
 *
 * The bug is one physical press read by two controls, half a frame apart:
 *
 *  1. `pointerdown` lands on the sheet's Close. `InkUI.button` acts on the **press** — deliberate,
 *     because waiting for the release read as lag on a phone.
 *  2. Closing tears the sheet down. `renderActionBar` shows the bottom bar again.
 *  3. `pointerup` for that same press is delivered to whatever is now under the pointer. The bar,
 *     its lanes, the advisor strip and every list row act on the **release**. One of them fires.
 *
 * **Wrong answer one: cover it.** No overlay geometry can help, because at the moment of the
 * release the sheet is already gone. There is nothing left to cover anything.
 *
 * **Wrong answer two: ask how old the control is.** The first version of this file stamped each
 * control with a generation at construction and refused a release from an older press. That is
 * correct for controls the close *rebuilds* — and the bottom bar is not one of them.
 * `ActionBar.refresh` early-returns on an unchanged key, so its buttons are built once and merely
 * hidden and shown. They are always older than the press, so the guard never fired, and the report
 * came back word for word.
 *
 * The question that actually decides it is about the **press**, not the control:
 *
 *   > Was a sheet on screen when this press began?
 *
 * If it was, the release belongs to that sheet and to nothing else. A control outside the sheet
 * refuses it whatever its age, whether it was rebuilt, hidden, shown or untouched. That is the
 * user's own sentence — *when in the modal must not click anything behind* — expressed as the one
 * condition that can enforce it.
 *
 * The generation counter is kept as well, because it catches the other half: a control genuinely
 * *created* under a finger that is already down, where no sheet was involved.
 */
import Phaser from 'phaser';

/** Bumped when the interface is torn down and rebuilt. Never reset — only ever compared. */
let generation = 0;

/** The generation current when the live press began, so a release can be judged against it. */
let pressGeneration = 0;

/** Whether a sheet was on screen when the live press began. The decisive term. */
let pressUnderSheet = false;

/** Asks the owning scene whether a sheet is up. Registered once; absent in scenes that have none. */
let sheetProbe: (() => boolean) | undefined;

/** The container a sheet's own controls live in, so they can be told apart from what is behind. */
let sheetLayer: Phaser.GameObjects.Container | undefined;

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
 * Tells this module how to see the sheet: whether one is up, and which container holds it.
 *
 * Called by the scene that owns the modal layer. A scene that never registers behaves exactly as
 * before — `pressUnderSheet` can only ever be false — so this stays additive.
 */
export function registerSheet(probe: () => boolean, layer: Phaser.GameObjects.Container): void {
  sheetProbe = probe;
  sheetLayer = layer;
}

/** Forgets the registration. Called on scene shutdown so a dead scene cannot answer for a live one. */
export function forgetSheet(): void {
  sheetProbe = undefined;
  sheetLayer = undefined;
  // Without this a session that ends while a sheet is up leaves every later release refused.
  pressUnderSheet = false;
}

/**
 * Records that a press has begun: which generation was on screen, and whether a sheet was up.
 *
 * Installed once per scene by `InkUI`. A single value rather than one per pointer id: this is a
 * one-thumb game, and a second finger arriving mid-gesture would at worst make the first one's
 * release stricter, which fails safe.
 */
export function notePressStarted(): void {
  pressGeneration = generation;
  pressUnderSheet = Boolean(sheetProbe?.());
}

/** Scenes that already have the watch, so a scene with six `InkUI`s installs one listener. */
const watched = new WeakSet<Phaser.Scene>();

/**
 * Installs the press note for a scene, once, for as long as the scene lives.
 *
 * The lifetime is the whole point and getting it wrong cost a session: the first version hung this
 * off `InkScrollArea`, which is created and destroyed with a *page*. The note was therefore
 * installed only while a scrollable sheet existed, and once the sheet went nothing reset
 * `pressUnderSheet` — it stayed true from the last press under a sheet, and every release-driven
 * control refused for the rest of the run. The bottom bar went completely dead.
 *
 * Bound to `Phaser.Scenes.Events.SHUTDOWN` rather than left to leak, and de-duplicated per scene.
 */
export function installPressWatch(scene: Phaser.Scene): void {
  if (watched.has(scene)) return;
  watched.add(scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => watched.delete(scene));
  installWindowWatch();
}

/**
 * **On the window, in the capture phase — not through Phaser's input.**
 *
 * The obvious place for this is `scene.input.on('pointerdown', ...)`, and it silently does not
 * work. Phaser dispatches a press to game objects first and only then to the scene, and a handler
 * that calls `event.stopPropagation()` — which `ActionBar`, `InkUI` and most of this game's chrome
 * do, to keep a press off the map underneath — cancels the scene-level emit entirely.
 *
 * So the note fired for presses on a *sheet* and not for presses on the *bar*. `pressUnderSheet`
 * was set true by the last press on a sheet and then never updated again, and the bottom bar
 * refused every release for the rest of the session. Measured: it opened no lane at all.
 *
 * The capture phase on `window` runs before any of that and cannot be cancelled by anything in the
 * game. It is the same reason `MapScene` listens on the canvas element rather than the display
 * list.
 */
let windowWatchInstalled = false;
function installWindowWatch(): void {
  if (windowWatchInstalled || typeof window === 'undefined') return;
  windowWatchInstalled = true;
  window.addEventListener('pointerdown', notePressStarted, true);
  // Some WebViews deliver only the mouse pair; a duplicate note is harmless — it recomputes the
  // same two values from the same state.
  window.addEventListener('mousedown', notePressStarted, true);
}

/**
 * **Switches a container's hit areas off with it, because `setVisible` does not.**
 *
 * Phaser 4: adding a child to a Container sets the child's `displayList` to `null`
 * (`Container.addHandler` -> `removeFromDisplayList`), and `GameObject.willRender` consults only
 * `displayList` — never `parentContainer`. A hidden container is therefore still hit-tested child
 * by child, exactly as if it were on screen.
 *
 * Every piece of chrome this game hides under a sheet is a Container: the action bar, the advisor
 * strip, the whisper line. All three stayed pressable underneath, and the action bar's lane buttons
 * sit directly beneath where a sheet draws its footer — which is where a sheet puts its Close.
 * Measured with a lane open: the bar reported `visible: false` and **8 of 8 hit areas still live**.
 *
 * Recurses one level, which is what the containers here are: a row container per control, each
 * holding its own hit rectangle.
 */
export function setContainerInputEnabled(
  container: Phaser.GameObjects.Container,
  enabled: boolean,
): void {
  for (const child of container.list) {
    const node = child as Phaser.GameObjects.GameObject & {
      input?: { enabled: boolean } | null;
      list?: Phaser.GameObjects.GameObject[];
    };
    if (node.input) node.input.enabled = enabled;
    for (const inner of node.list ?? []) {
      const nested = inner as Phaser.GameObjects.GameObject & { input?: { enabled: boolean } | null };
      if (nested.input) nested.input.enabled = enabled;
    }
  }
}

/** Whether the live press began while a sheet was on screen. */
export function pressBeganUnderSheet(): boolean {
  return pressUnderSheet;
}

/**
 * Stamps a control with the generation it was born in. Call where the hit area is created.
 *
 * Anything unstamped reads as generation 0 — as old as the game — so a control that has not opted
 * in still gets the sheet rule below, which is the one that matters.
 */
export function markControlBorn(target: Phaser.GameObjects.GameObject): void {
  target.setData(BORN_KEY, generation);
}

/** Whether this control is part of the sheet itself rather than something behind it. */
function belongsToSheet(target: Phaser.GameObjects.GameObject): boolean {
  if (!sheetLayer) return false;
  let node: Phaser.GameObjects.Container | null | undefined =
    (target as Phaser.GameObjects.GameObject & {
      parentContainer?: Phaser.GameObjects.Container | null;
    }).parentContainer;
  while (node) {
    if (node === sheetLayer) return true;
    node = node.parentContainer;
  }
  return false;
}

/**
 * **True when this control must ignore the release now being delivered.**
 *
 * Two reasons, and the first is the one three reports were about:
 *
 *  - the press began while a sheet was up, and this control is not part of that sheet. Whatever
 *    the release lands on now, the player was pressing something else — and everything behind a
 *    sheet is, by definition, something else;
 *  - the control did not exist when the press began, so the press cannot have been aimed at it.
 */
export function releaseNotOwnedBy(target: Phaser.GameObjects.GameObject): boolean {
  // `sheetProbe` is the liveness check: with nothing registered to answer for a sheet this rule has
  // no business refusing anything, whatever a stale flag says. Fails open, always.
  return Boolean(sheetProbe) && pressUnderSheet && !belongsToSheet(target);
}

/**
 * **Why there is no "was this control older than the press" clause here.**
 *
 * There was one, and it was wrong twice. Stamping each control with a generation at construction
 * and refusing a release from an older press sounds equivalent and is not:
 *
 *  - it misses the reported bug outright, because `ActionBar.refresh` early-returns on an unchanged
 *    key. The bar's buttons are built once and merely hidden and shown, so they are always older
 *    than the press and the clause never fired — which is why the same report came back word for
 *    word after the first attempt;
 *  - and it is only as good as its bookkeeping. When the press note was installed on the wrong
 *    object's lifetime, the comparison silently inverted and refused **every** release on the
 *    bottom bar for the rest of the session. Measured: the bar opened no lane at all.
 *
 * The sheet rule needs no per-control state, so it cannot drift out of step with one. A clause
 * whose failure mode is a dead interface does not earn its place beside it.
 */

/** @deprecated Kept for the call sites converted before the sheet rule existed. */
export const pressPredatesControl = releaseNotOwnedBy;
