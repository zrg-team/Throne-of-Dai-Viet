import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,300)); });
await p.goto('http://localhost:5199/?capture=1', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
console.log(JSON.stringify(await p.evaluate(() => ({ hasGame: !!window.__phaserGame, scenes: window.__phaserGame ? window.__phaserGame.scene.scenes.map(s=>[s.scene.key, s.scene.isActive()]) : null }))));
await b.close();
