import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { definitions, wardrobe, ensembles } from '../../scripts/faces/dongho-v2-jobs.mjs';
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5180';
const OUT = 'output/hero-dongho-v2/review';
mkdirSync(OUT, { recursive: true });
const source = key => readFileSync(`public/faces-dongho-v2/parts/${key}.png`);
for (const d of definitions) {
  const old = readFileSync(`public/faces-dongho-v1/parts/${d.key}.png`);
  if (wardrobe.includes(d.key)) assert(!old.equals(source(d.key)), `Unchanged wardrobe: ${d.key}`);
  else assert(old.equals(source(d.key)), `Accepted anatomy changed: ${d.key}`);
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 780, height: 1000 }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/?capture=1&heroArt=dongho-v2`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  const report = await page.evaluate(async ({ definitions, ensembles, wardrobe, pngs }) => {
    const { heroTemplates } = await import('/src/data/heroes.ts');
    const { generateHero } = await import('/src/data/heroFactory.ts');
    const { resolveHeroLook } = await import('/src/ui/faces/heroLook.ts');
    const { donghoWardrobeParts } = await import('/src/ui/faces/donghoWardrobe.ts');
    const { fitDonghoPart, donghoHead, DONGHO_HAT_CONTACTS } = await import('/src/ui/faces/donghoFit.ts');
    const { heroFaceHeadwearSupported } = await import('/src/ui/faces/artPack.ts');
    const { kingHatPool, rollKingChoice } = await import('/src/ui/faces/kingLook.ts');
    const { renderHeroFaceInBox } = await import('/src/ui/FaceRenderer.ts');
    const defs = new Map(definitions.map(d => [d.key, d]));
    const images = new Map(), masks = new Map();
    const pngChecks = [];
    for (const [key, src] of Object.entries(pngs)) {
      const im = new Image(); im.src = src; await im.decode(); images.set(key, im);
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
      const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
      let ink = 0, alpha = 0, matte = 0;
      for (let p = 0; p < rgba.length; p += 4) {
        if (rgba[p + 3] < 5) alpha++;
        if (rgba[p + 3] > 128) {
          ink++;
          if (rgba[p] > 170 && rgba[p + 2] > 170 && Math.min(rgba[p], rgba[p + 2]) - rgba[p + 1] > 90) matte++;
        }
      }
      if (wardrobe.includes(key) && (!ink || !alpha || matte)) throw new Error(`${key}: bad cutout ${ink}/${alpha}/${matte}`);
      if (wardrobe.includes(key)) pngChecks.push({ key, ink, alpha, matte });
    }
    function mask(key, head) {
      const cacheKey = `${key}/${head?.key ?? ''}`;
      if (masks.has(cacheKey)) return masks.get(cacheKey);
      const d = defs.get(key), c = document.createElement('canvas'); c.width = 408; c.height = 576;
      for (const f of fitDonghoPart(d, head)) {
        const im = images.get(key), l = f.crop?.left ?? 0, r = f.crop?.right ?? 1;
        c.getContext('2d').drawImage(im, l * im.width, 0, (r - l) * im.width, im.height,
          (68 + f.cx - f.w / 2 + l * f.w) * 3, (90 + f.cy - f.h / 2) * 3, (r - l) * f.w * 3, f.h * 3);
      }
      const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const alpha = new Uint8Array(c.width * c.height);
      for (let p = 0; p < alpha.length; p++) alpha[p] = pixels[p * 4 + 3];
      masks.set(cacheKey, alpha); return alpha;
    }
    const heroes = [...heroTemplates, ...Array.from({ length: 240 }, (_, i) => generateHero(90210 + i * 7919))];
    const eyeOverlaps = [], seenPairs = new Set();
    for (const h of heroes) {
      const look = resolveHeroLook(h), saved = JSON.stringify(look), parts = donghoWardrobeParts(look);
      if (JSON.stringify(look) !== saved) throw new Error(`Mutated ${h.name}`);
      if (parts.some(p => !defs.has(p.key))) throw new Error(`Missing resource ${h.name}`);
      const primary = parts.filter(p => ensembles.includes(p.key) || p.key.startsWith('robe-armour'));
      if (primary.length !== 1) throw new Error(`Conflicting outfits ${h.name}: ${primary.map(p => p.key)}`);
      if (look.era === 'nguyen' && parts.some(p => /^robe-armour|^hat-helm/.test(p.key))) throw new Error(`Medieval Nguyễn outfit ${h.name}`);
      if (!['le', 'nguyen'].includes(look.era) && parts.some(p => p.key.startsWith('badge-'))) throw new Error(`Early rank badge ${h.name}`);
      const eye = parts.find(p => p.key.startsWith('eyes-'));
      for (const hat of parts.filter(p => p.key.startsWith('hat-') && heroFaceHeadwearSupported(p.key))) {
        const head = donghoHead(parts, defs), pair = `${head.key}/${hat.key}/${eye.key}`;
        if (seenPairs.has(pair)) continue; seenPairs.add(pair);
        const a = mask(hat.key, head), b = mask(eye.key, head); let overlap = 0, count = 0;
        for (let p = 0; p < a.length; p++) if (b[p] > 128) { count++; if (a[p] > 128) overlap++; }
        if (overlap / count > .02) eyeOverlaps.push({ hero: h.name, pair, overlap, count });
      }
    }
    let allFits = 0;
    for (const head of definitions.filter(d => d.key.startsWith('head-'))) {
      const allEyes = definitions.filter(d => d.key.startsWith('eyes-')).map(d => ({ key: d.key,
        pixels: Array.from(mask(d.key, head).entries()).filter(([, a]) => a > 128).map(([i]) => i) }));
      for (const hat of definitions.filter(d => d.key.startsWith('hat-') && heroFaceHeadwearSupported(d.key))) {
        if (!DONGHO_HAT_CONTACTS[hat.key]) throw new Error(`Uncalibrated hat ${hat.key}`);
        const a = mask(hat.key, head);
        for (const eye of allEyes) {
          allFits++;
          const overlap = eye.pixels.filter(p => a[p] > 128).length;
          if (overlap / eye.pixels.length > .02) eyeOverlaps.push({ pair: `${head.key}/${hat.key}/${eye.key}`, overlap, count: eye.pixels.length });
        }
      }
    }
    const nguyenChoice = { ...rollKingChoice(() => .5), era: 'nguyen', sex: 'man', register: 'war' };
    if (kingHatPool(nguyenChoice, 3).some(p => p.startsWith('hat-helm'))) throw new Error('Creator offers replaced Nguyễn helm');
    const scene = window.__phaserGame.scene.getScene('MenuScene'); scene.children.removeAll(true);
    scene.cameras.main.setZoom(1).setScroll(0, 0);
    const width = scene.cameras.main.width, height = scene.cameras.main.height;
    scene.add.rectangle(width / 2, height / 2, width, height, 0xf0e7cf);
    const chosen = [...heroTemplates.filter(h => h.sex === 'woman').slice(0, 5), ...heroTemplates.filter(h => h.monastic).slice(0, 2), ...heroTemplates.filter(h => h.era === 'nguyen').slice(0, 3), ...heroes.slice(-20, -10)];
    chosen.slice(0, 20).forEach((hero, i) => {
      const cw = width / 4, ch = height / 5;
      renderHeroFaceInBox(scene, hero, { x: i % 4 * cw + 4, y: Math.floor(i / 4) * ch + 3, width: cw - 8, height: ch - 16 });
      scene.add.text((i % 4 + .5) * cw, (Math.floor(i / 4) + 1) * ch - 13, hero.name, { fontSize: `${Math.max(7, width / 100)}px`, color: '#382b21', fontFamily: 'serif' }).setOrigin(.5, 0);
    });
    return { heroes: heroes.length, pngChecks, hatEyePairs: seenPairs.size, allFits, eyeOverlaps };
  }, { definitions, ensembles, wardrobe, pngs: Object.fromEntries(definitions.filter(d => !/^(plate-|rank-|mark-)/.test(d.key)).map(d => [d.key, `data:image/png;base64,${source(d.key).toString('base64')}`])) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/wardrobe-gallery.png` });
  writeFileSync(`${OUT}/wardrobe-checks.json`, JSON.stringify(report, null, 2));
  assert.equal(report.eyeOverlaps.length, 0, `Headwear covers eyes: ${JSON.stringify(report.eyeOverlaps.slice(0, 6))}`);
  assert.deepEqual(errors, []);
  console.log(`PASS: 140 changed wardrobe PNGs; 156 inherited parts unchanged; ${report.heroes} outfits; ${report.allFits} exhaustive head/hat/eye fits; no visible magenta.`);
} finally { await browser.close(); }
