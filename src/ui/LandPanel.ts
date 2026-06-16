import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PLAYER_KINGDOM_ID } from '../game/constants';
import type { GameState, Land } from '../state/types';
import { getAssignedDiplomaticHero, getBribeSuccessChance, getDiplomacyThreshold, getLandTrust, getNoblePower } from '../systems/AcquisitionSystem';
import { getAcquisitionOrder, getSiegeOrder, isAdjacent } from '../systems/LandSystem';
import { getBuildOrder } from '../systems/ResourceSystem';
import { getRecruitmentOrder } from '../systems/WarSystem';
import { ACTION_BAR_HEIGHT } from './BottomSheet';
import { InkUI, INK_UI } from './InkUI';

const CARD_H = 92;
const CARD_W = GAME_WIDTH - 16;
const CARD_X = 8;
export const COMPACT_CARD_Y = GAME_HEIGHT - ACTION_BAR_HEIGHT - CARD_H - 8;
type LandAction = { id: string; label: string; variant?: 'primary' | 'secondary' | 'danger' | 'disabled' };

export class LandPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly emitAction: (action: string, landId: string) => void,
  ) {}

  /** Renders a compact ~90px card above the action bar. */
  render(land: Land): Phaser.GameObjects.GameObject[] {
    const ui = new InkUI(this.scene);
    const y = COMPACT_CARD_Y;

    const ownerLabel = land.ownerId === PLAYER_KINGDOM_ID ? 'Yours'
      : land.ownerId === 'neutral' ? 'Neutral'
      : 'Rival';
    const borderColor = land.ownerId === PLAYER_KINGDOM_ID ? INK_UI.gold
      : land.ownerId === 'neutral' ? INK_UI.softBrush
      : INK_UI.cinnabar;

    const acquisition = getAcquisitionOrder(this.state, land.id);
    const siege = getSiegeOrder(this.state, land.id);

    const statLine = buildStatLine(land, acquisition, siege);
    const subLine = buildSubLine(land);

    const bg = ui.panel(
      { x: CARD_X, y, width: CARD_W, height: CARD_H },
      { fill: INK_UI.parchmentDark, fillShade: INK_UI.parchment, fillAlpha: 0.97, radius: 10, border: borderColor },
    );

    const nameText = this.scene.add.text(CARD_X + 12, y + 10, land.name, {
      color: INK_UI.inkText,
      fontSize: '14px',
      fontStyle: 'bold',
    }).setDepth(101);

    const statusChip = this.scene.add.text(CARD_X + CARD_W - 10, y + 10, ownerLabel, {
      color: '#fff6bd',
      fontSize: '10px',
      fontStyle: '700',
      backgroundColor: `#${borderColor.toString(16).padStart(6, '0')}`,
      padding: { x: 6, y: 3 },
    }).setOrigin(1, 0).setDepth(101);

    const stat1 = this.scene.add.text(CARD_X + 12, y + 34, statLine, {
      color: INK_UI.inkText,
      fontSize: '12px',
    }).setDepth(101);

    const stat2 = this.scene.add.text(CARD_X + 12, y + 54, subLine, {
      color: INK_UI.mutedText,
      fontSize: '11px',
    }).setDepth(101);

    const detailsBtn = ui.button(
      { x: CARD_X + CARD_W - 82, y: y + CARD_H - 28, width: 74, height: 22 },
      'Details ›',
      () => this.emitAction('open-land-detail', land.id),
      { variant: 'secondary', fontSize: '11px' },
    );

    return [bg, nameText, statusChip, stat1, stat2, detailsBtn];
  }

  /** Returns the full info and action buttons for the detail modal. */
  renderDetailContent(land: Land): {
    infoLines: string[];
    actions: LandAction[];
  } {
    const acquisition = getAcquisitionOrder(this.state, land.id);
    const siege = getSiegeOrder(this.state, land.id);
    const buildOrder = getBuildOrder(this.state, land.id);
    const recruitment = getRecruitmentOrder(this.state, land.id);

    const owner = this.state.kingdoms.find((k) => k.id === land.ownerId)?.name ?? 'Neutral';
    const outputs = formatOutputs(land);
    const terrain = formatTerrain(land);
    const buildings = land.buildings.length > 0
      ? land.buildings.map((b) => `${b.type}${b.level > 1 ? ` Lv${b.level}` : ''}`).join(', ')
      : 'none';

    const infoLines: string[] = [
      `Owner: ${owner}   Type: ${land.type}`,
      `Defense: ${land.defense}   Size: ${land.buildings.length}/${land.buildingCapacity}`,
      `Terrain: ${terrain}`,
      `Output: ${outputs}`,
      `Buildings: ${buildings}`,
    ];

    if (land.ownerId === 'neutral') {
      if (land.hasVillage) {
        const trust = Math.floor(getLandTrust(land, PLAYER_KINGDOM_ID));
        const threshold = Math.ceil(getDiplomacyThreshold(land));
        const power = getNoblePower(land);
        infoLines.push(`Population: ${land.population}   Soldiers: ${land.localSoldiers}`);
        infoLines.push(`Noble Power: ${power}   Trust: ${trust}/${threshold}`);
      } else {
        infoLines.push('Wilderness — uninhabited, no garrison.');
      }
    }

    if (siege) {
      infoLines.push(`⚔ Under siege: ${siege.progress}/${siege.required} ticks`);
    } else if (acquisition) {
      infoLines.push(formatAcquisitionStatus(this.state, acquisition, land));
    } else if (buildOrder) {
      infoLines.push(`🔨 ${buildOrder.kind === 'upgrade' ? 'Upgrading' : 'Building'} ${buildOrder.building}: ${buildOrder.progress}/${buildOrder.required}`);
    } else if (recruitment) {
      infoLines.push(`⚙ Recruiting: ${recruitment.progress}/${recruitment.required}`);
    }

    const actions = this.getActions(land, acquisition);
    return { infoLines, actions };
  }

  getActions(land: Land, acquisition = getAcquisitionOrder(this.state, land.id)): LandAction[] {
    if (getSiegeOrder(this.state, land.id)) return [];

    const selectedArmy = this.state.selectedArmyId
      ? this.state.armies.find((a) => a.id === this.state.selectedArmyId)
      : undefined;

    const armyAdjacentToLand = Boolean(
      selectedArmy && isAdjacent(this.state, selectedArmy.landId, land.id),
    );
    const armyInAdjacentOwnedLand = Boolean(
      selectedArmy &&
      this.state.lands.find((l) => l.id === selectedArmy.landId)?.ownerId === PLAYER_KINGDOM_ID &&
      this.state.lands.find((l) => l.id === selectedArmy.landId)?.neighbors.includes(land.id),
    );

    if (land.ownerId === 'neutral') {
      if (acquisition) {
        return armyAdjacentToLand && land.hasVillage ? [{ id: 'preview', label: 'Conquer', variant: 'danger' }] : [];
      }

      if (!land.hasVillage) {
        const acts: LandAction[] = [
          { id: 'settle', label: 'Settle', variant: 'primary' },
        ];
        if (armyAdjacentToLand) acts.push({ id: 'preview', label: 'March In', variant: 'secondary' });
        return acts;
      }

      const bribeChance = Math.round(getBribeSuccessChance(land) * 100);
      const acts: LandAction[] = [];

      if (armyInAdjacentOwnedLand) {
        acts.push({ id: 'intimidate', label: 'Intimidate', variant: 'primary' });
        acts.push({ id: 'bribe', label: `Bribe (${bribeChance}%)`, variant: 'secondary' });
        if (armyAdjacentToLand) acts.push({ id: 'preview', label: 'Conquer', variant: 'danger' });
      } else if (armyAdjacentToLand) {
        acts.push({ id: 'bribe', label: `Bribe (${bribeChance}%)`, variant: 'secondary' });
        acts.push({ id: 'preview', label: 'Conquer', variant: 'danger' });
      } else {
        const freeHero = this.state.heroes.find((h) => !h.assignedTo);
        const trust = Math.floor(getLandTrust(land, PLAYER_KINGDOM_ID));
        const threshold = Math.ceil(getDiplomacyThreshold(land));
        acts.push({ id: 'bribe', label: `Bribe (${bribeChance}%)`, variant: 'secondary' });
        acts.push(freeHero
          ? { id: 'diplomatize', label: `Assign Hero (${trust}/${threshold})`, variant: 'primary' }
          : { id: 'diplomatize', label: 'Need Hero', variant: 'disabled' });
      }
      return acts;
    }

    if (land.ownerId === PLAYER_KINGDOM_ID) {
      return [{ id: 'open-build', label: 'Build', variant: 'primary' }];
    }

    return armyAdjacentToLand ? [{ id: 'preview', label: 'Battle', variant: 'danger' }] : [];
  }
}

