/**
 * Cuts the studio marks — the ZRG badge, and the banner that sits above it on a store's developer
 * page. These stand for whoever published the game, as opposed to for the game.
 *
 * A different thing from `build-icon.mjs`'s output, and deliberately not near it. That script
 * draws the Ngọc Lũ drum, which is the game's own face; this one takes a logo drawn elsewhere and
 * fits it to the shapes two store consoles ask for. Nothing in the game ever loads any of it.
 *
 * Source and output both live under `docs/brand/`, and that is the point. Anything under `public/` is
 * copied into `dist/` by Vite, swept into the service worker's *critical* precache by
 * `build-sw.mjs`, and zipped into `assets/web.zip` by the cabinet's sync — so a logo left there
 * is half a megabyte that every installed player downloads, and every phone unpacks on first
 * launch, to render a mark the game has no way to display.
 *
 * Usage: node scripts/build-brand.mjs [--src file] [--bg hex|none] [--out dir]
 *   --src   the drawing (default: docs/brand/source/zrg-01.png)
 *   --bg    ground to composite onto, or `none` to keep transparency (default: điệp cream)
 *   --out   where to write (default: docs/brand)
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const arg = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : fallback;
};

const SRC = arg('--src', 'docs/brand/source/zrg-01.png');
const OUT = arg('--out', 'docs/brand');

// The pigments, from src/ui/ink/palette.ts by way of scripts/build-icon.mjs. Derive, do not invent.
const DIEP = '#e9dfc2';
const DIEP_DEEP = '#c9b78c';
const MUC = '#2a2118';

/**
 * Điệp — the shell-coated paper the game's own icon is printed on.
 *
 * A ground rather than transparency, and that is most of what this script is for. The drawing is
 * pale grey linework on nothing at all, so a console that composites it onto its own dark chrome
 * loses the mark entirely. Apple is blunter still — App Store Connect rejects any icon carrying an
 * alpha channel — and Play asks for the developer header as "JPEG or 24-bit PNG (not transparent)"
 * in as many words.
 */
const BG = arg('--bg', DIEP);

/**
 * How much of the icon square the drawing may have. 84% leaves a margin wide enough to survive the
 * circular crop Play applies on some surfaces, without shrinking the mark to a dot on the rest.
 */
const ICON_FILL = 0.84;

const ICON_SIZES = [512, 1024];

/**
 * Play's developer-page header, at the size the console states: 4096x2304, under 1 MB, opaque.
 *
 * 16:9, and cropped differently on every surface that shows it — narrow and letterboxed on a
 * phone, full width on the web. So the mark sits centred and small, well inside the middle third,
 * and nothing that matters goes near an edge.
 */
const HEADER = { width: 4096, height: 2304, fill: 0.42, limit: 1024 * 1024 };

const source = `data:image/png;base64,${readFileSync(SRC).toString('base64')}`;

const browser = await chromium.launch();

/**
 * Everything below draws into a canvas rather than laying out HTML, for one reason: the drawing
 * has to be trimmed to its own ink before it can be placed.
 *
 * The source is 752x751 with the badge sitting off-centre inside it and a band of nothing down one
 * side. Scaling the *file* to fit would centre the file's middle rather than the drawing's, and
 * leave the mark visibly high and left in every console that shows it. So the opaque bounding box
 * is measured first, and that is what gets centred.
 */
const DRAW = `
  async function loadTrimmed(src) {
    const img = new Image();
    img.src = src;
    await img.decode();

    const probe = document.createElement('canvas');
    probe.width = img.width;
    probe.height = img.height;
    const px = probe.getContext('2d', { willReadFrequently: true });
    px.drawImage(img, 0, 0);
    const bytes = px.getImageData(0, 0, probe.width, probe.height).data;

    // A threshold rather than > 0: an anti-aliased edge trails a few almost-invisible pixels that
    // would otherwise widen the box by a hair on every side.
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < probe.height; y += 1) {
      for (let x = 0; x < probe.width; x += 1) {
        if (bytes[(y * probe.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { img, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  /** Deterministic, so a re-run of this script emits byte-identical output. */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
`;

const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
await page.setContent('<html><body style="margin:0;padding:0"></body></html>');
await page.addScriptTag({ content: DRAW });

