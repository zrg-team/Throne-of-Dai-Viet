/**
 * "Put this on my home screen", from the page's side of the glass.
 *
 * Sibling to `updates.ts`: that one owns the service worker, this one owns installation. They are
 * kept apart because they answer to different browsers — the worker is near-universal, while the
 * install *prompt* exists on exactly one engine family and every other platform has to be told
 * what to press instead.
 *
 * The contract for callers is two functions: `installRoute()` says what this browser can actually
 * do, and `promptInstall()` does it where a native prompt exists. Nothing here draws anything; the
 * guide's words live in the catalog and its sheet is drawn by `MenuScene`.
 */

import { isShell } from '../platform/shell';

/**
 * What pressing the install icon should do on this browser.
 *
 * - `native` — Chromium fired `beforeinstallprompt` and we are holding it. One tap installs.
 * - `installed` — already running from the home screen (or the app was installed this session).
 * - `ios-safari` — Safari on iOS/iPadOS. Share → Add to Home Screen, and there is no API for it.
 * - `ios-other` — Chrome/Firefox/Edge on iOS. All of them are Safari underneath and all of them
 *   have the same Share-sheet item, so the steps differ only in where the Share button sits.
 * - `android-other` — Firefox/Samsung/Opera on Android: a menu item, no prompt event.
 * - `desktop` — everything else. Safari has Add to Dock, Firefox has nothing; both are told to
 *   use the browser's own menu rather than promised a button that will not appear.
 */
export type InstallRoute =
  | 'native'
  | 'installed'
  | 'ios-safari'
  | 'ios-other'
  | 'android-other'
  | 'desktop';

/**
 * The `beforeinstallprompt` event, which TypeScript's DOM lib does not carry because it is not in
 * any standard. Declared minimally rather than augmenting `WindowEventMap` globally: one module
 * needs it and a global augmentation would advertise it to twenty that do not.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferred: BeforeInstallPromptEvent | undefined;
let installedThisSession = false;
const listeners = new Set<() => void>();

/**
 * Remembered across visits, because installing happens *once* and the offer must not come back.
 *
 * A browser tab has no reliable way to ask "is my own app already on this phone's home screen" —
 * `getInstalledRelatedApps` needs a `related_applications` manifest entry and only Chromium has it
 * at all — so what is recorded here is the one moment the page can observe for certain: the
 * `appinstalled` event, and having been opened standalone at least once in this browser.
 */
const INSTALLED_KEY = 'mandate:installed:v1';

function rememberInstalled(): void {
  try {
    localStorage.setItem(INSTALLED_KEY, '1');
  } catch {
    // Private mode, or storage disabled. The session flag still holds for this visit.
  }
}

function wasInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
}

function announce(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Fires whenever the answer to `installRoute()` may have changed. */
export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Running from the home screen / app list rather than in a browser tab.
 *
 * Four probes because no single one covers the field: `display-mode` is the standard and matches
 * whichever display the manifest asked for, `navigator.standalone` is iOS's own flag and the only
 * one Safari sets, and a TWA arrives with an `android-app://` referrer and no display-mode at all.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const media = (query: string) => Boolean(window.matchMedia?.(query).matches);
  return (
    media('(display-mode: standalone)')
    || media('(display-mode: fullscreen)')
    || media('(display-mode: minimal-ui)')
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
    || document.referrer.startsWith('android-app://')
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  // iPadOS 13+ reports itself as a Macintosh and is only told apart by having a touchscreen —
  // and it is the platform where this matters most, because a tablet is where somebody actually
  // wants the icon.
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
}

/**
 * Safari, and not one of the browsers wearing it.
 *
 * Every iOS browser is WebKit, so the engine sniff says nothing; the *brand* is what decides
 * where the Share button is drawn, which is the only thing the guide has to get right.
 */
function isIOSSafari(): boolean {
  return isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Firefox|DuckDuckGo|YaBrowser/.test(navigator.userAgent);
}

/**
 * Which set of written steps fits this browser, *ignoring* whether a prompt is held.
 *
 * Separate from `installRoute` because the guide is also the fallback for the one platform that
 * has a button: a held `beforeinstallprompt` can still fail — the event is single-use and expires
 * — and when it does, a Chromium user must be told where their own menu keeps the same command
 * rather than shown a sheet about Safari.
 */
export function guideRoute(): Exclude<InstallRoute, 'native' | 'installed'> {
  if (isIOS()) {
    return isIOSSafari() ? 'ios-safari' : 'ios-other';
  }
  if (isAndroid()) {
    return 'android-other';
  }
  return 'desktop';
}

export function installRoute(): InstallRoute {
  if (installedThisSession || isStandalone() || wasInstalled()) {
    return 'installed';
  }
  if (deferred) {
    return 'native';
  }
  return guideRoute();
}

/**
 * Whether this browser is one that *would* hand over a prompt.
 *
 * Chromium declares the handler on `window` whether or not it ever fires. That makes the absence
 * of a prompt meaningful on exactly those browsers: no event means either the site is already
 * installed or Chromium has judged it not installable, and in both cases there is nothing to
 * offer. Everywhere else the absence means nothing at all, because the event does not exist.
 */
function promptCapable(): boolean {
  return typeof window !== 'undefined' && 'onbeforeinstallprompt' in window;
}

/**
 * Whether the mark should be offered at all.
 *
 * Three ways to be told no:
 *  - a native shell, which *is* the app;
 *  - installed, now or in a previous visit;
 *  - a Chromium that has not offered a prompt. This is the one that matters in practice: an
 *    Android or desktop Chrome with the game already on its home screen never fires
 *    `beforeinstallprompt` again, so the corner mark used to sit there offering to install
 *    something the player had already installed. On that engine, holding the prompt *is* the
 *    installability test, and the mark appears the moment the event lands (`subscribeInstall`).
 */
export function canOfferInstall(): boolean {
  if (isShell() || installRoute() === 'installed') {
    return false;
  }
  return promptCapable() ? deferred !== undefined : true;
}

/**
 * Fires the browser's own install prompt.
 *
 * Returns `'unavailable'` rather than throwing when there is nothing to fire, so the caller can
 * fall through to the written guide with one branch. The held event is dropped either way: a
 * `beforeinstallprompt` may be shown once, and a stale one rejects on the second call.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) {
    return 'unavailable';
  }
  deferred = undefined;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') {
      installedThisSession = true;
      rememberInstalled();
    }
    announce();
    return outcome;
  } catch {
    announce();
    return 'unavailable';
  }
}

/**
 * Starts listening. Call once, as early in the boot as possible.
 *
 * `beforeinstallprompt` is fired at the page, not queued for it: a listener attached after Chromium
 * has decided the site is installable never hears about it, and the icon then offers the written
 * guide on the one platform that has a real button. Hence the call site in `main.ts`, above
 * `new Phaser.Game`.
 */
export function watchInstall(): void {
  if (typeof window === 'undefined' || isShell()) {
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    // Chromium shows its own mini-infobar unless this is prevented, which would put a second,
    // unstyled install affordance on a page that already has one.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    announce();
  });

  window.addEventListener('appinstalled', () => {
    deferred = undefined;
    installedThisSession = true;
    rememberInstalled();
    announce();
  });

  // Opened from the home screen: the answer to "is it installed" is yes, and it is worth writing
  // down. It does not help iOS — a standalone iOS app keeps its own storage, separate from the
  // Safari tab that would be doing the offering — but on Android and desktop the installed app and
  // the tab share an origin, so one launch from the app teaches the tab to stop asking.
  if (isStandalone()) {
    rememberInstalled();
  }
}
