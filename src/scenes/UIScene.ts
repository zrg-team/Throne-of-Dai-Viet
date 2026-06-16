import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, PLAYER_KINGDOM_ID } from '../game/constants';
import {
  ACTION_BUTTON_GAP,
  ACTION_BUTTON_HEIGHT,
  ACTION_BUTTON_LABELS,
  ACTION_BUTTON_MARGIN,
  ACTION_BUTTON_WIDTH,
  ACTION_BUTTON_Y,
  ActionBar,
  actionButtonLeft,
} from '../ui/ActionBar';
import { BattlePreviewPanel } from '../ui/BattlePreviewPanel';
import { BottomSheet, SHEET_TOP } from '../ui/BottomSheet';
import { renderHeroFace } from '../ui/FaceRenderer';
import { COMPACT_CARD_Y, LandPanel } from '../ui/LandPanel';
import { ResourceBar } from '../ui/ResourceBar';
import { createLabel, createPanel, createWoodButton, PARCHMENT } from '../ui/theme';
import { InkScrollArea, InkUI, INK_UI, type UIBounds } from '../ui/InkUI';
import { makeSwipeableCard, popInModal, staggerIn } from '../ui/animations';
import { BUILDING_LABELS, getBuildOptions, getLaborStatus, getUpgradeOptions } from '../systems/ResourceSystem';
import {
  ALL_COURT_POSITIONS,
  COURT_POSITION_LABELS,
  assignHeroToLand,
  assignHeroToPosition,
  removeHeroFromPosition,
} from '../systems/CourtSystem';
import { ARMY_DEFAULT_PROVISIONS, ARMY_DEFAULT_RATIONS, ARMY_LOGISTICS_STEP } from '../game/gameplayConfig';
import type { CourtPositionId, GameState, Hero, Land, PoliticsCard } from '../state/types';

type CourtPicker =
  | { kind: 'position'; positionId: CourtPositionId }
  | { kind: 'land'; landId: string }
  | { kind: 'diplomacy'; landId: string };

type ModalScreen =
  | 'none'
  | 'heroes'
  | 'court'
  | 'army'
  | 'request'
  | 'build'
  | 'battle-result'
  | 'land-detail'
  | 'game-menu'
  | 'exit-menu';

export class UIScene extends Phaser.Scene {
  private state!: GameState;
  private resourceBar!: ResourceBar;
  private actionBar!: ActionBar;
  private bottomSheet!: BottomSheet;
  private ui!: InkUI;
  private messageText!: Phaser.GameObjects.Text;
  private modalLayer!: Phaser.GameObjects.Container;
  private mapControls: Phaser.GameObjects.GameObject[] = [];
  private gameMenuButton: Phaser.GameObjects.GameObject[] = [];
  private modalScreen: ModalScreen = 'none';
  private modalJustOpened = false;
  private modalBuildLandId?: string;
  private requestBadge: Phaser.GameObjects.GameObject[] = [];
  private selectedArmyLeaderId?: string;
  private armySoldiers = 400;
  private armyFood = ARMY_DEFAULT_RATIONS;
  private armySupplies = ARMY_DEFAULT_PROVISIONS;
  private courtTab: 'positions' | 'governors' = 'positions';
  private courtPicker?: CourtPicker;
  private lastCourtView?: string;
  private modalContentBounds: UIBounds = { x: 28, y: 102, width: 334, height: 636 };
  private modalFooterBounds: UIBounds = { x: 28, y: 748, width: 334, height: 48 };
  private activeScrollAreas: InkScrollArea[] = [];
  private compactCard: Phaser.GameObjects.GameObject[] = [];
  private readonly domPointerUp = (event: PointerEvent): void => {
    const point = this.toGamePoint(event);
    if (!point) {
      return;
    }

    this.handlePointerUp({ x: point.x, y: point.y } as Phaser.Input.Pointer);
  };
  private readonly domMouseUp = (event: MouseEvent): void => {
    const point = this.toGamePoint(event);
    if (!point) {
      return;
    }

    this.handlePointerUp({ x: point.x, y: point.y } as Phaser.Input.Pointer);
  };

  constructor() {
    super('UIScene');
  }

  init(data: { state: GameState }): void {
    this.state = data.state;
    this.modalScreen = 'none';
    this.modalJustOpened = false;
    this.modalBuildLandId = undefined;
    this.requestBadge = [];
    this.selectedArmyLeaderId = undefined;
    this.armySoldiers = 400;
    this.armyFood = ARMY_DEFAULT_RATIONS;
    this.armySupplies = ARMY_DEFAULT_PROVISIONS;
    this.courtTab = 'positions';
    this.courtPicker = undefined;
    this.lastCourtView = undefined;
    this.activeScrollAreas = [];
    this.compactCard = [];
    this.mapControls = [];
    this.gameMenuButton = [];
  }

  create(): void {
    this.input.setTopOnly(true);
    this.ui = new InkUI(this);
    this.resourceBar = new ResourceBar(this, this.state);
    this.actionBar = new ActionBar(this, this.state, (action) => this.handleAction(action));
    this.bottomSheet = new BottomSheet(this);
    this.modalLayer = this.add.container(0, 0).setDepth(500).setVisible(false);
    this.messageText = this.add.text(14, HEADER_HEIGHT + 6, '', {
      color: '#1e2a22',
      fontSize: '12px',
      wordWrap: { width: GAME_WIDTH - 28 },
    }).setDepth(110);

    this.events.on('state-changed', () => this.refresh());
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    this.game.canvas.addEventListener('pointerup', this.domPointerUp);
    this.game.canvas.addEventListener('mouseup', this.domMouseUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.refresh();
  }

  shutdown(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.game.canvas.removeEventListener('pointerup', this.domPointerUp);
    this.game.canvas.removeEventListener('mouseup', this.domMouseUp);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.modalScreen !== 'none') {
      this.handleModalTap(pointer.x, pointer.y);
      return;
    }

    if (pointer.x >= GAME_WIDTH - 64 && pointer.x <= GAME_WIDTH - 4 && pointer.y >= 0 && pointer.y <= HEADER_HEIGHT - 18) {
      this.openModal('game-menu');
      return;
    }

    if (this.state.pendingCourtRequest && pointer.x >= GAME_WIDTH - 108 && pointer.x <= GAME_WIDTH - 8 && pointer.y >= HEADER_HEIGHT && pointer.y <= HEADER_HEIGHT + 70) {
      this.openModal('request');
      return;
    }

    const buttonTop = ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2;
    const buttonBottom = ACTION_BUTTON_Y + ACTION_BUTTON_HEIGHT / 2;
    if (pointer.y < buttonTop || pointer.y > buttonBottom) {
      return;
    }

    const stride = ACTION_BUTTON_WIDTH + ACTION_BUTTON_GAP;
    const index = Math.floor((pointer.x - ACTION_BUTTON_MARGIN) / stride);
    const action = ACTION_BUTTON_LABELS[index]?.toLowerCase();
    const left = actionButtonLeft(index);
    if (action && pointer.x >= left && pointer.x <= left + ACTION_BUTTON_WIDTH) {
      this.handleAction(action);
    }
  }

