import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import type { TranslationKey } from '../i18n';
import { t } from '../i18n';
import { InkUI, INK_UI, INK_UI_HEX, type UIBounds } from './InkUI';
import { TITLE_FONT, UI_FONT } from './fonts';

export interface CopilotStep {
  id: string;
  heading: TranslationKey;
  body: TranslationKey;
  /**
   * What this card is about, as a rectangle on the page.
   *
   * A thunk rather than a value because the front page is laid out by flow — the column is
   * measured against the sheet's actual height and the language's actual line count — so nothing
   * on it has a y a caller could write down in advance. Returning `undefined` is legal and means
   * the card has no subject: the first and last steps are about the page as a whole.
   */
  target?: () => UIBounds | undefined;
  /**
   * Which end of the sheet the card sits at when it has no subject to point at.
   *
   * `bottom` is the default and is right for a card about the page as a whole. `top` exists for
   * the cards that explain a decision the player is looking at: those prompts put their options
   * low on the screen, and a card at the bottom lands squarely on top of the three things it is
   * describing — the reader is told to compare them while they are covered up.
   */
  placement?: 'top' | 'bottom';
}

export interface CopilotOptions {
  steps: readonly CopilotStep[];
  /** The last card's second button. Omitted, the card carries only its finish button. */
  onGuide?: () => void;
  /**
   * What the final card's button says. Defaults to "Start playing".
   *
   * A walkthrough is several of these in sequence, one per moment of the run, and each is its own
   * `Copilot` — so every one of them thinks it is the last. Left to the default, a card explaining
   * the throne offers to start a game the player is already inside.
   */
  finishLabel?: TranslationKey;
  /** Finished or skipped, both. The caller marks it seen; the tour does not touch storage. */
  onClose: () => void;
}

/** Above every other thing either scene puts on the glass. */
const DEPTH = 900;
const CARD_WIDTH = GAME_WIDTH - 40;
const PAD = 16;

/**
 * The first-run tour: five cards that say what the front page is and how the game is played.
 *
 * **It exists because the front page is five buttons and a picture, and four of the five are not
 * self-explanatory to anyone who has not played this.** "Dragon Ascent" does not say *start here*,
 * "Classic Modes" does not say what a classic mode is, and the two most useful things on the page
 * for a new player — the manual and the language switch — are the two smallest marks on it. A
 * front page can be beautiful and still be a locked door.
 *
 * Five cards, and they are a hard limit rather than a starting point. A tour is a toll on the way
 * to the thing the player actually came for, and every card past the point where they have got the
 * idea is a card that teaches them to dismiss the next one unread. It is also shown exactly once,
 * skippable from the first card, and re-runnable from the manual — three different ways of saying
 * the same thing, which is that the player is allowed to not want this.
 *
 * The dim is drawn as four rectangles *around* the subject rather than one across the whole sheet
 * with a hole punched in it. Same picture, but Phaser has no even-odd fill and a `BlendModes.ERASE`
 * hole needs the veil on its own render texture — four rects is the version that cannot go wrong
 * on a device whose driver disagrees about blend modes.
 *
 * Input is blocked wholesale while the tour is up, including over the lit rectangle. A spotlight
 * that is also pressable turns a tour into a quiz, and the one thing a player must not have to do
 * here is guess which of the two overlapping interfaces is listening.
 */
export class Copilot {
  private readonly ui: InkUI;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private index = 0;
  private closed = false;

  constructor(private readonly scene: Phaser.Scene, private readonly opts: CopilotOptions) {
    this.ui = new InkUI(scene);
    this.renderStep();
  }

  destroy(): void {
    this.clear();
    this.closed = true;
  }

  private clear(): void {
    for (const object of this.objects) {
      object.destroy();
    }
    this.objects = [];
  }

