// Two moments the fight screen recorded and never reacted to.
//
// `BattleBeat.broke` has carried "the moment worth a shake" since the beat buffer was written and
// nothing read it; contact arrived at exactly the cadence of every other beat, so the most violent
// thing on the screen was also the least remarkable. This drives the real scenes and checks that
// the beat clock holds on contact and that a broken host actually turns and runs.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-battle-juice.mjs
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(700);
await page.evaluate(() => window.__phaserGame.scene.getScene('BattleArenaScene').startFight());
await page.waitForFunction(
  () => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle',
  null, { timeout: 20000 });

await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.battleAwaitingOrder = false;
  window.__mandateState.isStrategyPause = false;
  // Counted at the source rather than sampled: a 110ms hold is short enough that a polling
  // interval can walk straight past it and report a feature that is working as missing.
  window.__holds = 0;
  const orig = ui.holdBattleClock.bind(ui);
  ui.holdBattleClock = (ms) => { window.__holds += 1; return orig(ms); };
});

// Long enough for the lines to close, which is what the contact hold is keyed on.
await page.waitForTimeout(24000);
const contact = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  return { holds: window.__holds, hadContact: Boolean(ui.battleUi?.hadContact), live: Boolean(ui.battleUi) };
});

// The rout, driven directly. The arena's matchup is even by design and a balanced fight will not
// reliably break anybody inside a harness's patience — but the path it would take is testable.
const rout = await page.evaluate(async () => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  if (!ui.battleUi) return { skipped: true };
  const marked = ui.battleUi.theirMarkers[0];
  if (!marked?.marker) return { skipped: true };
  const before = { x: marked.marker.x, alpha: marked.marker.alpha, scaleX: marked.marker.scaleX };
  ui.routMarker(marked.hostId);
  await new Promise((r) => setTimeout(r, 900));
  return { skipped: false, before, after: { x: marked.marker.x, alpha: marked.marker.alpha, scaleX: marked.marker.scaleX } };
});

await browser.close();

const line = (ok, label, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${detail}`);
console.log('═══ CONTACT AND THE ROUT ═══\n');
line(contact.live, 'the fight was still on screen to measure', String(contact.live));
line(contact.hadContact, 'the lines met and the view knows it', String(contact.hadContact));
line(contact.holds > 0, 'the beat clock held when they met', `${contact.holds} hold(s)`);
line(!rout.skipped && rout.after.x > rout.before.x, 'a broken host runs off its own edge',
  rout.skipped ? 'no marker to send' : `x ${Math.round(rout.before.x)} -> ${Math.round(rout.after.x)}`);
line(!rout.skipped && rout.after.alpha < rout.before.alpha, 'and fades as it goes',
  rout.skipped ? '-' : `alpha ${rout.before.alpha.toFixed(2)} -> ${rout.after.alpha.toFixed(2)}`);
line(!rout.skipped && rout.after.scaleX !== 0, 'it turned rather than being mirrored to nothing',
  rout.skipped ? '-' : `scaleX ${rout.before.scaleX} -> ${rout.after.scaleX}`);
console.log(`\nconsole errors: ${errors.length ? errors.slice(0, 3).join(' ; ') : 'none'}`);
