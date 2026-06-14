import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, COLORS, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, PLAYER_KINGDOM_ID } from '../game/constants';
import { TouchController } from '../input/TouchController';
import { createInitialGameState } from '../state/GameState';
import { acquireLand, findLand, getAcquisitionOrder, getNearestPlayerArmy } from '../systems/LandSystem';
import { advanceRealtimeMonth } from '../systems/RealtimeSystem';
import { buildDistrictBuilding } from '../systems/ResourceSystem';
import { createBattlePreview, createPlayerArmy, moveArmy, attackLand } from '../systems/WarSystem';
import type { GameState, Land, LandBuildingType } from '../state/types';
import type { HexTile } from '../map/hexMapGenerator';
import { MAP_SCALE, axialToPixel, hexCorners, hexKey, pixelToAxial } from '../map/hex';
import { computeTerrainRegions } from '../map/boundary';
import { createRng } from '../map/random';
import { TERRAIN_REGISTRY } from '../map/terrainTypes';
import { recruitHero } from '../systems/HeroSystem';
import { choosePoliticsCard } from '../systems/PoliticsSystem';
import { SHEET_TOP } from '../ui/BottomSheet';
import { InkMapRenderer } from '../ui/MapRenderer';
import { InkMapItemRenderer } from '../ui/MapItemRenderer';
import { OverlayRenderer } from './map/OverlayRenderer';
import { SettlementRenderer } from './map/SettlementRenderer';
import { TrafficRenderer } from './map/TrafficRenderer';

const MIN_CAMERA_ZOOM = 0.72;
const MAX_CAMERA_ZOOM = 1.65;
const CAMERA_ZOOM_STEP = 0.16;
const REALTIME_TICK_MS = 5500;

export class MapScene extends Phaser.Scene {
  private state!: GameState;
  private touch!: TouchController;
  private landNodes = new Map<string, Phaser.GameObjects.Container>();
  private armyMarkers: Phaser.GameObjects.GameObject[] = [];
  private acquisitionMarkers: Phaser.GameObjects.GameObject[] = [];
  private buildMarkers: Phaser.GameObjects.GameObject[] = [];
  private mapGraphics!: Phaser.GameObjects.Graphics;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private terrainDecorationGraphics!: Phaser.GameObjects.Graphics;
  private controlGraphics!: Phaser.GameObjects.Graphics;
  private inkMap!: InkMapRenderer;
  private inkItems!: InkMapItemRenderer;
  private settlements!: SettlementRenderer;
  private traffic!: TrafficRenderer;
  private overlays!: OverlayRenderer;
  private hexTileMap = new Map<string, HexTile>();
  private hexOffsetX = 0;
  private hexOffsetY = 0;
  private worldWidth = 0;
  private worldHeight = 0;
  private realtimeAccumulator = 0;
  private isDraggingMap = false;
  private dragDistance = 0;
  private domDown?: { x: number; y: number };
  private domDragDistance = 0;
  private readonly domPointerDown = (event: PointerEvent): void => {
    this.handleDomDown(event);
  };
  private readonly domPointerMove = (event: PointerEvent): void => {
    this.handleDomMove(event);
  };
  private readonly domPointerUp = (event: PointerEvent): void => {
    this.handleDomUp(event);
  };
  private readonly domMouseDown = (event: MouseEvent): void => {
    this.handleDomDown(event);
  };
  private readonly domMouseMove = (event: MouseEvent): void => {
    this.handleDomMove(event);
  };
  private readonly domMouseUp = (event: MouseEvent): void => {
    this.handleDomUp(event);
  };

  private handleDomDown(event: PointerEvent | MouseEvent): void {
    const point = this.toGamePoint(event);
    if (!point || this.isScreenPointOverFixedUi(point.x, point.y)) {
      this.domDown = undefined;
      return;
    }

    this.domDown = point;
    this.domDragDistance = 0;
  }

  private handleDomMove(event: PointerEvent | MouseEvent): void {
    const point = this.toGamePoint(event);
    if (!point || !this.domDown) {
      return;
    }

    this.domDragDistance = Math.abs(point.x - this.domDown.x) + Math.abs(point.y - this.domDown.y);
  }

