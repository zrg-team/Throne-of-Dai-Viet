// Visual fit, readable states, and difficulty-safe hints on both phone sizes/languages.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5182';
const OUT = 'docs/dong-ho-menu-battle';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const checks = [], errors = [];
const check = (pass, label, detail) => {
  checks.push({ pass, label, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
};
try {
  for (const language of ['vi', 'en']) for (const height of [620, 844]) {
    const tag = `${language}-${height}`;
    const page = await browser.newPage({ viewport: { width: 390, height }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errors.push(`${tag}: ${e.stack}`));
    page.on('console', e => { if (e.type() === 'error') errors.push(`${tag}: ${e.text()}`); });
    await page.addInitScript(lang => {
      localStorage.setItem('mandate:language:v1', lang);
      localStorage.setItem('mandate:graphics:v1', 'medium');
      localStorage.setItem('mandate:life:v1', JSON.stringify({ motion: 'reduced', birds: false, traffic: 'none', seasons: true }));
    }, language);
    await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/menu-${tag}.png` });
    await page.evaluate(() => {
      window.__phaserGame.scene.stop('MenuScene');
      window.__phaserGame.scene.start('BattleArenaScene');
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__phaserGame.scene.getScene('BattleArenaScene').startFight());
    await page.waitForFunction(() => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle');
    await page.waitForTimeout(700);
    const opening = await page.evaluate(() => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      return ui.battleUi.orders.list.filter(o => o.getData?.('battleMatchup')).length;
    });
    check(opening === 0, `${tag}: opening drum hides matchup hints`);
    await page.evaluate(async () => {
      const game = window.__phaserGame;
      const ui = game.scene.getScene('ConquestUIScene');
      const state = window.__mandateState;
      ui.battleOpeningTimer?.remove(); ui.battleOpeningTimer = undefined;
      ui.battleOpeningLeft = 0; ui.battleAwaitingOrder = false;
      game.scene.getScene('ConquestScene').ascentAccumulator = -1e9;
      state.isPaused = false; state.isStrategyPause = false;
      const B = await import('/src/systems/ascent/BattleSystem.ts');
      const b = state.ascent.activeBattle;
      b.steeredStance = true; b.steeredFormation = true;
      // Approach time varies with the rolled field. Reach actual contact and answer any
      // Moment before measuring the ordinary command dock that it temporarily replaces.
      for (let i = 0; i < 40 && b.round < 2 && !b.over; i++) {
        if (b.moment) B.answerBattleMoment(state, 'steady');
        B.fightRound(state);
      }
      if (b.moment) B.answerBattleMoment(state, 'steady');
      b.beats = [];
      ui.battleUi.shown = undefined;
      ui.refresh(); ui.updateBattle();
    });
    await page.waitForTimeout(900);
    const fit = await page.evaluate(() => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      const chips = Object.values(ui.battleUi.dock.chips);
      const icons = ui.battleUi.readout.list.map(o => o.getData?.('cardIcon')).filter(Boolean);
      const b = window.__mandateState.ascent.activeBattle;
      return {
        count: chips.length,
        fits: chips.every(c => {
          const a = c.bounds;
          const top = c.glyphY - 13 * c.glyphScale;
          const bottom = c.glyphY + 13 * c.glyphScale;
          return c.verb.getBounds().bottom <= top + 1 && bottom <= a.y + a.height - 12
            && c.verb.displayWidth <= a.width && c.glyphScale * 26 >= 18;
        }),
        icons,
        selected: ui.battleUi.orders.list.some(o => o.getData?.('battleSelected') === b.ourFormation),
        hints: ui.battleUi.orders.list.filter(o => o.getData?.('battleMatchup')).map(o => o.getData('battleMatchup')),
        bars: Boolean(ui.battleUi.railsBars?.commandBuffer.length),
        live: !b.over && b.round > 0 && ui.battleUi.orders.visible,
      };
    });
    check(fit.count === 5 && fit.fits, `${tag}: all five large glyphs fit between labels and state notes`, fit);
    check(fit.icons.filter(i => i === 'person').length === 2 && fit.icons.filter(i => i === 'heart').length === 2 && fit.bars,
      `${tag}: both armies show troop and morale gauges`);
    check(fit.live && fit.selected, `${tag}: a live fight has a visible current-shape checkmark`);
    check(fit.hints.length === 4 && fit.hints.some(h => h.tier > 0) && fit.hints.some(h => h.tier < 0),
      `${tag}: normal difficulty shows advantage and disadvantage`, fit.hints);
    await page.screenshot({ path: `${OUT}/battle-${tag}.png` });
    writeFileSync(`${OUT}/state-${tag}.json`, await page.evaluate(() => window.render_game_to_text()));
    const hard = await page.evaluate(async () => {
      const { setBattleDifficulty } = await import('/src/game/battleOptions.ts');
      setBattleDifficulty('hard');
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      ui.buildBattleOrders(window.__mandateState.ascent.activeBattle);
      return ui.battleUi.orders.list.filter(o => o.getData?.('battleMatchup')).length;
    });
    check(hard === 0, `${tag}: hard difficulty reveals no matchup hints`);
    await page.close();
  }
  check(errors.length === 0, 'no browser errors', errors);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/verification.json`, JSON.stringify({ checks, errors }, null, 2));
}
console.log(`${checks.filter(c => c.pass).length}/${checks.length} passed`);
if (checks.some(c => !c.pass) || errors.length) process.exitCode = 1;
