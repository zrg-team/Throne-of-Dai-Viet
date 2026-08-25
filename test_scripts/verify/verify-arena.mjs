// The Field: does the setup screen fit, and does it start the fight it was told to?
//
// Two failures this exists to catch, both found the hard way. The action button was placed at a
// hardcoded `y` and in Vietnamese — where every label is longer and every row grows — it came
// down on top of the odds line and covered it. And a tile's label was printed without measuring,
// so "Trường thương" ran straight out through the tile's border.
//
// So both languages are checked, at both screen heights, for overlap and for overflow.
//
// Usage: node test_scripts/verify/verify-arena.mjs
//        DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-arena.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
mkdirSync('output/web-game', { recursive: true });

const browser = await chromium.launch();
const results = [];
const errors = [];

for (const lang of ['en', 'vi']) {
  for (const height of [844, 620]) {
    const page = await browser.newPage({ viewport: { width: 390, height } });
    page.on('pageerror', (e) => errors.push(`PAGEERROR ${lang}/${height} ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${lang}/${height} ${m.text()}`); });
    await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await page.evaluate((l) => { try { localStorage.setItem('mandate:language:v1', l); } catch { /* ignore */ } }, lang);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
    await page.waitForTimeout(1200);

    const probe = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('BattleArenaScene');
      // Every text the screen drew, with the tile it belongs to where there is one. Read off the
      // live display list rather than from the source, so this measures what is on the glass.
      const texts = [];
      const walk = (obj, ox, oy) => {
        for (const child of obj.list ?? []) {
          const x = ox + (child.x ?? 0);
          const y = oy + (child.y ?? 0);
          if (child.type === 'Text') {
            texts.push({
              text: child.text, x, y, w: child.width, h: child.height,
              // Only tile labels carry this; the page title and the buttons do not.
              tileWidth: child.getData ? child.getData('tileWidth') : undefined,
            });
          }
          if (child.list) walk(child, x, y);
        }
      };
      walk(scene.children, 0, 0);
      const buttons = [];
      for (const item of scene.content ?? []) {
        if (item.type === 'Container' && item.list?.some((c) => c.type === 'Text')) {
          const label = item.list.find((c) => c.type === 'Text');
          buttons.push({ label: label.text, y: item.y, height: 50 });
        }
      }
      return {
        texts,
        buttons,
        scrollTop: scene.scroll?.bounds?.y ?? null,
        scrollHeight: scene.scroll?.bounds?.height ?? null,
        // What the dials actually need against the window the ring left them. On a short screen
        // the body is ALLOWED to scroll — the ring and both buttons are pinned, and the scroll
        // is the design there, not a safety net.
        contentHeight: scene.scroll?.contentHeight ?? null,
        gameHeight: window.__phaserGame.scale.height,
      };
    });

    // 1. Nothing the screen drew may sit under the pinned action buttons.
    const buttonTop = probe.buttons.length
      ? Math.min(...probe.buttons.map((b) => b.y))
      : probe.gameHeight;
    const bodyBottom = (probe.scrollTop ?? 0) + (probe.scrollHeight ?? 0);
    const bodyClears = bodyBottom <= buttonTop + 1;

    // 2. Every tile label must fit inside the tile it was drawn into — each one carries the
    //    width it was given, so this compares against the real tile rather than a guess.
    const tiles = probe.texts.filter((entry) => typeof entry.tileWidth === 'number');
    const overflowing = tiles
      .filter((entry) => entry.w > entry.tileWidth)
      .map((entry) => `${entry.text} (${Math.round(entry.w)}px > ${entry.tileWidth}px)`);

    results.push({
      lang, height, bodyClears, bodyBottom, buttonTop, overflowing,
      texts: probe.texts.length, tiles: tiles.length,
      contentHeight: probe.contentHeight, viewHeight: probe.scrollHeight,
    });
    await page.screenshot({ path: `output/web-game/arena-${lang}-${height}.png` });
    await page.close();
  }
}