function buildStatLine(
  land: Land,
  acquisition: ReturnType<typeof getAcquisitionOrder>,
  siege: ReturnType<typeof getSiegeOrder>,
): string {
  if (siege) return `⚔ Siege: ${siege.progress}/${siege.required}`;
  if (acquisition) {
    switch (acquisition.method) {
      case 'bribe': return `✓ Bribe accepted — joining soon`;
      case 'diplomacy': return `📜 Diplomat: trust building...`;
      case 'intimidation': return `⚔ Pressure: ${Math.floor(acquisition.progress)}/100`;
      case 'settle': return `🏕 Settlers: ${acquisition.progress}/${acquisition.required}`;
      case 'occupy': return `Moving in...`;
      default: return `Acquiring: ${acquisition.progress}/${acquisition.required}`;
    }
  }
  if (land.ownerId === 'neutral') {
    return land.hasVillage
      ? `Def ${land.defense} · Pop ${land.population} · Power ${getNoblePower(land)}`
      : `Def ${land.defense} · Wilderness · No garrison`;
  }
  return `Def ${land.defense} · Size ${land.buildings.length}/${land.buildingCapacity}`;
}

function buildSubLine(land: Land): string {
  if (land.ownerId === 'neutral' && land.hasVillage) {
    const trust = Math.floor(getLandTrust(land, PLAYER_KINGDOM_ID));
    return `Trust ${trust}/100 · Soldiers ${land.localSoldiers}`;
  }
  const outputs = formatOutputs(land);
  return outputs ? `Output: ${outputs}` : land.special.slice(0, 52);
}

