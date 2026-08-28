/**
 * Opens the stage, and keeps it open.
 *
 * Two things go wrong between a dev server and a ten-minute render, and neither of them announces
 * itself:
 *
 *  1. **The dep optimizer re-runs.** Vite re-bundles whenever it notices a change it thinks affects
 *     the module graph — a new tsconfig, a deleted file — and a page that loaded a moment earlier
 *     holds a URL for a pre-bundle that no longer exists. What you get is
 *     `504 (Outdated Optimize Dep)` on one request, a blank canvas, and nothing that names the
 *     cause. It clears on a reload, every time, so `openStage` reloads through it.
 *
 *  2. **HMR reloads the page mid-render.** Anything Vite watches will do it — someone saves a file,
 *     `package.json` changes, another build writes into `dist-shell/`. The frame loop then dies on
 *     `Execution context was destroyed`, four hundred frames in. `armAgainstReload` is the fix and
 *     it is two lines: drop the HMR websocket so no reload message ever arrives, and neuter
 *     `location.reload` in case one does.
 *
 * The film never needs HMR — every frame is a pure function of `t` and the driver asks for each one
 * explicitly — so throwing the live-reload channel away costs nothing at all.
 */

/**
 * Cuts the page off from Vite's live-reload channel. Call once, before the first `goto`.
 *
 * `routeWebSocket` intercepts the client's HMR socket and never connects it upstream, so the
 * console gets one "connecting…" and nothing after. The `Location.prototype.reload` override is
 * there for the paths that do not go through the socket at all.
 */
export async function armAgainstReload(page) {
  await page.routeWebSocket('**', (ws) => ws.close());
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Location.prototype, 'reload', { value: () => {}, configurable: true });
    } catch {
      /* Some browsers refuse; the socket block is the load-bearing half. */
    }
  });
}

export async function openStage(page, origin, width, height, timeout = 30000) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${origin}/scripts/promo/stage.html?w=${width}&h=${height}`, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
      await page.waitForFunction(() => window.__promo?.ready === true, null, { timeout });
      return true;
    } catch {
      if (attempt === 2) {
        return false;
      }
      process.stdout.write('  stage did not boot - reloading (vite dep re-optimize?)\n');
    }
  }
  return false;
}
