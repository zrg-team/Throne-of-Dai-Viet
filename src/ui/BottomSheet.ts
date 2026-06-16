import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { InkUI, INK_UI } from './InkUI';

export { ACTION_BAR_HEIGHT };
export const SHEET_HEIGHT = 276;
export const SHEET_BOTTOM = GAME_HEIGHT - ACTION_BAR_HEIGHT;
export const SHEET_TOP = SHEET_BOTTOM - SHEET_HEIGHT;

export class BottomSheet extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Graphics;
  private content: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.setDepth(100);
    const ui = new InkUI(scene);
    this.background = ui.panel(
      { x: 8, y: SHEET_TOP + 4, width: GAME_WIDTH - 16, height: SHEET_HEIGHT - 8 },
      { fill: INK_UI.parchmentDark, fillShade: INK_UI.parchment, fillAlpha: 0.96, radius: 12, border: INK_UI.brush },
    );
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
