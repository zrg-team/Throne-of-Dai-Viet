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

/**
 * Forgets the registration. Called on scene shutdown so a dead scene cannot answer for a live one.
 *
 * With a `layer`, only if that layer is the one registered: two scenes now register (the front
 * page and the run's HUD), and a shutdown that arrives after the next scene has already registered
 * must not wipe the live one.
 */
export function forgetSheet(layer?: Phaser.GameObjects.Container): void {
  if (layer && sheetLayer !== layer) return;
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
  /**
   * One press, however many events the platform delivers for it.
   *
   * A browser sends `pointerdown` and then `mousedown` for the same finger, and a WebView can send
   * both twice. Phaser handles the first one synchronously — a Close button fires, the sheet is torn
   * down — so by the time the duplicate arrives there is no sheet, and re-answering the question
   * here flipped `pressUnderSheet` back to false for the release that follows. The map's DOM tap
   * path then read "no sheet" and selected the province under Back. The answer is taken once, at
   * the first event of the press, and held until the press ends.
   */
  if (pressActive) return;
  pressActive = true;
  pressGeneration = generation;
  pressUnderSheet = Boolean(sheetProbe?.());
}

/** Whether a press is in flight, by the window's own account. Cleared on the first release event. */
let pressActive = false;
function notePressEnded(): void {
  pressActive = false;
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
  // Some WebViews deliver only the mouse pair. The note latches on the first of whichever arrives.
  window.addEventListener('mousedown', notePressStarted, true);
  // The press ends on the first release event; a duplicate release simply finds it already over.
  // In the bubble phase, so every capture-phase reader of `pressBeganUnderSheet` on the same
  // release — the map's DOM tap path among them — still sees the press it belonged to.
  window.addEventListener('pointerup', notePressEnded, false);
  window.addEventListener('mouseup', notePressEnded, false);
  window.addEventListener('pointercancel', notePressEnded, false);
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

/** Every live scene's input plugin. `scene.input` and `sys.input` are the same object. */
function activePlugins(scene: Phaser.Scene): Phaser.Input.InputPlugin[] {
  return scene.input.manager.game.scene.getScenes(true)
    .map((live) => live.input)
    .filter((plugin): plugin is Phaser.Input.InputPlugin => Boolean(plugin));
}

/**
 * **Nothing built this frame may be pressed this frame.**
 *
 * The other half of the render-order race, and the half a press-in-flight swallow cannot reach.
 * `InputPlugin.sortGameObjects` ranks hits by the camera's render list from the *last* render, so
 * an object created since then sorts to the bottom — a sheet that has just been opened loses a
 * release delivered in the same task to whatever was rendered beneath it. The realistic shape is a
 * WebView's duplicated `mouseup` arriving on the heels of the `pointerup` that opened the sheet;
 * reproduced on the front page's dynasty tablet.
 *
 * So the interface goes quiet until the frame after next, by which time everything it built has
 * been rendered once and sorts where it is drawn. Two frames is the same margin `swallowRestOfPress`
 * uses and for the same reason; no human can tap inside it.
 */
export function quietUntilNextFrame(scene: Phaser.Scene): void {
  const silenced = activePlugins(scene).filter((plugin) => plugin.enabled);
  if (silenced.length === 0) return;
  for (const plugin of silenced) plugin.enabled = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const plugin of silenced) {
      if (plugin.scene?.sys?.isActive?.()) plugin.enabled = true;
    }
  }));
}

/**
 * **Puts freshly built sheet furniture at the top of the input order before it has been drawn.**
 *
 * The camera's render list is what `sortGameObjects` ranks by, and it is rebuilt from scratch every
 * render — so appending here is harmless (the next render starts over) and decisive (until then,
 * these sort above everything drawn last frame instead of below it). A sheet is on top from the
 * moment it exists, not from its first frame.
 */
export function liftForInput(scene: Phaser.Scene, objects: Iterable<Phaser.GameObjects.GameObject>): void {
  const camera = scene.cameras?.main as (Phaser.Cameras.Scene2D.Camera & {
    addToRenderList?: (child: Phaser.GameObjects.GameObject) => void;
  }) | undefined;
  if (!camera?.addToRenderList) return;
  for (const object of objects) {
    camera.addToRenderList(object);
    const nested = (object as Phaser.GameObjects.GameObject & { list?: Phaser.GameObjects.GameObject[] }).list;
    if (nested) for (const child of nested) camera.addToRenderList(child);
  }
}

