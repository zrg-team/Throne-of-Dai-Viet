/**
 * **Deprecated.** The setup screen the `rival`, `campaign` and `empire` modes start from. Dragon
 * Ascent opens from the menu directly into `ConquestScene`.
 *
 * Still registered and still reachable; see `./README.md` for what is in this folder, what looks
 * like it belongs here and does not, and what has to change before any of it can go.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../game/constants';
import { createCampaignGameState, createEmpireGameState } from '../../state/GameState';
import { scheduleCampaignEvents } from '../../systems/CampaignEventSystem';
import type { CampaignConfig, Difficulty, GameMode } from '../../state/types';
import { BACK_BAR_HEIGHT, InkUI, INK_UI } from '../../ui/InkUI';
import { createLabel } from '../../ui/theme';
import { createMapRenderer, type MapRenderer } from '../../ui/MapRenderer';
import { FOUNDER_IDS, heroTemplates } from '../../data/heroes';
import { heroEffect, heroName, heroTypeLabel, t } from '../../i18n';
import { applyRenderScale } from '../../game/graphicsQuality';

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
  private selectedFounderId: string = FOUNDER_IDS[0];
  private mode: GameMode = 'campaign';

  constructor() {
    super('CampaignScene');
  }

  init(data?: { mode?: GameMode }): void {
    this.mode = data?.mode === 'empire' ? 'empire' : 'campaign';
  }

  create(): void {
    applyRenderScale(this);
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

    this.renderSectionLabel(130, t('campaign.mapType'), '#e8d89a');
    this.renderOptionRow(mapOpts, 158, (idx) => {
      this.selectedSeaSides = mapOpts[idx].seaSides;
      this.render();
    }, (o) => o.seaSides === this.selectedSeaSides);

    this.renderSectionLabel(222, t('campaign.difficulty'), '#e8d89a');
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

    if (this.mode === 'empire') {
      this.renderFounderCard(334);
    } else {
      this.renderInfoCard(334);
    }

    const beginBtn = this.ui.button(
      { x: 54, y: 596, width: GAME_WIDTH - 108, height: 52 },
      t('campaign.beginDynasty'),
      () => this.startCampaign(),
      { variant: 'primary', fontSize: '17px' },
    );
    this.content.push(beginBtn);

    // Clamped, not pinned at 662: `GAME_HEIGHT` follows the device and clamps as low as 620, where
    // a bar written down against the 844 sheet is thirty points below the bottom of the screen.
    this.content.push(this.ui.backBar(
      Math.min(662, GAME_HEIGHT - BACK_BAR_HEIGHT - 10),
      () => this.scene.start('MenuScene'),
    ));
  }

  private renderSectionLabel(y: number, label: string, color?: string): void {
    const text = createLabel(this, GAME_WIDTH / 2, y, label.toUpperCase(), 'caption', {
      fontSize: '11px',
      fontStyle: '700',
      align: 'center',
      ...(color ? { color } : {}),
    }).setOrigin(0.5);
    this.content.push(text);
  }

  private renderOptionRow<T extends { label: string }>(
    options: T[],
    y: number,
    onSelect: (idx: number) => void,
    isSelected: (option: T) => boolean,
    opts: { btnH?: number } = {},
  ): void {
    const btnW = Math.floor((GAME_WIDTH - 56) / options.length);
    const btnH = opts.btnH ?? 42;
    const startX = 28;

    for (let i = 0; i < options.length; i += 1) {
      const option = options[i];
      const x = startX + i * btnW;
      const selected = isSelected(option);

      // Shared crayon tile keeps these selectors consistent with the menu's
      // theme/language tiles; dark ink text reads on both themes' backgrounds.
      const bounds = { x: x + 2, y, width: btnW - 4, height: btnH };
      const tile = this.ui.crayonTile(bounds, { selected });
      const hit = this.add
        .rectangle(bounds.x + bounds.width / 2, y + btnH / 2, bounds.width, btnH, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => onSelect(i));

      // Auto-fit: wrap within the tile and shrink the font a step for labels too
      // long to sit on one line (e.g. full Vietnamese hero names), so text never
      // spills past the tile edges.
      const wrapWidth = btnW - 12;
      const longLabel = option.label.length > 10;
      const labelText = createLabel(this, x + btnW / 2, y + btnH / 2, option.label, 'label', {
        fontSize: longLabel ? '11px' : '13px',
        fontStyle: selected ? '700' : '400',
        color: selected ? '#211103' : '#3a2a14',
        align: 'center',
        wordWrap: { width: wrapWidth },
      }).setOrigin(0.5);

      this.content.push(tile, hit, labelText);
    }
  }

  private founderOptions(): Array<{ id: string; label: string; desc: string }> {
    return FOUNDER_IDS.map((id) => {
      const hero = heroTemplates.find((h) => h.id === id);
      if (!hero) {
        return { id, label: id, desc: '' };
      }
      return {
        id,
        label: heroName(hero),
        desc: `${heroTypeLabel(hero.type)} · ${heroEffect(hero)}`,
      };
    });
  }

  private renderFounderCard(cardY: number): void {
    const cardH = 176;
    const g = this.add.graphics();
    g.fillStyle(0x1a1208, 0.65);
    g.fillRoundedRect(28, cardY, GAME_WIDTH - 56, cardH, 8);
    g.lineStyle(1.5, INK_UI.gold, 0.52);
    g.strokeRoundedRect(28, cardY, GAME_WIDTH - 56, cardH, 8);
    this.content.push(g);

    this.renderSectionLabel(cardY + 16, t('campaign.founder'), '#e8d89a');

    const opts = this.founderOptions();
    this.renderOptionRow(opts, cardY + 38, (idx) => {
      this.selectedFounderId = opts[idx].id;
      this.render();
    }, (o) => o.id === this.selectedFounderId, { btnH: 48 });

    const selected = opts.find((o) => o.id === this.selectedFounderId);
    const blurb = createLabel(this, GAME_WIDTH / 2, cardY + 100, selected?.desc ?? '', 'caption', {
      fontSize: '12px',
      color: '#8a5f1c',
      align: 'center',
      wordWrap: { width: GAME_WIDTH - 96 },
    }).setOrigin(0.5, 0);
    this.content.push(blurb);
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
        color: '#8a5f1c',
        wordWrap: { width: GAME_WIDTH - 88 },
      });
      this.content.push(text);
    }
  }

  private startCampaign(): void {
    const config: CampaignConfig = {
      seaSides: this.selectedSeaSides,
      difficulty: this.selectedDifficulty,
      founderId: this.mode === 'empire' ? this.selectedFounderId : undefined,
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
