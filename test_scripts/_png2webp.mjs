// Re-encode the doc's screenshots as webp so the committed page references assets like every other
// doc here does, instead of carrying 5 MB of base64.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'output/water-probe/doc';
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const files = ['d-whole-map', 'a-river-mid', 'c-settled-ground', 'd-current-wide', 'e-proposed-wide', 'z-crossing', 'g-bridge-close'];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const name of files) {
  const b64 = readFileSync(`${SRC}/${name}.png`).toString('base64');
  const out = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.86);
  }, `data:image/png;base64,${b64}`);
  const buf = Buffer.from(out.split(',')[1], 'base64');
  writeFileSync(`${OUT}/water-${name}.webp`, buf);
  console.log(`water-${name}.webp`, (buf.length / 1024).toFixed(0) + ' KB', '(png was', (readFileSync(`${SRC}/${name}.png`).length / 1024).toFixed(0) + ' KB)');
}
await browser.close();
