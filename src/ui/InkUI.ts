import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { addPressFeedback } from './animations';
import { UI_FONT } from './fonts';
import { PIGMENT } from './ink/palette';
import { inkPath, mulberry32, washFill, type Pt } from './ink/stroke';
import { designLength, designPointer } from '../game/graphicsQuality';

/**
 * A printed surface: a sheet of paper with a hand-pulled contour round it.
 *
 * Every panel, card, button and tile in the game goes through this, which is why the interface
 * stopped being a set of rounded rectangles with new colours in them and became the same printed
 * object as the map. The rectangle's own corners are cut a little, the edge wobbles, and the fill
 * is registered a hair off its outline the way a colour block is.
 */
function printedSurface(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  opts: {
    fill?: number;
    fillAlpha?: number;
    border?: number;
    borderAlpha?: number;
    borderWidth?: number;
    seed?: number;
    /** Cut corners read as a torn sheet; 0 gives a plain rectangle. */
    cut?: number;
    shadow?: boolean;
  } = {},
): void {
  const cut = opts.cut ?? Math.min(7, Math.min(width, height) * 0.16);
  const seed = opts.seed ?? Math.round(width * 31 + height * 7);
  const sheet: Pt[] = [
    { x: cut, y: 0 }, { x: width - cut, y: 0 },
    { x: width, y: cut }, { x: width, y: height - cut },
    { x: width - cut, y: height }, { x: cut, y: height },
    { x: 0, y: height - cut }, { x: 0, y: cut },
  ];

  if (opts.shadow !== false) {
    g.fillStyle(PIGMENT.muc, 0.14);
    g.fillPoints(sheet.map((p) => ({ x: p.x + 1.5, y: p.y + 2.5 })), true);
  }
  washFill(g, sheet, opts.fill ?? INK_UI.parchment, seed, opts.fillAlpha ?? 1, 1.1);
  inkPath(g, sheet, seed + 1, {
    width: opts.borderWidth ?? 1.5,
    alpha: opts.borderAlpha ?? 0.72,
    colour: opts.border ?? PIGMENT.muc,
    wobble: 0.7,
    step: 11,
    closed: true,
  });
}

export interface UIBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The interface palette, retuned to the Đông Hồ pigments.
 *
 * Every panel, modal, button and bar in the game reads from this table, so retuning it here is what
 * makes the chrome agree with the map rather than sitting on top of it in a different world. The
 * keys keep their old names — `parchment`, `cinnabar`, `gold` — because a hundred call sites use
 * them and renaming would be churn for nothing; only the values move, each to the pigment nearest
 * it: bamboo-soot black for the ground, điệp for the paper, sỏi son for the red, hoa hòe for gold.
 */
export const INK_UI = {
  // The chrome sits ON the paper, not on a slab of near-black floating over it. Every bar, header
  // and modal ground in the game reads from these two, and flipping them here is what stops the
  // interface looking like a different product bolted onto the map.
  backgroundInk: PIGMENT.diepHi,
  /** A sheet of paper laid over the world, not a blackout. The map stays faintly readable under it. */
  overlay: PIGMENT.diep,
  parchment: PIGMENT.diepHi,
  parchmentShade: PIGMENT.diep,
  parchmentDark: PIGMENT.diepLo,
  inkText: '#2a2118',
  mutedText: '#5a4c39',
  /** Text on a saturated ground — a sỏi son button, a stamped seal. Not for use on paper. */
  lightText: '#fbf2df',
  brush: PIGMENT.muc,
  softBrush: PIGMENT.mucSoft,
  jade: PIGMENT.giDong,
  cinnabar: PIGMENT.son,
  cinnabarDark: PIGMENT.sonDeep,
  gold: PIGMENT.hoe,
  goldLight: PIGMENT.hoePale,
};

export const INK_UI_HEX = {
  inkText: '#2a2118',
  mutedText: '#5a4c39',
  lightText: '#fbf2df',
};

export type InkButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'disabled';

export interface InkButtonOptions {
  variant?: InkButtonVariant;
  fontSize?: string;
  radius?: number;
  extraHitPadding?: number;
}

