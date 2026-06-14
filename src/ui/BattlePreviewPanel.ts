import Phaser from 'phaser';
import type { BattlePreview, GameState } from '../state/types';
import { SHEET_BOTTOM, SHEET_TOP } from './BottomSheet';
import { createLabel, createPanel, createWoodButton } from './theme';

export class BattlePreviewPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly onAttack: (armyId: string, landId: string) => void,
  ) {}

  render(preview: BattlePreview): Phaser.GameObjects.GameObject[] {
    const land = this.state.lands.find((candidate) => candidate.id === preview.targetLandId);
    const army = this.state.armies.find((candidate) => candidate.id === preview.attackerArmyId);

    const items: Phaser.GameObjects.GameObject[] = [
      createPanel(this.scene, 24, SHEET_TOP + 22, 342, 174, { borderWidth: 4 }),
      createLabel(this.scene, 44, SHEET_TOP + 40, 'Battle Preview', 'label', { fontSize: '19px' }),
      createLabel(
        this.scene,
        44,
        SHEET_TOP + 78,
        `${army?.name ?? 'Army'} attacks ${land?.name ?? 'target'}\nYour power: ${preview.attackerPower}\nEnemy power: ${preview.defenderPower}\nEstimated win chance: ${preview.winChance}%`,
        'body',
        { fontSize: '14px', lineSpacing: 6 },
      ),
    ];

    items.push(
      createWoodButton(
        this.scene,
        16 + 75,
        SHEET_BOTTOM - 56 + 20,
        150,
        40,
        'Attack',
        () => this.onAttack(preview.attackerArmyId, preview.targetLandId),
        { variant: 'highlight', fontSize: '14px' },
      ),
    );

    return items;
  }
}
