import Phaser from 'phaser';
import type { GameState, Land } from '../state/types';
import { getAcquisitionOrder } from '../systems/LandSystem';
import { getBuildOptions, getBuildOrder } from '../systems/ResourceSystem';
import { SHEET_BOTTOM, SHEET_TOP } from './BottomSheet';
import { createLabel, createPanel, createWoodButton } from './theme';

export class LandPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly emitAction: (action: string, landId: string) => void,
  ) {}

  private CARD_HEIGHT = 230;
  private CARD_WIDTH = 362;

  render(land: Land): Phaser.GameObjects.GameObject[] {
    const owner = this.state.kingdoms.find((kingdom) => kingdom.id === land.ownerId)?.name ?? 'Neutral';
    const outputs = formatOutputs(land);
    const terrain = formatTerrain(land);
    const buildings = land.buildings.length > 0 ? land.buildings.join(', ') : 'none';
    const acquisition = getAcquisitionOrder(this.state, land.id);
    const buildOrder = getBuildOrder(this.state, land.id);
    const blockedBuilds = land.ownerId === 'dai-viet'
      ? getBuildOptions(this.state, land)
        .filter((option) => !option.canBuild)
        .map((option) => `${option.label.replace('Build ', '')}: ${option.reason}`)
        .slice(0, 2)
        .join('\n')
      : '';
    const statusLine = acquisition
      ? `Acquiring: ${acquisition.progress}/${acquisition.required}`
      : buildOrder
        ? `Building ${buildOrder.building}: ${buildOrder.progress}/${buildOrder.required}`
        : blockedBuilds || land.special;
    const card = createPanel(this.scene, 14, SHEET_TOP + 10, this.CARD_WIDTH, this.CARD_HEIGHT, { fillAlpha: 0.98 });
    const items: Phaser.GameObjects.GameObject[] = [
      card,
      createLabel(this.scene, 26, SHEET_TOP + 15, land.name, 'label', { fontSize: '17px' }),
      createLabel(
        this.scene,
        26,
        SHEET_TOP + 42,
        `Owner: ${owner}\nSize: ${land.buildings.length}/${land.buildingCapacity} capacity  Defense: ${land.defense}\nTerrain: ${terrain}\nOutput: ${outputs}\nBuildings: ${buildings}\n${statusLine}`,
        'body',
        { fontSize: '12px', lineSpacing: 4, wordWrap: { width: 340 } },
      ),
    ];

    const actions = this.getActions(land);
    actions.forEach((action, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      items.push(
        createWoodButton(
          this.scene,
          24 + col * 118 + 53,
          SHEET_BOTTOM - 34 + row * 34,
          106,
          30,
          action.label,
          () => this.emitAction(action.id, land.id),
          { fontSize: '12px' },
        ),
      );
    });

    return items;
  }

  private getActions(land: Land): Array<{ id: string; label: string }> {
    if (land.ownerId === 'neutral') {
      if (getAcquisitionOrder(this.state, land.id)) {
        return [
          { id: 'preview', label: 'Conquer' },
        ];
      }

      return [
        { id: 'acquire', label: 'Buy Land' },
        { id: 'preview', label: 'Conquer' },
      ];
    }

    if (land.ownerId === 'dai-viet') {
      return [
        { id: 'open-build', label: 'Build' },
        { id: 'move', label: 'Move Army' },
      ];
    }

    return [
      { id: 'preview', label: 'Battle' },
      { id: 'move', label: 'Move Army' },
    ];
  }
}

function formatOutputs(land: Land): string {
  const parts = Object.entries(land.outputs)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `+${value} ${key}`);
  return parts.length > 0 ? parts.join(', ') : 'none yet';
}

function formatTerrain(land: Land): string {
  const grass = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
  const ore = land.terrainSummary.mountains + land.terrainSummary.hills;
  const water = land.terrainSummary.water;
  const city = land.terrainSummary.fortress + land.terrainSummary.shrine;
  return `grass ${grass}, ore ${ore}, water ${water}, city ${city}`;
}