// ── and does it start the fight it was told to? ─────────────────────────────
//
// The dials are only worth having if the matchup reaches the field intact. Measured rather than
// assumed: a levy turning out on top of the two hosts, or the wave director dropping an invasion
// into the arena, would both show up here as numbers that are not the ones dialled in.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push(`PAGEERROR fight ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE fight ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);
await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(900);

const dialled = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('BattleArenaScene');
  scene.startFight();
  return { ours: scene.ourMen, theirs: scene.theirMen };
});
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 20000 });
await page.waitForTimeout(1200);

const fight = await page.evaluate(() => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const battle = st?.ascent?.activeBattle;
  return {
    lane: ui?.openPromptKey ?? '',
    ourStart: battle?.ourStart ?? null,
    theirStart: battle?.theirStart ?? null,
    armies: (st?.armies ?? []).map((a) => a.id).sort(),
  };
});
await page.screenshot({ path: 'output/web-game/arena-fight.png' });
await page.close();

await browser.close();

console.log('═══ THE FIELD — setup screen ═══\n');
console.log('lang  height  body ends  buttons at  clears  labels over width');
for (const r of results) {
  console.log(
    `${r.lang.padEnd(5)} ${String(r.height).padStart(6)} ${String(Math.round(r.bodyBottom)).padStart(10)} `
    + `${String(Math.round(r.buttonTop)).padStart(11)} ${(r.bodyClears ? 'yes' : 'NO').padStart(7)}  `
    + `${r.overflowing.length ? r.overflowing.join(', ') : 'none'}`);
}

console.log('\n── TARGETS ──');
const line = (ok, label, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} ${detail}`);
const clears = results.every((r) => r.bodyClears);
const noOverflow = results.every((r) => r.overflowing.length === 0);
line(clears, 'the dials never run under the action buttons',
  results.filter((r) => !r.bodyClears).map((r) => `${r.lang}/${r.height}`).join(', ') || 'all four fit');
line(noOverflow, 'no tile label is wider than its tile',
  results.flatMap((r) => r.overflowing).join(' ; ') || 'none overflow');
// 4 + 4 arms, then 4 ground + 3 doctrine + 4 general + 4 difficulty + 3 speed + 5 bubbles.
// The two headcounts are steppers, so they are not tiles. The count was 19 until the
// difficulty, speed and word dials moved onto this page (battleOptions round) — the check
// slept through that and failed on 31 for weeks.
line(results.every((r) => r.tiles === 31), 'every dial drew its tiles',
  results.map((r) => `${r.tiles} tiles`).join(' / '));
// On a TALL screen the whole setup fits without scrolling. On a short one it deliberately does
// not any more: the ring and both buttons are pinned and the dials scroll under them — that is
// the layout since the difficulty/speed/bubble rows arrived, not a safety net that failed.
// The old check asserted equal body height at both sizes, which the pinned-ring design cannot
// satisfy and was never meant to.
const fitsTall = results.every((r) => r.height !== 844
  || (r.contentHeight ?? 0) <= (r.viewHeight ?? 0) + 1);
line(fitsTall, 'the setup fits a tall screen without scrolling',
  results.map((r) => `${r.lang}/${r.height}: needs ${Math.round(r.contentHeight ?? 0)} of ${Math.round(r.viewHeight ?? 0)}`).join('  '));
console.log('');
console.log(`the fight opened as   ${fight.ourStart} against ${fight.theirStart}`);
console.log(`dialled in as         ${dialled.ours} against ${dialled.theirs}`);
console.log(`on the field          ${fight.armies.join(', ')}`);
// `ourStart` counts the reserve held back at camp, so it equals what was dialled in; a levy
// joining would push it above, and a missing host would drop it below.
line(fight.lane === 'lane:battle', 'taking command opens the battle screen', fight.lane || '(nothing)');
line(fight.ourStart === dialled.ours && fight.theirStart === dialled.theirs,
  'the fight is the matchup that was dialled in',
  `${fight.ourStart}/${fight.theirStart} against ${dialled.ours}/${dialled.theirs}`);
line(fight.armies.length === 2, 'nobody else is on the field', fight.armies.join(', '));


console.log(`\nconsole errors: ${errors.length ? errors.slice(0, 3).join(' ; ') : 'none'}`);
