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
/**
 * 16, not 13.
 *
 * The two column headings are 8-point type, whose line box is about ten — and the rule was drawn
 * at 10, straight through the descender of `PRESS EITHER`. Three points of air under the words,
 * then the rule.
 */
const HEADER_HEIGHT = 16;
const ICON_SIZE = 15;

/** Which shapes answer `theirs`, in ring order. Always exactly two. */
export function answersTo(theirs: BattleFormation): BattleFormation[] {
  return FORMATION_RING.filter((shape) => formationBeats(shape, theirs));
}

/**
 * The ring as a chain: five shapes in the order they beat each other, arrows between.
 *
 * The **table** is the right drawing inside a fight, where the question is always *they are doing
 * that, what do I press* and the answer has to be readable without thinking. This is the right
 * drawing on a setup page, where nobody is under time and the question is *what are the rules* —
 * and where the page's real business is two hosts, four dials and a general, all of which were
 * being pushed off the bottom by a hundred and sixty points of reference material.
 *
 * One row instead of five, forty points instead of a hundred and sixty, and the same
 * `FORMATION_RING` underneath — so the two pictures cannot tell different stories.
 *
 * The wrap-around is the one thing a chain cannot draw, so the line under it says it: each shape
 * beats the two that follow it, and the fifth follows round to the first.
 */
