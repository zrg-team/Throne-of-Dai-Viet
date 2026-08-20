import { chromium } from 'playwright';
const FILE = 'file:///' + process.argv[2].split(String.fromCharCode(92)).join('/');
const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, colorScheme: scheme });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const c = document.getElementById('gen-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 977) seen.add(`${d[i]},${d[i+1]},${d[i+2]}`);
    return {
      foot: document.getElementById('gen-foot').textContent.trim(),
      seed: document.getElementById('seedval').textContent,
      distinctColours: seen.size,
      docHeight: document.documentElement.scrollHeight,
      bodyScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  console.log(`[${scheme}]`, JSON.stringify(info));
  console.log(`[${scheme}] errors:`, errs.length ? errs.slice(0, 5) : 'none');
  await page.screenshot({ path: `output/water-probe/doc/_check-${scheme}.png`, clip: { x: 0, y: 0, width: 1100, height: 900 } });
  await page.close();
}
await browser.close();
