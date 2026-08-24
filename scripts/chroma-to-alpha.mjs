import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/chroma-to-alpha.mjs <input.png> <output.png>');
  process.exit(1);
}

const absoluteInput = path.resolve(inputPath);
const absoluteOutput = path.resolve(outputPath);
const input = await fs.readFile(absoluteInput);
const source = `data:image/png;base64,${input.toString('base64')}`;

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const result = await page.evaluate(async (imageSource) => {
    const image = new Image();
    image.src = imageSource;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context unavailable');

    context.drawImage(image, 0, 0);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = frame.data;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const strongestOther = Math.max(red, blue);
      const dominance = green - strongestOther;

      // The generated plates use #00ff00. Feather a narrow band at the ink edge,
      // then remove green spill so scaled sprites retain clean parchment outlines.
      const keyStrength = green > 80
        ? Math.max(0, Math.min(1, (dominance - 8) / 72))
        : 0;
      if (keyStrength <= 0) continue;

      pixels[index + 3] = Math.round(pixels[index + 3] * (1 - keyStrength));
      pixels[index + 1] = Math.min(green, strongestOther + 3);
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.putImageData(frame, 0, 0);

    return {
      width: canvas.width,
      height: canvas.height,
      dataUrl: canvas.toDataURL('image/png'),
    };
  }, source);

  const encoded = result.dataUrl.slice(result.dataUrl.indexOf(',') + 1);
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(absoluteOutput, Buffer.from(encoded, 'base64'));
  console.log(`${absoluteOutput} (${result.width}x${result.height})`);
} finally {
  await browser.close();
}
