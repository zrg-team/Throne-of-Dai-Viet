import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { addPressFeedback } from './animations';

export interface UIBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const INK_UI = {
  backgroundInk: 0x20261f,
  overlay: 0x171b16,
  parchment: 0xf3e6c4,
  parchmentShade: 0xe4d2a2,
  parchmentDark: 0xc4ae68,
  inkText: '#211103',
  mutedText: '#6b5230',
  lightText: '#fff6bd',
  brush: 0x2a1403,
  softBrush: 0x47553f,
  jade: 0x6f8f64,
  cinnabar: 0xaa3a2c,
  cinnabarDark: 0x7d2a20,
  gold: 0xd9b35a,
  goldLight: 0xf3dd9a,
};

export const INK_UI_HEX = {
  inkText: '#211103',
  mutedText: '#6b5230',
  lightText: '#fff6bd',
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

  constructor(private readonly scene: Phaser.Scene, readonly bounds: UIBounds, opts: InkScrollAreaOptions = {}) {
    this.wheelStep = opts.wheelStep ?? 1;
    this.container = scene.add.container(bounds.x, bounds.y);
    this.content = scene.add.container(0, 0);
    this.container.add(this.content);

    this.hitZone = scene.add.zone(bounds.x, bounds.y, bounds.width, bounds.height).setOrigin(0, 0).setInteractive();
    scene.input.setDraggable(this.hitZone);
    this.hitZone.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      this.dragStart = { pointerY: pointer.y, scrollY: this.scrollY };
    });
    this.hitZone.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart) {
        return;
      }
      this.setScroll(this.dragStart.scrollY - (pointer.y - this.dragStart.pointerY));
    });
    this.hitZone.on('dragend', () => {
      this.dragStart = undefined;
    });

    this.maskShape = scene.make.graphics({}, false);
    this.maskShape.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.content.setMask(this.maskShape.createGeometryMask());

    this.wheelHandler = (pointer, _objects, _dx, dy) => {
      if (
        pointer.x < bounds.x ||
        pointer.x > bounds.x + bounds.width ||
        pointer.y < bounds.y ||
        pointer.y > bounds.y + bounds.height
      ) {
        return;
      }
      this.setScroll(this.scrollY + dy * this.wheelStep);
    };
    scene.input.on('wheel', this.wheelHandler);
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

    g.fillStyle(INK_UI.brush, 0.08 * alpha);
    g.fillRoundedRect(1, 2, bounds.width, bounds.height, radius);
    g.fillStyle(fill, alpha);
    g.fillRoundedRect(0, 0, bounds.width, bounds.height, radius);

    g.lineStyle(1, fillShade, muted ? 0.22 : 0.48);
    g.strokeRoundedRect(3, 3, bounds.width - 6, bounds.height - 6, Math.max(0, radius - 3));

    g.lineStyle(borderWidth, border, borderAlpha);
    g.strokeRoundedRect(0, 0, bounds.width, bounds.height, radius);

    if (ornaments) {
      this.drawCornerMarks(g, bounds.width, bounds.height, muted);
    }

    return g;
  }

  card(bounds: UIBounds, opts: InkCardOptions = {}): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    const background = this.panel({ x: 0, y: 0, width: bounds.width, height: bounds.height }, opts);
    container.add(background);

    const padding = 10;
    const actionRightWidth = opts.action && opts.actionPlacement !== 'bottom' ? 82 : 0;
    const textWidth = bounds.width - padding * 2 - actionRightWidth;
    let cursorY = 8;

    if (opts.status) {
      const status = this.scene.add.text(bounds.width - padding, 8, opts.status, {
        ...textStyle('caption'),
        color: INK_UI_HEX.lightText,
        backgroundColor: colorToCss(opts.muted ? INK_UI.softBrush : INK_UI.cinnabar),
        padding: { x: 5, y: 2 },
      }).setOrigin(1, 0);
      container.add(status);
    }

    if (opts.title) {
      container.add(this.label(padding, cursorY, opts.title, 'label', {
        fontSize: '15px',
        wordWrap: { width: textWidth - (opts.status ? 58 : 0) },
      }));
      cursorY += 20;
    }

    if (opts.subtitle) {
      container.add(this.label(padding, cursorY, opts.subtitle, 'caption', {
        wordWrap: { width: textWidth },
      }));
      cursorY += 17;
    }

    if (opts.rows) {
      opts.rows.forEach((row) => {
        const rowText = `${row.label}: ${row.value}`;
        const longValue = rowText.length > Math.max(28, Math.floor(textWidth / 8));
        if (longValue) {
          container.add(this.label(padding, cursorY, row.label, 'caption', {
            wordWrap: { width: textWidth },
          }));
          cursorY += 13;
          container.add(this.label(padding, cursorY, row.value, 'body', {
            fontSize: '12px',
            lineSpacing: 3,
            wordWrap: { width: textWidth },
          }));
          cursorY += estimateTextHeight(row.value, textWidth, 12, 3) + 5;
        } else {
          container.add(this.label(padding, cursorY, rowText, 'body', {
            fontSize: '12px',
            wordWrap: { width: textWidth },
          }));
          cursorY += 18;
        }
      });
    }

    if (opts.body) {
      container.add(this.label(padding, cursorY, opts.body, 'body', {
        fontSize: '12px',
        lineSpacing: 5,
        wordWrap: { width: textWidth },
      }));
    }

    if (opts.action) {
      if (opts.actionPlacement === 'bottom') {
        const actionWidth = Math.min(180, bounds.width - padding * 2);
        container.add(this.button({
          x: (bounds.width - actionWidth) / 2,
          y: bounds.height - 38,
          width: actionWidth,
          height: 30,
        }, opts.action.label, opts.action.onClick, {
          variant: opts.action.disabled ? 'disabled' : opts.action.variant ?? 'secondary',
          fontSize: '12px',
        }));
      } else {
        container.add(this.button({
          x: bounds.width - padding - 72,
          y: (bounds.height - 30) / 2,
          width: 72,
          height: 30,
        }, opts.action.label, opts.action.onClick, {
          variant: opts.action.disabled ? 'disabled' : opts.action.variant ?? 'secondary',
          fontSize: '11px',
        }));
      }
    }

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
      color: variant === 'danger' ? INK_UI_HEX.lightText : INK_UI_HEX.inkText,
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
      if (!disabled) {
        draw(false);
        onClick();
      }
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
    const height = opts.height ?? 742;
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
      fill: INK_UI.parchmentDark,
      fillShade: INK_UI.parchment,
      border: INK_UI.brush,
      radius: 12,
      borderWidth: 3,
    });
    const header = this.scene.add.graphics({ x, y });
    header.fillStyle(INK_UI.backgroundInk, 0.96);
    header.fillRoundedRect(0, 0, width, headerHeight, { tl: 12, tr: 12, bl: 0, br: 0 });
    header.lineStyle(1, INK_UI.cinnabar, 0.65);
    header.lineBetween(10, headerHeight - 2, width - 10, headerHeight - 2);

    const title = this.label(x + width / 2, y + 18, opts.title, 'title', {
      color: INK_UI_HEX.lightText,
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
      color: INK_UI_HEX.lightText,
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
    container.add(this.scene.add.rectangle(0, 0, bounds.width, bounds.height, INK_UI.brush, 0.26).setOrigin(0, 0));
    container.add(this.scene.add.rectangle(0, 0, bounds.width * ratio, bounds.height, color, 0.92).setOrigin(0, 0));
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
      return { color: INK_UI_HEX.inkText, fontSize: '22px', fontStyle: '700' };
    case 'subtitle':
      return { color: '#e9d6aa', fontSize: '12px' };
    case 'label':
      return { color: INK_UI_HEX.inkText, fontSize: '15px', fontStyle: '700' };
    case 'caption':
      return { color: INK_UI_HEX.mutedText, fontSize: '11px' };
    case 'button':
      return { color: INK_UI_HEX.inkText, fontFamily: 'Georgia, Times New Roman, serif', fontSize: '13px', fontStyle: '700' };
    default:
      return { color: INK_UI_HEX.inkText, fontSize: '13px' };
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

  g.clear();
  if (variant !== 'ghost') {
    g.fillStyle(INK_UI.brush, 0.24 * alpha);
    g.fillRoundedRect(3, pressed ? 5 : 5, width, height, radius);
    g.fillStyle(pressed ? palette.bottom : palette.top, alpha);
    g.fillRoundedRect(0, pressed ? 2 : 0, width, height, radius);
    g.lineStyle(1, 0xfff0b8, disabled ? 0.12 : pressed ? 0.18 : 0.34);
    g.lineBetween(10, (pressed ? 2 : 0) + 8, width - 10, (pressed ? 2 : 0) + 8);

    if (width >= 220 && height >= 42) {
      const y = (pressed ? 2 : 0) + height / 2;
      const notchAlpha = disabled ? 0.18 : 0.44;
      const notchColor = variant === 'danger' ? INK_UI.goldLight : INK_UI.gold;
      g.fillStyle(notchColor, notchAlpha);
      g.fillTriangle(14, y, 23, y - 5, 23, y + 5);
      g.fillTriangle(width - 14, y, width - 23, y - 5, width - 23, y + 5);
    }
  } else {
    g.fillStyle(INK_UI.parchment, pressed ? 0.18 : 0.12);
    g.fillRoundedRect(0, pressed ? 1 : 0, width, height, radius);
  }

  g.lineStyle(2, palette.border, 0.9 * alpha);
  g.strokeRoundedRect(0, pressed ? 2 : 0, width, height, radius);
}

function buttonPalette(variant: InkButtonVariant, pressed: boolean): { top: number; bottom: number; border: number } {
  if (variant === 'primary') {
    return {
      top: pressed ? INK_UI.gold : INK_UI.goldLight,
      bottom: pressed ? 0xb98a2c : INK_UI.gold,
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

function estimateTextHeight(text: string, width: number, fontSize: number, lineSpacing: number): number {
  const averageCharWidth = fontSize * 0.62;
  const charsPerLine = Math.max(1, Math.floor(width / averageCharWidth));
  const lines = text.split('\n').reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / charsPerLine)), 0);
  return lines * fontSize + Math.max(0, lines - 1) * lineSpacing;
}
