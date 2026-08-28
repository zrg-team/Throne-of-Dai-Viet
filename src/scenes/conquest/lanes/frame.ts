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
import { contestedFronts } from '../../../systems/ascent/battleReport';
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
/** One waiting decision, as a row. Tall enough to be a comfortable target on its own. */
const LANE_DOCK_ROW_HEIGHT = 30;
/** The "Đang chờ · n" line above them. */
const LANE_DOCK_LABEL_HEIGHT = 15;
/** Never more than three, whatever the lane offers. */
const LANE_DOCK_MAX_ITEMS = 3;
/**
 * A checkbox strip pinned above the footer button: box, label, and a hint under it.
 *
 * Tall enough for the hint to wrap to two lines. At 34 it did not, and the second line ran
 * under the Close button.
 */
const LANE_TOGGLE_HEIGHT = 54;
/**
 * A segmented picker pinned in the same footer band the toggle uses: heading, a row of tiles,
 * and a note under them. The court's standing course lives here — a choice the player changes
 * while reading belongs in the same thumb reach the consent checkboxes taught.
 */
const LANE_PICKER_HEIGHT = 78;
/** A fixed tab strip between the page heading and its scrolling body. */
const LANE_TABS_HEIGHT = 32;
const LANE_TABS_GAP = 8;
/** Width of the portrait column beside a hero row. */
const LANE_PORTRAIT_COLUMN = 62;

