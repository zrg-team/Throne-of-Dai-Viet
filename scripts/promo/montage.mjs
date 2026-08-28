// Lays every still on one sheet so a pass over the whole film is one look, not twenty-three.
// Usage: node scripts/promo/montage.mjs [dir] [cols]
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = process.argv[2] ?? 'scripts/promo/out/stills';
const COLS = Number(process.argv[3] ?? 6);
const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
const cells = files.map((f) => {
  const b64 = readFileSync(`${DIR}/${f}`).toString('base64');
  return `<figure><img src="data:image/png;base64,${b64}"><figcaption>${(Number(f.slice(0, 4)) / 10).toFixed(1)}s</figcaption></figure>`;
}).join('');
const html = `<body style="margin:0;background:#111;font:12px monospace;color:#ddd">
<div style="display:grid;grid-template-columns:repeat(${COLS},1fr);gap:4px">
${cells.replace(/<figure>/g, '<figure style="margin:0">').replace(/<img /g, '<img style="width:100%;display:block" ')}
</div></body>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
await page.setContent(html);
await page.screenshot({ path: `${DIR}/../montage.png`, fullPage: true });
console.log(`${files.length} stills → ${DIR}/../montage.png`);
await browser.close();
