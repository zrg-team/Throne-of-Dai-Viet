import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5180';
const OUT = 'output/hero-dongho-v2/fit';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/?capture=1&heroArt=dongho-v2`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  for (const head of ['head-oval', 'head-slim', 'head-full']) {
    const report = await page.evaluate(async head => {
      const { buildKingLook, rollKingChoice } = await import('/src/ui/faces/kingLook.ts');
      const { renderLookInBox } = await import('/src/ui/FaceRenderer.ts');
      const { heroFaceHeadwearSupported } = await import('/src/ui/faces/artPack.ts');
      const { default: defs } = await import('/src/ui/faces/dongho-v2.defs.json');
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      scene.children.removeAll(true); scene.cameras.main.setZoom(1).setScroll(0, 0);
      const width = scene.cameras.main.width, height = scene.cameras.main.height;
      scene.add.rectangle(width / 2, height / 2, width, height, 0xf0e7cf);
      const hats = defs.filter(d => d.key.startsWith('hat-') && heroFaceHeadwearSupported(d.key));
      const base = buildKingLook({ ...rollKingChoice(() => .7), sex: 'man', era: 'le', age: 'prime' }, 2);
      const parts = base.parts.filter(p => !/^(head-|hat-|hair-|topknot|bun-|knot-|beard-|sash-)/.test(p.key));
      hats.forEach((hat, i) => {
        const cw = width / 7, ch = height / Math.ceil(hats.length / 7);
        const look = { ...base, parts: [...parts, { key: head, tint: 'skin' }, { key: 'hair-crown', tint: 'hair' }, { key: 'topknot', tint: 'hair' }, { key: hat.key, tint: 'none' }, { key: 'sash-baldric', tint: 'none' }] };
        renderLookInBox(scene, look, { x: i % 7 * cw + 3, y: Math.floor(i / 7) * ch, width: cw - 6, height: ch - 18 });
        scene.add.text((i % 7 + .5) * cw, (Math.floor(i / 7) + 1) * ch - 17, hat.key.replace('hat-', ''), { fontSize: '11px', color: '#382b21' }).setOrigin(.5, 0);
      });
      return { head, hats: hats.length };
    }, head);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/${process.env.FIT_STAGE ?? 'after'}-${head}.png` });
    writeFileSync(`${OUT}/${head}.json`, JSON.stringify(report, null, 2));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/?capture=1&heroArt=dongho-v2`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  const creator = await page.evaluate(async () => {
    const { grantDeed } = await import('/src/state/cabinet.ts');
    grantDeed('wave-ten'); grantDeed('first-jade'); // Isolated test browser only.
    const { buildKingLook, rollKingChoice, KING_ERAS, kingHatPool, kingHairPool } = await import('/src/ui/faces/kingLook.ts');
    const { donghoWardrobeParts } = await import('/src/ui/faces/donghoWardrobe.ts');
    const { default: defs } = await import('/src/ui/faces/dongho-v2.defs.json');
    const keys = new Set(defs.map(d => d.key)), samples = {};
    let combinations = 0;
    for (const rank of [0, 3]) for (const era of KING_ERAS) for (const sex of ['man', 'woman'])
      for (const age of ['young', 'prime', 'elder']) for (const register of ['court', 'war']) {
        const choice = { ...rollKingChoice(() => .7), era, sex, age, register };
        const hats = kingHatPool(choice, rank);
        for (let hat = 0; hat < hats.length; hat++) for (let hair = 0; hair < kingHairPool(choice, hats[hat]).length; hair++)
          for (let face = 0; face < 24; face++) {
            const selected = { ...choice, hat, hair, face, dress: face % 8 };
            const look = buildKingLook(selected, rank), saved = JSON.stringify(look), visible = donghoWardrobeParts(look);
            if (JSON.stringify(look) !== saved || visible.some(p => !keys.has(p.key))) throw new Error('Invalid creator parts');
            const cap = visible.find(p => p.key.startsWith('hat-'))?.key;
            if (cap && !/^hat-(khanvan(?:-|$)|band(?:-|$))/.test(cap)
              && visible.some(p => /^(topknot|bun-(?!nape|side))/.test(p.key))) throw new Error(`Exposed crown bun ${cap}`);
            if (visible.some(p => p.key.startsWith('sash-')) && visible.some(p => p.key.startsWith('belt-'))) throw new Error('Stacked waist fasteners');
            if (rank === 0 && age === 'prime') {
              if (sex === 'man' && cap === 'hat-khanvan') samples.wrap ??= selected;
              if (sex === 'man' && cap === 'hat-helm-plume' && look.parts.some(p => p.key === 'head-broad')) samples.helmet ??= selected;
              if (sex === 'woman' && cap === 'hat-moqua' && look.parts.some(p => p.key === 'head-fine')) samples.kerchief ??= selected;
            }
            combinations++;
          }
      }
    return { combinations, samples };
  });
  writeFileSync(`${OUT}/creator-checks.json`, JSON.stringify(creator, null, 2));
  assert.equal(Object.keys(creator.samples).length, 3, `Missing screenshot fixtures: ${Object.keys(creator.samples)}`);
  for (const [name, choice] of Object.entries(creator.samples)) {
    await page.evaluate(async choice => {
      const { CoronationSheet } = await import('/src/ui/coronation/CoronationSheet.ts');
      const { InkUI } = await import('/src/ui/InkUI.ts');
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      scene.children.removeAll(true); scene.cameras.main.setZoom(1).setScroll(0, 0);
      const width = scene.cameras.main.width, height = scene.cameras.main.height;
      scene.add.rectangle(width / 2, height / 2, width, height, 0xf0e7cf);
      const body = scene.add.container(12 * width / 360, 12 * width / 360).setScale(width / 360);
      const sheet = new CoronationSheet({ scene, ui: new InkUI(scene), mode: 'temple', finish() {}, redraw() {
        body.removeAll(true); sheet.draw(body, 336);
      } });
      sheet.choice = choice; sheet.draw(body, 336);
      window.__fitSheet = sheet; window.__fitBody = body;
    }, choice);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/creator-${name}.png` });
    // Exercise the real grid selection handler, then ensure returning to the
    // creator redraws the selected face without altering the stored look.
    await page.evaluate(() => {
      const sheet = window.__fitSheet, body = window.__fitBody;
      sheet.grid = 'face'; body.removeAll(true); sheet.draw(body, 336);
      const zones = body.list.filter(o => o.type === 'Zone');
      if (zones.length !== 24) throw new Error('Missing creator face choices');
      zones[23].emit('pointerup', { downX: 0, downY: 0, x: 0, y: 0 });
      if (sheet.choice.face !== 23 || sheet.grid !== undefined) throw new Error('Face selection did not apply');
    });
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${OUT}/creator-checks.json`, JSON.stringify(creator, null, 2));
  console.log(`PASS: ${creator.combinations} creator combinations; three actual creator screens and face-grid selection; no browser errors.`);
} finally { await browser.close(); }