  private handleDomUp(event: PointerEvent | MouseEvent): void {
    const point = this.toGamePoint(event);
    if (!point || !this.domDown || this.domDragDistance > 14 || this.isScreenPointOverFixedUi(point.x, point.y)) {
      this.domDown = undefined;
      return;
    }

    const landId = this.findLandIdAt(
      this.cameras.main.scrollX + point.x / this.cameras.main.zoom,
      this.cameras.main.scrollY + point.y / this.cameras.main.zoom,
    );
    if (landId) {
      this.selectLand(landId);
    }
    this.domDown = undefined;
  }

  constructor() {
    super('MapScene');
  }

  create(): void {
    this.state = createInitialGameState();
    window.__mandateState = this.state;
    this.registry.set('gameState', this.state);
    this.inkMap = new InkMapRenderer(this);
    this.inkItems = new InkMapItemRenderer(this);
    this.settlements = new SettlementRenderer(this, this.inkItems);
    this.traffic = new TrafficRenderer(this, this.inkMap, this.inkItems);
    this.overlays = new OverlayRenderer(this, this.inkMap);
    this.computeWorldBounds();
    this.touch = new TouchController(this);
    this.touch.enableFullscreenKey();
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.centerCameraOnPlayerStart();
    this.enableMapDrag();
    this.game.canvas.addEventListener('pointerdown', this.domPointerDown);
    this.game.canvas.addEventListener('pointermove', this.domPointerMove);
    this.game.canvas.addEventListener('pointerup', this.domPointerUp);
    this.game.canvas.addEventListener('mousedown', this.domMouseDown);
    this.game.canvas.addEventListener('mousemove', this.domMouseMove);
    this.game.canvas.addEventListener('mouseup', this.domMouseUp);

    this.drawMap();
    this.scene.launch('UIScene', { state: this.state });
    this.scene.bringToTop('UIScene');
    this.registerUiEvents();
    this.events.emit('state-changed');
  }

  shutdown(): void {
    this.game.canvas.removeEventListener('pointerdown', this.domPointerDown);
    this.game.canvas.removeEventListener('pointermove', this.domPointerMove);
    this.game.canvas.removeEventListener('pointerup', this.domPointerUp);
    this.game.canvas.removeEventListener('mousedown', this.domMouseDown);
    this.game.canvas.removeEventListener('mousemove', this.domMouseMove);
    this.game.canvas.removeEventListener('mouseup', this.domMouseUp);
  }

  private registerUiEvents(): void {
    const ui = this.scene.get('UIScene');
    ui.events.on('ui:land-action', (action: string, landId: string) => {
      this.handleLandAction(action, landId);
    });
    ui.events.on('ui:hero-pick', (heroId: string) => {
      recruitHero(this.state, heroId);
      this.refresh();
    });
    ui.events.on('ui:politics-choice', (choiceId: string) => {
      choosePoliticsCard(this.state, choiceId);
      this.refresh();
    });
    ui.events.on('ui:attack-land', (armyId: string, landId: string) => {
      attackLand(this.state, armyId, landId);
      this.refresh();
    });
    ui.events.on('ui:create-army', (heroId: string | undefined, soldiers: number) => {
      createPlayerArmy(this.state, heroId, soldiers);
      this.refresh();
    });
    ui.events.on('ui:zoom-map', (direction: number) => {
      this.zoomMap(direction);
    });
    ui.events.on('ui:toggle-render-mode', () => {
      this.state.mapRenderMode = this.state.mapRenderMode === 'terrain' ? 'control' : 'terrain';
      this.applyRenderMode();
      this.scene.get('UIScene').events.emit('state-changed');
    });
  }

  update(_time: number, delta: number): void {
    if (this.state.victory || this.state.isPaused) {
      return;
    }

    this.state.realtimeSeconds += delta / 1000;
    this.realtimeAccumulator += delta;

    if (this.realtimeAccumulator >= REALTIME_TICK_MS) {
      this.realtimeAccumulator = 0;
      advanceRealtimeMonth(this.state);
      this.refresh();
    }
  }

  private enableMapDrag(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerOverFixedUi(pointer)) {
        return;
      }