  private toGamePoint(event: PointerEvent | MouseEvent): { x: number; y: number } | undefined {
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return undefined;
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * GAME_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * GAME_HEIGHT,
    };
  }

  private handleModalTap(x: number, y: number): void {
    if (x >= 321 && x <= 363 && y >= 27 && y <= 57) {
      this.closeModal();
      this.refresh();
      return;
    }

    if (this.modalScreen === 'heroes') {
      const front = this.state.activeHeroDraft?.[0];
      if (x >= 16 && x <= 120 && y >= 727 && y <= 769) {
        this.state.activeHeroDraft = undefined;
        this.state.message = 'The visiting heroes leave court.';
        this.closeModal();
        this.refresh();
        return;
      }
      if (front && x >= 207 && x <= 333 && y >= 727 && y <= 769) {
        this.events.emit('ui:hero-pick', front.id);
        this.closeModal();
        return;
      }
    }

    if (this.modalScreen === 'army') {
      const leaders = this.state.heroes.filter((hero) => !hero.assignedTo);
      const visibleLeaders = leaders.slice(0, 3);
      visibleLeaders.forEach((hero, index) => {
        const cardX = GAME_WIDTH / 2 + (index - (visibleLeaders.length - 1) / 2) * 114;
        if (x >= cardX - 47 && x <= cardX + 47 && y >= 122 && y <= 248) {
          this.selectedArmyLeaderId = hero.id;
          this.refresh();
        }
      });

      if (leaders.length === 0) {
        return;
      }

      if (x >= 60 && x <= 124 && y >= 365 && y <= 407) {
        this.armySoldiers = Math.max(100, this.armySoldiers - 100);
        this.refresh();
        return;
      }
      if (x >= 266 && x <= 330 && y >= 365 && y <= 407) {
        this.armySoldiers = Math.min(Math.max(100, this.state.resources.humans), this.armySoldiers + 100);
        this.refresh();
        return;
      }
      if (x >= 60 && x <= 124 && y >= 499 && y <= 541) {
        this.armyFood = Math.max(0, this.armyFood - ARMY_LOGISTICS_STEP);
        this.refresh();
        return;
      }
      if (x >= 266 && x <= 330 && y >= 499 && y <= 541) {
        this.armyFood = Math.min(this.state.resources.food, this.armyFood + ARMY_LOGISTICS_STEP);
        this.refresh();
        return;
      }
      if (x >= 60 && x <= 124 && y >= 589 && y <= 631) {
        this.armySupplies = Math.max(0, this.armySupplies - ARMY_LOGISTICS_STEP);
        this.refresh();
        return;
      }
      if (x >= 266 && x <= 330 && y >= 589 && y <= 631) {
        this.armySupplies = Math.min(this.state.resources.supplies, this.armySupplies + ARMY_LOGISTICS_STEP);
        this.refresh();
        return;
      }
      if (x >= 97 && x <= 293 && y >= 686 && y <= 734) {
        if (!this.selectedArmyLeaderId) {
          this.state.message = 'Choose a commander before creating an army.';
          this.refresh();
          return;
        }
        this.events.emit('ui:create-army', this.selectedArmyLeaderId, this.armySoldiers, this.armyFood, this.armySupplies);
        this.closeModal();
      }
      return;
    }

    if (this.modalScreen === 'request' && this.state.activePoliticsCard) {
      const [first, second] = this.state.activePoliticsCard.choices;
      if (x >= 61 && x <= 329 && y >= 429 && y <= 487) {
        this.events.emit('ui:politics-choice', first.id);
        this.closeModal();
        return;
      }
      if (x >= 61 && x <= 329 && y >= 515 && y <= 573) {
        this.events.emit('ui:politics-choice', second.id);
        this.closeModal();
      }
    }
  }

  private handleAction(action: string): void {
    if (action === 'heroes') {
      this.openModal('heroes');
      return;
    }

    if (action === 'court') {
      this.courtTab = 'positions';
      this.courtPicker = undefined;
      this.openModal('court');
      return;
    }

    if (action === 'army') {
      this.selectedArmyLeaderId = this.pickDefaultLeader()?.id;
      this.openModal('army');
      return;
    }

    if (action === 'build') {
      const selectedLand = this.getSelectedLand();
      const buildLand = selectedLand?.ownerId === PLAYER_KINGDOM_ID ? selectedLand : this.getDefaultBuildLand();
      if (!buildLand) {
        this.state.message = 'Select one of your districts, then press Build.';
        this.refresh();
        return;
      }
      this.openBuildModal(buildLand.id);
      return;
    }

    if (action === 'zoom-in') {
      this.events.emit('ui:zoom-map', 1);
      return;
    }

    if (action === 'zoom-out') {
      this.events.emit('ui:zoom-map', -1);
      return;
    }

    if (action === 'toggle-render-mode') {
      this.events.emit('ui:toggle-render-mode');
      this.refresh();
      return;
    }

    if (action === 'map') {
      this.closeModal();
      this.state.selectedLandId = undefined;
      this.state.latestBattlePreview = undefined;
      this.state.selectedArmyId = undefined;
      this.state.message = 'Map mode: drag the region, then tap a land or army order.';
      this.bottomSheet.hide();
      this.refresh();
    }
  }

  private openModal(screen: ModalScreen): void {
    this.modalScreen = screen;
    this.modalJustOpened = true;
    this.state.isPaused = true;
    this.bottomSheet.hide();

    if (screen === 'request' && this.state.pendingCourtRequest) {
      this.state.activePoliticsCard = this.state.pendingCourtRequest;
      this.state.pendingCourtRequest = undefined;
    }

    this.refresh();
  }

  private closeModal(): void {
    if (this.modalScreen === 'request' && this.state.activePoliticsCard) {
      this.state.message = 'The court requires an answer.';
      return;
    }
    this.modalScreen = 'none';
    this.state.activePoliticsCard = undefined;
    this.state.latestBattleResult = undefined;
    this.state.isPaused = false;
    window.__suppressMapInputUntil = performance.now() + 280;
    this.clearModalLayer();
    this.modalLayer.setVisible(false);
    this.modalBuildLandId = undefined;
  }

  private refresh(): void {
    this.resourceBar.refresh();
    this.actionBar.refresh();
    this.messageText.setText(this.state.message);
    this.clearRequestBadge();
    this.clearMapControls();
    this.clearGameMenuButton();
    this.clearCompactCard();

    if (this.state.victory) {
      this.showVictory();
      return;
    }

    if (this.modalScreen === 'none' && this.state.latestBattleResult) {
      this.openModal('battle-result');
      return;
    }

    if (this.modalScreen === 'none' && this.state.pendingCourtRequest) {
      this.openModal('request');
      return;
    }

    if (this.modalScreen !== 'none') {
      this.bottomSheet.hide();
      this.renderModal();
      return;
    }

    this.clearModalLayer();
    this.modalLayer.setVisible(false);
    this.renderGameMenuButton();
    this.renderMapControls();

    if (this.state.pendingCourtRequest) {
      this.renderCourtRequestBadge(this.state.pendingCourtRequest);
    }

    if (this.state.latestBattlePreview) {
      const panel = new BattlePreviewPanel(this, this.state, (armyId, landId) => {
        this.events.emit('ui:attack-land', armyId, landId);
      });
      this.bottomSheet.show(panel.render(this.state.latestBattlePreview));
      return;
    }

    const selectedLand = this.state.lands.find((land) => land.id === this.state.selectedLandId);
    if (selectedLand) {
      this.bottomSheet.hide();
      this.compactCard = this.makeLandPanel(selectedLand).render(selectedLand);
      return;
    }

    this.bottomSheet.hide();
  }

  private renderModal(): void {
    this.clearModalLayer();
    this.modalLayer.setVisible(true);

    if (this.modalScreen === 'heroes') {
      this.showHeroesScreen();
    } else if (this.modalScreen === 'court') {
      this.showCourtScreen();
    } else if (this.modalScreen === 'army') {
      this.showArmyScreen();
    } else if (this.modalScreen === 'request' && this.state.activePoliticsCard) {
      this.showPoliticsScreen(this.state.activePoliticsCard);
    } else if (this.modalScreen === 'build') {
      this.showBuildScreen();
    } else if (this.modalScreen === 'battle-result') {
      this.showBattleResultScreen();
    } else if (this.modalScreen === 'land-detail') {
      this.showLandDetailScreen();
    } else if (this.modalScreen === 'game-menu') {
      this.showGameMenuScreen();
    } else if (this.modalScreen === 'exit-menu') {
      this.showExitMenuScreen();
    }

    if (this.modalJustOpened) {
      this.modalJustOpened = false;
      popInModal(this, this.modalLayer, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    }
  }

  private addModalBase(title: string, subtitle: string): void {
    const modal = this.ui.modal({ title, subtitle, onClose: () => this.closeModal() });
    this.modalContentBounds = modal.contentBounds;
    this.modalFooterBounds = modal.footerBounds;
    this.modalLayer.add(modal.objects);
  }

  private clearModalLayer(): void {
    for (const scrollArea of this.activeScrollAreas) {
      scrollArea.destroy();
    }
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);
  }

  private showHeroesScreen(): void {
    this.addModalBase('Heroes', 'Recruit heroes for court, command, and provinces.');
    const content = this.modalContentBounds;

    if (!this.state.activeHeroDraft || this.state.activeHeroDraft.length === 0) {
      const favor = this.state.court.favor;
      const threshold = this.state.court.favorThreshold;
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y, 'No heroes are waiting at court.', 'label', {
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 290 },
      }).setOrigin(0.5));
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 32, `Next arrival: Favor ${Math.round(favor)}/${threshold}`, 'caption', {
        fontSize: '12px',
      }).setOrigin(0.5));
      const favorRatio = Phaser.Math.Clamp(favor / threshold, 0, 1);
      const favorBarBg = this.add.rectangle(GAME_WIDTH / 2 - 112, content.y + 61, 224, 12, INK_UI.brush, 0.28).setOrigin(0, 0.5);
      const favorBarFill = this.add.rectangle(GAME_WIDTH / 2 - 112, content.y + 61, 224 * favorRatio, 12, INK_UI.jade, 0.95).setOrigin(0, 0.5);
      this.modalLayer.add([favorBarBg, favorBarFill]);

      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 92, 'Current Roster', 'label', { fontSize: '14px' }).setOrigin(0.5));
      const listBounds = { x: content.x, y: content.y + 118, width: content.width, height: content.height - 118 };
      const scroll = this.ui.scrollArea(listBounds);
      scroll.addTo(this.modalLayer);
      this.activeScrollAreas.push(scroll);
      const rosterRows: Phaser.GameObjects.Container[] = [];
      this.state.heroes.slice(0, 7).forEach((hero, index) => {
        const y = index * 66;
        const row = this.ui.card({ x: 0, y, width: listBounds.width, height: 58 });
        row.add(renderHeroFace(this, hero, 30, 30, 0.34));
        row.add(createLabel(this, 62, 13, hero.name, 'label', { fontSize: '13px', wordWrap: { width: 238 } }));
        row.add(createLabel(this, 62, 34, `Assigned: ${hero.assignedTo ?? 'idle'}`, 'caption', {
          fontSize: '11px',
          wordWrap: { width: 238 },
        }));
        scroll.content.add(row);
        rosterRows.push(row);
      });
      scroll.setContentHeight(this.state.heroes.slice(0, 7).length * 66);
      if (this.modalJustOpened) {
        staggerIn(this, rosterRows);
      }
      return;
    }

    const [front, second, third] = this.state.activeHeroDraft;
    const draftCards: Phaser.GameObjects.Container[] = [];
    if (third) {
      const card = this.drawHeroCard(third, GAME_WIDTH / 2 + 18, 394, 0.94, 0.08, false);
      this.modalLayer.add(card);
      draftCards.push(card);
    }
    if (second) {
      const card = this.drawHeroCard(second, GAME_WIDTH / 2 - 16, 382, 0.97, -0.06, false);
      this.modalLayer.add(card);
      draftCards.push(card);
    }
    const frontCard = this.drawHeroCard(front, GAME_WIDTH / 2, 372, 1, 0, true);
    this.modalLayer.add(frontCard);
    draftCards.push(frontCard);

    if (this.modalJustOpened) {
      staggerIn(this, draftCards, { staggerMs: 90, offsetY: -40, duration: 260 });
    }

    makeSwipeableCard(this, frontCard, 304, 500, {
      onSwipeRight: () => {
        this.events.emit('ui:hero-pick', front.id);
        this.closeModal();
      },
      onSwipeLeft: () => {
        this.state.activeHeroDraft = undefined;
        this.state.message = 'The visiting heroes leave court.';
        this.closeModal();
        this.refresh();
      },
    });

    this.modalLayer.add(createWoodButton(this, 110, 748, 126, 42, 'Pass', () => {
      this.state.activeHeroDraft = undefined;
      this.state.message = 'The visiting heroes leave court.';
      this.closeModal();
      this.refresh();
    }, { variant: 'dark' }));
    this.modalLayer.add(createWoodButton(this, 270, 748, 126, 42, 'Recruit', () => {
      this.events.emit('ui:hero-pick', front.id);
      this.closeModal();
    }, { variant: 'highlight' }));
  }

  private showCourtScreen(): void {
    const title = this.courtPicker?.kind === 'diplomacy' ? 'Diplomatic Claim' : 'Court';
    const subtitle = this.courtPicker?.kind === 'diplomacy'
      ? 'Assign a free hero to lead this mission.'
      : 'Assign heroes to offices or provinces.';
    this.addModalBase(title, subtitle);
    const content = this.modalContentBounds;

    const courtPickerKey = this.courtPicker
      ? `${this.courtPicker.kind}:${this.courtPicker.kind === 'position' ? this.courtPicker.positionId : this.courtPicker.landId}`
      : 'none';
    const viewKey = `${this.courtTab}|${courtPickerKey}`;
    const animateRows = this.modalJustOpened || viewKey !== this.lastCourtView;
    this.lastCourtView = viewKey;

    if (this.courtPicker) {
      this.showCourtHeroPicker(this.courtPicker, animateRows);
      return;
    }

    const filledSeats = Object.values(this.state.court.seats).filter(Boolean).length;
    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y, width: content.width, height: 70 }, {
      title: `${filledSeats}/${this.state.court.unlockedSeats.length} court offices filled`,
      body: 'More assigned court members create more mandatory court cards.',
      border: INK_UI.gold,
    }));

    const tabY = content.y + 92;
    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2 - 60, tabY, 110, 34, 'Positions', () => {
      this.courtTab = 'positions';
      this.refresh();
    }, { variant: this.courtTab === 'positions' ? 'highlight' : 'dark', fontSize: '12px' }));
    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2 + 60, tabY, 110, 34, 'Governors', () => {
      this.courtTab = 'governors';
      this.refresh();
    }, { variant: this.courtTab === 'governors' ? 'highlight' : 'dark', fontSize: '12px' }));

    const listBounds = { x: content.x, y: content.y + 120, width: content.width, height: content.height - 120 };
    if (this.courtTab === 'positions') {
      this.showCourtPositions(listBounds, animateRows);
    } else {
      this.showCourtGovernors(listBounds, animateRows);
    }
  }

  private showCourtPositions(bounds: UIBounds, animateRows: boolean): void {
    const scroll = this.ui.scrollArea(bounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);
    const rows: Phaser.GameObjects.Container[] = [];
    ALL_COURT_POSITIONS.forEach((positionId, index) => {
      const y = index * 62;
      const unlocked = this.state.court.unlockedSeats.includes(positionId);
      const heroId = this.state.court.seats[positionId];
      const hero = heroId ? this.state.heroes.find((candidate) => candidate.id === heroId) : undefined;
      const status = !unlocked ? 'Locked - needs a Shrine' : hero ? hero.name : 'Vacant';
      const row = this.ui.card({ x: 0, y, width: bounds.width, height: 54 }, {
        title: COURT_POSITION_LABELS[positionId],
        subtitle: status,
        muted: !unlocked,
        border: unlocked ? INK_UI.gold : INK_UI.softBrush,
        action: hero
          ? {
              label: 'Remove',
              onClick: () => {
                removeHeroFromPosition(this.state, positionId);
                this.refresh();
              },
              variant: 'danger',
            }
          : {
              label: unlocked ? 'Assign' : 'Locked',
              onClick: () => {
                if (!unlocked) {
                  return;
                }
                this.courtPicker = { kind: 'position', positionId };
                this.refresh();
              },
              variant: unlocked ? 'primary' : 'disabled',
              disabled: !unlocked,
            },
      });
      scroll.content.add(row);
      rows.push(row);
    });
    scroll.setContentHeight(ALL_COURT_POSITIONS.length * 62);

    if (animateRows) {
      staggerIn(this, rows);
    }
  }

  private showCourtGovernors(bounds: UIBounds, animateRows: boolean): void {
    const lands = this.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).slice(0, 7);

    if (lands.length === 0) {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, bounds.y + 48, 'No districts under your rule yet.', 'label', {
        fontSize: '14px',
        align: 'center',
        wordWrap: { width: 290 },
      }).setOrigin(0.5));
      return;
    }

    const scroll = this.ui.scrollArea(bounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);
    const rows: Phaser.GameObjects.Container[] = [];
    lands.forEach((land, index) => {
      const y = index * 62;
      const governor = this.state.heroes.find((candidate) => candidate.assignedTo === land.id);
      const row = this.ui.card({ x: 0, y, width: bounds.width, height: 54 }, {
        title: land.name,
        subtitle: governor ? `Governor: ${governor.name}` : 'No governor',
        action: {
          label: governor ? 'Change' : 'Assign',
          variant: governor ? 'secondary' : 'primary',
          onClick: () => {
          this.courtPicker = { kind: 'land', landId: land.id };
          this.refresh();
          },
        },
      });
      scroll.content.add(row);
      rows.push(row);
    });
    scroll.setContentHeight(lands.length * 62);

    if (animateRows) {
      staggerIn(this, rows);
    }
  }

  private showCourtHeroPicker(picker: CourtPicker, animateRows: boolean): void {
    const content = this.modalContentBounds;
    this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y, 'Choose a hero', 'label', { fontSize: '16px' }).setOrigin(0.5));

    const heroes = picker.kind === 'diplomacy'
      ? this.state.heroes
        .filter((hero) => !hero.assignedTo)
        .sort((a, b) => b.stats.administration - a.stats.administration)
      : this.state.heroes;

    if (heroes.length === 0) {
      const message = picker.kind === 'diplomacy'
        ? 'Diplomatic claim requires a free hero. Recruit one or free an assigned hero first.'
        : 'No recruited heroes yet. Open Heroes first.';
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 90, message, 'label', {
        fontSize: '14px',
        align: 'center',
        wordWrap: { width: 290 },
      }).setOrigin(0.5));
    }

    const listBounds = { x: content.x, y: content.y + 32, width: content.width, height: content.height - 92 };
    const scroll = this.ui.scrollArea(listBounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);
    const rows: Phaser.GameObjects.Container[] = [];
    heroes.slice(0, 8).forEach((hero, index) => {
      const y = index * 66;
      const row = this.ui.card({ x: 0, y, width: listBounds.width, height: 58 }, {
        action: {
          label: 'Select',
          variant: 'primary',
          onClick: () => {
            if (picker.kind === 'position') {
              assignHeroToPosition(this.state, hero.id, picker.positionId);
            } else if (picker.kind === 'land') {
              assignHeroToLand(this.state, hero.id, picker.landId);
            } else {
              this.courtPicker = undefined;
              this.closeModal();
              this.events.emit('ui:land-action', 'diplomatize', picker.landId, hero.id);
              return;
            }
            this.courtPicker = undefined;
            this.refresh();
          },
        },
      });
      row.add(renderHeroFace(this, hero, 29, 29, 0.34));
      row.add(createLabel(this, 58, 12, hero.name, 'label', { fontSize: '13px', wordWrap: { width: 176 } }));
      if (picker.kind === 'diplomacy') {
        row.add(createLabel(this, 58, 34, `Administration ${hero.stats.administration}`, 'caption', { fontSize: '11px' }));
      }
      scroll.content.add(row);
      rows.push(row);
    });
    scroll.setContentHeight(heroes.slice(0, 8).length * 66);

    if (animateRows) {
      staggerIn(this, rows);
    }

    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2, this.modalFooterBounds.y + 20, 150, 40, 'Cancel', () => {
      this.courtPicker = undefined;
      this.refresh();
    }, { variant: 'dark' }));
  }

  private showArmyScreen(): void {
    this.addModalBase('Army', 'Choose a leader and raise a field army.');
    const content = this.modalContentBounds;
    const leaders = this.state.heroes.filter((hero) => !hero.assignedTo);
    const selectedArmy = this.state.armies.find((army) => army.id === this.state.selectedArmyId && army.kingdomId === PLAYER_KINGDOM_ID)
      ?? this.state.armies.find((army) => army.kingdomId === PLAYER_KINGDOM_ID);
    const armyBlockHeight = selectedArmy ? 112 : 0;
    const maxSoldiers = Math.max(100, this.state.resources.humans);
    this.armySoldiers = Phaser.Math.Clamp(this.armySoldiers, 100, maxSoldiers);
    this.armyFood = Phaser.Math.Clamp(this.armyFood, 0, Math.max(0, this.state.resources.food));
    this.armySupplies = Phaser.Math.Clamp(this.armySupplies, 0, Math.max(0, this.state.resources.supplies));

    if (selectedArmy) {
      const total = selectedArmy.units.spearmen + selectedArmy.units.archers + selectedArmy.units.heavyInfantry;
      this.modalLayer.add(this.ui.card({ x: content.x, y: content.y, width: content.width, height: 98 }, {
        title: `${selectedArmy.name} - Lv ${selectedArmy.level}`,
        subtitle: `${total} soldiers, XP ${selectedArmy.experience}/${selectedArmy.experienceToNextLevel}`,
        body: `Morale ${Math.round(selectedArmy.morale)}   Supply ${Math.round(selectedArmy.supply)}\nDisband: humans return, XP lost.`,
        border: INK_UI.gold,
        action: {
          label: 'Disband',
          variant: 'danger',
          onClick: () => {
            this.events.emit('ui:disband-army', selectedArmy.id);
            this.closeModal();
          },
        },
      }));
    }

    if (leaders.length === 0) {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + armyBlockHeight + 70, 'All commanders are leading armies.', 'label', {
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 292 },
      }).setOrigin(0.5));
      return;
    }

    const visibleLeaders = leaders.slice(0, 3);
    const leaderWidth = visibleLeaders.length === 1 ? 128 : 100;
    const leaderGap = 8;
    const leaderTotalWidth = visibleLeaders.length * leaderWidth + (visibleLeaders.length - 1) * leaderGap;
    visibleLeaders.forEach((hero, index) => {
      const x = content.x + (content.width - leaderTotalWidth) / 2 + index * (leaderWidth + leaderGap);
      const selected = hero.id === this.selectedArmyLeaderId;
      const card = this.ui.card({ x, y: content.y + armyBlockHeight, width: leaderWidth, height: 126 }, {
        border: selected ? INK_UI.gold : INK_UI.softBrush,
      });
      const hit = this.add.rectangle(x, content.y + armyBlockHeight, leaderWidth, 126, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.selectedArmyLeaderId = hero.id;
        this.refresh();
      });
      const portrait = renderHeroFace(this, hero, x + leaderWidth / 2, content.y + armyBlockHeight + 43, 0.5);
      const name = createLabel(this, x + leaderWidth / 2, content.y + armyBlockHeight + 94, hero.name, 'label', {
        fontSize: '10px',
        align: 'center',
        wordWrap: { width: leaderWidth - 16 },
      }).setOrigin(0.5);
      this.modalLayer.add([card, portrait, name, hit]);
    });

    this.addStepperCard(content.y + armyBlockHeight + 140, 'Soldiers', `${this.armySoldiers}`, `Available humans: ${this.state.resources.humans}`, '-100', '+100', () => {
      this.armySoldiers = Math.max(100, this.armySoldiers - 100);
      this.refresh();
    }, () => {
      this.armySoldiers = Math.min(maxSoldiers, this.armySoldiers + 100);
      this.refresh();
    });
    this.addStepperCard(content.y + armyBlockHeight + 244, 'Food to send', `${this.armyFood}`, `Available food: ${this.state.resources.food}`, `-${ARMY_LOGISTICS_STEP}`, `+${ARMY_LOGISTICS_STEP}`, () => {
      this.armyFood = Math.max(0, this.armyFood - ARMY_LOGISTICS_STEP);
      this.refresh();
    }, () => {
      this.armyFood = Math.min(this.state.resources.food, this.armyFood + ARMY_LOGISTICS_STEP);
      this.refresh();
    });
    this.addStepperCard(content.y + armyBlockHeight + 348, 'Supplies to send', `${this.armySupplies}`, `Available supplies: ${this.state.resources.supplies}`, `-${ARMY_LOGISTICS_STEP}`, `+${ARMY_LOGISTICS_STEP}`, () => {
      this.armySupplies = Math.max(0, this.armySupplies - ARMY_LOGISTICS_STEP);
      this.refresh();
    }, () => {
      this.armySupplies = Math.min(this.state.resources.supplies, this.armySupplies + ARMY_LOGISTICS_STEP);
      this.refresh();
    });

    this.modalLayer.add(
      createWoodButton(this, GAME_WIDTH / 2, this.modalFooterBounds.y + 22, 196, 44, 'Create Army', () => {
        if (!this.selectedArmyLeaderId) {
          this.state.message = 'Choose a commander before creating an army.';
          this.refresh();
          return;
        }
        this.events.emit('ui:create-army', this.selectedArmyLeaderId, this.armySoldiers, this.armyFood, this.armySupplies);
        this.closeModal();
      }, { variant: 'highlight' }),
    );
  }

  private addStepperCard(
    y: number,
    title: string,
    value: string,
    caption: string,
    minusLabel: string,
    plusLabel: string,
    onMinus: () => void,
    onPlus: () => void,
  ): void {
    const content = this.modalContentBounds;
    const cardHeight = 96;
    this.modalLayer.add(this.ui.card({ x: content.x, y, width: content.width, height: cardHeight }));
    this.modalLayer.add(createLabel(this, content.x + 12, y + 10, title, 'label', {
      fontSize: '15px',
      wordWrap: { width: 190 },
    }));
    this.modalLayer.add(createLabel(this, content.x + content.width - 12, y + 12, availabilityLabel(caption), 'caption', {
      fontSize: '10px',
      align: 'right',
      wordWrap: { width: 124 },
    }).setOrigin(1, 0));
    this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, y + 53, value, 'label', { fontSize: '28px' }).setOrigin(0.5));
    this.modalLayer.add(this.ui.button({ x: content.x + 12, y: y + 54, width: 78, height: 34 }, minusLabel, onMinus, {
      variant: 'secondary',
      fontSize: '12px',
    }));
    this.modalLayer.add(this.ui.button({ x: content.x + content.width - 90, y: y + 54, width: 78, height: 34 }, plusLabel, onPlus, {
      variant: 'primary',
      fontSize: '12px',
    }));
  }

  private showBuildScreen(): void {
    const land = this.getBuildLand();
    this.addModalBase('Build', land ? land.name : 'Select a district first.');
    const content = this.modalContentBounds;

    if (!land || land.ownerId !== 'dai-viet') {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 90, 'Select one of your districts before building.', 'label', {
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 280 },
      }).setOrigin(0.5));
      return;
    }

    const terrain = formatTerrain(land);
    const labor = getLaborStatus(this.state);
    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y, width: content.width, height: 124 }, {
      title: `Capacity: ${land.buildings.length}/${land.buildingCapacity}`,
      rows: [
        { label: 'Terrain', value: terrain },
        { label: 'Labor', value: `${labor.required} workers, ${Math.round(labor.efficiency * 100)}% efficiency` },
      ],
    }));

    const upgradeOptions = getUpgradeOptions(this.state, land);
    const options = getBuildOptions(this.state, land);
    const listBounds = { x: content.x, y: content.y + 136, width: content.width, height: content.height - 136 };
    const scroll = this.ui.scrollArea(listBounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);
    const buildRows: Phaser.GameObjects.Container[] = [];

    upgradeOptions.forEach((option, index) => {
      const y = index * 106;
      const cost = formatCost(option.cost);
      const label = `${BUILDING_LABELS[option.type].replace('Build ', '')} - Level ${option.level}/${option.maxLevel}`;
      const atMax = option.level >= option.maxLevel;
      const costLine = atMax ? 'Maximum level reached.' : `Upgrade cost: ${cost}`;
      const detail = !atMax && !option.canUpgrade ? option.reason ?? 'Unavailable' : '';
      const row = this.ui.card({ x: 0, y, width: listBounds.width, height: 96 }, {
        title: label,
        subtitle: costLine,
        body: detail || 'Improves this district over several economy ticks.',
        border: option.canUpgrade ? INK_UI.gold : INK_UI.softBrush,
        muted: !option.canUpgrade && !atMax,
        actionPlacement: 'right',
        action: {
          label: atMax ? 'Max' : option.canUpgrade ? 'Upgrade' : 'Why?',
          variant: option.canUpgrade ? 'primary' : atMax ? 'disabled' : 'secondary',
          disabled: atMax,
          onClick: () => {
          if (option.canUpgrade) {
            this.events.emit('ui:land-action', `upgrade:${option.index}`, land.id);
          } else if (!atMax) {
            this.state.message = option.reason ?? 'That building cannot be upgraded right now.';
          }
          this.refresh();
          },
        },
      });
      scroll.content.add(row);
      buildRows.push(row);
    });

    const destroyStartY = upgradeOptions.length * 106;
    land.buildings.forEach((building, index) => {
      const y = destroyStartY + index * 84;
      const label = `${BUILDING_LABELS[building.type].replace('Build ', '')} - Level ${building.level}`;
      const row = this.ui.card({ x: 0, y, width: listBounds.width, height: 74 }, {
        title: `Destroy ${label}`,
        body: 'No refund. Lowers upkeep.',
        border: INK_UI.cinnabar,
        actionPlacement: 'right',
        action: {
          label: 'Destroy',
          variant: 'danger',
          onClick: () => {
            this.events.emit('ui:land-action', `destroy:${index}`, land.id);
            this.refresh();
          },
        },
      });
      scroll.content.add(row);
      buildRows.push(row);
    });

    options.forEach((option, index) => {
      const y = destroyStartY + land.buildings.length * 84 + index * 106;
      const cost = formatCost(option.cost);
      const detail = option.canBuild ? buildDescription(option.type, land) : option.reason ?? 'Unavailable';
      const row = this.ui.card({ x: 0, y, width: listBounds.width, height: 96 }, {
        title: option.label.replace('Build ', ''),
        subtitle: `Cost: ${cost}`,
        body: detail,
        border: option.canBuild ? INK_UI.gold : INK_UI.softBrush,
        muted: !option.canBuild,
        actionPlacement: 'right',
        action: {
          label: option.canBuild ? 'Build' : 'Why?',
          variant: option.canBuild ? 'primary' : 'secondary',
          onClick: () => {
          if (option.canBuild) {
            this.events.emit('ui:land-action', `build:${option.type}`, land.id);
          } else {
            this.state.message = option.reason ?? 'That structure is not available here.';
          }
          this.refresh();
          },
        },
      });
      scroll.content.add(row);
      buildRows.push(row);
    });

    const contentHeight = upgradeOptions.length * 106 + land.buildings.length * 84 + options.length * 106;
    scroll.setContentHeight(contentHeight > 0 ? contentHeight - 10 : 0);

    if (this.modalJustOpened) {
      staggerIn(this, buildRows);
    }
  }

  private showBattleResultScreen(): void {
    const result = this.state.latestBattleResult;
    if (!result) {
      this.closeModal();
      return;
    }

    const land = this.state.lands.find((candidate) => candidate.id === result.targetLandId);
    const army = this.state.armies.find((candidate) => candidate.id === result.attackerArmyId);
    const armyName = army?.name ?? 'Your army';
    const landName = land?.name ?? 'the district';

    this.addModalBase(result.victory ? 'Victory!' : 'Defeat', landName);
    const content = this.modalContentBounds;

    const bodyText = result.victory
      ? `${armyName} broke the defenses of ${landName}.\n\nYour power: ${result.attackerPower}\nEnemy power: ${result.defenderPower}\n\nThe army now besieges the district. It will fall in ${result.siegeTicks} economy ${result.siegeTicks === 1 ? 'tick' : 'ticks'}.`
      : `${armyName} was repelled at ${landName}.\n\nYour power: ${result.attackerPower}\nEnemy power: ${result.defenderPower}\n\nThe army falls back to recover.`;

    this.modalLayer.add(
      this.ui.card({ x: content.x, y: content.y + 54, width: content.width, height: 260 }, {
        title: result.victory ? `${armyName} prevailed` : `${armyName} was repelled`,
        body: bodyText,
        border: result.victory ? INK_UI.gold : INK_UI.cinnabar,
      }),
    );

    if (result.victory) {
      this.modalLayer.add(
        createWoodButton(this, GAME_WIDTH / 2 - 85, this.modalFooterBounds.y + 22, 150, 40, 'Retreat', () => {
          this.events.emit('ui:retreat-siege', result.attackerArmyId, result.targetLandId);
          this.closeModal();
        }, { variant: 'dark' }),
      );
      this.modalLayer.add(
        createWoodButton(this, GAME_WIDTH / 2 + 85, this.modalFooterBounds.y + 22, 150, 40, 'Continue', () => this.closeModal(), {
          variant: 'highlight',
        }),
      );
    } else {
      this.modalLayer.add(
        createWoodButton(this, GAME_WIDTH / 2, this.modalFooterBounds.y + 22, 150, 40, 'Continue', () => this.closeModal(), {
          variant: 'highlight',
        }),
      );
    }
  }

  private showPoliticsScreen(card: PoliticsCard): void {
    this.addModalBase('Court Request', 'Choose a response.');
    const content = this.modalContentBounds;
    const eventCard = this.ui.card({ x: content.x, y: content.y + 8, width: content.width, height: 272 }, {
      title: card.title,
      body: card.description,
      border: INK_UI.cinnabar,
      status: card.type,
    });
    this.modalLayer.add([
      eventCard,
    ]);

    card.choices.forEach((choice, index) => {
      const y = content.y + 300 + index * 92;
      this.modalLayer.add(this.ui.card({ x: content.x, y, width: content.width, height: 76 }, {
        title: choice.label,
        subtitle: choice.description,
        action: {
          label: 'Choose',
          variant: index === 0 ? 'danger' : 'primary',
          onClick: () => {
            this.events.emit('ui:politics-choice', choice.id);
            this.closeModal();
          },
        },
      }));
    });
  }

  private showGameMenuScreen(): void {
    this.addModalBase('Game Menu', 'Campaign controls.');
    const content = this.modalContentBounds;

    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y + 28, width: content.width, height: 118 }, {
      title: 'Current Campaign',
      body: `Year ${this.state.year}, ${this.state.season}\n${this.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length} districts under your rule.`,
      border: INK_UI.gold,
    }));

    this.modalLayer.add(this.ui.button({ x: 58, y: 332, width: 274, height: 46 }, 'Continue', () => {
      this.closeModal();
      this.refresh();
    }, { variant: 'primary', fontSize: '14px' }));
    this.modalLayer.add(this.ui.button({ x: 58, y: 402, width: 274, height: 46 }, 'Save Snapshot', () => {
      this.events.emit('ui:save-snapshot');
      this.closeModal();
    }, { variant: 'secondary', fontSize: '14px' }));
    this.modalLayer.add(this.ui.button({ x: 58, y: 472, width: 274, height: 46 }, 'Exit to Menu', () => {
      this.modalScreen = 'exit-menu';
      this.modalJustOpened = true;
      this.refresh();
    }, { variant: 'danger', fontSize: '14px' }));
  }

  private showExitMenuScreen(): void {
    this.addModalBase('Exit to Menu', 'Choose how to leave this campaign.');
    const content = this.modalContentBounds;

    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y + 28, width: content.width, height: 118 }, {
      title: 'Unsaved progress may be lost',
      body: 'Save a snapshot before returning to the main menu, or leave without changing the saved slot.',
      border: INK_UI.cinnabar,
    }));

    this.modalLayer.add(this.ui.button({ x: 58, y: 332, width: 274, height: 46 }, 'Save and Exit', () => {
      this.events.emit('ui:exit-to-menu', true);
    }, { variant: 'primary', fontSize: '14px' }));
    this.modalLayer.add(this.ui.button({ x: 58, y: 402, width: 274, height: 46 }, 'Exit Without Saving', () => {
      this.events.emit('ui:exit-to-menu', false);
    }, { variant: 'danger', fontSize: '14px' }));
    this.modalLayer.add(this.ui.button({ x: 58, y: 472, width: 274, height: 46 }, 'Cancel', () => {
      this.modalScreen = 'game-menu';
      this.modalJustOpened = true;
      this.refresh();
    }, { variant: 'secondary', fontSize: '14px' }));
  }

  private drawHeroCard(
    hero: Hero,
    x: number,
    y: number,
    scale: number,
    rotation: number,
    active: boolean,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(x, y).setScale(scale).setRotation(rotation);
    const bg = createPanel(this, -152, -250, 304, 500, {
      fillAlpha: active ? 1 : 0.9,
      border: active ? 0xffde72 : PARCHMENT.border,
      borderWidth: 4,
      radius: 12,
    });
    const dark = this.add.rectangle(0, -112, 250, 226, 0x1b0904, 1);
    dark.setStrokeStyle(3, 0x5b3b22, 0.95);
    const portrait = renderHeroFace(this, hero, 0, -110, 1.16);
    const name = createLabel(this, 0, 34, hero.name, 'label', {
      fontSize: '22px',
      align: 'center',
      wordWrap: { width: 250 },
    }).setOrigin(0.5);
    const type = createLabel(this, 0, 72, `${hero.rarity} ${hero.type}`, 'caption', { fontSize: '14px', fontStyle: '700' }).setOrigin(0.5);
    const effect = createLabel(this, 0, 112, hero.effect, 'body', {
      fontSize: '14px',
      align: 'center',
      wordWrap: { width: 244 },
    }).setOrigin(0.5, 0);
    const upkeep = createLabel(this, 112, 214, `${hero.upkeepGold}g`, 'label', { fontSize: '18px' }).setOrigin(1, 0.5);
    card.add([bg, dark, portrait, name, type, effect, upkeep]);
    return card;
  }

  private renderCourtRequestBadge(card: PoliticsCard): void {
    const badgeX = GAME_WIDTH - 86;
    const badgeY = HEADER_HEIGHT + 10;
    const badge = this.add
      .rectangle(badgeX, badgeY, 72, 30, INK_UI.parchment, 0.96)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(430);
    badge.setStrokeStyle(2, INK_UI.cinnabar, 0.9);
    const dot = this.add.circle(badgeX + 11, badgeY + 15, 4, INK_UI.cinnabar, 1).setDepth(431);
    const text = this.add.text(badgeX + 20, badgeY + 8, 'Court', {
      color: '#211103',
      fontSize: '12px',
      fontStyle: '700',
    }).setDepth(431);
    badge.on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.openModal('request');
    });
    this.requestBadge = [badge, dot, text];
    void card;
  }

  private clearRequestBadge(): void {
    for (const item of this.requestBadge) {
      item.destroy();
    }
    this.requestBadge = [];
  }

  private renderMapControls(): void {
    const bottomAnchor = this.state.latestBattlePreview ? SHEET_TOP - 10
      : this.state.selectedLandId ? COMPACT_CARD_Y - 10
      : GAME_HEIGHT - 54;
    const x = GAME_WIDTH - 24;

    this.mapControls = [
      this.createMapIconButton(x, bottomAnchor - 104, 'zoom-in', () => this.handleAction('zoom-in')),
      this.createMapIconButton(x, bottomAnchor - 62, 'zoom-out', () => this.handleAction('zoom-out')),
      this.createMapIconButton(x, bottomAnchor - 20, 'mode', () => this.handleAction('toggle-render-mode')),
    ];
  }

  private createMapIconButton(
    x: number,
    y: number,
    icon: 'zoom-in' | 'zoom-out' | 'mode',
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(430);
    const g = this.add.graphics();
    g.fillStyle(INK_UI.parchment, 0.96);
    g.fillRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(3, INK_UI.softBrush, 0.25);
    g.strokeRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(2, INK_UI.brush, 0.9);
    g.strokeRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(3, INK_UI.brush, 0.9);

    if (icon === 'zoom-in' || icon === 'zoom-out') {
      g.lineBetween(-8, 0, 8, 0);
      if (icon === 'zoom-in') {
        g.lineBetween(0, -8, 0, 8);
      }
    } else if (this.state.mapRenderMode === 'terrain') {
      g.fillStyle(INK_UI.softBrush, 0.95);
      g.fillTriangle(-10, 8, 0, -9, 10, 8);
      g.fillStyle(0x5bb6d6, 0.9);
      g.fillRect(-10, 9, 20, 3);
    } else {
      g.fillStyle(INK_UI.jade, 0.95);
      g.fillRect(-10, -9, 9, 18);
      g.fillStyle(INK_UI.cinnabar, 0.95);
      g.fillRect(1, -9, 9, 18);
      g.lineStyle(2, INK_UI.brush, 0.82);
      g.strokeRect(-10, -9, 20, 18);
    }

    const hit = this.add.rectangle(0, 0, 42, 42, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    );
    hit.on(
      'pointerup',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        onClick();
      },
    );
    container.add([g, hit]);
    return container;
  }

  private clearMapControls(): void {
    for (const item of this.mapControls) {
      item.destroy();
    }
    this.mapControls = [];
  }

  private renderGameMenuButton(): void {
    const hit = this.add.rectangle(GAME_WIDTH - 34, 13, 60, 26, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .setDepth(430);
    hit.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    );
    hit.on(
      'pointerup',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.openModal('game-menu');
      },
    );
    const text = this.ui.label(GAME_WIDTH - 12, 5, 'Menu', 'button', {
      color: '#fff6bd',
      fontSize: '12px',
      align: 'right',
    }).setOrigin(1, 0).setDepth(431);
    this.gameMenuButton = [hit, text];
  }

  private clearGameMenuButton(): void {
    for (const item of this.gameMenuButton) {
      item.destroy();
    }
    this.gameMenuButton = [];
  }

  private clearCompactCard(): void {
    for (const item of this.compactCard) {
      item.destroy();
    }
    this.compactCard = [];
  }

  private getSelectedLand(): Land | undefined {
    return this.state.lands.find((land) => land.id === this.state.selectedLandId);
  }

  private getDefaultBuildLand(): Land | undefined {
    return this.state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID && land.isVisible);
  }

  private getBuildLand(): Land | undefined {
    const landId = this.modalBuildLandId ?? this.state.selectedLandId;
    return this.state.lands.find((land) => land.id === landId);
  }

  private openBuildModal(landId: string): void {
    this.modalBuildLandId = landId;
    this.state.selectedLandId = landId;
    this.openModal('build');
  }

  private pickDefaultLeader(): Hero | undefined {
    return (
      this.state.heroes.find((hero) => hero.type === 'general' && !hero.assignedTo) ??
      this.state.heroes.find((hero) => !hero.assignedTo)
    );
  }

  private makeLandPanel(land: Land): LandPanel {
    return new LandPanel(this, this.state, (action, landId) => {
      if (action === 'open-land-detail') {
        this.openModal('land-detail');
        return;
      }
      if (action === 'diplomatize') {
        this.openDiplomacyPicker(landId);
        return;
      }
      if (action === 'open-build' && land.ownerId === PLAYER_KINGDOM_ID) {
        this.openBuildModal(landId);
        return;
      }
      this.events.emit('ui:land-action', action, landId);
    });
  }

  private showLandDetailScreen(): void {
    const land = this.getSelectedLand();
    if (!land) {
      this.closeModal();
      return;
    }

    const ownerLabel = land.ownerId === PLAYER_KINGDOM_ID
      ? 'Your district'
      : land.ownerId === 'neutral' ? 'Neutral territory' : 'Rival territory';
    this.addModalBase(land.name, ownerLabel);

    const content = this.modalContentBounds;
    const { infoLines, actions } = this.makeLandPanel(land).renderDetailContent(land);

    const infoCardH = Math.min(infoLines.length * 18 + 32, 220);
    this.modalLayer.add(this.ui.card(
      { x: content.x, y: content.y, width: content.width, height: infoCardH },
      { body: infoLines.join('\n') },
    ));

    if (actions.length > 0) {
      const footer = this.modalFooterBounds;
      const btnH = 40;
      const btnGap = 8;
      const count = Math.min(actions.length, 3);
      const btnW = count === 1 ? 200 : Math.floor((content.width - (count - 1) * btnGap) / count);
      const totalW = count * btnW + (count - 1) * btnGap;
      const startX = content.x + (content.width - totalW) / 2;
      actions.slice(0, count).forEach((act, i) => {
        this.modalLayer.add(this.ui.button(
          { x: startX + i * (btnW + btnGap), y: footer.y + (footer.height - btnH) / 2, width: btnW, height: btnH },
          act.label,
          () => this.handleLandDetailAction(act.id, land.id),
          { variant: act.variant ?? 'secondary', fontSize: '11px' },
        ));
      });
    }
  }

  private handleLandDetailAction(action: string, landId: string): void {
    if (action === 'diplomatize') {
      this.openDiplomacyPicker(landId);
      return;
    }

    this.closeModal();
    if (action === 'open-build') {
      this.openBuildModal(landId);
      return;
    }
    this.events.emit('ui:land-action', action, landId);
  }

  private openDiplomacyPicker(landId: string): void {
    const hasFreeHero = this.state.heroes.some((hero) => !hero.assignedTo);
    if (!hasFreeHero) {
      this.state.message = 'Diplomatic claim requires a free hero. Recruit one or free an assigned hero first.';
      if (this.modalScreen !== 'none') {
        this.closeModal();
      } else {
        this.refresh();
      }
      return;
    }

    this.courtPicker = { kind: 'diplomacy', landId };
    this.openModal('court');
  }

  private showVictory(): void {
    this.modalScreen = 'none';
    this.state.isPaused = true;
    this.clearModalLayer();
    this.modalLayer.setVisible(false);
    this.bottomSheet.show([
      this.ui.card({ x: 18, y: SHEET_TOP + 28, width: GAME_WIDTH - 36, height: 132 }, {
        title: 'Victory',
        body: 'All rival castles have fallen. The mandate belongs to Đại Việt.',
        border: INK_UI.gold,
        status: 'Mandate',
      }),
    ]);
  }
}

function formatCost(cost: Partial<GameState['resources']>): string {
  return Object.entries(cost)
    .map(([key, value]) => `${value} ${key}`)
    .join(', ');
}

function formatTerrain(land: Land): string {
  const grass = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
  const ore = land.terrainSummary.mountains + land.terrainSummary.hills;
  const water = land.terrainSummary.water;
  const city = land.terrainSummary.fortress + land.terrainSummary.shrine;
  return `grass ${grass}, ore ${ore}, water ${water}, city ${city}`;
}

function buildDescription(type: string, land: Land): string {
  if (type === 'farm') {
    const waterBonus = land.terrainSummary.water > 0 ? ' Water boosts food.' : '';
    return `Produces food from grass and field tiles.${waterBonus}`;
  }
  if (type === 'mine') {
    return 'Produces supplies from mountain and hill tiles.';
  }
  if (type === 'wall') {
    return 'Raises this district\'s defense by 6.';
  }
  if (type === 'tower') {
    return 'Raises this district\'s defense by 10.';
  }
  return 'Produces gold and supplies from roads and city access.';
}

function availabilityLabel(text: string): string {
  const value = text.match(/(\d[\d,]*)$/)?.[1];
  return value ? `Available: ${value}` : text;
}
