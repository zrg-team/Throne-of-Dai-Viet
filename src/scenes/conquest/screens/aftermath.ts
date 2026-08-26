/**
 * The two screens the game pushes at the player rather than the player opening: the report on
 * what an answer just did to the realm, and the Reckoning after a fight. Neither is a lane and
 * neither has a bar button — `shell.ts`'s prompt router raises both, which is the whole reason
 * they share a file.
 *
 * Both hold the clock and hand `lanePauseBeforeOpen` back on the way out, but only the Reckoning
 * captures it here; `showStoryOutcome`'s half is set in `shell.ts` just before the call, so
 * `dismissStoryOutcome` restores a field this file never writes. And `showAftermathScreen` draws
 * nothing at all without a `pendingAftermath`, which is why `openAftermath` checks the modal
 * layer afterwards and dismisses itself.
 */
import { storyText, storyTitle } from '../../../i18n/story';
import { INK_UI, INK_UI_HEX } from '../../../ui/InkUI';
import { UI_FONT } from '../../../ui/fonts';
import { t } from '../../../i18n';
import type { GameState } from '../../../state/types';
import { formatOutcomeAmount } from '../constants';
import type { ConquestUIScene } from '../../ConquestUIScene';

export function dismissStoryOutcome(self: ConquestUIScene): void {
  self.state.lastStoryOutcome = undefined;
  self.state.isStrategyPause = self.lanePauseBeforeOpen;
  self.closeOverlay();
}

/**
 * What an answer did to the realm — afterwards, and only afterwards.
 *
 * **A report, never a preview.** The card the player just answered still shows nothing but its
 * price, which is the design and stays the design: an option that prints its own consequence is
 * a walkthrough, and a story you can solve is not a story. But a run in which six beats are
 * answered and none of them visibly change anything is not restraint, it is silence — and that
 * is what "I don't know how it affects my kingdom" was describing.
 *
 * So the class, the turn the story took and the arithmetic all land here, one tap later, when
 * the decision is already irrevocable and nothing about knowing can be used to game it.
 *
 * The lines come from `ctx.note`, called by the verbs in `effects.ts` as they work. Anything a
 * story deliberately conceals — a defection, a mutiny — simply never calls it, so there is no
 * exclusion list here to fall out of step with the vocabulary.
 */
export function showStoryOutcome(self: ConquestUIScene, report: NonNullable<GameState['lastStoryOutcome']>): void {
  const stem = `${report.templateId}.${report.fragmentId}`;
  const chronicle = storyText(`${stem}.chronicle`, report.params);
  const { body, bodyWidth, finish } = self.promptScrollBody(
    storyTitle(report.templateId),
    chronicle !== `${stem}.chronicle` ? chronicle : '',
    0,
  );

  let used = 0;

  // The class of the path, where the story has one. Same three inks as the spine, so the two
  // screens are legibly about the same thing.
  if (report.historicity) {
    const chip = self.ui.card(
      { x: 0, y: used, width: bodyWidth, height: 34 },
      {
        title: '',
        subtitle: t(`ascent.story.class.${report.historicity}` as Parameters<typeof t>[0]),
        border: report.historicity === 'chinh-su'
          ? INK_UI.jade
          : report.historicity === 'da-su' ? INK_UI.gold : INK_UI.cinnabar,
      },
    );
    body.add(chip);
    used += ((chip.getData('cardHeight') as number) ?? 34) + 10;
  }

  const heading = self.add.text(2, used, t('ascent.story.outcome.changed').toLocaleUpperCase(), {
    color: INK_UI_HEX.mutedText,
    fontFamily: UI_FONT,
    fontSize: '10px',
    fontStyle: '700',
  });
  heading.setLetterSpacing?.(1.6);
  body.add(heading);
  used += 18;

  for (const entry of report.outcome) {
    const key = `ascent.story.outcome.${entry.kind}` as Parameters<typeof t>[0];
    // A signed figure, because this is a ledger and the direction is the point. The key itself
    // carries no + or −, so a line that only ever moves one way still reads correctly.
    const n = formatOutcomeAmount(entry);
    const line = t(key, { n, name: entry.name ?? '' });
    // An unknown kind resolves to its own key. Print nothing rather than `ascent.story.
    // outcome.whatever` — a missing string is a bug for the harness to catch, not a line of
    // gibberish for the player to read.
    if (line === key) continue;
    const gain = (entry.amount ?? 0) > 0 || entry.amount === undefined;
    const rail = self.add.graphics();
    rail.fillStyle(gain ? INK_UI.jade : INK_UI.cinnabar, 0.7);
    rail.fillRect(2, used + 3, 3, 13);
    body.add(rail);
    const text = self.ui.label(14, used, line, 'body', {
      fontSize: '12px',
      wordWrap: { width: bodyWidth - 20 },
    });
    body.add(text);
    used += Math.max(20, text.height + 6);
  }
  used += 10;

  const ack = self.optionCard(
    { x: 0, y: used, width: bodyWidth, height: 48 },
    {
      title: t('ascent.story.outcome.ok'),
      body: '',
      accent: INK_UI.gold,
      parent: body,
      onTap: () => {
        dismissStoryOutcome(self);
        self.refresh();
      },
    },
  );
  used += ((ack.getData('cardHeight') as number) ?? 48) + 8;

  finish(used);
}

