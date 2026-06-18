import Phaser from 'phaser';
import type { GameState } from '../state/types';
import { GAME_WIDTH } from '../game/constants';
import { InkUI, INK_UI } from './InkUI';
import { createLabel, createWoodButton } from './theme';
import { demandTribute, negotiatePact, proposeTrade, sendGift } from '../systems/ForeignAffairsSystem';
import { PLAYER_KINGDOM_ID } from '../game/constants';
import { t } from '../i18n';

export class ForeignAffairsPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly onAction: () => void,
  ) {}

  render(contentBounds: { x: number; y: number; width: number; height: number }): Phaser.GameObjects.GameObject[] {
    const ui = new InkUI(this.scene);
    const items: Phaser.GameObjects.GameObject[] = [];
    const { x, y, width } = contentBounds;

    const rivals = this.state.kingdoms.filter(
      (k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated,
    );

    if (rivals.length === 0) {
      items.push(createLabel(this.scene, GAME_WIDTH / 2, y + 80, 'No rival kingdoms remain.', 'label', {
        fontSize: '14px',
        align: 'center',
        wordWrap: { width: width - 16 },
      }).setOrigin(0.5));
      return items;
    }

    const cardH = 178;
    const gap = 12;

    rivals.forEach((kingdom, i) => {
      const cardY = y + i * (cardH + gap);
      const relations = kingdom.relations ?? 50;
      const hostile = (kingdom.hostilityTimer ?? 0) > 0;
      const relLabel = relations >= 65
        ? t('campaign.affairs.friendly')
        : relations <= 35
          ? t('campaign.affairs.hostile')
          : t('campaign.affairs.neutral');
      const relColor = relations >= 65 ? INK_UI.jade : relations <= 35 ? INK_UI.cinnabar : INK_UI.gold;

      items.push(ui.card({ x, y: cardY, width, height: cardH }, {
        border: hostile ? INK_UI.cinnabar : INK_UI.softBrush,
      }));

      // Kingdom name
      items.push(createLabel(this.scene, x + 12, cardY + 10, kingdom.name, 'label', {
        fontSize: '13px',
        wordWrap: { width: width - 24 },
      }));

      // King name
      const kingLine = kingdom.king ? t('campaign.affairs.king', { name: kingdom.king.name }) : '';
      items.push(createLabel(this.scene, x + 12, cardY + 30, kingLine, 'caption', { fontSize: '11px' }));

      // Relations bar
      const barW = width - 24;
      const barH = 8;
      const barX = x + 12;
      const barY = cardY + 52;
      const barFill = this.scene.add.graphics();
      barFill.fillStyle(INK_UI.brush, 0.22);
      barFill.fillRoundedRect(barX, barY, barW, barH, 4);
      barFill.fillStyle(relColor, 0.88);
      barFill.fillRoundedRect(barX, barY, barW * (relations / 100), barH, 4);
      items.push(barFill);

      items.push(createLabel(this.scene, barX, barY + 12, relLabel, 'caption', {
        fontSize: '10px',
        color: `#${relColor.toString(16).padStart(6, '0')}`,
      }));

      if (hostile) {
        items.push(createLabel(this.scene, x + width - 12, barY + 12, '⚠ invasion imminent', 'caption', {
          fontSize: '10px',
          color: '#c0392b',
          align: 'right',
        }).setOrigin(1, 0));
      }

      // Action buttons (2x2 grid)
      const btnW = Math.floor((width - 32) / 2);
      const btnH = 28;
      const btnRow1Y = cardY + 82;
      const btnRow2Y = cardY + 116;
      const btnGap = 8;

      const canGift = this.state.resources.gold >= 30;
      const canTrade = this.state.court.influence >= 10;
      const canPact = this.state.court.influence >= 20;

      const makeBtn = (
        bx: number,
        by: number,
        label: string,
        enabled: boolean,
        onClick: () => void,
      ): Phaser.GameObjects.Container => createWoodButton(
        this.scene,
        bx + btnW / 2,
        by + btnH / 2,
        btnW,
        btnH,
        label,
        enabled ? onClick : () => { /* disabled */ },
        { variant: enabled ? 'wood' : 'dark', fontSize: '10px' },
      );

      const btnX1 = x + 12;
      const btnX2 = x + 12 + btnW + btnGap;

      items.push(makeBtn(btnX1, btnRow1Y, t('campaign.affairs.gift'), canGift, () => {
        sendGift(this.state, kingdom.id);
        this.onAction();
      }));
      items.push(makeBtn(btnX2, btnRow1Y, t('campaign.affairs.trade'), canTrade, () => {
        proposeTrade(this.state, kingdom.id);
        this.onAction();
      }));
      items.push(makeBtn(btnX1, btnRow2Y, t('campaign.affairs.pact'), canPact, () => {
        negotiatePact(this.state, kingdom.id);
        this.onAction();
      }));
      items.push(makeBtn(btnX2, btnRow2Y, t('campaign.affairs.tribute'), true, () => {
        demandTribute(this.state, kingdom.id);
        this.onAction();
      }));
    });

    return items;
  }
}
