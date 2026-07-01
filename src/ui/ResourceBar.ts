import Phaser from 'phaser';
import { GAME_WIDTH, HEADER_HEIGHT } from '../game/constants';
import type { GameState, ResourceKey } from '../state/types';
import { compactNumber } from '../utils/format';
import { seasonLabel, t } from '../i18n';
import { InkUI, INK_UI } from './InkUI';
import { RESOURCE_ICONS } from './theme';

const RESOURCE_ORDER: ResourceKey[] = ['food', 'supplies', 'gold', 'humans'];
const ICON_DISPLAY_SIZE = 15;
const ROW_Y = 30;

export class ResourceBar extends Phaser.GameObjects.Container {
  private seasonText: Phaser.GameObjects.Text;
  private resourceTexts: Record<ResourceKey, Phaser.GameObjects.Text>;

  constructor(scene: Phaser.Scene, private readonly gameState: GameState) {
    super(scene, 0, 0);
    this.setDepth(80);
    const ui = new InkUI(scene);

    const back = scene.add.rectangle(0, 0, GAME_WIDTH, HEADER_HEIGHT, INK_UI.backgroundInk, 0.96).setOrigin(0, 0);
    this.add(back);

    this.seasonText = ui.label(12, 4, '', 'title', { color: '#fff6bd', fontSize: '15px' });
    this.add(this.seasonText);

    const itemWidth = (GAME_WIDTH - 24) / RESOURCE_ORDER.length;
    this.resourceTexts = {} as Record<ResourceKey, Phaser.GameObjects.Text>;
    RESOURCE_ORDER.forEach((resource, index) => {
      const x = 12 + index * itemWidth;
      const icon = scene.add
        .image(x, ROW_Y, RESOURCE_ICONS[resource].key)
        .setOrigin(0, 0.5)
        .setDisplaySize(ICON_DISPLAY_SIZE, ICON_DISPLAY_SIZE);
      const text = ui.label(x + ICON_DISPLAY_SIZE + 4, ROW_Y, '', 'subtitle', {
        fontSize: '12px',
      }).setOrigin(0, 0.5);
      this.resourceTexts[resource] = text;
      this.add([icon, text]);
    });

    scene.add.existing(this);
    this.refresh();
  }

  refresh(): void {
    this.seasonText.setText(t('time.yearSeason', { year: this.gameState.year, season: seasonLabel(this.gameState.season) }));
    RESOURCE_ORDER.forEach((resource) => {
      const rate = this.gameState.resourceRates[resource];
      const signedRate = rate > 0 ? `+${compactNumber(rate)}` : compactNumber(rate);
      this.resourceTexts[resource].setText(`${compactNumber(this.gameState.resources[resource])} (${signedRate})`);
      this.resourceTexts[resource].setColor(rate < 0 ? '#f0a09a' : rate > 0 ? '#d9f0bd' : '#e9d6aa');
    });
  }
}
