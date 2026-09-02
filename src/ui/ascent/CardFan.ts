import Phaser from 'phaser';
import { CARD_FACE_H, CARD_FACE_W, stampCardFace } from '../cardFace';
import { INK_UI, INK_UI_HEX } from '../InkUI';
import { UI_FONT } from '../fonts';
import { designLength } from '../../game/graphicsQuality';
import { soundDirector } from '../sound/SoundDirector';

/**
 * A hand of baked card faces fanned across the bottom of a sheet, held the way a hand holds
 * cards. The draft and the ceremony's bind step both use it, so the gestures are learned once:
 *
 *   · slide a finger (or the mouse) across the fan — the card under it rises and glows;
 *   · double-tap the risen card, flick it upward, or press the button floating over it — take.
 *
 * A single tap only ever *raises*. The first fan took the second tap on a raised card as the
 * take, which meant browsing with taps was one slip away from spending the draft — and these
 * choices are permanent. Every deliberate gesture (double-tap, upward flick, the button) is one
 * a browsing finger does not make by accident, which is the same reasoning as `optionCard`'s
 * hold guard, expressed for a hand of cards.
 *
 * Every face is a single stamped texture (`cardFace.ts`) — a five-card fan costs the renderer
 * five quads, and nothing here draws per frame. The geometry is clamped to the given area
 * *including* the raise lift, the fan's arc and the grown scale of the raised card, so the hand
 * can never print into the footer buttons below it: the raised card grows around its own foot,
 * not past it.
 */
export interface CardFanOptions {
  /** Area the fan occupies, in the parent's space. Everything, lifted and grown, stays inside. */
  x: number;
  y: number;
  width: number;
  height: number;
  cards: { id: string; level?: 1 | 2 | 3 }[];
  /** Which card opens raised — the draft raises an evolution-ready card by default. */
  initial?: number;
  /** A different card was raised — refresh whatever describes it. */
  onRaise?: (index: number) => void;
  /** The raised card was deliberately taken. */
  onTake: (index: number) => void;
  /** Label for the button floating over the raised card. Omitted, no button is shown. */
  takeLabel?: string;
}

/** How far a raised card lifts out of the hand. */
const RAISE_LIFT = 26;
/** The outermost cards' tilt; inner cards take their proportional share, the centre stands 0. */
const MAX_TILT = 16;
/** How far the arc drops the outermost cards below the centre one. */
const ARC_DROP = 26;
/** The raised card's growth — around its own foot, so the growth spends the lift, not the footer. */
const RAISE_SCALE = 1.12;
/** Air kept under the lowest card, so a tilted corner cannot kiss the buttons below. */
const BOTTOM_PAD = 6;
/** Two taps this close on the same raised card are a take. */
const DOUBLE_TAP_MS = 350;
/** An upward travel this long is a flick, and a flick is a take. */
const FLICK_UP = 44;
/**
 * The most a flick may take, wall-clock. Generous on purpose: nothing in the fan's area
 * scrolls, so direction and distance are the real discriminators — the window only rules out a
 * finger that pressed, wandered off, and came back. Measured: 500ms rejected a deliberate flick
 * dragged at frame rate (headless frames stretched an eight-step swipe to a full second, and a
 * slow human swipe-up is no faster).
 */
const FLICK_WINDOW_MS = 1200;

