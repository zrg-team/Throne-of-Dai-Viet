import Phaser from 'phaser';
import { COLORS } from '../game/constants';
import type { ResourceKey } from '../state/types';

/** Wood tones used for buttons / nav chrome. */
export const WOOD = {
  light: 0xe0ad6a,
  base: 0xb9803f,
  dark: 0x8a5a2b,
  shadow: 0x4a2f15,
  border: 0x3b2410,
  highlight: 0xffde72,
  highlightDark: 0xc9952e,
};

/** Lacquer-and-gilt tones evoking Vietnamese imperial decor (son son thiep vang). */
export const LACQUER = {
  red: 0x7a1f1f,
  redDark: 0x4a1010,
  redLight: 0x9c3a30,
  gold: 0xd9b35a,
  goldLight: 0xf3dd9a,
};

/** Silk/parchment tones used for cards / panels. */
export const PARCHMENT = {
  fill: 0xf3e6c4,
  fillShade: 0xe6d2a0,
  border: LACQUER.gold,
  accent: LACQUER.red,
  dark: LACQUER.red,
  darkBorder: LACQUER.gold,
};

/** SVG icon textures for the resource bar, loaded by PreloadScene from /public/icons. */
export const RESOURCE_ICONS: Record<ResourceKey, { key: string; file: string }> = {
  food: { key: 'icon-food', file: 'food' },
  gold: { key: 'icon-gold', file: 'gold' },
  manpower: { key: 'icon-manpower', file: 'manpower' },
  stability: { key: 'icon-stability', file: 'stability' },
  influence: { key: 'icon-influence', file: 'influence' },
};
export const RESOURCE_ICON_SIZE = 32;

export type TextVariant =
  | 'header'
  | 'subheader'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'label'
  | 'caption'
  | 'button'
  | 'buttonDark';

export const TEXT_STYLES: Record<TextVariant, Phaser.Types.GameObjects.Text.TextStyle> = {
  header: { color: '#2a1403', fontSize: '15px', fontStyle: '700' },
  subheader: { color: '#4f3b1f', fontSize: '11px', fontStyle: '700' },
  title: { color: COLORS.text, fontSize: '22px', fontStyle: '700' },
  subtitle: { color: '#f5dfaa', fontSize: '12px' },
  body: { color: '#2a1403', fontSize: '13px' },
  label: { color: COLORS.darkText, fontSize: '13px', fontStyle: '700' },
  caption: { color: '#6b5230', fontSize: '11px' },
  button: { color: COLORS.darkText, fontSize: '13px', fontStyle: '700' },
  buttonDark: { color: COLORS.text, fontSize: '13px', fontStyle: '700' },
};

/** Creates a themed text label using one of the shared style presets. */
export function createLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  variant: TextVariant = 'body',
  overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { ...TEXT_STYLES[variant], ...overrides });
}

export interface PanelOptions {
  fill?: number;
  fillShade?: number;
  fillAlpha?: number;
  border?: number;
  borderAlpha?: number;
  borderWidth?: number;
  radius?: number;
  /** Draw small gilt corner ornaments, lacquerware-frame style. Default true. */
  ornaments?: boolean;
}

/** Creates a silk/parchment panel with a gilt frame, positioned by its top-left corner. */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: PanelOptions = {},
): Phaser.GameObjects.Graphics {
  const {
    fill = PARCHMENT.fill,
    fillShade = PARCHMENT.fillShade,
    fillAlpha = 1,
    border = PARCHMENT.border,
    borderAlpha = 0.95,
    borderWidth = 3,
    radius = 10,
    ornaments = true,
  } = opts;

  const g = scene.add.graphics({ x, y });

  // Silk-like vertical gradient fill.
  g.fillGradientStyle(fill, fill, fillShade, fillShade, fillAlpha);
  g.fillRoundedRect(0, 0, width, height, radius);

  // Inner lacquer-red hairline.
  g.lineStyle(1, PARCHMENT.accent, 0.4);
  g.strokeRoundedRect(2, 2, width - 4, height - 4, Math.max(0, radius - 2));

  // Outer gilt border.
  g.lineStyle(borderWidth, border, borderAlpha);
  g.strokeRoundedRect(0, 0, width, height, radius);

  if (ornaments) {
    drawCornerOrnaments(g, width, height);
  }

  return g;
}

function drawCornerOrnaments(g: Phaser.GameObjects.Graphics, width: number, height: number): void {
  const size = 5;
  const inset = 7;
  const corners: Array<[number, number]> = [
    [inset, inset],
    [width - inset, inset],
    [inset, height - inset],
    [width - inset, height - inset],
  ];

  g.fillStyle(PARCHMENT.accent, 0.7);
  for (const [cx, cy] of corners) {
    g.fillRect(cx - size / 2, cy - 1, size, 2);
    g.fillRect(cx - 1, cy - size / 2, 2, size);
  }
}