function formatAcquisitionStatus(
  state: GameState,
  order: ReturnType<typeof getAcquisitionOrder>,
  land: Land,
): string {
  if (!order) return '';
  switch (order.method) {
    case 'bribe': return `✓ Bribe: joining next season`;
    case 'diplomacy': {
      const trust = Math.floor(getLandTrust(land, PLAYER_KINGDOM_ID));
      const hero = getAssignedDiplomaticHero(state, order);
      return hero
        ? `📜 ${hero.name}: trust ${trust}/${order.required}`
        : `📜 Missing hero: trust ${trust}/${order.required}`;
    }
    case 'intimidation': return `⚔ Army pressure: ${Math.floor(order.progress)}/100`;
    case 'settle': return `🏕 Settlers en route: ${order.progress}/${order.required}`;
    case 'occupy': return `Moving in...`;
    default: return `Acquiring: ${order.progress}/${order.required}`;
  }
}

function formatOutputs(land: Land): string {
  const parts = Object.entries(land.outputs)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `+${v} ${k}`);
  return parts.length === 0 ? 'none yet' : parts.slice(0, 3).join(', ');
}

function formatTerrain(land: Land): string {
  const grass = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
  const ore = land.terrainSummary.mountains + land.terrainSummary.hills;
  return `grass ${grass}, ore ${ore}, water ${land.terrainSummary.water}, city ${land.terrainSummary.fortress + land.terrainSummary.shrine}`;
}
