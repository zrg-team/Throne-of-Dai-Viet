/**
 * The lane: the door in, the scrolling body every bar screen fills, and the door out.
 *
 * `openLane` is the single entry to all eight — build, heroes, court, battle, army, affairs,
 * chronicle, ledger — and `laneList` is the sheet they differ only in the contents of. Both ends
 * are one mechanism: `openLane` stashes `lanePauseBeforeOpen`, `closeLane` alone hands it back.
 * The room `laneList` takes off the scroll height and the offsets `finish` pins against
 * `GAME_HEIGHT` are the same numbers spent twice — the back button's 34, the toggle's 54 — so
 * moving one without the other prints the last row through the footer. Scroll areas opened here
 * go onto `self.activeScrollAreas`; only a teardown that destroys them takes their six scene-level
 * listeners off again.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT } from '../../../game/constants';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { openingFor, takeOpening } from '../../../systems/story/StorySystem';
import { storyText } from '../../../i18n/story';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap, type UIBounds } from '../../../ui/InkUI';
import { UI_FONT } from '../../../ui/fonts';
import { t } from '../../../i18n';
import type { AscentLane, Hero } from '../../../state/types';
import { LANE_CLOSE_BUTTON_HEIGHT, LANE_CLOSE_BUTTON_OFFSET, LANE_FOOTER_HEIGHT, cssHex } from '../constants';
import { clearLanePage } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';

/** The ghost "back" button a lane sub-page shows above its footer button. */
const LANE_BACK_BUTTON_HEIGHT = 34;
/**
 * A checkbox strip pinned above the footer button: box, label, and a hint under it.
 *
 * Tall enough for the hint to wrap to two lines. At 34 it did not, and the second line ran
 * under the Close button.
 */
const LANE_TOGGLE_HEIGHT = 54;
/** A fixed tab strip between the page heading and its scrolling body. */
const LANE_TABS_HEIGHT = 32;
const LANE_TABS_GAP = 8;
/** Width of the portrait column beside a hero row. */
const LANE_PORTRAIT_COLUMN = 62;

export function openLane(self: ConquestUIScene, lane: AscentLane): void {
  if (self.state.pendingAscentPrompt) return;
  // The bar only offers Battle while a siege is live, but the siege can end between the bar
  // being drawn and the button being released. Checking here as well means that race costs a
  // wasted tap rather than the whole screen.
  if (lane === 'battle' && !self.state.ascent?.activeBattle) return;

  self.lanePauseBeforeOpen = self.state.isStrategyPause;
  // Every lane freezes the world so the player can read it — except the battle, which *is* the
  // world happening. Pausing here stopped the economy tick, which stopped `advanceBattle`,
  // which froze the siege at beat 0 for as long as anyone watched it: the exact freeze this
  // whole design removed, reintroduced through the lane mechanism. Only caught by finally
  // opening the screen and waiting sixteen seconds.
  self.state.isStrategyPause = lane === 'battle' ? self.lanePauseBeforeOpen : true;
  self.beginOverlay(`lane:${lane}`);

  switch (lane) {
    case 'build': self.showBuildScreen(); break;
    case 'heroes': self.showHeroesScreen(); break;
    case 'court': self.showCourtScreen(); break;
    case 'battle': self.showBattle(); break;
    case 'army':
      // A plan handed over by the muster card opens on the form, filled in; any other entry
      // starts the lane clean.
      if (self.musterHandover) {
        self.musterDraft = self.musterHandover;
        self.musterHandover = undefined;
        self.showArmyScreen();
        self.showRaiseHostForm();
      } else {
        self.musterDraft = undefined;
        self.showArmyScreen();
      }
      break;
    case 'affairs': self.showAffairsScreen(); break;
    case 'chronicle': self.showChronicleScreen(); break;
    case 'ledger': self.showLedgerScreen(); break;
  }

  // Checked here as well as in `refresh` so a lane that declines to draw costs the player a
  // wasted tap rather than a blank screen until the next tick.
  if (self.modalLayer.length === 0) closeLane(self);
}

/**
 * The scrolling body every bar screen shares: a titled frame, a scroll area, and a helper
 * that appends one tappable row. Factored out so the five screens differ only in content.
 */
