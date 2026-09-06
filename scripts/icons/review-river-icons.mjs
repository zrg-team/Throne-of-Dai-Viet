import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const review = join(root, 'docs/design/game-icon-v7');
const data = (path) => `data:image/png;base64,${readFileSync(join(root, path)).toString('base64')}`;
const regular = data('apps/mobile/assets/icon.png');
const adaptive = data('apps/mobile/assets/adaptive-icon.png');
const monochrome = data('apps/mobile/assets/monochrome-icon.png');
const tinted = data('apps/mobile/assets/icon-tinted.png');
const maskable = data('public/icon-maskable-512.png');
const menu = data('docs/design/game-icon-v7/game-check/shot-1.png');
const feature = data('apps/mobile/store/android/graphics/feature-graphic-1024x500.png');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Vạn Thắng — river icon pack</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f3e9;color:#2a2118;font:15px 'Segoe UI',sans-serif;padding:28px 30px;width:1120px}
h1{font-size:28px;font-weight:600;margin:0 0 8px}p{margin:0;color:#726554}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:24px;margin-top:30px}
.icon{width:184px;height:184px;position:relative;overflow:hidden;background:#f6edd7}.icon img{width:100%;height:100%;display:block}.rounded{border-radius:22%}.circle{border-radius:50%}
.adaptive img{position:absolute;width:150%;height:150%;max-width:none;left:-25%;top:-25%}.theme{background:#e0dbf3}.theme div{position:absolute;inset:0;background:#423854;mask:url('${monochrome}') center/150% 150% no-repeat}
.label{font-weight:600;margin-top:12px}.sub{font-size:12px;line-height:1.45;color:#726554;margin-top:4px}.lower{display:grid;grid-template-columns:190px 450px 1fr;gap:28px;margin-top:32px;padding-top:24px;border-top:1px solid #d8cdb7}
.menu{height:275px;display:block}.feature{width:430px;display:block;margin-top:14px}.fav{display:flex;align-items:center;gap:20px;margin-top:20px}.fav div{text-align:center}.fav span{display:block;font-size:12px;color:#726554;margin-top:8px}
.note{font-size:12px;color:#726554;margin-top:20px;line-height:1.6}
</style>
<h1>Vạn Thắng · the approved river icon</h1><p>Boat, stakes and waves — one identity across the game, stores and launchers.</p>
<div class="grid">
<div><div class="icon rounded"><img src="${regular}"></div><div class="label">iOS / App Store</div><div class="sub">Original artwork · opaque square</div></div>
<div><div class="icon circle adaptive"><img src="${adaptive}"></div><div class="label">Android</div><div class="sub">Separate foreground and background</div></div>
<div><div class="icon circle theme"><div></div></div><div class="label">Android themed</div><div class="sub">System-colored monochrome layer</div></div>
<div><div class="icon rounded"><img src="${maskable}"></div><div class="label">Web / PWA</div><div class="sub">Separate maskable artwork</div></div>
<div><div class="icon rounded"><img src="${tinted}"></div><div class="label">iOS tint source</div><div class="sub">The system applies the chosen tint</div></div>
</div>
<div class="lower">
<div><div class="label">In-game menu</div><img class="menu" src="${menu}"></div>
<div><div class="label">Store feature graphic</div><img class="feature" src="${feature}"><p class="note">The generated store screenshots also carry the river emblem.</p></div>
<div><div class="label">Browser tabs</div><div class="fav">${[48,32,16].map(size=>`<div><img width="${size}" height="${size}" src="${data(`public/favicon-${size}.png`)}"><span>${size} px</span></div>`).join('')}</div><p class="note">Square source files have no baked corner masks.<br>Rounded and circular shapes here are previews.<br>Physical-device appearance has not been tested.</p></div>
</div></html>`;
writeFileSync(join(review, 'preview.html'), html);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:1120,height:810},deviceScaleFactor:1});
  await page.setContent(html);
  await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.decode()));await document.fonts.ready;});
  await page.screenshot({path:join(review,'platform-preview.png'),fullPage:true});
} finally {await browser.close();}
console.log('Wrote platform-preview.png and self-contained preview.html');
