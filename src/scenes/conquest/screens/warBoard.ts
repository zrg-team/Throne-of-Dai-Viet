/**
 * The war, when there is no battle screen to open.
 *
 * The Battle button had exactly one state worth pressing — a live watched engagement — and the
 * screen opens for 6–15 of the 20–96 fights a measured run settles. The rest happened to provinces
 * the player owned, on a map that showed nothing, reported to two channels this mode does not
 * render. *Sometimes the enemy attacks my land but no fight is shown.*
 *
 * So the button always leads somewhere while the realm is under attack: the fronts standing right
 * now, worst first, and under them the last engagements the generals settled. It is a board, not
 * a fight — there is nothing to steer here — and the one front that *can* be walked into carries
 * the door to it.
 */
import { contestedFronts } from '../../../systems/ascent/battleReport';
import { focusBattle } from '../../../systems/ascent/fronts';
import { INK_UI } from '../../../ui/InkUI';
import { t } from '../../../i18n';
import type { ConquestUIScene } from '../../ConquestUIScene';

export function showWarBoard(self: ConquestUIScene): void {
  const state = self.state;
  const fronts = contestedFronts(state);
  const fighting = fronts.filter((front) => front.live).length;
  const history = [...(state.ascent?.battleHistory ?? [])].reverse().slice(0, 8);

  /**
   * The board raised *at* the player, rather than opened by them.
   *
   * A second field going live is the one event in this mode that changes what the player should
   * be doing rather than merely how well it is going, so `addSideBattle` stops the world and
   * leaves the count here. Read once, and cleared: this is an announcement about a moment, like
   * the wave banner's cues, and it must not be redelivered every time the board is opened again.
   *
   * `lanePauseBeforeOpen` is cleared with it, because the pause belongs to the announcement. The
   * lane hands back whatever pause it opened under, and without this the player would close the
   * board onto a world that stays stopped with no control that says why.
   */
  const alerted = state.ascent?.frontsOpened ?? 0;
  if (state.ascent?.frontsOpened) {
    state.ascent.frontsOpened = undefined;
    self.lanePauseBeforeOpen = false;
  }

  const { addRow, addHeading, addNote, finish } = self.laneList(
    alerted > 1 ? t('ascent.war.alertTitle') : t('ascent.war.title'),
    alerted > 1
      ? t('ascent.war.alertSubtitle', { n: alerted })
      : fighting > 0
        ? t('ascent.war.subtitleFighting', { n: fighting, all: fronts.length })
        : fronts.length > 0
          ? t('ascent.war.subtitle', { n: fronts.length })
          : t('ascent.war.subtitleQuiet'),
    {},
  );

  if (fronts.length > 0) {
    addHeading(t('ascent.war.frontsHeading'), t('ascent.war.frontsHint'));
    for (const front of fronts) {
      // The odds, said as a word rather than as a ratio: the board is read at a glance while a
      // wave is landing, and "2.4×" is a number the player has to do arithmetic on first.
      const odds = front.theirMen / Math.max(1, front.ourMen);
      const standing = front.commanded ? 'live'
        : front.live ? 'held'
          : front.besieged ? 'besieged'
            : odds >= 1.6 ? 'losing'
              : odds >= 0.9 ? 'even' : 'holding';
      // The ink is the *odds*, not the standing. A field a general is holding reads `held`, which
      // never matched the losing clause below — so the board drew a general 400 against 1,600 in
      // the same gold as one at even numbers, which is the whole thing this board exists to say.
      const dire = front.commanded || front.besieged || odds >= 1.6;
      addRow(
        {
          title: front.commanded
            ? `▸ ${front.landName}`
            : front.landName,
          subtitle: t('ascent.war.frontLine', {
            kingdom: front.kingdomName,
            theirs: Math.round(front.theirMen),
            ours: Math.round(front.ourMen),
            standing: t(`ascent.war.standing.${standing}` as Parameters<typeof t>[0]),
          }),
          border: dire
            ? INK_UI.cinnabar
            : front.live || standing === 'even' ? INK_UI.gold : INK_UI.jade,
        },
        // **Every live front is a door.** The one under your hand opens the fight you are already
        // in; a front a general is holding takes you onto that field first — which is the whole
        // point of the board, and the thing the mode could not do at all until the war was allowed
        // more than one field. Ground with no fight on it is not a door: there is nothing to
        // stand on there yet.
        front.live
          ? () => {
            if (!front.commanded) focusBattle(state, front.landId);
            self.battleFieldRequested = true;
            self.closeLane();
            self.openLane('battle');
          }
          : undefined,
      );
    }
  } else {
    addNote(t('ascent.war.noFronts'));
  }

  if (history.length > 0) {
    addHeading(t('ascent.war.recentHeading'), t('ascent.war.recentHint'));
    for (const record of history) {
      const theirs = record.outcome === 'they-rout' || record.outcome === 'spent';
      const key = record.role === 'offence'
        ? (theirs ? 'took' : 'repulsed')
        : (theirs ? 'won' : 'lost');
      addRow({
        title: `${record.landName}  ·  ${t('ascent.war.wave', { n: record.wave ?? 0 })}`,
        subtitle: t(`ascent.war.past.${key}` as Parameters<typeof t>[0], {
          kingdom: record.kingdomName ?? t('ascent.aftermath.theEnemy'),
          ours: Math.max(0, Math.round(record.ourStart - record.ourEnd)),
          theirs: Math.max(0, Math.round(record.theirStart - record.theirEnd)),
        }),
        border: theirs ? INK_UI.softBrush : INK_UI.cinnabar,
        muted: true,
      });
    }
  }

  finish();
}