  private close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.clear();
    this.opts.onClose();
  }

  private renderStep(): void {
    this.clear();
    const step = this.opts.steps[this.index];
    if (!step) {
      this.close();
      return;
    }
    const last = this.index === this.opts.steps.length - 1;
    const target = step.target?.();

    this.renderVeil(target);
    this.renderCard(step, target, last);
  }

  /** The dim, and the son frame round whatever this card is about. */
  private renderVeil(target?: UIBounds): void {
    const veil = this.scene.add.graphics().setDepth(DEPTH);
    veil.fillStyle(INK_UI.overlay, 0.82);
    if (!target) {
      veil.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    } else {
      // 6 units of air round the subject, so the frame sits off the button rather than on it.
      const box = {
        x: target.x - 6,
        y: target.y - 6,
        width: target.width + 12,
        height: target.height + 12,
      };
      veil.fillRect(0, 0, GAME_WIDTH, box.y);
      veil.fillRect(0, box.y + box.height, GAME_WIDTH, GAME_HEIGHT - box.y - box.height);
      veil.fillRect(0, box.y, box.x, box.height);
      veil.fillRect(box.x + box.width, box.y, GAME_WIDTH - box.x - box.width, box.height);
      veil.lineStyle(2, INK_UI.cinnabar, 0.9);
      veil.strokeRoundedRect(box.x, box.y, box.width, box.height, 10);
    }
    this.objects.push(veil);

    // Everything under the tour is deaf while it is up, the lit rectangle included.
    const blocker = this.scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setDepth(DEPTH)
      .setInteractive();
    blocker.on('pointerdown', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation());
    this.objects.push(blocker);
  }

  /**
   * The card, placed clear of its subject.
   *
   * Below it if there is room, above it if there is not, and low on the sheet when the card has no
   * subject at all. Measured rather than chosen: the front page's column moves with the viewport
   * height and the language, so a card at a written-down y would sit on the very button it is
   * pointing at on some perfectly ordinary phone.
   */
  private renderCard(step: CopilotStep, target: UIBounds | undefined, last: boolean): void {
    const bodyWidth = CARD_WIDTH - PAD * 2;
    const heading = this.scene.add.text(0, 0, t(step.heading), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '17px',
      fontStyle: '700',
      wordWrap: { width: bodyWidth },
    });
    const body = this.scene.add.text(0, 0, t(step.body), {
      color: '#4a3b28',
      fontFamily: UI_FONT,
      fontSize: '12px',
      lineSpacing: 4,
      wordWrap: { width: bodyWidth },
    });

    const BUTTON_H = 34;
    const height = PAD + heading.height + 6 + body.height + 14 + BUTTON_H + PAD;
    const x = (GAME_WIDTH - CARD_WIDTH) / 2;

    const below = target ? target.y + target.height + 18 : 0;
    const above = target ? target.y - 18 - height : 0;
    const y = !target
      ? (step.placement === 'top' ? 28 : GAME_HEIGHT - height - 28)
      : below + height <= GAME_HEIGHT - 16 ? below
      : above >= 16 ? above
      : Math.round((GAME_HEIGHT - height) / 2);

    const panel = this.ui.panel({ x, y, width: CARD_WIDTH, height }, {
      fill: INK_UI.parchment,
      fillShade: INK_UI.parchmentDark,
      border: INK_UI.brush,
      borderWidth: 2,
      radius: 10,
    }).setDepth(DEPTH + 1);
    this.objects.push(panel);

    heading.setPosition(x + PAD, y + PAD).setDepth(DEPTH + 2);
    body.setPosition(x + PAD, heading.y + heading.height + 6).setDepth(DEPTH + 2);
    this.objects.push(heading, body);

    const row = y + height - PAD - BUTTON_H;

    // The counter, and the only thing on the card that is not a sentence or a button. It answers
    // the question a tour is always being asked, which is how much longer this goes on for.
    //
    // Omitted for a single card, where "1 of 1" answers a question nobody asked and reads as the
    // start of a sequence that never arrives.
    const counter = this.opts.steps.length > 1
      ? this.scene.add.text(x + PAD, row + BUTTON_H / 2, t('copilot.step', {
        n: this.index + 1,
        total: this.opts.steps.length,
      }), {
        color: INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '10px',
      }).setOrigin(0, 0.5).setDepth(DEPTH + 2)
      : undefined;
    if (counter) this.objects.push(counter);

    // Skip stays a quiet phrase rather than becoming a button, on every card including the last.
    // A tour whose exit is as loud as its Next is a tour that expects to be escaped from.
    const skip = this.ui.textLink(
      x + PAD + (counter ? counter.width + 12 : 0),
      row + BUTTON_H / 2,
      t('copilot.skip'),
      () => this.close(),
      { fontSize: '11px' },
    );
    skip.setDepth(DEPTH + 2);
    this.objects.push(skip);

    const advance = () => {
      this.index += 1;
      if (this.index >= this.opts.steps.length) {
        this.close();
        return;
      }
      this.renderStep();
    };

    const nextWidth = 104;
    const nextX = x + CARD_WIDTH - PAD - nextWidth;
    const next = this.ui.button(
      { x: nextX, y: row, width: nextWidth, height: BUTTON_H },
      last ? t(this.opts.finishLabel ?? 'copilot.done') : t('copilot.next'),
      last ? () => this.close() : advance,
      { variant: 'primary', fontSize: '13px' },
    ).setDepth(DEPTH + 2);
    this.objects.push(next);

    // The manual, offered once, on the card where the player has just been told it exists.
    if (last && this.opts.onGuide) {
      // 128, not 96. This button no longer says "How to play" — it says "How to play now", and in
      // Vietnamese "Chỉ ta chơi ngay", either of which wrapped to two lines inside 96 and left the
      // card looking like one of its two buttons had broken. The row still fits: the card is 350
      // wide, the pair comes to 128 + 8 + 104 = 240, and the counter beside them needs about 40.
      const guideWidth = 128;
      const guide = this.ui.button(
        { x: nextX - 8 - guideWidth, y: row, width: guideWidth, height: BUTTON_H },
        t('copilot.guide'),
        () => {
          const open = this.opts.onGuide;
          this.close();
          open?.();
        },
        { variant: 'ghost', fontSize: '12px' },
      ).setDepth(DEPTH + 2);
      this.objects.push(guide);
      // Skip and the counter share the row with two buttons on this card alone. Hidden rather than
      // squeezed: the finish button *is* the exit here, so the quiet phrase beside it would be a
      // second way to do the same thing in less space than either deserves.
      skip.setVisible(false);
    }
  }
}
