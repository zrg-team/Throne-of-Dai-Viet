/**
 * Cuts the QR card out of the share sheet MoMo exports, and points the game at it.
 *
 *   node scripts/crop-support-qr.mjs <screenshot.png|jpg> [out.webp|png|jpg]
 *
 * MoMo's "Chia sẻ ảnh mã QR" hands you a whole pink sheet — name, masked account number, the white
 * card with the code, and an advert underneath. Only the card belongs in the game. The card is the
 * one large near-white region on a pink ground, so it is found by density: the longest run of rows
 * that are mostly white, then the longest run of columns within them, inset a little to lose the
 * rounded corners. Chromium does the pixel work — this machine has no image tools, and the game's
 * own dev dependency on Playwright is already there.
 *
 * The default output is WebP at quality 0.9: 60 KB where the same card as PNG is 320 KB, and the
 * game preloads it on every launch. Whatever the encoding, the result is decoded again with jsQR
 * before it is written — a compression setting that eats the code must fail here, not on a phone.
 *
 * With the default output path the script also switches `qrImage` on in `src/data/support.ts`,
 * because a path to a file that does not exist would 404 in the console on every launch and the
 * config is therefore left blank until the file is real.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, extname, resolve } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);

const [, , sourceArg, outArg] = process.argv;
if (!sourceArg) {
  console.error('usage: node scripts/crop-support-qr.mjs <screenshot.png|jpg> [out.webp|png|jpg]');
  process.exit(2);
}
const source = resolve(sourceArg);
if (!existsSync(source)) {
  console.error(`no such file: ${source}`);
  process.exit(2);
}
const DEFAULT_OUT = resolve('public/support/momo-qr.webp');
const out = resolve(outArg ?? DEFAULT_OUT);
mkdirSync(resolve(out, '..'), { recursive: true });

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const mime = MIME[extname(source).toLowerCase()] ?? 'image/png';
const outMime = MIME[extname(out).toLowerCase()] ?? 'image/webp';
const dataUrl = `data:${mime};base64,${readFileSync(source).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ path: require.resolve('jsqr/dist/jsQR.js') });
const result = await page.evaluate(async ({ src, outMime }) => {
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
  // The longest run of qualifying lines, tolerating short gaps: a hairline rule under the logos,
  // or the row through both finder patterns' top bars, dips under the threshold for a few pixels
  // without being the edge of the card. Gaps count towards the run only if the run resumes.
  const longestRun = (fractions, threshold, maxGap) => {
    let best = { start: 0, end: -1 };
    let start = -1;
    let lastOn = -1;
    for (let i = 0; i <= fractions.length; i += 1) {
      const on = i < fractions.length && fractions[i] >= threshold;
      if (on) {
        if (start < 0) start = i;
        lastOn = i;
      } else if (start >= 0 && (i - lastOn > maxGap || i === fractions.length)) {
        if (lastOn - start > best.end - best.start) best = { start, end: lastOn };
        start = -1;
      }
    }
    return best;
  };
  const rows = longestRun(rowFraction, 0.3, Math.round(h * 0.03));
  if (rows.end < rows.start) return { error: 'no mostly-white band of rows found — is this the MoMo share sheet?' };

  const colFraction = new Float32Array(w);
  for (let x = 0; x < w; x += 1) {
    let n = 0;
    for (let y = rows.start; y <= rows.end; y += 1) if (white((y * w + x) * 4)) n += 1;
    colFraction[x] = n / (rows.end - rows.start + 1);
  }
  const cols = longestRun(colFraction, 0.3, Math.round(w * 0.03));
  if (cols.end < cols.start) return { error: 'no mostly-white band of columns found inside the card rows' };

  // Inside the card, find the ink — the logos and the code — and cut to that with a small margin.
  // The card's own white padding is redundant: the modal paints a white plate around whatever it
  // shows, and a code that fills its frame reads from further away.
  const inset = Math.round((cols.end - cols.start) * 0.025);
  const card = { x0: cols.start + inset, y0: rows.start + inset, x1: cols.end - inset, y1: rows.end - inset };
  const inked = (i) => {
    const r = px[i]; const g = px[i + 1]; const b = px[i + 2];
    return Math.min(r, g, b) < 200 || Math.max(r, g, b) - Math.min(r, g, b) > 40; // dark, or a coloured logo
  };
  let ix0 = card.x1; let iy0 = card.y1; let ix1 = card.x0; let iy1 = card.y0;
  for (let y = card.y0; y <= card.y1; y += 1) {
    for (let x = card.x0; x <= card.x1; x += 1) {
      if (inked((y * w + x) * 4)) {
        if (x < ix0) ix0 = x; if (x > ix1) ix1 = x;
        if (y < iy0) iy0 = y; if (y > iy1) iy1 = y;
      }
    }
  }
  if (ix1 <= ix0 || iy1 <= iy0) return { error: 'the card looks blank — no logos or code found inside it' };
  const margin = Math.round((ix1 - ix0) * 0.045); // roughly two modules of quiet zone
  const crop = {
    x: Math.max(card.x0, ix0 - margin),
    y: Math.max(card.y0, iy0 - margin),
    w: Math.min(card.x1, ix1 + margin) - Math.max(card.x0, ix0 - margin),
    h: Math.min(card.y1, iy1 + margin) - Math.max(card.y0, iy0 - margin),
  };
  const outCanvas = document.createElement('canvas');
  outCanvas.width = crop.w;
  outCanvas.height = crop.h;
  outCanvas.getContext('2d').drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  const encoded = outCanvas.toDataURL(outMime, 0.9);

  // Read the encoded result back the way a phone would see it.
  const reloaded = await new Promise((resolveImage) => {
    const im = new Image();
    im.onload = () => resolveImage(im);
    im.onerror = () => resolveImage(null);
    im.src = encoded;
  });
  let decoded = null;
  if (reloaded) {
    const check = document.createElement('canvas');
    check.width = reloaded.width;
    check.height = reloaded.height;
    const cctx = check.getContext('2d');
    cctx.drawImage(reloaded, 0, 0);
    const data = cctx.getImageData(0, 0, check.width, check.height);
    decoded = window.jsQR(data.data, data.width, data.height)?.data ?? null;
  }
  return { crop, source: { w, h }, encoded, decoded };
}, { src: dataUrl, outMime });
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
if (!result.decoded) {
  console.error(`FAIL: the cropped card re-encoded as ${outMime} does not decode as a QR code — try a .png output path`);
  process.exit(1);
}
const bytes = Buffer.from(result.encoded.split(',')[1], 'base64');
writeFileSync(out, bytes);
console.log(`cropped ${crop.w}×${crop.h} at (${crop.x}, ${crop.y}) of ${dims.w}×${dims.h} → ${out} (${Math.round(bytes.length / 1024)} KB, decodes: ${result.decoded.slice(0, 24)}…)`);

if (out === DEFAULT_OUT) {
  const configPath = resolve('src/data/support.ts');
  const relative = `support/${basename(out)}`;
  const before = readFileSync(configPath, 'utf8');
  const after = before.replace(/(\{ id: 'momo'[^\n]*qrImage: )'[^']*'/, `$1'${relative}'`);
  if (after !== before) {
    writeFileSync(configPath, after);
    console.log(`pointed the momo channel's qrImage at '${relative}' in ${configPath}`);
  } else if (before.includes(`qrImage: '${relative}'`)) {
    console.log('src/data/support.ts already points at the image');
  } else {
    console.log(`could not find the momo channel's qrImage in src/data/support.ts — set it to '${relative}' by hand`);
  }
}
