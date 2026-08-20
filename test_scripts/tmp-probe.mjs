import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5211';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(1200);
const button = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  for (const child of scene.children.list) {
    const label = child.list?.find?.((k) => k.type === 'Text');
    if (label && /Sử thật|Real History/.test(label.text)) {
      const m = label.getWorldTransformMatrix();
      return { x: m.tx, y: m.ty };
    }
  }
  return null;
});
await page.mouse.click(button.x, button.y);
await page.waitForTimeout(900);

const state = () => page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('HistoryScene');
  return {
    tab: scene.tab,
    open: scene.openSection[scene.tab],
    rows: scene.scroll.content.list.filter((o) => o.getData?.('rowKey') != null).length,
    sections: scene.scroll.content.list.filter((o) => o.getData?.('sectionKey') != null).map((o) => {
      const m = o.getWorldTransformMatrix();
      return { key: o.getData('sectionKey'), x: m.tx, y: m.ty };
    }),
  };
});

// go to People
await page.mouse.click(121, 84);
await page.waitForTimeout(700);
let s = await state();
console.log('after tab:', JSON.stringify({ tab: s.tab, open: s.open, rows: s.rows, first: s.sections[0] }));

for (let i = 0; i < 3; i += 1) {
  const target = { x: s.sections[0].x + 60, y: s.sections[0].y + 12 };
  const hits = await page.evaluate((t) => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('HistoryScene');
    const list = scene.input.hitTestPointer
      ? scene.input.manager.hitTest({ x: t.x * 2, y: t.y * 2, worldX: t.x, worldY: t.y }, scene.children.list, scene.cameras.main)
      : [];
    return list.map((o) => `${o.type}:${o.parentContainer?.getData?.('sectionKey') ?? o.parentContainer?.getData?.('rowKey') ?? '?'}`);
  }, target);
  console.log('hitTest at', target, hits);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(400);
  s = await state();
  console.log(`click ${i}:`, JSON.stringify({ open: s.open, rows: s.rows, first: s.sections[0] }));
}
await b.close();
