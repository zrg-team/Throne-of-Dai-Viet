// The living-map walk sheets must be genuine 2x2 alpha sprite sheets with four visible,
// distinct poses. This checks the files themselves before Phaser is allowed to consume them.
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const reviewed=JSON.parse(await fs.readFile('src/ui/conquestDongHoV4Walks.json','utf8'));
const FILES=Object.fromEntries(['farmer','traveler','buffalo','ox-cart'].map(role=>[
  role==='ox-cart'?'cart':role,
  `public/${reviewed[`life.${role}-walk`]?.path??`art/conquest-dongho/life/${role}-walk.png`}`,
]));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const audit = {};

for (const [kind, path] of Object.entries(FILES)) {
  const bytes = await fs.readFile(path);
  audit[kind] = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const cellWidth = canvas.width / 2;
    const cellHeight = canvas.height / 2;
    const frames = [];

    for (let frame = 0; frame < 4; frame += 1) {
      const cellX = (frame % 2) * cellWidth;
      const cellY = Math.floor(frame / 2) * cellHeight;
      let left = cellWidth;
      let right = -1;
      let top = cellHeight;
      let bottom = -1;
      let opaque = 0;
      let hash = 2166136261;
      for (let y = 0; y < cellHeight; y += 1) {
        for (let x = 0; x < cellWidth; x += 1) {
          const index = ((cellY + y) * canvas.width + cellX + x) * 4;
          const alpha = pixels[index + 3];
          if (alpha > 16) {
            opaque += 1;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
          // Stable, sparse RGBA fingerprint: enough to reject duplicated quadrants cheaply.
          if ((x + y * cellWidth) % 31 === 0) {
            hash ^= pixels[index] | (pixels[index + 1] << 8)
              | (pixels[index + 2] << 16) | (alpha << 24);
            hash = Math.imul(hash, 16777619) >>> 0;
          }
        }
      }
      frames.push({
        left, right, top, bottom, opaque, hash,
        width: right >= left ? right - left + 1 : 0,
        height: bottom >= top ? bottom - top + 1 : 0,
        // The bottom eight opaque rows identify the foot that is actually
        // carrying the ground contact in a passing pose. Distinct whole-frame
        // hashes did not catch the old traveler sheet: its arms changed, but
        // the same right-side foot remained planted throughout the cycle.
        groundContactX: (() => {
          let sum = 0;
          let count = 0;
          for (let y = Math.max(0, bottom - 7); y <= bottom; y += 1) {
            for (let x = 0; x < cellWidth; x += 1) {
              const index = ((cellY + y) * canvas.width + cellX + x) * 4;
              if (pixels[index + 3] > 16) {
                sum += x;
                count += 1;
              }
            }
          }
          return count > 0 ? sum / count : null;
        })(),
      });
    }

    const cornerAlpha = [
      pixels[3],
      pixels[(canvas.width - 1) * 4 + 3],
      pixels[((canvas.height - 1) * canvas.width) * 4 + 3],
      pixels[(canvas.width * canvas.height - 1) * 4 + 3],
    ];
    return {
      width: canvas.width,
      height: canvas.height,
      cellWidth,
      cellHeight,
      cornerAlpha,
      frames,
      uniqueHashes: new Set(frames.map((frame) => frame.hash)).size,
    };
  }, bytes.toString('base64'));
}

await browser.close();

let failures = 0;
const check = (label, pass, detail) => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures += 1;
};

for (const [kind, result] of Object.entries(audit)) {
  check(`${kind}: exact 2x2 cell grid`, result.width === 1254 && result.height === 1254
    && result.cellWidth === 627 && result.cellHeight === 627,
  `${result.width}x${result.height}; cells ${result.cellWidth}x${result.cellHeight}`);
  // A single 1/255 antialias trace is visually and compositionally transparent.
  check(`${kind}: genuine transparent canvas corners`, result.cornerAlpha.every((alpha) => alpha <= 1),
    `alpha ${result.cornerAlpha.join(',')}`);
  check(`${kind}: all four frames contain a padded subject`, result.frames.every((frame) => (
    frame.opaque > 5000 && frame.left > 3 && frame.top > 3
      && frame.right < result.cellWidth - 4 && frame.bottom < result.cellHeight - 4
  )), JSON.stringify(result.frames));
  check(`${kind}: four distinct visual frames`, result.uniqueHashes === 4,
    `${result.uniqueHashes}/4 unique`);
}

const traveler = audit.traveler;
const rearLiftContact = traveler.frames[1].groundContactX;
const frontLiftContact = traveler.frames[3].groundContactX;
check('traveler: passing poses plant opposite left/right feet',
  Number.isFinite(rearLiftContact) && Number.isFinite(frontLiftContact)
    && rearLiftContact - frontLiftContact >= 40,
  `ground contacts x=${rearLiftContact?.toFixed(1)},${frontLiftContact?.toFixed(1)}`);

console.log(JSON.stringify(audit, null, 2));
const totalChecks = Object.keys(FILES).length * 4 + 1;
console.log(`\n${totalChecks - failures}/${totalChecks} walk-sheet checks passed`);
process.exit(failures === 0 ? 0 : 1);
