/**
 * The Moment card — the one question a fight stops to ask — drawn into the order dock's own band,
 * with a wash over the field above it. One function because the card is one object: the title is
 * built before the plate is sized around it, and the plate takes the whole band down to
 * `exitBounds`, which is only free because the dock is hidden while the card stands.
 *
 * It hides `ui.orders` and dims `ui.exits`, two layers it does not own, so anything else that
 * shows them has to say so — `holdArenaRout` re-shows the dock for exactly this reason. Depth is
 * the container and not `setDepth`, which is a no-op inside one. Rebuilding is latched on
 * `ui.momentKey` in `updateBattle` and must stay latched: a button destroyed between press and
 * release never fires. The countdown is a tween on real time — one `ASCENT_TICK_MS` per
 * `ticksLeft` — because the fight is held and there is no beat to drain against.
 */
import { ASCENT_TICK_MS, BATTLE_MOMENT_BONUS_BEATS } from '../../../game/ascentConfig';
import { BATTLE_MOMENTS, type MomentEffect } from '../../../data/ascent/battleMoments';
import { INK_UI, INK_UI_HEX } from '../../../ui/InkUI';
import { t } from '../../../i18n';
import type { AscentBattle } from '../../../state/types';
import { BATTLE_DOCK_HEIGHT, BATTLE_RAILS_HEIGHT, cssHex } from '../constants';
import { clearLayer } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { battleFieldBox } from '../constants';


/**
 * The Moment, as a thing a thumb can reach and a thing that looks like a button.
 *
 * It used to be a card pinned to the foot of the *field*, which on a 620-high screen is the
 * middle of the phone — the one part of a one-handed grip that a thumb cannot get to without
 * shifting the whole hand — and its two answers were 29-pixel outlined rows. 29 px is below
 * every touch-target guideline there is (44 is the usual floor), and an outlined row beside a
 * dock full of filled tiles reads as a caption rather than as a control. So the complaint was
 * two separate faults: it was out of reach, and it did not look tappable.
 *
 * Now it takes the order dock's own band — the strip the player's thumb is already on, because
 * that is where every other order in the fight is given — and its answers are `InkUI.button`s,
 * the same object the rest of the game uses, with the same press feedback. The orders underneath
 * are hidden while the question stands rather than left showing through: the question *is* the
 * order for this beat, and two sets of controls in one place is worse than either.
 */
/**
 * The answer's real levers, written short — DERIVED from the effect object, never hand-written.
 *
 * The cards' flavour tells the player what the choice is about; this line tells them what it
 * does to the fight (user ask, 2026-08-25: "the moment design is good but we do not clarify the
 * effect on the match"). Sixty hand-written effect strings would be sixty chances to drift from
 * `fightRound`; a formatter over `MomentEffect` cannot lie, and a new Moment def gets its line
 * for free. Numbers where the effect is a number, short words where it is a named lever, and the
 * shared window appended once when any timed term is present.
 */
function momentEffectLine(effect: MomentEffect): string {
  const parts: string[] = [];
  const pct = (mult: number): string =>
    `${mult > 1 ? '+' : '−'}${Math.round(Math.abs(mult - 1) * 100)}%`;
  const signed = (value: number): string => `${value > 0 ? '+' : '−'}${Math.abs(value)}`;
  if (effect.dealt !== undefined && effect.dealt !== 1) parts.push(t('ascent.moment.fx.dealt', { n: pct(effect.dealt) }));
  if (effect.taken !== undefined && effect.taken !== 1) parts.push(t('ascent.moment.fx.taken', { n: pct(effect.taken) }));
  if (effect.sharpen) parts.push(t('ascent.moment.fx.sharpen'));
  if (effect.guard) parts.push(t('ascent.moment.fx.guard'));
  if (effect.freeReform) parts.push(t('ascent.moment.fx.freeReform'));
  if (effect.lockTheirShape) parts.push(t('ascent.moment.fx.lock', { n: effect.lockTheirShape }));
  if (effect.morale) parts.push(t('ascent.moment.fx.morale', { n: signed(effect.morale) }));
  if (effect.theirMorale) parts.push(t('ascent.moment.fx.theirMorale', { n: Math.abs(effect.theirMorale) }));
  if (effect.loss) parts.push(t('ascent.moment.fx.loss', { n: Math.round(effect.loss * 100) }));
  if (effect.theirLoss) parts.push(t('ascent.moment.fx.theirLoss', { n: Math.round(effect.theirLoss * 100) }));
  if (effect.advance) parts.push(t(effect.advance > 0 ? 'ascent.moment.fx.advance' : 'ascent.moment.fx.giveGround'));
  if (effect.rounds) parts.push(t(effect.rounds < 0 ? 'ascent.moment.fx.shorter' : 'ascent.moment.fx.longer'));
  if (effect.rally) parts.push(t('ascent.moment.fx.rally'));
  if (effect.stance) parts.push(t('ascent.moment.fx.stance', { s: t(`ascent.stance.${effect.stance}` as Parameters<typeof t>[0]) }));
  const timed = (effect.dealt !== undefined && effect.dealt !== 1)
    || (effect.taken !== undefined && effect.taken !== 1) || effect.sharpen || effect.guard;
  if (timed) parts.push(t('ascent.moment.fx.beats', { n: BATTLE_MOMENT_BONUS_BEATS }));
  return parts.join(' · ');
}