/**
 * **Swallows the rest of a press whose front half tore the interface down.**
 *
 * The complete form of the fix, and the reason it is here rather than in each control: a sheet
 * closes on `pointerdown` (`InkUI.button` acts on the press, deliberately), and the `pointerup`
 * that follows is delivered by Phaser to whatever the close has just revealed. Every per-control
 * guard has to be added one control at a time, and the report came back three times because the
 * bottom bar was not one of the ones converted.
 *
 * Turning the scene's input off for the remainder of the gesture needs no cooperation from
 * anything. Nothing behind can act, and nothing in the sheet needs to — it is already gone. The
 * release is consumed by a one-shot listener on the window, not through Phaser, precisely because
 * Phaser's input is what has been switched off.
 *
 * Belt and braces: `pointercancel` releases it too, and a timer releases it if no release ever
 * arrives. A stuck input plugin would be a far worse bug than the one being fixed.
 */
export function swallowRestOfPress(scene: Phaser.Scene): void {
  const manager = scene.input.manager;
  const anyDown = manager.pointers.some((pointer) => pointer.isDown);
  if (!anyDown) return;

  /**
   * **Every scene, not the one that asked.**
   *
   * This switched off `scene.input.enabled` — one scene's plugin — and that is the whole of the
   * pause-sheet report. `InputManager.updateInputPlugins` walks every scene, top first, and only
   * stops when a scene *captures* the event. A scene whose plugin is disabled captures nothing, so
   * the release was simply carried on to the world scene underneath, whose scene-level
   * `pointerup` (`enableMapDrag`) looked up, found the sheet already closed by the press, and
   * selected the province under Back. Reported as *click on a modal also clicks the bottom
   * clickable item covered by the modal*.
   *
   * **And not the manager either.** `InputManager.enabled` was the obvious single switch, and it
   * is wrong: `MouseManager` and `TouchManager` check it *before* forwarding the DOM event, so
   * the release itself was dropped, `pointer.isDown` never cleared, and every overlay opened
   * afterwards found a phantom press and went deaf for the length of the fallback timer.
   * Measured: the pause sheet's Back stopped answering at all. Each plugin is silenced instead,
   * and the manager keeps its pointers honest.
   */
  const silenced = activePlugins(scene).filter((plugin) => plugin.enabled);
  if (silenced.length === 0) return;
  for (const plugin of silenced) plugin.enabled = false;
  let done = false;

  /**
   * Re-enables input **two animation frames after** the release, never on the event itself.
   *
   * This is the whole correctness of the swallow and the first version got it wrong. Phaser does
   * not act on DOM input as it arrives: `InputManager` queues the event and drains the queue during
   * the game step. A listener that flips `input.enabled` back to true when the `pointerup` fires —
   * in the capture phase, which is *earlier still* — therefore restores input **before** Phaser has
   * processed that very release, and the release is delivered exactly as if nothing had been
   * swallowed. Measured: pressing a confirm button seated a minister and the release went on to
   * open the next seat's picker and pick from it.
   *
   * Two frames rather than one because the queue is drained inside the step, and a release arriving
   * mid-step is held to the next one. Two is past both.
   */
  const enableSoon = (): void => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // Exactly the plugins this call silenced, and only those still attached to a live scene: a
      // press that ends a run must not leave the front page deaf, nor wake a plugin somebody
      // else turned off on purpose.
      for (const plugin of silenced) {
        if (plugin.scene?.sys?.isActive?.()) plugin.enabled = true;
      }
    }));
  };
  const release = (): void => {
    if (done) return;
    done = true;
    window.removeEventListener('pointerup', release, true);
    window.removeEventListener('pointercancel', release, true);
    window.removeEventListener('mouseup', release, true);
    enableSoon();
  };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('mouseup', release, true);
  // Never longer than a gesture. If the release is lost — a WebView backgrounding mid-press, a
  // pointer captured elsewhere — the interface must come back on its own. On the window clock as
  // well as the scene's: a scene stopped by the very press being swallowed takes its clock with it.
  scene.time.delayedCall(1200, release);
  window.setTimeout(release, 1400);
}