export interface InkSurfaceOptions {
  fill?: number;
  fillShade?: number;
  fillAlpha?: number;
  border?: number;
  borderAlpha?: number;
  borderWidth?: number;
  radius?: number;
  muted?: boolean;
  ornaments?: boolean;
}

export interface InkCardRow {
  label: string;
  value: string;
}

export interface InkCardOptions extends InkSurfaceOptions {
  title?: string;
  subtitle?: string;
  status?: string;
  rows?: InkCardRow[];
  body?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: InkButtonVariant;
    disabled?: boolean;
  };
  actionPlacement?: 'right' | 'bottom';
}

export interface InkModalOptions {
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: number;
  height?: number;
}

export interface InkModalResult {
  objects: Phaser.GameObjects.GameObject[];
  panelBounds: UIBounds;
  contentBounds: UIBounds;
  footerBounds: UIBounds;
}

export interface InkScrollAreaOptions {
  wheelStep?: number;
}

/**
 * How far a finger may travel before the gesture stops being a tap and becomes a scroll.
 *
 * In design units, so it means the same thing at every render scale.
 *
 * **This was 6, and 6 is a mouse number.** A finger on glass rolls further than that on a perfectly
 * ordinary tap — so on a phone almost every tap crossed the threshold, was classified as a scroll,
 * and was swallowed. The list scrolled beautifully and nothing in it could be opened: tapping a
 * province on the Build page did nothing at all. Twenty units is about a fingertip's width and
 * still far short of a deliberate drag.
 */
const SCROLL_TAP_SLOP = 20;

/**
 * The gesture a list has already claimed as a scroll, identified rather than merely flagged.
 *
 * Cards inside a scroll area lay a full-bleed hit rectangle over the whole viewport and fire on
 * `pointerup`, so without this every scroll would end by picking whatever card the finger happened
 * to lift over.
 *
 * It records **which** gesture scrolled, not that one did. As a bare boolean it could go stale and
 * stay set: the flag was cleared by an area's own `pointerdown` handler, so once the last scroll
 * area was destroyed there was nothing left to clear it, and every later tap anywhere in the game
 * was read as the tail of a scroll that had ended long ago. Matching on the pointer means a stale
 * value can never match a fresh gesture, so it cannot deaden the interface.
 */
let consumedGesture: { id: number; downTime: number } | undefined;

/**
 * Whether *this* gesture was a scroll, and so must not also be read as a tap.
 *
 * Call it first thing in any `pointerup` handler that sits inside an `InkScrollArea`, passing the
 * pointer the handler was given.
 */
export function scrollGestureConsumedTap(pointer?: { id: number; downTime: number }): boolean {
  if (!consumedGesture) {
    return false;
  }
  // Without a pointer to compare, fall back to the old behaviour for that one call.
  if (!pointer) {
    return true;
  }
  return pointer.id === consumedGesture.id && pointer.downTime === consumedGesture.downTime;
}

export class InkScrollArea {
  readonly container: Phaser.GameObjects.Container;
  readonly content: Phaser.GameObjects.Container;
  readonly hitZone: Phaser.GameObjects.Zone;

  private readonly maskShape: Phaser.GameObjects.Graphics;
  private readonly wheelStep: number;
  private contentHeight = 0;
  private scrollY = 0;
  private maxScroll = 0;
  private dragStart?: { pointerY: number; scrollY: number };
  private disposed = false;
  private readonly wheelHandler: (
    pointer: Phaser.Input.Pointer,
    objects: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
  ) => void;
  private readonly downHandler: (pointer: Phaser.Input.Pointer) => void;
  private readonly moveHandler: (pointer: Phaser.Input.Pointer) => void;
  private readonly upHandler: () => void;

