// The front page has to fit at any sheet height, in either language, under any theme.
// Overlapping menu text was reported from a real phone twice; this is what catches it.
import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? 'http://localhost:5173';
const browser = await chromium.launch();
let bad = 0;
for (const theme of ['dong-ho', 'ink-wash', 'illustrated-atlas']) {
  for (const lang of ['en', 'vi']) {
    for (const [quality, h] of [['low', 660], ['medium', 844], ['high', 926]]) {
      const page = await browser.newPage({ viewport: { width: 390, height: h }, deviceScaleFactor: 3 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('Landscape'))) errors.push(m.text()); });
      await page.addInitScript(([t, l, q]) => {
        localStorage.setItem('mandate:map-theme:v1', t);
        localStorage.setItem('mandate:language:v1', l);
        localStorage.setItem('mandate:graphics:v1', q);
      }, [theme, lang, quality]);
      await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
      await page.waitForTimeout(1000);
      // Nothing on the front page may overlap anything else it is not nested in.
      const overlaps = await page.evaluate(() => {
        const scene = window.__phaserGame.scene.getScene('MenuScene');
        const boxes = [];
        for (const child of scene.children.list) {
          if (child.type !== 'Text' || !child.text?.trim() || child.depth < 0) continue;
          const m = child.getWorldTransformMatrix();
          const w = child.width, ht = child.height;
          boxes.push({ t: child.text.slice(0, 18), x: m.tx - w * child.originX, y: m.ty - ht * child.originY, w, h: ht });
        }
        const hits = [];
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i], b = boxes[j];
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            // A drop shadow is the same string drawn a pixel or two away; that is the effect, not
            // a collision.
            if (ox > 3 && oy > 3 && a.t !== b.t) hits.push(`${a.t}|${b.t}`);
          }
        }
        return hits;
      });
      await page.evaluate(() => window.__startBenchGame(1337, 'campaign'));
      await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
      await page.waitForTimeout(2200);
      const drew = await page.evaluate(() => window.__phaserGame.scene.getScene('MapScene').children.list.length > 5);
      const ok = drew && errors.length === 0 && overlaps.length === 0;
      if (!ok) bad += 1;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${theme.padEnd(18)} ${lang} ${quality.padEnd(7)} h=${h}  ${overlaps.slice(0, 2).join(' ')} ${errors.slice(0, 1).join('')}`);
      await page.close();
    }
  }
}
await browser.close();
console.log(bad === 0 ? 'ALL COMBINATIONS OK — NO MENU TEXT OVERLAP' : `${bad} FAILED`);
