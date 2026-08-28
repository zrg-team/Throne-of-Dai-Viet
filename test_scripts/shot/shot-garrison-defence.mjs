/**
 * The sheet a province defending itself puts up (Throne of Empires).
 *
 * Empire mode never raised a `pendingBattle` without a field host on the tile, so this screen has
 * never been seen with `garrisonOnly` set. Drives a real run to that state and shoots it, because
 * the words on the other three cards ("let the general decide", "withdraw the host") describe an
 * army that is not there.
 *
 * Usage: node test_scripts/shot/shot-garrison-defence.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5199';
mkdirSync('output/web-game', { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 40000 });
await page.waitForTimeout(600);

// Stand a wave next to a province the realm holds and no host is standing on, then tick once.
const staged = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  const st = scene.state;
  const Inv = await import('/src/systems/empire/InvasionSystem.ts');
  const RT = await import('/src/systems/RealtimeSystem.ts');
  const PID = 'dai-viet';

  // Give the realm a second province with a real watch, and put a host on its doorstep.
  // Four provinces, so `chooseTarget`'s frontier rule applies (under three, a war host marches
  // at the seat, where the walls and the army are).
  const seat = st.lands.find((l) => l.ownerId === PID && l.type === 'castle');
  const claimed = [];
  for (const id of seat.neighbors) {
    const l = st.lands.find((x) => x.id === id);
    if (l && l.ownerId === 'neutral' && claimed.length < 3) {
      l.ownerId = PID; l.localSoldiers = 60; l.loyalty = 85; claimed.push(l);
    }
  }
  const target = claimed[0];
  const stage = st.lands.find((l) => l.ownerId === 'neutral' && target.neighbors.includes(l.id));

  const kingdom = st.kingdoms.find((k) => k.id !== PID && !k.isDefeated);
  st.invasions ??= [];
  st.armies.push({
    id: 'shot-host', kingdomId: kingdom.id, name: `${kingdom.name} War Host`, landId: stage.id,
    units: { spearmen: 260, archers: 120, heavyInfantry: 52 },
    morale: 85, supply: 90, rations: 350, provisions: 250,
    level: 2, experience: 0, experienceToNextLevel: 160,
  });
  st.invasions.push({ armyId: 'shot-host', kingdomId: kingdom.id, intent: 'conquest', mustered: 432, targetLandId: target.id });

  Inv.tickInvasions(st);
  scene.refresh();
  return {
    raised: !!st.pendingBattle,
    garrisonOnly: st.pendingBattle?.garrisonOnly === true,
    militia: st.pendingBattle?.militia,
    land: st.pendingBattle?.landName,
    att: st.pendingBattle?.attackerPower,
    def: st.pendingBattle?.defenderPower,
    lands: st.lands.filter((l) => l.ownerId === PID).length,
    hostAt: st.armies.find((a) => a.id === 'shot-host')?.landId,
    stagedAt: stage.id, targetAt: target.id,
    adjacent: stage.neighbors.includes(target.id),
    ourArmies: st.armies.filter((a) => a.kingdomId === PID).length,
  };
});

// Open the sheet the way the header badge does.
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('UIScene');
  ui.openModal('battle-decision');
  ui.refresh();
});
await page.waitForTimeout(500);
const canvas = await page.locator('canvas').boundingBox();
await page.screenshot({ path: 'output/web-game/garrison-defence.png', clip: canvas });

// And the other half of the sheet: the same screen with a host of ours on the tile, which must
// still read as "charge / let the general decide / withdraw the host".
const withHost = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  const st = scene.state;
  const Inv = await import('/src/systems/empire/InvasionSystem.ts');
  const PID = 'dai-viet';
  st.pendingBattle = undefined;
  st.isPaused = false;
  const target = st.lands.find((l) => l.id === 'district-01');
  st.armies.push({
    id: 'shot-ours', kingdomId: PID, name: '1 Army', landId: target.id,
    units: { spearmen: 300, archers: 140, heavyInfantry: 60 },
    morale: 82, supply: 88, rations: 400, provisions: 300,
    level: 2, experience: 0, experienceToNextLevel: 160,
  });
  const record = st.invasions.find((r) => r.armyId === 'shot-host');
  if (record) record.regroupUntil = undefined;
  Inv.tickInvasions(st);
  scene.refresh();
  return { raised: !!st.pendingBattle, garrisonOnly: st.pendingBattle?.garrisonOnly === true };
});
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('UIScene');
  ui.openModal('battle-decision');
  ui.refresh();
});
await page.waitForTimeout(400);
const canvas2 = await page.locator('canvas').boundingBox();
await page.screenshot({ path: 'output/web-game/field-defence.png', clip: canvas2 });

await browser.close();
console.log(JSON.stringify({ garrison: staged, withHost }, null, 2));
console.log(errors.length ? `console errors: ${errors.slice(0, 3).join(' | ')}` : 'no console errors');
console.log('shot: output/web-game/garrison-defence.png');