/**
 * The Reckoning: what the fight cost, what it bought, and who else was fighting.
 *
 * Every figure here was already being written down and then discarded. `battleHistory` carries
 * the butcher's bill, `grantRepelSpoils` and `XP_PER_BATTLE_WON` carry what it paid for, and
 * `levyFought` carries whether the province turned its own people out — and the screen closed on
 * one line of message strip, so the most consequential thing in the mode ended by vanishing.
 *
 * The dispatch below it is the other half of making delegation legitimate. A run-wide switch
 * that hands two thirds of the war to the generals is a way of playing; the same switch when it
 * makes those fights silent is a way of turning the game off.
 */
function showAftermathScreen(self: ConquestUIScene): void {
  const pending = self.state.ascent?.pendingAftermath;
  if (!pending) return;
  const { record, alsoFought } = pending;
  const ourLost = Math.max(0, record.ourStart - record.ourEnd);
  const theirLost = Math.max(0, record.theirStart - record.theirEnd);
  const held = record.outcome === 'they-rout'
    || (record.outcome === 'spent' && record.ourEnd / Math.max(1, record.ourStart) >= record.theirEnd / Math.max(1, record.theirStart));

  // **Which side of the wall we were on.**
  //
  // Every line of this screen was written from the defender's chair, and the record has carried
  // `role` all along. A siege the player ordered and lost therefore reported "The ground is held"
  // and "{land} stays ours" over a jade border - the defender's good news, printed as the result
  // of the player's own failed assault. Read literally it was even true, which is what made it so
  // misleading: the province did hold, against us.
  const offence = record.role === 'offence';
  const titleKey = record.outcome === 'they-rout' ? 'broke'
    : record.outcome === 'we-rout' ? 'broken'
      : record.outcome === 'retreat' ? 'withdrew'
        : held ? (offence ? 'stormed' : 'held') : (offence ? 'repulsed' : 'lost');

  const { addRow, addHeading, addNote, addWidget, finish } = self.laneList(
    t(`ascent.aftermath.title.${titleKey}` as Parameters<typeof t>[0]),
    // `rounds: 0` is the mark of a fight nobody stood on the field for — `resolveInvaderBattle`
    // settles it as an odds roll and files the record honestly rather than inventing a beat
    // count. Printing it as "0 exchanges" read as a bug in the report of a real battle.
    record.rounds > 0
      ? t('ascent.aftermath.subtitle', { land: record.landName, rounds: record.rounds })
      : t('ascent.aftermath.subtitleDispatch', { land: record.landName }),
    { footer: { label: t('ascent.aftermath.continue'), onTap: () => dismissAftermath(self) } },
  );

  // The bill, as two bars against the same scale — the only honest way to show a trade.
  const worst = Math.max(1, record.ourStart, record.theirStart);
  addWidget(64, (parent, width) => {
    const bar = (y: number, label: string, lost: number, of: number, colour: number): void => {
      parent.add(self.ui.label(0, y, label, 'caption', {}));
      parent.add(self.ui.label(width, y, t('ascent.aftermath.fell', { n: lost, of }), 'caption',
        { align: 'right' }).setOrigin(1, 0));
      parent.add(self.ui.statBar({ x: 0, y: y + 16, width, height: 7 }, lost, worst, colour));
    };
    bar(0, t('ascent.aftermath.ourDead'), ourLost, record.ourStart, INK_UI.cinnabar);
    bar(32, t('ascent.aftermath.theirDead'), theirLost, record.theirStart, INK_UI.softBrush);
  });

  // Who held the field. A delegated fight names its commander, because an appointment the
  // player made is the reason the fight went the way it did.
  if (record.delegated) {
    addRow({
      title: record.generalName
        ? t('ascent.aftermath.generalFought', { name: record.generalName })
        : t('ascent.aftermath.officersFought'),
      subtitle: t('ascent.aftermath.generalNote'),
      border: INK_UI.gold,
    });
  }

  // Historically literal under ngụ binh ư nông: the levy is farmers, and they go home to the
  // fields rather than back to a wall they never lived on.
  if (record.levyFought) addNote(t('ascent.aftermath.levyHome', { land: record.landName }));

  addRow({
    title: t((offence
      ? (held ? 'ascent.aftermath.tookTitle' : 'ascent.aftermath.failedTitle')
      : (held ? 'ascent.aftermath.keptTitle' : 'ascent.aftermath.lostTitle')) as Parameters<typeof t>[0],
    { land: record.landName }),
    subtitle: t('ascent.aftermath.keptNote', {
      ours: record.ourEnd, theirs: record.theirEnd, hosts: record.theirHosts,
    }),
    border: held ? INK_UI.jade : INK_UI.cinnabar,
  });

  // One line of chronicle, in the voice the annals use: when, where, against whom, and what it
  // cost. This is the sentence a player will remember a fight by long after the numbers above it
  // have gone — and it is the same sentence the Đông Hồ prints of Hai Bà Trưng and Quang Trung
  // are captioned with, which is the register this whole mode is written in.
  const chronicleKey = offence
    ? (held ? 'took' : 'repulsed')
    : (held ? 'won' : 'lost');
  addNote(t(`ascent.aftermath.chronicle.${chronicleKey}` as Parameters<typeof t>[0], {
    year: record.year ?? self.state.year,
    land: record.landName,
    kingdom: record.kingdomName ?? t('ascent.aftermath.theEnemy'),
    dead: ourLost,
    leader: record.generalName ?? t('ascent.aftermath.theHost'),
  }), held ? INK_UI.jade : INK_UI.cinnabar);

  if (alsoFought.length > 0) {
    addHeading(t('ascent.aftermath.elsewhere'), t('ascent.aftermath.elsewhereHint'));
    for (const other of alsoFought) {
      const theirs = other.outcome === 'they-rout' || other.outcome === 'spent';
      // Same correction, one level down: a general sent to take a province reports whether he
      // carried it, not whether he held it.
      const dispatchKey = other.role === 'offence'
        ? (theirs ? 'took' : 'repulsed')
        : (theirs ? 'won' : 'lost');
      addRow({
        title: other.landName,
        subtitle: t(`ascent.aftermath.dispatch.${dispatchKey}` as Parameters<typeof t>[0], {
          name: other.generalName ?? t('ascent.aftermath.officers'),
          ours: Math.max(0, other.ourStart - other.ourEnd),
          theirs: Math.max(0, other.theirStart - other.theirEnd),
        }),
        border: theirs ? INK_UI.softBrush : INK_UI.cinnabar,
        muted: true,
      });
    }
  }

  finish();
}

/** Puts the Reckoning on the screen and holds the world behind it. */
export function openAftermath(self: ConquestUIScene): void {
  self.lanePauseBeforeOpen = self.state.isStrategyPause;
  self.state.isStrategyPause = true;
  self.beginOverlay('lane:aftermath');
  showAftermathScreen(self);
  // A lane that renders nothing has stranded the player: the bar and the map controls are torn
  // down before the screen is built, so an empty modal layer means no UI and no way back.
  if (self.modalLayer.length === 0) dismissAftermath(self);
}

export function dismissAftermath(self: ConquestUIScene): void {
  if (self.state.ascent) self.state.ascent.pendingAftermath = undefined;
  self.state.isStrategyPause = self.lanePauseBeforeOpen;
  self.closeOverlay();
}
