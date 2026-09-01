import { autosaveSnapshot } from '../state/save';
import type { GameState } from '../state/types';

/**
 * The run stops when the player leaves, and is written down before the device can take it.
 *
 * Two separate promises, and they fail in two different ways if either is missing.
 *
 * **Stop.** A wave landing, a siege closing and a fight going against you all run on the world
 * clock, and none of them care whether anyone is watching. A message arrives, the player answers
 * it, and the province they were defending is gone — a real-life interruption turned into a
 * defeat they were never given the chance to play. The browser does most of this for free by
 * halting `requestAnimationFrame` on a hidden tab, but only *most*: a desktop window that loses
 * focus while still visible keeps its loop, so does a phone showing the game in a split view, and
 * a webview's behaviour when the app is backgrounded belongs to the host. Halting the world
 * ourselves is the only version of the promise that does not depend on any of that.
 *
 * **Write it down.** Leaving is also the last moment anyone gets: a backgrounded tab is exactly
 * what a phone reclaims memory from, and it is killed without ever running another line of the
 * game's code. The snapshot goes to its own slot (`autosaveSnapshot`) so the player's own save is
 * never overwritten by a glance at a notification, and the menu's Continue reads whichever slot
 * is newer — so a run lost to a device that ran out of memory is one button away.
 *
 * Nothing here belongs to a scene. `MapScene` installs it because it owns the live state and its
 * shutdown is where the listeners come off; ConquestScene inherits both.
 */

/**
 * Floor between two automatic writes.
 *
 * Leaving the screen raises `blur` and `visibilitychange` together, and on the way out of a page
 * `pagehide` lands on top of both. Serialising a mid-run world is not free — a wide realm is a
 * megabyte or so of JSON — so the second and third of those would spend it again for a state
 * that has not advanced a tick between them. Short enough that a genuine second departure a few
 * seconds later still writes.
 */
const AUTOSAVE_MIN_GAP_MS = 3000;

export interface AwayPauseHandle {
  /** Removes every listener. Safe to call twice. */
  dispose(): void;
  /** Test seam: what the last automatic write came to. */
  readonly saves: number;
}

/** True when the page itself is out of sight. */
function pageIsHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Halts `state` while the player is away and writes it down on the way out.
 *
 * `onChange` is called when the pause is lifted, so the screen can repaint the moment the player
 * is back rather than on whatever the next tick happens to be.
 */
export function installAwayPause(state: GameState, onChange?: () => void): AwayPauseHandle {
  let saves = 0;
  let lastSaveAt = 0;
  let disposed = false;

  const store = (): void => {
    const now = Date.now();
    if (now - lastSaveAt < AUTOSAVE_MIN_GAP_MS) return;
    lastSaveAt = now;
    if (autosaveSnapshot(state)) saves += 1;
  };

  const leave = (): void => {
    state.isAwayPause = true;
    store();
  };

  /**
   * Coming back asks one question and it is not `document.hasFocus()`.
   *
   * Leaving and returning are deliberately asymmetric. Two signals send the player away — the
   * page going out of sight, and the window losing focus — because on a desktop an alt-tab is
   * usually only the second of them. But a pause is a thing the player cannot see and cannot
   * clear, so lifting it must never depend on a signal that can be wrong in the quiet direction:
   * `hasFocus` reads false in an automated browser, in an iframe, and on any window manager that
   * hands focus somewhere else, and the run would then sit halted for ever with no tell.
   *
   * So: any focus or visible event means the player is back, unless the page is still hidden —
   * which is the one case worth guarding, a background tab regaining window focus.
   */
  const arrive = (): void => {
    if (pageIsHidden()) return;
    if (!state.isAwayPause) return;
    state.isAwayPause = false;
    onChange?.();
  };

  const onVisibility = (): void => (pageIsHidden() ? leave() : arrive());
  // The last line the page is guaranteed to run. Deliberately not `unload`, which no longer
  // fires reliably and disqualifies the page from the back/forward cache.
  const onPageHide = (): void => leave();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('blur', leave);
  window.addEventListener('focus', arrive);

  return {
    get saves() { return saves; },
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', arrive);
      // A scene handing the run over to another screen must not leave the world halted behind it.
      state.isAwayPause = false;
    },
  };
}
