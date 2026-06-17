import Phaser from 'phaser';
import type { BattlePreview, GameState } from '../state/types';
import { SHEET_BOTTOM, SHEET_TOP } from './BottomSheet';
import { InkUI, INK_UI } from './InkUI';
import { t } from '../i18n';

export class BattlePreviewPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly onAttack: (armyId: string, landId: string) => void,
  ) {}

  render(preview: BattlePreview): Phaser.GameObjects.GameObject[] {
    const ui = new InkUI(this.scene);
    const land = this.state.lands.find((candidate) => candidate.id === preview.targetLandId);
    const army = this.state.armies.find((candidate) => candidate.id === preview.attackerArmyId);

    const items: Phaser.GameObjects.GameObject[] = [
      ui.card({ x: 18, y: SHEET_TOP + 20, width: 354, height: 62 }, {
        title: t('battle.preview.title'),
        subtitle: t('battle.preview.subtitle', { army: army?.name ?? t('battle.preview.army'), land: land?.name ?? t('battle.preview.target') }),
        status: `${preview.winChance}%`,
        border: preview.winChance >= 55 ? INK_UI.gold : INK_UI.cinnabar,
      }),
      ui.card({ x: 18, y: SHEET_TOP + 92, width: 354, height: 88 }, {
        rows: [
          { label: t('battle.yourPower'), value: `${preview.attackerPower}` },
          { label: t('battle.enemyPower'), value: `${preview.defenderPower}` },
          { label: t('battle.estimate'), value: preview.winChance >= 55 ? t('battle.advantage') : t('battle.highRisk') },
        ],
      }),
    ];

    items.push(
      ui.button({ x: 120, y: SHEET_BOTTOM - 44, width: 150, height: 36 }, t('action.attack'), () => this.onAttack(preview.attackerArmyId, preview.targetLandId), {
        variant: 'primary',
        fontSize: '14px',
      }),
    );

    return items;
  }
}
