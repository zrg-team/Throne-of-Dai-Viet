/**
 * Cuts the QR card out of the share sheet MoMo exports, and points the game at it.
 *
 *   node scripts/crop-support-qr.mjs <screenshot.png|jpg> [out.png]
 *
 * MoMo's "Chia sẻ ảnh mã QR" hands you a whole pink sheet — name, masked account number, the white
 * card with the code, and an advert underneath. Only the card belongs in the game. The card is the
 * one large near-white region on a pink ground, so it is found by density: the longest run of rows
 * that are mostly white, then the longest run of columns within them, inset a little to lose the
 * rounded corners. Chromium does the pixel work — this machine has no image tools, and the game's
 * own dev dependency on Playwright is already there.
 *
 * With the default output path the script also switches `qrImage` on in `src/data/support.ts`,
 * because a path to a file that does not exist would 404 in the console on every launch and the
 * config is therefore left blank until the file is real.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';

const [, , sourceArg, outArg] = process.argv;
if (!sourceArg) {
  console.error('usage: node scripts/crop-support-qr.mjs <screenshot.png|jpg> [out.png]');
  process.exit(2);
}
const source = resolve(sourceArg);
if (!existsSync(source)) {
  console.error(`no such file: ${source}`);
  process.exit(2);
}
const DEFAULT_OUT = resolve('public/support/momo-qr.png');
const out = resolve(outArg ?? DEFAULT_OUT);
mkdirSync(resolve(out, '..'), { recursive: true });

const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(source).toLowerCase()] ?? 'image/png';
const dataUrl = `data:${mime};base64,${readFileSync(source).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
const result = await page.evaluate(async (src) => {
  const image = await new Promise((resolveImage, reject) => {
    const im = new Image();
    im.onload = () => resolveImage(im);
    im.onerror = reject;
    im.src = src;
  });
  const w = image.width;
  const h = image.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const white = (i) => px[i] >= 238 && px[i + 1] >= 238 && px[i + 2] >= 238;

  // Rows that are mostly white, then the longest contiguous run of them.
  const rowFraction = new Float32Array(h);
  for (let y = 0; y < h; y += 1) {
    let n = 0;
    for (let x = 0; x < w; x += 1) if (white((y * w + x) * 4)) n += 1;
    rowFraction[y] = n / w;
  }
  const longestRun = (fractions, threshold) => {
    let best = { start: 0, end: -1 };
    let start = -1;
    for (let i = 0; i <= fractions.length; i += 1) {
      const on = i < fractions.length && fractions[i] >= threshold;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (i - start > best.end - best.start + 1) best = { start, end: i - 1 };
        start = -1;
      }
    }
    return best;
  };
  const rows = longestRun(rowFraction, 0.3);
  if (rows.end < rows.start) return { error: 'no mostly-white band of rows found — is this the MoMo share sheet?' };

  const colFraction = new Float32Array(w);
  for (let x = 0; x < w; x += 1) {
    let n = 0;
    for (let y = rows.start; y <= rows.end; y += 1) if (white((y * w + x) * 4)) n += 1;
    colFraction[x] = n / (rows.end - rows.start + 1);
  }
  const cols = longestRun(colFraction, 0.3);
  if (cols.end < cols.start) return { error: 'no mostly-white band of columns found inside the card rows' };

  // Inset to lose the rounded corners of the card, then crop.
  const inset = Math.round((cols.end - cols.start) * 0.025);
  const crop = { x: cols.start + inset, y: rows.start + inset, w: cols.end - cols.start - inset * 2, h: rows.end - rows.start - inset * 2 };
  const outCanvas = document.createElement('canvas');
  outCanvas.width = crop.w;
  outCanvas.height = crop.h;
  outCanvas.getContext('2d').drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  return { crop, source: { w, h }, png: outCanvas.toDataURL('image/png') };
}, dataUrl);
await browser.close();

if (result.error) {
  console.error(`FAIL: ${result.error}`);
  process.exit(1);
}
const { crop, source: dims } = result;
const aspect = crop.w / crop.h;
if (crop.w < 120 || crop.h < 120 || aspect < 0.6 || aspect > 1.7) {
  console.error(`FAIL: the region found (${crop.w}×${crop.h} at ${crop.x},${crop.y} in ${dims.w}×${dims.h}) does not look like the QR card`);
  process.exit(1);
}
writeFileSync(out, Buffer.from(result.png.split(',')[1], 'base64'));
console.log(`cropped ${crop.w}×${crop.h} at (${crop.x}, ${crop.y}) of ${dims.w}×${dims.h} → ${out}`);

if (out === DEFAULT_OUT) {
  const configPath = resolve('src/data/support.ts');
  const before = readFileSync(configPath, 'utf8');
  const after = before.replace(/(\{ id: 'momo'[^\n]*qrImage: )''/, "$1'support/momo-qr.png'");
  if (after !== before) {
    writeFileSync(configPath, after);
    console.log(`switched qrImage on for the momo channel in ${configPath}`);
  } else if (/qrImage: 'support\/momo-qr\.png'/.test(before)) {
    console.log('src/data/support.ts already points at the image');
  } else {
    console.log("could not find the momo channel's `qrImage: ''` in src/data/support.ts — set it to 'support/momo-qr.png' by hand");
  }
}