  constructor(private readonly scene: Phaser.Scene, readonly bounds: UIBounds, opts: InkScrollAreaOptions = {}) {
    this.wheelStep = opts.wheelStep ?? 1;
    this.container = scene.add.container(bounds.x, bounds.y);
    this.content = scene.add.container(0, 0);
    this.container.add(this.content);

    // The zone still earns its place: it swallows taps that fall through the gaps between cards, so
    // the map underneath does not move while a list is open. It is no longer the scroll mechanism.
    this.hitZone = scene.add.zone(bounds.x, bounds.y, bounds.width, bounds.height).setOrigin(0, 0).setInteractive();

    // Scrolling is driven from the scene's own pointer stream rather than Phaser's drag system.
    // Dragging a Zone cannot work here: `input.topOnly` is on, every card lays a full-bleed
    // interactive rectangle across the whole viewport, and a Zone never joins the camera render list
    // so `sortGameObjects` always sinks it to the bottom of the hit list. The zone was therefore
    // never the drag candidate and `dragstart` never fired — leaving the wheel as the only way to
    // scroll, which is no way at all on a phone. Filtering the scene stream by our own bounds is the
    // same shape `wheelHandler` below already uses.
    this.downHandler = (pointer: Phaser.Input.Pointer) => {
      if (this.maxScroll <= 0 || !this.containsPointer(pointer)) {
        return;
      }
      this.dragStart = { pointerY: designLength(pointer.y), scrollY: this.scrollY };
    };
    this.moveHandler = (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || !pointer.isDown) {
        return;
      }
      const travelled = designLength(pointer.y) - this.dragStart.pointerY;
      this.setScroll(this.dragStart.scrollY - travelled);
      // Claimed on travel alone, deliberately — not on whether the list moved.
      //
      // Requiring actual movement looks tempting and is wrong: a list already at its end does not
      // move however far the finger pulls, so the pull was not claimed and the release was read as
      // a tap. Dragging at the bottom of a list picked whatever row was under the finger. A list
      // that cannot scroll at all never gets here, because `downHandler` refuses to start a drag
      // when `maxScroll` is zero.
      if (Math.abs(travelled) >= SCROLL_TAP_SLOP) {
        consumedGesture = { id: pointer.id, downTime: pointer.downTime };
      }
    };
    this.upHandler = () => {
      this.dragStart = undefined;
    };
    scene.input.on('pointerdown', this.downHandler);
    scene.input.on('pointermove', this.moveHandler);
    scene.input.on('pointerup', this.upHandler);
    scene.input.on('pointerupoutside', this.upHandler);

    this.maskShape = scene.make.graphics({}, false);
    this.maskShape.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.content.setMask(this.maskShape.createGeometryMask());

    this.wheelHandler = (pointer, _objects, _dx, dy) => {
      if (!this.containsPointer(pointer)) {
        return;
      }
      this.setScroll(this.scrollY + dy * this.wheelStep);
    };
    scene.input.on('wheel', this.wheelHandler);
  }

  /** Whether a pointer is over this area, compared in design space. */
  private containsPointer(pointer: { x: number; y: number }): boolean {
    const at = designPointer(pointer);
    return (
      at.x >= this.bounds.x &&
      at.x <= this.bounds.x + this.bounds.width &&
      at.y >= this.bounds.y &&
      at.y <= this.bounds.y + this.bounds.height
    );
  }

  setContentHeight(height: number): void {
    this.contentHeight = Math.max(0, height);
    this.maxScroll = Math.max(0, this.contentHeight - this.bounds.height);
    this.setScroll(this.scrollY);
  }

  setScroll(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  addTo(parent: Phaser.GameObjects.Container): void {
    parent.add([this.hitZone, this.container]);
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.scene.input.off('wheel', this.wheelHandler);
    this.scene.input.off('pointerdown', this.downHandler);
    this.scene.input.off('pointermove', this.moveHandler);
    this.scene.input.off('pointerup', this.upHandler);
    this.scene.input.off('pointerupoutside', this.upHandler);
    this.hitZone.destroy();
    this.container.destroy(true);
    this.maskShape.destroy();
  }
}

export class InkUI {
  constructor(private readonly scene: Phaser.Scene) {}

