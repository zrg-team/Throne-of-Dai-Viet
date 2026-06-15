import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, PLAYER_KINGDOM_ID } from '../game/constants';
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
import { LandPanel } from '../ui/LandPanel';
import { ResourceBar } from '../ui/ResourceBar';
import { createLabel, createPanel, createWoodButton, PARCHMENT } from '../ui/theme';
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

type CourtPicker = { kind: 'position'; positionId: CourtPositionId } | { kind: 'land'; landId: string };

type ModalScreen = 'none' | 'heroes' | 'court' | 'army' | 'request' | 'build' | 'battle-result';

/** Vertical bounds of the scrollable build-option list within the build modal's paper. */
const BUILD_LIST_TOP = 224;
const BUILD_LIST_HEIGHT = 561;

export class UIScene extends Phaser.Scene {
  private state!: GameState;
  private resourceBar!: ResourceBar;
  private actionBar!: ActionBar;
  private bottomSheet!: BottomSheet;
  private messageText!: Phaser.GameObjects.Text;
  private modalLayer!: Phaser.GameObjects.Container;
  private mapControls: Phaser.GameObjects.GameObject[] = [];
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
  private buildListContainer?: Phaser.GameObjects.Container;
  private buildScrollY = 0;
  private buildMaxScroll = 0;
  private buildDragStart?: { pointerY: number; scrollY: number };
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
  }

  create(): void {
    this.input.setTopOnly(true);
    this.resourceBar = new ResourceBar(this, this.state);
    this.actionBar = new ActionBar(this, this.state, (action) => this.handleAction(action));
    this.bottomSheet = new BottomSheet(this);
    this.modalLayer = this.add.container(0, 0).setDepth(500).setVisible(false);
    this.messageText = this.add.text(14, HEADER_HEIGHT + 6, '', {
      color: '#1e2a22',
      fontSize: '12px',
      wordWrap: { width: GAME_WIDTH - 126 },
    }).setDepth(110);

    this.events.on('state-changed', () => this.refresh());
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => this.handleBuildListWheel(pointer, dy));
    this.game.canvas.addEventListener('pointerup', this.domPointerUp);
    this.game.canvas.addEventListener('mouseup', this.domMouseUp);
    this.refresh();
  }

  shutdown(): void {
    this.game.canvas.removeEventListener('pointerup', this.domPointerUp);
    this.game.canvas.removeEventListener('mouseup', this.domMouseUp);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.modalScreen !== 'none') {
      this.handleModalTap(pointer.x, pointer.y);
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
    this.modalScreen = 'none';
    this.state.activePoliticsCard = undefined;
    this.state.latestBattleResult = undefined;
    this.state.isPaused = false;
    window.__suppressMapInputUntil = performance.now() + 280;
    this.modalLayer.removeAll(true);
    this.modalLayer.setVisible(false);
    this.modalBuildLandId = undefined;
    this.buildListContainer = undefined;
    this.buildDragStart = undefined;
  }

  private refresh(): void {
    this.resourceBar.refresh();
    this.actionBar.refresh();
    this.messageText.setText(this.state.message);
    this.clearRequestBadge();
    this.clearMapControls();

    if (this.state.victory) {
      this.showVictory();
      return;
    }

    if (this.modalScreen === 'none' && this.state.latestBattleResult) {
      this.openModal('battle-result');
      return;
    }

    if (this.modalScreen !== 'none') {
      this.bottomSheet.hide();
      this.renderModal();
      return;
    }

    this.modalLayer.removeAll(true);
    this.modalLayer.setVisible(false);
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
      const panel = new LandPanel(this, this.state, (action, landId) => {
        if (action === 'open-build') {
          if (selectedLand.ownerId === 'dai-viet') {
            this.openBuildModal(selectedLand.id);
          }
          return;
        }
        this.events.emit('ui:land-action', action, landId);
      });
      this.bottomSheet.show(panel.render(selectedLand));
      return;
    }

    this.bottomSheet.hide();
  }

  private renderModal(): void {
    this.modalLayer.removeAll(true);
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
    }

    if (this.modalJustOpened) {
      this.modalJustOpened = false;
      popInModal(this, this.modalLayer, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    }
  }

  private addModalBase(title: string, subtitle: string): void {
    const blocker = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x211103, 0.92)
      .setOrigin(0, 0)
      .setInteractive();
    blocker.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    );

    const panelX = GAME_WIDTH / 2 - 181;
    const panelY = GAME_HEIGHT / 2 - 371;
    const panelWidth = 362;
    const panelRadius = 14;
    const headerHeight = 86;

    const paper = createPanel(this, panelX, panelY, panelWidth, 742, {
      fill: 0xc4ae68,
      border: 0xf5dfaa,
      borderAlpha: 0.88,
      borderWidth: 4,
      radius: panelRadius,
    });

    // Header sits flush inside the panel's top edge, sharing its rounded
    // corners and gilt border so it reads as one piece, not a floating bar.
    const darkTop = this.add.graphics({ x: panelX, y: panelY });
    const headerRadius = { tl: panelRadius, tr: panelRadius, bl: 0, br: 0 };
    darkTop.fillStyle(PARCHMENT.dark, 0.96);
    darkTop.fillRoundedRect(0, 0, panelWidth, headerHeight, headerRadius);
    darkTop.lineStyle(4, 0xf5dfaa, 0.88);
    darkTop.strokeRoundedRect(0, 0, panelWidth, headerHeight, headerRadius);
    const titleText = createLabel(this, GAME_WIDTH / 2, 42, title, 'title').setOrigin(0.5);
    const subtitleText = createLabel(this, GAME_WIDTH / 2, 75, subtitle, 'subtitle', {
      align: 'center',
      wordWrap: { width: 314 },
    }).setOrigin(0.5);

    this.modalLayer.add([blocker, paper, darkTop, titleText, subtitleText]);
    this.modalLayer.add(createWoodButton(this, 342, 42, 42, 30, 'X', () => this.closeModal(), { variant: 'dark', fontSize: '14px' }));
  }

  private showHeroesScreen(): void {
    this.addModalBase('Heroes', 'Recruit one hero. The game is paused while you inspect the cards.');

    if (!this.state.activeHeroDraft || this.state.activeHeroDraft.length === 0) {
      const favor = this.state.court.favor;
      const threshold = this.state.court.favorThreshold;
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, 116, 'No heroes are waiting at court.', 'label', {
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 290 },
      }).setOrigin(0.5));
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, 148, `Next arrival: Favor ${Math.round(favor)}/${threshold}`, 'caption', {
        fontSize: '12px',
      }).setOrigin(0.5));
      const favorRatio = Phaser.Math.Clamp(favor / threshold, 0, 1);
      const favorBarBg = this.add.rectangle(GAME_WIDTH / 2 - 100, 172, 200, 12, 0x3f2a1a, 0.6).setOrigin(0, 0.5);
      const favorBarFill = this.add.rectangle(GAME_WIDTH / 2 - 100, 172, 200 * favorRatio, 12, 0x55c878, 0.95).setOrigin(0, 0.5);
      this.modalLayer.add([favorBarBg, favorBarFill]);

      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, 204, 'Current Roster', 'label', { fontSize: '14px' }).setOrigin(0.5));
      const rosterRows: Phaser.GameObjects.Container[] = [];
      this.state.heroes.slice(0, 7).forEach((hero, index) => {
        const y = 236 + index * 64;
        const card = createPanel(this, 28, y - 26, 334, 56);
        const portrait = renderHeroFace(this, hero, 52, y, 0.42);
        const name = createLabel(this, 84, y - 18, hero.name, 'label', { fontSize: '13px' });
        const assignment = createLabel(this, 84, y + 2, `Assigned: ${hero.assignedTo ?? 'idle'}`, 'caption', {
          fontSize: '11px',
          wordWrap: { width: 250 },
        });
        const row = this.add.container(0, 0, [card, portrait, name, assignment]);
        this.modalLayer.add(row);
        rosterRows.push(row);
      });
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
    this.addModalBase('Court', 'Seat heroes in court positions or appoint them as governors. The game is paused here.');

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

    const court = this.state.court;
    const stats: Array<{ label: string; value: number; max: number; color: number }> = [
      { label: 'Stability', value: court.stability, max: 100, color: 0x5bb6d6 },
      { label: 'Influence', value: court.influence, max: 100, color: 0xd9b35a },
      { label: 'Favor', value: court.favor, max: court.favorThreshold, color: 0x55c878 },
    ];
    stats.forEach((stat, index) => {
      const y = 110 + index * 32;
      const suffix = stat.label === 'Favor' ? `/${Math.round(stat.max)}` : '';
      this.modalLayer.add(createLabel(this, 28, y - 7, `${stat.label}: ${Math.round(stat.value)}${suffix}`, 'label', { fontSize: '12px' }));
      const ratio = Phaser.Math.Clamp(stat.value / stat.max, 0, 1);
      const barBg = this.add.rectangle(196, y, 152, 12, 0x3f2a1a, 0.6).setOrigin(0, 0.5);
      const barFill = this.add.rectangle(196, y, 152 * ratio, 12, stat.color, 0.95).setOrigin(0, 0.5);
      this.modalLayer.add([barBg, barFill]);
    });

    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2 - 60, 202, 110, 34, 'Positions', () => {
      this.courtTab = 'positions';
      this.refresh();
    }, { variant: this.courtTab === 'positions' ? 'highlight' : 'dark', fontSize: '12px' }));
    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2 + 60, 202, 110, 34, 'Governors', () => {
      this.courtTab = 'governors';
      this.refresh();
    }, { variant: this.courtTab === 'governors' ? 'highlight' : 'dark', fontSize: '12px' }));

    if (this.courtTab === 'positions') {
      this.showCourtPositions(animateRows);
    } else {
      this.showCourtGovernors(animateRows);
    }
  }

  private showCourtPositions(animateRows: boolean): void {
    const rows: Phaser.GameObjects.Container[] = [];
    ALL_COURT_POSITIONS.forEach((positionId, index) => {
      const y = 246 + index * 58;
      const unlocked = this.state.court.unlockedSeats.includes(positionId);
      const heroId = this.state.court.seats[positionId];
      const hero = heroId ? this.state.heroes.find((candidate) => candidate.id === heroId) : undefined;
      const card = createPanel(this, 28, y - 24, 334, 50, {
        border: unlocked ? 0xffde72 : 0x9b7860,
        borderAlpha: unlocked ? 0.9 : 0.5,
      });
      const status = !unlocked ? 'Locked - needs a Shrine' : hero ? hero.name : 'Vacant';
      const rowItems: Phaser.GameObjects.GameObject[] = [
        card,
        createLabel(this, 40, y - 16, COURT_POSITION_LABELS[positionId], 'label', { fontSize: '13px' }),
        createLabel(this, 40, y + 3, status, 'caption', { fontSize: '11px', wordWrap: { width: 210 } }),
      ];

      if (unlocked) {
        if (hero) {
          rowItems.push(createWoodButton(this, 317, y - 6, 64, 30, 'Remove', () => {
            removeHeroFromPosition(this.state, positionId);
            this.refresh();
          }, { variant: 'dark', fontSize: '10px' }));
        } else {
          rowItems.push(createWoodButton(this, 317, y - 6, 64, 30, 'Assign', () => {
            this.courtPicker = { kind: 'position', positionId };
            this.refresh();
          }, { fontSize: '10px' }));
        }
      }

      const row = this.add.container(0, 0, rowItems);
      this.modalLayer.add(row);
      rows.push(row);
    });

    if (animateRows) {
      staggerIn(this, rows);
    }
  }

  private showCourtGovernors(animateRows: boolean): void {
    const lands = this.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).slice(0, 7);

    if (lands.length === 0) {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, 280, 'No districts under your rule yet.', 'label', {
        fontSize: '14px',
        align: 'center',
        wordWrap: { width: 290 },
      }).setOrigin(0.5));
      return;
    }

    const rows: Phaser.GameObjects.Container[] = [];
    lands.forEach((land, index) => {
      const y = 246 + index * 58;
      const governor = this.state.heroes.find((candidate) => candidate.assignedTo === land.id);
      const card = createPanel(this, 28, y - 24, 334, 50);
      const row = this.add.container(0, 0, [
        card,
        createLabel(this, 40, y - 16, land.name, 'label', { fontSize: '13px' }),
        createLabel(this, 40, y + 3, governor ? `Governor: ${governor.name}` : 'No governor', 'caption', {
          fontSize: '11px',
          wordWrap: { width: 210 },
        }),
        createWoodButton(this, 317, y - 6, 64, 30, governor ? 'Change' : 'Assign', () => {
          this.courtPicker = { kind: 'land', landId: land.id };
          this.refresh();
        }, { fontSize: '10px' }),
      ]);
      this.modalLayer.add(row);
      rows.push(row);
    });

    if (animateRows) {
      staggerIn(this, rows);
    }
  }

  private showCourtHeroPicker(picker: CourtPicker, animateRows: boolean): void {
    this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, 110, 'Choose a hero', 'label', { fontSize: '16px' }).setOrigin(0.5));

    if (this.state.heroes.length === 0) {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, 200, 'No recruited heroes yet. Open Heroes first.', 'label', {
        fontSize: '14px',
        align: 'center',
        wordWrap: { width: 290 },
      }).setOrigin(0.5));
    }

    const rows: Phaser.GameObjects.Container[] = [];
    this.state.heroes.slice(0, 8).forEach((hero, index) => {
      const y = 150 + index * 58;
      const card = createPanel(this, 28, y - 24, 334, 50);
      const portrait = renderHeroFace(this, hero, 50, y, 0.4);
      const name = createLabel(this, 80, y - 16, hero.name, 'label', { fontSize: '13px' });
      const assignment = createLabel(this, 80, y + 3, `Now: ${hero.assignedTo ?? 'idle'}`, 'caption', {
        fontSize: '11px',
        wordWrap: { width: 180 },
      });
      const select = createWoodButton(this, 317, y - 6, 64, 30, 'Select', () => {
        if (picker.kind === 'position') {
          assignHeroToPosition(this.state, hero.id, picker.positionId);
        } else {
          assignHeroToLand(this.state, hero.id, picker.landId);
        }
        this.courtPicker = undefined;
        this.refresh();
      }, { fontSize: '10px' });
      const row = this.add.container(0, 0, [card, portrait, name, assignment, select]);
      this.modalLayer.add(row);
      rows.push(row);
    });

    if (animateRows) {
      staggerIn(this, rows);
    }

    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2, 690, 150, 40, 'Cancel', () => {
      this.courtPicker = undefined;
      this.refresh();
    }, { variant: 'dark' }));
  }

  private showArmyScreen(): void {
    this.addModalBase('Army', 'Choose a leader, assign soldiers and supplies, then raise an army on the map. Gameplay is paused.');
    const leaders = this.state.heroes.filter((hero) => !hero.assignedTo);
    const maxSoldiers = Math.max(100, this.state.resources.humans);
    this.armySoldiers = Phaser.Math.Clamp(this.armySoldiers, 100, maxSoldiers);
    this.armyFood = Phaser.Math.Clamp(this.armyFood, 0, Math.max(0, this.state.resources.food));
    this.armySupplies = Phaser.Math.Clamp(this.armySupplies, 0, Math.max(0, this.state.resources.supplies));

    if (leaders.length === 0) {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, 208, 'All commanders are leading armies.', 'label', {
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 292 },
      }).setOrigin(0.5));
      return;
    }

    const visibleLeaders = leaders.slice(0, 3);
    visibleLeaders.forEach((hero, index) => {
      const x = GAME_WIDTH / 2 + (index - (visibleLeaders.length - 1) / 2) * 114;
      const selected = hero.id === this.selectedArmyLeaderId;
      const card = this.add.rectangle(x, 185, 94, 126, selected ? 0xffde72 : 0xf0dca8, 1).setInteractive({ useHandCursor: true });
      card.setStrokeStyle(3, selected ? 0x2a1403 : 0x9b7860, 0.9);
      card.on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.selectedArmyLeaderId = hero.id;
        this.refresh();
      });
      const portrait = renderHeroFace(this, hero, x, 162, 0.55);
      const name = createLabel(this, x, 236, hero.name, 'label', {
        fontSize: '10px',
        align: 'center',
        wordWrap: { width: 82 },
      }).setOrigin(0.5);
      this.modalLayer.add([card, portrait, name]);
    });

    const box = createPanel(this, GAME_WIDTH / 2 - 152, 325, 304, 130);
    this.modalLayer.add([
      box,
      createLabel(this, GAME_WIDTH / 2, 342, 'Soldiers to assign', 'label', { fontSize: '16px' }).setOrigin(0.5),
      createLabel(this, GAME_WIDTH / 2, 385, `${this.armySoldiers}`, 'label', { fontSize: '36px' }).setOrigin(0.5),
      createLabel(this, GAME_WIDTH / 2, 425, `Available humans: ${this.state.resources.humans}`, 'caption').setOrigin(0.5),
      createWoodButton(this, 92, 386, 64, 42, '-100', () => {
        this.armySoldiers = Math.max(100, this.armySoldiers - 100);
        this.refresh();
      }, { variant: 'dark' }),
      createWoodButton(this, 298, 386, 64, 42, '+100', () => {
        this.armySoldiers = Math.min(maxSoldiers, this.armySoldiers + 100);
        this.refresh();
      }, { variant: 'dark' }),
    ]);

    const logisticsBox = createPanel(this, GAME_WIDTH / 2 - 152, 465, 304, 210);
    this.modalLayer.add([
      logisticsBox,
      createLabel(this, GAME_WIDTH / 2, 482, 'Food to send', 'label', { fontSize: '16px' }).setOrigin(0.5),
      createLabel(this, GAME_WIDTH / 2, 520, `${this.armyFood}`, 'label', { fontSize: '28px' }).setOrigin(0.5),
      createWoodButton(this, 92, 520, 64, 42, `-${ARMY_LOGISTICS_STEP}`, () => {
        this.armyFood = Math.max(0, this.armyFood - ARMY_LOGISTICS_STEP);
        this.refresh();
      }, { variant: 'dark' }),
      createWoodButton(this, 298, 520, 64, 42, `+${ARMY_LOGISTICS_STEP}`, () => {
        this.armyFood = Math.min(this.state.resources.food, this.armyFood + ARMY_LOGISTICS_STEP);
        this.refresh();
      }, { variant: 'dark' }),
      createLabel(this, GAME_WIDTH / 2, 562, 'Supplies to send', 'label', { fontSize: '16px' }).setOrigin(0.5),
      createLabel(this, GAME_WIDTH / 2, 610, `${this.armySupplies}`, 'label', { fontSize: '28px' }).setOrigin(0.5),
      createWoodButton(this, 92, 610, 64, 42, `-${ARMY_LOGISTICS_STEP}`, () => {
        this.armySupplies = Math.max(0, this.armySupplies - ARMY_LOGISTICS_STEP);
        this.refresh();
      }, { variant: 'dark' }),
      createWoodButton(this, 298, 610, 64, 42, `+${ARMY_LOGISTICS_STEP}`, () => {
        this.armySupplies = Math.min(this.state.resources.supplies, this.armySupplies + ARMY_LOGISTICS_STEP);
        this.refresh();
      }, { variant: 'dark' }),
      createLabel(this, GAME_WIDTH / 2, 650, `Available food: ${this.state.resources.food}  Supplies: ${this.state.resources.supplies}`, 'caption').setOrigin(0.5),
    ]);

    this.modalLayer.add(
      createWoodButton(this, GAME_WIDTH / 2, 710, 196, 48, 'Create Army', () => {
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

  private showBuildScreen(): void {
    const land = this.getBuildLand();
    this.addModalBase('Build', land ? land.name : 'Select a district first.');

    if (!land || land.ownerId !== 'dai-viet') {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, 235, 'Select one of your districts before building.', 'label', {
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 280 },
      }).setOrigin(0.5));
      return;
    }

    const terrain = formatTerrain(land);
    const labor = getLaborStatus(this.state);
    const capacity = createPanel(this, 35, 116, 320, 100);
    this.modalLayer.add([
      capacity,
      createLabel(this, 55, 132, `Capacity: ${land.buildings.length}/${land.buildingCapacity}`, 'label', { fontSize: '16px' }),
      createLabel(this, 55, 160, `Terrain: ${terrain}`, 'body', { fontSize: '12px', wordWrap: { width: 290 } }),
      createLabel(this, 55, 196, `Labor: needs ${labor.required} workers (efficiency ${Math.round(labor.efficiency * 100)}%)`, 'body', { fontSize: '12px', wordWrap: { width: 290 } }),
    ]);

    const dragZone = this.add.zone(0, BUILD_LIST_TOP, GAME_WIDTH, BUILD_LIST_HEIGHT).setOrigin(0, 0).setInteractive();
    this.input.setDraggable(dragZone);
    dragZone.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      this.buildDragStart = { pointerY: pointer.y, scrollY: this.buildScrollY };
    });
    dragZone.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (!this.buildDragStart || !this.buildListContainer) {
        return;
      }
      const delta = pointer.y - this.buildDragStart.pointerY;
      this.buildScrollY = Phaser.Math.Clamp(this.buildDragStart.scrollY - delta, 0, this.buildMaxScroll);
      this.buildListContainer.y = -this.buildScrollY;
    });
    dragZone.on('dragend', () => {
      this.buildDragStart = undefined;
    });
    this.modalLayer.add(dragZone);

    const upgradeOptions = getUpgradeOptions(this.state, land);
    const options = getBuildOptions(this.state, land);
    this.buildListContainer = this.add.container(0, 0);
    this.modalLayer.add(this.buildListContainer);
    const buildRows: Phaser.GameObjects.Container[] = [];

    upgradeOptions.forEach((option, index) => {
      const y = 264 + index * 142;
      const card = createPanel(this, 35, y - 32, 320, 112, {
        border: option.canUpgrade ? 0xffde72 : 0x9b7860,
        borderAlpha: option.canUpgrade ? 0.95 : 0.6,
      });
      const cost = formatCost(option.cost);
      const label = `${BUILDING_LABELS[option.type].replace('Build ', '')} - Level ${option.level}/${option.maxLevel}`;
      const atMax = option.level >= option.maxLevel;
      const costLine = atMax ? 'Maximum level reached.' : `Upgrade cost: ${cost}`;
      const detail = !atMax && !option.canUpgrade ? option.reason ?? 'Unavailable' : '';
      const row = this.add.container(0, 0, [
        card,
        createLabel(this, 55, y - 22, label, 'label', { fontSize: '18px' }),
        createLabel(this, 55, y - 2, costLine, 'caption', { fontSize: '12px', wordWrap: { width: 182 } }),
        createLabel(this, 55, y + 24, detail, 'body', { fontSize: '12px', wordWrap: { width: 182 } }),
        createWoodButton(this, 292, y + 16, 92, 38, atMax ? 'Max' : option.canUpgrade ? 'Upgrade' : 'Why?', () => {
          if (option.canUpgrade) {
            this.events.emit('ui:land-action', `upgrade:${option.index}`, land.id);
          } else if (!atMax) {
            this.state.message = option.reason ?? 'That building cannot be upgraded right now.';
          }
          this.refresh();
        }, { variant: option.canUpgrade ? 'highlight' : 'dark', fontSize: '12px' }),
      ]);
      this.buildListContainer?.add(row);
      buildRows.push(row);
    });

    const upgradeBlockHeight = upgradeOptions.length > 0 ? upgradeOptions.length * 142 : 0;

    options.forEach((option, index) => {
      const y = 264 + upgradeBlockHeight + index * 142;
      const card = createPanel(this, 35, y - 32, 320, 112, {
        border: option.canBuild ? 0xffde72 : 0x9b7860,
        borderAlpha: option.canBuild ? 0.95 : 0.6,
      });
      const cost = formatCost(option.cost);
      const detail = option.canBuild ? buildDescription(option.type, land) : option.reason ?? 'Unavailable';
      const row = this.add.container(0, 0, [
        card,
        createLabel(this, 55, y - 22, option.label.replace('Build ', ''), 'label', { fontSize: '18px' }),
        createLabel(this, 55, y - 4, `Cost: ${cost}`, 'caption', { fontSize: '12px', wordWrap: { width: 182 } }),
        createLabel(this, 55, y + 24, detail, 'body', { fontSize: '12px', wordWrap: { width: 182 } }),
        createWoodButton(this, 292, y + 16, 92, 38, option.canBuild ? 'Build' : 'Why?', () => {
          if (option.canBuild) {
            this.events.emit('ui:land-action', `build:${option.type}`, land.id);
          } else {
            this.state.message = option.reason ?? 'That structure is not available here.';
          }
          this.refresh();
        }, { variant: option.canBuild ? 'highlight' : 'dark', fontSize: '12px' }),
      ]);
      this.buildListContainer?.add(row);
      buildRows.push(row);
    });

    const totalCards = upgradeOptions.length + options.length;
    const contentHeight = totalCards > 0 ? 112 + (totalCards - 1) * 142 : 0;
    this.buildMaxScroll = Math.max(0, contentHeight - BUILD_LIST_HEIGHT);
    this.buildScrollY = Phaser.Math.Clamp(this.buildScrollY, 0, this.buildMaxScroll);
    this.buildListContainer.y = -this.buildScrollY;

    const maskShape = this.make.graphics({}, false);
    maskShape.fillRect(0, BUILD_LIST_TOP, GAME_WIDTH, BUILD_LIST_HEIGHT);
    this.buildListContainer.setMask(maskShape.createGeometryMask());

    if (this.modalJustOpened) {
      staggerIn(this, buildRows);
    }
  }

  private handleBuildListWheel(pointer: Phaser.Input.Pointer, deltaY: number): void {
    if (this.modalScreen !== 'build' || !this.buildListContainer) {
      return;
    }

    if (pointer.y < BUILD_LIST_TOP || pointer.y > BUILD_LIST_TOP + BUILD_LIST_HEIGHT) {
      return;
    }

    this.buildScrollY = Phaser.Math.Clamp(this.buildScrollY + deltaY, 0, this.buildMaxScroll);
    this.buildListContainer.y = -this.buildScrollY;
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

    const bodyText = result.victory
      ? `${armyName} broke the defenses of ${landName}.\n\nYour power: ${result.attackerPower}\nEnemy power: ${result.defenderPower}\n\nThe army now besieges the district. It will fall in ${result.siegeTicks} economy ${result.siegeTicks === 1 ? 'tick' : 'ticks'}.`
      : `${armyName} was repelled at ${landName}.\n\nYour power: ${result.attackerPower}\nEnemy power: ${result.defenderPower}\n\nThe army falls back to recover.`;

    this.modalLayer.add(
      createLabel(this, GAME_WIDTH / 2, 210, bodyText, 'body', {
        fontSize: '14px',
        lineSpacing: 6,
        align: 'center',
        wordWrap: { width: 300 },
      }).setOrigin(0.5, 0),
    );

    if (result.victory) {
      this.modalLayer.add(
        createWoodButton(this, GAME_WIDTH / 2 - 85, GAME_HEIGHT - 120, 150, 40, 'Retreat', () => {
          this.events.emit('ui:retreat-siege', result.attackerArmyId, result.targetLandId);
          this.closeModal();
        }, { variant: 'dark' }),
      );
      this.modalLayer.add(
        createWoodButton(this, GAME_WIDTH / 2 + 85, GAME_HEIGHT - 120, 150, 40, 'Continue', () => this.closeModal(), {
          variant: 'highlight',
        }),
      );
    } else {
      this.modalLayer.add(
        createWoodButton(this, GAME_WIDTH / 2 - 75, GAME_HEIGHT - 120, 150, 40, 'Continue', () => this.closeModal(), {
          variant: 'highlight',
        }),
      );
    }
  }

  private showPoliticsScreen(card: PoliticsCard): void {
    this.addModalBase('Court Request', 'Read the request and choose a response. Gameplay is paused.');
    const eventCard = createPanel(this, GAME_WIDTH / 2 - 157, 145, 314, 460, { borderWidth: 4 });
    this.modalLayer.add([
      eventCard,
      createLabel(this, GAME_WIDTH / 2, 174, card.title, 'label', {
        fontSize: '22px',
        align: 'center',
        wordWrap: { width: 268 },
      }).setOrigin(0.5),
      createLabel(this, GAME_WIDTH / 2, 238, card.description, 'body', {
        fontSize: '15px',
        align: 'center',
        wordWrap: { width: 266 },
      }).setOrigin(0.5, 0),
    ]);

    card.choices.forEach((choice, index) => {
      const y = 420 + index * 100;
      this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2, y, 268, 58, choice.label, () => {
        this.events.emit('ui:politics-choice', choice.id);
        this.closeModal();
      }, { variant: index === 0 ? 'dark' : 'wood' }));
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, y + 36, choice.description, 'body', {
        color: '#2a1403',
        fontSize: '11px',
        align: 'center',
        wordWrap: { width: 236 },
      }).setOrigin(0.5, 0));
    });
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
    const badgeY = HEADER_HEIGHT + 24;
    const badge = this.add
      .rectangle(GAME_WIDTH - 58, badgeY, 92, 36, 0xffde72, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(430);
    badge.setStrokeStyle(3, 0x9b7860, 0.96);
    const text = this.add.text(GAME_WIDTH - 58, badgeY, 'Court !', {
      color: COLORS.darkText,
      fontSize: '13px',
      fontStyle: '700',
    }).setOrigin(0.5).setDepth(431);
    const hint = this.add.text(GAME_WIDTH - 104, badgeY + 22, card.title, {
      color: '#2a1403',
      fontSize: '10px',
      wordWrap: { width: 142 },
    }).setDepth(431);
    badge.on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.openModal('request');
    });
    this.requestBadge = [badge, text, hint];
  }

  private clearRequestBadge(): void {
    for (const item of this.requestBadge) {
      item.destroy();
    }
    this.requestBadge = [];
  }

  private renderMapControls(): void {
    const hasBottomSheet = Boolean(this.state.selectedLandId || this.state.latestBattlePreview);
    const bottomAnchor = hasBottomSheet ? SHEET_TOP - 10 : GAME_HEIGHT - 54;
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
    g.fillStyle(0xf3e6c4, 0.96);
    g.fillRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(2, 0x7a1f1f, 0.92);
    g.strokeRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(3, 0x211103, 0.9);

    if (icon === 'zoom-in' || icon === 'zoom-out') {
      g.lineBetween(-8, 0, 8, 0);
      if (icon === 'zoom-in') {
        g.lineBetween(0, -8, 0, 8);
      }
    } else if (this.state.mapRenderMode === 'terrain') {
      g.fillStyle(0x8d8a86, 0.95);
      g.fillTriangle(-10, 8, 0, -9, 10, 8);
      g.fillStyle(0x5bb6d6, 0.9);
      g.fillRect(-10, 9, 20, 3);
    } else {
      g.fillStyle(0x55c878, 0.95);
      g.fillRect(-10, -9, 9, 18);
      g.fillStyle(0xb85b53, 0.95);
      g.fillRect(1, -9, 9, 18);
      g.lineStyle(2, 0x211103, 0.82);
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
    this.buildScrollY = 0;
    this.openModal('build');
  }

  private pickDefaultLeader(): Hero | undefined {
    return (
      this.state.heroes.find((hero) => hero.type === 'general' && !hero.assignedTo) ??
      this.state.heroes.find((hero) => !hero.assignedTo)
    );
  }

  private showVictory(): void {
    this.modalScreen = 'none';
    this.state.isPaused = true;
    this.modalLayer.removeAll(true);
    this.modalLayer.setVisible(false);
    this.bottomSheet.show([
      createLabel(this, 16, SHEET_TOP + 26, 'Victory', 'title'),
      createLabel(
        this,
        16,
        SHEET_TOP + 66,
        'All rival castles have fallen. The mandate belongs to Đại Việt.',
        'subtitle',
        { fontSize: '15px', wordWrap: { width: 350 } },
      ),
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