export class CardFan {
  readonly view: Phaser.GameObjects.Container;
  private slots: {
    container: Phaser.GameObjects.Container;
    highlight: Phaser.GameObjects.Graphics;
    /** The hand-held look: the pre-tilted bake. Visible while the card rests in the fan. */
    tilted?: Phaser.GameObjects.Image;
    /** The straight bake the raise cross-fades to — never a live `angle`, see `cardFace.ts`. */
    straight?: Phaser.GameObjects.Image;
    x: number;
    y: number;
  }[] = [];
  private takeButton?: Phaser.GameObjects.Container;
  private takeButtonWidth = 0;
  private lastTap?: { index: number; at: number };
  /** The card a press began on, in raw pointer space — judged at release, wherever that lands. */
  private pressed?: { index: number; x: number; y: number; at: number };
  private readonly cardW: number;
  private readonly cardH: number;
  raised = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly opts: CardFanOptions) {
    this.view = scene.add.container(opts.x, opts.y);

    const n = opts.cards.length;
    // The whole envelope is budgeted first: lift above, arc and pad below, growth on the raise.
    const maxH = Math.min(opts.height - RAISE_LIFT - ARC_DROP - BOTTOM_PAD, 196);
    // The hand is generous like a real one — cards overlap well past half — because the depth
    // order below is centre-out: rotation fans the top corners apart, so every buried card
    // still shows its head, and a hover raises any of them to full size.
    const maxWByCount = Math.floor(opts.width / (1 + (n - 1) * 0.42));
    this.cardW = Math.min(Math.round(maxH * (CARD_FACE_W / CARD_FACE_H)), maxWByCount);
    this.cardH = Math.round(this.cardW * (CARD_FACE_H / CARD_FACE_W));
    const span = Math.max(0, opts.width - this.cardW);

    opts.cards.forEach((card, index) => {
      const centre = n <= 1 ? 0.5 : index / (n - 1);
      const tilt = (centre - 0.5) * 2 * MAX_TILT;
      const x = Math.round(centre * span);
      // A curved arc, not a V: the drop eases in toward the edges the way cards pivoting about
      // a wrist actually sit.
      const y = RAISE_LIFT + Math.round(Math.pow(Math.abs(centre - 0.5) * 2, 1.6) * ARC_DROP);
      const container = scene.add.container(x, y);

      // Two bakes of the same face: the tilted one rests in the hand, the straight one is what
      // a raise cross-fades to. Both are axis-aligned quads — the container never rotates.
      const box = { x: 0, y: 0, width: this.cardW, height: this.cardH };
      const tilted = stampCardFace(scene, card.id, box, card.level, tilt);
      if (tilted) container.add(tilted);
      const straight = stampCardFace(scene, card.id, box, card.level, 0);
      if (straight) {
        straight.setAlpha(0);
        container.add(straight);
      }

      // The glow that answers "which one am I on": drawn once, toggled, never repainted.
      const highlight = scene.add.graphics();
      highlight.lineStyle(6, INK_UI.gold, 0.28);
      highlight.strokeRoundedRect(-4, -4, this.cardW + 8, this.cardH + 8, 12);
      highlight.lineStyle(2.5, INK_UI.gold, 0.95);
      highlight.strokeRoundedRect(-2, -2, this.cardW + 4, this.cardH + 4, 11);
      highlight.setVisible(false);
      container.add(highlight);

      const zone = scene.add.zone(0, 0, this.cardW, this.cardH).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      // The browse gesture: entering a card raises it — a mouse by hovering, a thumb by
      // sliding across the fan. Phaser fires `pointerover` for both.
      zone.on('pointerover', () => {
        if (this.raised !== index) this.raise(index);
      });
      // Only the press-down is read on the card itself. The release is judged at the scene's
      // own stream, because a flick's whole point is that the finger lets go somewhere *above*
      // the card — where the card's zone never hears the up.
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.pressed = { index, x: pointer.x, y: pointer.y, at: scene.time.now };
      });
      container.add(zone);

      this.view.add(container);
      this.slots.push({
        container,
        highlight,
        ...(tilted ? { tilted } : {}),
        ...(straight ? { straight } : {}),
        x,
        y,
      });
    });

    const onSceneUp = (pointer: Phaser.Input.Pointer): void => this.onRelease(pointer);
    scene.input.on('pointerup', onSceneUp);
    scene.input.on('pointerupoutside', onSceneUp);
    // The fan is torn down with the modal layer; the scene's stream outlives it, so the
    // listeners must not — a dead fan answering the next prompt's release is a ghost tap.
    this.view.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.input.off('pointerup', onSceneUp);
      scene.input.off('pointerupoutside', onSceneUp);
    });

    if (opts.takeLabel) this.buildTakeButton(opts.takeLabel);
    this.raise(Math.min(Math.max(0, opts.initial ?? 0), n - 1), true);
  }

  /** One press, three readings: an upward flick takes, a quick second tap takes, a tap raises. */
  private onRelease(pointer: Phaser.Input.Pointer): void {
    const pressed = this.pressed;
    this.pressed = undefined;
    if (!pressed) return;

    // Distances in design units, not raw pixels — the render scale doubles or triples the raw
    // deltas on exactly the phones this is for, and a flick threshold must not.
    const rose = designLength(pressed.y - pointer.y);
    const drifted = Math.abs(designLength(pointer.x - pressed.x));
    const dt = this.scene.time.now - pressed.at;
    if (rose > FLICK_UP && drifted < 70 && dt < FLICK_WINDOW_MS) {
      this.raise(pressed.index);
      this.takeAt(pressed.index);
      return;
    }
    // Anything that travelled is a browse or an abandoned flick, not a tap.
    if (rose > 14 || drifted > 14 || -rose > 24) return;

    const now = this.scene.time.now;
    const doubled = this.raised === pressed.index
      && this.lastTap?.index === pressed.index
      && now - this.lastTap.at < DOUBLE_TAP_MS;
    this.lastTap = { index: pressed.index, at: now };
    if (doubled) {
      this.takeAt(pressed.index);
      return;
    }
    if (this.raised !== pressed.index) this.raise(pressed.index);
  }

  /**
   * A card is taken — by flick, by double-tap, by the pill, or by the page's own footer.
   *
   * All four gestures come through here so the sound cannot end up on three of them, which is
   * exactly how the mode ended up with silent cards in the first place. The card voice, not the
   * button's: a card leaving a hand is stiffer paper than a sheet on a desk.
   */
  private takeAt(index: number): void {
    soundDirector.card();
    this.opts.onTake(index);
  }

  /** The pill that floats over the raised card — the gesture said as a button. */
  private buildTakeButton(label: string): void {
    const button = this.scene.add.container(0, 0);
    const text = this.scene.add.text(0, 0, label, {
      color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '12px', fontStyle: '700',
    }).setOrigin(0.5);
    const w = Math.max(86, text.width + 30);
    const h = 30;
    this.takeButtonWidth = w;
    const pill = this.scene.add.graphics();
    pill.fillStyle(INK_UI.parchment, 0.97);
    pill.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    pill.lineStyle(2, INK_UI.gold, 0.95);
    pill.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    button.add(pill);
    button.add(text);
    const zone = this.scene.add.zone(-w / 2, -h / 2, w, h).setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.takeAt(this.raised));
    button.add(zone);
    this.view.add(button);
    this.takeButton = button;
  }

  /** Raises one card — glow on, neighbours settled back, the take button following it. */
  raise(index: number, instant = false): void {
    this.raised = index;
    this.slots.forEach((slot, i) => {
      const up = i === index;
      slot.highlight.setVisible(up);
      // Growth is anchored to the card's own foot and centre: the lift above pays for it, and
      // the bottom edge never moves toward the buttons below the fan.
      const scale = up ? RAISE_SCALE : 1;
      const target = {
        x: slot.x - (up ? (this.cardW * (scale - 1)) / 2 : 0),
        y: up ? slot.y - RAISE_LIFT - this.cardH * (scale - 1) : slot.y,
        scale,
      };
      // A sweep across five cards starts five tweens in a breath — each new one must own its
      // card outright or the pile-up leaves cards drifting to stale targets.
      this.scene.tweens.killTweensOf(slot.container);
      if (slot.tilted) this.scene.tweens.killTweensOf(slot.tilted);
      if (slot.straight) this.scene.tweens.killTweensOf(slot.straight);
      if (instant) {
        slot.container.setPosition(target.x, target.y).setScale(target.scale);
        slot.tilted?.setAlpha(up ? 0 : 1);
        slot.straight?.setAlpha(up ? 1 : 0);
      } else {
        this.scene.tweens.add({
          targets: slot.container,
          x: target.x, y: target.y, scale: target.scale,
          duration: 160, ease: 'Quad.easeOut',
        });
        // The straighten, as a cross-fade between the two bakes — the smooth read of a card
        // turning in the hand, without a rotated quad ever reaching the batcher.
        if (slot.tilted) {
          this.scene.tweens.add({ targets: slot.tilted, alpha: up ? 0 : 1, duration: 160, ease: 'Quad.easeOut' });
        }
        if (slot.straight) {
          this.scene.tweens.add({ targets: slot.straight, alpha: up ? 1 : 0, duration: 160, ease: 'Quad.easeOut' });
        }
      }
    });
    this.restack();

    if (this.takeButton) {
      const slot = this.slots[index];
      const bx = Phaser.Math.Clamp(
        slot.x + (this.cardW * RAISE_SCALE) / 2 - (this.cardW * (RAISE_SCALE - 1)) / 2,
        this.takeButtonWidth / 2 + 2,
        this.opts.width - this.takeButtonWidth / 2 - 2,
      );
      const by = slot.y - RAISE_LIFT - this.cardH * (RAISE_SCALE - 1) - 18;
      this.scene.tweens.killTweensOf(this.takeButton);
      if (instant) {
        this.takeButton.setPosition(bx, by).setAlpha(1);
      } else {
        this.takeButton.setAlpha(0.4);
        this.scene.tweens.add({
          targets: this.takeButton,
          x: bx, y: by, alpha: 1,
          duration: 160, ease: 'Quad.easeOut',
        });
      }
      this.view.bringToTop(this.takeButton);
    }
    this.opts.onRaise?.(index);
  }

  /**
   * The hand's depth order: **centre-out**, the way a fan of cards is actually held — the
   * middle card in front, each pair further out layered behind it symmetrically. The first
   * version stacked in list order, so every card was buried by its right-hand neighbour and
   * the whole hand leaned; symmetric layering is most of what makes a fan read as tidy.
   * The raised card then comes to the very front, and the take-pill above everything — topmost
   * wins the overlap for the eye and for the hit test alike.
   */
  private restack(): void {
    const centre = (this.slots.length - 1) / 2;
    [...this.slots.keys()]
      .sort((a, b) => Math.abs(b - centre) - Math.abs(a - centre))
      .forEach((i) => this.view.bringToTop(this.slots[i].container));
    this.view.bringToTop(this.slots[this.raised].container);
    if (this.takeButton) this.view.bringToTop(this.takeButton);
  }

  /** Takes whatever is raised — a footer confirm button routes here. */
  take(): void {
    this.takeAt(this.raised);
  }
}
