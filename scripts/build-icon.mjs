/**
 * Exports the approved river icon for web and mobile through icons/river-icon-pack.mjs.
 * The drum drawing below remains available with an explicit --mark for historical previews.
 *
 * The legacy mark is the face of the Ngọc Lũ drum — the finest Đông Sơn bronze that survives,
 * cast about two thousand years ago and now in the National Museum of History in Hanoi. It is drawn
 * from the real object rather than from a memory of one: fourteen sun rays, peacock feathers in the
 * notches between them, tangent circles with a dot at the heart, eighteen chim Lạc in flight
 * counter-clockwise, răng cưa at the rim, and a patina of dull grey-green with the relief rubbed
 * bright. `markDrum` carries the band-by-band account and says which registers were dropped.
 *
 * Two rules from the art direction that this file obeys and would look wrong without:
 *
 *   · **Derive, do not invent.** Every colour here is a pigment from `src/ui/ink/palette.ts` or
 *     one of them through `shade()`, and every contour is mực — a Đông Hồ contour is soot and
 *     nothing else. Sỏi son is spent here on purpose: this is the player's own device, the one
 *     the front page has always stamped over the title, and a seal is exactly what that red is for.
 *   · **The ink is flat.** A colour block pulled off a woodblock has no gradient, no sheen and no
 *     cast shadow. The sheet underneath may have tone; the print on it may not.
 *   · **Past a quarter turn a device is mirrored, never rotated further.** `facing()` below. Half
 *     the birds on the ring face left, and rotating them there arrives upside down.
 *
 * Everything is authored as vector masses rather than detail, because the smallest size this has to
 * survive is a 16-pixel browser tab — which is also why `markDrum` takes a level. The full face is
 * the drum; `simple` is the one that ships, with the fussiest three registers dropped and the sun
 * grown to fill what they leave; `plain` is the sun alone, for anywhere the mark goes very small.
 * Output is committed; re-run after editing a path.
 *
 * Usage: node scripts/build-icon.mjs [--out dir] [--check] [--mobile dir]
 *   --mark   explicit legacy preview: drum · drum-plain · drum-full · drum-bronze · drum-ink
 *   --out    where to write (default: public) — point it elsewhere to preview an alternate mark
 *   --check  verify the committed output matches what this script would emit, and fail if not
 *   --mobile export native river icons and matching splash into <dir>
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

/**
 * `--mobile <dir>` cuts the store sizes instead of the web set.
 *
 * One thing separates the two lists and it is 1024 rather than 512. Apple's marketing slot is
 * 1024x1024, and Expo's prebuild upscales whatever it is handed rather than refusing it — so a
 * 512 source ships soft instead of failing, which is the worse outcome because nothing anywhere
 * reports it.
 *
 * They are a separate list rather than three more entries in the web one because `build-sw.mjs`
 * sweeps everything in `public/` into the service worker's *critical* precache. A 1024 cut that
 * no browser ever asks for would be a megabyte every installed player must fetch before the game
 * is allowed to boot.
 */
const MOBILE = (() => {
  const at = process.argv.indexOf('--mobile');
  return at >= 0 ? process.argv[at + 1] : undefined;
})();
const OUT = MOBILE ?? (() => {
  const at = process.argv.indexOf('--out');
  return at >= 0 ? process.argv[at + 1] : 'public';
})();
const CHECK = process.argv.includes('--check');
const MARK = (() => {
  const at = process.argv.indexOf('--mark');
  return at >= 0 ? process.argv[at + 1] : 'drum';
})();

// Normal web and native builds share one approved source. Explicit --mark preserves the
// legacy drawing for design experiments.
if (MOBILE || !process.argv.includes('--mark')) {
  const { buildRiverIcons } = await import('./icons/river-icon-pack.mjs');
  await buildRiverIcons({ out: OUT, mobile: Boolean(MOBILE), check: CHECK });
  process.exit(0);
}

// ── pigments ────────────────────────────────────────────────────────────────
// The same values as src/ui/ink/palette.ts. Duplicated rather than imported because this script
// runs under plain node against a TypeScript source tree; if palette.ts moves, these move with it.
const PIG = {
  diep: '#e9dfc2',
  diepHi: '#f3ecd8',
  diepDeep: '#c9b78c',
  muc: '#2a2118',
  son: '#b33a26',
  sonDeep: '#8a2a1b',
  hoe: '#c08a2e',
  hoePale: '#dcbe7e',
  giDong: '#5f8a82',
};

