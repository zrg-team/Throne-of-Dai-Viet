// ImageGen draws the masters. This script only prepares alignment references, cuts PNGs,
// resizes them into the existing design space and packs the runtime atlas. No image API.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = 'output/hero-dongho-v1';
const PUBLIC = 'public/faces-dongho-v1';
const defs = JSON.parse(readFileSync('src/ui/faces/parts.generated.ts', 'utf8').split('export const FACE_PART_DEFS: readonly FacePartDef[] = ')[1].split(' as const;')[0]);
const keys = defs.map(p => p.key);
const select = re => keys.filter(k => re.test(k));
const sheets = [];
const group = (name, ids, instructions, perSheet = 28) => {
  for (let i = 0; i < ids.length; i += perSheet) {
    const partIds = ids.slice(i, i + perSheet);
    sheets.push({ name: `${name}${ids.length > perSheet ? `-${i / perSheet + 1}` : ''}`, ids: partIds, cols: 4, rows: Math.ceil(partIds.length / 4), instructions });
  }
};
group('heads', select(/^head-/), 'Sixteen blank human head silhouettes. Preserve each distinct jaw and skull proportion. Absolutely no eyes, brows, noses, lips, ears, hair, neck or clothing: those are separate layers. White interior for runtime skin tint, one warm-black carved outline, no colored skin or gradients.');
group('anatomy', select(/^neck$|^neck-|^ears$|^ears-/), 'Three necks followed by three separate pairs of ears. Preserve the paired-ear spacing and disconnected transparent center; never draw a face between the ears. White interior, warm-black contour.');
group('upper-face', select(/^brow-|^eyes-/), 'First fourteen cells are eyebrow PAIRS ONLY; remaining fourteen are eye PAIRS ONLY. Preserve left/right spacing, expression and shape in each cell. No heads, noses, skin patches, ears, eyelashes like cosmetics, or extra brows on the eye pairs. White or warm-black ink only.');
group('lower-face', select(/^nose-|^mouth-/), 'First twelve cells are isolated noses, remaining sixteen are isolated mouths. Preserve subtle expression differences, all paired nostrils, dark teeth only where present in the reference. No heads, no moustaches, no additional features. Noses use dark carved lines; lips use restrained brick-red and warm-black with white teeth only where present.');
group('beards', select(/^beard-/), 'Fourteen separate facial-hair pieces only, preserving each moustache, beard fork, outline and negative-space opening. No noses, mouths, skin, heads or eyes. Ivory base and charcoal sparse linework so runtime hair tint can work. Do not turn white masks into solid black: the game applies black or grey.');
group('hair', select(/^hair-(crown|cropped|low|high|peak|swept|receding|thick|parted|wavy|long|braid|tail|woman)|^topknot|^knot-nape|^bun-/), 'Separate hair masses, rear hair, front hair and tied buns in the exact reference order. Preserve openings, center partings, knot positions and historical mass arrangements. Do not join separate pieces into complete hairstyles; no faces, skin, ears, pins, jewels, crowns, shaved queues, modern bangs or salon hairstyles. Ivory hair fill with sparse charcoal carved strand curves, designed for runtime black/grey tint.', 24);
group('cloth', select(/^robe-(body|broad|slim|sloped|square|hem|sheen)|^collar-(giaolinh|twoflap|band-oxblood|placket-square|vienlinh|doikham|tuthan|baba|nguthan|yem-wrap)$|^collar-(giaolinh|twoflap|vienlinh|doikham|tuthan|baba|nguthan)-|^yem($|-)|^kesa($|-)/).filter(k => !k.includes('brocade')), 'Garment COMPONENTS ONLY, never complete people. Preserve each silhouette, crossed-lapel direction, right fastening, round or standing collar, panel opening, straps, holes and boundaries exactly. No neck, head, hands or extra cloth behind collar strips. Keep white/grey tintable components white/grey with warm-black contour; retain fixed ochre, indigo, cinnabar and cream only where already colored. Broad flat cloth, sparse fold lines; no decorative dragons, embroidery, badges, metallic highlights or invented accessories.', 24);
group('headwear', select(/^hat-(khanvan($|-)|khandong$|khanxep$|khanvuong$|dinhtu($|-)|phocdau-(short|long|grand)$|moqua($|-))/), 'Isolated Vietnamese headwrap/cap COMPONENTS only, not heads. Keep the exact original form and differences: open wound wraps distinct from closed cloth, folded cloth layers, Đinh Tự raised front and rear curve, Phốc Đầu horizontal wings at their original lengths, mỏ quạ pointed cloth. Preserve streamers only where present. No faces, hair, crowns, jewels, dragons, phoenixes, Qing queues, generic Chinese costume substitutions or new ornaments. Keep fixed dark indigo/black/brown with sparing cream carved fold lines. These are dated Vietnamese-use reconstructions, not a generic Asian hat set.');

