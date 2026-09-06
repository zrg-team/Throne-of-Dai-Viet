// Pack the five reviewed ImageGen walk sheets into the existing living-map format.
// Usage: node scripts/conquest-art/traveler-variants.mjs path/to/masters
// Masters are basket.png, fisher.png, merchant.png, pilgrim.png, woodcutter.png.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error('Pass the directory containing the five reviewed masters.');
const roles = ['basket', 'fisher', 'merchant', 'pilgrim', 'woodcutter'];
const runtime = 'art/conquest-travelers-v1/life';
const out = 'output/traveler-variants';
mkdirSync(`public/${runtime}`, { recursive: true });
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const manifest = {};
const audit = {};
const save = (path, data) => writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));

try {
  for (const role of roles) {
    const source = readFileSync(join(sourceDir, `${role}.png`)).toString('base64');
    const packed = await page.evaluate(async ({ source, role }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const raster = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = raster.data;
      let transparent = 0;
      for (let p = 3; p < data.length; p += 4) if (data[p] < 8) transparent++;
      const hasAlpha = transparent > canvas.width * canvas.height * .1;
      // Some generated PNGs flatten onto a pale checkerboard. Clear only its neutral light
      // pixels; these civilians have warm cream cloth/skin and dark pigment, never white ink.
      // Genuine source alpha is preserved without re-keying it.
      if (!hasAlpha) {
        for (let p = 0; p < data.length; p += 4) {
          const lo = Math.min(data[p], data[p + 1], data[p + 2]);
          const hi = Math.max(data[p], data[p + 1], data[p + 2]);
          if (lo > 180 && hi - lo < 20) data[p + 3] = 0;
        }
        ctx.putImageData(raster, 0, 0);
      }
      const cells = [];
      const cw = canvas.width / 2, ch = canvas.height / 2;
      if (!Number.isInteger(cw) || !Number.isInteger(ch)) throw new Error(`${role}: uneven source grid`);
      for (let i = 0; i < 4; i++) {
        const ox = i % 2 * cw, oy = Math.floor(i / 2) * ch;
        let left = cw, right = -1, top = ch, bottom = -1;
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          if (data[((oy + y) * canvas.width + ox + x) * 4 + 3] <= 16) continue;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        if (left < 4 || top < 4 || right >= cw - 4 || bottom >= ch - 4 || right <= left) {
          throw new Error(`${role} frame ${i}: empty, unkeyed, or clipped subject`);
        }
        const width = right - left + 1, height = bottom - top + 1;
        // Anchor by the face rather than a basket, bundle or swinging hand. Use the median
        // skin-row centre in the upper quarter of the silhouette so gait changes never shift it.
        const centres = [];
        for (let y = Math.floor(top + height * .14); y < top + height * .26; y++) {
          let lo = cw, hi = -1;
          for (let x = left; x <= right; x++) {
            const p = ((oy + y) * canvas.width + ox + x) * 4;
            if (data[p + 3] > 128 && data[p] > 170 && data[p + 1] > 120
              && data[p] - data[p + 1] > 20 && data[p + 1] - data[p + 2] > 20) {
              lo = Math.min(lo, x); hi = Math.max(hi, x);
            }
          }
          if (hi - lo > width * .08) centres.push((lo + hi) / 2);
        }
        centres.sort((a, b) => a - b);
        if (!centres.length) throw new Error(`${role} frame ${i}: face anchor not found`);
        cells.push({ ox, oy, left, top, width, height, anchor: centres[Math.floor(centres.length / 2)] });
      }
      // One scale for all poses; only registration changes. Keep the existing 627px frame
      // contract and generous margins, including the basket or the pilgrim's complete staff.
      const fit = Math.min(550 / Math.max(...cells.map(c => c.height)),
        ...cells.map(c => 285 / Math.max(c.anchor - c.left, c.left + c.width - c.anchor)));
      const sheet = document.createElement('canvas'); sheet.width = sheet.height = 1254;
      const sg = sheet.getContext('2d');
      const registration = [];
      for (let i = 0; i < 4; i++) {
        const c = cells[i];
        const dx = 313.5 - (c.anchor - c.left) * fit, dy = 590 - c.height * fit;
        sg.drawImage(canvas, c.ox + c.left, c.oy + c.top, c.width, c.height,
          i % 2 * 627 + dx, Math.floor(i / 2) * 627 + dy, c.width * fit, c.height * fit);
        registration.push({ faceX: 313.5, baseline: 590, height: c.height * fit });
      }
      const still = document.createElement('canvas'); still.width = still.height = 627;
      still.getContext('2d').drawImage(sheet, 0, 0, 627, 627, 0, 0, 627, 627);
      return { sheet: sheet.toDataURL(), still: still.toDataURL(),
        contentHeight: Math.max(...cells.map(c => c.height)) * fit,
        sourceAlpha: hasAlpha, registration };
    }, { source, role });
    const id = `life.traveler-${role}`;
    const stillPath = `${runtime}/traveler-${role}.png`;
    const path = `${runtime}/traveler-${role}-walk.png`;
    save(`public/${stillPath}`, packed.still);
    save(`public/${path}`, packed.sheet);
    manifest[id] = { stillPath, path, frameWidth: 627, frameHeight: 627,
      contentHeight: packed.contentHeight, baselines: [590, 590, 590, 590],
      anchorsX: [313.5, 313.5, 313.5, 313.5] };
    audit[role] = { sourceAlpha: packed.sourceAlpha, registration: packed.registration };
  }
  writeFileSync('src/ui/conquestTravelerVariants.json', JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(`${out}/asset-audit.json`, JSON.stringify(audit, null, 2) + '\n');
  // A light/dark contact sheet catches baked matte, pale fringes and mismatched silhouettes.
  const sources = roles.map(role => ({ role,
    data: readFileSync(`public/${runtime}/traveler-${role}.png`).toString('base64') }));
  const review = await page.evaluate(async sources => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 550;
    const g = c.getContext('2d');
    for (let row = 0; row < 2; row++) {
      g.fillStyle = row ? '#292722' : '#ead8b2'; g.fillRect(0, row * 275, 1200, 275);
      for (let i = 0; i < sources.length; i++) {
        const im = new Image(); im.src = `data:image/png;base64,${sources[i].data}`; await im.decode();
        g.drawImage(im, i * 240 + 8, row * 275 + 10, 224, 224);
        g.fillStyle = row ? '#ead8b2' : '#292722'; g.font = '18px sans-serif';
        g.textAlign = 'center'; g.fillText(sources[i].role, i * 240 + 120, row * 275 + 255);
      }
    }
    return c.toDataURL();
  }, sources);
  save(`${out}/traveler-styles-review.png`, review);
  console.log(`Packed ${roles.length} traveller styles, stills and four-frame sheets.`);
} finally { await browser.close(); }
