/**
 * The view culling and the zoom LOD, checked as behaviour rather than as a frame time.
 *
 * The map is 2244x3030 and the camera reaches between 1.8% and 9.3% of it, so almost everything the
 * scene holds is off-screen at any moment. Culling it is worth several times the frame — but only
 * if it stays honest, and the ways it can go wrong are all invisible in a benchmark:
 *
 *   - culling something the player can see,
 *   - failing to bring it back when the camera returns,
 *   - hiding an object but leaving its tween running, which saves the draw and none of the CPU,
 *   - breaking the tap that has to land on the province under the finger.
 *
 * Run against `npm run dev`.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || `${process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179'}`;
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

async function boot(browser, quality) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  if (quality) {
    await page.evaluate((q) => localStorage.setItem('mandate:graphics:v1', q), quality);
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function'
      && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => window.__startBenchGame(1337));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
  await page.waitForTimeout(400);
  // A developed realm: culling has nothing to prove on an opening position with three lands lit.
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    for (const land of scene.state.lands) {
      land.isVisible = true;
      land.isExplored = true;
    }
    scene.refresh();
  });
  await page.waitForTimeout(500);
  return { page, errors };
}

const browser = await chromium.launch();

// ── culling, and coming back ────────────────────────────────────────────────
{
  const { page, errors } = await boot(browser, 'high');

  const wide = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    return { indexed: scene.viewIndex.size, culled: scene.viewIndex.culledCount };
  });
  check(
    'most of a revealed map is culled',
    wide.indexed > 50 && wide.culled / wide.indexed > 0.6,
    `${wide.culled}/${wide.indexed} culled`,
  );

  // Everything culled must also be still: a hidden object with a live tween saves the draw and
  // none of the work, and the traffic movers evaluate a spline on every frame they run.
  const still = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    const running = scene.tweens.getTweens().filter((t) => t.isPlaying && t.isPlaying()).length;
    return { running, total: scene.tweens.getTweens().length };
  });
  check(
    'culled objects are not still animating',
    still.running < still.total * 0.5,
    `${still.running}/${still.total} tweens running`,
  );

  // Two camera positions far enough apart to hold different provinces. Deliberately absolute
  // rather than "scroll down a bit": the camera clamps to the world bounds, so a relative pan can
  // silently do nothing and the check would then be testing that nothing changed.
  const restored = await page.evaluate(async () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('MapScene');
    const cam = scene.cameras.main;
    const shown = () => [...scene.landNodes.entries()].filter(([, n]) => n.visible).map(([id]) => id);
    const settle = () => { for (let i = 0; i < 5; i += 1) game.step(performance.now(), 16); };

    cam.setScroll(0, 0);
    settle();
    const north = shown();
    cam.setScroll(0, 2000);
    settle();
    const south = shown();
    // Back to the north view: what was there must return, which is the half a one-way pan cannot show.
    cam.setScroll(0, 0);
    settle();
    const northAgain = shown();
    return {
      north,
      south,
      northAgain,
      differ: south.some((id) => !north.includes(id)) || north.some((id) => !south.includes(id)),
      returned: north.length === northAgain.length && north.every((id) => northAgain.includes(id)),
    };
  });
  check(
    'panning changes which provinces are drawn',
    restored.differ && restored.north.length > 0 && restored.south.length > 0,
    `north ${restored.north.length}, south ${restored.south.length} visible nodes`,
  );
  check(
    'panning back restores exactly what was there',
    restored.returned,
    `${restored.north.length} -> ${restored.northAgain.length}`,
  );

  // Everything visible must be inside the camera's reach, allowing the entry margin.
  const noStrays = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    const cam = scene.cameras.main;
    const w = cam.width / cam.zoom;
    const h = cam.height / cam.zoom;
    const margin = 260; // cull margin plus the widest registered reach
    let strays = 0;
    for (const [, node] of scene.landNodes) {
      if (!node.visible) continue;
      if (
        node.x < cam.scrollX - margin || node.x > cam.scrollX + w + margin
        || node.y < cam.scrollY - margin || node.y > cam.scrollY + h + margin
      ) strays += 1;
    }
    return strays;
  });
  check('nothing far off-screen is left visible', noStrays === 0, `${noStrays} strays`);

  // The tap has to keep landing on the province under the finger.
  const tapped = await page.evaluate(async () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('MapScene');
    const cam = scene.cameras.main;
    const land = scene.state.lands.find((l) => l.isVisible);
    cam.setScroll(scene.wx(land.x) - cam.width / cam.zoom / 2, scene.wy(land.y) - cam.height / cam.zoom / 2);
    for (let i = 0; i < 3; i += 1) game.step(performance.now(), 16);
    return { hit: scene.findLandIdAt(scene.wx(land.x), scene.wy(land.y)), want: land.id };
  });
  check('a tap still resolves the land under it after panning', tapped.hit === tapped.want, `${tapped.hit}`);

  check('no console errors (high tier)', errors.length === 0, errors[0] ?? '');
  await page.close();
}

// ── the zoom LOD, per quality tier ──────────────────────────────────────────
for (const [quality, expectLabelsDropped] of [['low', true], ['high', false]]) {
  const { page, errors } = await boot(browser, quality);
  const out = await page.evaluate(async () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('MapScene');
    const sample = () => {
      const labels = [...scene.landLabels.values()];
      const shown = labels.filter((l) => l.visible).length;
      return { labels: labels.length, shown };
    };
    scene.setMapZoom(1.2);
    for (let i = 0; i < 3; i += 1) game.step(performance.now(), 16);
    const near = sample();
    scene.setMapZoom(0.72);
    for (let i = 0; i < 3; i += 1) game.step(performance.now(), 16);
    const far = sample();
    return { near, far };
  });
  const dropped = out.far.shown < out.near.shown;
  check(
    `${quality} tier ${expectLabelsDropped ? 'drops' : 'keeps'} name plates when zoomed out`,
    dropped === expectLabelsDropped,
    `zoomed in ${out.near.shown} shown, zoomed out ${out.far.shown} shown`,
  );
  check(`no console errors (${quality} tier)`, errors.length === 0, errors[0] ?? '');
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} CHECK(S) FAILED` : '\nALL CULLING CHECKS PASS');
process.exit(failed.length ? 1 : 0);