  label(
    x: number,
    y: number,
    text: string,
    variant: 'title' | 'subtitle' | 'body' | 'label' | 'caption' | 'button' = 'body',
    overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
  ): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, text, { ...textStyle(variant), ...overrides });
  }

  /**
   * A hand-drawn "crayon" tile used for every segmented selector (map theme,
   * language, campaign map-type/difficulty) so those controls read consistently.
   * Waxy parchment fill with a wobbly double outline; the caller adds the label
   * and an interactive hit area on top. Selected tiles use a gold fill + cinnabar
   * outline so the active choice pops on both the light atlas and dark ink themes.
   */
  crayonTile(bounds: UIBounds, opts: { selected?: boolean; fill?: number; accent?: number } = {}): Phaser.GameObjects.Graphics {
    const { selected = false } = opts;
    // Segmented selectors reuse the exact button surface so tiles, buttons, and cards read
    // as one visual family: selected = primary (gold), unselected = secondary (parchment).
    const g = this.scene.add.graphics({ x: bounds.x, y: bounds.y });
    drawButtonSurface(g, bounds.width, bounds.height, 6, selected ? 'primary' : 'secondary', false);
    return g;
  }

  panel(bounds: UIBounds, opts: InkSurfaceOptions = {}): Phaser.GameObjects.Graphics {
    const {
      fill = INK_UI.parchment,
      fillShade = INK_UI.parchmentShade,
      fillAlpha = 1,
      border = INK_UI.brush,
      borderAlpha = 0.86,
      borderWidth = 2,
      radius = 8,
      muted = false,
      ornaments = false,
    } = opts;

    const g = this.scene.add.graphics({ x: bounds.x, y: bounds.y });
    const alpha = muted ? fillAlpha * 0.55 : fillAlpha;
    void radius;

    printedSurface(g, bounds.width, bounds.height, {
      fill, fillAlpha: alpha, border, borderAlpha: muted ? borderAlpha * 0.6 : borderAlpha,
      borderWidth, seed: Math.round(bounds.x * 13 + bounds.y * 7 + bounds.width),
    });
    // A second rule just inside the edge, the way a printed plate is bordered twice.
    inkPath(
      g,
      [{ x: 4, y: 4 }, { x: bounds.width - 4, y: 4 }, { x: bounds.width - 4, y: bounds.height - 4 }, { x: 4, y: bounds.height - 4 }],
      Math.round(bounds.width * 3 + bounds.height),
      { width: 0.8, alpha: muted ? 0.16 : 0.3, colour: fillShade, wobble: 0.6, step: 14, closed: true },
    );

    if (ornaments) {
      this.drawCornerMarks(g, bounds.width, bounds.height, muted);
    }

    return g;
  }

  card(bounds: UIBounds, opts: InkCardOptions = {}): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    const padding = 10;
    const actionRightWidth = opts.action && opts.actionPlacement !== 'bottom' ? 82 : 0;
    const textWidth = bounds.width - padding * 2 - actionRightWidth;

    // Build the text first and grow the box to its ACTUAL rendered height. Phaser computes
    // each Text's wrapped height on creation, so reading `.height` — instead of estimating
    // character counts — is what makes cards reliably contain text in any language (long
    // Vietnamese lines wrap differently than a char estimate would predict). The requested
    // height is only a minimum. After the last line is stacked, the box's final height is
    // known and the background is inserted behind the text.
    let cursorY = 8;
    const stack = (obj: Phaser.GameObjects.Text, gapBelow: number): void => {
      container.add(obj);
      cursorY += obj.height + gapBelow;
    };

    if (opts.title) {
      stack(this.label(padding, cursorY, opts.title, 'label', {
        fontSize: '15px',
        wordWrap: { width: textWidth - (opts.status ? 58 : 0) },
      }), 5);
    }

    if (opts.subtitle) {
      stack(this.label(padding, cursorY, opts.subtitle, 'caption', {
        wordWrap: { width: textWidth },
      }), 4);
    }

    if (opts.rows) {
      for (const row of opts.rows) {
        const rowText = `${row.label}: ${row.value}`;
        const longValue = rowText.length > Math.max(28, Math.floor(textWidth / 8));
        if (longValue) {
          stack(this.label(padding, cursorY, row.label, 'caption', { wordWrap: { width: textWidth } }), 2);
          stack(this.label(padding, cursorY, row.value, 'body', {
            fontSize: '12px',
            lineSpacing: 3,
            wordWrap: { width: textWidth },
          }), 5);
        } else {
          stack(this.label(padding, cursorY, rowText, 'body', {
            fontSize: '12px',
            wordWrap: { width: textWidth },
          }), 4);
        }
      }
    }

    if (opts.body) {
      stack(this.label(padding, cursorY, opts.body, 'body', {
        fontSize: '12px',
        lineSpacing: 5,
        wordWrap: { width: textWidth },
      }), 0);
    }

    let contentBottom = cursorY + 10; // breathing room below the last line
    if (opts.action && opts.actionPlacement === 'bottom') {
      contentBottom += 34; // reserve the bottom button row
    }
    const height = Math.max(bounds.height, Math.round(contentBottom));

    // Insert the background behind the already-stacked text.
    container.addAt(this.panel({ x: 0, y: 0, width: bounds.width, height }, opts), 0);

    if (opts.status) {
      // A label, not a pill. On paper a filled chip reads as a sticker; letter-spaced small caps
      // in muted ink says the same thing and stays part of the page.
      const status = this.scene.add.text(bounds.width - padding, 9, opts.status.toLocaleUpperCase(), {
        ...textStyle('caption'),
        color: opts.muted ? INK_UI_HEX.mutedText : colorToCss(INK_UI.cinnabar),
        fontSize: '9px',
        fontStyle: '700',
      }).setOrigin(1, 0);
      status.setLetterSpacing?.(1.2);
      container.add(status);
    }

    if (opts.action) {
      if (opts.actionPlacement === 'bottom') {
        const actionWidth = Math.min(180, bounds.width - padding * 2);
        container.add(this.button({
          x: (bounds.width - actionWidth) / 2,
          y: height - 38,
          width: actionWidth,
          height: 30,
        }, opts.action.label, opts.action.onClick, {
          variant: opts.action.disabled ? 'disabled' : opts.action.variant ?? 'secondary',
          fontSize: '12px',
        }));
      } else {
        container.add(this.button({
          x: bounds.width - padding - 72,
          y: (height - 30) / 2,
          width: 72,
          height: 30,
        }, opts.action.label, opts.action.onClick, {
          variant: opts.action.disabled ? 'disabled' : opts.action.variant ?? 'secondary',
          fontSize: '11px',
        }));
      }
    }

    container.setData('cardHeight', height);
    return container;
  }

  button(bounds: UIBounds, label: string, onClick: () => void, opts: InkButtonOptions = {}): Phaser.GameObjects.Container {
    const { variant = 'secondary', fontSize = '13px', radius = 8, extraHitPadding = 0 } = opts;
    const disabled = variant === 'disabled';
    const container = this.scene.add.container(bounds.x, bounds.y);
    const graphics = this.scene.add.graphics();
    const draw = (pressed: boolean) => drawButtonSurface(graphics, bounds.width, bounds.height, radius, variant, pressed);
    draw(false);

    const text = this.label(bounds.width / 2, bounds.height / 2, label, 'button', {
      color: variant === 'danger' ? INK_UI_HEX.lightText
        : variant === 'primary' ? colorToCss(INK_UI.cinnabar)
        : INK_UI_HEX.inkText,
      fontSize,
      align: 'center',
      wordWrap: { width: bounds.width - 10 },
    }).setOrigin(0.5);
    text.setAlpha(disabled ? 0.55 : 1);

    const hitArea = this.scene.add
      .rectangle(
        bounds.width / 2,
        bounds.height / 2,
        bounds.width + extraHitPadding,
        bounds.height + extraHitPadding,
        0xffffff,
        0.001,
      )
      .setInteractive(disabled ? undefined : { useHandCursor: true });

    const stop = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation();

    hitArea.on('pointerdown', (
      pointer: Phaser.Input.Pointer,
      localX: number,
      localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      stop(pointer, localX, localY, event);
      if (!disabled) {
        draw(true);
      }
    });
    hitArea.on('pointerup', (
      pointer: Phaser.Input.Pointer,
      localX: number,
      localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      stop(pointer, localX, localY, event);
      if (disabled) {
        return;
      }
      draw(false);
      // A button sitting inside a scrolling list must not fire because the finger happened to lift
      // over it at the end of a drag. Buttons outside a list are unaffected: only the gesture that
      // actually scrolled a list is ever claimed.
      if (scrollGestureConsumedTap(pointer)) {
        return;
      }
      onClick();
    });
    hitArea.on('pointerout', () => {
      if (!disabled) {
        draw(false);
      }
    });

    container.add([graphics, text, hitArea]);
    if (!disabled) {
      addPressFeedback(this.scene, container, hitArea, { width: bounds.width, height: bounds.height });
    }
    return container;
  }

  modal(opts: InkModalOptions): InkModalResult {
    const width = opts.width ?? 362;
    // Never taller than the sheet. A fixed 742 on a 662-tall design box put the header above the
    // screen and the footer below it, which is how a modal loses its own close button.
    const height = Math.min(opts.height ?? 742, GAME_HEIGHT - 24);
    const x = (GAME_WIDTH - width) / 2;
    const y = (GAME_HEIGHT - height) / 2;
    const headerHeight = 104;
    const footerHeight = 66;

    const blocker = this.scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, INK_UI.overlay, 0.88)
      .setOrigin(0, 0)
      .setInteractive();
    blocker.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    );

    const frame = this.panel({ x, y, width, height }, {
      fill: INK_UI.parchment,
      fillShade: INK_UI.parchmentDark,
      border: INK_UI.brush,
      radius: 12,
      borderWidth: 3,
    });
    const header = this.scene.add.graphics({ x, y });
    header.fillStyle(INK_UI.parchment, 0.96);
    header.fillRoundedRect(0, 0, width, headerHeight, { tl: 12, tr: 12, bl: 0, br: 0 });
    // Two rules under the title, the way a printed page separates its head from its body.
    header.lineStyle(1.4, INK_UI.brush, 0.42);
    header.lineBetween(10, headerHeight - 3, width - 10, headerHeight - 3);
    header.lineStyle(0.8, INK_UI.cinnabar, 0.5);
    header.lineBetween(10, headerHeight, width - 10, headerHeight);

    const title = this.label(x + width / 2, y + 18, opts.title, 'title', {
      color: INK_UI_HEX.inkText,
      align: 'center',
      wordWrap: { width: width - 80 },
    }).setOrigin(0.5, 0);
    const subtitle = this.label(x + width / 2, y + 58, opts.subtitle ?? '', 'subtitle', {
      align: 'center',
      fontSize: '11px',
      lineSpacing: 2,
      wordWrap: { width: width - 60 },
    }).setOrigin(0.5, 0);
    const close = this.closeIcon({ x: x + width - 46, y: y + 18, width: 32, height: 32 }, opts.onClose);

    return {
      objects: [blocker, frame, header, title, subtitle, close],
      panelBounds: { x, y, width, height },
      contentBounds: { x: x + 14, y: y + headerHeight + 14, width: width - 28, height: height - headerHeight - footerHeight - 20 },
      footerBounds: { x: x + 14, y: y + height - footerHeight + 10, width: width - 28, height: footerHeight - 18 },
    };
  }

  closeIcon(bounds: UIBounds, onClick: () => void): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    const text = this.label(bounds.width / 2, bounds.height / 2 - 1, '×', 'button', {
      color: INK_UI_HEX.inkText,
      fontSize: '22px',
      fontStyle: '700',
    }).setOrigin(0.5);
    const hitArea = this.scene.add
      .rectangle(bounds.width / 2, bounds.height / 2, bounds.width, bounds.height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hitArea.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    );
    hitArea.on(
      'pointerup',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        onClick();
      },
    );
    container.add([text, hitArea]);
    return container;
  }

  scrollArea(bounds: UIBounds, opts: InkScrollAreaOptions = {}): InkScrollArea {
    return new InkScrollArea(this.scene, bounds, opts);
  }

  infoRow(bounds: UIBounds, label: string, value: string): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    container.add(this.label(0, 0, label, 'caption', { wordWrap: { width: bounds.width * 0.42 } }));
    container.add(this.label(bounds.width, 0, value, 'body', {
      align: 'right',
      fontSize: '12px',
      wordWrap: { width: bounds.width * 0.55 },
    }).setOrigin(1, 0));
    return container;
  }

  statBar(bounds: UIBounds, value: number, max: number, color = INK_UI.jade): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    const ratio = max <= 0 ? 0 : Phaser.Math.Clamp(value / max, 0, 1);
    const g = this.scene.add.graphics();
    const mid = bounds.height / 2;
    const seed = Math.round(bounds.x * 7 + bounds.y * 3 + bounds.width);
    // The track is a faint rule and the fill a heavier one drawn over it, so a bar reads as a
    // measured length of ink rather than as two nested boxes.
    inkPath(g, [{ x: 0, y: mid }, { x: bounds.width, y: mid }], seed, {
      width: Math.max(1, bounds.height * 0.8), alpha: 0.2, colour: INK_UI.brush, wobble: 0.3, step: 14,
    });
    if (ratio > 0) {
      inkPath(g, [{ x: 0, y: mid }, { x: Math.max(1.5, bounds.width * ratio), y: mid }], seed + 1, {
        width: Math.max(1, bounds.height * 0.8), alpha: 0.88, colour: color, wobble: 0.45, step: 12,
      });
    }
    container.add(g);
    return container;
  }

  /**
   * A draggable dial: `statBar`'s measured line of ink, with a seal-red thumb the finger owns.
   *
   * Drag anywhere on the bounds; the value moves *relatively* from where it stood, like a real
   * fader under a finger, so grabbing the middle of the track does not snap the thumb there.
   * `onPreview` fires on every movement for live labels; `onChange` once, on release — callers
   * that recompute the world should do it there.
   *
   * The zone sits above the scroll area's hit zone, so dragging the slider never scrolls the
   * list underneath it (input.topOnly is on).
   */
  slider(
    bounds: UIBounds,
    opts: {
      value: number;
      onChange: (value: number) => void;
      onPreview?: (value: number) => void;
      color?: number;
    },
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    const thumbR = 9;
    const trackX = thumbR + 2;
    const trackWidth = bounds.width - (thumbR + 2) * 2;
    const mid = bounds.height / 2;
    const color = opts.color ?? INK_UI.cinnabar;
    const seed = Math.round(bounds.x * 7 + bounds.y * 3 + bounds.width);

    let value = Phaser.Math.Clamp(opts.value, 0, 1);
    const g = this.scene.add.graphics();
    container.add(g);

    const paint = () => {
      g.clear();
      inkPath(g, [{ x: trackX, y: mid }, { x: trackX + trackWidth, y: mid }], seed, {
        width: 3, alpha: 0.2, colour: INK_UI.brush, wobble: 0.3, step: 14,
      });
      const tip = trackX + trackWidth * value;
      if (value > 0.01) {
        inkPath(g, [{ x: trackX, y: mid }, { x: tip, y: mid }], seed + 1, {
          width: 3, alpha: 0.8, colour: color, wobble: 0.45, step: 12,
        });
      }
      // The thumb is a seal pressed on the line: a solid disc with the paper showing as a ring.
      g.fillStyle(INK_UI.parchment, 1);
      g.fillCircle(tip, mid, thumbR - 1.5);
      g.fillStyle(color, 0.92);
      g.fillCircle(tip, mid, thumbR - 4);
      g.lineStyle(1.4, INK_UI.brush, 0.6);
      g.strokeCircle(tip, mid, thumbR - 1.5);
    };
    paint();

    const zone = this.scene.add
      .zone(bounds.width / 2, mid, bounds.width, Math.max(bounds.height, thumbR * 2 + 14))
      .setInteractive({ draggable: true, useHandCursor: true });
    container.add(zone);

    let startValue = value;
    let startX = 0;
    zone.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      startValue = value;
      startX = designLength(pointer.x);
    });
    zone.on('drag', (pointer: Phaser.Input.Pointer) => {
      value = Phaser.Math.Clamp(startValue + (designLength(pointer.x) - startX) / trackWidth, 0, 1);
      paint();
      opts.onPreview?.(value);
    });
    zone.on('dragend', () => {
      opts.onChange(value);
    });

    return container;
  }

  private drawCornerMarks(g: Phaser.GameObjects.Graphics, width: number, height: number, muted: boolean): void {
    const alpha = muted ? 0.32 : 0.72;
    const size = 5;
    const inset = 7;
    const corners: Array<[number, number]> = [
      [inset, inset],
      [width - inset, inset],
      [inset, height - inset],
      [width - inset, height - inset],
    ];
    g.fillStyle(INK_UI.cinnabar, alpha);
    for (const [cx, cy] of corners) {
      g.fillRect(cx - size / 2, cy - 1, size, 2);
      g.fillRect(cx - 1, cy - size / 2, 2, size);
    }
  }
}

