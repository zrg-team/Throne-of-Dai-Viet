import Phaser from 'phaser';
import { PLAYER_KINGDOM_ID } from '../game/constants';
import type { GameState, Land } from '../state/types';
import { getAcquisitionOrder, getSiegeOrder, isAdjacent } from '../systems/LandSystem';
import { getBuildOptions, getBuildOrder } from '../systems/ResourceSystem';
import { getRecruitmentOrder } from '../systems/WarSystem';
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
    const buildings = land.buildings.length > 0
      ? land.buildings.map((building) => `${building.type}${building.level > 1 ? ` Lv${building.level}` : ''}`).join(', ')
      : 'none';
    const acquisition = getAcquisitionOrder(this.state, land.id);
    const siege = getSiegeOrder(this.state, land.id);
    const buildOrder = getBuildOrder(this.state, land.id);
    const recruitment = getRecruitmentOrder(this.state, land.id);
    const blockedBuilds = land.ownerId === 'dai-viet'
      ? getBuildOptions(this.state, land)
        .filter((option) => !option.canBuild)
        .map((option) => `${option.label.replace('Build ', '')}: ${option.reason}`)
        .slice(0, 2)
        .join('\n')
      : '';
    const statusLine = siege
      ? `Under siege: ${siege.progress}/${siege.required}`
      : acquisition
        ? `Acquiring: ${acquisition.progress}/${acquisition.required}`
        : buildOrder
          ? `${buildOrder.kind === 'upgrade' ? 'Upgrading' : 'Building'} ${buildOrder.building}: ${buildOrder.progress}/${buildOrder.required}`
          : recruitment
            ? `Recruiting: ${recruitment.progress}/${recruitment.required}`
            : blockedBuilds || land.special;
    const garrisonLine = this.getGarrisonLine(land);
    const card = createPanel(this.scene, 14, SHEET_TOP + 10, this.CARD_WIDTH, this.CARD_HEIGHT, { fillAlpha: 0.98 });
    const items: Phaser.GameObjects.GameObject[] = [
      card,
      createLabel(this.scene, 26, SHEET_TOP + 15, land.name, 'label', { fontSize: '17px' }),
      createLabel(
        this.scene,
        26,
        SHEET_TOP + 42,
        `Owner: ${owner}\nSize: ${land.buildings.length}/${land.buildingCapacity} capacity  Defense: ${land.defense}\nTerrain: ${terrain}\nOutput: ${outputs}\nBuildings: ${buildings}${garrisonLine}\n${statusLine}`,
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

  private getGarrisonLine(land: Land): string {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      return '';
    }

    const garrison = this.state.armies.find(
      (army) => army.kingdomId === land.ownerId && army.landId === land.id,
    );

    if (!garrison) {
      return '\nGarrison: none - station an army here to add to its defense.';
    }

    const total = garrison.units.spearmen + garrison.units.archers + garrison.units.heavyInfantry;
    return `\nGarrison: ${total} troops (${garrison.name})\nMorale: ${garrison.morale}%  Rations: ${garrison.rations}  Provisions: ${garrison.provisions}`;
  }

  private getActions(land: Land): Array<{ id: string; label: string }> {
    if (getSiegeOrder(this.state, land.id)) {
      return [];
    }

    const canAttack = Boolean(
      this.state.selectedArmyId &&
        this.state.armies.some(
          (army) => army.id === this.state.selectedArmyId && isAdjacent(this.state, army.landId, land.id),
        ),
    );

    if (land.ownerId === 'neutral') {
      if (getAcquisitionOrder(this.state, land.id)) {
        return canAttack ? [{ id: 'preview', label: 'Conquer' }] : [];
      }

      return canAttack
        ? [
          { id: 'acquire', label: 'Buy Land' },
          { id: 'preview', label: 'Conquer' },
        ]
        : [{ id: 'acquire', label: 'Buy Land' }];
    }

    if (land.ownerId === 'dai-viet') {
      return [{ id: 'open-build', label: 'Build' }];
    }

    return canAttack ? [{ id: 'preview', label: 'Battle' }] : [];
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