export type WoodButtonVariant = 'wood' | 'dark' | 'highlight';

export interface WoodButtonOptions {
  variant?: WoodButtonVariant;
  fontSize?: string;
  radius?: number;
  extraHitPadding?: number;
}

/**
 * Creates a wood-styled button centered at (x, y). The returned container fires
 * `onClick` on pointerup and stops propagation so map drag/taps underneath are
 * not triggered.
 */
export function createWoodButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
  opts: WoodButtonOptions = {},
): Phaser.GameObjects.Container {
  const { variant = 'wood', fontSize, radius = 8, extraHitPadding = 0 } = opts;

  const palette = woodPalette(variant);
  const container = scene.add.container(x, y);
  const graphics = scene.add.graphics();
  drawWoodButton(graphics, width, height, radius, palette, false);

  const textVariant: TextVariant = variant === 'dark' ? 'buttonDark' : 'button';
  const text = createLabel(scene, 0, 0, label, textVariant, {
    fontSize,
    align: 'center',
    wordWrap: { width: width - 12 },
  }).setOrigin(0.5);

  const hitArea = scene.add
    .rectangle(0, 0, width + extraHitPadding, height + extraHitPadding, 0xffffff, 0.001)
    .setInteractive({ useHandCursor: true });

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
    drawWoodButton(graphics, width, height, radius, palette, true);
  });
  hitArea.on('pointerup', (
    pointer: Phaser.Input.Pointer,
    localX: number,
    localY: number,
    event: Phaser.Types.Input.EventData,
  ) => {
    stop(pointer, localX, localY, event);
    drawWoodButton(graphics, width, height, radius, palette, false);
    onClick();
  });
  hitArea.on('pointerout', () => {
    drawWoodButton(graphics, width, height, radius, palette, false);
  });

  container.add([graphics, text, hitArea]);
  return container;
}

interface WoodPalette {
  top: number;
  bottom: number;
  pressedTop: number;
  pressedBottom: number;
  border: number;
  highlight: number;
  grain: number;
}

function woodPalette(variant: WoodButtonVariant): WoodPalette {
  switch (variant) {
    case 'dark':
      return {
        top: 0x6b4a30,
        bottom: 0x3f2a1a,
        pressedTop: 0x3f2a1a,
        pressedBottom: 0x2a1a10,
        border: LACQUER.gold,
        highlight: 0x8a6443,
        grain: 0x2a1a10,
      };
    case 'highlight':
      return {
        top: LACQUER.goldLight,
        bottom: LACQUER.gold,
        pressedTop: LACQUER.gold,
        pressedBottom: 0xa97b1f,
        border: LACQUER.red,
        highlight: 0xfff3cc,
        grain: 0xa97b1f,
      };
    default:
      return {
        top: WOOD.light,
        bottom: WOOD.dark,
        pressedTop: WOOD.dark,
        pressedBottom: WOOD.shadow,
        border: LACQUER.gold,
        highlight: 0xf6cf9a,
        grain: WOOD.shadow,
      };
  }
}

function drawWoodButton(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  radius: number,
  palette: WoodPalette,
  pressed: boolean,
): void {
  const w = width;
  const h = height;
  const left = -w / 2;
  const top = -h / 2;

  g.clear();

  // Drop shadow for depth.
  g.fillStyle(WOOD.shadow, 0.35);
  g.fillRoundedRect(left + 1, top + (pressed ? 1 : 2), w, h, radius);

  // Main wood-grain gradient fill.
  const fillTop = pressed ? palette.pressedTop : palette.top;
  const fillBottom = pressed ? palette.pressedBottom : palette.bottom;
  g.fillGradientStyle(fillTop, fillTop, fillBottom, fillBottom, 1);
  g.fillRoundedRect(left, top, w, h, radius);

  // Subtle wood-grain lines.
  g.lineStyle(1, palette.grain, 0.18);
  for (let i = 1; i <= 2; i += 1) {
    const gy = top + (h / 3) * i + (pressed ? 1 : 0);
    g.lineBetween(left + 4, gy, left + w - 4, gy + (i === 1 ? 1 : -1));
  }

  // Top bevel highlight.
  if (!pressed) {
    g.fillStyle(palette.highlight, 0.45);
    g.fillRoundedRect(left + 2, top + 2, w - 4, Math.max(2, h * 0.28), {
      tl: radius - 1,
      tr: radius - 1,
      bl: 0,
      br: 0,
    });
  }

  // Gilt border.
  g.lineStyle(2, palette.border, 0.9);
  g.strokeRoundedRect(left, top, w, h, radius);
}