/**
 * `shadePigment` from the game's palette, in hex.
 *
 * The rule the art direction states is **derive, do not invent** — no new hues. Every colour in
 * this file is either a pigment above or one of them run through here; the first cut of the mark
 * had three invented tones in it (a teal, two greenish blacks) and they are why it read as a
 * rendering of an object rather than as a print of one.
 */
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor)));
  return '#' + [ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
}


const S = 512;
const C = S / 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const poly = (pts, close = true) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + (close ? 'Z' : '');

/** Colour block first, soot contour second, out of register. Fill and stroke never share a place. */
const printed = (d, fill, { line = PIG.muc, width = 3, dx = -3.5, dy = -3, lineAlpha = 0.92 } = {}) =>
  `<path d="${d}" fill="${fill}" transform="translate(${dx} ${dy})"/>` +
  `<path d="${d}" fill="none" stroke="${line}" stroke-opacity="${lineAlpha}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;

/** Past a quarter turn a device is mirrored, never rotated further. See the header. */
function facing(deg, scale) {
  const norm = (((deg % 360) + 540) % 360) - 180;
  const flip = Math.abs(norm) > 90;
  return `rotate(${norm.toFixed(2)}) scale(${scale} ${flip ? -scale : scale})`;
}

// ── the ground ──────────────────────────────────────────────────────────────

// The paper may have tone — a shell-coated sheet is never evenly coated, and the game's own PaperFX
// pass puts a vignette over everything. The *ink* may not: a colour block pulled off a woodblock is
// flat by construction, so there is no gradient anywhere below this line.
const DEFS = `<defs>
  <radialGradient id="warm" cx="50%" cy="40%" r="72%">
    <stop offset="0%" stop-color="${PIG.diepHi}" stop-opacity="0.9"/>
    <stop offset="66%" stop-color="${PIG.diep}" stop-opacity="0"/>
    <stop offset="100%" stop-color="${PIG.diepDeep}" stop-opacity="0.55"/>
  </radialGradient>
</defs>`;

/** Điệp: shell-coated paper, speckled so it is a sheet and not a swatch. */
function paper(seed) {
  const rand = mulberry32(seed);
  let flecks = '';
  for (let i = 0; i < Math.round(S * 1.2); i += 1) {
    flecks += `<circle cx="${(rand() * S).toFixed(1)}" cy="${(rand() * S).toFixed(1)}" r="${(0.4 + rand() * 1.6).toFixed(2)}" fill="${rand() > 0.45 ? PIG.diepDeep : PIG.diepHi}" opacity="${(0.16 + rand() * 0.4).toFixed(2)}"/>`;
  }
  return `<rect width="${S}" height="${S}" fill="${PIG.diep}"/><rect width="${S}" height="${S}" fill="url(#warm)"/>${flecks}`;
}

/** A seal pressed by hand is never a perfect circle and never has a perfect edge. */
function wobbleCircle(cx, cy, r, seed, wobble = 0.013, n = 110) {
  const rand = mulberry32(seed);
  const pts = [];
  let drift = 0;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    drift = drift * 0.74 + (rand() - 0.5) * wobble * r;
    pts.push({ x: cx + Math.cos(a) * (r + drift), y: cy + Math.sin(a) * (r + drift) });
  }
  return pts;
}

// ── the marks ───────────────────────────────────────────────────────────────

/**
 * Chim Lạc — the long-billed bird that flies counter-clockwise round a Đông Sơn tympanum.
 *
 * Stroke width and the registration offset are divided by the scale so that a bird shrunk to fit
 * eighteen-to-a-ring still carries a two-pixel contour. Scale them with the drawing instead and the
 * band arrives as eighteen grey smudges with no print in them at all.
 */
function lacBird(x, y, deg, scale, fill, line, weight = 2.4) {
  const o = { line, width: weight / scale, dx: -2.2 / scale, dy: -2 / scale };
  return `<g transform="translate(${x} ${y}) ${facing(deg, scale)}">
    ${printed(`M-30 4C-52 2-74 8-94 22C-70 18-50 15-30 12Z`, fill, o)}
    ${printed(`M4-8C-8-30-4-54 12-66C14-44 26-28 34-16C22-14 12-11 4-8Z`, fill, o)}
    ${printed(`M56-3L106-9L58 5Z`, fill, o)}
    ${printed(`M-34 6C-20-6 2-12 24-10C38-9 50-5 58 0C50 6 36 10 20 12C0 14-22 14-34 6Z`, fill, o)}
    <path d="M-14 12L-46 30M-6 12L-40 34" stroke="${line}" stroke-width="${(weight / scale).toFixed(1)}" stroke-linecap="round" fill="none"/>
  </g>`;
}

/** Răng cưa — the sawtooth register, the commonest geometric band on a drum. */
function sawtooth(r, height, teeth) {
  let d = '';
  for (let i = 0; i < teeth; i += 1) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 1) / teeth) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    d += poly([
      { x: C + Math.cos(a0) * r, y: C + Math.sin(a0) * r },
      { x: C + Math.cos(am) * (r + height), y: C + Math.sin(am) * (r + height) },
      { x: C + Math.cos(a1) * r, y: C + Math.sin(a1) * r },
    ]);
  }
  return d;
}

/**
 * Vòng tròn tiếp tuyến có chấm giữa — tangent circles with a dot at the heart.
 *
 * The count sets the size: circles on a ring of radius R touch their neighbours exactly when their
 * own radius is R·sin(π/N), so the band is solved rather than eyeballed, and it stays tangent at
 * whatever radius the layout ends up wanting.
 */
function tangentCircles(R, n, colour, weight) {
  let out = '';
  const rr = R * Math.sin(Math.PI / n);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = C + Math.cos(a) * R;
    const y = C + Math.sin(a) * R;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rr * 0.88).toFixed(1)}" fill="none" stroke="${colour}" stroke-width="${weight}"/>`;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rr * 0.2).toFixed(1)}" fill="${colour}"/>`;
  }
  return out;
}