export function laneList(self: ConquestUIScene,
  title: string,
  subtitle: string,
  laneOpts: {
    /** A primary action in the close button's slot, in place of Close. */
    footer?: { label: string; onTap: () => void; disabled?: boolean };
    /**
     * A checkbox pinned just above the footer button, in the same thumb reach.
     *
     * A setting the player toggles while reading belongs at the foot for the same reason
     * the battle exits were moved there: the top of a phone is where a one-handed grip
     * cannot go without shifting, and a control nobody can reach is a control nobody uses.
     * The whole row is the hit area, label included.
     */
    footerToggle?: { label: string; hint?: string; checked: boolean; onToggle: () => void };
    /** A fixed tab strip for long screens that are easier to scan as separate shelves. */
    tabs?: {
      items: Array<{ label: string; count?: number }>;
      active: number;
      onSelect: (index: number) => void;
    };
    /** A ghost "back" above the footer button, for pages one step inside a lane. */
    back?: () => void;
  } = {},
): {
  content: UIBounds;
  addRow: (
    opts: { title: string; subtitle: string; border: number; muted?: boolean; portrait?: Hero },
    onTap?: () => void,
  ) => void;
  addHeading: (title: string, hint?: string) => void;
  addNote: (text: string, tone?: number) => void;
  addWidget: (
    height: number,
    build: (parent: Phaser.GameObjects.Container, width: number) => number | void,
  ) => void;
  finish: () => void;
} {
  const content = self.promptFrame(title, subtitle);
  const footerExtra = (laneOpts.back ? LANE_BACK_BUTTON_HEIGHT + 8 : 0)
    + (laneOpts.footerToggle ? LANE_TOGGLE_HEIGHT + 8 : 0);
  const tabsExtra = laneOpts.tabs ? LANE_TABS_HEIGHT + LANE_TABS_GAP : 0;
  const scroll = self.ui.scrollArea({
    x: content.x,
    y: content.y + tabsExtra,
    width: content.width,
    height: content.height - LANE_FOOTER_HEIGHT - footerExtra - tabsExtra,
  });
  scroll.addTo(self.modalLayer);
  self.activeScrollAreas.push(scroll);

  if (laneOpts.tabs) {
    const cfg = laneOpts.tabs;
    const gap = 4;
    const width = (content.width - gap * Math.max(0, cfg.items.length - 1)) / Math.max(1, cfg.items.length);
    cfg.items.forEach((item, index) => {
      const selected = index === cfg.active;
      const x = content.x + index * (width + gap);
      self.modalLayer.add(self.ui.panel({ x, y: content.y, width, height: LANE_TABS_HEIGHT }, selected
        ? {
            fill: INK_UI.goldLight,
            fillShade: INK_UI.gold,
            border: INK_UI.cinnabar,
            borderWidth: 1.6,
          }
        : {
            fill: INK_UI.parchment,
            fillAlpha: 0.35,
            border: INK_UI.softBrush,
            borderWidth: 1,
            muted: true,
          }));
      const count = item.count ?? 0;
      const label = count > 0 ? `${item.label} ${count}` : item.label;
      self.modalLayer.add(self.add.text(x + width / 2, content.y + LANE_TABS_HEIGHT / 2, label, {
        color: selected ? cssHex(INK_UI.cinnabarDark) : INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '9px',
        fontStyle: selected ? '700' : '600',
        align: 'center',
        wordWrap: { width: width - 6 },
      }).setOrigin(0.5));
      if (!selected) {
        const hit = self.add.rectangle(x, content.y, width, LANE_TABS_HEIGHT, INK_UI.brush, 0.001)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => cfg.onSelect(index));
        self.modalLayer.add(hit);
      }
    });
  }

  const rowWidth = content.width - 6;
  let y = 0;

  const addRow = (
    opts: { title: string; subtitle: string; border: number; muted?: boolean; portrait?: Hero },
    onTap?: () => void,
  ) => {
    // A portrait sits in its own column beside the card, so a hero row is recognisable at a
    // glance and the card's own auto-fit is untouched.
    const faceCol = opts.portrait ? LANE_PORTRAIT_COLUMN : 0;
    const row = self.ui.card({ x: faceCol, y, width: rowWidth - faceCol, height: 54 }, opts);
    const height = (row.getData('cardHeight') as number) ?? 54;
    let holder: Phaser.GameObjects.Container = row;
    if (opts.portrait) {
      holder = self.add.container(0, y);
      row.setPosition(faceCol, 0);
      holder.add(row);
      holder.add(renderHeroFaceInBox(self, opts.portrait, { x: 0, y: 2, width: faceCol - 6, height: Math.max(40, height - 4) }));
    }
    if (onTap) {
      const hit = self.add
        .rectangle(rowWidth / 2 - (opts.portrait ? 0 : 0), height / 2, rowWidth, height, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      if (opts.portrait) hit.setPosition(rowWidth / 2, height / 2);
      // A drag that ends over this row scrolled the list; it did not pick it.
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) {
          return;
        }
        onTap();
      });
      (opts.portrait ? holder : row).add(hit);
    }
    scroll.content.add(holder);
    y += height + 8;
  };

  /**
   * A divider between groups of rows — **not a row**.
   *
   * Written first as `addRow` with a muted border, which is the obvious thing and is wrong: a
   * card is a card, so the headings arrived as five more boxes in a column of boxes and the
   * screen read as a longer list rather than a divided one. A heading has to be a different
   * *kind* of mark, so it is set as small letter-spaced caps against the paper with a hairline
   * rule beside it, and no surface at all.
   */
  const addHeading = (headingTitle: string, hint?: string) => {
    // Air above the heading, but never above the first one — a gap at the top of the list reads
    // as the frame being misaligned.
    if (y > 0) {
      y += 14;
    }
    const label = self.add.text(2, y, headingTitle.toLocaleUpperCase(), {
      color: INK_UI_HEX.mutedText,
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: '700',
    }).setOrigin(0, 0);
    label.setLetterSpacing?.(1.6);
    scroll.content.add(label);

    // The rule runs from the end of the label to the far edge, so the heading sits *in* the line
    // rather than above it.
    const rule = self.add.graphics();
    rule.lineStyle(1, INK_UI.brush, 0.22);
    rule.lineBetween(label.width + 10, y + 6, rowWidth, y + 6);
    scroll.content.add(rule);
    y += 16;

    if (hint) {
      const note = self.add.text(2, y, hint, {
        color: INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '10px',
        wordWrap: { width: rowWidth - 4 },
      }).setOrigin(0, 0).setAlpha(0.85);
      scroll.content.add(note);
      y += note.height + 4;
    }
    y += 4;
  };

  /**
   * A statement in the list's flow: text on the paper, with no surface at all.
   *
   * Half of what these screens say is not a control — "no enemy host stands inside the realm's
   * sight", "the next wave lands in ten seasons", "the realm can court only so many provinces at
   * once". Given a card each, as they were, they read as things to press, and each one costs the
   * room of a thing you can press. A statement should take the room a sentence takes.
   */
  const addNote = (text: string, tone?: number) => {
    const note = self.add.text(2, y, text, {
      color: tone ? cssHex(tone) : INK_UI_HEX.mutedText,
      fontFamily: UI_FONT,
      fontSize: '11px',
      lineSpacing: 1,
      wordWrap: { width: rowWidth - 4 },
    }).setOrigin(0, 0);
    scroll.content.add(note);
    y += note.height + 8;
  };

  /**
   * A custom widget (a slider, a chart, a grid of tiles) slotted into the list's flow.
   *
   * The builder may RETURN its height, for anything whose size is only known once its text has
   * been measured — a two-column grid of tiles cannot be told how tall it is in advance, and
   * guessing leaves either a gap under it or the next block written over it. `height` stays as
   * the answer for widgets that do know.
   */
  const addWidget = (
    height: number,
    build: (parent: Phaser.GameObjects.Container, width: number) => number | void,
  ) => {
    const holder = self.add.container(0, y);
    const measured = build(holder, rowWidth);
    scroll.content.add(holder);
    y += (typeof measured === 'number' ? measured : height) + 8;
  };

  const finish = () => {
    scroll.setContentHeight(Math.max(content.height - LANE_FOOTER_HEIGHT - footerExtra - tabsExtra, y));
    if (laneOpts.footerToggle) {
      const cfg = laneOpts.footerToggle;
      const ty = GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET
        - (laneOpts.back ? LANE_BACK_BUTTON_HEIGHT + 8 : 0)
        - LANE_TOGGLE_HEIGHT - 8;
      // The whole strip is the target, not the 13px box: a checkbox you have to hit exactly is
      // a checkbox on a phone that misses.
      const hit = self.add.rectangle(content.x, ty, content.width, LANE_TOGGLE_HEIGHT,
        INK_UI.brush, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', cfg.onToggle);
      self.modalLayer.add(hit);

      const box = self.add.graphics();
      box.lineStyle(1.2, cfg.checked ? INK_UI.gold : INK_UI.softBrush, 1);
      box.strokeRect(content.x + 2, ty + 6, 14, 14);
      if (cfg.checked) {
        box.lineStyle(2, INK_UI.gold, 1);
        box.beginPath();
        box.moveTo(content.x + 5, ty + 13);
        box.lineTo(content.x + 8, ty + 16);
        box.lineTo(content.x + 14, ty + 8);
        box.strokePath();
      }
      self.modalLayer.add(box);

      // No `color: undefined` here. `InkUI.label` spreads these over the variant style, so an
      // undefined colour erases the ink and Phaser falls back to white — invisible on parchment.
      const style: Record<string, unknown> = { fontSize: '12px' };
      if (cfg.checked) style.fontStyle = '700';
      else style.color = INK_UI_HEX.mutedText;
      self.modalLayer.add(self.ui.label(content.x + 24, ty + 4, cfg.label, 'body', style));

      if (cfg.hint) {
        self.modalLayer.add(self.ui.label(content.x + 24, ty + 20, cfg.hint, 'caption', {
          fontSize: '10px',
          wordWrap: { width: content.width - 26 },
        }));
      }
    }

    if (laneOpts.back) {
      self.modalLayer.add(self.ui.button(
        {
          x: content.x,
          y: GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET - LANE_BACK_BUTTON_HEIGHT - 8,
          width: content.width,
          height: LANE_BACK_BUTTON_HEIGHT,
        },
        t('ascent.pick.back'),
        laneOpts.back,
        { variant: 'ghost', fontSize: '12px' },
      ));
    }
    if (laneOpts.footer) {
      const footer = laneOpts.footer;
      self.modalLayer.add(self.ui.button(
        {
          x: content.x,
          y: GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET,
          width: content.width,
          height: LANE_CLOSE_BUTTON_HEIGHT,
        },
        footer.label,
        () => { if (!footer.disabled) footer.onTap(); },
        { variant: footer.disabled ? 'disabled' : 'primary', fontSize: '13px' },
      ));
    } else {
      laneCloseButton(self, content);
    }
  };

  return { content, addRow, addHeading, addNote, addWidget, finish };
}

