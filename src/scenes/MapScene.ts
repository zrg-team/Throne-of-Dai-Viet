import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, COLORS, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, PLAYER_KINGDOM_ID, REALTIME_TICK_MS } from '../game/constants';
import { TouchController } from '../input/TouchController';
import { createInitialGameState } from '../state/GameState';
import { saveSnapshot } from '../state/save';
import { bribeLand, startDiplomaticClaim, startIntimidation, settleLand } from '../systems/AcquisitionSystem';
import { findLand, isAdjacent } from '../systems/LandSystem';
import { advanceRealtimeMonth } from '../systems/RealtimeSystem';
import { buildDistrictBuilding, destroyDistrictBuilding, upgradeDistrictBuilding } from '../systems/ResourceSystem';
import { createBattlePreview, queueRecruitment, issueMoveOrder, attackLand, cancelSiege, disbandArmy } from '../systems/WarSystem';
import type { GameState, Land, LandBuildingType } from '../state/types';
import type { HexTile } from '../map/hexMapGenerator';
import { EDGE_DIRECTIONS, MAP_SCALE, axialToPixel, hexCorners, hexKey, pixelToAxial } from '../map/hex';
import { computeTerrainRegions } from '../map/boundary';
import { createRng } from '../map/random';
import { TERRAIN_REGISTRY } from '../map/terrainTypes';
import { recruitHero } from '../systems/HeroSystem';
import { choosePoliticsCard } from '../systems/PoliticsSystem';
import { SHEET_TOP } from '../ui/BottomSheet';
import { InkMapRenderer } from '../ui/MapRenderer';
import { InkMapItemRenderer } from '../ui/MapItemRenderer';
import { ArmyRenderer } from './map/ArmyRenderer';
import { OverlayRenderer } from './map/OverlayRenderer';
import { SettlementRenderer } from './map/SettlementRenderer';
import { TrafficRenderer } from './map/TrafficRenderer';
import { UI_FONT } from '../ui/fonts';
import { t } from '../i18n';

const MIN_CAMERA_ZOOM = 0.72;
const MAX_CAMERA_ZOOM = 1.65;
const CAMERA_ZOOM_STEP = 0.16;
const WORLD_PADDING = 300;

export class MapScene extends Phaser.Scene {
  private state!: GameState;
  private touch!: TouchController;
  private landNodes = new Map<string, Phaser.GameObjects.Container>();
  private flagMarkers = new Map<string, Phaser.GameObjects.Container>();
  private acquisitionMarkers: Phaser.GameObjects.GameObject[] = [];
  private buildMarkers: Phaser.GameObjects.GameObject[] = [];
  private siegeMarkers: Phaser.GameObjects.GameObject[] = [];
  private recruitMarkers: Phaser.GameObjects.GameObject[] = [];
  private mapGraphics!: Phaser.GameObjects.Graphics;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private terrainDecorationGraphics!: Phaser.GameObjects.Graphics;
  private fillerGraphics?: Phaser.GameObjects.Graphics;
  private fillerDecorationGraphics?: Phaser.GameObjects.Graphics;
  private coastGraphics!: Phaser.GameObjects.Graphics;
  private connectionGraphics?: Phaser.GameObjects.Graphics;
  private fillerFogGraphics?: Phaser.GameObjects.Graphics;
  private controlGraphics!: Phaser.GameObjects.Graphics;
  private inkMap!: InkMapRenderer;
  private inkItems!: InkMapItemRenderer;
  private settlements!: SettlementRenderer;
  private traffic!: TrafficRenderer;
  private overlays!: OverlayRenderer;
  private armies!: ArmyRenderer;
  private hexTileMap = new Map<string, HexTile>();
  private fillerTiles: HexTile[] = [];
  private fillerTileMap = new Map<string, HexTile>();
  private hexOffsetX = 0;
  private hexOffsetY = 0;
  private worldWidth = 0;
  private worldHeight = 0;
  private realtimeAccumulator = 0;
  private isDraggingMap = false;
  private dragDistance = 0;
  private staticRenderSignature = '';
  private suppressNextMapTap = false;
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
    if (this.suppressNextMapTap) {
      this.suppressNextMapTap = false;
      this.domDown = undefined;
      return;
    }

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

  init(data?: { state?: GameState }): void {
    this.state = data?.state ?? createInitialGameState();
    this.resetRuntimeState();
  }