/** A ring of raised dots — the plainest register on a drum, and the one that fills a bare band. */
function dotRing(R, n, colour, r) {
  let out = '';
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    out += `<circle cx="${(C + Math.cos(a) * R).toFixed(1)}" cy="${(C + Math.sin(a) * R).toFixed(1)}" r="${r}" fill="${colour}" opacity="0.85"/>`;
  }
  return out;
}

/**
 * The tympanum of the Ngọc Lũ drum, cast about two thousand years ago and now in the National
 * Museum of History in Hanoi — 79cm across, and the finest Đông Sơn drum that survives.
 *
 * The real face carries a **fourteen**-ray sun on a raised boss, peacock-feather fields wedged into
 * the notches between the rays, and sixteen concentric bands, of which three are figurative and all
 * three run **counter-clockwise**: dancers in feather costume among stilt houses and rice-pounders;
 * twenty deer walking with fourteen birds; and thirty-six birds, eighteen of them in flight.
 *
 * Sixteen bands do not survive a 32-pixel favicon, so this keeps the structure and drops the
 * repeats: the fourteen rays and their feathers, one band of tangent circles, the eighteen birds in
 * flight, and răng cưa at the rim. Everything kept is the real count, in the real order.
 */
function markDrum(skin, level = 'simple') {
  const rim = poly(wobbleCircle(C, C, 232, 31));
  const RAYS = 14;
  const full = level === 'full';
  const plain = level === 'plain';
  const line = skin.line;

  // The sun grows as the bands around it go: with nothing else on the face it has to carry the mark
  // on its own, and a small sun on a bare disc reads as a button.
  const tip = plain ? 152 : full ? 94 : 118;
  const boss = plain ? 52 : full ? 34 : 44;
  const star = [];
  for (let i = 0; i < RAYS * 2; i += 1) {
    const a = (i / (RAYS * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? tip : boss * 1.06;
    star.push({ x: C + Math.cos(a) * rad, y: C + Math.sin(a) * rad });
  }

  // Lông công — the peacock-feather field wedged into each notch between two rays. It is hatching,
  // and hatching is the first thing to turn to mud, so only the full face carries it.
  let feathers = '';
  if (full) {
    for (let i = 0; i < RAYS; i += 1) {
      const a = ((i + 0.5) / RAYS) * Math.PI * 2 - Math.PI / 2;
      const w = (Math.PI / RAYS) * 0.6;
      const at = (rad, off) => ({ x: C + Math.cos(a + off) * rad, y: C + Math.sin(a + off) * rad });
      feathers += `<path d="${poly([at(38, -w), at(86, 0), at(38, w)])}" fill="none" stroke="${skin.gold}" stroke-width="2.6"/>`;
      feathers += `<path d="M${at(44, 0).x.toFixed(1)} ${at(44, 0).y.toFixed(1)}L${at(78, 0).x.toFixed(1)} ${at(78, 0).y.toFixed(1)}" stroke="${skin.gold}" stroke-width="2.2"/>`;
    }
  }

  // The birds are size-limited by their own count: eighteen on a ring of 168 leaves 59px of arc
  // each, and a bird longer than its share of the arc walks into the tail of the one ahead. Halving
  // the flock is the only way to make each bird bigger, so the simple face flies nine — half of the
  // eighteen that are really there, in the same direction, at twice the size.
  const flock = full ? { n: 18, r: 168, scale: 0.33 } : { n: 9, r: 166, scale: 0.5 };
  let birds = '';
  if (!plain) {
    for (let i = 0; i < flock.n; i += 1) {
      const a = (i / flock.n) * Math.PI * 2 - Math.PI / 2;
      birds += lacBird(
        C + Math.cos(a) * flock.r,
        C + Math.sin(a) * flock.r,
        (a * 180) / Math.PI - 90,
        flock.scale,
        skin.gold,
        line,
      );
    }
  }

  const hair = (r) => `<path d="${poly(wobbleCircle(C, C, r, 70 + r, 0.007))}" fill="none" stroke="${skin.gold}" stroke-width="3"/>`;

  const teeth = full ? { r: 202, h: 13, n: 44 } : { r: 200, h: 18, n: 24 };
  const block = { line, width: 5, dx: -4.5, dy: -3.6 };

  return (
    // The disc is printed like everything else: the colour block laid down a few units off the
    // contour that draws it. A sliver of paper along one edge is not a mistake to be tightened up,
    // it is the register slip that says a human pulled this.
    printed(rim, skin.block, block) +
    `<path d="${sawtooth(teeth.r, teeth.h, teeth.n)}" fill="${skin.gold}"/>` +
    hair(teeth.r - 2) +
    (full ? dotRing(186, 44, skin.gold, 3.4) + hair(178) : '') +
    birds +
    (plain ? '' : hair(full ? 136 : 138)) +
    (full ? tangentCircles(120, 18, skin.gold, 3.2) + hair(98) : '') +
    feathers +
    printed(poly(star), skin.white, { line, width: 3.2, dx: -3.6, dy: -3.2 }) +
    `<circle cx="${C - 3.6}" cy="${C - 3.2}" r="${boss}" fill="${skin.white}"/>` +
    `<circle cx="${C}" cy="${C}" r="${boss}" fill="none" stroke="${line}" stroke-width="3.2"/>`
  );
}

/**
 * Three blocks and the paper, which is how a Đông Hồ print is actually built.
 *
 * `block` is the ground the drum is cut in, `gold` is the second block, and `white` is the sheet
 * itself showing through where no block was laid — the brightest thing on any Đông Hồ print is
 * always unprinted điệp, not a pigment. The contour is mực in every case, because a Đông Hồ contour
 * is soot and nothing else; the first cut of this mark drew it in a dark green that exists in no
 * printer's inventory.
 */
/**
 * The ground the drum is cut in, and why it is red.
 *
 * Verdigris is what the object is, and the first cut used it — but the mark does not only live on
 * a home screen. It is also the device over the game's title, and up there gỉ đồng was the only
 * green anything on a page whose whole palette is paper, soot, sỏi son and hoa hòe: one cool hue
 * at the top of a warm sheet, pulling the eye off the thing the page is for. A Đông Hồ printer
 * cut what was in the tray rather than what the subject happened to be made of, and the tray here
 * has four colours in it. The bronze cut is kept as `drum-bronze` for anyone who wants the object.
 */
const SON = { block: PIG.son, gold: PIG.hoePale, white: PIG.diepHi, line: PIG.muc };
const BRONZE = { block: shade(PIG.giDong, 0.74), gold: PIG.hoePale, white: PIG.diepHi, line: PIG.muc };

/** The face at three levels of detail, and the reason each one exists is a size. */
const drum = () => markDrum(SON, 'simple');
const drumPlain = () => markDrum(SON, 'plain');
const drumFull = () => markDrum(SON, 'full');

/** The same three blocks with the ground pulled in gỉ đồng — the colour the drum itself is. */
const drumBronze = () => markDrum(BRONZE, 'simple');

/** The drum cut in mực, with the contour lifted so it does not vanish into its own ground. */
const drumInk = () =>
  markDrum({ block: PIG.muc, gold: PIG.hoePale, white: PIG.diepHi, line: shade(PIG.muc, 2.3) }, 'simple');

const MARKS = { drum, 'drum-plain': drumPlain, 'drum-full': drumFull, 'drum-bronze': drumBronze, 'drum-ink': drumInk };
if (!MARKS[MARK]) {
  console.error(`unknown mark "${MARK}" — expected one of ${Object.keys(MARKS).join(', ')}`);
  process.exit(1);
}

const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${DEFS}${inner}</svg>\n`;

const mark = MARKS[MARK]();
const ICON = svg(paper(7) + mark);

/**
 * The favicon: the disc alone, on nothing.
 *
 * A tab strip is not paper. Shipping the paper-backed icon there puts a cream square in a row of
 * transparent favicons, and on a dark browser theme that square is the brightest thing on the
 * screen — so the tab mark is the printed disc and nothing else. The install icons keep their
 * paper: an Android launcher composites a transparent icon onto whatever the wallpaper happens to
 * be, and iOS fills an icon's alpha with black.
 */
const FAVICON = svg(mark);

/**
 * The maskable icon, for Android's adaptive shapes.
 *
 * The launcher may crop anything outside a circle of 80% diameter, so the seal is pulled in to
 * 78% and the paper runs to all four edges under it. Shipping the plain icon here is what gets a
 * drum with its rim sliced off on a Pixel.
 */
const MASKABLE = svg(paper(7) + `<g transform="translate(${C} ${C}) scale(0.78) translate(${-C} ${-C})">${mark}</g>`);

// ── the manifest ────────────────────────────────────────────────────────────
// Relative URLs throughout: the game is served from a repository sub-path on GitHub Pages, and an
// absolute "/icon-192.png" resolves to the domain root, where nothing is.
const MANIFEST = `${JSON.stringify(
  {
    name: 'Vạn Thắng — Ten Thousand Victories',
    short_name: 'Vạn Thắng',
    description: 'Vạn Thắng — a grand-strategy game of Vietnamese history, printed like a Đông Hồ woodblock.',
    lang: 'en',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#201a12',
    theme_color: '#2a2118',
    icons: [
      { src: './icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: './icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: './icon-512.png', type: 'image/png', sizes: '512x512' },
      { src: './icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  },
  null,
  2,
)}\n`;

// ── emit ────────────────────────────────────────────────────────────────────

const SOURCES = { icon: ICON, favicon: FAVICON, maskable: MASKABLE };

const WEB_PNGS = [
  ['favicon-32.png', 'favicon', 32],
  ['favicon-96.png', 'favicon', 96],
  ['apple-touch-icon.png', 'icon', 180],
  ['icon-192.png', 'icon', 192],
  ['icon-512.png', 'icon', 512],
  ['icon-maskable-512.png', 'maskable', 512],
];

const PNGS = WEB_PNGS;

// The manifest and the SVGs are the web's half of the mark; a cabinet has no use for any of them.
const TEXT = new Map([
  ['icon.svg', ICON],
  ['favicon.svg', FAVICON],
  ['icon-maskable.svg', MASKABLE],
  ['manifest.webmanifest', MANIFEST],
]);

const browser = await chromium.launch();
const rasterised = new Map();
for (const [name, source, size] of PNGS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><body style="margin:0">${SOURCES[source].replace(`width="${S}" height="${S}"`, `width="${size}" height="${size}"`)}</body></html>`,
  );
  rasterised.set(name, await page.screenshot({ omitBackground: source === 'favicon' }));
  await page.close();
}
await browser.close();

let drift = 0;
if (!CHECK) mkdirSync(OUT, { recursive: true });
const compare = (name, buffer) => {
  const at = `${OUT}/${name}`;
  if (CHECK) {
    const same = existsSync(at) && readFileSync(at).equals(Buffer.from(buffer));
    if (!same) {
      console.error(`drift: ${at}`);
      drift += 1;
    }
    return;
  }
  writeFileSync(at, buffer);
  console.log(`wrote ${at}`);
};

for (const [name, body] of TEXT) compare(name, Buffer.from(body, 'utf8'));
for (const [name] of PNGS) compare(name, rasterised.get(name));

if (CHECK && drift > 0) {
  console.error(`${drift} file(s) differ — re-run \`node scripts/build-icon.mjs\``);
  process.exit(1);
}
console.log(
  CHECK ? 'icon output is current' : `legacy icon set built from mark "${MARK}"`,
);
