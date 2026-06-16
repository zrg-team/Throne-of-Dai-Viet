import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import type { GameState } from '../state/types';
import { InkUI, INK_UI } from './InkUI';

export const ACTION_BUTTON_LABELS = ['Build', 'Heroes', 'Court', 'Army', 'Map'];
export const ACTION_BUTTON_WIDTH = 72;
export const ACTION_BUTTON_HEIGHT = 36;
export const ACTION_BUTTON_GAP = 4;
export const ACTION_BUTTON_MARGIN = 6;
export const ACTION_BUTTON_Y = GAME_HEIGHT - ACTION_BAR_HEIGHT / 2;

export function actionButtonLeft(index: number): number {
  return ACTION_BUTTON_MARGIN + index * (ACTION_BUTTON_WIDTH + ACTION_BUTTON_GAP);
}

export class ActionBar extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    private readonly gameState: GameState,
    private readonly onAction: (action: string) => void,
  ) {
    super(scene, 0, 0);
    this.setDepth(420);
    const ui = new InkUI(scene);
    const top = GAME_HEIGHT - ACTION_BAR_HEIGHT;
    this.add(scene.add.rectangle(0, top, GAME_WIDTH, ACTION_BAR_HEIGHT, INK_UI.backgroundInk, 0.96).setOrigin(0, 0));
    this.add(scene.add.rectangle(14, top + 3, GAME_WIDTH - 28, 2, INK_UI.cinnabar, 0.78).setOrigin(0, 0));

    ACTION_BUTTON_LABELS.forEach((label, index) => {
      const button = ui.button(
        {
          x: actionButtonLeft(index),
          y: ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2,
          width: ACTION_BUTTON_WIDTH,
          height: ACTION_BUTTON_HEIGHT,
        },
        label,
        () => this.onAction(label.toLowerCase()),
        { fontSize: '12px', variant: label === 'Map' ? 'ghost' : 'secondary' },
      );
      this.add(button);
    });

    scene.add.existing(this);
    this.refresh();
  }

  refresh(): void {
    void this.gameState;
  }
}