function textStyle(variant: 'title' | 'subtitle' | 'body' | 'label' | 'caption' | 'button'): Phaser.Types.GameObjects.Text.TextStyle {
  switch (variant) {
    case 'title':
      return { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '22px', fontStyle: '700' };
    case 'subtitle':
      return { color: '#5a4c39', fontFamily: UI_FONT, fontSize: '12px' };
    case 'label':
      return { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '15px', fontStyle: '700' };
    case 'caption':
      return { color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '11px' };
    case 'button':
      return { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '13px', fontStyle: '700' };
    default:
      return { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '13px' };
  }
}

function drawButtonSurface(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  radius: number,
  variant: InkButtonVariant,
  pressed: boolean,
): void {
  const disabled = variant === 'disabled';
  const alpha = disabled ? 0.55 : 1;
  const palette = buttonPalette(variant, pressed);

  const drop = pressed ? 2 : 0;
  const seed = Math.round(width * 17 + height * 5 + (pressed ? 1 : 0));
  void radius;

  g.clear();
  g.translateCanvas(0, drop);
  if (variant === 'ghost') {
    printedSurface(g, width, height, {
      fill: INK_UI.parchment, fillAlpha: pressed ? 0.2 : 0.14,
      border: palette.border, borderAlpha: 0.5 * alpha, borderWidth: 1.2, seed, shadow: false,
    });
  } else {
    printedSurface(g, width, height, {
      fill: pressed ? palette.bottom : palette.top, fillAlpha: alpha,
      border: palette.border, borderAlpha: 0.85 * alpha, borderWidth: 1.6, seed,
      shadow: !pressed,
    });
    // The catchlight a block leaves along its top edge. Wobbled, or it reads as a CSS gradient.
    inkPath(g, [{ x: 9, y: 7 }, { x: width - 9, y: 7 }], seed + 3, {
      width: 1, alpha: disabled ? 0.1 : pressed ? 0.14 : 0.26, colour: INK_UI.goldLight, wobble: 0.5, step: 12,
    });

    // A stamped seal at each end of a wide button, in place of the old arrow notches.
    if (width >= 220 && height >= 42) {
      const y = height / 2;
      const mark = variant === 'danger' ? INK_UI.goldLight : INK_UI.cinnabar;
      const rand = mulberry32(seed + 9);
      for (const cx of [17, width - 17]) {
        g.fillStyle(mark, disabled ? 0.2 : 0.5);
        for (let ray = 0; ray < 8; ray += 1) {
          const angle = (ray / 8) * Math.PI * 2 + rand() * 0.1;
          g.fillRect(cx + Math.cos(angle) * 3.4 - 0.8, y + Math.sin(angle) * 3.4 - 0.8, 1.6, 1.6);
        }
        g.fillCircle(cx, y, 1.5);
      }
    }
  }
  g.translateCanvas(0, -drop);
}

