import Phaser from 'phaser';
import type { GameState, Kingdom } from '../state/types';
import { GAME_WIDTH, PLAYER_KINGDOM_ID } from '../game/constants';
import { InkUI, INK_UI } from './InkUI';
import { createLabel } from './theme';
import { t } from '../i18n';

export function stanceLabel(relations: number): string {
  if (relations >= 65) return t('campaign.affairs.friendly');
  if (relations <= 35) return t('campaign.affairs.hostile');
  return t('campaign.affairs.neutral');
}

export function stanceColor(relations: number): number {
  if (relations >= 65) return INK_UI.jade;
  if (relations <= 35) return INK_UI.cinnabar;
  return INK_UI.gold;
}

/**
 * Glanceable list of off-map empires for the Ngoại giao panel. Each row shows the
 * empire's stance + opinion bar + threat/pact icons and is tappable to drill into
 * the per-empire detail (handled by UIScene).
 */
export class ForeignAffairsPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly onAction: () => void,
  ) {}

  /** Compact, tappable rows. `onSelect(kingdomId)` drills into the detail view. */
  renderList(
    contentBounds: { x: number; y: number; width: number; height: number },
    onSelect: (kingdomId: string) => void,
  ): Phaser.GameObjects.GameObject[] {
    const ui = new InkUI(this.scene);
    const items: Phaser.GameObjects.GameObject[] = [];
    const { x, width } = contentBounds;

    const rivals = this.state.kingdoms.filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
    if (rivals.length === 0) {
      items.push(createLabel(this.scene, GAME_WIDTH / 2, contentBounds.y + 60, t('campaign.affairs.none'), 'label', {
        fontSize: '14px', align: 'center', wordWrap: { width: width - 16 },
      }).setOrigin(0.5));
      return items;
    }

    const cardH = 86;
    const gap = 10;

    rivals.forEach((kingdom, i) => {
      const cardY = contentBounds.y + i * (cardH + gap);
      const relations = kingdom.relations ?? 50;
      const color = stanceColor(relations);
      const invading = this.isThreatening(kingdom);
      const hasPact = (kingdom.opinionModifiers ?? []).some((m) => m.source === 'treaty');

      items.push(ui.card({ x, y: cardY, width, height: cardH }, {
        border: invading ? INK_UI.cinnabar : INK_UI.softBrush,
      }));

      // colour swatch
      const swatch = this.scene.add.graphics();
      swatch.fillStyle(kingdom.color, 0.95);
      swatch.fillRoundedRect(x + 8, cardY + 10, 8, cardH - 20, 3);
      items.push(swatch);

      items.push(createLabel(this.scene, x + 24, cardY + 10, kingdom.name, 'label', {
        fontSize: '13px', wordWrap: { width: width - 120 },
      }));
      items.push(createLabel(this.scene, x + 24, cardY + 30, kingdom.king ? t('campaign.affairs.king', { name: kingdom.king.name }) : '', 'caption', {
        fontSize: '10px',
      }));

      // opinion bar
      const barX = x + 24;
      const barY = cardY + 52;
      const barW = width - 48;
      const bar = this.scene.add.graphics();
      bar.fillStyle(INK_UI.brush, 0.24);
      bar.fillRoundedRect(barX, barY, barW, 8, 4);
      bar.fillStyle(color, 0.9);
      bar.fillRoundedRect(barX, barY, barW * Phaser.Math.Clamp(relations / 100, 0, 1), 8, 4);
      items.push(bar);

      items.push(createLabel(this.scene, barX, barY + 12, `${stanceLabel(relations)} · ${Math.round(relations)}`, 'caption', {
        fontSize: '10px',
        color: `#${color.toString(16).padStart(6, '0')}`,
      }));

      // right-side status icon + drill hint
      const statusText = invading ? t('campaign.affairs.threat') : hasPact ? t('campaign.affairs.pactActive') : '';
      if (statusText) {
        items.push(createLabel(this.scene, x + width - 12, cardY + 10, statusText, 'caption', {
          fontSize: '10px', align: 'right',
          color: invading ? '#c0392b' : '#7fae6a',
        }).setOrigin(1, 0));
      }
      items.push(createLabel(this.scene, x + width - 12, barY + 12, t('campaign.affairs.details'), 'caption', {
        fontSize: '10px', align: 'right', color: '#caa85e',
      }).setOrigin(1, 0));

      const hit = this.scene.add.rectangle(x + width / 2, cardY + cardH / 2, width, cardH, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        onSelect(kingdom.id);
      });
      items.push(hit);
    });

    return items;
  }

  private isThreatening(kingdom: Kingdom): boolean {
    if ((kingdom.hostilityTimer ?? 0) > 0) return true;
    return (this.state.invasions ?? []).some((r) => r.kingdomId === kingdom.id)
      || this.state.armies.some((a) => a.kingdomId === kingdom.id);
  }

  /** Kept for callers that just need the action callback hook. */
  notify(): void {
    this.onAction();
  }
}