  private resetRuntimeState(): void {
    this.landNodes = new Map<string, Phaser.GameObjects.Container>();
    this.flagMarkers = new Map<string, Phaser.GameObjects.Container>();
    this.acquisitionMarkers = [];
    this.buildMarkers = [];
    this.siegeMarkers = [];
    this.recruitMarkers = [];
    this.fillerGraphics = undefined;
    this.fillerDecorationGraphics = undefined;
    this.fillerFogGraphics = undefined;
    this.connectionGraphics = undefined;
    this.hexTileMap = new Map<string, HexTile>();
    this.fillerTiles = [];
    this.fillerTileMap = new Map<string, HexTile>();
    this.hexOffsetX = 0;
    this.hexOffsetY = 0;
    this.worldWidth = 0;
    this.worldHeight = 0;
    this.realtimeAccumulator = 0;
    this.isDraggingMap = false;
    this.dragDistance = 0;
    this.staticRenderSignature = '';
    this.suppressNextMapTap = false;
    this.domDown = undefined;
    this.domDragDistance = 0;
  }

  create(): void {
    window.__mandateState = this.state;
    this.registry.set('gameState', this.state);
    this.inkMap = new InkMapRenderer(this);
    this.inkItems = new InkMapItemRenderer(this);
    this.settlements = new SettlementRenderer(this, this.inkItems);
    this.traffic = new TrafficRenderer(this, this.inkMap, this.inkItems);
    this.overlays = new OverlayRenderer(this, this.inkMap);
    this.armies = new ArmyRenderer(this, this.inkItems);
    this.computeWorldBounds();
    this.touch = new TouchController(this);
    this.touch.enableFullscreenKey();
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.centerCameraOnPlayerStart();
    this.enableMapDrag();
    this.enableArmyDrag();
    this.game.canvas.addEventListener('pointerdown', this.domPointerDown);
    this.game.canvas.addEventListener('pointermove', this.domPointerMove);
    this.game.canvas.addEventListener('pointerup', this.domPointerUp);
    this.game.canvas.addEventListener('mousedown', this.domMouseDown);
    this.game.canvas.addEventListener('mousemove', this.domMouseMove);
    this.game.canvas.addEventListener('mouseup', this.domMouseUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    this.drawMap();
    this.scene.launch('UIScene', { state: this.state });
    this.scene.bringToTop('UIScene');
    this.registerUiEvents();
    this.events.emit('state-changed');
  }

  shutdown(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.game.canvas.removeEventListener('pointerdown', this.domPointerDown);
    this.game.canvas.removeEventListener('pointermove', this.domPointerMove);
    this.game.canvas.removeEventListener('pointerup', this.domPointerUp);
    this.game.canvas.removeEventListener('mousedown', this.domMouseDown);
    this.game.canvas.removeEventListener('mousemove', this.domMouseMove);
    this.game.canvas.removeEventListener('mouseup', this.domMouseUp);
  }

  private registerUiEvents(): void {
    const ui = this.scene.get('UIScene');
    ui.events.on('ui:land-action', (action: string, landId: string, heroId?: string) => {
      this.handleLandAction(action, landId, heroId);
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
    ui.events.on('ui:retreat-siege', (armyId: string, landId: string) => {
      cancelSiege(this.state, armyId, landId);
      this.refresh();
    });
    ui.events.on('ui:create-army', (heroId: string, soldiers: number, food: number, supplies: number) => {
      queueRecruitment(this.state, heroId, soldiers, food, supplies);
      this.refresh();
    });
    ui.events.on('ui:disband-army', (armyId: string) => {
      disbandArmy(this.state, armyId);
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
    ui.events.on('ui:save-snapshot', () => {
      const snapshot = saveSnapshot(this.state);
      this.state.message = snapshot ? t('msg.snapshotSaved') : t('msg.saveUnavailable');
      this.refresh();
    });
    ui.events.on('ui:exit-to-menu', (saveFirst: boolean) => {
      if (saveFirst) {
        saveSnapshot(this.state);
      }
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
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
      const arrivals = this.state.movementOrders
        .filter((order) => order.progress + 1 >= order.legRequired)
        .map((order) => {
          const army = this.state.armies.find((candidate) => candidate.id === order.armyId);
          return army ? { fromLandId: army.landId, toLandId: order.path[0], isPlayer: army.kingdomId === PLAYER_KINGDOM_ID } : undefined;
        })
        .filter((arrival): arrival is { fromLandId: string; toLandId: string; isPlayer: boolean } => Boolean(arrival));

      advanceRealtimeMonth(this.state);

      for (const arrival of arrivals) {
        const fromLand = findLand(this.state, arrival.fromLandId);
        const toLand = findLand(this.state, arrival.toLandId);
        if (fromLand && toLand) {
          this.animateSoldierColumn(this.wx(fromLand.x), this.wy(fromLand.y), this.wx(toLand.x), this.wy(toLand.y), arrival.isPlayer);
        }
      }

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
      if (this.suppressNextMapTap) {
        this.suppressNextMapTap = false;
        return;
      }

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

  private enableArmyDrag(): void {
    // Army orders are click-to-select, then tap land to move. Map dragging remains
    // owned by `enableMapDrag` even while an army is selected.
  }

  private onArmyPointerDown(
    armyId: string,
    _pointer: Phaser.Input.Pointer,
    event: Phaser.Types.Input.EventData,
  ): void {
    if (this.state.isPaused) {
      return;
    }

    event.stopPropagation();
    this.suppressNextMapTap = true;
    window.__suppressMapInputUntil = performance.now() + 120;

    if (this.state.selectedArmyId === armyId) {
      this.state.selectedArmyId = undefined;
    } else {
      this.state.selectedArmyId = armyId;
      this.isDraggingMap = false;
      this.dragDistance = 0;
      const army = this.state.armies.find((candidate) => candidate.id === armyId);
      this.state.message = army ? t('msg.armySelectedNamed', { army: army.name }) : t('msg.armySelected');
    }

    this.refresh();
  }

  private handleLandAction(action: string, landId: string, heroId?: string): void {
    if (action === 'bribe') {
      bribeLand(this.state, landId);
    }

    if (action === 'diplomatize') {
      startDiplomaticClaim(this.state, landId, heroId);
    }

    if (action === 'intimidate') {
      const army = this.state.armies.find((a) => a.id === this.state.selectedArmyId);
      if (army) {
        startIntimidation(this.state, landId, army.id);
      } else {
        this.state.message = t('msg.selectAdjacentArmy');
      }
    }

    if (action === 'settle') {
      settleLand(this.state, landId);
    }

    if (action.startsWith('build:')) {
      buildDistrictBuilding(this.state, landId, action.replace('build:', '') as LandBuildingType);
    }

    if (action.startsWith('upgrade:')) {
      upgradeDistrictBuilding(this.state, landId, Number(action.slice('upgrade:'.length)));
    }

    if (action.startsWith('destroy:')) {
      destroyDistrictBuilding(this.state, landId, Number(action.slice('destroy:'.length)));
    }

    if (action === 'preview') {
      const army = this.state.armies.find((candidate) => candidate.id === this.state.selectedArmyId);
      if (army && isAdjacent(this.state, army.landId, landId)) {
        this.state.latestBattlePreview = createBattlePreview(this.state, army.id, landId);
      } else {
        this.state.message = t('msg.selectArmyBeforeAttack');
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

    const paddingInMapUnits = WORLD_PADDING / MAP_SCALE;
    this.hexOffsetX = minX - hexSize - paddingInMapUnits;
    this.hexOffsetY = minY - hexSize - paddingInMapUnits;
    this.worldWidth = Math.round((maxX - minX + hexSize * 2) * MAP_SCALE + WORLD_PADDING * 2);
    this.worldHeight = Math.round((maxY - minY + hexSize * 2) * MAP_SCALE + WORLD_PADDING * 2);
  }

  private drawMap(): void {
    this.drawPaperBackground();
    this.drawBackgroundFillerTiles();
    this.drawHexTerrain();
    this.drawCoastBuffer();
    this.drawControlMap();
    this.drawZoneOverlays();
    this.overlays.createSelectionLayer();
    this.drawConnections();
    this.drawCarts();
    this.drawTravelers();

    for (const land of this.state.lands) {
      this.createLandNode(land);
    }
    this.drawFlagMarkers();

    this.drawArmies();
    this.updateArmyHighlight();
    this.drawFogOfWar();
    this.drawFillerFogOfWar();
    this.drawAcquisitionMarkers();
    this.drawBuildMarkers();
    this.drawSiegeMarkers();
    this.drawRecruitMarkers();
    this.staticRenderSignature = this.getStaticRenderSignature();
  }

  private drawPaperBackground(): void {
    this.mapGraphics = this.inkMap.drawBackground(this.worldWidth, this.worldHeight);
  }

  private drawBackgroundFillerTiles(): void {
    this.fillerGraphics ??= this.add.graphics().setDepth(-0.05);
    this.fillerDecorationGraphics ??= this.add.graphics().setDepth(1);
    const graphics = this.fillerGraphics;
    const decorationGraphics = this.fillerDecorationGraphics;
    graphics.clear();
    decorationGraphics.clear();
    const hexSize = this.state.mapConfig.hexSize;
    const padHexes = Math.ceil((WORLD_PADDING / MAP_SCALE) / hexSize) + 4;
    this.fillerTiles = [];
    this.fillerTileMap.clear();

    for (let q = -padHexes; q < this.state.mapConfig.cols + padHexes; q += 1) {
      for (let r = -padHexes; r < this.state.mapConfig.rows + padHexes; r += 1) {
        if (this.hexTileMap.has(hexKey({ q, r }))) {
          continue;
        }
        const coord = { q, r };
        const sourceTile = this.getFillerSourceTile(coord);
        const terrainKey = sourceTile?.terrain ?? 'plains';
        const terrain = TERRAIN_REGISTRY[terrainKey];
        const sourceLand = sourceTile?.landId ? findLand(this.state, sourceTile.landId) : undefined;
        const pixel = axialToPixel(coord, hexSize);
        const center = { x: this.wx(pixel.x), y: this.wy(pixel.y) };
        const fillerTile = { coord, terrain: terrainKey, landId: sourceTile?.landId };
        this.fillerTiles.push(fillerTile);
        this.fillerTileMap.set(hexKey(coord), fillerTile);
        if (!sourceLand || sourceLand.isVisible) {
          const corners = hexCorners(center, hexSize * MAP_SCALE * 1.02).map(([x, y]) => ({ x, y }));
          this.inkMap.drawHexFill(graphics, corners, terrain.color);
        }
      }
    }

    this.drawFillerDecorations(decorationGraphics, this.fillerTiles);
  }

  private getFillerSourceTile(coord: { q: number; r: number }): HexTile | undefined {
    const sourceRow = Phaser.Math.Clamp(coord.r, 0, this.state.mapConfig.rows - 1);
    const sourceCol = Phaser.Math.Clamp(coord.q + Math.floor(coord.r / 2), 0, this.state.mapConfig.cols - 1);
    const sourceCoord = { q: sourceCol - Math.floor(sourceRow / 2), r: sourceRow };
    return this.hexTileMap.get(hexKey(sourceCoord));
  }

  private drawFillerDecorations(graphics: Phaser.GameObjects.Graphics, fillerTiles: HexTile[]): void {
    const hexSize = this.state.mapConfig.hexSize;
    const rng = createRng(this.state.mapConfig.seed + 1777);

    for (const tile of fillerTiles) {
      const sourceLand = tile.landId ? findLand(this.state, tile.landId) : undefined;
      if (sourceLand && !sourceLand.isVisible) {
        continue;
      }

      const terrain = TERRAIN_REGISTRY[tile.terrain];
      if (!terrain.decorate) {
        continue;
      }

      const pixel = axialToPixel(tile.coord, hexSize);
      terrain.decorate(graphics, { x: this.wx(pixel.x), y: this.wy(pixel.y) }, hexSize * MAP_SCALE, rng);
    }
  }

  /** Renders every hex tile as a continuous terrain texture, behind the zone color overlays. */
  private drawHexTerrain(): void {
    this.terrainGraphics = this.add.graphics().setDepth(0);
    this.terrainDecorationGraphics = this.add.graphics().setDepth(1);
    this.repaintHexTerrain();
  }

  private repaintHexTerrain(): void {
    const graphics = this.terrainGraphics;
    const decorationGraphics = this.terrainDecorationGraphics;
    graphics.clear();
    decorationGraphics.clear();
    const hexSize = this.state.mapConfig.hexSize;
    const rng = createRng(this.state.mapConfig.seed + 9001);

    for (const tile of this.state.hexTiles) {
      const land = tile.landId ? findLand(this.state, tile.landId) : undefined;
      if (land && !land.isVisible) {
        continue;
      }

      const pixel = axialToPixel(tile.coord, hexSize);
      const center = { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      // Tiles overlap their edges very slightly so the landmass reads as one continuous
      // ink-wash field rather than a grid of separate hexes with visible seams.
      const corners = hexCorners(center, hexSize * MAP_SCALE * 1.02).map(([x, y]) => ({ x, y }));

      this.inkMap.drawHexFill(graphics, corners, TERRAIN_REGISTRY[tile.terrain].color);
    }

    for (const group of computeTerrainRegions(this.state, this.hexTileMap)) {
      const terrain = TERRAIN_REGISTRY[group[0].terrain];
      const centers = group
        .filter((tile) => {
          const land = tile.landId ? findLand(this.state, tile.landId) : undefined;
          return !land || land.isVisible;
        })
        .map((tile) => {
          const pixel = axialToPixel(tile.coord, hexSize);
          return { x: this.wx(pixel.x), y: this.wy(pixel.y) };
        });

      if (centers.length === 0) {
        continue;
      }

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

  private drawCoastBuffer(): void {
    this.coastGraphics = this.add.graphics();
    this.coastGraphics.setDepth(0.25);
    this.repaintCoastBuffer();
  }

  private repaintCoastBuffer(): void {
    if (!this.coastGraphics) {
      return;
    }

    this.coastGraphics.clear();
    const hexSize = this.state.mapConfig.hexSize;
    const sand = 0xd8c27a;
    const sandLight = 0xefe0a8;

    for (const tile of this.state.hexTiles) {
      if (tile.terrain === 'water') {
        continue;
      }

      const land = tile.landId ? findLand(this.state, tile.landId) : undefined;
      if (!land?.isVisible) {
        continue;
      }

      const pixel = axialToPixel(tile.coord, hexSize);
      const center = { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      const corners = hexCorners(center, hexSize * MAP_SCALE * 1.03);

      EDGE_DIRECTIONS.forEach((direction, index) => {
        const neighborKey = hexKey({ q: tile.coord.q + direction.q, r: tile.coord.r + direction.r });
        const neighbor = this.hexTileMap.get(neighborKey) ?? this.fillerTileMap.get(neighborKey);
        if (neighbor && neighbor.terrain !== 'water') {
          return;
        }

        const [x1, y1] = corners[index];
        const [x2, y2] = corners[(index + 1) % corners.length];
        this.coastGraphics.lineStyle(18, sandLight, 0.56);
        this.coastGraphics.lineBetween(x1, y1, x2, y2);
        this.coastGraphics.lineStyle(9, sand, 0.74);
        this.coastGraphics.lineBetween(x1, y1, x2, y2);
      });
    }
  }

  private repaintControlMap(): void {
    if (!this.controlGraphics) {
      return;
    }

    this.controlGraphics.clear();
    const hexSize = this.state.mapConfig.hexSize;
    for (const tile of this.state.hexTiles) {
      const land = tile.landId ? findLand(this.state, tile.landId) : undefined;
      if (land && !land.isVisible) {
        continue;
      }

      const pixel = axialToPixel(tile.coord, hexSize);
      const center = { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      const corners = hexCorners(center, hexSize * MAP_SCALE * 1.02).map(([x, y]) => ({ x, y }));
      const color = land ? this.getOwnerColor(land.ownerId) : COLORS.neutral;
      this.controlGraphics.fillStyle(color, 1);
      this.controlGraphics.fillPoints(corners, true);
    }
  }

  private applyRenderMode(): void {
    this.mapGraphics?.setVisible(this.state.mapRenderMode === 'terrain');
    this.terrainGraphics?.setVisible(this.state.mapRenderMode === 'terrain');
    this.terrainDecorationGraphics?.setVisible(this.state.mapRenderMode === 'terrain');
    this.coastGraphics?.setVisible(this.state.mapRenderMode === 'terrain');
    this.controlGraphics?.setVisible(this.state.mapRenderMode === 'control');
  }

  private drawFogOfWar(): void {
    this.overlays.createFogLayer(this.state, this.hexTileMap, (value) => this.wx(value), (value) => this.wy(value));
  }

  private drawFillerFogOfWar(): void {
    this.fillerFogGraphics = this.add.graphics();
    this.fillerFogGraphics.setDepth(78);
    this.repaintFillerFogOfWar();
  }

  private repaintFogOfWar(): void {
    this.overlays.repaintFogOfWar(this.state, this.hexTileMap, (value) => this.wx(value), (value) => this.wy(value));
  }

  private repaintFillerFogOfWar(): void {
    if (!this.fillerFogGraphics) {
      return;
    }

    this.fillerFogGraphics.clear();
    const hexSize = this.state.mapConfig.hexSize;
    const hiddenGroups = new Map<string, { land: Land; centers: Array<{ x: number; y: number }> }>();

    for (const tile of this.fillerTiles) {
      const sourceLand = tile.landId ? findLand(this.state, tile.landId) : undefined;
      if (!sourceLand || sourceLand.isVisible) {
        continue;
      }

      const pixel = axialToPixel(tile.coord, hexSize);
      const center = { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      const corners = hexCorners(center, hexSize * MAP_SCALE * 1.02).map(([x, y]) => ({ x, y }));
      this.fillerFogGraphics.fillStyle(0xd7e4ea, sourceLand.isExplored ? 0.82 : 0.92);
      this.fillerFogGraphics.fillPoints(corners, true);

      const group = hiddenGroups.get(sourceLand.id) ?? { land: sourceLand, centers: [] };
      group.centers.push(center);
      hiddenGroups.set(sourceLand.id, group);
    }

    for (const { land, centers } of hiddenGroups.values()) {
      if (centers.length === 0) {
        continue;
      }
      const sum = centers.reduce((acc, center) => ({ x: acc.x + center.x, y: acc.y + center.y }), { x: 0, y: 0 });
      const baseRadius = Phaser.Math.Clamp(24 + centers.length * 2.2, 34, 82);
      this.inkMap.drawCloud(
        this.fillerFogGraphics,
        sum.x / centers.length,
        sum.y / centers.length,
        baseRadius,
        land.id.length * 97 + centers.length,
        land.isExplored ? 0.45 : 0.75,
      );
    }
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
    this.connectionGraphics?.destroy();
    this.connectionGraphics = this.traffic.drawConnections(this.state, (value) => this.wx(value), (value) => this.wy(value), (land) => this.getSettlementAnchor(land));
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
    const isPlayerLand = land.ownerId === PLAYER_KINGDOM_ID;
    const isPlayerCapital = isPlayerLand && land.type === 'castle';
    if (isPlayerCapital) {
      const capitalHighlight = this.inkItems.createCapitalHighlight();
      capitalHighlight.setDepth(-1);
      container.add(capitalHighlight);
    }

    const settlement = this.settlements.createSettlementCluster(this.state, land);
    container.add(settlement);

    container.add(this.createLandLabel(land, isPlayerCapital));
    this.landNodes.set(land.id, container);
  }

  private createLandLabel(land: Land, isPlayerCapital: boolean): Phaser.GameObjects.Container {
    const labelText = isPlayerCapital ? `${this.shortName(land)} ${t('common.capital')}` : this.shortName(land);
    const label = this.add.text(0, 0, labelText, {
      color: '#241407',
      fontFamily: UI_FONT,
      fontSize: '10px',
      align: 'center',
      fontStyle: '700',
      lineSpacing: -1,
      wordWrap: { width: 82 },
    }).setOrigin(0.5);
    label.setShadow(1, 1, '#f4e5b8', 0, true, true);

    const width = Math.max(44, Math.min(90, label.width + 12));
    const height = label.height + 6;
    const labelY = isPlayerCapital ? 30 : 27;
    const container = this.add.container(0, labelY);
    const backing = this.add.graphics();

    backing.fillStyle(0xf0dfae, 0.78);
    backing.fillRoundedRect(-width / 2, -height / 2, width, height, 4);
    backing.lineStyle(1, 0x4f3a20, 0.58);
    backing.strokeRoundedRect(-width / 2, -height / 2, width, height, 4);
    backing.lineStyle(1, 0xfff0bf, 0.42);
    backing.lineBetween(-width / 2 + 5, -height / 2 + 3, width / 2 - 5, -height / 2 + 3);

    container.add([backing, label]);
    return container;
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

    if (this.state.selectedArmyId) {
      const army = this.state.armies.find((candidate) => candidate.id === this.state.selectedArmyId);
      if (!army) {
        this.state.selectedArmyId = undefined;
        this.refresh();
        return;
      }

      if (army.landId === landId) {
        this.state.selectedArmyId = undefined;
        this.state.selectedLandId = landId;
        this.state.message = `${army.name} deselected.`;
        this.refresh();
        return;
      }

      issueMoveOrder(this.state, army.id, landId);
      this.refresh();
      return;
    }

    this.state.selectedLandId = landId;
    this.refresh();
  }

  private drawArmies(): void {
    this.armies.drawArmies(
      this.state,
      (value) => this.wx(value),
      (value) => this.wy(value),
      (land) => this.getSettlementAnchor(land),
      (armyId, pointer, event) => this.onArmyPointerDown(armyId, pointer, event),
    );
  }

  private updateArmyHighlight(): void {
    if (this.state.selectedArmyId) {
      this.overlays.highlightReachableLands(
        this.state,
        this.hexTileMap,
        (value) => this.wx(value),
        (value) => this.wy(value),
        this.state.selectedArmyId,
      );
    } else {
      this.overlays.clearArmyHighlight();
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

  /** Shows a crossed-swords progress badge over any district currently under siege. */
  private drawSiegeMarkers(): void {
    for (const marker of this.siegeMarkers) {
      marker.destroy();
    }
    this.siegeMarkers = [];

    for (const order of this.state.siegeOrders) {
      const land = findLand(this.state, order.landId);
      if (!land?.isVisible) {
        continue;
      }

      const { x, y } = this.getVisibleLandMarkerPoint(land);
      const marker = this.inkItems.createProgressBadge(x, y, order.progress, order.required, 'siege');
      marker.setDepth(72);
      this.siegeMarkers.push(marker);
    }
  }

  /** Shows a flag-and-progress badge over the capital while an army is being recruited. */
  private drawRecruitMarkers(): void {
    for (const marker of this.recruitMarkers) {
      marker.destroy();
    }
    this.recruitMarkers = [];

    for (const order of this.state.recruitmentOrders) {
      const land = findLand(this.state, order.landId);
      if (!land?.isVisible) {
        continue;
      }

      const { x, y } = this.getVisibleLandMarkerPoint(land);
      const marker = this.inkItems.createProgressBadge(x, y, order.progress, order.required, 'recruit');
      marker.setDepth(72);
      this.recruitMarkers.push(marker);
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
    const staticChanged = this.updateStaticRenderSignature();
    if (staticChanged) {
      this.drawBackgroundFillerTiles();
      this.repaintHexTerrain();
      this.repaintControlMap();
      this.repaintCoastBuffer();
      this.repaintFogOfWar();
      this.repaintFillerFogOfWar();
      this.repaintAllZones();
      this.redrawLandNodes();
      this.drawFlagMarkers();
      this.drawConnections();
      this.drawCarts();
      this.drawTravelers();
    }

    this.applyRenderMode();
    this.updateSelectionOutline();
    this.drawArmies();
    this.updateArmyHighlight();
    this.drawAcquisitionMarkers();
    this.drawBuildMarkers();
    this.drawSiegeMarkers();
    this.drawRecruitMarkers();
    this.events.emit('state-changed');
    this.scene.get('UIScene').events.emit('state-changed');
  }

  private updateStaticRenderSignature(): boolean {
    const next = this.getStaticRenderSignature();
    if (next === this.staticRenderSignature) {
      return false;
    }

    this.staticRenderSignature = next;
    return true;
  }

  private getStaticRenderSignature(): string {
    return `${this.state.mapConfig.seed}|${this.state.lands
      .map((land) => {
        const buildings = land.buildings.map((building) => `${building.type}${building.level}`).join(',');
        return `${land.id}:${land.ownerId}:${land.isVisible ? 1 : 0}:${land.isExplored ? 1 : 0}:${buildings}`;
      })
      .join('|')}`;
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

  private drawFlagMarkers(): void {
    for (const marker of this.flagMarkers.values()) {
      marker.destroy(true);
    }
    this.flagMarkers.clear();

    for (const land of this.state.lands) {
      if (!land.isVisible || land.ownerId !== PLAYER_KINGDOM_ID) {
        continue;
      }

      const isCapital = land.type === 'castle';
      const marker = this.inkItems.createPlayerLandFlag(isCapital, this.state.mapConfig.seed);
      marker.setDepth(76);
      if (isCapital) {
        marker.setPosition(this.wx(land.x), this.wy(land.y));
      } else {
        const anchor = this.getSettlementAnchor(land);
        marker.setPosition(this.wx(anchor.x) + 26, this.wy(anchor.y) + 8);
      }
      this.flagMarkers.set(land.id, marker);
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
      (x >= GAME_WIDTH - 72 && x <= GAME_WIDTH - 8 && y >= HEADER_HEIGHT + 7 && y <= HEADER_HEIGHT + 39) ||
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
