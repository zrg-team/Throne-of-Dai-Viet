/**
 * A button acts on the press, not on the release.
 *
 * Reported: *click hold look bad, please make it faster and almost touch.* Waiting for the release
 * is a whole gesture of latency on a phone — the finger lands, the ink darkens, and nothing happens
 * until it lifts, which reads as a control that has to be held down. Measured against the branch
 * point, where a press held for a quarter of a second left the menu on `main` and only the release
 * moved it.
 *
 * The second check is the one that keeps it honest: firing on the press must not *also* fire on the
 * release, or every button in the game would act twice.
 *
 * `InkUI.button` is chrome — footers, cards, the action bar. Rows inside a scrolling list keep
 * their own `pointerup` handler and the `scrollGestureConsumedTap` guard (`laneList.addRow`), which
 * is the right rule for something you scroll past; `verify-tap-after-scroll` covers that half.
 *
 * Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-button-press.mjs
 */
import { chromium } from 'playwright';
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await p.waitForTimeout(1400);

const rect = await p.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').tourTargets?.classic ?? null);
const modeNow = () => p.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').mode);
console.log('button rect:', JSON.stringify(rect), 'mode before:', await modeNow());

// Press and HOLD — no release.
await p.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
await p.mouse.down();
await p.waitForTimeout(250);
const whileHeld = await modeNow();
await p.mouse.up();
await p.waitForTimeout(300);
const afterRelease = await modeNow();

console.log('mode while still held:', whileHeld);
console.log('mode after release:  ', afterRelease);
console.log(whileHeld === 'classic' ? 'ok   the press alone acted' : 'FAIL the press did nothing until release');
console.log(afterRelease === 'classic' ? 'ok   and the release did not fire it a second time' : 'FAIL release changed it again -> ' + afterRelease);
console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
await b.close();
const ok = whileHeld === 'classic' && afterRelease === 'classic' && errors.length === 0;
console.log(ok ? 'PASS: the press acts, and acts once' : 'FAIL: see above');
process.exit(ok ? 0 : 1);