export function openLane(self: ConquestUIScene, lane: AscentLane): void {
  if (self.state.pendingAscentPrompt) return;
  // The Battle lane is two screens: the fight, when there is one, and the war board when there
  // is not. It used to be one screen and a dead button — and the screen opens for a measured
  // 6–15 of the 20–96 engagements a run settles, so for most of a wave the one control with
  // anything to say about the war refused to open at all. `showBattle` picks between them.
  //
  // The finished-fight ledger used to keep this door open on its own, and the board is not a
  // ledger any more — the page is the war being fought, so with no fight and no front there is
  // nothing behind the button but a heading.
  if (lane === 'battle' && !self.state.ascent?.activeBattle
    && contestedFronts(self.state).length === 0) return;

  self.lanePauseBeforeOpen = self.state.isStrategyPause;
  // Every lane freezes the world so the player can read it — except the battle, which *is* the
  // world happening. Pausing here stopped the economy tick, which stopped `advanceBattle`,
  // which froze the siege at beat 0 for as long as anyone watched it: the exact freeze this
  // whole design removed, reintroduced through the lane mechanism. Only caught by finally
  // opening the screen and waiting sixteen seconds.
  //
  // **And the battle lane does not merely decline to pause — it un-pauses.** It used to carry
  // whatever hold was in force when it opened, which is right for a screen you are reading and
  // wrong for the one screen that *is* the world: any stray strategy pause (a lane closed onto
  // it, a board, a card) reopened the fight frozen at beat 15 with the only working control
  // reading "Tiếp tục". Reported verbatim: *fight stop in middle, nothing to do.* Walking into a
  // fight is an instruction to fight it; the opening drum sets its own hold a moment later
  // (`maybeAutoOpenBattle`), and the player's own Pause is still theirs to press.
  if (lane === 'battle') {
    self.lanePauseBeforeOpen = false;
    self.state.isStrategyPause = false;
    // And the hard clock with it. `isWorldHalted` reads both, so clearing only the strategy
    // pause still opened the fight frozen — for a player who had pressed Pause on the map, or
    // for one whose last card left `isPaused` set. This screen has its own Pause.
    self.state.isPaused = false;
  } else {
    self.state.isStrategyPause = true;
  }
  self.beginOverlay(`lane:${lane}`);

  buildLanePage(self, () => {
    switch (lane) {
      case 'build': {
        // Opened from the map's inspect card, the lane starts on the province that was tapped —
        // and on the picker the button named, rather than on the realm-wide list the player would
        // then have to find that province in again.
        const handover = self.landHandover;
        self.landHandover = undefined;
        if (handover?.page === 'governor') self.showGovernorPicker(handover.landId);
        else if (handover?.page === 'focus') self.showFocusPicker(handover.landId);
        else if (handover) self.showBuildOptions(handover.landId);
        else self.showBuildScreen();
        break;
      }
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
  });

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
    /**
     * A segmented choice pinned above the footer button, in the toggle's slot — for the one
     * standing setting on a page that has more than two answers.
     */
    footerPicker?: { label: string; options: string[]; note: string; selected: number; onPick: (index: number) => void };
    /** A fixed tab strip for long screens that are easier to scan as separate shelves. */
    tabs?: {
      items: Array<{ label: string; count?: number }>;
      active: number;
      onSelect: (index: number) => void;
    };
    /**
     * **What this lane is waiting on, listed at the foot where a thumb already is.**
     *
     * The lane pages read top-down and act bottom-up. A page opens on its title and its numbers —
     * things you read, and reading needs no reach — while everything that answers the player sits
     * in the band a one-handed grip can actually get to. Measured against the live surface (390
     * wide, 620–1040 tall), the top third of a lane is about a thousand units from a resting
     * thumb: putting the important decision *first* put it exactly where it could not be pressed.
     *
     * So the decisions waiting on the player are listed here, each one a row that goes straight to
     * the thing that answers it, and the dock is absent entirely when nothing is waiting. Drawn
     * above the close button and the rest of the footer stack, all of which keep their existing
     * places and behaviour.
     */
    dock?: { label: (shown: number) => string; items: Array<{ label: string; hint?: string; onPress: () => void }> };
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
  // A lane takes the readout band too — see `promptFrame`. A page you opened to work in has no
  // use for the between-decisions numbers, and forty-eight points is the difference between four
  // rows and five on a 620-high screen.
  const content = self.promptFrame(title, subtitle, { coverReadout: true });
  // At most three. A dock that grows without limit is a second page pinned over the first, and the
  // point of it is to be the short answer to "what now" — the lane itself is where everything else
  // lives.
  const dockItems = (laneOpts.dock?.items ?? []).slice(0, LANE_DOCK_MAX_ITEMS);
  const dockHeight = dockItems.length > 0
    ? LANE_DOCK_LABEL_HEIGHT + dockItems.length * LANE_DOCK_ROW_HEIGHT + 8
    : 0;
  const footerExtra = (laneOpts.back ? LANE_BACK_BUTTON_HEIGHT + 8 : 0)
    + (laneOpts.footerToggle ? LANE_TOGGLE_HEIGHT + 8 : 0)
    + (laneOpts.footerPicker ? LANE_PICKER_HEIGHT + 8 : 0)
    + dockHeight;
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

    if (dockItems.length > 0) {
      // Top of the footer stack, so everything already down there keeps the offset it had — the
      // close button, the back, the toggle and the picker are all measured from the bottom edge
      // and none of them move.
      const dockTop = GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET
        - (laneOpts.back ? LANE_BACK_BUTTON_HEIGHT + 8 : 0)
        - (laneOpts.footerToggle ? LANE_TOGGLE_HEIGHT + 8 : 0)
        - (laneOpts.footerPicker ? LANE_PICKER_HEIGHT + 8 : 0)
        - dockHeight;

      self.modalLayer.add(self.add.text(
        content.x + 2, dockTop,
        // Composed from the *shown* count, not the caller's. The list is capped at
        // `LANE_DOCK_MAX_ITEMS`, and a heading that says four above three rows is a heading the
        // player has to reconcile.
        laneOpts.dock?.label?.(dockItems.length) ?? t('ascent.lane.waiting', { n: dockItems.length }),
        {
          color: cssHex(INK_UI.cinnabarDark), fontFamily: UI_FONT,
          fontSize: '9px', fontStyle: '700',
        },
      ).setOrigin(0, 0));

      dockItems.forEach((item, index) => {
        const rowY = dockTop + LANE_DOCK_LABEL_HEIGHT + index * LANE_DOCK_ROW_HEIGHT;
        self.modalLayer.add(self.ui.panel(
          { x: content.x, y: rowY, width: content.width, height: LANE_DOCK_ROW_HEIGHT - 3 },
          { fill: INK_UI.parchment, fillAlpha: 0.5, border: INK_UI.cinnabar, borderWidth: 1.4 },
        ));
        self.modalLayer.add(self.add.text(
          content.x + 9, rowY + (LANE_DOCK_ROW_HEIGHT - 3) / 2, item.label,
          {
            color: cssHex(INK_UI.cinnabarDark), fontFamily: UI_FONT,
            fontSize: '11px', fontStyle: '600',
            wordWrap: { width: content.width - 32 },
          },
        ).setOrigin(0, 0.5));
        self.modalLayer.add(self.add.text(
          content.x + content.width - 10, rowY + (LANE_DOCK_ROW_HEIGHT - 3) / 2, '›',
          { color: cssHex(INK_UI.cinnabar), fontFamily: UI_FONT, fontSize: '15px' },
        ).setOrigin(1, 0.5));

        // The whole row, and on the press — the same as every other control in this mode. The
        // teardown that follows swallows the rest of the gesture (see `clearLanePage`), so the
        // release cannot go on to press whatever the new page puts under the finger.
        const hit = self.add.rectangle(
          content.x, rowY, content.width, LANE_DOCK_ROW_HEIGHT - 3, INK_UI.brush, 0.001,
        ).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          item.onPress();
        });
        self.modalLayer.add(hit);
      });
    }

    if (laneOpts.footerPicker) {
      const cfg = laneOpts.footerPicker;
      // Stacked above whatever else the footer band holds: close at the bottom, then back,
      // then the toggle, then this — the same order the heights were spent in.
      const py = GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET
        - (laneOpts.back ? LANE_BACK_BUTTON_HEIGHT + 8 : 0)
        - (laneOpts.footerToggle ? LANE_TOGGLE_HEIGHT + 8 : 0)
        - LANE_PICKER_HEIGHT - 8;
      const holder = self.add.container(content.x, py);
      self.segmentedRow(holder, content.width, {
        label: cfg.label,
        options: cfg.options,
        note: cfg.note,
        selected: cfg.selected,
        onPick: cfg.onPick,
      });
      self.modalLayer.add(holder);
    }
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