/** Standard footer for a lane browser: one button back to the map. */
function laneCloseButton(self: ConquestUIScene, content: UIBounds): void {
  self.modalLayer.add(self.ui.button(
    {
      x: content.x,
      y: GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET,
      width: content.width,
      height: LANE_CLOSE_BUTTON_HEIGHT,
    },
    t('ascent.lane.close'),
    () => closeLane(self),
    { variant: 'primary', fontSize: '13px' },
  ));
}

/** Leaves a lane browser, restoring whatever pause state the player had before opening it. */
export function closeLane(self: ConquestUIScene): void {
  // Leaving the battle screen unanswered is an answer: the generals fight on and the world
  // moves. The hold only ever lasts as long as the screen that asked for it.
  self.battleAwaitingOrder = false;
  // The drum belongs to the screen that raised it. Left running, it would start a fight the
  // player has walked away from — and call `buildBattleField` on a lane that no longer exists.
  self.battleOpeningTimer?.remove();
  self.battleOpeningTimer = undefined;
  self.state.isStrategyPause = self.lanePauseBeforeOpen;

  // In the arena there is nothing behind this screen. Closing it dropped the player onto a map
  // with one province, no economy and no way back — the fight *is* the session, so leaving it
  // means leaving the fight, not stepping out of it onto a world that is not there.
  if (self.openPromptKey === 'lane:aftermath') {
    self.dismissAftermath();
    return;
  }
  if (self.state.ascent?.arena && self.openPromptKey === 'lane:battle') {
    self.events.emit('ui:arena-leave');
    return;
  }
  self.closeOverlay();
}

/**
 * Draws the offer a story is hanging on this surface, if one is.
 *
 * `openingFor` used to be called from exactly one place — the land panel — so an opening
 * declared `on: 'treasury' | 'army' | 'rival'` existed in the catalogue and appeared nowhere in
 * the world. The whole design of an opening is that it waits somewhere the player already goes.
 */
export function addStoryOpening(self: ConquestUIScene,
  on: 'land' | 'hero' | 'army' | 'rival' | 'treasury',
  subjectId: string | undefined,
  addHeading: (label: string) => void,
  addRow: (opts: { title: string; subtitle: string; border: number }, onTap?: () => void) => void,
): void {
  const opening = openingFor(self.state, on, subjectId);
  if (!opening) return;
  addHeading(t('land.section.spokenOf'));
  addRow(
    {
      title: storyText(opening.actionKey, opening.params),
      subtitle: storyText(opening.textKey, opening.params),
      border: INK_UI.gold,
    },
    () => {
      if (takeOpening(self.state, opening.storyId, opening.fragmentId)) closeLane(self);
    },
  );
}

/** Replaces the current lane page with another, keeping the lane (and its pause) open. */
export function replaceLanePage(self: ConquestUIScene, build: () => void): void {
  clearLanePage(self);
  build();
}
