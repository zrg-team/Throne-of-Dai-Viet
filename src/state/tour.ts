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

export function hasSeenTour(): boolean {
  // `?tour=1` forces it, whatever the browser or the storage says. The only way to photograph the
  // thing, and the only way to look at it twice while working on it.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('tour') === '1') {
    return false;
  }
  /**
   * A driven browser never gets the tour.
   *
   * This is not a convenience — it is the difference between adding a feature and breaking a
   * hundred and eight harness scripts. Every one of them opens a fresh Playwright context with
   * empty storage, which is precisely the state that says "first-time player", and a full-screen
   * blocker over the front page would break every script that reaches the game by pressing a
   * button on it. The alternative was a flag threaded through every one of those files, where it
   * would be forgotten by the next script anybody wrote.
   *
   * `navigator.webdriver` is the signal because it is the one the automation sets about *itself*:
   * true under Playwright, Puppeteer and Selenium, absent in every hand-driven browser. Nothing
   * here sniffs a user agent or guesses.
   */
  if (typeof navigator !== 'undefined' && navigator.webdriver) {
    return true;
  }
  if (typeof localStorage === 'undefined') {
    // No storage means no memory, and a tour that cannot be remembered as seen would open on every
    // single load. Better to never show it than to show it forever.
    return true;
  }
  return localStorage.getItem(TOUR_KEY) === 'seen';
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

/** Forgets it, so the tour runs again. Behind the button on the How to Play page. */
export function forgetTour(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.removeItem(TOUR_KEY);
}
