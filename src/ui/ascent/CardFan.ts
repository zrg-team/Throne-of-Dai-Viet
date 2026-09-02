import Phaser from 'phaser';
import { CARD_FACE_H, CARD_FACE_W, stampCardFace } from '../cardFace';

/**
 * A hand of baked card faces fanned across the bottom of a sheet: tap to raise, tap the raised
 * card to take it. The draft and the ceremony's bind step both hold their cards this way, so
 * the gesture is learned once.
 *
 * Every face is a single stamped texture (`cardFace.ts`), so a five-card fan costs the renderer
 * five quads — the flat frame cost the perf gate measures. The fan itself draws nothing live.
 *
 * Input is per-card zones on containers rather than one shared zone doing arithmetic, and the
 * raised card is brought to the top of the fan's own container, which is also what resolves
 * overlapping taps: Phaser hit-tests the display list topmost-first.
 */
export interface CardFanOptions {
  /** Area the fan occupies, in the parent's space. Cards overlap to fit the width. */
  x: number;
  y: number;
  width: number;
  height: number;
  cards: { id: string; level?: 1 | 2 | 3 }[];
  /** Which card opens raised — the draft raises an evolution-ready card by default. */
  initial?: number;
  /** A different card was raised — refresh whatever describes it. */
  onRaise?: (index: number) => void;
  /** The raised card was tapped again — the take. */
  onTake: (index: number) => void;
}

const RAISE_LIFT = 30;
const MAX_TILT = 9;

export class CardFan {
  readonly view: Phaser.GameObjects.Container;
  private slots: { container: Phaser.GameObjects.Container; x: number; y: number; angle: number }[] = [];
  raised = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly opts: CardFanOptions) {
    this.view = scene.add.container(opts.x, opts.y);

    const n = opts.cards.length;
    // Sized to the room given, ratio kept; the lift is paid for inside the area.
    const cardH = Math.min(opts.height - RAISE_LIFT, 200);
    const cardW = Math.round(cardH * (CARD_FACE_W / CARD_FACE_H));
    const span = Math.max(0, opts.width - cardW);

    opts.cards.forEach((card, index) => {
      const centre = n <= 1 ? 0.5 : index / (n - 1);
      const angle = (centre - 0.5) * 2 * MAX_TILT;
      // The fan is an arc: outer cards ride a little lower, the way a held hand does.
      const x = Math.round(centre * span);
      const y = RAISE_LIFT + Math.round(Math.abs(centre - 0.5) * 22);
      const container = scene.add.container(x, y);
      container.setAngle(angle);

      const face = stampCardFace(scene, card.id, { x: 0, y: 0, width: cardW, height: cardH }, card.level);
      if (face) container.add(face);

      const zone = scene.add.zone(0, 0, cardW, cardH).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => {
        if (this.raised === index) {
          opts.onTake(index);
        } else {
          this.raise(index);
        }
      });
      container.add(zone);

      this.view.add(container);
      this.slots.push({ container, x, y, angle });
    });

    this.raise(Math.min(Math.max(0, opts.initial ?? 0), n - 1), true);
  }

  /** Raises one card and settles the rest back into the fan. */
  raise(index: number, instant = false): void {
    this.raised = index;
    this.slots.forEach((slot, i) => {
      const up = i === index;
      const target = {
        x: slot.x,
        y: up ? slot.y - RAISE_LIFT : slot.y,
        angle: up ? 0 : slot.angle,
        scale: up ? 1.05 : 1,
      };
      if (instant) {
        slot.container.setPosition(target.x, target.y).setAngle(target.angle).setScale(target.scale);
      } else {
        this.scene.tweens.add({
          targets: slot.container,
          x: target.x, y: target.y, angle: target.angle, scale: target.scale,
          duration: 140, ease: 'Quad.easeOut',
        });
      }
    });
    // Topmost wins the overlap, for the eye and for the hit test alike.
    this.view.bringToTop(this.slots[index].container);
    this.opts.onRaise?.(index);
  }

  /** Takes whatever is raised — the footer's confirm button routes here. */
  take(): void {
    this.opts.onTake(this.raised);
  }
}