/** One square cut of the badge, optionally flattened onto a ground. */
const cutIcon = async (size, background) => {
  await page.setViewportSize({ width: size, height: size });
  const url = await page.evaluate(
    async ({ src, size, background, fill }) => {
      document.body.innerHTML = '';
      const mark = await loadTrimmed(src);

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, size, size);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const scale = (size * fill) / Math.max(mark.w, mark.h);
      const dw = mark.w * scale;
      const dh = mark.h * scale;
      ctx.drawImage(mark.img, mark.x, mark.y, mark.w, mark.h, (size - dw) / 2, (size - dh) / 2, dw, dh);

      canvas.style.cssText = 'display:block;width:100%;height:100%';
      document.body.appendChild(canvas);
      return canvas.toDataURL('image/png');
    },
    { src: source, size, background, fill: ICON_FILL },
  );

  // An opaque cut comes back through the screenshot, which drops the all-255 alpha channel and
  // writes a plain RGB PNG. `toDataURL` always writes RGBA, and RGBA is the one thing Apple
  // refuses — so only the transparent cut is allowed to come back that way.
  return background
    ? await page.screenshot({ omitBackground: false })
    : Buffer.from(url.split(',')[1], 'base64');
};

/** The banner: paper, a plate mark, and the badge centred on it. */
const cutHeader = async (quality) => {
  await page.setViewportSize({ width: HEADER.width, height: HEADER.height });
  await page.evaluate(
    async ({ src, w, h, fill, diep, diepDeep, muc }) => {
      document.body.innerHTML = '';
      const mark = await loadTrimmed(src);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = diep;
      ctx.fillRect(0, 0, w, h);

      // A shell-coated sheet is never evenly coated. Flat ink, tone in the paper — the house rule
      // from the art direction, and the reason there is no gradient anywhere in here.
      const random = rng(7);
      ctx.fillStyle = diepDeep;
      for (let i = 0; i < 5200; i += 1) {
        const x = random() * w;
        const y = random() * h;
        const r = random() * 2.6 + 0.5;
        ctx.globalAlpha = 0.18 + random() * 0.3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // The plate mark: the impression a woodblock leaves in the sheet around the print. Two
      // hairlines rather than a frame, because a heavy border would be cropped into a bar.
      const inset = Math.round(h * 0.055);
      ctx.strokeStyle = muc;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 3;
      ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 2;
      const gap = Math.round(h * 0.014);
      ctx.strokeRect(inset + gap, inset + gap, w - (inset + gap) * 2, h - (inset + gap) * 2);
      ctx.globalAlpha = 1;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const scale = (h * fill) / mark.h;
      const dw = mark.w * scale;
      const dh = mark.h * scale;
      ctx.drawImage(mark.img, mark.x, mark.y, mark.w, mark.h, (w - dw) / 2, (h - dh) / 2, dw, dh);

      canvas.style.cssText = 'display:block;width:100%;height:100%';
      document.body.appendChild(canvas);
    },
    { src: source, w: HEADER.width, h: HEADER.height, fill: HEADER.fill, diep: DIEP, diepDeep: DIEP_DEEP, muc: MUC },
  );
  return await page.screenshot({ type: 'jpeg', quality, omitBackground: false });
};

mkdirSync(OUT, { recursive: true });

const ground = BG === 'none' ? null : BG;
const written = [];
const record = (name, buffer, note) => {
  writeFileSync(name, buffer);
  written.push([name, note, buffer.length]);
};

for (const size of ICON_SIZES) {
  record(`${OUT}/zrg-developer-${size}.png`, await cutIcon(size, ground), `${size}x${size} ${ground ? 'opaque' : 'alpha'}`);
}

// One transparent cut alongside, for the places that composite onto their own ground and look
// wrong with a cream square behind the mark — a README header, a dark site.
if (ground) {
  record(`${OUT}/zrg-developer-512-alpha.png`, await cutIcon(512, null), '512x512 alpha');
}

/**
 * Play caps the header at 1 MB and rejects the upload over it, so quality is walked down until it
 * fits rather than guessed once. Paper and flat ink compress well; the speckle is what costs, and
 * it is the first thing a lower quality softens.
 */
let header;
let quality = 92;
for (;;) {
  header = await cutHeader(quality);
  if (header.length <= HEADER.limit || quality <= 60) break;
  quality -= 8;
}
record(`${OUT}/zrg-developer-header.jpg`, header, `${HEADER.width}x${HEADER.height} jpeg q${quality}`);

await browser.close();

for (const [name, note, bytes] of written) {
  console.log(`wrote ${name.padEnd(38)} ${note.padEnd(26)} ${(bytes / 1024).toFixed(0)} KB`);
}
if (header.length > HEADER.limit) {
  console.error(`\nheader is ${(header.length / 1024).toFixed(0)} KB, over Play's 1 MB limit`);
  process.exit(1);
}
console.log(`studio marks cut from ${SRC}${ground ? ` on ${ground}` : ''}`);
