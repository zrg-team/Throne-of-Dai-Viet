// The notch, and the launch where iOS forgets it.
//
// Reported from an installed app on an iPhone 16 Pro: the seal printed under the Dynamic Island
// and the support links under the home indicator, until the app was closed and reopened. That is
// WebKit laying the page out before it knows the window's insets — every `env(safe-area-inset-*)`
// answers `0px` and never changes again — so `index.html` substitutes the device's own numbers
// when, and only when, the values are both absent and impossible.
//
// Headless Chromium reports no insets at all, which is exactly the launch being reproduced: the
// question each case asks is whether the page substitutes, and whether it leaves every other
// situation alone.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const IPHONE_16_PRO = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
  + ' (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch();

/**
 * One launch.
 *
 * `screen` is faked rather than derived from the viewport because an installed app fills the
 * screen and Playwright's headless screen does not match the window it opens — and the screen's
 * point size is the whole basis on which the fallback picks its numbers.
 */
async function launch({ width, height, screen, standalone, shell, ua = IPHONE_16_PRO, insets, lateInsets }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 3,
    userAgent: ua,
    isMobile: true,
    hasTouch: true,
  });
  // Headless Chromium reports no insets; this is the only way to play the launch that works.
  const cdp = insets || lateInsets ? await page.context().newCDPSession(page) : null;
  const emulate = (i) => cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: i[0], bottom: i[1], left: 0, right: 0 },
  });
  if (insets) await emulate(insets);
  await page.addInitScript(([sw, sh, isStandalone, isShell]) => {
    Object.defineProperty(window.screen, 'width', { get: () => sw });
    Object.defineProperty(window.screen, 'height', { get: () => sh });
    if (isStandalone) Object.defineProperty(window.navigator, 'standalone', { get: () => true });
    if (isShell) window.__shell = { kind: 'mobile', os: 'ios' };
  }, [screen[0], screen[1], standalone, shell]);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(700);
  if (lateInsets) {
    // WebKit answering after the fact. Nothing tells the page — no resize, no style event — so
    // this is exactly what the poll is for, and 5 s is inside the window it polls.
    await emulate(lateInsets);
    await page.waitForTimeout(5000);
  }
  const seen = await page.evaluate(() => {
    const root = document.getElementById('game-root');
    const box = root.getBoundingClientRect();
    const canvas = root.querySelector('canvas').getBoundingClientRect();
    return {
      safeArea: window.__safeArea,
      rootTop: Math.round(box.top),
      rootHeight: Math.round(box.height),
      canvasTop: Math.round(canvas.top),
      canvasBottom: Math.round(canvas.bottom),
      designHeight: window.__phaserGame.scale.gameSize.height / window.__renderScale(),
    };
  });
  await page.close();
  return seen;
}

const checks = [];
function check(name, ok, detail) {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

// 1. The reported launch: iPhone 16 Pro (402x874 points), installed, `env` silent.
{
  const s = await launch({ width: 402, height: 874, screen: [402, 874], standalone: true });
  check('16 Pro standalone substitutes 62/34',
    s.safeArea?.top === 62 && s.safeArea?.bottom === 34 && s.safeArea?.measured === false,
    JSON.stringify(s.safeArea));
  check('root is inset by both strips', s.rootTop === 62 && s.rootHeight === 874 - 62 - 34,
    `top=${s.rootTop} h=${s.rootHeight}`);
  // The bug as the player saw it: ink drawn under the island and under the home indicator.
  check('canvas clears the island and the pill', s.canvasTop >= 62 && s.canvasBottom <= 874 - 34,
    `canvas ${s.canvasTop}..${s.canvasBottom}`);
  // The design surface takes its aspect from the root, so the substitution has to land before the
  // bundle runs: 390 * 778 / 402 = 755, not the 848 an uninset root would have given.
  check('design height comes off the inset root', s.designHeight === 755, `h=${s.designHeight}`);
}

// 2. A phone with no notch. 375x667 is an SE; guessing insets for it would print two dead strips.
{
  const s = await launch({ width: 375, height: 667, screen: [375, 667], standalone: true });
  check('SE gets nothing', s.safeArea?.top === 0 && s.safeArea?.bottom === 0 && s.safeArea?.measured === true,
    JSON.stringify(s.safeArea));
  check('SE root fills the window', s.rootTop === 0 && s.rootHeight === 667,
    `top=${s.rootTop} h=${s.rootHeight}`);
}

// 3. A native shell pads its own WebView; adding to that insets the game twice.
{
  const s = await launch({ width: 402, height: 874, screen: [402, 874], standalone: true, shell: true });
  check('shell keeps its own padding', s.safeArea?.top === 0 && s.safeArea?.bottom === 0,
    JSON.stringify(s.safeArea));
}

// 4. A tab in Safari has a toolbar over the pill and is not the case this exists for.
{
  const s = await launch({ width: 402, height: 874, screen: [402, 874], standalone: false });
  check('browser tab untouched', s.safeArea?.top === 0 && s.safeArea?.bottom === 0,
    JSON.stringify(s.safeArea));
}

// 5. Desktop: neither iOS nor installed.
{
  const s = await launch({
    width: 1200, height: 800, screen: [1512, 982], standalone: false,
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36',
  });
  check('desktop untouched', s.safeArea?.top === 0 && s.safeArea?.bottom === 0,
    JSON.stringify(s.safeArea));
}

// 6. Rotated, the insets are the sides: the top goes to zero and the pill gets slimmer.
{
  const s = await launch({ width: 874, height: 402, screen: [402, 874], standalone: true });
  check('landscape takes 0/21', s.safeArea?.top === 0 && s.safeArea?.bottom === 21,
    JSON.stringify(s.safeArea));
}

// 7. The launch that works. `env` answers, so the table must not get a vote — 47 here, where the
// table would have said 62 for this screen.
{
  const s = await launch({ width: 402, height: 874, screen: [402, 874], standalone: true, insets: [47, 34] });
  check('measured insets win over the table',
    s.safeArea?.top === 47 && s.safeArea?.bottom === 34 && s.safeArea?.measured === true,
    JSON.stringify(s.safeArea));
  check('root follows the measured insets', s.rootTop === 47 && s.rootHeight === 874 - 47 - 34,
    `top=${s.rootTop} h=${s.rootHeight}`);
}

// 8. Silent at launch, answering later: the substitution has to get out of the way again, or it
// becomes the thing that is wrong.
{
  const s = await launch({ width: 402, height: 874, screen: [402, 874], standalone: true, lateInsets: [47, 34] });
  check('a late answer replaces the substitution',
    s.safeArea?.top === 47 && s.safeArea?.measured === true, JSON.stringify(s.safeArea));
  check('root re-fits to the late answer', s.rootTop === 47 && s.rootHeight === 874 - 47 - 34,
    `top=${s.rootTop} h=${s.rootHeight}`);
  check('canvas re-fits with it', s.canvasTop >= 47 && s.canvasBottom <= 874 - 34,
    `canvas ${s.canvasTop}..${s.canvasBottom}`);
}

await browser.close();
const failed = checks.filter((ok) => !ok).length;
console.log(failed === 0 ? 'ALL OK — SAFE AREA HOLDS ON A SILENT LAUNCH' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
