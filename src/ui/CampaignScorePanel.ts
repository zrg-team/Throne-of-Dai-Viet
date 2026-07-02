import Phaser from 'phaser';
import type { GameState } from '../state/types';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { InkUI, INK_UI } from './InkUI';
import { createLabel, createWoodButton } from './theme';
import { bankLegacy, computeRunScore, getLegacy, rankForScore } from '../state/legacy';
import { t } from '../i18n';

const PANEL_W = GAME_WIDTH - 48;
const PANEL_X = 24;
const PANEL_Y = 90;
const PANEL_H = GAME_HEIGHT - 180;

export class CampaignScorePanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly onReturn: () => void,
  ) {}

  render(): Phaser.GameObjects.GameObject[] {
    const ui = new InkUI(this.scene);
    const items: Phaser.GameObjects.GameObject[] = [];

    const dim = this.scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0604, 0.72).setOrigin(0, 0);
    items.push(dim);

    items.push(ui.panel(
      { x: PANEL_X, y: PANEL_Y, width: PANEL_W, height: PANEL_H },
      { fill: INK_UI.parchmentDark, fillShade: INK_UI.parchment, fillAlpha: 0.97, radius: 12, border: INK_UI.cinnabar, borderWidth: 3 },
    ));

    const title = createLabel(this.scene, GAME_WIDTH / 2, PANEL_Y + 36, t('campaign.score.title'), 'title', {
      fontSize: '20px',
      align: 'center',
      wordWrap: { width: PANEL_W - 32 },
    }).setOrigin(0.5);
    items.push(title);

    const divider = this.scene.add.graphics();
    divider.lineStyle(1.5, INK_UI.cinnabar, 0.6);
    divider.lineBetween(PANEL_X + 24, PANEL_Y + 58, PANEL_X + PANEL_W - 24, PANEL_Y + 58);
    items.push(divider);

    const reason = this.state.defeatReason === 'collapse'
      ? t('msg.defeatCollapse')
      : t('msg.defeatConquest');
    items.push(ui.card(
      { x: PANEL_X + 16, y: PANEL_Y + 70, width: PANEL_W - 32, height: 72 },
      { body: reason, border: INK_UI.cinnabar },
    ));

    const score = this.state.campaignScore;
    if (score) {
      const scoreLines = [
        t('campaign.score.turnsAlive', { value: String(score.turnsAlive) }),
        t('campaign.score.armiesDefeated', { value: String(score.armiesDefeated) }),
        t('campaign.score.largestArmy', { value: String(score.largestArmyDefeated) }),
        t('campaign.score.peakTerritory', { value: String(score.peakLandsHeld) }),
      ];

      const rowY = PANEL_Y + 160;
      const rowH = 54;
      scoreLines.forEach((line, i) => {
        const y = rowY + i * rowH;
        const g = this.scene.add.graphics();
        g.fillStyle(INK_UI.parchment, i % 2 === 0 ? 0.22 : 0.1);
        g.fillRoundedRect(PANEL_X + 16, y, PANEL_W - 32, rowH - 4, 6);
        items.push(g);
        items.push(createLabel(this.scene, PANEL_X + 28, y + 16, line, 'label', { fontSize: '14px' }));
      });

      // Empire mode: bank Legacy once and show the earned points + lifetime rank.
      if (this.state.gameMode === 'empire') {
        let earned = 0;
        if (!this.state.legacyBanked) {
          this.state.legacyBanked = true;
          earned = bankLegacy(this.state, false);
        } else {
          earned = Math.round(computeRunScore(this.state) / 10);
        }
        const legacy = getLegacy();
        const y = rowY + scoreLines.length * rowH + 6;
        const g = this.scene.add.graphics();
        g.fillStyle(INK_UI.gold, 0.16);
        g.fillRoundedRect(PANEL_X + 16, y, PANEL_W - 32, 56, 6);
        g.lineStyle(1, INK_UI.gold, 0.5);
        g.strokeRoundedRect(PANEL_X + 16, y, PANEL_W - 32, 56, 6);
        items.push(g);
        items.push(createLabel(this.scene, PANEL_X + 28, y + 8, t('empire.legacy.earned', { points: earned }), 'label', { fontSize: '14px', color: '#f3dd9a' }));
        items.push(createLabel(this.scene, PANEL_X + 28, y + 30, t('empire.legacy.rank', { rank: rankForScore(legacy.bestScore), total: legacy.points }), 'caption', { fontSize: '11px', color: '#e8d89a' }));
      }
    }

    items.push(createWoodButton(
      this.scene,
      GAME_WIDTH / 2,
      PANEL_Y + PANEL_H - 40,
      PANEL_W - 64,
      44,
      t('campaign.score.returnToMenu'),
      this.onReturn,
      { variant: 'highlight' },
    ));

    return items;
  }
}
