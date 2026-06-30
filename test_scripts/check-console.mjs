import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
const logs = [];

page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
  else logs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}\n${err.stack}`));

try {
  await page.goto('http://localhost:5173/?capture=1', { waitUntil: 'networkidle', timeout: 15000 });
} catch(e) {
  errors.push('GOTO: ' + e.message);
}
await page.waitForTimeout(3000);
await page.screenshot({ path: 'tmp-verify.png' });

console.log('=== ERRORS ===');
errors.forEach(e => console.log(e));
console.log('=== LOGS ===');
logs.slice(0, 20).forEach(l => console.log(l));
await browser.close();
