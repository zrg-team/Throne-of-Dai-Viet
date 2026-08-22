/**
 * Does the game actually play with the network off, and does it actually offer the new version?
 *
 * This is the one harness that cannot run against the dev server: service workers are a production
 * concern (`registerServiceWorker` unregisters in dev on purpose), and there is no `sw.js` until
 * `scripts/build-sw.mjs` has walked a finished build. So it drives `vite preview`, which serves
 * `dist/` at the same `/ten-thousand-victories/` sub-path GitHub Pages does.
 *
 *   yarn build                                  # emits dist/sw.js
 *   npx vite preview --port 4173                # in another shell
 *   node test_scripts/verify/verify-pwa.mjs
 *
 * The update half is a real round trip, not a mock: it rewrites the VERSION constant inside the
 * built `dist/sw.js` on disk — exactly what a redeploy looks like from the browser's side — then
 * asks the live registration to check. A mocked `waiting` worker would prove nothing about the
 * three-way race between `updatefound`, `statechange` and `controllerchange`, which is the only
 * part of this that is hard.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173/ten-thousand-victories/';
const SW_PATH = process.env.SW_PATH ?? 'dist/sw.js';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

// ── 1. The worker on disk covers what the game actually loads ────────────────────────────────
let worker = '';
try {
  worker = readFileSync(SW_PATH, 'utf8');
} catch {
  console.error(`no ${SW_PATH} — run \`yarn build\` first.`);
  process.exit(1);
}
const original = worker;
const precached = worker.match(/"[^"]*"/g)?.map((entry) => JSON.parse(entry)) ?? [];
const has = (pattern) => precached.filter((url) => pattern.test(url)).length;

check('the shell is precached', has(/index\.html$/) === 1 && has(/\/$/) >= 1);
check('the bundle is precached', has(/assets\/.*\.js$/) === 1, `${has(/assets\//)} asset files`);
check('every font is precached', has(/fonts\/.*\.woff2$/) === 15, `${has(/fonts\/.*\.woff2$/)} of 15`);
check('every portrait part is precached', has(/faces\/.*\.svg$/) === 267, `${has(/faces\/.*\.svg$/)} of 267`);
check('the manifest is precached', has(/manifest\.webmanifest$/) === 1);
check('the worker does not cache itself', has(/sw\.js$/) === 0);

// A shipped worker that calls skipWaiting on install applies updates behind the player's back —
// the exact behaviour the Reload button exists instead of.
check(
  'the worker waits rather than taking over',
  !/install[\s\S]{0,400}skipWaiting/.test(worker),
  'skipWaiting must only run on the SKIP_WAITING message',
);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 160)}`); });
// The console only ever says "ERR_FAILED"; the URL is the whole diagnosis when something the
// precache missed is what broke the offline run.
const failedRequests = [];
page.on('requestfailed', (request) => failedRequests.push(`${request.url()} (${request.failure()?.errorText})`));

const bootedToMenu = () => page.waitForFunction(
  () => window.__phaserGame?.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);

try {
  // ── 2. It registers, installs and claims the page ──────────────────────────────────────────
  await page.goto(`${BASE}?capture=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  let booted = true;
  try {
    await bootedToMenu();
  } catch {
    booted = false;
  }
  check('the built game boots from the preview server', booted, booted ? '' : `${page.url()} — ${errors.slice(0, 2).join(' | ')}`);
  if (!booted) {
    throw new Error(`did not reach MenuScene at ${BASE} — is \`npx vite preview\` running?`);
  }

  let controlled = true;
  try {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
  } catch {
    controlled = false;
  }
  check('the worker registers and claims the page', controlled);

  // The install downloads 4.4 MB across 300 requests; `ready` resolves on activation, not on the
  // last `cache.put`, so wait for the cache to actually hold the art before pulling the plug.
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((name) => name.startsWith('vanthang-')));
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const keys = await cache.keys();
      if (keys.length >= 300) return keys.length;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return (await cache.keys()).length;
  });
  check('the whole build lands in one versioned cache', cached >= 300, `${cached} entries`);

  // ── 3. It plays with the network off ───────────────────────────────────────────────────────
  errors.length = 0;
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  let offlineBooted = true;
  try {
    await bootedToMenu();
  } catch {
    offlineBooted = false;
  }
  check('the game boots with the network off', offlineBooted);

  await page.waitForTimeout(1200);
  const drew = await page.evaluate(() => (window.__phaserGame?.scene.getScene('MenuScene')?.children.list.length ?? 0) > 5);
  check('the offline frame is not blank', drew);

  // A run has to start offline too — the portraits and icons it pulls in are loaded by the Phaser
  // loader at runtime, which is the half a shell-only precache would silently break.
  let ranOffline = true;
  try {
    await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  } catch {
    ranOffline = false;
  }
  await page.waitForTimeout(1500);
  check('a run starts with the network off', ranOffline);
  check(
    'nothing the game needs is missing from the cache',
    failedRequests.length === 0,
    failedRequests.slice(0, 3).map((entry) => entry.replace(BASE, '')).join(' | '),
  );
  check('no console errors while offline', errors.length === 0, errors.slice(0, 2).join(' | '));

  await context.setOffline(false);

  // ── 4. A real new version is noticed, and waits ────────────────────────────────────────────
  await page.goto(`${BASE}?capture=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await bootedToMenu();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });

  const bumped = original.replace(/const VERSION = "[0-9a-f]+";/, 'const VERSION = "deadbeefcafe";');
  if (bumped === original) {
    check('the harness can stamp a new version into sw.js', false, 'VERSION constant not found');
  } else {
    writeFileSync(SW_PATH, bumped);
    const outcome = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (registration.waiting) return 'waiting';
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return registration.installing ? 'stuck-installing' : 'nothing';
    });
    check('a new deploy installs and then waits', outcome === 'waiting', outcome);
    check('the old version is still the one running', await page.evaluate(
      () => Boolean(navigator.serviceWorker.controller),
    ));

    // ── 5. The menu says so, and the button applies it ───────────────────────────────────────
    await page.waitForTimeout(600);
    // Every string on the page, containers included — `InkUI.button` puts its label inside one, so
    // a flat pass over `children.list` sees the captions and misses every button in the game.
    const readAllText = (target = page) => target.evaluate(() => {
      const found = [];
      const walk = (list) => {
        for (const child of list) {
          if (child.type === 'Text' && child.text?.trim()) found.push(child.text);
          if (Array.isArray(child.list)) walk(child.list);
        }
      };
      walk(window.__phaserGame.scene.getScene('MenuScene').children.list);
      return found;
    });

    const front = await readAllText();
    check(
      'the front page raises the notice',
      front.some((text) => /New version ready/i.test(text)),
      front.filter((text) => /version/i.test(text)).join(' / '),
    );

    await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      scene.mode = 'settings';
      scene.render();
    });
    const settings = await readAllText();
    check(
      'settings prints the package version, build number and date',
      settings.some((text) => /^Version \d+\.\d+\.\d+ {2}· {2}build \d+ {2}· {2}\d+ \w+ \d{4}$/.test(text)),
      settings.find((text) => /^Version/.test(text)) ?? 'no version line',
    );
    check('settings offers Reload', settings.some((text) => /Reload to update/i.test(text)));

    // Nothing on the settings plate may fall off the bottom of the sheet.
    const overflow = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      let lowest = 0;
      for (const child of scene.children.list) {
        if (child.depth < 0 || typeof child.getBounds !== 'function') continue;
        const bounds = child.getBounds();
        if (bounds.height > 0 && bounds.height < 400) lowest = Math.max(lowest, bounds.bottom);
      }
      // Design units, not buffer pixels: `applyRenderScale` zooms the camera by RENDER_SCALE, so
      // the canvas is twice the sheet and comparing against it passes anything.
      const height = scene.scale.gameSize.height / (scene.cameras.main.zoom || 1);
      return { lowest: Math.round(lowest), height: Math.round(height) };
    });
    check(
      'the settings plate fits the sheet',
      overflow.lowest <= overflow.height,
      `lowest ${overflow.lowest} of ${overflow.height}`,
    );

    // ── The other client ─────────────────────────────────────────────────────────────────────
    //
    // An installed app and a browser tab share one registration, and whichever one taps Reload
    // claims the other on its way past. The client that did NOT tap is the interesting one — and
    // only if it opened AFTER the update had already landed. `updatefound` does not fire for a
    // worker that is already waiting (see `observe` in src/pwa/updates.ts), so such a page never
    // attaches a `statechange` listener to it, and `controllerchange` is the only word it ever
    // gets. Without that word it goes on printing "New version ready" over a button whose waiting
    // worker is gone — and `applyUpdate` reads `registration.waiting`, finds nothing, and
    // returns. A button that visibly does nothing at all.
    //
    // Assert the notice first, or this proves only that a page with no notice has no notice.
    const second = await context.newPage();
    await second.goto(`${BASE}?capture=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await second.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await second.waitForTimeout(1000);
    const secondBefore = await readAllText(second);
    check(
      'a client opened while an update waits raises the notice too',
      secondBefore.some((text) => /New version ready/i.test(text)),
      secondBefore.filter((text) => /version/i.test(text)).join(' / ') || 'nothing saying "version"',
    );

    const applied = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (!registration.waiting) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    });
    check('the waiting worker takes over when asked', applied);

    // …and the client that tapped nothing has to notice that it happened.
    await second.waitForTimeout(1500);
    const secondAfter = await readAllText(second);
    check(
      'the client that did not tap retracts its stale notice',
      !secondAfter.some((text) => /New version ready/i.test(text)),
      secondAfter.filter((text) => /version/i.test(text)).join(' / ') || 'nothing left saying "version"',
    );
    await second.close();

    // ── 6. And it still fits on the smallest sheet, in the longer language ────────────────────
    //
    // 620 is MIN_DESIGN_HEIGHT, where `vScale` bottoms out at its 0.62 clamp and the settings
    // plate has the least room it will ever have — and the update block is the only thing on that
    // plate that appears conditionally, so it is the only thing that can push it off the bottom
    // on a sheet where it fit yesterday. Vietnamese, because every one of these lines is longer
    // in it. `GAME_HEIGHT` is read once at import, so this needs its own context, not a resize.
    for (const [height, language] of [[620, 'vi'], [620, 'en']]) {
      // A fresh profile has to install the OLD worker first, or there is nothing for a new one to
      // wait behind: a first install activates immediately and the page reads `offlineReady`.
      writeFileSync(SW_PATH, original);
      const shortContext = await browser.newContext({ viewport: { width: 390, height }, deviceScaleFactor: 2 });
      await shortContext.addInitScript((code) => localStorage.setItem('mandate:language:v1', code), language);
      const shortPage = await shortContext.newPage();
      await shortPage.goto(`${BASE}?capture=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await shortPage.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
      await shortPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
      writeFileSync(SW_PATH, bumped);

      // Force the tallest state the plate can ever be asked to hold: version line, status line and
      // the Reload button — the real layout with a worker genuinely waiting, not a mocked one.
      const fit = await shortPage.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
        for (let attempt = 0; attempt < 60 && !registration.waiting; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const scene = window.__phaserGame.scene.getScene('MenuScene');
        scene.mode = 'settings';
        scene.render();
        let lowest = 0;
        for (const child of scene.children.list) {
          if (child.depth < 0 || typeof child.getBounds !== 'function') continue;
          const bounds = child.getBounds();
          if (bounds.height > 0 && bounds.height < 400) lowest = Math.max(lowest, bounds.bottom);
        }
        const found = [];
        const walk = (list) => {
          for (const child of list) {
            if (child.type === 'Text' && child.text?.trim()) found.push(child.text);
            if (Array.isArray(child.list)) walk(child.list);
          }
        };
        walk(scene.children.list);
        return {
          waiting: Boolean(registration.waiting),
          lowest: Math.round(lowest),
          height: Math.round(scene.scale.gameSize.height / (scene.cameras.main.zoom || 1)),
          reload: found.some((text) => /Reload|Tải lại/i.test(text)),
        };
      });
      check(
        `the settings plate fits a ${height}-tall sheet in ${language}`,
        fit.waiting && fit.reload && fit.lowest <= fit.height,
        `lowest ${fit.lowest} of ${fit.height}${fit.reload ? '' : ' — no Reload button'}`,
      );
      await shortContext.close();
    }
  }
} finally {
  writeFileSync(SW_PATH, original);
  await browser.close();
}

const failed = checks.filter((entry) => !entry.pass).length;
console.log(failed === 0
  ? `\nALL ${checks.length} PWA CHECKS PASSED — plays offline, and offers the update`
  : `\n${failed} of ${checks.length} FAILED`);
process.exit(failed === 0 ? 0 : 1);
