/** Render the actual exported pixels on light and dark browser-tab backgrounds. */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const review = 'docs/design/game-icon-v9';
const data = path => `data:image/png;base64,${readFileSync(path).toString('base64')}`;
const rows = ['light', 'dark'].map(theme => `<section class="${theme}">
  <h2>${theme === 'light' ? 'Light tabs' : 'Dark tabs'} · actual size</h2>
  ${['Before', 'After'].map(label => `<div class="row"><span>${label}</span><div class="tab"><img width="16" height="16" src="${data(label === 'Before' ? `${review}/before-16.png` : 'public/favicon-16.png')}"><b>Vạn Thắng — Ten Thousand Victories</b><i>×</i></div></div>`).join('')}
  <div class="sizes">${[16,32,48].map(size => `<figure><img width="${size}" height="${size}" src="${data(`public/favicon-${size}.png`)}"><figcaption>${size} px</figcaption></figure>`).join('')}</div>
</section>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Vạn Thắng favicon comparison</title><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#e9e5dd;color:#292724;font:14px 'Segoe UI',sans-serif;width:640px}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;color:#67615a}section{padding:20px 24px;border-radius:12px;margin-top:14px}h2{font-size:13px;font-weight:500;margin:0 0 16px}.light{background:#fff}.dark{background:#202124;color:#e8eaed}.row{display:flex;align-items:center;gap:20px;margin:8px 0}.row>span{width:44px;opacity:.7}.tab{display:flex;align-items:center;gap:9px;border-radius:12px 12px 0 0;background:#edf0f3;padding:12px;width:400px}.dark .tab{background:#353535}.tab img{flex:none}.tab b{font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tab i{font-style:normal;margin-left:auto}.sizes{display:flex;gap:24px;align-items:center;margin-left:64px;height:82px}figure{margin:0;text-align:center}figcaption{font-size:11px;opacity:.6;margin-top:6px}
</style><h1>The previous boat, with transparency</h1><p>Original detailed artwork without the cream square. Tab simulations.</p>${rows}</html>`;
writeFileSync(`${review}/preview.html`, html);
const browser = await chromium.launch({args:['--force-color-profile=srgb']});
try {
  const page = await browser.newPage({viewport:{width:640,height:650},deviceScaleFactor:1});
  await page.setContent(html);
  await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())); await document.fonts.ready; });
  await page.screenshot({path:`${review}/favicon-comparison.png`,fullPage:true});
} finally { await browser.close(); }
console.log('Wrote favicon comparison at actual pixel sizes');
