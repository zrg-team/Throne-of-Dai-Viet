import Phaser from 'phaser';
import type { GameState, Land } from '../state/types';
import { SHEET_BOTTOM, SHEET_TOP } from './BottomSheet';
import { createLabel, createPanel, createWoodButton } from './theme';

export class LandPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly emitAction: (action: string, landId: string) => void,
  ) {}

  render(land: Land): Phaser.GameObjects.GameObject[] {
    const owner = this.state.kingdoms.find((kingdom) => kingdom.id === land.ownerId)?.name ?? 'Neutral';
    const card = createPanel(this.scene, 14, SHEET_TOP + 14, 362, 168, { fillAlpha: 0.98 });
    const items: Phaser.GameObjects.GameObject[] = [
      card,
      createLabel(this.scene, 26, SHEET_TOP + 18, land.name, 'label', { fontSize: '18px' }),
      createLabel(
        this.scene,
        26,
        SHEET_TOP + 48,
        `Owner: ${owner}\nType: ${land.type}\nBonus: +${land.bonus.amount} ${land.bonus.resource}\nDefense: ${land.defense}  Loyalty: ${land.loyalty}%\n${land.special}`,
        'body',
        { lineSpacing: 5, wordWrap: { width: 340 } },
      ),
    ];

    const actions = this.getActions(land);
    actions.forEach((action, index) => {
      items.push(
        createWoodButton(
          this.scene,
          16 + index * 118 + 53,
          SHEET_BOTTOM - 48 + 18,
          106,
          36,
          action.label,
          () => this.emitAction(action.id, land.id),
          { fontSize: '13px' },
        ),
      );
    });

    return items;
  }

  private getActions(land: Land): Array<{ id: string; label: string }> {
    if (land.ownerId === 'neutral') {
      return [
        { id: 'acquire', label: 'Acquire' },
        { id: 'move', label: 'Move Army' },
      ];
    }

    if (land.ownerId === 'dai-viet') {
      return [
        { id: 'upgrade', label: 'Upgrade' },
        { id: 'move', label: 'Move Army' },
      ];
    }

    return [
      { id: 'preview', label: 'Battle' },
      { id: 'move', label: 'Move Army' },
    ];
  }
}
