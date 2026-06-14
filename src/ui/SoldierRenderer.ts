/**
 * Small isometric soldier figures used to dress out army markers on the map: a
 * conical-hat infantryman with a spear, bow, or shield, in a player/enemy color
 * scheme. Each figure gets a subtle marching bob + spear/bow sway animation.
 */
import Phaser from 'phaser';
import { INK, shade } from './inkTheme';

export interface SoldierColors {
  armor: number;
  hat: number;
  skin: number;
}

const PLAYER_SOLDIER: SoldierColors = { armor: 0x9c6b3a, hat: 0xe3d3a8, skin: 0xe3b690 };
const ENEMY_SOLDIER: SoldierColors = { armor: 0x5f5b52, hat: 0xc7bfa8, skin: 0xcaa888 };

export class SoldierRenderer {
  constructor(private readonly scene: Phaser.Scene) {}

  /** Draws one small soldier figure: legs, armored torso, head, conical hat, and a weapon variant. */
  createSoldier(colors: SoldierColors, variant: number, scale = 1): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const body = this.scene.add.graphics();

    const legW = 1.6 * scale;
    const legH = 2.2 * scale;
    const bodyW = 4.4 * scale;
    const bodyH = 3.8 * scale;
    const headR = 1.5 * scale;

    body.fillStyle(shade(colors.armor, 0.55), 0.9);
    body.fillRect(-legW, 0, legW * 2, legH);

    body.fillStyle(colors.armor, 0.95);
    body.fillRect(-bodyW / 2, -bodyH, bodyW, bodyH);
    body.lineStyle(0.6, INK.ink, 0.45);
    body.strokeRect(-bodyW / 2, -bodyH, bodyW, bodyH);

    body.fillStyle(colors.skin, 1);
    body.fillCircle(0, -bodyH - headR * 0.5, headR);

    const hatY = -bodyH - headR * 0.5;
    body.fillStyle(colors.hat, 1);
    body.fillTriangle(-headR * 1.7, hatY, headR * 1.7, hatY, 0, hatY - headR * 1.9);
    body.lineStyle(0.5, INK.ink, 0.35);
    body.strokeTriangle(-headR * 1.7, hatY, headR * 1.7, hatY, 0, hatY - headR * 1.9);

    container.add(body);

    const weapon = this.scene.add.graphics();
    if (variant === 1) {
      // Bow: a small curved stroke held out front.
      weapon.lineStyle(1, shade(colors.armor, 0.7), 0.9);
      weapon.beginPath();
      weapon.arc(bodyW / 2 + 0.5 * scale, -bodyH / 2, 2.2 * scale, Phaser.Math.DegToRad(-65), Phaser.Math.DegToRad(65));
      weapon.strokePath();
    } else if (variant === 2) {
      // Round shield on the off-hand side.
      weapon.fillStyle(shade(colors.armor, 0.65), 0.95);
      weapon.fillCircle(-bodyW / 2 - 1 * scale, -bodyH / 2, 1.8 * scale);
      weapon.lineStyle(0.5, INK.ink, 0.45);
      weapon.strokeCircle(-bodyW / 2 - 1 * scale, -bodyH / 2, 1.8 * scale);
    } else {
      // Spear, raised diagonally above the shoulder.
      const tipX = bodyW / 2 + 1.5 * scale;
      const tipY = -bodyH - 6 * scale;
      weapon.lineStyle(1, 0x9a958a, 0.9);
      weapon.lineBetween(bodyW / 2, -bodyH + 0.5 * scale, tipX, tipY);
      weapon.fillStyle(0xd8d4c8, 1);
      weapon.fillTriangle(tipX - 0.8 * scale, tipY, tipX + 0.8 * scale, tipY, tipX, tipY - 1.6 * scale);
    }
    container.add(weapon);

    return container;
  }

  /** A formation of soldiers, with a single gentle synchronized bob for the whole group. */
  createFormation(isPlayer: boolean, count = 12): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const colors = isPlayer ? PLAYER_SOLDIER : ENEMY_SOLDIER;
    const cols = 4;
    const colSpacing = 5.5;
    const rowSpacing = 4.5;

    for (let index = 0; index < count; index += 1) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const variant = index % 3;
      const soldier = this.createSoldier(colors, variant, 0.85);
      soldier.setPosition(-8.25 + col * colSpacing, 1 + row * rowSpacing);
      container.add(soldier);
    }

    this.scene.tweens.add({
      targets: container,
      y: '+=1.5',
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });

    return container;
  }
}
