import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT = 'output/hero-dongho-v2/special';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 }, deviceScaleFactor: 1.5 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.DEV_URL ?? 'http://127.0.0.1:5180'}/?capture=1&heroArt=dongho-v2`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  const inventory = await page.evaluate(async () => {
    const { heroTemplates } = await import('/src/data/heroes.ts');
    const { REAL_FIGURES } = await import('/src/data/heroNames.ts');
    const { resolveHeroLook } = await import('/src/ui/faces/heroLook.ts');
    const { donghoWardrobeParts } = await import('/src/ui/faces/donghoWardrobe.ts');
    const { historicalPortraitFor } = await import('/src/ui/faces/historicalPortraits.ts');
    const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
    const { ACTIVE_HERO_FACE_ART_PACK } = await import('/src/ui/faces/artPack.ts');
    const heroes = heroTemplates.filter(h => h.id.startsWith('real-') || ['Thích Không Lộ', 'Thích Thường Chiếu'].includes(h.name));
    for (const f of REAL_FIGURES) if (!heroes.some(h => h.name === f.name)) heroes.push({ ...heroTemplates[0], ...f,
      id: 'real-' + f.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), rarity: f.tier });
    window.__specialHeroes = heroes;
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const keys = new Set(FACE_PART_DEFS.map(p => p.key));
    const texture = window.__phaserGame.textures.get(ACTIVE_HERO_FACE_ART_PACK.texture);
    const appearance = h => {
      const look = resolveHeroLook(h);
      return JSON.stringify({ ...look, rank: 0, parts: look.parts.filter(p => !/^(plate-|rank-)/.test(p.key)) });
    };
    const identities = new Map();
    for (const h of heroes) {
      const original = JSON.stringify(h), profile = historicalPortraitFor(h), look = resolveHeroLook(h);
      check(profile, `Unreviewed special hero: ${h.name}`);
      check(look.parts.every(p => keys.has(p.key) && texture.has(p.key)), `Missing art: ${h.name}`);
      check(look.parts.filter(p => /^(collar-|robe-armour|kesa)/.test(p.key)).length === 1, `Incomplete clothing: ${h.name}`);
      check(!look.parts.some(p => /^(badge-|mark-(?!age$)|scalp-|earring-|sash-|belt-)/.test(p.key)), `Unsupported accessory: ${h.name}`);
      if (look.monastic) check(!look.parts.some(p => /^(hat-|hair|bun-|beard-|topknot)/.test(p.key)), `Monastic identity: ${h.name}`);
      if (look.age === 'young') check(!look.parts.some(p => /^(beard-|mark-age)/.test(p.key)), `Life stage: ${h.name}`);
      if (look.sex === 'woman') check(!look.parts.some(p => p.key.startsWith('beard-')), `Facial hair: ${h.name}`);
      for (const rarity of ['Common', 'Rare', 'Epic', 'Legendary'])
        check(appearance(h) === appearance({ ...h, id: 'summon-copy', rarity, type: 'agent' }), `Rarity/role changed identity: ${h.name}`);
      const identity = `${profile.identity}:${profile.monastic}`;
      if (identities.has(identity)) check(identities.get(identity) === appearance(h), `Alias changed identity: ${h.name}`);
      identities.set(identity, appearance(h));
      check(JSON.stringify(h) === original, `Source hero changed: ${h.name}`);
    }
    for (const [name, era] of [['Lê Quý Đôn', 'le'], ['Đoàn Thị Điểm', 'le'], ['Thích Thường Chiếu', 'ly']])
      check(resolveHeroLook(heroes.find(h => h.name === name)).era === era, `Period regression: ${name}`);
    for (const name of ['Trần Quốc Toản', 'Lê Ngọc Hân']) check(resolveHeroLook(heroes.find(h => h.name === name)).age === 'young', `Youth regression: ${name}`);
    for (const name of ['Lý Thường Kiệt', 'Lê Văn Duyệt']) check(!resolveHeroLook(heroes.find(h => h.name === name)).parts.some(p => p.key.startsWith('beard-')), `Beard regression: ${name}`);
    const tran = heroes.find(h => h.name === 'Trần Nhân Tông');
    check(!resolveHeroLook({ ...tran, monastic: false }).monastic && resolveHeroLook({ ...tran, monastic: true }).monastic, 'Lost Trần Nhân Tông life phase');
    check(!historicalPortraitFor({ ...tran, id: 'king' }), 'Player identity overridden');
    check(!historicalPortraitFor({ ...tran, name: 'A fictional hero' }), 'Generic hero overridden');
    return heroes.map(h => ({ id: h.id, name: h.name, era: h.era, type: h.type, sex: h.sex, monastic: h.monastic ?? false,
      profile: historicalPortraitFor(h),
      look: { ...resolveHeroLook(h), parts: donghoWardrobeParts(resolveHeroLook(h)) } }));
  });
  const stage = process.env.SPECIAL_STAGE ?? 'after';
  writeFileSync(`${OUT}/${stage}-inventory.json`, JSON.stringify(inventory, null, 2));
  assert.equal(inventory.length, 143, 'Update the documented review count when the historical catalogue changes');
  const rows = inventory.map(h => `| ${h.name} | ${h.profile.identity} | ${h.profile.era} | ${h.profile.age}${h.profile.monastic ? ', monastic' : ''} | ${h.profile.hat || 'bare head'} / ${h.profile.garment} | ${h.profile.evidence} | ${h.profile.note} |`);
  writeFileSync('docs/research/special-hero-portrait-inventory.md', '# Special-hero portrait inventory\n\nGenerated by `npm run verify:special-heroes`. All 143 entries receive a reviewed period/role policy; this is not 143 authenticated likenesses. See [research and evidence limits](special-hero-portraits.md).\n\n| Entry | Canonical identity | Software era | Life stage | Headwear / garment | Evidence level | Interpretation / limit |\n|---|---|---|---|---|---|---|\n' + rows.join('\n') + '\n');
  for (let offset = 0; offset < inventory.length; offset += 20) {
    await page.evaluate(async offset => {
      const { renderHeroFaceInBox } = await import('/src/ui/FaceRenderer.ts');
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      scene.children.removeAll(true); scene.cameras.main.setZoom(1).setScroll(0, 0);
      const width = scene.cameras.main.width, height = scene.cameras.main.height;
      scene.add.rectangle(width / 2, height / 2, width, height, 0xf0e7cf);
      window.__specialHeroes.slice(offset, offset + 20).forEach((h, i) => {
        const cw = width / 5, ch = height / 4;
        renderHeroFaceInBox(scene, h, { x: i % 5 * cw + 4, y: Math.floor(i / 5) * ch + 5, width: cw - 8, height: ch - 30 });
        scene.add.text((i % 5 + .5) * cw, (Math.floor(i / 5) + 1) * ch - 23, h.name,
          { fontSize: `${Math.max(10, width / 92)}px`, color: '#382b21', fontFamily: 'serif', align: 'center', wordWrap: { width: cw - 4 } }).setOrigin(.5, 0);
      });
    }, offset);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/${stage}-${Math.floor(offset / 20) + 1}.png` });
  }
  const portraits = await page.evaluate(async () => {
    const { heroFaceTextureKey } = await import('/src/ui/FaceRenderer.ts');
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    const images = [];
    for (const h of window.__specialHeroes) {
      const texture = scene.textures.get(heroFaceTextureKey(scene, h));
      images.push(await new Promise(resolve => texture.snapshot(image => resolve(image.src))));
    }
    return images;
  });
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const eras = { dinh: 'Early / Đinh – Tiền Lê', ly: 'Lý', tran: 'Trần – Hồ', le: 'Lê – Mạc – Trịnh', tayson: 'Tây Sơn', nguyen: 'Nguyễn' };
  const cards = inventory.map((h, i) => `<article data-era="${h.profile.era}" data-name="${escape(h.name)}"><img src="${portraits[i]}" alt="${escape(h.name)}"><h2>${escape(h.name)}</h2><p>${eras[h.profile.era]}</p><details><summary>Portrait notes</summary><p>${escape(h.profile.note)}</p><small>${escape(h.profile.evidence)}</small></details></article>`).join('');
  writeFileSync(`${OUT}/gallery.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Special heroes · Đông Hồ portrait review</title><style>
    *{box-sizing:border-box}body{margin:0;padding:32px;background:#f0e7cf;color:#382b21;font:16px Arial,sans-serif}header{max-width:900px;margin:0 auto 28px}h1{font-size:32px;margin:0 0 12px}header p{line-height:1.6}nav{display:flex;gap:12px;flex-wrap:wrap}input,select{font:inherit;padding:12px;border:1px solid #857355;background:#faf5e6;color:inherit;border-radius:4px}input{flex:1;min-width:210px}#count{align-self:center}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:24px;max-width:1400px;margin:auto}article{min-width:0;text-align:center}article[hidden]{display:none}img{width:100%;max-width:240px;height:270px;object-fit:contain}h2{font-size:18px;margin:6px 0}article p{font-size:14px}details{font-size:14px;text-align:left;padding:8px 12px;background:#e6dcc1;border-radius:3px;line-height:1.5}summary{cursor:pointer}small{color:#695942}
    </style><header><h1>Special heroes · Đông Hồ</h1><p>143 game entries, including alternate titles. Vietnamese period dress, deliberate life stages and consistent faces. These are artistic interpretations; notes identify the stronger portrait references and the limits of the evidence.</p><nav><input id="search" aria-label="Search heroes" placeholder="Find a hero…"><select id="era" aria-label="Filter period"><option value="">All periods</option>${Object.entries(eras).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select><span id="count">143 portraits</span></nav></header><main>${cards}</main><script>
    const normalize=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
    function filter(){let count=0;for(const card of document.querySelectorAll('article')){card.hidden=!(normalize(card.dataset.name).includes(normalize(document.querySelector('#search').value))&&(!document.querySelector('#era').value||card.dataset.era===document.querySelector('#era').value));if(!card.hidden)count++}document.querySelector('#count').textContent=count+' portraits'}document.querySelector('#search').oninput=filter;document.querySelector('#era').onchange=filter;
    </script></html>`);
  await page.goto(new URL(`../../${OUT}/gallery.html`, import.meta.url).href);
  assert.equal(await page.locator('article').count(), 143);
  await page.locator('#search').fill('le quy don');
  assert.equal(await page.locator('article:visible').count(), 1);
  await page.locator('article:visible summary').click();
  assert.equal(await page.locator('article:visible details').getAttribute('open'), '');
  await page.locator('article:visible summary').click();
  await page.locator('#search').fill('');
  await page.locator('#era').selectOption('nguyen');
  assert.equal(await page.locator('article:visible').count(), inventory.filter(h => h.profile.era === 'nguyen').length);
  await page.locator('#era').selectOption('');
  assert.equal(await page.locator('article img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), true);
  await page.screenshot({ path: `${OUT}/gallery-preview.png` });
  assert.deepEqual(errors, []);
  console.log(`Reviewed inventory and screenshots: ${inventory.length} special-hero entries.`);
} finally { await browser.close(); }
