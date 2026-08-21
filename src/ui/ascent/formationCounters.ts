import Phaser from 'phaser';
import { FORMATION_RING, formationBeats, type BattleFormation } from '../../data/ascent/formations';
import { t } from '../../i18n';
import { CARD_ICON_SIZE, drawCardIcon, type CardIconId } from '../CardIcons';
import { INK_UI, INK_UI_HEX } from '../InkUI';
import { UI_FONT } from '../fonts';

/**
 * The counter table, drawn.
 *
 * The coach used to teach the ring in a paragraph — *"laid out in the ring order they beat each
 * other in"* — which is a sentence about a picture rather than the picture. A player reading it
 * mid-fight has to hold five names, a direction and a step count in their head and then find the
 * chip. Nobody does that with a host closing on them.
 *
 * So it is a table, and it is a table rather than a wheel on purpose. A wheel is the prettier
 * drawing of `formationBeats` and the worse answer to the only question anybody asks here, which
 * is **"they are doing that — what do I press?"** Five rows, left to right: what the enemy is
 * forming, and the two chips that answer it. The two answers are exactly the two the chips
 * themselves rim in jade, so the diagram and the dock cannot drift apart.
 *
 * Read off `formationBeats` rather than written down. The ring is a data table in
 * `data/ascent/formations.ts` and a second hand-typed copy of it here would be wrong the first
 * time somebody retunes it.
 */
const ICON: Record<BattleFormation, CardIconId> = {
  chong: 'spears',
  xung: 'horse',
  tan: 'skirmish',
  quy: 'tortoise',
  no: 'bows',
};

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 13;
const ICON_SIZE = 15;

/** Which shapes answer `theirs`, in ring order. Always exactly two. */
export function answersTo(theirs: BattleFormation): BattleFormation[] {
  return FORMATION_RING.filter((shape) => formationBeats(shape, theirs));
}

export interface FormationCountersOptions {
  /** Drawn brighter than the rest, when the fight has an enemy shape to answer right now. */
  highlight?: BattleFormation;
}

/**
 * Draws the table into a container at `(x, y)`, and reports how tall it came out.
 *
 * The height is returned rather than declared so a caller laying out a card can measure the
 * diagram the same way it measures a paragraph — the row count is the ring's length, and the ring
 * is allowed to change.
 */
export function drawFormationCounters(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  opts: FormationCountersOptions = {},
): { container: Phaser.GameObjects.Container; height: number } {
  const container = scene.add.container(0, 0);
  const height = HEADER_HEIGHT + FORMATION_RING.length * ROW_HEIGHT;

  // The seam between the question and the answer. One rule down the middle does the work three
  // borders would: everything left of it is theirs, everything right of it is yours.
  const seam = x + Math.round(width * 0.34);
  const arrowX = seam + 7;
  const answerX = arrowX + 14;
  const cellW = (x + width - answerX) / 2;

  const caption = (cx: number, text: string): void => {
    container.add(scene.add.text(cx, y, text, {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '8px', fontStyle: '700',
    }).setOrigin(0, 0));
  };
  caption(x, t('copilot.fight.ring.they'));
  caption(answerX, t('copilot.fight.ring.you'));

  const rule = scene.add.graphics();
  rule.lineStyle(1, INK_UI.softBrush, 0.55);
  rule.lineBetween(x, y + HEADER_HEIGHT - 3, x + width, y + HEADER_HEIGHT - 3);
  rule.lineStyle(1, INK_UI.softBrush, 0.4);
  rule.lineBetween(seam, y + HEADER_HEIGHT - 1, seam, y + height - 4);
  container.add(rule);

  FORMATION_RING.forEach((theirs, index) => {
    const rowY = y + HEADER_HEIGHT + index * ROW_HEIGHT;
    const mid = rowY + ROW_HEIGHT / 2 - 2;
    const lit = opts.highlight === theirs;

    if (lit) {
      const band = scene.add.graphics();
      band.fillStyle(INK_UI.gold, 0.16);
      band.fillRoundedRect(x - 3, rowY - 1, width + 6, ROW_HEIGHT - 2, 4);
      container.add(band);
    }

    // Theirs, in the red the whole screen reserves for the other side's intent.
    const cell = (
      cx: number, room: number, id: BattleFormation, colour: number, hex: string,
    ): void => {
      const glyph = drawCardIcon(scene, ICON[id], colour);
      glyph.setPosition(cx + ICON_SIZE / 2, mid).setScale(ICON_SIZE / CARD_ICON_SIZE);
      container.add(glyph);
      const label = scene.add.text(
        cx + ICON_SIZE + 4, mid, t(`ascent.formation.${id}.verb` as Parameters<typeof t>[0]),
        { color: hex, fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700' },
      ).setOrigin(0, 0.5);
      /**
       * Shrunk to fit rather than wrapped or clipped.
       *
       * The verbs are one short word in English and two longer ones in Vietnamese — `GIƯƠNG KHIÊN`
       * against `SHIELDS` — and at this width the Vietnamese ran straight through the icon of the
       * cell beside it. Wrapping would make the row two lines high for one language and one for the
       * other; clipping would hide the half of the word that distinguishes it.
       */
      const fits = room - ICON_SIZE - 4;
      if (label.width > fits) label.setScale(Math.max(0.72, fits / label.width));
      container.add(label);
    };

    cell(x, seam - x - 4, theirs, INK_UI.cinnabar, '#8a2a1b');

    const arrow = scene.add.graphics();
    arrow.fillStyle(INK_UI.brush, 0.7);
    arrow.fillTriangle(arrowX, mid - 4, arrowX, mid + 4, arrowX + 7, mid);
    container.add(arrow);

    answersTo(theirs).forEach((ours, slot) => {
      cell(answerX + slot * cellW, cellW - 4, ours, INK_UI.jade, '#3f5a3a');
    });
  });

  return { container, height };
}