export function drawFormationRing(
  scene: Phaser.Scene, x: number, y: number, width: number, title?: string,
): { container: Phaser.GameObjects.Container; height: number } {
  const container = scene.add.container(0, 0);

  /**
   * An ellipse rather than a circle, and that is the whole geometry.
   *
   * Five nodes on a true circle put the two lowest ones close enough that their labels touch —
   * `GIƯƠNG KHIÊN` and `XUNG PHONG` are wide words. Stretched sideways the row of labels has room,
   * and the picture still reads as a closed loop, which is the only thing it has to say.
   */
  /**
   * Wide and shallow, and wider than it needs to be for the arrows alone.
   *
   * The heading lives in the middle, so the two side nodes have to stand far enough out that their
   * labels clear it — `GIƯƠNG KHIÊN` beside `THẾ NÀO KHẮC THẾ NÀO` is the tight case, and at 58 the
   * two were touching. Height stays low: the page has width to spare and no height at all.
   */
  const RX = 66;
  const RY = 32;
  const cx = x + width / 2;
  /**
   * Far enough down that the topmost label — which is drawn *above* its node — still starts below
   * `y`. A drawing that reaches back over the line it was given collides with whatever put it
   * there; this one came out on top of its own heading the first time.
   */
  const cy = y + RY + 20;
  const at = (index: number): { x: number; y: number } => {
    const angle = -Math.PI / 2 + (index / FORMATION_RING.length) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * RX, y: cy + Math.sin(angle) * RY };
  };

  /**
   * An arrow on each arc, pointing the way the ring runs: this shape beats the one it points at.
   *
   * Five of them, including the one from the last node back to the first — which is the arrow that
   * does the work. Drawn as a straight chain, the same five shapes read as a ranking with `SPEARS`
   * unbeatable at one end and `VOLLEY` beating nothing at the other, which is the opposite of the
   * rule. Nothing in a ring is best.
   */
  // Directed ARCS, not a rim and not floating heads. The full ellipse was tried and rejected — a
  // closed rim turns five shapes into words trapped in a wheel — and the bare arrowheads that
  // replaced it were tried too and read as five triangles scattered on the paper ("this renders
  // pretty bad"): an arrow with no shaft has no from and no to. An arc that leaves one shape and
  // ends in a head short of the next is the honest middle: each edge says A beats B, and the gaps
  // at the nodes keep it from closing back into a rim.
  const arrows = scene.add.graphics();
  const step = (Math.PI * 2) / FORMATION_RING.length;
  for (let i = 0; i < FORMATION_RING.length; i += 1) {
    const a0 = -Math.PI / 2 + i * step;
    // Trimmed at both ends so the stroke clears the glyph it leaves and the one it points at —
    // the arc length per radian is RX at the top of the loop and only RY at its sides, so the
    // same angular trim clears more paper exactly where the glyphs stand widest.
    const start = a0 + step * 0.26;
    const end = a0 + step * 0.72;
    const points: Array<{ x: number; y: number }> = [];
    for (let k = 0; k <= 10; k += 1) {
      const a = start + ((end - start) * k) / 10;
      points.push({ x: cx + Math.cos(a) * RX, y: cy + Math.sin(a) * RY });
    }
    // Two passes — a soft wide stroke under a firm thin one — the cheap echo of `inkPath`'s
    // print registration, so the edge sits on the paper instead of on top of it.
    for (const [width2, alpha] of [[2.8, 0.16], [1.4, 0.85]] as const) {
      arrows.lineStyle(width2, INK_UI.jade, alpha);
      arrows.beginPath();
      arrows.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) arrows.lineTo(p.x, p.y);
      arrows.strokePath();
    }
    // The head, on the tangent at the arc's end: this shape beats the one it points at.
    let tx = -Math.sin(end) * RX;
    let ty = Math.cos(end) * RY;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const tip = points[points.length - 1];
    arrows.fillStyle(INK_UI.jade, 0.95);
    arrows.fillTriangle(
      tip.x + tx * 7, tip.y + ty * 7,
      tip.x - ty * 3.6, tip.y + tx * 3.6,
      tip.x + ty * 3.6, tip.y - tx * 3.6,
    );
  }
  container.add(arrows);

  let top = cy - RY - 8;
  let bottom = cy + RY + 8;
  FORMATION_RING.forEach((id, index) => {
    const node = at(index);
    // 17, up from 14. The chip glyphs are drawn for a 26-unit box; at 0.54x the skirmish dots
    // and the wedge's rear rank collapsed below a pixel and two of the five shapes read as
    // smudges. 0.65x is the floor at which every glyph still says what it is.
    const glyph = drawCardIcon(scene, ICON[id], INK_UI.brush);
    glyph.setPosition(node.x, node.y).setScale(17 / CARD_ICON_SIZE);
    container.add(glyph);

    const label = scene.add.text(
      node.x, 0, t(`ascent.formation.${id}.verb` as Parameters<typeof t>[0]),
      { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '7.5px', fontStyle: '700' },
    );
    for (let size = 7.5; size >= 5.5 && label.width > 60; size -= 0.5) label.setFontSize(size);

    /**
     * Each label is pushed **radially outward**, and the two at the sides go out sideways.
     *
     * Every label under its own icon is the obvious layout and it is the one that collides: the
     * arrowheads sit at the middle of each arc, and the two arcs on the left and right pass exactly
     * through the space a label under a side node occupies. Measured, `CHARGE` and the arrow
     * between it and `SPREAD` were drawn on top of each other in both languages.
     *
     * So the ring labels its nodes the way a compass does — the top one above, the bottom two
     * below, the side two out to the side — which leaves all five arcs clear and, as a bonus, hands
     * the middle of the loop back to the heading.
     */
    const side = index === 1 || index === FORMATION_RING.length - 1;
    if (index === 0) {
      label.setOrigin(0.5, 1).setPosition(node.x, node.y - 10);
    } else if (side) {
      const right = node.x > cx;
      label.setOrigin(right ? 0 : 1, 0.5).setPosition(node.x + (right ? 13 : -13), node.y);
    } else {
      label.setOrigin(0.5, 0).setPosition(node.x, node.y + 10);
    }
    container.add(label);
    const bounds = label.getBounds();
    top = Math.min(top, bounds.y);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  });

  /**
   * The heading goes in the **hole in the middle**, not in a row above.
   *
   * A ring is the one diagram that comes with its own empty space, and spending a whole line of the
   * page on a title while leaving that space blank is paying twice for one idea. It also ties the
   * words to the picture: read in the centre, `WHICH SHAPE BEATS WHICH` is plainly about the loop
   * around it rather than about whatever happens to be above.
   *
   * No caption underneath either. There was a line saying *each shape beats the two that follow it,
   * round the ring* — written when this was a straight chain and could not show the wrap. A closed
   * loop with arrows on it says that without being read.
   */
  if (title) {
    const heading = scene.add.text(cx, cy, title, {
      color: '#a8873c', fontFamily: UI_FONT, fontSize: '7px', fontStyle: '700',
      align: 'center', lineSpacing: 2,
      /**
       * Narrower than the gap the two side labels leave, not merely narrower than the ellipse.
       *
       * The side nodes stand at `RX` and their labels are centred on them, so the clear space in
       * the middle is `2 * (RX - halfLabel)` — about 74 points with `XUNG PHONG` out there. Wrapping
       * at `RX - 14` keeps the heading inside that with room to spare, in either language.
       */
      // The side labels are outside the loop now, so the middle is the loop's own width less the
      // two icons standing in it.
      wordWrap: { width: RX * 2 - 34 },
    }).setOrigin(0.5, 0.5);
    container.add(heading);
  }

  // Everything was laid out around `cy`; the caller only knows `y`, so give it back the real span.
  return { container, height: bottom + 4 - y };
}

export interface FormationCountersOptions {
  /** Drawn brighter than the rest, when the fight has an enemy shape to answer right now. */
  highlight?: BattleFormation;
  /** Shorter rows for a page that has to fit the table beside something else. */
  rowHeight?: number;
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
  const rowHeight = opts.rowHeight ?? ROW_HEIGHT;
  const height = HEADER_HEIGHT + FORMATION_RING.length * rowHeight;

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
  rule.lineBetween(x, y + HEADER_HEIGHT - 4, x + width, y + HEADER_HEIGHT - 4);
  rule.lineStyle(1, INK_UI.softBrush, 0.4);
  rule.lineBetween(seam, y + HEADER_HEIGHT - 2, seam, y + height - 4);
  container.add(rule);

  FORMATION_RING.forEach((theirs, index) => {
    const rowY = y + HEADER_HEIGHT + index * rowHeight;
    const mid = rowY + rowHeight / 2 - 2;
    const lit = opts.highlight === theirs;

    if (lit) {
      const band = scene.add.graphics();
      band.fillStyle(INK_UI.gold, 0.16);
      band.fillRoundedRect(x - 3, rowY - 1, width + 6, rowHeight - 2, 4);
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