/**
 * Replaces the current lane page with another, keeping the lane (and its pause) open.
 *
 * **The press that turned the page does not get to press the page it turned to.**
 *
 * Reported with a screenshot: *Lập quân -> Quay lại -> it also clicks the checkbox "Lập quân:
 * tướng hỏi trước" on the Quân đội page.* Both pages live on the modal layer, so the sheet rule in
 * `ui/inputGeneration` — which asks whether the press began *behind* a sheet — cannot see this at
 * all: the press began on a sheet and the release landed on a sheet. What changed underneath the
 * finger was the page.
 *
 * The Back button acts on `pointerdown` (`InkUI.button`); `clearLanePage` destroys the form and
 * `build` draws the parent page in its place, all before the finger lifts. The parent's checkbox is
 * then sitting under the pointer, and it acts on the release.
 *
 * A page turn is a teardown like any other, so it swallows the rest of the gesture the same way an
 * overlay transition does.
 */
export function replaceLanePage(self: ConquestUIScene, build: () => void): void {
  // `clearLanePage` swallows the rest of the gesture — see the note there.
  clearLanePage(self);
  buildLanePage(self, build);
}

/**
 * Builds a lane page, and guarantees a way out of whatever gets built.
 *
 * **A page has no Close button until `finish()` runs.** So anything that throws while a page is
 * filling itself in — one bad row out of nine, a hero the portrait code cannot resolve, a land
 * that marched out from under a lookup — leaves rows on the screen, `openPromptKey` still
 * `lane:…`, the world held by the lane, and no control that ends any of it. `refresh`'s recovery
 * cannot see it either: that guard fires on an *empty* modal layer, and this layer is not empty,
 * it is half a page. Reported verbatim: *Chiến sự page crash sometime — I can do nothing*, and
 * again for Tiếp viện.
 *
 * The throw is still reported to the console, so the harnesses' `no console errors` check catches
 * it and it gets fixed properly — this is a floor under the player, not a way of not knowing.
 */
function buildLanePage(self: ConquestUIScene, build: () => void): void {
  try {
    build();
    return;
  } catch (error) {
    console.error('[lane] page failed to build', error);
    try {
      clearLanePage(self);
      const { addNote, finish } = laneList(self, t('ascent.lane.brokenTitle'), t('ascent.lane.brokenBody'), {});
      addNote(String((error as { message?: string })?.message ?? error));
      finish();
    } catch (fallbackError) {
      // Even the apology would not draw. Leaving is the only thing left that helps.
      console.error('[lane] recovery page failed too', fallbackError);
      clearLanePage(self);
      closeLane(self);
    }
  }
}