const style = 'Vietnamese Đông Hồ woodblock print treatment matching image 2: decisive warm-black carved contour, broad flat opaque pigment shapes and a few expressive interior strokes. Clean readable craft; no photorealistic shading, no gloss, no glow, no drop shadows, no heavy grunge or speckled noise.';
const jobs = sheets.map(s => ({ ...s, reference: `${OUT}/references/${s.name}.png`, master: `${OUT}/masters/${s.name}.png`, prompt: `Use case: style-transfer. Asset type: modular Vietnamese hero portrait PNG part sheet. Image 1 is the alignment/edit target, not historical proof. Image 2 is ONLY the project's Đông Hồ drawing-style reference; do not copy its people or clothes. Redraw ONLY the components in image 1. ${style} ${s.instructions} Preserve ${s.ids.length} occupied cells in reading order, ${s.cols} columns by ${s.rows} rows, remaining cells empty. Preserve object aspect ratios and centering. At least 20 pixels transparent margin around every component, generous gutters. Landscape or portrait shape exactly matching image 1. No text, numbers, labels, grid lines, paper rectangle or checkerboard. Genuine transparent alpha background, including all holes and gaps. Output a high resolution sprite sheet. Component order: ${s.ids.join(', ')}.` }));
const write = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };
const png = (path, url) => write(path, Buffer.from(url.split(',')[1], 'base64'));
const url = (path, mime = 'image/png') => `data:${mime};base64,${readFileSync(path).toString('base64')}`;
const mode = process.argv[2] ?? 'prepare';
const chosen = process.argv.slice(3);
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  if (mode === 'prepare') {
    for (const s of jobs.filter(s => !chosen.length || chosen.includes(s.name))) {
      const sources = s.ids.map(id => ({ id, url: url(`public/faces/${id}.svg`, 'image/svg+xml') }));
      const result = await page.evaluate(async ({ sources, cols, rows }) => {
        const c = document.createElement('canvas'); c.width = cols * 320; c.height = rows * 240;
        const ctx = c.getContext('2d');
        for (let i = 0; i < sources.length; i++) {
          const im = new Image(); im.src = sources[i].url; await im.decode();
          const fit = Math.min(260 / im.width, 180 / im.height);
          ctx.drawImage(im, (i % cols + .5) * 320 - im.width * fit / 2, (Math.floor(i / cols) + .5) * 240 - im.height * fit / 2, im.width * fit, im.height * fit);
        }
        return c.toDataURL();
      }, { sources, ...s });
      png(s.reference, result);
    }
    write('docs/hero-dongho-v1-prompts.json', JSON.stringify({ generator: 'built-in ImageGen', styleReference: 'public/art/story-prints/petition-v1.webp', jobs }, null, 2) + '\n');
    console.log(jobs.map(s => `${s.name}: ${s.ids.length}`).join('\n'));
  } else if (mode === 'export' || mode === 'pack') {
    const previous = mode === 'pack' ? JSON.parse(readFileSync(`${PUBLIC}/provenance.json`, 'utf8')) : undefined;
    const generated = new Map(previous?.parts.filter(p => p.origin === 'generated').map(p => [p.id, { sheet: p.sheet, sourceBounds: p.sourceBounds }]) ?? []);
    for (const s of mode === 'export' ? jobs : []) {
      if (!existsSync(s.master)) throw new Error(`Missing reviewed master: ${s.master}`);
      const parts = await page.evaluate(async ({ data, spec, definitions }) => {
        const im = new Image(); im.src = data; await im.decode();
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0);
        const raster = ctx.getImageData(0, 0, c.width, c.height);
        const pixels = raster.data;
        let transparent = 0;
        for (let p = 3; p < pixels.length; p += 4) if (pixels[p] < 10) transparent++;
        if (transparent < c.width * c.height * .05) {
          // Production matte extraction only; generated contour/pigment are not redrawn.
          let magenta = 0;
          for (let p = 0; p < pixels.length; p += 4) if (Math.min(pixels[p], pixels[p + 2]) - pixels[p + 1] > 90) magenta++;
          if (magenta > c.width * c.height * .1) {
            for (let p = 0; p < pixels.length; p += 4) {
              const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2], excess = Math.min(r, b) - g;
              // The Đinh Tự's muted purple streamers are subject pigment, not the bright matte.
              if ((r > 150 && b > 150 && excess > 90) || (g < 65 && excess > 28)) pixels[p + 3] = 0;
            }
          } else if (['anatomy', 'beards', 'hair-1'].includes(spec.name)) {
            // These inspected masters have opaque ivory subject fills and a neutral checker
            // outside. Flood only the exterior neutral matte; preserve enclosed white fills.
            const seen = new Uint8Array(c.width * c.height), queue = new Int32Array(seen.length);
            let end = 0, at = 0;
            const push = p => {
              if (p < 0 || p >= seen.length || seen[p]) return;
              const k = p * 4, r = pixels[k], g = pixels[k + 1], b = pixels[k + 2];
              if (Math.min(r, g, b) < 175 || Math.max(r, g, b) - Math.min(r, g, b) > 16) return;
              seen[p] = 1; queue[end++] = p;
            };
            for (let x = 0; x < c.width; x++) { push(x); push((c.height - 1) * c.width + x); }
            for (let y = 0; y < c.height; y++) { push(y * c.width); push(y * c.width + c.width - 1); }
            while (at < end) {
              const p = queue[at++], x = p % c.width; pixels[p * 4 + 3] = 0;
              if (x) push(p - 1); if (x < c.width - 1) push(p + 1); push(p - c.width); push(p + c.width);
            }
          } else throw new Error(`${spec.name}: unknown background; regenerate with production matte`);
          ctx.putImageData(raster, 0, 0);
        }
        // Generated gutters drift by a few pixels. Assign each complete connected ink/pigment
        // component to its cell by centroid, so a neighboring eyebrow cannot be cut in half.
        const owners = new Int16Array(c.width * c.height).fill(-1), seen = new Uint8Array(owners.length), work = new Int32Array(owners.length);
        for (let start = 0; start < owners.length; start++) {
          if (seen[start] || pixels[start * 4 + 3] <= 16) continue;
          let at = 0, end = 1, sx = 0, sy = 0; work[0] = start; seen[start] = 1;
          while (at < end) {
            const p = work[at++], x = p % c.width, y = Math.floor(p / c.width); sx += x; sy += y;
            for (const q of [x ? p - 1 : -1, x < c.width - 1 ? p + 1 : -1, p - c.width, p + c.width]) {
              if (q >= 0 && q < owners.length && !seen[q] && pixels[q * 4 + 3] > 16) { seen[q] = 1; work[end++] = q; }
            }
          }
          if (end < 12) continue; // Isolated export specks are not portrait parts.
          const cell = Math.min(spec.rows - 1, Math.floor(sy / end / c.height * spec.rows)) * spec.cols + Math.min(spec.cols - 1, Math.floor(sx / end / c.width * spec.cols));
          for (let n = 0; n < end; n++) owners[work[n]] = cell;
        }
        return spec.ids.map((id, i) => {
          const x0 = Math.round(i % spec.cols * c.width / spec.cols), x1 = Math.round((i % spec.cols + 1) * c.width / spec.cols);
          const y0 = Math.round(Math.floor(i / spec.cols) * c.height / spec.rows), y1 = Math.round((Math.floor(i / spec.cols) + 1) * c.height / spec.rows);
          let left = x1, right = -1, top = y1, bottom = -1;
          for (let y = Math.max(0, y0 - 30); y < Math.min(c.height, y1 + 30); y++) for (let x = Math.max(0, x0 - 30); x < Math.min(c.width, x1 + 30); x++) if (owners[y * c.width + x] === i) {
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
          if (right < left || left <= 0 || right >= c.width - 1 || top <= 0 || bottom >= c.height - 1 || right - left > (x1 - x0) * 1.2 || bottom - top > (y1 - y0) * 1.2) throw new Error(`${id}: empty or clipped component (${left},${top}–${right},${bottom}; cell ${x0},${y0}–${x1},${y1})`);
          const cut = document.createElement('canvas'); cut.width = right - left + 1; cut.height = bottom - top + 1;
          const cc = cut.getContext('2d'), cp = cc.createImageData(cut.width, cut.height);
          for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            const p = y * c.width + x;
            if (owners[p] === i) cp.data.set(pixels.subarray(p * 4, p * 4 + 4), ((y - top) * cut.width + x - left) * 4);
          }
          cc.putImageData(cp, 0, 0);
          const d = definitions.find(d => d.key === id);
          const dest = document.createElement('canvas'); dest.width = Math.ceil(d.w * 3); dest.height = Math.ceil(d.h * 3);
          const dc = dest.getContext('2d'); dc.imageSmoothingQuality = 'high';
          // Tight generated bounds fit the original occupied box; original 2-unit transparent
          // padding is retained so heads, ears, collars and all saved looks keep their anchors.
          dc.drawImage(cut, 6, 6, dest.width - 12, dest.height - 12);
          return { id, png: dest.toDataURL(), sourceBounds: { left, top, right, bottom } };
        });
      }, { data: url(s.master), spec: s, definitions: defs });
      for (const p of parts) { png(`${PUBLIC}/parts/${p.id}.png`, p.png); generated.set(p.id, { sheet: s.name, sourceBounds: p.sourceBounds }); }
    }
    // Preserve the entire named wardrobe, including saved player looks, as raster compatibility
    // parts. These are deliberately NOT reported as newly generated or historically verified.
    for (const d of mode === 'export' ? defs.filter(d => !generated.has(d.key)) : []) {
      const data = await page.evaluate(async ({ src, w, h }) => {
        const im = new Image(); im.src = src; await im.decode();
        const c = document.createElement('canvas'); c.width = Math.ceil(w * 3); c.height = Math.ceil(h * 3);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL();
      }, { src: url(`public/faces/${d.key}.svg`, 'image/svg+xml'), ...d });
      png(`${PUBLIC}/parts/${d.key}.png`, data);
    }
    // Editable PNGs retain 3x detail; the shared GPU atlas only needs 2x for a 1.5x badge bake.
    const entries = defs.map(d => ({ ...d, pixelW: Math.ceil(d.w * 2), pixelH: Math.ceil(d.h * 2) })).sort((a, b) => b.pixelH - a.pixelH || a.key.localeCompare(b.key));
    let x = 2, y = 2, rowH = 0;
    for (const e of entries) {
      if (x + e.pixelW + 2 > 2048) { x = 2; y += rowH + 4; rowH = 0; }
      e.x = x; e.y = y; x += e.pixelW + 4; rowH = Math.max(rowH, e.pixelH);
    }
    const height = y + rowH + 2;
    if (height > 4096) throw new Error(`Atlas exceeds mobile texture budget: 2048x${height}`);
    const atlas = await page.evaluate(async ({ entries, height }) => {
      const c = document.createElement('canvas'); c.width = 2048; c.height = height;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      for (const e of entries) { const im = new Image(); im.src = e.url; await im.decode(); ctx.drawImage(im, e.x, e.y, e.pixelW, e.pixelH); }
      return c.toDataURL();
    }, { entries: entries.map(e => ({ ...e, url: url(`${PUBLIC}/parts/${e.key}.png`) })), height });
    png(`${PUBLIC}/atlas.png`, atlas);
    const frames = Object.fromEntries(entries.map(e => [e.key, { frame: { x: e.x, y: e.y, w: e.pixelW, h: e.pixelH }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: e.pixelW, h: e.pixelH }, sourceSize: { w: e.pixelW, h: e.pixelH } }]));
    write(`${PUBLIC}/atlas.json`, JSON.stringify({ frames, meta: { image: 'atlas.png', format: 'RGBA8888', size: { w: 2048, h: height }, scale: '1' } }, null, 2) + '\n');
    write(`${PUBLIC}/provenance.json`, JSON.stringify({ id: 'dongho-v1', generator: 'built-in ImageGen', generatedCount: generated.size, compatibilityCount: defs.length - generated.size, sourceScale: 3, atlasScale: 2, research: 'docs/research/vietnamese-portrait-research-findings.md', parts: defs.map(d => ({ id: d.key, origin: generated.has(d.key) ? 'generated' : 'legacy-raster-compatibility', ...generated.get(d.key) })) }, null, 2) + '\n');
    console.log(`${defs.length} PNG parts: ${generated.size} generated, ${defs.length - generated.size} compatibility; atlas 2048x${height}`);
  } else throw new Error(`Unknown mode: ${mode}`);
} finally { await browser.close(); }
