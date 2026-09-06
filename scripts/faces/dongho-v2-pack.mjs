// ImageGen draws the masters. This script only prepares alignment references, cuts PNGs,
// resizes them into the existing design space and packs the runtime atlas. No image API.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { OUT, PUBLIC, definitions as defs, JOBS as jobs, wardrobe } from './dongho-v2-jobs.mjs';
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
    write('docs/hero-dongho-v2-prompts.json', JSON.stringify({ generator: 'built-in ImageGen', styleReference: 'public/art/story-prints/petition-v1.webp', jobs }, null, 2) + '\n');
    console.log(jobs.map(s => `${s.name}: ${s.ids.length}`).join('\n'));
  } else if (mode === 'export' || mode === 'pack') {
    const inherited = JSON.parse(readFileSync('public/faces-dongho-v1/provenance.json', 'utf8'));
    const previous = mode === 'pack' ? JSON.parse(readFileSync(`${PUBLIC}/provenance.json`, 'utf8')) : inherited;
    const generated = new Map(previous.parts.filter(p => p.origin === 'generated' && (mode === 'pack' || !wardrobe.includes(p.id))).map(p => [p.id, { sheet: p.sheet, sourceBounds: p.sourceBounds, sourcePack: p.sourcePack ?? 'dongho-v1' }]));
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
          if (spec.name === 'jewellery') {
            // This reviewed master includes a connected sheet grid. It spans all four
            // outer edges and is isolated from the artwork; discard that export furniture.
            let l = c.width, r = 0, t = c.height, b = 0;
            for (let n = 0; n < end; n++) { const x = work[n] % c.width, y = Math.floor(work[n] / c.width); l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }
            if (l <= 1 && r >= c.width - 2 && t <= 1 && b >= c.height - 2) continue;
          }
          const cell = Math.min(spec.rows - 1, Math.floor(sy / end / c.height * spec.rows)) * spec.cols + Math.min(spec.cols - 1, Math.floor(sx / end / c.width * spec.cols));
          for (let n = 0; n < end; n++) owners[work[n]] = cell;
        }
        return spec.ids.map((id, index) => {
          // Reviewed sheet has one surplus decorative wrap in cell 11. Skip that cell;
          // the remaining six components must keep their correct saved IDs.
          const i = spec.name === 'hats-bands' && index >= 11 ? index + 1 : index;
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
          if (id.startsWith('earring-')) {
            // Keep each earring's aspect ratio independently. Stretching the combined pair
            // turns circular studs into ovals when the source's pair spacing changes.
            for (const side of [0, 1]) {
              const half = Math.floor(cut.width / 2), lo = side ? half : 0, hi = side ? cut.width : half;
              let l = hi, r = -1, t = cut.height, b = -1;
              for (let y = 0; y < cut.height; y++) for (let x = lo; x < hi; x++) if (cp.data[(y * cut.width + x) * 4 + 3] > 16) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }
              if (r < l) throw new Error(`${id}: missing earring ${side}`);
              const h = dest.height - 12, w = h * (r - l + 1) / (b - t + 1);
              dc.drawImage(cut, l, t, r - l + 1, b - t + 1, side ? dest.width - 6 - w : 6, 6, w, h);
            }
          } else dc.drawImage(cut, 6, 6, dest.width - 12, dest.height - 12);
          // Resampling can mix a few antialiased matte-edge pixels back into visible pink.
          const final = dc.getImageData(0, 0, dest.width, dest.height);
          for (let p = 0; p < final.data.length; p += 4) {
            const r = final.data[p], g = final.data[p + 1], b = final.data[p + 2];
            if (r > 140 && b > 140 && Math.min(r, b) - g > 80) final.data[p + 3] = 0;
          }
          dc.putImageData(final, 0, 0);
          return { id, png: dest.toDataURL(), sourceBounds: { left, top, right, bottom } };
        });
      }, { data: url(s.master), spec: s, definitions: defs });
      for (const p of parts) { png(`${PUBLIC}/parts/${p.id}.png`, p.png); generated.set(p.id, { sheet: s.name, sourceBounds: p.sourceBounds, sourcePack: 'dongho-v2' }); }
    }
    // Faces and hair were accepted in v1. Inherit their exact PNG bytes; every wardrobe
    // resource must come from a reviewed v2 master. No SVG conversion fills a wardrobe gap.
    for (const d of mode === 'export' ? defs.filter(d => !wardrobe.includes(d.key)) : []) {
      mkdirSync(`${PUBLIC}/parts`, { recursive: true });
      copyFileSync(`public/faces-dongho-v1/parts/${d.key}.png`, `${PUBLIC}/parts/${d.key}.png`);
    }
    for (const id of wardrobe) if (generated.get(id)?.sourcePack !== 'dongho-v2') throw new Error(`Wardrobe was not regenerated: ${id}`);
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
    write('src/ui/faces/dongho-v2.defs.json', JSON.stringify(defs, null, 2) + '\n');
    write(`${PUBLIC}/provenance.json`, JSON.stringify({ id: 'dongho-v2', generator: 'built-in ImageGen', wardrobeCount: wardrobe.length, generatedCount: generated.size, compatibilityCount: defs.length - generated.size, sourceScale: 3, atlasScale: 2, research: 'docs/research/vietnamese-wardrobe-v2.md', parts: defs.map(d => ({ id: d.key, origin: generated.has(d.key) ? 'generated' : 'legacy-raster-compatibility', ...generated.get(d.key) })) }, null, 2) + '\n');
    console.log(`${defs.length} PNG parts: ${generated.size} generated, ${defs.length - generated.size} compatibility; atlas 2048x${height}`);
  } else throw new Error(`Unknown mode: ${mode}`);
} finally { await browser.close(); }

