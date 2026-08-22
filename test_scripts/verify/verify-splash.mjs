// The launch splash in `index.html`: it has to be on screen before the bundle is, sit in exactly
// the box the canvas will occupy, and get out of the way the moment the menu is drawn.
//
// Three things this catches, all of which were true of the first cut:
//   · a splash sized to the viewport rather than to Phaser's FIT box, so the handover is a jump
//     cut from a full-bleed page to a letterboxed one;
//   · a splash that outlives the menu, or leaves before it, either of which shows the player a
//     frame of empty paper;
//   · a splash whose march is animated through layout or paint, which freezes solid for the eight
//     seconds the main thread spends parsing Phaser — the one thing it exists to cover.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://localhost:5173';
const browser = await chromium.launch();
let bad = 0;

// A tall phone, a short one, a square-ish window and a desktop one. The last two are where a
// full-bleed splash and a letterboxed canvas disagree most.
const SIZES = [
  { w: 390, h: 844, label: 'phone' },
  { w: 375, h: 667, label: 'SE' },
  { w: 820, h: 900, label: 'tablet' },
  { w: 1280, h: 760, label: 'desktop' },
];

for (const size of SIZES) {
  for (const lang of ['en', 'vi']) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 160)); });
    await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);

    await page.goto(`${BASE}/?capture=1`, { waitUntil: 'commit' });

    // 1. It is on screen before anything from the bundle is — the whole point. Sampled at the
    //    first commit, when no module has run: the drum and the wordmark are in the document that
    //    just arrived, and the band is one frame behind them by design.
    const early = await page.evaluate(() => ({
      splash: !!document.getElementById('splash'),
      name: document.querySelector('.sp-name')?.textContent,
      caption: document.getElementById('sp-caption')?.textContent,
      mark: !!document.querySelector('.sp-mark'),
      phaser: !!window.__phaserGame,
    }));
    const captionOk = lang === 'vi'
      ? early.caption === 'Đang tập hợp quân…'
      : early.caption === 'Mustering the host…';
    const paintedEarly = early.splash && early.mark && early.name === 'VẠN THẮNG'
      && !early.phaser && captionOk;

    // The band, one frame later: six drawings of the same road, each a data-URI image rather than
    // live SVG, and the country behind them. Every one has to carry real ink — an empty
    // background is what a thrown builder leaves behind, and it looks exactly like a plain page.
    await page.waitForFunction(() => document.querySelectorAll('.sp-frame').length > 0, null, { timeout: 15000 });
    const band = await page.evaluate(() => {
      const frames = [...document.querySelectorAll('.sp-frame')];
      const url = (el) => getComputedStyle(el).backgroundImage;
      return {
        frames: frames.length,
        // Every frame is a different drawing: identical ones mean the gait never advanced.
        distinct: new Set(frames.map(url)).size,
        // A size floor. Four hosts of forty-odd marks each is a few hundred thousand characters
        // of path data; a builder that fell over half way still leaves a valid, tiny image behind,
        // and a tiny image looks exactly like an empty band.
        smallest: Math.min(...frames.map((el) => url(el).length)),
        land: url(document.getElementById('sp-far')).slice(0, 30),
      };
    });
    const bandOk = band.frames === 4 && band.distinct === 4 && band.smallest > 100000
      && band.land.startsWith('url(');

    // 2. Nothing it animates may cost layout or paint. `transform` and `opacity` are the only two
    //    properties the compositor can run on its own while the main thread is blocked.
    const props = await page.evaluate(() => {
      const seen = new Set();
      for (const a of document.getAnimations()) {
        const frames = a.effect?.getKeyframes?.() ?? [];
        for (const f of frames) {
          for (const k of Object.keys(f)) {
            if (k !== 'offset' && k !== 'computedOffset' && k !== 'easing' && k !== 'composite') seen.add(k);
          }
        }
      }
      return { props: [...seen], count: document.getAnimations().length };
    });
    const cheap = props.props.every((p) => p === 'transform' || p === 'opacity');
    // A layer per animated element. One loading screen is not worth a hundred of them: an early
    // cut animated every man separately and asked the compositor for 184, and the one after it
    // still wanted fifteen. Two travelling layers and four flipbook frames is six, plus the
    // progress sweep — and the whole march is baked images, so none of them touches the main
    // thread again after the first raster.
    const fewLayers = props.count <= 10;

    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 45000 });

    // 3. The sheet is the canvas's box, to the pixel. Measured while both are on screen, which is
    //    the only moment the question can actually be answered.
    const boxes = await page.evaluate(() => {
      const canvas = document.querySelector('#game-root canvas');
      const sheet = document.getElementById('sp-sheet');
      if (!canvas || !sheet) return null;
      const c = canvas.getBoundingClientRect();
      const s = sheet.getBoundingClientRect();
      return {
        canvas: { x: c.left, y: c.top, w: c.width, h: c.height },
        sheet: { x: s.left, y: s.top, w: s.width, h: s.height },
      };
    });
    // Half a pixel is a rounding difference between two `getBoundingClientRect` reads; anything
    // more is a different sheet.
    const drift = boxes
      ? Math.max(
        Math.abs(boxes.canvas.x - boxes.sheet.x), Math.abs(boxes.canvas.y - boxes.sheet.y),
        Math.abs(boxes.canvas.w - boxes.sheet.w), Math.abs(boxes.canvas.h - boxes.sheet.h),
      )
      : Infinity;
    const fits = drift <= 0.5;

    // 4. It leaves — and only after the menu is on the canvas, never before.
    await page.waitForTimeout(1400);
    const gone = await page.evaluate(() => !document.getElementById('splash'));

    const ok = paintedEarly && bandOk && cheap && fewLayers && fits && gone && errors.length === 0;
    if (!ok) bad += 1;
    const why = [
      paintedEarly ? '' : `painted(${JSON.stringify(early)})`,
      bandOk ? '' : `band(${JSON.stringify(band)})`,
      cheap ? '' : `props(${props.props.join(',')})`,
      fewLayers ? '' : `layers(${props.count})`,
      fits ? '' : `drift(${drift.toFixed(2)}px ${JSON.stringify(boxes)})`,
      gone ? '' : 'stillUp',
      errors.length ? errors[0] : '',
    ].filter(Boolean).join(' ');
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${size.label.padEnd(8)} ${size.w}x${size.h} ${lang}  frames=${band.frames} anims=${props.count} drift=${Number.isFinite(drift) ? drift.toFixed(2) : '?'}px  ${why}`);
    await page.close();
  }
}

await browser.close();
console.log(bad === 0 ? 'SPLASH OK — PAINTS EARLY, MATCHES THE CANVAS BOX, LEAVES ON THE MENU' : `${bad} FAILED`);
