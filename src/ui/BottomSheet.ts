import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { PARCHMENT } from './theme';

export { ACTION_BAR_HEIGHT };
export const SHEET_HEIGHT = 250;
export const SHEET_BOTTOM = GAME_HEIGHT - ACTION_BAR_HEIGHT;
export const SHEET_TOP = SHEET_BOTTOM - SHEET_HEIGHT;

export class BottomSheet extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Rectangle;
  private content: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.setDepth(100);
    this.background = scene.add
      .rectangle(0, SHEET_BOTTOM, GAME_WIDTH, SHEET_HEIGHT, PARCHMENT.dark, 0.94)
      .setOrigin(0, 1);
    this.background.setStrokeStyle(4, PARCHMENT.darkBorder, 0.72);
    this.add(this.background);
    scene.add.existing(this);
  }

  show(children: Phaser.GameObjects.GameObject[]): void {
    this.clearContent();
    for (const child of children) {
      this.add(child);
    }
    this.content = children;
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }

  clearContent(): void {
    for (const child of this.content) {
      child.destroy();
    }
    this.content = [];
  }
}