      this.isDraggingMap = false;
      this.dragDistance = 0;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.isPointerOverFixedUi(pointer)) {
        return;
      }

      const deltaX = (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
      const deltaY = (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
      this.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
      if (this.dragDistance > 40) {
        this.isDraggingMap = true;
      }

      this.cameras.main.scrollX = Phaser.Math.Clamp(
        this.cameras.main.scrollX - deltaX,
        0,
        Math.max(0, this.worldWidth - GAME_WIDTH / this.cameras.main.zoom),
      );
      this.cameras.main.scrollY = Phaser.Math.Clamp(
        this.cameras.main.scrollY - deltaY,
        0,
        Math.max(0, this.worldHeight - GAME_HEIGHT / this.cameras.main.zoom),
      );
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerOverFixedUi(pointer)) {
        return;
      }

      if (!this.isDraggingMap && this.dragDistance < 12) {
        const landId = this.findLandIdAt(pointer.worldX, pointer.worldY);
        if (landId) {
          this.selectLand(landId);
        }
      }

      this.time.delayedCall(60, () => {
        this.isDraggingMap = false;
        this.dragDistance = 0;
      });
    });
  }

  private handleLandAction(action: string, landId: string): void {
    if (action === 'acquire') {
      acquireLand(this.state, landId);
    }

    if (action.startsWith('build:')) {
      buildDistrictBuilding(this.state, landId, action.replace('build:', '') as LandBuildingType);
    }

    if (action === 'move') {
      const army = getNearestPlayerArmy(this.state, landId);
      if (army) {
        this.state.awaitingMoveArmyId = army.id;
        this.state.message = `Select an adjacent land for ${army.name}.`;
      } else {
        this.state.message = 'No player army is adjacent to that land.';
      }
    }

    if (action === 'preview') {
      const army = getNearestPlayerArmy(this.state, landId);
      if (army) {
        this.state.latestBattlePreview = createBattlePreview(this.state, army.id, landId);
      } else {
        this.state.message = 'Move an army next to this land before attacking.';
      }
    }

    this.refresh();
  }

  /** Pixel bounds (pre-MAP_SCALE) of the generated hex grid, used to offset world coordinates. */
  private computeWorldBounds(): void {
    const hexSize = this.state.mapConfig.hexSize;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const tile of this.state.hexTiles) {
      this.hexTileMap.set(hexKey(tile.coord), tile);
      const pixel = axialToPixel(tile.coord, hexSize);
      minX = Math.min(minX, pixel.x);
      maxX = Math.max(maxX, pixel.x);
      minY = Math.min(minY, pixel.y);
      maxY = Math.max(maxY, pixel.y);
    }

    this.hexOffsetX = minX - hexSize;
    this.hexOffsetY = minY - hexSize;
    this.worldWidth = Math.round((maxX - minX + hexSize * 2) * MAP_SCALE);
    this.worldHeight = Math.round((maxY - minY + hexSize * 2) * MAP_SCALE);
  }

  private drawMap(): void {
    this.drawPaperBackground();
    this.drawHexTerrain();
    this.drawControlMap();
    this.drawZoneOverlays();
    this.overlays.createSelectionLayer();
    this.drawConnections();
    this.drawCarts();
    this.drawTravelers();

    for (const land of this.state.lands) {
      this.createLandNode(land);
    }

    this.drawArmies();
    this.drawFogOfWar();
    this.drawAcquisitionMarkers();
    this.drawBuildMarkers();
  }

  private drawPaperBackground(): void {
    this.mapGraphics = this.inkMap.drawBackground(this.worldWidth, this.worldHeight);
  }

  /** Renders every hex tile as a continuous terrain texture, behind the zone color overlays. */
  private drawHexTerrain(): void {
    const graphics = this.add.graphics();
    this.terrainGraphics = graphics;
    const hexSize = this.state.mapConfig.hexSize;
    const rng = createRng(this.state.mapConfig.seed + 9001);

    for (const tile of this.state.hexTiles) {
      const pixel = axialToPixel(tile.coord, hexSize);
      const center = { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      // Tiles overlap their edges very slightly so the landmass reads as one continuous
      // ink-wash field rather than a grid of separate hexes with visible seams.
      const corners = hexCorners(center, hexSize * MAP_SCALE * 1.02).map(([x, y]) => ({ x, y }));

      this.inkMap.drawHexFill(graphics, corners, TERRAIN_REGISTRY[tile.terrain].color);
    }

    // Decorations live on their own layer, above the zone borders, so painted scenery
    // (mountains, forests, etc.) draws in front of border ink strokes rather than behind them.
    const decorationGraphics = this.add.graphics();
    decorationGraphics.setDepth(1);
    this.terrainDecorationGraphics = decorationGraphics;

    for (const group of computeTerrainRegions(this.state, this.hexTileMap)) {
      const terrain = TERRAIN_REGISTRY[group[0].terrain];
      const centers = group.map((tile) => {
        const pixel = axialToPixel(tile.coord, hexSize);
        return { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      });

      if (terrain.decorateRegion) {
        terrain.decorateRegion(decorationGraphics, centers, hexSize * MAP_SCALE, rng);
      } else if (terrain.decorate) {
        for (const center of centers) {
          terrain.decorate(decorationGraphics, center, hexSize * MAP_SCALE, rng);
        }
      }
    }
  }

  private drawControlMap(): void {
    this.controlGraphics = this.add.graphics();
    this.repaintControlMap();
    this.applyRenderMode();
  }

  private repaintControlMap(): void {
    if (!this.controlGraphics) {
      return;
    }

    this.controlGraphics.clear();
    const hexSize = this.state.mapConfig.hexSize;
    for (const tile of this.state.hexTiles) {
      const land = tile.landId ? findLand(this.state, tile.landId) : undefined;
      const pixel = axialToPixel(tile.coord, hexSize);
      const center = { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      const corners = hexCorners(center, hexSize * MAP_SCALE * 1.02).map(([x, y]) => ({ x, y }));
      const color = land?.isVisible ? this.getOwnerColor(land.ownerId) : COLORS.neutral;
      this.controlGraphics.fillStyle(color, 1);
      this.controlGraphics.fillPoints(corners, true);
    }
  }

  private applyRenderMode(): void {
    this.mapGraphics?.setVisible(this.state.mapRenderMode === 'terrain');
    this.terrainGraphics?.setVisible(this.state.mapRenderMode === 'terrain');
    this.terrainDecorationGraphics?.setVisible(this.state.mapRenderMode === 'terrain');
    this.controlGraphics?.setVisible(this.state.mapRenderMode === 'control');
  }

  private drawFogOfWar(): void {
    this.overlays.createFogLayer(this.state, this.hexTileMap, (value) => this.wx(value), (value) => this.wy(value));
  }

  private repaintFogOfWar(): void {
    this.overlays.repaintFogOfWar(this.state, this.hexTileMap, (value) => this.wx(value), (value) => this.wy(value));
  }

  /** Outlines each land's merged hex region in its owner's color (terrain fill stays untinted). */
  private drawZoneOverlays(): void {
    this.overlays.createZoneLayers(
      this.state,
      this.hexTileMap,
      (value) => this.wx(value),
      (value) => this.wy(value),
      (ownerId) => this.getOwnerColor(ownerId),
    );
  }

  private repaintAllZones(): void {
    this.overlays.repaintAllZones(
      this.state,
      this.hexTileMap,
      (value) => this.wx(value),
      (value) => this.wy(value),
      (ownerId) => this.getOwnerColor(ownerId),
    );
  }

  /** Strokes the outer boundary of the selected land's merged hex region. */
  private updateSelectionOutline(): void {
    this.overlays.updateSelectionOutline(this.state, this.hexTileMap, (value) => this.wx(value), (value) => this.wy(value));
  }

  /** Draws dirt roads connecting each land's settlement (village/city/castle/mine) to its neighbors. */
  private drawConnections(): void {
    this.traffic.drawConnections(this.state, (value) => this.wx(value), (value) => this.wy(value), (land) => this.getSettlementAnchor(land));
  }

  /** Pixel position of a land's settlement (its city/shrine cluster, or its centroid for villages/mines). */
  private getSettlementAnchor(land: Land): { x: number; y: number } {
    return this.getCityCenter(land) ?? { x: land.x, y: land.y };
  }

  /** Animated ox-carts shuttling along roads between farms and the cities they're connected to. */
  private drawCarts(): void {
    this.traffic.drawCarts(
      this.state,
      (value) => this.wx(value),
      (value) => this.wy(value),
      (land) => this.getSettlementAnchor(land),
      (land) => this.getCityCenter(land),
    );
  }

  /** Slow-walking ink travelers wandering every road between connected settlements, for a livelier map. */
  private drawTravelers(): void {
    this.traffic.drawTravelers(this.state, (value) => this.wx(value), (value) => this.wy(value), (land) => this.getSettlementAnchor(land));
  }

  private createLandNode(land: Land): void {
    if (!land.isVisible) {
      return;
    }

    const container = this.add.container(this.wx(land.x), this.wy(land.y));
    const settlement = this.settlements.createSettlementCluster(this.state, land);
    const label = this.add.text(0, 15, this.shortName(land), {
      color: '#211103',
      fontSize: '10px',
      align: 'center',
      fontStyle: '700',
      wordWrap: { width: 88 },
    }).setOrigin(0.5, 0);
    container.add([settlement, label]);
    this.landNodes.set(land.id, container);
  }

  /** Average pixel position of a land's city/shrine hexes, or undefined if it has none. */
  private getCityCenter(land: Land): { x: number; y: number } | undefined {
    return this.settlements.getCityCenter(this.state, land);
  }

  private selectLand(landId: string): void {
    if (this.isDraggingMap || this.state.isPaused) {
      return;
    }

    const selected = findLand(this.state, landId);
    if (!selected?.isVisible) {
      this.state.selectedLandId = undefined;
      this.state.latestBattlePreview = undefined;
      this.state.message = 'This district is beyond your scouts. Expand to its border to reveal it.';
      this.refresh();
      return;
    }

    if (this.state.awaitingMoveArmyId) {
      const army = this.state.armies.find((candidate) => candidate.id === this.state.awaitingMoveArmyId);
      const fromLand = army ? findLand(this.state, army.landId) : undefined;
      const moved = moveArmy(this.state, this.state.awaitingMoveArmyId, landId);
      const toLand = findLand(this.state, landId);
      if (moved && fromLand && toLand) {
        this.animateSoldierColumn(
          this.wx(fromLand.x),
          this.wy(fromLand.y),
          this.wx(toLand.x),
          this.wy(toLand.y),
          army?.kingdomId === PLAYER_KINGDOM_ID,
        );
      }
    }

    this.state.selectedLandId = landId;
    this.refresh();
  }

  private drawArmies(): void {
    for (const marker of this.armyMarkers) {
      marker.destroy();
    }
    this.armyMarkers = [];

    for (const army of this.state.armies) {
      const land = findLand(this.state, army.landId);
      if (!land?.isVisible) {
        continue;
      }

      const center = this.getCityCenter(land) ?? { x: land.x, y: land.y };
      const total = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
      const isPlayer = army.kingdomId === PLAYER_KINGDOM_ID;
      const marker = this.inkItems.createArmyMarker(this.wx(center.x) + 18, this.wy(center.y) - 28, total, isPlayer);
      this.armyMarkers.push(marker);
    }
  }

  private drawAcquisitionMarkers(): void {
    for (const marker of this.acquisitionMarkers) {
      marker.destroy();
    }
    this.acquisitionMarkers = [];

    for (const order of this.state.acquisitionOrders) {
      const land = findLand(this.state, order.landId);
      if (!land?.isVisible) {
        continue;
      }

      const { x, y } = this.getVisibleLandMarkerPoint(land);
      const marker = this.inkItems.createProgressBadge(x, y, order.progress, order.required, 'acquisition');
      marker.setDepth(72);
      this.acquisitionMarkers.push(marker);
    }
  }

  /** Shows a hammer-and-progress badge over any district with construction underway. */
  private drawBuildMarkers(): void {
    for (const marker of this.buildMarkers) {
      marker.destroy();
    }
    this.buildMarkers = [];

    for (const order of this.state.buildOrders) {
      const land = findLand(this.state, order.landId);
      if (!land?.isVisible) {
        continue;
      }

      const { x, y } = this.getVisibleLandMarkerPoint(land);
      const marker = this.inkItems.createProgressBadge(x, y, order.progress, order.required, 'build');
      marker.setDepth(72);
      this.buildMarkers.push(marker);
    }
  }

  private getVisibleLandMarkerPoint(land: Land): { x: number; y: number } {
    const camera = this.cameras.main;
    const hexSize = this.state.mapConfig.hexSize;
    const bottomSheetTop = GAME_HEIGHT - ACTION_BAR_HEIGHT - 250;
    const maxScreenY = land.id === this.state.selectedLandId ? bottomSheetTop - 42 : GAME_HEIGHT - ACTION_BAR_HEIGHT - 28;
    const visibleCenters: Array<{ x: number; y: number }> = [];

    for (const tile of this.state.hexTiles) {
      if (tile.landId !== land.id) {
        continue;
      }

      const pixel = axialToPixel(tile.coord, hexSize);
      const worldX = this.wx(pixel.x);
      const worldY = this.wy(pixel.y);
      const screenX = (worldX - camera.scrollX) * camera.zoom;
      const screenY = (worldY - camera.scrollY) * camera.zoom;
      if (screenX < 24 || screenX > GAME_WIDTH - 76 || screenY < HEADER_HEIGHT + 36 || screenY > maxScreenY) {
        continue;
      }
      visibleCenters.push({ x: worldX, y: worldY });
    }

    if (visibleCenters.length > 0) {
      const sum = visibleCenters.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
      return { x: sum.x / visibleCenters.length, y: sum.y / visibleCenters.length };
    }

    const fallbackScreenX = Phaser.Math.Clamp((this.wx(land.x) - camera.scrollX) * camera.zoom, 34, GAME_WIDTH - 86);
    const fallbackScreenY = Phaser.Math.Clamp((this.wy(land.y) - camera.scrollY) * camera.zoom, HEADER_HEIGHT + 46, maxScreenY);
    return {
      x: camera.scrollX + fallbackScreenX / camera.zoom,
      y: camera.scrollY + fallbackScreenY / camera.zoom,
    };
  }

  private animateSoldierColumn(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    isPlayer = true,
  ): void {
    const color = isPlayer ? 0x0b5f39 : 0x7d2d2d;
    const route = this.add.graphics();
    route.setDepth(68);
    route.lineStyle(5, 0xffde72, 0.75);
    route.lineBetween(fromX, fromY, toX, toY);
    this.tweens.add({
      targets: route,
      alpha: 0,
      duration: 1400,
      onComplete: () => route.destroy(),
    });

    for (let index = 0; index < 42; index += 1) {
      const lane = (index % 7) * 4 - 12;
      const rank = Math.floor(index / 7) * 4 - 10;
      const startT = Math.min(0.72, index / 58);
      const endT = Math.min(1, startT + 0.42);
      const startX = Phaser.Math.Linear(fromX, toX, startT) + lane;
      const startY = Phaser.Math.Linear(fromY, toY, startT) + rank;
      const endX = Phaser.Math.Linear(fromX, toX, endT) + lane;
      const endY = Phaser.Math.Linear(fromY, toY, endT) + rank;
      const soldier = this.add.container(startX, startY);
      soldier.setDepth(70);
      soldier.add(this.add.circle(0, 2, 2.8, color, 0.95));
      soldier.add(this.add.circle(0, -2, 1.8, 0xf1d1a8, 0.95));
      this.tweens.add({
        targets: soldier,
        x: endX,
        y: endY,
        alpha: { from: 1, to: 0.15 },
        duration: 980,
        delay: (index % 7) * 25,
        ease: 'Sine.easeInOut',
        onComplete: () => soldier.destroy(),
      });
    }
  }

  private refresh(): void {
    this.repaintControlMap();
    this.applyRenderMode();
    this.repaintFogOfWar();
    this.repaintAllZones();
    this.updateSelectionOutline();
    this.redrawLandNodes();
    this.drawArmies();
    this.drawAcquisitionMarkers();
    this.drawBuildMarkers();
    this.events.emit('state-changed');
    this.scene.get('UIScene').events.emit('state-changed');
  }

  private redrawLandNodes(): void {
    for (const node of this.landNodes.values()) {
      node.destroy(true);
    }
    this.landNodes.clear();

    for (const land of this.state.lands) {
      this.createLandNode(land);
    }
  }

  private getOwnerColor(ownerId: string): number {
    if (ownerId === 'neutral') {
      return COLORS.neutral;
    }

    return this.state.kingdoms.find((kingdom) => kingdom.id === ownerId)?.color ?? COLORS.neutral;
  }

  private wx(value: number): number {
    return (value - this.hexOffsetX) * MAP_SCALE;
  }

  private wy(value: number): number {
    return (value - this.hexOffsetY) * MAP_SCALE;
  }

  private isPointerOverFixedUi(pointer: Phaser.Input.Pointer): boolean {
    return this.isScreenPointOverFixedUi(pointer.x, pointer.y);
  }

  private isScreenPointOverFixedUi(x: number, y: number): boolean {
    return (
      this.state.isPaused ||
      performance.now() < (window.__suppressMapInputUntil ?? 0) ||
      y < HEADER_HEIGHT ||
      (Boolean(this.state.selectedLandId || this.state.latestBattlePreview) &&
        y >= SHEET_TOP &&
        y <= GAME_HEIGHT - ACTION_BAR_HEIGHT) ||
      (x > GAME_WIDTH - 74 &&
        ((y > GAME_HEIGHT - ACTION_BAR_HEIGHT - 150 && y < GAME_HEIGHT - ACTION_BAR_HEIGHT) ||
          (y > GAME_HEIGHT - ACTION_BAR_HEIGHT - 386 && y < GAME_HEIGHT - ACTION_BAR_HEIGHT - 236))) ||
      y > GAME_HEIGHT - ACTION_BAR_HEIGHT
    );
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

  private findLandIdAt(worldX: number, worldY: number): string | undefined {
    const hexSize = this.state.mapConfig.hexSize;
    const rawX = worldX / MAP_SCALE + this.hexOffsetX;
    const rawY = worldY / MAP_SCALE + this.hexOffsetY;
    const coord = pixelToAxial(rawX, rawY, hexSize);
    return this.hexTileMap.get(hexKey(coord))?.landId;
  }

  private zoomMap(direction: number): void {
    const camera = this.cameras.main;
    const oldZoom = camera.zoom;
    const nextZoom = Phaser.Math.Clamp(oldZoom + direction * CAMERA_ZOOM_STEP, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    if (nextZoom === oldZoom) {
      return;
    }

    const centerWorldX = camera.scrollX + GAME_WIDTH / (2 * oldZoom);
    const centerWorldY = camera.scrollY + GAME_HEIGHT / (2 * oldZoom);
    camera.setZoom(nextZoom);
    camera.scrollX = Phaser.Math.Clamp(centerWorldX - GAME_WIDTH / (2 * nextZoom), 0, Math.max(0, this.worldWidth - GAME_WIDTH / nextZoom));
    camera.scrollY = Phaser.Math.Clamp(centerWorldY - GAME_HEIGHT / (2 * nextZoom), 0, Math.max(0, this.worldHeight - GAME_HEIGHT / nextZoom));
    this.state.message = `Map zoom ${Math.round(nextZoom * 100)}%.`;
    this.scene.get('UIScene').events.emit('state-changed');
  }

  private centerCameraOnPlayerStart(): void {
    const camera = this.cameras.main;
    const startLand = this.state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
    const targetX = startLand ? this.wx(startLand.x) : this.worldWidth / 2;
    const targetY = startLand ? this.wy(startLand.y) : this.worldHeight / 2;

    camera.setScroll(
      Phaser.Math.Clamp(targetX - GAME_WIDTH / 2, 0, Math.max(0, this.worldWidth - GAME_WIDTH)),
      Phaser.Math.Clamp(targetY - GAME_HEIGHT / 2, 0, Math.max(0, this.worldHeight - GAME_HEIGHT)),
    );
  }

  private shortName(land: Land): string {
    return land.name
      .replace(' Enemy Castle', '')
      .replace(' Rice Village', '')
      .replace(' Iron Mountain', '')
      .replace(' Market', '');
  }
}
