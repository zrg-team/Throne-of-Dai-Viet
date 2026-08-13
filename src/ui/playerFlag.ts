/**
 * Shared dynastic player-flag rendering. The colourful waving banners are part of
 * the game's identity rather than a per-theme treatment, so both the ink-wash and
 * illustrated-atlas item renderers draw the exact same flags via these helpers.
 */
import Phaser from 'phaser';
import { INK } from './inkTheme';
import { PIGMENT, mutePigment } from './ink/palette';

/**
 * The five standards keep their geometry — the waving cloth, the scalloped fringe, the nested
 * squares, the pseudo-glyph device. Only the pigments change: an art direction that throws away a
 * working system is a reskin, not a direction.
 *
 * Acid yellow becomes hoa hòe, sky blue becomes chàm, grass green becomes gỉ đồng; the red was
 * already sỏi son. `muted` desaturates the lot for a rival, so the only saturated red anywhere on
 * the map is still the player's own.
 */
interface FlagPigments {
  gold: number;
  goldBright: number;
  red: number;
  redBright: number;
  cream: number;
  blue: number;
  green: number;
  ink: number;
}

function flagPigments(muted: boolean): FlagPigments {
  const base: FlagPigments = {
    gold: PIGMENT.hoe,
    goldBright: PIGMENT.hoePale,
    red: PIGMENT.son,
    redBright: PIGMENT.sonDeep,
    cream: PIGMENT.diepHi,
    blue: PIGMENT.cham,
    green: PIGMENT.giDong,
    ink: PIGMENT.muc,
  };
  if (!muted) {
    return base;
  }
  return {
    gold: mutePigment(base.gold), goldBright: mutePigment(base.goldBright),
    red: mutePigment(base.red), redBright: mutePigment(base.redBright),
    cream: mutePigment(base.cream, 0.4), blue: mutePigment(base.blue),
    green: mutePigment(base.green), ink: base.ink,
  };
}

export type PlayerFlagStyle =
  | 'yellow-seal'
  | 'red-moon'
  | 'layered-square'
  | 'red-fringe-yellow'
  | 'yellow-red-medallion';

export const PLAYER_FLAG_STYLES: PlayerFlagStyle[] = [
  'yellow-seal',
  'red-moon',
  'layered-square',
  'red-fringe-yellow',
  'yellow-red-medallion',
];

