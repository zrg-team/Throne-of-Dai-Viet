const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tmp-map-overview.png' });

  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(750, 250, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tmp-map-roads.png' });

  console.log('ERRORS:', JSON.stringify(errors));
  await browser.close();
})();
