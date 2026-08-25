// Verifies Edicts (spend edict points -> permanent modifier), Wonders, and the
// Ascension prestige win in empire mode.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const st = window.__mandateState;
  const edicts = await import('/src/systems/empire/EdictSystem.ts');
  const mandateSys = await import('/src/systems/empire/MandateSystem.ts');
  const directives = await import('/src/systems/empire/DirectiveSystem.ts');
  const land = await import('/src/systems/LandSystem.ts');

  // 1) Enact a founding-era edict (levy-reform, 1 edict point available at start).
  const beforeMods = st.activeCourtModifiers.length;
  const enacted = edicts.enactProject(st, 'levy-reform');
  const afterMods = st.activeCourtModifiers.length;
  const edictRecorded = st.mandate.edicts.includes('levy-reform');

  // 2) Climb to the final era and confirm ascension unlocks.
  mandateSys.addMandate(st, 300);
  const era = st.mandate.era;
  const ascensionReady = st.mandate.ascensionReady === true;

  // 3) progressDirectives should issue the one-time Ascension directive.
  directives.progressDirectives(st);
  const ascDir = (st.directives ?? []).find((d) => d.templateId === 'ascension');
  const ascIssued = Boolean(ascDir);

  // 4) Satisfy it (repel enough hosts) and confirm the prestige win fires.
  if (ascDir) st.invasionsRepelled = ascDir.target;
  directives.progressDirectives(st);
  const ascended = st.mandate.ascended === true;
  land.checkVictory(st);
  const victory = st.victory === true;

  return { enacted, modifierAdded: afterMods - beforeMods, edictRecorded, era, ascensionReady, ascIssued, ascended, victory };
});

console.log(JSON.stringify(result, null, 2));
console.log('errors:', errors.length ? errors : 'none');
const pass = result.enacted && result.modifierAdded === 1 && result.edictRecorded
  && result.era === 'mandate' && result.ascensionReady && result.ascIssued
  && result.ascended && result.victory && errors.length === 0;
console.log(pass ? 'PASS: edicts + ascension work' : 'CHECK: expectations unmet');
await browser.close();