/** Seeded dynastic standard marking land owned by the player. */
export function createPlayerLandFlag(scene: Phaser.Scene, isCapital = false, styleSeed = 0, muted = false): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  const pole = scene.add.graphics();
  const cloth = scene.add.graphics();
  const scale = isCapital ? 1.22 : 1;
  const style = pickFlagStyle(styleSeed);
  const poleX = 0;
  const poleTop = -46 * scale;
  const poleBottom = 8 * scale;
  const flagW = (style === 'layered-square' ? 28 : style === 'red-fringe-yellow' ? 29 : 25) * scale;
  const flagH = (style === 'layered-square' ? 22 : style === 'red-fringe-yellow' ? 18 : 17) * scale;

  pole.lineStyle(2.2 * scale, INK.ink, 0.85);
  pole.lineBetween(poleX, poleBottom, poleX, poleTop);
  pole.fillStyle(INK.ink, 0.24);
  pole.fillEllipse(poleX, poleBottom + 2 * scale, 12 * scale, 4 * scale);

  drawPlayerFlagCloth(cloth, style, poleX, poleTop, flagW, flagH, scale, styleSeed, muted);

  scene.tweens.add({
    targets: cloth,
    scaleX: { from: 0.96, to: 1.08 },
    skewX: { from: -0.05, to: 0.05 },
    duration: 900 + (isCapital ? 120 : 0),
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  container.add([pole, cloth]);
  return container;
}

export function pickFlagStyle(seed: number): PlayerFlagStyle {
  const index = Math.abs(seed) % PLAYER_FLAG_STYLES.length;
  return PLAYER_FLAG_STYLES[index];
}

function drawPlayerFlagCloth(
  graphics: Phaser.GameObjects.Graphics,
  style: PlayerFlagStyle,
  poleX: number,
  poleTop: number,
  flagW: number,
  flagH: number,
  scale: number,
  seed: number,
  muted = false,
): void {
  const pig = flagPigments(muted);

  if (style === 'yellow-seal') {
    drawWavingRect(graphics, poleX, poleTop, flagW, flagH, pig.gold, 0.98, scale);
    graphics.lineStyle(2.2 * scale, pig.ink, 0.62);
    graphics.strokePath();
    graphics.fillStyle(pig.red, 0.94);
    graphics.fillCircle(poleX + flagW * 0.56, poleTop + flagH * 0.5, flagH * 0.32);
    drawPseudoGlyph(graphics, poleX + flagW * 0.56, poleTop + flagH * 0.52, scale * 0.46, pig.ink, seed);
    return;
  }

  if (style === 'red-moon') {
    drawWavingRect(graphics, poleX, poleTop, flagW, flagH, pig.red, 0.98, scale);
    graphics.lineStyle(2.4 * scale, pig.gold, 0.98);
    graphics.strokePath();
    graphics.fillStyle(pig.cream, 0.96);
    graphics.fillCircle(poleX + flagW * 0.55, poleTop + flagH * 0.52, flagH * 0.36);
    drawPseudoGlyph(graphics, poleX + flagW * 0.55, poleTop + flagH * 0.55, scale * 0.5, pig.ink, seed + 1);
    return;
  }

  if (style === 'layered-square') {
    drawScallopedFringe(graphics, poleX, poleTop, flagW, flagH, scale, pig.red);
    graphics.fillStyle(pig.blue, 0.96);
    graphics.fillRect(poleX + flagW * 0.08, poleTop + flagH * 0.12, flagW * 0.82, flagH * 0.76);
    graphics.fillStyle(pig.goldBright, 0.98);
    graphics.fillRect(poleX + flagW * 0.18, poleTop + flagH * 0.22, flagW * 0.62, flagH * 0.56);
    graphics.fillStyle(pig.green, 0.98);
    graphics.fillRect(poleX + flagW * 0.28, poleTop + flagH * 0.32, flagW * 0.42, flagH * 0.36);
    graphics.fillStyle(pig.red, 0.98);
    graphics.fillRect(poleX + flagW * 0.37, poleTop + flagH * 0.4, flagW * 0.24, flagH * 0.2);
    drawPseudoGlyph(graphics, poleX + flagW * 0.49, poleTop + flagH * 0.52, scale * 0.36, pig.goldBright, seed + 2);
    return;
  }

  if (style === 'red-fringe-yellow') {
    drawScallopedFringe(graphics, poleX, poleTop, flagW, flagH, scale, pig.red);
    graphics.fillStyle(pig.gold, 0.98);
    graphics.fillRect(poleX + flagW * 0.08, poleTop + flagH * 0.14, flagW * 0.76, flagH * 0.7);
    if (seed % 2 === 0) {
      graphics.lineStyle(1.7 * scale, pig.red, 0.94);
      graphics.strokeCircle(poleX + flagW * 0.47, poleTop + flagH * 0.49, flagH * 0.28);
      drawPseudoGlyph(graphics, poleX + flagW * 0.47, poleTop + flagH * 0.5, scale * 0.44, pig.ink, seed + 3);
    } else {
      drawPseudoGlyph(graphics, poleX + flagW * 0.48, poleTop + flagH * 0.52, scale * 0.5, pig.red, seed + 4);
    }
    return;
  }

  drawWavingRect(graphics, poleX, poleTop, flagW, flagH, pig.gold, 0.98, scale);
  graphics.lineStyle(2.2 * scale, pig.red, 0.95);
  graphics.strokePath();
  graphics.fillStyle(pig.red, 0.94);
  graphics.fillCircle(poleX + flagW * 0.55, poleTop + flagH * 0.5, flagH * 0.34);
  drawPseudoGlyph(graphics, poleX + flagW * 0.55, poleTop + flagH * 0.53, scale * 0.48, pig.ink, seed + 5);
}

function drawWavingRect(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha: number,
  scale: number,
): void {
  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(x, y);
  graphics.lineTo(x + width * 0.44, y + 1.5 * scale);
  graphics.lineTo(x + width, y);
  graphics.lineTo(x + width, y + height);
  graphics.lineTo(x + width * 0.46, y + height - 1.3 * scale);
  graphics.lineTo(x, y + height);
  graphics.closePath();
  graphics.fillPath();
}

function drawScallopedFringe(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  color: number,
): void {
  graphics.fillStyle(color, 0.96);
  graphics.fillRect(x, y, width, height);
  graphics.lineStyle(1.1 * scale, INK.ink, 0.32);
  graphics.strokeRect(x, y, width, height);
}

function drawPseudoGlyph(
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  scale: number,
  color: number,
  seed: number,
): void {
  const variant = Math.abs(seed) % 5;
  graphics.lineStyle(Math.max(0.75, 1.55 * scale), color, 0.95);

  if (variant === 0) {
    graphics.lineBetween(centerX - 5 * scale, centerY - 6 * scale, centerX + 5 * scale, centerY - 6 * scale);
    graphics.lineBetween(centerX, centerY - 8 * scale, centerX, centerY + 8 * scale);
    graphics.lineBetween(centerX - 6 * scale, centerY + 1 * scale, centerX + 6 * scale, centerY + 1 * scale);
    graphics.lineBetween(centerX - 3 * scale, centerY + 6 * scale, centerX + 5 * scale, centerY + 10 * scale);
    return;
  }

  if (variant === 1) {
    graphics.lineBetween(centerX - 6 * scale, centerY - 7 * scale, centerX + 6 * scale, centerY - 7 * scale);
    graphics.lineBetween(centerX - 2 * scale, centerY - 9 * scale, centerX - 2 * scale, centerY + 9 * scale);
    graphics.lineBetween(centerX - 7 * scale, centerY + 1 * scale, centerX + 7 * scale, centerY + 1 * scale);
    graphics.lineBetween(centerX + 4 * scale, centerY - 7 * scale, centerX + 4 * scale, centerY + 8 * scale);
    return;
  }

  if (variant === 2) {
    graphics.lineBetween(centerX - 7 * scale, centerY - 4 * scale, centerX + 7 * scale, centerY - 4 * scale);
    graphics.lineBetween(centerX - 3 * scale, centerY - 9 * scale, centerX - 3 * scale, centerY + 8 * scale);
    graphics.lineBetween(centerX - 6 * scale, centerY + 5 * scale, centerX + 7 * scale, centerY + 5 * scale);
    graphics.lineBetween(centerX + 5 * scale, centerY - 2 * scale, centerX + 1 * scale, centerY + 9 * scale);
    return;
  }

  if (variant === 3) {
    graphics.lineBetween(centerX - 5 * scale, centerY - 7 * scale, centerX + 6 * scale, centerY - 8 * scale);
    graphics.lineBetween(centerX, centerY - 7 * scale, centerX, centerY + 6 * scale);
    graphics.lineBetween(centerX - 5 * scale, centerY + 3 * scale, centerX + 6 * scale, centerY + 3 * scale);
    graphics.lineBetween(centerX - 2 * scale, centerY + 8 * scale, centerX + 3 * scale, centerY + 5 * scale);
    return;
  }

  graphics.lineBetween(centerX - 6 * scale, centerY - 8 * scale, centerX + 7 * scale, centerY - 6 * scale);
  graphics.lineBetween(centerX - 2 * scale, centerY - 6 * scale, centerX - 2 * scale, centerY + 8 * scale);
  graphics.lineBetween(centerX - 7 * scale, centerY, centerX + 5 * scale, centerY);
  graphics.lineBetween(centerX + 3 * scale, centerY - 5 * scale, centerX + 3 * scale, centerY + 9 * scale);
}
