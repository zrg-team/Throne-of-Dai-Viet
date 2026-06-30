import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { createCampaignGameState, createEmpireGameState } from '../state/GameState';
import { scheduleCampaignEvents } from '../systems/CampaignEventSystem';
import type { CampaignConfig, Difficulty, GameMode } from '../state/types';
import { InkUI, INK_UI } from '../ui/InkUI';
import { createLabel } from '../ui/theme';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { t } from '../i18n';

type SeaSides = CampaignConfig['seaSides'];

interface MapTypeOption {
  seaSides: SeaSides;
  label: string;
  desc: string;
}

interface DifficultyOption {
  difficulty: Difficulty;
  label: string;
  desc: string;
}

export class CampaignScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  private content: Phaser.GameObjects.GameObject[] = [];
  private selectedSeaSides: SeaSides = 0;
  private selectedDifficulty: Difficulty = 'normal';
  private mode: GameMode = 'campaign';

  constructor() {
    super('CampaignScene');
  }

  init(data?: { mode?: GameMode }): void {
    this.mode = data?.mode === 'empire' ? 'empire' : 'campaign';
  }

  create(): void {
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT);
    this.drawBanner();
    this.render();
  }

  private mapTypeOptions(): MapTypeOption[] {
    return [
      { seaSides: 0, label: t('campaign.mapType.allLand'), desc: t('campaign.mapType.allLand.desc') },
      { seaSides: 1, label: t('campaign.mapType.coastal'), desc: t('campaign.mapType.coastal.desc') },
      { seaSides: 2, label: t('campaign.mapType.peninsula'), desc: t('campaign.mapType.peninsula.desc') },
      { seaSides: 3, label: t('campaign.mapType.island'), desc: t('campaign.mapType.island.desc') },
    ];
  }

  private difficultyOptions(): DifficultyOption[] {
    return [
      { difficulty: 'easy', label: t('campaign.difficulty.easy'), desc: t('campaign.difficulty.easy.desc') },
      { difficulty: 'normal', label: t('campaign.difficulty.normal'), desc: t('campaign.difficulty.normal.desc') },
      { difficulty: 'hard', label: t('campaign.difficulty.hard'), desc: t('campaign.difficulty.hard.desc') },
      { difficulty: 'ironman', label: t('campaign.difficulty.ironman'), desc: t('campaign.difficulty.ironman.desc') },
    ];
  }

  private drawBanner(): void {
    const g = this.add.graphics();
    g.fillStyle(0x1a1208, 0.72);
    g.fillRect(0, 0, GAME_WIDTH, 110);
    g.lineStyle(2, INK_UI.gold, 0.88);
    g.lineBetween(28, 108, GAME_WIDTH - 28, 108);
  }

  private render(): void {
    this.clearContent();

    const title = createLabel(this, GAME_WIDTH / 2, 34, this.mode === 'empire' ? t('empire.menu.title') : t('campaign.setupTitle'), 'title', {
      fontSize: this.mode === 'empire' ? '22px' : '26px',
      align: 'center',
    }).setOrigin(0.5);
    this.content.push(title);

    const mapOpts = this.mapTypeOptions();
    const diffOpts = this.difficultyOptions();

    this.renderSectionLabel(130, t('campaign.mapType'));
    this.renderOptionRow(mapOpts, 158, (idx) => {
      this.selectedSeaSides = mapOpts[idx].seaSides;
      this.render();
    }, (o) => o.seaSides === this.selectedSeaSides);

    this.renderSectionLabel(222, t('campaign.difficulty'));
    this.renderOptionRow(diffOpts, 250, (idx) => {
      this.selectedDifficulty = diffOpts[idx].difficulty;
      this.render();
    }, (o) => o.difficulty === this.selectedDifficulty);

    const mapDesc = mapOpts.find((o) => o.seaSides === this.selectedSeaSides)?.desc ?? '';
    const diffDesc = diffOpts.find((o) => o.difficulty === this.selectedDifficulty)?.desc ?? '';
    const descText = createLabel(this, GAME_WIDTH / 2, 312, `${mapDesc}  ·  ${diffDesc}`, 'caption', {
      fontSize: '12px',
      align: 'center',
    }).setOrigin(0.5);
    this.content.push(descText);

    this.renderInfoCard(334);

    const beginBtn = this.ui.button(
      { x: 54, y: 596, width: GAME_WIDTH - 108, height: 52 },
      t('campaign.beginDynasty'),
      () => this.startCampaign(),
      { variant: 'primary', fontSize: '17px' },
    );
    this.content.push(beginBtn);

    const backBtn = this.ui.button(
      { x: 54, y: 662, width: GAME_WIDTH - 108, height: 40 },
      t('menu.back'),
      () => this.scene.start('MenuScene'),
      { variant: 'secondary', fontSize: '14px' },
    );
    this.content.push(backBtn);
  }

  private renderSectionLabel(y: number, label: string): void {
    const text = createLabel(this, GAME_WIDTH / 2, y, label.toUpperCase(), 'caption', {
      fontSize: '11px',
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5);
    this.content.push(text);
  }

  private renderOptionRow<T extends { label: string }>(
    options: T[],
    y: number,
    onSelect: (idx: number) => void,
    isSelected: (option: T) => boolean,
  ): void {
    const btnW = Math.floor((GAME_WIDTH - 56) / options.length);
    const btnH = 42;
    const startX = 28;

    for (let i = 0; i < options.length; i += 1) {
      const option = options[i];
      const x = startX + i * btnW;
      const selected = isSelected(option);

      // Unselected tabs stay an opaque parchment chip with dark ink text so they
      // read on both the dark ink-wash sea and the light illustrated-atlas paper.
      const bg = this.add
        .rectangle(x + 1, y + 1, btnW - 2, btnH - 2, selected ? INK_UI.goldLight : INK_UI.parchmentShade, selected ? 0.95 : 0.78)
        .setOrigin(0, 0);
      bg.setStrokeStyle(selected ? 2 : 1, selected ? INK_UI.gold : INK_UI.brush, selected ? 0.9 : 0.55);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerup', () => onSelect(i));

      const labelText = createLabel(this, x + btnW / 2, y + btnH / 2, option.label, 'label', {
        fontSize: '13px',
        fontStyle: selected ? '700' : '400',
        color: selected ? '#211103' : '#3a2a14',
        align: 'center',
      }).setOrigin(0.5);

      this.content.push(bg, labelText);
    }
  }

  private renderInfoCard(cardY: number): void {
    const cardH = 176;
    const g = this.add.graphics();
    g.fillStyle(0x1a1208, 0.65);
    g.fillRoundedRect(28, cardY, GAME_WIDTH - 56, cardH, 8);
    g.lineStyle(1.5, INK_UI.gold, 0.52);
    g.strokeRoundedRect(28, cardY, GAME_WIDTH - 56, cardH, 8);
    this.content.push(g);

    const infoLines = [
      t('campaign.info.survive'),
      t('campaign.info.center'),
      t('campaign.info.nobles'),
      t('campaign.info.spy'),
      t('campaign.info.sea'),
    ];

    for (let i = 0; i < infoLines.length; i += 1) {
      const text = createLabel(this, 44, cardY + 14 + i * 30, infoLines[i], 'caption', {
        fontSize: '12px',
        color: '#e8d89a',
        wordWrap: { width: GAME_WIDTH - 88 },
      });
      this.content.push(text);
    }
  }

  private startCampaign(): void {
    const config: CampaignConfig = {
      seaSides: this.selectedSeaSides,
      difficulty: this.selectedDifficulty,
    };
    const state = this.mode === 'empire'
      ? createEmpireGameState(config)
      : createCampaignGameState(config);
    scheduleCampaignEvents(state);
    this.scene.start('MapScene', { state });
  }

  private clearContent(): void {
    for (const item of this.content) {
      item.destroy();
    }
    this.content = [];
  }
}
