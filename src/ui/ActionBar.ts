import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import type { GameState } from '../state/types';
import { createLabel, createWoodButton, LACQUER, PARCHMENT } from './theme';

export const ACTION_BUTTON_LABELS = ['Build', 'Heroes', 'Court', 'Army', 'Map'];
export const ACTION_BUTTON_WIDTH = 72;
export const ACTION_BUTTON_HEIGHT = 36;
export const ACTION_BUTTON_GAP = 4;
export const ACTION_BUTTON_MARGIN = 6;
export const ACTION_BUTTON_Y = GAME_HEIGHT - ACTION_BUTTON_HEIGHT / 2 - 4;

export function actionButtonLeft(index: number): number {
  return ACTION_BUTTON_MARGIN + index * (ACTION_BUTTON_WIDTH + ACTION_BUTTON_GAP);
}

export class ActionBar extends Phaser.GameObjects.Container {
  private statusText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly gameState: GameState,
    private readonly onAction: (action: string) => void,
  ) {
    super(scene, 0, 0);
    this.setDepth(420);
    const top = GAME_HEIGHT - ACTION_BAR_HEIGHT;
    this.add(scene.add.rectangle(0, top, GAME_WIDTH, ACTION_BAR_HEIGHT, PARCHMENT.dark, 0.98).setOrigin(0, 0));
    this.add(scene.add.rectangle(0, top, GAME_WIDTH, 3, LACQUER.gold, 0.9).setOrigin(0, 0));
    this.statusText = createLabel(scene, ACTION_BUTTON_MARGIN, top + 5, '', 'subtitle', { fontSize: '11px' });
    this.add(this.statusText);

    ACTION_BUTTON_LABELS.forEach((label, index) => {
      const x = actionButtonLeft(index) + ACTION_BUTTON_WIDTH / 2;
      const button = createWoodButton(
        scene,
        x,
        ACTION_BUTTON_Y,
        ACTION_BUTTON_WIDTH,
        ACTION_BUTTON_HEIGHT,
        label,
        () => this.onAction(label.toLowerCase()),
        { fontSize: '12px' },
      );
      this.add(button);
    });

    scene.add.existing(this);
    this.refresh();
  }

  refresh(): void {
    this.statusText.setText(`Live Command   Year ${this.gameState.year} / ${this.gameState.season}`);
  }
}
