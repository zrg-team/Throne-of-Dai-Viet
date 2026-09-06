// Export reviewed ImageGen capitals; only matte removal, crop and uniform downsampling.
// Usage: node scripts/conquest-art/capital-pack.mjs [master-directory] [pack-name] [era,era,...]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const masters = process.argv[2] ?? 'output/capital-redesign-v1/masters';
const pack = process.argv[3] ?? 'conquest-capitals-v1';
if (!/^conquest-capitals-v\d+$/.test(pack)) throw new Error('Invalid capital pack name');
const target = `public/art/${pack}/settlement`;
const eras = process.argv[4]?.split(',') ?? ['dinh', 'ly', 'tran', 'le', 'nguyen'];
if (eras.some(era => !['dinh', 'ly', 'tran', 'le', 'nguyen'].includes(era))) throw new Error('Invalid capital era');
const review = path.join(path.dirname(masters), 'review');
fs.mkdirSync(target, { recursive: true });
fs.mkdirSync(review, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const audit = [];
try {
  for (const era of eras) {
    const source = fs.readFileSync(path.join(masters, `citadel-${era}.png`)).toString('base64');
    const packed = await page.evaluate(async source => {
      const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      const raster = ctx.getImageData(0, 0, canvas.width, canvas.height); const data = raster.data;
      let transparent = 0;
      for (let p = 3; p < data.length; p += 4) if (data[p] < 8) transparent++;
      const sourceAlpha = transparent > canvas.width * canvas.height * .1;
      // Generated checker mattes are neutral; the reviewed architecture's cream masonry is warm.
      // Do not repaint pigments or key a master which already has real alpha.
      if (!sourceAlpha) {
        for (let p = 0; p < data.length; p += 4) {
          const lo = Math.min(data[p], data[p + 1], data[p + 2]);
          const hi = Math.max(data[p], data[p + 1], data[p + 2]);
          if (lo > 180 && hi - lo < 20) data[p + 3] = 0;
        }
      }
      // Discard isolated export specks, never architectural strokes attached to the compound.
      const count = canvas.width * canvas.height, seen = new Uint8Array(count), queue = new Int32Array(count);
      let removedSpecks = 0;
      for (let start = 0; start < count; start++) {
        if (seen[start] || data[start * 4 + 3] <= 16) continue;
        let end = 1, at = 0; queue[0] = start; seen[start] = 1;
        while (at < end) {
          const p = queue[at++], x = p % canvas.width;
          for (const q of [x > 0 ? p - 1 : -1, x < canvas.width - 1 ? p + 1 : -1, p - canvas.width, p + canvas.width]) {
            if (q < 0 || q >= count || seen[q] || data[q * 4 + 3] <= 16) continue;
            seen[q] = 1; queue[end++] = q;
          }
        }
        if (end < 24) for (let n = 0; n < end; n++) { data[queue[n] * 4 + 3] = 0; removedSpecks++; }
      }
      let left = canvas.width, right = -1, top = canvas.height, bottom = -1, inkPixels = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] <= 16) continue;
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); inkPixels++;
      }
      if (right <= left || bottom <= top || left <= 0 || top <= 0 || right >= canvas.width - 1 || bottom >= canvas.height - 1) {
        throw new Error('Empty, clipped or unkeyed capital master');
      }
      ctx.putImageData(raster, 0, 0);
      const width = right - left + 1, height = bottom - top + 1;
      const fit = Math.min(1, 480 / Math.max(width, height));
      const output = document.createElement('canvas'); output.width = Math.ceil(width * fit - 1e-6) + 32; output.height = Math.ceil(height * fit - 1e-6) + 32;
      const g = output.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(canvas, left, top, width, height, 16, 16, width * fit, height * fit);
      const boards = {};
      for (const [name, color] of [['paper', '#eadcb8'], ['dark', '#292721']]) {
        const board = document.createElement('canvas'); board.width = output.width; board.height = output.height;
        const c = board.getContext('2d'); c.fillStyle = color; c.fillRect(0, 0, board.width, board.height); c.drawImage(output, 0, 0);
        boards[name] = board.toDataURL();
      }
      return { png: output.toDataURL(), boards, sourceAlpha, removedSpecks,
        sourceBounds: { left, top, width, height }, width: output.width, height: output.height,
        inkFraction: inkPixels / (width * height) };
    }, source);
    const save = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    save(`${target}/citadel-${era}.png`, packed.png);
    for (const [name, url] of Object.entries(packed.boards)) save(`${review}/${era}-${name}.png`, url);
    const { png, boards, ...metadata } = packed;
    audit.push({ id: `settlement.citadel-${era}`, path: `${target}/citadel-${era}.png`, ...metadata });
  }
  fs.writeFileSync(`public/art/${pack}/manifest.json`, JSON.stringify({
    version: Number(pack.split('-v')[1]), generator: 'built-in ImageGen', research: 'docs/research/capital-architecture-redesign.md',
    scale: 'Uses the shared height and width ceilings in src/ui/conquestMapArt.ts', assets: audit,
  }, null, 2) + '\n');
  console.log(JSON.stringify(audit, null, 2));
} finally { await browser.close(); }
