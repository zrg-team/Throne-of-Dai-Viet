/**
 * The chrome around a run, none of it gameplay: the ☰ sheet (leave, the two delegation
 * switches, save-and-exit, exit), the Codex over the whole `heroTemplates` roster, and a quit
 * confirm that nothing currently calls.
 *
 * These open outside `openLane`, so each captures `lanePauseBeforeOpen` and holds the clock by
 * hand before `beginOverlay`, then closes through `closeLane` to hand it back. The two
 * delegation rows state their current setting in their own label, so a toggle has to redraw —
 * they do it by closing the overlay and re-entering `showSystemMenu`, which is what tears the
 * old page down.
 */
import { codexProgress, getCodex } from '../../../state/codex';
import { tierForHero } from '../../../systems/ascent/SummonSystem';
import { INK_UI } from '../../../ui/InkUI';
import { heroTemplates } from '../../../data/heroes';
import { heroName, heroTypeLabel, rarityLabel, t } from '../../../i18n';
import { LANE_FOOTER_HEIGHT, RARITY_COLOR } from '../constants';
import type { ConquestUIScene } from '../../ConquestUIScene';


// ── Persistent controls ───────────────────────────────────────────────────
//
// Pause, Codex and Leave used to be three small floating buttons in the bottom-right
// corner. They now live on the shared `ActionBar` alongside the three system lanes, so
// this mode has the same standing bottom bar as the classic ones — and, critically, the
// player always has somewhere to *go* rather than only cards to answer.

/**
 * Save and leave, and nothing else.
 *
 * This mode had none of it. The Pause button toggled `isStrategyPause` and nothing else, so a
 * run could be halted but never *left* — there was no way to save and exit at all, and closing
 * the tab lost the run outright. The classic modes have offered exactly these three choices
 * from `UIScene` since the beginning; ascent simply never surfaced them, and `ui:exit-to-menu`
 * (handled in `MapScene`, which `ConquestScene` extends) already does the work.
 *
 * Then the fix overcorrected: those choices were put *behind* the Pause button, so the one
 * control labelled Pause/Resume opened a sheet whose other two options ended the run, and
 * stopping the clock to think meant staring at an exit menu. The two jobs are two buttons
 * now — ❚❚ stops time, ☰ opens this — and this sheet's own first item only closes itself.
 *
 * `saveSnapshot` round-trips this mode: `MenuScene` boots a saved `gameMode === 'ascent'`
 * straight back into `ConquestScene`.
 */
export function showSystemMenu(self: ConquestUIScene): void {
  // Reading the world while it moves is not what a menu is for, so it holds the clock — and
  // hands back whatever the player had set when it closes, rather than always resuming.
  self.lanePauseBeforeOpen = self.state.isStrategyPause;
  self.state.isStrategyPause = true;
  self.beginOverlay('menu');

  const content = self.promptFrame(t('ascent.sys.title'), t('ascent.sys.body', {
    year: self.state.year,
    waves: self.state.ascent?.wavesSurvived ?? 0,
  }));

  const rowH = 52;
  let y = content.y;
  const item = (label: string, variant: 'primary' | 'secondary' | 'danger', onTap: () => void): void => {
    self.modalLayer.add(self.ui.button(
      { x: content.x, y, width: content.width, height: rowH },
      label, onTap, { variant, fontSize: '14px' },
    ));
    y += rowH + 10;
  };

  item(t('ascent.sys.back'), 'primary', () => self.closeLane());

  // Battles: watched, or left to the generals.
  //
  // Choosing "leave it to my generals" on the battle screen used to be permanent — nothing
  // anywhere set `autoResolveBattles` back to false, so one tap during one fight silently
  // disabled the best screen in the mode for the rest of the run, with no way to tell that had
  // happened or to undo it. A setting the player can see is also a setting they can reverse.
  const auto = self.state.ascent?.autoResolveBattles ?? false;
  item(
    auto ? t('ascent.sys.battlesAuto') : t('ascent.sys.battlesWatched'),
    'secondary',
    () => {
      if (self.state.ascent) self.state.ascent.autoResolveBattles = !auto;
      // Redraw so the row states the new setting rather than the old one.
      self.state.isStrategyPause = self.lanePauseBeforeOpen;
      self.closeOverlay();
      showSystemMenu(self);
    },
  );

  // Musters: asked about, or left to the generals. Asking is the default — a host is a fifth of
  // the population and a commander off a seat, and it used to appear unannounced.
  const silent = self.state.ascent?.autoMusterSilently ?? false;
  item(
    silent ? t('ascent.sys.musterSilent') : t('ascent.sys.musterAsked'),
    'secondary',
    () => {
      if (self.state.ascent) self.state.ascent.autoMusterSilently = !silent;
      self.state.isStrategyPause = self.lanePauseBeforeOpen;
      self.closeOverlay();
      showSystemMenu(self);
    },
  );

  item(t('action.saveAndExit'), 'secondary', () => self.events.emit('ui:exit-to-menu', true));
  item(t('action.exitWithoutSaving'), 'danger', () => self.events.emit('ui:exit-to-menu', false));
}

/** The permanent collection — the reason summoning a new champion is worth something. */
export function showCodex(self: ConquestUIScene): void {
  // Holds the clock like every other screen that covers the map. It was the one that did not,
  // because it is opened outside `openLane` — so the world kept turning behind a full-screen
  // overlay the player was reading.
  self.lanePauseBeforeOpen = self.state.isStrategyPause;
  self.state.isStrategyPause = true;
  self.beginOverlay('codex');

  const progress = codexProgress();
  const content = self.promptFrame(
    t('ascent.codex.title'),
    `${t('ascent.codex.subtitle', progress)}\n${t('ascent.codex.hint')}`,
  );

  const unlocked = new Set(getCodex().unlocked);
  const scroll = self.ui.scrollArea({
    x: content.x,
    y: content.y,
    width: content.width,
    height: content.height - LANE_FOOTER_HEIGHT,
  });
  scroll.addTo(self.modalLayer);
  self.activeScrollAreas.push(scroll);

  let y = 0;
  for (const hero of heroTemplates) {
    const known = unlocked.has(hero.id);
    const tier = tierForHero(hero);
    const row = self.ui.card({ x: 0, y, width: content.width - 6, height: 54 }, {
      title: known ? heroName(hero) : '???',
      subtitle: known ? `${heroTypeLabel(hero.type)} · ${rarityLabel(hero.rarity)}` : t('ascent.codex.locked'),
      border: known ? RARITY_COLOR[tier] : INK_UI.softBrush,
      muted: !known,
    });
    scroll.content.add(row);
    y += (row.getData('cardHeight') as number ?? 54) + 8;
  }
  scroll.setContentHeight(Math.max(content.height - LANE_FOOTER_HEIGHT, y));

  self.modalLayer.add(self.ui.button(
    { x: content.x, y: content.y + content.height - 46, width: content.width, height: 42 },
    t('ascent.codex.close'),
    () => self.closeLane(),
    { variant: 'primary', fontSize: '13px' },
  ));
}
