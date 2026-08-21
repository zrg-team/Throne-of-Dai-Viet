/**
 * Whether the front-page tour has been run.
 *
 * A preference, not save data — it belongs to the browser rather than to a reign, which is why it
 * lives beside the language and the map theme rather than inside a snapshot. A player who clears
 * their storage gets the tour again, and that is the right behaviour: they have also lost their
 * Legacy, their Codex and their saved run, so they are a first-time player in every way that
 * matters.
 *
 * The `mandate:` prefix is the game's old name and is kept deliberately. Renaming a storage key
 * orphans everything already under it, and the price of consistency here would be every existing
 * player's settings.
 */
const TOUR_KEY = 'mandate:tour:v1';
/**
 * The in-run tour's own flag, and it is deliberately not the same one.
 *
 * They teach different things at different moments: the front page's says what the doors on that
 * page are, and this one says what the band, the advisor and the bar are once a run is actually
 * running. A player may skip one and want the other, and a first run reached by resuming a saved
 * game never passed the front page at all — a shared flag would silently swallow the tour that
 * player most needed.
 */
const RUN_TOUR_KEY = 'mandate:tour:run:v1';

/** Whether the automation or the URL has already answered the question for every tour here. */
function forced(): 'on' | 'off' | undefined {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('tour') === '1') {
    return 'on';
  }
  /**
   * A driven browser never gets a tour.
   *
   * This is not a convenience — it is the difference between adding a feature and breaking a
   * hundred and eight harness scripts. Every one of them opens a fresh Playwright context with
   * empty storage, which is precisely the state that says "first-time player", and a full-screen
   * blocker over the front page or over a live run would break every script that reaches the game
   * by pressing a button. The alternative was a flag threaded through every one of those files,
   * where it would be forgotten by the next script anybody wrote.
   *
   * `navigator.webdriver` is the signal because it is the one the automation sets about *itself*:
   * true under Playwright, Puppeteer and Selenium, absent in every hand-driven browser. Nothing
   * here sniffs a user agent or guesses.
   */
  if (typeof navigator !== 'undefined' && navigator.webdriver) return 'off';
  // No storage means no memory, and a tour that cannot be remembered as seen would open on every
  // single load. Better to never show it than to show it forever.
  if (typeof localStorage === 'undefined') return 'off';
  return undefined;
}

export function hasSeenTour(): boolean {
  const override = forced();
  if (override) return override === 'off';
  return localStorage.getItem(TOUR_KEY) === 'seen';
}

/** The same question for the in-run tour, against its own flag. */
export function hasSeenRunTour(): boolean {
  const override = forced();
  if (override) return override === 'off';
  return localStorage.getItem(RUN_TOUR_KEY) === 'seen';
}

export function markRunTourSeen(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(RUN_TOUR_KEY, 'seen');
}

/**
 * Called when the tour ends — finished *or* skipped.
 *
 * Skipping counts. A player who dismissed it has answered the question the tour was asking, and
 * showing it again next time is the interface refusing to take no for an answer.
 */
export function markTourSeen(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(TOUR_KEY, 'seen');
}

/** Forgets both, so each tour runs again where it belongs. Behind the How to Play page's button. */
export function forgetTour(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.removeItem(TOUR_KEY);
  localStorage.removeItem(RUN_TOUR_KEY);
}
