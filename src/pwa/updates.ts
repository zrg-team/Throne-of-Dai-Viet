/**
 * The service worker, from the page's side of the glass.
 *
 * This is the only module in the game that touches `navigator.serviceWorker`. It registers the
 * worker `scripts/build-sw.mjs` emits, and turns the lifecycle — which is five states, three
 * events and a race — into one value the menu can render and one function it can call.
 *
 * The worker deliberately does not activate itself (see `scripts/sw-template.js`), so a downloaded
 * update sits in `waiting` until the player taps Reload. That is the whole reason this file has a
 * status rather than just a `register()`: somebody has to be told there is something to tap.
 */

import { getLanguage } from '../i18n';

export type UpdateStatus =
  /** Dev build, or a browser without service workers. Nothing to show. */
  | 'unsupported'
  /** The first copy is downloading. The game works, but is not yet offline-proof. */
  | 'caching'
  /** Cached and controlled. This is the resting state. */
  | 'offlineReady'
  /** A NEW version is downloading behind the running one. */
  | 'installing'
  /** A new version is cached and waiting for the tap. */
  | 'ready';

/** The version to bump — `package.json`, and nothing else. */
export const BUILD_VERSION = __APP_VERSION__;
/** Commits on HEAD at build time, or empty where git could not be reached. */
export const BUILD_NUMBER = __BUILD_NUMBER__;

/**
 * The build's date, written the way the player's language writes dates.
 *
 * Formatted here rather than baked into the bundle, because `2026-08-21` is not a date to a reader
 * of either language — and the two write it differently enough that one string cannot serve both.
 * Falls back to the ISO form on a browser without the locale data rather than showing nothing.
 */
export function buildDateLabel(): string {
  if (!__BUILD_DATE__) {
    return '';
  }
  try {
    return new Date(`${__BUILD_DATE__}T00:00:00`).toLocaleDateString(
      getLanguage() === 'vi' ? 'vi-VN' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' },
    );
  } catch {
    return __BUILD_DATE__;
  }
}

const listeners = new Set<(status: UpdateStatus) => void>();
let status: UpdateStatus = 'unsupported';
let registration: ServiceWorkerRegistration | undefined;
/** Set the moment we ask a waiting worker to take over, so `controllerchange` reloads exactly once. */
let applying = false;

/** How often a tab that stays open goes looking for a new deploy. */
const POLL_MS = 30 * 60 * 1000;
/**
 * Floor on how often a check may actually go out. `visibilitychange` fires every time the player
 * switches app, and each check is a real request for a worker that names three hundred URLs —
 * on a phone that is somebody's data being spent to ask a question already answered a minute ago.
 */
const MIN_CHECK_GAP_MS = 5 * 60 * 1000;
let lastCheck = 0;

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export function subscribeUpdateStatus(listener: (status: UpdateStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setStatus(next: UpdateStatus): void {
  if (next === status) {
    return;
  }
  status = next;
  for (const listener of listeners) {
    listener(status);
  }
}

export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // A worker left over from a preview build, still holding the dev origin's port, serves last
  // week's bundle to a dev server that is right there recompiling — and every symptom of that
  // looks like a bug in the code you just wrote. Dev unregisters rather than skipping.
  if (!import.meta.env.PROD) {
    void navigator.serviceWorker.getRegistrations().then((existing) => {
      for (const worker of existing) {
        void worker.unregister();
      }
    });
    return;
  }

  // `updateViaCache: 'none'` is not optional. GitHub Pages serves with `max-age=600`, and the
  // browser is otherwise allowed to satisfy its own check for a new worker out of the HTTP cache —
  // which means asking the cached copy whether the cached copy has changed.
  const url = `${import.meta.env.BASE_URL}sw.js`;
  void navigator.serviceWorker
    .register(url, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
    .then(observe)
    .catch(() => {
      // A failed registration is not worth a console error on a player's phone: the game runs
      // exactly as it did before service workers, just without the offline copy.
      setStatus('unsupported');
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!applying) {
      return;
    }
    window.location.reload();
  });
}

function observe(reg: ServiceWorkerRegistration): void {
  registration = reg;
  refresh();

  // A worker can already be waiting when the page opens — the update was downloaded during the
  // last visit and never applied. `updatefound` will not fire again for it.
  reg.addEventListener('updatefound', () => {
    const incoming = reg.installing;
    if (!incoming) {
      return;
    }
    refresh();
    incoming.addEventListener('statechange', refresh);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate();
    }
  });
  window.setInterval(checkForUpdate, POLL_MS);
}

function refresh(): void {
  if (!registration) {
    return;
  }
  if (registration.waiting && navigator.serviceWorker.controller) {
    setStatus('ready');
    return;
  }
  if (registration.installing) {
    // A first install is not an update. Without the controller check the very first visit reads
    // "new version installing", which is a lie about a game the player has never run before.
    setStatus(navigator.serviceWorker.controller ? 'installing' : 'caching');
    return;
  }
  setStatus(navigator.serviceWorker.controller ? 'offlineReady' : 'caching');
}

export function checkForUpdate(force = false): void {
  if (!registration || applying) {
    return;
  }
  // Offline, `update()` rejects and — in some browsers — takes the registration down with it.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  const now = Date.now();
  if (!force && now - lastCheck < MIN_CHECK_GAP_MS) {
    return;
  }
  lastCheck = now;
  void registration.update().then(refresh).catch(() => undefined);
}

/**
 * Take the update. Tells the waiting worker to stop waiting; the `controllerchange` above reloads
 * the page once it has.
 */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting || applying) {
    return;
  }
  applying = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // Belt and braces: if `controllerchange` never arrives — a worker that errored on activate, a
  // browser that does not fire it for a claimed client — reload anyway rather than leaving the
  // player looking at a button that did nothing.
  window.setTimeout(() => window.location.reload(), 3000);
}