export function buildBattleMoment(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { content, moment: layer } = ui;
  clearLayer(self, layer);

  const moment = battle.moment;
  ui.momentKey = moment ? `${moment.id}:${moment.raisedAtBeat}` : '';
  // Both dials go dark while the question stands. A stop you can keep playing through is not a
  // stop, and two sets of live controls in one band is worse than either alone.
  ui.orders.setVisible(!moment);
  ui.exits.setAlpha(moment ? 0.38 : 1);
  if (!moment) return;

  // The fight is *held*, and until now nothing on screen admitted it: `advanceBattle` stops
  // draining beats while a Moment stands, so the field simply went quiet — which reads as a
  // dropped frame rather than as a decision being waited for. A wash and a word fix that.
  //
  // In the `moment` layer and not over the field, because `setDepth` inside a container is a
  // no-op: the only thing that puts this above the men is being in a later container.
  const wash = self.add.graphics();
  wash.fillStyle(INK_UI.parchment, 0.55);
  // The field went full-bleed (battleFieldBox) while this wash kept the card column, so a
  // Moment left two undimmed strips of battlefield at the edges - the frame said "held" and
  // the margins said "live". The wash covers what the field covers.
  const fieldBox = battleFieldBox(content, ui.fieldHeight);
  wash.fillRect(fieldBox.x, fieldBox.y, fieldBox.width, fieldBox.height);
  layer.add(wash);
  layer.add(self.ui.label(
    content.x + content.width / 2, content.y + ui.fieldHeight * 0.32,
    t('ascent.battle.held'), 'caption',
    {
      fontSize: '10px',
      align: 'center',
      color: cssHex(INK_UI.cinnabar),
    },
  ).setOrigin(0.5));

  const y = content.y + ui.fieldHeight + 8 + BATTLE_RAILS_HEIGHT + 8;

  // Built before the plate is sized, because the plate is sized around it. A Moment's title is
  // one line for `Their baggage is within bowshot.` and two for one carrying a rival's full name
  // — and at the fixed height this used to have, that second line ate the answers' room and the
  // two buttons printed their own sub-lines straight through the timer bar.
  const title = self.ui.label(
    content.x + 12, y + 16,
    t(`ascent.moment.${moment.id}.title` as Parameters<typeof t>[0], { subject: moment.subject ?? '' }),
    'label', { fontSize: '14px', wordWrap: { width: content.width - 28 } },
  );
  /**
   * As tall as the band under the rails will allow, not as tall as some written-down number.
   *
   * It was `BATTLE_DOCK_HEIGHT + 8` plus whatever a wrapped title cost, which is the dock's
   * height — and the dock has three rows of controls where this has two buttons that each carry
   * a heading *and* a line of explanation. At that size a Moment offering `Đánh trước khi chúng
   * dàn xong` over `Đông chỉ có ích khi đã vào hàng.` had about forty points for four lines of
   * type. Taking the whole band gives the two answers the room they were always drawn for, and
   * costs nothing: the dock is hidden while this stands, so the space is not being used for
   * anything else.
   */
  const height = Math.max(BATTLE_DOCK_HEIGHT + 8, ui.exitBounds.y - 8 - y);

  // A plate, not a scrim: the field behind it stays fully visible, because the field is what the
  // question is about. The old card covered the very thing it was asking after.
  const plate = self.add.graphics();
  plate.fillStyle(INK_UI.parchment, 0.97);
  plate.fillRect(content.x + 2, y, content.width - 4, height);
  plate.lineStyle(2, INK_UI.cinnabar, 0.95);
  plate.strokeRect(content.x + 2, y, content.width - 4, height);
  layer.add(plate);

  layer.add(self.ui.label(content.x + 12, y + 5, t('ascent.moment.kicker'), 'caption', {
    fontSize: '9px', color: cssHex(INK_UI.cinnabar),
  }));
  layer.add(title);

  /**
   * Two real buttons, side by side, filling the width — and the clock gets a band of its own
   * under them rather than being squeezed into their margin.
   *
   * 22 points is what the bar and its caption together *are*: a 3-point bar and a 10-point line
   * of type. Sized against that exactly, the caption's own line box overhung the card by a point
   * and printed across the bar it was captioning. `FOOTER` is that content plus the air on both
   * sides of it, which is what it needed all along.
   */
  const FOOTER = 26;
  const rowY = y + 16 + Math.max(16, title.height) + 6;
  const gap = 8;
  const buttonW = (content.width - 24 - gap) / 2;
  // The strip under each answer where its derived effect line prints — see `momentEffectLine`.
  // Two caption lines when the band affords them; on a band too short for buttons AND captions
  // the buttons win the room (they are the controls) and the strip narrows, or goes entirely —
  // an effect line printed over the timer bar is worse than none.
  const bandFree = height - (rowY - y) - FOOTER;
  const EFFECT_H = Math.min(24, Math.max(0, bandFree - 44));
  const buttonH = Math.max(44, bandFree - EFFECT_H);
  const def = BATTLE_MOMENTS.find((candidate) => candidate.id === moment.id);
  const answer = (index: number, id: 'commit' | 'steady'): void => {
    const bx = content.x + 12 + index * (buttonW + gap);
    layer.add(self.ui.button(
      { x: bx, y: rowY, width: buttonW, height: buttonH },
      t(`ascent.moment.${moment.id}.${id}` as Parameters<typeof t>[0]),
      () => {
        // No gesture guard here: `InkUI.button` has already refused the tap if it was the tail
        // of a scroll, and it did so with the pointer in hand. A second, pointerless check could
        // only ever throw away an answer the player did mean to give.
        self.releaseBattleHold();
        self.events.emit('ui:battle-moment', id);
      },
      {
        // Gold for the committing answer and paper for the steady one: the same pair the stance
        // dock uses for "chosen" and "available", so the two rows speak the same language.
        variant: id === 'commit' ? 'primary' : 'secondary',
        fontSize: '12.5px',
        subLabel: t(`ascent.moment.${moment.id}.${id}D` as Parameters<typeof t>[0]),
      },
    ));
    // What this answer does to the fight, under the card it belongs to. Skipped when the band
    // could not reserve a strip, and shrunk to fit the strip it got — never printed over the bar.
    const effect = def?.[id];
    if (effect && EFFECT_H >= 11) {
      const line = momentEffectLine(effect);
      if (line) {
        const fx = self.ui.label(
          bx + buttonW / 2, rowY + buttonH + 2, line,
          'caption', {
            fontSize: '8px', align: 'center', wordWrap: { width: buttonW - 6 },
            color: INK_UI_HEX.mutedText,
          },
        ).setOrigin(0.5, 0);
        for (let size = 7.5; size >= 6.5 && fx.height > EFFECT_H - 2; size -= 0.5) {
          fx.setFontSize(size);
        }
        layer.add(fx);
      }
    }
  };
  answer(0, 'commit');
  answer(1, 'steady');

  // The clock, and who answers when it runs out.
  //
  // Drained by a tween rather than by the tick: the fight is *held* while this stands, so the
  // only honest thing to draw against is real time. It runs for the window the world will
  // actually wait — one economy tick per `ticksLeft`.
  const barW = content.width - 24;
  const barY = y + height - FOOTER + 5;
  const bed = self.add.graphics();
  bed.fillStyle(INK_UI.parchmentDark, 0.9);
  bed.fillRect(content.x + 12, barY, barW, 3);
  layer.add(bed);
  const fill = self.add.graphics();
  fill.fillStyle(INK_UI.cinnabar, 0.95);
  fill.fillRect(0, 0, barW, 3);
  fill.setPosition(content.x + 12, barY);
  layer.add(fill);
  self.tweens.add({
    targets: fill,
    scaleX: { from: 1, to: 0 },
    duration: ASCENT_TICK_MS * Math.max(1, moment.ticksLeft),
    ease: 'Linear',
  });
  layer.add(self.ui.label(
    content.x + content.width / 2, barY + 6,
    moment.generalName
      ? t('ascent.moment.fallback', { name: moment.generalName, n: moment.ticksLeft })
      : t('ascent.moment.fallbackNone', { n: moment.ticksLeft }),
    'caption', { fontSize: '9px', align: 'center' },
  ).setOrigin(0.5, 0));
}
