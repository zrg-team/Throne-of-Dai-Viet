import Phaser from 'phaser';
import type { LanguageCode } from '../i18n';
import { INK } from './inkTheme';

/**
 * A tiny, authored flag for the two languages the game ships in.
 *
 * Drawn in Phaser rather than as emoji: colour emoji vary by OS, may become monochrome tofu in a
 * webview, and do not share a baseline with the game's bundled fonts. The container is centred on
 * its origin so a caller can place it beside text without knowing anything about its drawing.
 */
export function drawLanguageFlag(
  scene: Phaser.Scene,
  language: LanguageCode,
  width = 22,
  height = 14,
): Phaser.GameObjects.Container {
  const flag = scene.add.container(0, 0).setData('languageFlag', language);
  const g = scene.add.graphics();
  const left = -width / 2;
  const top = -height / 2;

  if (language === 'vi') {
    g.fillStyle(0xb7352a, 1);
    g.fillRect(left, top, width, height);

    const star: Phaser.Types.Math.Vector2Like[] = [];
    const outer = height * 0.29;
    const inner = outer * 0.42;
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const radius = point % 2 === 0 ? outer : inner;
      star.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    g.fillStyle(0xf4d35e, 1);
    g.fillPoints(star, true);
  } else {
    // Union flag: broad white saltires, narrow red saltires, then the upright cross.
    g.fillStyle(0x23436d, 1);
    g.fillRect(left, top, width, height);
    g.lineStyle(Math.max(2.5, height * 0.28), 0xf7efd9, 1);
    g.lineBetween(left, top, -left, -top);
    g.lineBetween(left, -top, -left, top);
    g.lineStyle(Math.max(1.1, height * 0.11), 0xb7352a, 1);
    g.lineBetween(left, top, -left, -top);
    g.lineBetween(left, -top, -left, top);
    g.lineStyle(Math.max(3.5, height * 0.38), 0xf7efd9, 1);
    g.lineBetween(left, 0, -left, 0);
    g.lineBetween(0, top, 0, -top);
    g.lineStyle(Math.max(1.8, height * 0.2), 0xb7352a, 1);
    g.lineBetween(left, 0, -left, 0);
    g.lineBetween(0, top, 0, -top);
  }

  g.lineStyle(0.8, INK.ink, 0.65);
  g.strokeRect(left, top, width, height);
  flag.add(g);
  return flag;
}