function buttonPalette(variant: InkButtonVariant, pressed: boolean): { top: number; bottom: number; border: number } {
  if (variant === 'primary') {
    // Sỏi son as an OUTLINE, not a fill.
    //
    // The scarcity law says the saturated red belongs to the player alone — their banner, their
    // seal, their losses. A list of six equal actions rendered as six red slabs spends it six
    // times on one screen and the map stops having a focal point. An inked border and red
    // lettering on paper still reads as "this is the action" while leaving the filled red to
    // `danger`, which is genuinely rare.
    return {
      top: pressed ? INK_UI.parchmentDark : INK_UI.parchment,
      bottom: INK_UI.parchmentDark,
      border: INK_UI.cinnabar,
    };
  }
  if (variant === 'danger') {
    return {
      top: pressed ? INK_UI.cinnabarDark : INK_UI.cinnabar,
      bottom: pressed ? 0x5e1e17 : INK_UI.cinnabarDark,
      border: INK_UI.brush,
    };
  }
  if (variant === 'ghost') {
    return { top: INK_UI.parchment, bottom: INK_UI.parchment, border: INK_UI.softBrush };
  }
  return {
    top: pressed ? INK_UI.parchmentDark : 0xd9c584,
    bottom: pressed ? 0xbba466 : INK_UI.parchmentShade,
    border: variant === 'disabled' ? INK_UI.softBrush : INK_UI.brush,
  };
}

function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

