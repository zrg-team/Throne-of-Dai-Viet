// Entering a fight twice must not un-bake the map.
//
// The scene *instance* is reused across `scene.start`, but its display list is not: Phaser destroys
// the bake RenderTexture on shutdown and the field went on pointing at the corpse. Second time in,
// `bakeStaticTerrain` saw a truthy handle, skipped re-creating it, and `clear()` dereferenced a null
// GL binding. The throw was caught and *warned*, which is what made it so expensive — the bake bailed
// before hiding the source layers, so every static layer under depth 1.5 kept drawing live, every
// frame, for the rest of the run.
//
// Sa Trường is where a player meets this, because the arena is the one screen you enter, leave and
// re-enter in a loop.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-arena-rebake.mjs
import { chromium } from 'playwright';

const URL = process.env.DEV_URL || process.env.BASE_URL || process.env.PLAYTEST_URL || 'http://127.0.0.1:5179';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const warnings = [];
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'warning' && /bake skipped/i.test(m.text())) warnings.push(m.text());
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(700);

/** One trip through the arena into a fight, then back out again. */
async function round() {
  await page.evaluate(() => {
    // Stop the menu, because tapping through to the arena in the real game does. Driving
    // `scene.start` from outside leaves MenuScene rendering underneath and this measured its own
    // artifact: 66.6 ms a frame with the menu still drawing, 16.7 without it.
    const g = window.__phaserGame;
    if (g.scene.isActive('MenuScene')) g.scene.stop('MenuScene');
    g.scene.start('BattleArenaScene');
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__phaserGame.scene.getScene('BattleArenaScene').startFight());
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestScene');
    // Every static source layer must be hidden once the bake has taken over. If the bake bailed they
    // are all still visible, which is the whole cost.
    const band = scene.children.list.filter((o) => typeof o.depth === 'number' && o.depth <= 1.5);
    return {
      bakeAlive: Boolean(scene.staticBakeRT && scene.staticBakeRT.scene),
      bandTotal: band.length,
      bandVisible: band.filter((o) => o.visible).length,
    };
  });
}

const first = await round();
const second = await round();
const third = await round();

// Frame cost on the third fight, which is where the old bug had fully compounded.
const fps = await page.evaluate(() => new Promise((resolve) => {
  const frames = [];
  let last = performance.now();
  let n = 0;
  const tick = (now) => {
    frames.push(now - last);
    last = now;
    if (++n < 90) requestAnimationFrame(tick);
    else {
      const sorted = frames.slice(10).sort((a, b) => a - b);
      resolve({
        median: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
        worst: Math.round(sorted[sorted.length - 1] * 10) / 10,
      });
    }
  };
  requestAnimationFrame(tick);
}));

await browser.close();

check(first.bakeAlive, 'the first fight bakes the map', `${first.bandVisible}/${first.bandTotal} sources still live`);
check(second.bakeAlive, 'so does the second', `${second.bandVisible}/${second.bandTotal} sources still live`);
check(third.bakeAlive, 'and the third');

check(second.bandVisible === first.bandVisible,
  'the second fight hides the same sources the first did',
  `${first.bandVisible} then ${second.bandVisible}`);
check(third.bandVisible <= first.bandVisible,
  'nothing accumulates across re-entries', `${third.bandVisible} live`);

check(warnings.length === 0, 'the bake never bails', warnings.slice(0, 2).join(' | ') || 'no "bake skipped" warnings');
check(fps.median <= 24, 'the third fight still runs at a playable frame time',
  `median ${fps.median} ms, worst ${fps.worst} ms`);
check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: re-entering a fight costs frames');
