import Phaser from 'phaser';
import { GAME_WIDTH, HEADER_HEIGHT } from '../game/constants';
import type { GameState, ResourceKey } from '../state/types';
import { compactNumber } from '../utils/format';
import { createLabel, LACQUER, PARCHMENT, RESOURCE_ICONS } from './theme';

const RESOURCE_ORDER: ResourceKey[] = ['food', 'gold', 'manpower', 'stability', 'influence'];
const ICON_DISPLAY_SIZE = 15;
const ROW_Y = 30;

export class ResourceBar extends Phaser.GameObjects.Container {
  private seasonText: Phaser.GameObjects.Text;
  private resourceTexts: Record<ResourceKey, Phaser.GameObjects.Text>;

  constructor(scene: Phaser.Scene, private readonly gameState: GameState) {
    super(scene, 0, 0);
    this.setDepth(80);

    const back = scene.add.rectangle(0, 0, GAME_WIDTH, HEADER_HEIGHT, PARCHMENT.dark, 0.97).setOrigin(0, 0);
    const accent = scene.add.rectangle(0, HEADER_HEIGHT - 3, GAME_WIDTH, 3, LACQUER.gold, 0.9).setOrigin(0, 0);
    this.add([back, accent]);

    this.seasonText = createLabel(scene, 12, 5, '', 'title', { fontSize: '15px' });
    this.add(this.seasonText);

    const itemWidth = (GAME_WIDTH - 24) / RESOURCE_ORDER.length;
    this.resourceTexts = {} as Record<ResourceKey, Phaser.GameObjects.Text>;
    RESOURCE_ORDER.forEach((resource, index) => {
      const x = 12 + index * itemWidth;
      const icon = scene.add
        .image(x, ROW_Y, RESOURCE_ICONS[resource].key)
        .setOrigin(0, 0.5)
        .setDisplaySize(ICON_DISPLAY_SIZE, ICON_DISPLAY_SIZE);
      const text = createLabel(scene, x + ICON_DISPLAY_SIZE + 4, ROW_Y, '', 'subtitle', {
        fontSize: '12px',
      }).setOrigin(0, 0.5);
      this.resourceTexts[resource] = text;
      this.add([icon, text]);
    });

    scene.add.existing(this);
    this.refresh();
  }

  refresh(): void {
    this.seasonText.setText(`Year ${this.gameState.year} - ${this.gameState.season}`);
    RESOURCE_ORDER.forEach((resource) => {
      this.resourceTexts[resource].setText(compactNumber(this.gameState.resources[resource]));
    });
  }
}
