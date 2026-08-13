import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, COLORS, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, PLAYER_KINGDOM_ID, REALTIME_TICK_MS } from '../game/constants';
import { TouchController } from '../input/TouchController';
import { createInitialGameState } from '../state/GameState';
import { saveSnapshot } from '../state/save';
import { bribeLand, startDiplomaticClaim, startIntimidation, settleLand } from '../systems/AcquisitionSystem';
import { findLand, isAdjacent } from '../systems/LandSystem';
import { advanceRealtimeMonth } from '../systems/RealtimeSystem';
import { buildDistrictBuilding, destroyDistrictBuilding, setLandSpecialization, upgradeDistrictBuilding } from '../systems/ResourceSystem';
import { createBattlePreview, queueRecruitment, issueMoveOrder, attackLand, cancelSiege, disbandArmy } from '../systems/WarSystem';
import type { GameState, Land, LandBuildingType, LandSpecialization } from '../state/types';
import type { HexTile } from '../map/hexMapGenerator';
import { EDGE_DIRECTIONS, MAP_SCALE, axialToPixel, hexCorners, hexKey, pixelToAxial } from '../map/hex';
import { computeTerrainRegions } from '../map/boundary';
import { createRng } from '../map/random';
import { getTerrainColor } from '../map/terrainTypes';
import { recruitHero } from '../systems/HeroSystem';
import { dispatchHeroMission, useHeroAbility } from '../systems/empire/HeroActionSystem';
import { resolveHeroEvent } from '../systems/empire/HeroEventSystem';
import { choosePoliticsCard } from '../systems/PoliticsSystem';
import { resolveForeignChoice } from '../systems/ForeignEventSystem';
import { resolvePendingBattle } from '../systems/empire/InvasionSystem';
import { SHEET_TOP } from '../ui/BottomSheet';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { createMapItemRenderer, type MapItemRenderer } from '../ui/MapItemRenderer';
import { ArmyRenderer } from './map/ArmyRenderer';
import { OverlayRenderer } from './map/OverlayRenderer';
import { SettlementRenderer } from './map/SettlementRenderer';
import { TrafficRenderer } from './map/TrafficRenderer';
import { UI_FONT } from '../ui/fonts';
import { t } from '../i18n';
import { MINIMAP_H, MINIMAP_W } from '../ui/MinimapRenderer';
import { RENDER_SCALE, designPointer } from '../game/graphicsQuality';

const MIN_CAMERA_ZOOM = 0.72;
const MAX_CAMERA_ZOOM = 1.65;
const CAMERA_ZOOM_STEP = 0.16;
const WORLD_PADDING = 300;

/**
 * Resolution the static map layers are baked at (then displayed scaled back up).
 * Chosen per device: high-end renders full-detail (crisp terrain, ~52 MB of RTs),
 * low-end drops to half-res to save GPU memory (~13 MB) at the cost of some softness.
 * Override for testing with `?bakescale=0.75`.
 */
function pickBakeScale(): number {
  if (typeof window !== 'undefined') {
    const override = /[?&]bakescale=([0-9.]+)/.exec(window.location.search);
    if (override) return Math.min(1, Math.max(0.25, parseFloat(override[1])));
  }
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | (Navigator & { deviceMemory?: number })
    | undefined;
  const memoryGb = nav?.deviceMemory; // Chromium only; undefined on Safari/Firefox/desktop
  const cores = nav?.hardwareConcurrency ?? 4;
  if (memoryGb !== undefined && memoryGb <= 2) return 0.5; // clearly low-end -> save memory
  if ((memoryGb ?? 8) >= 8 && cores >= 8) return 1; // high-end -> full detail, no softening
  return 0.75; // mid / unknown -> lightly downscaled, visually near-lossless
}

const BAKE_SCALE = pickBakeScale();

export class MapScene extends Phaser.Scene {
  protected state!: GameState;
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
  /** Cached composite of all static map layers below the unit/marker bands (terrain,
   *  filler, coast, control, zones, decorations, connections, settlement nodes). Baked
   *  once per static change so Phaser stops re-tessellating ~160k fill commands/frame. */
  private staticBakeRT?: Phaser.GameObjects.RenderTexture;
  private lastBakedRenderMode?: string;
  /** Protected so a subclass mode can offer the renderer its own layers. */
  protected mapRenderer!: MapRenderer;
  private mapItems!: MapItemRenderer;
  private settlements!: SettlementRenderer;
  private traffic!: TrafficRenderer;
  /** Last state the ambient map motion was set to, so the sync acts only on a change. */
  private worldMotionHalted = false;
  private overlays!: OverlayRenderer;
  private armies!: ArmyRenderer;
  /** Protected so a subclass mode can trace its own land boundaries from the same grid. */
  protected hexTileMap = new Map<string, HexTile>();
  private fillerTiles: HexTile[] = [];
  private fillerTileMap = new Map<string, HexTile>();
  private hexOffsetX = 0;
  private hexOffsetY = 0;
  private worldWidth = 0;
  private worldHeight = 0;
  protected realtimeAccumulator = 0;
  private isDraggingMap = false;
  private dragDistance = 0;
  private renderSignatures: { bake: string; node: string } = { bake: '', node: '' };
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
      this.cameras.main.scrollX + point.x / this.mapZoom,
      this.cameras.main.scrollY + point.y / this.mapZoom,
    );
    if (landId) {
      this.selectLand(landId);
    }
    this.domDown = undefined;
  }

  /**
   * `key` defaults to 'MapScene', so the Phaser config array (`new MapScene()`) is
   * unchanged. The parameter exists so a mode can subclass the whole hex world — terrain
   * bake, fog, camera, hit-testing — under its own scene key instead of duplicating it.
   */
  constructor(key = 'MapScene') {
    super(key);
  }

  /** HUD scene launched alongside this one. Overridden by subclasses with their own HUD. */
  protected uiSceneKey(): string {
    return 'UIScene';
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
    this.renderSignatures = { bake: '', node: '' };
    this.suppressNextMapTap = false;
    this.domDown = undefined;
    this.domDragDistance = 0;
  }

  /**
   * The map's own zoom, in design units.
   *
   * `camera.zoom` carries the render scale as well — the drawing buffer is that many times the
   * 390-wide design surface — so reading it raw and dividing GAME_WIDTH by it silently answers a
   * different question than the one every clamp in this file is asking.
   */
  protected get mapZoom(): number {
    return this.cameras.main.zoom / RENDER_SCALE;
  }

  /** Sets the map's zoom in design units, leaving the render scale where it is. */
  protected setMapZoom(value: number): void {
    this.cameras.main.setZoom(value * RENDER_SCALE);
  }

  create(): void {
    // The map camera carries the render scale on top of the map's own zoom, so it starts at the
    // scale rather than at 1 — without this the world draws at design size inside a buffer several
    // times larger, which reads as the map having silently zoomed out.
    this.cameras.main.setOrigin(0, 0);
    this.setMapZoom(1);
    window.__mandateState = this.state;
    this.registry.set('gameState', this.state);
    this.mapRenderer = createMapRenderer(this);
    this.mapItems = createMapItemRenderer(this);
    // Ages the world camera — the HUD scene gets its own pass, so chrome and map share one sheet.
    applyPaperFX(this);
    this.settlements = new SettlementRenderer(this, this.mapItems, this.mapRenderer.palette);
    this.traffic = new TrafficRenderer(this, this.mapRenderer, this.mapItems);
    this.overlays = new OverlayRenderer(this, this.mapRenderer);
    this.armies = new ArmyRenderer(this, this.mapItems);
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
    this.game.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    this.drawMap();
    this.scene.launch(this.uiSceneKey(), { state: this.state });
    this.scene.bringToTop(this.uiSceneKey());
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
    this.game.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
  }

  /** Re-bake the cached terrain + fog textures once a lost WebGL context is restored.
   *  Both RenderTextures are blanked by a context loss, so both must be redrawn. */
  private readonly onContextRestored = (): void => {
    // Defer so Phaser's own context restore (texture re-upload) completes first.
    this.time.delayedCall(60, () => {
      if (this.scene.isActive()) {
        this.bakeStaticTerrain();
        this.bakeFog();
      }
    });
  };

  protected registerUiEvents(): void {
    const ui = this.scene.get(this.uiSceneKey());
    ui.events.on('ui:land-action', (action: string, landId: string, heroId?: string) => {
      this.handleLandAction(action, landId, heroId);
    });
    ui.events.on('ui:hero-pick', (heroId: string) => {
      recruitHero(this.state, heroId);
      this.refresh();
    });
    ui.events.on('ui:hero-mission', (heroId: string, targetKingdomId?: string) => {
      dispatchHeroMission(this.state, heroId, targetKingdomId);
      this.refresh();
    });
    ui.events.on('ui:hero-ability', (heroId: string) => {
      useHeroAbility(this.state, heroId);
      this.refresh();
    });
    ui.events.on('ui:hero-event-choice', (choiceId: string) => {
      resolveHeroEvent(this.state, choiceId);
      this.refresh();
    });
    ui.events.on('ui:politics-choice', (choiceId: string) => {
      choosePoliticsCard(this.state, choiceId);
      this.refresh();
    });
    ui.events.on('ui:foreign-choice', (choiceId: string) => {
      resolveForeignChoice(this.state, choiceId);
      this.refresh();
    });
    ui.events.on('ui:battle-decision', (decision: 'attack' | 'delegate' | 'retreat') => {
      resolvePendingBattle(this.state, decision);
      this.refresh();
    });
    ui.events.on('ui:attack-land', (armyId: string, landId: string, stance: 'assault' | 'balanced' | 'cautious') => {
      attackLand(this.state, armyId, landId, stance);
      this.refresh();
    });
    ui.events.on('ui:retreat-siege', (armyId: string, landId: string) => {
      cancelSiege(this.state, armyId, landId);
      this.refresh();
    });
    ui.events.on('ui:create-army', (heroId: string, soldiers: number, food: number, supplies: number, composition: 'balanced' | 'spears' | 'archers' | 'shock') => {
      queueRecruitment(this.state, heroId, soldiers, food, supplies, composition);
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
      this.scene.get(this.uiSceneKey()).events.emit('state-changed');
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
      this.scene.stop(this.uiSceneKey());
      this.scene.start('MenuScene');
    });
    ui.events.on('ui:pan-camera', (worldX: number, worldY: number) => {
      const cam = this.cameras.main;
      const zoom = this.mapZoom;
      cam.scrollX = Phaser.Math.Clamp(
        worldX - GAME_WIDTH / (2 * zoom),
        0,
        Math.max(0, this.worldWidth - GAME_WIDTH / zoom),
      );
      cam.scrollY = Phaser.Math.Clamp(
        worldY - GAME_HEIGHT / (2 * zoom),
        0,
        Math.max(0, this.worldHeight - GAME_HEIGHT / zoom),
      );
    });
    ui.events.on('ui:clear-selection', () => {
      this.state.selectedLandId = undefined;
      this.state.latestBattlePreview = undefined;
      this.refresh();
    });
  }

  /**
   * Whether the world's clock is stopped, for any reason: won, held for a modal, or paused by
   * the player. Named rather than inlined because the ambient map motion has to follow it too,
   * and a mode with its own ending condition overrides just this.
   */
  protected isWorldHalted(): boolean {
    return this.state.victory || this.state.isPaused || this.state.isStrategyPause;
  }

  /**
   * Keeps the map's ambient life in step with the clock.
   *
   * The carts and travelers loop forever on their own tweens, which owe nothing to the economy
   * tick — so pausing stopped the game while the roads carried on, and the pause read as
   * broken. Called every frame; acts only on the change.
   */
  protected syncWorldMotion(): void {
    const halted = this.isWorldHalted();
    if (halted === this.worldMotionHalted) return;
    this.worldMotionHalted = halted;
    this.traffic.setPaused(halted);
  }

  update(_time: number, delta: number): void {
    this.syncWorldMotion();
    if (this.isWorldHalted()) {
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

      // Raw camera zoom on purpose. Phaser reports pointer coordinates in the drawing buffer's
      // space, which already carries the render scale, so dividing by the full camera zoom lands
      // in design units — the same place the clamps below are measured in.
      const deltaX = (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
      const deltaY = (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
      this.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
      if (this.dragDistance > 40) {
        this.isDraggingMap = true;
      }

      this.cameras.main.scrollX = Phaser.Math.Clamp(
        this.cameras.main.scrollX - deltaX,
        0,
        Math.max(0, this.worldWidth - GAME_WIDTH / this.mapZoom),
      );
      this.cameras.main.scrollY = Phaser.Math.Clamp(
        this.cameras.main.scrollY - deltaY,
        0,
        Math.max(0, this.worldHeight - GAME_HEIGHT / this.mapZoom),
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

    if (action.startsWith('specialize:')) {
      setLandSpecialization(this.state, landId, action.slice('specialize:'.length) as LandSpecialization);
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
    this.bakeFog();
    this.drawAcquisitionMarkers();
    this.drawBuildMarkers();
    this.drawSiegeMarkers();
    this.drawRecruitMarkers();
    this.bakeStaticTerrain();
    this.renderSignatures = { bake: this.getBakeSignature(), node: this.getNodeSignature() };
  }

  private drawPaperBackground(): void {
    this.mapGraphics = this.mapRenderer.drawBackground(this.worldWidth, this.worldHeight);
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
        const sourceLand = sourceTile?.landId ? findLand(this.state, sourceTile.landId) : undefined;
        const pixel = axialToPixel(coord, hexSize);
        const center = { x: this.wx(pixel.x), y: this.wy(pixel.y) };
        const fillerTile = { coord, terrain: terrainKey, landId: sourceTile?.landId };
        this.fillerTiles.push(fillerTile);
        this.fillerTileMap.set(hexKey(coord), fillerTile);
        if (!sourceLand || sourceLand.isVisible) {
          const corners = hexCorners(center, hexSize * MAP_SCALE * 1.02).map(([x, y]) => ({ x, y }));
          this.mapRenderer.drawHexFill(graphics, corners, getTerrainColor(terrainKey));
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

      const pixel = axialToPixel(tile.coord, hexSize);
      this.mapRenderer.decorateTerrain(graphics, tile.terrain, [{ x: this.wx(pixel.x), y: this.wy(pixel.y) }], hexSize * MAP_SCALE, rng);
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

    // A renderer that draws the whole landscape at once owns terrain entirely — ranges, field
    // systems and prop scatters have to cross cell boundaries to look like a country, which the
    // per-hex loop below structurally cannot do. It is wrapped because that renderer owns the
    // layer wholesale: if it throws, the map would be blank rather than merely old-looking.
    if (this.mapRenderer.drawLandscape) {
      try {
        this.mapRenderer.drawLandscape({
          graphics,
          decoration: decorationGraphics,
          tiles: this.state.hexTiles,
          tileSize: hexSize * MAP_SCALE,
          centreOf: (tile) => {
            const pixel = axialToPixel(tile.coord, hexSize);
            return { x: this.wx(pixel.x), y: this.wy(pixel.y) };
          },
          centreAt: (q, r) => {
            const pixel = axialToPixel({ q, r }, hexSize);
            return { x: this.wx(pixel.x), y: this.wy(pixel.y) };
          },
          isVisible: (tile) => {
            const land = tile.landId ? findLand(this.state, tile.landId) : undefined;
            return !land || land.isVisible;
          },
        });
        return;
      } catch (error) {
        console.warn('Landscape renderer failed; falling back to per-hex terrain:', error);
        graphics.clear();
        decorationGraphics.clear();
      }
    }

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

      this.mapRenderer.drawHexFill(graphics, corners, getTerrainColor(tile.terrain));
    }

    for (const group of computeTerrainRegions(this.state, this.hexTileMap)) {
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

      this.mapRenderer.decorateTerrain(decorationGraphics, group[0].terrain, centers, hexSize * MAP_SCALE, rng);
    }
  }

  private drawControlMap(): void {
    this.controlGraphics = this.add.graphics();
    this.repaintControlMap();
    this.applyRenderModeVisibility();
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
    const { shore: sand, paperLight: sandLight } = this.mapRenderer.palette;

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
        if (this.mapRenderer.drawShoreEdge) {
          this.mapRenderer.drawShoreEdge(this.coastGraphics!, x1, y1, x2, y2);
          return;
        }
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
    // The terrain/control layers live inside the static bake, so switching modes just
    // means re-compositing the bake with the other set of layers visible. Cheap no-op
    // when the mode hasn't changed (the common per-tick case).
    if (this.lastBakedRenderMode !== this.state.mapRenderMode) {
      this.bakeStaticTerrain();
    }
  }

  /**
   * Composites every static layer below the unit/marker bands (depth <= 1.5) into a
   * single cached RenderTexture, then hides the source Graphics. Replaces ~160k
   * per-frame fill/triangulation+upload commands with one textured quad. Re-run on
   * static changes and on render-mode switches; honours the active terrain/control mode.
   */
  private bakeStaticTerrain(): void {
    if (typeof window !== 'undefined' && /[?&]nobake=1\b/.test(window.location.search)) {
      this.applyRenderModeVisibility();
      return;
    }
    if (!this.staticBakeRT) {
      // Texture is baked at BAKE_SCALE resolution then displayed scaled up to full world size.
      this.staticBakeRT = this.add.renderTexture(0, 0, Math.ceil(this.worldWidth * BAKE_SCALE), Math.ceil(this.worldHeight * BAKE_SCALE))
        .setOrigin(0, 0)
        .setScale(1 / BAKE_SCALE)
        .setDepth(1.9);
    }

    type BandLayer = Phaser.GameObjects.GameObject & { depth: number; visible: boolean; setVisible(v: boolean): unknown };
    const band = this.children.list.filter((obj): obj is BandLayer => {
      const depth = (obj as unknown as { depth?: unknown }).depth;
      return obj !== this.staticBakeRT && typeof depth === 'number' && depth <= 1.5;
    });

    // Show every candidate source, then hide the layers that belong to the inactive
    // render mode so the composite matches what the live layers used to show.
    for (const source of band) source.setVisible(true);
    this.applyRenderModeVisibility();

    const visible = band
      .filter((obj) => obj.visible)
      .sort((a, b) => a.depth - b.depth); // V8 stable sort preserves insertion order on ties

    // If the WebGL context has been lost (GPU reset, or too many live contexts across
    // tabs), clearing/drawing the RenderTexture dereferences a null GL binding and
    // crashes. Bail with the live source layers still visible; `onContextRestored`
    // re-runs the bake once the context returns.
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (renderer?.contextLost) {
      return;
    }

    // Sources are all Graphics anchored at world origin (0,0), so scaling them by
    // BAKE_SCALE for the draw shrinks their geometry into the reduced-res texture.
    const scalable = visible as unknown as Array<{ setScale(v: number): unknown }>;
    for (const source of scalable) source.setScale(BAKE_SCALE);
    try {
      this.staticBakeRT.clear();
      this.staticBakeRT.draw(visible, 0, 0);
    } catch (error) {
      // A context loss racing the guard above can still null the GL bindings mid-bake;
      // keep the live layers visible and recover on the next restore instead of throwing.
      console.warn('Static terrain bake skipped (renderer unavailable):', error);
      for (const source of scalable) source.setScale(1);
      return;
    }
    for (const source of scalable) source.setScale(1);

    for (const source of band) source.setVisible(false);
    this.lastBakedRenderMode = this.state.mapRenderMode;
  }

  /** Sets terrain-vs-control source-layer visibility for the active render mode. */
  private applyRenderModeVisibility(): void {
    const terrainMode = this.state.mapRenderMode === 'terrain';
    this.mapGraphics?.setVisible(terrainMode);
    this.terrainGraphics?.setVisible(terrainMode);
    this.terrainDecorationGraphics?.setVisible(terrainMode);
    this.coastGraphics?.setVisible(terrainMode);
    this.controlGraphics?.setVisible(!terrainMode);
  }

  private drawFogOfWar(): void {
    this.overlays.createFogLayer(this.state, this.hexTileMap, (value) => this.wx(value), (value) => this.wy(value));
  }

  private drawFillerFogOfWar(): void {
    this.fillerFogGraphics = this.add.graphics();
    this.fillerFogGraphics.setDepth(77.5);
    this.repaintFillerFogOfWar();
  }

  /** Bakes the static fog tint (main + filler) into a cached texture. Must run after
   *  both fog layers have been repainted for the current visibility state. */
  private bakeFog(): void {
    if (typeof window !== 'undefined' && /[?&]nobake=1\b/.test(window.location.search)) {
      return; // diagnostic: leave live fog Graphics visible to compare against the bake
    }
    if (this.fillerFogGraphics) {
      this.overlays.bakeFog(this.worldWidth, this.worldHeight, [this.fillerFogGraphics], BAKE_SCALE);
    }
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
      if (this.mapRenderer.drawFogCell) {
        // A theme may want the frontier between drawn and undrawn land to be torn rather than
        // stepped; the flat hex fill below outlines every unexplored cell as a perfect hexagon.
        this.mapRenderer.drawFogCell(this.fillerFogGraphics, center, corners, hexSize * MAP_SCALE, sourceLand.isExplored);
      } else {
        this.fillerFogGraphics.fillStyle(this.mapRenderer.palette.fog, sourceLand.isExplored ? 0.82 : 0.92);
        this.fillerFogGraphics.fillPoints(corners, true);
      }

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
      this.mapRenderer.drawCloud(
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

  /**
   * How far a land's settlement sits from the centroid its node is anchored at.
   *
   * A settlement is drawn on the land's fortress hexes, which can be most of a province away from
   * its centroid — so the name, the capital ring and the player's banner all pointed at bare
   * ground beside the town they belonged to. `getSettlementAnchor` already knew where the town
   * was; only the label and the capital were not asking it.
   */
  private settlementNodeOffset(land: Land): { x: number; y: number } {
    const anchor = this.getSettlementAnchor(land);
    return { x: this.wx(anchor.x) - this.wx(land.x), y: this.wy(anchor.y) - this.wy(land.y) };
  }

  private createLandNode(land: Land): void {
    if (!land.isVisible) {
      return;
    }

    // Sits just above the static terrain bake (RenderTexture at depth 1.9) so the
    // settlement cluster + label render live on top of the cached map. Kept live (not
    // baked) because there are only a handful of visible-land nodes and Phaser's
    // RenderTexture.draw does not reliably composite deeply-nested containers.
    const container = this.add.container(this.wx(land.x), this.wy(land.y)).setDepth(2);
    const isPlayerLand = land.ownerId === PLAYER_KINGDOM_ID;
    const isPlayerCapital = isPlayerLand && land.type === 'castle';
    if (isPlayerCapital) {
      const capitalHighlight = this.mapItems.createCapitalHighlight();
      capitalHighlight.setDepth(-1);
      const ringAt = this.settlementNodeOffset(land);
      capitalHighlight.setPosition(ringAt.x, ringAt.y);
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
    // A walled seat is tall. At the village offset the name landed across its gate tower, which is
    // the one building on the map worth looking at.
    const isSeat = land.type === 'castle' || land.type === 'enemyCastle';
    const labelY = isSeat ? 58 : 27;
    const anchor = this.settlementNodeOffset(land);
    const container = this.add.container(anchor.x, anchor.y + labelY);
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

  protected selectLand(landId: string): void {
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
      const marker = this.mapItems.createProgressBadge(x, y, order.progress, order.required, 'acquisition');
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
      const marker = this.mapItems.createProgressBadge(x, y, order.progress, order.required, 'build');
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
      const marker = this.mapItems.createProgressBadge(x, y, order.progress, order.required, 'siege');
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
      const marker = this.mapItems.createProgressBadge(x, y, order.progress, order.required, 'recruit');
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
      const screenX = (worldX - camera.scrollX) * this.mapZoom;
      const screenY = (worldY - camera.scrollY) * this.mapZoom;
      if (screenX < 24 || screenX > GAME_WIDTH - 76 || screenY < HEADER_HEIGHT + 36 || screenY > maxScreenY) {
        continue;
      }
      visibleCenters.push({ x: worldX, y: worldY });
    }

    if (visibleCenters.length > 0) {
      const sum = visibleCenters.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
      return { x: sum.x / visibleCenters.length, y: sum.y / visibleCenters.length };
    }

    const fallbackScreenX = Phaser.Math.Clamp((this.wx(land.x) - camera.scrollX) * this.mapZoom, 34, GAME_WIDTH - 86);
    const fallbackScreenY = Phaser.Math.Clamp((this.wy(land.y) - camera.scrollY) * this.mapZoom, HEADER_HEIGHT + 46, maxScreenY);
    return {
      x: camera.scrollX + fallbackScreenX / this.mapZoom,
      y: camera.scrollY + fallbackScreenY / this.mapZoom,
    };
  }

  protected animateSoldierColumn(
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

  protected refresh(): void {
    // The baked terrain/control/coast/fog/zone layers depend only on ownership and
    // visibility, so a building-only change (common on economy ticks) skips the whole
    // expensive repaint+bake and just refreshes the live settlement nodes.
    const bakeChanged = this.updateSignature('bake');
    const nodeChanged = this.updateSignature('node');

    if (bakeChanged) {
      this.drawBackgroundFillerTiles();
      this.repaintHexTerrain();
      this.repaintControlMap();
      this.repaintCoastBuffer();
      this.repaintFogOfWar();
      this.repaintFillerFogOfWar();
      this.bakeFog();
      this.repaintAllZones();
      this.drawFlagMarkers();
      this.drawConnections();
      this.drawCarts();
      this.drawTravelers();
    }

    if (bakeChanged || nodeChanged) {
      this.redrawLandNodes();
    }

    if (bakeChanged) {
      this.bakeStaticTerrain();
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
    this.scene.get(this.uiSceneKey()).events.emit('state-changed');
  }

  /** Updates one cached render signature and reports whether it changed. */
  private updateSignature(kind: 'bake' | 'node'): boolean {
    const next = kind === 'bake' ? this.getBakeSignature() : this.getNodeSignature();
    if (next === this.renderSignatures[kind]) {
      return false;
    }
    this.renderSignatures[kind] = next;
    return true;
  }

  /** Signature of everything baked into the static terrain/fog textures: ownership and
   *  visibility per land. Deliberately excludes buildings, which only affect live nodes. */
  private getBakeSignature(): string {
    return `${this.state.mapConfig.seed}|${this.state.mapRenderMode}|${this.state.lands
      .map((land) => `${land.id}:${land.ownerId}:${land.isVisible ? 1 : 0}:${land.isExplored ? 1 : 0}`)
      .join('|')}`;
  }

  /** Signature of the live settlement nodes: visibility, ownership, and buildings. */
  private getNodeSignature(): string {
    return this.state.lands
      .map((land) => {
        const buildings = land.buildings.map((building) => `${building.type}${building.level}`).join(',');
        return `${land.id}:${land.ownerId}:${land.isVisible ? 1 : 0}:${buildings}`;
      })
      .join('|');
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
      const marker = this.mapItems.createPlayerLandFlag(isCapital, this.state.mapConfig.seed);
      marker.setDepth(76);
      const anchor = this.getSettlementAnchor(land);
      // The capital used to pin to the land centroid while its walls stood on the fortress hexes,
      // so the one banner on the map that matters flew over an empty field. Moved onto the seat it
      // then stood ON the citadel, pole through the gate tower — the player's own capital was the
      // one seat in the game you could not see. It flies beside the walls, as a standard does.
      marker.setPosition(this.wx(anchor.x) + (isCapital ? 34 : 26), this.wy(anchor.y) + (isCapital ? 2 : 8));
      this.flagMarkers.set(land.id, marker);
    }
  }

  private getOwnerColor(ownerId: string): number {
    if (ownerId === 'neutral') {
      return COLORS.neutral;
    }

    return this.state.kingdoms.find((kingdom) => kingdom.id === ownerId)?.color ?? COLORS.neutral;
  }

  get minimapInfo() {
    const cam = this.cameras.main;
    return {
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      hexOffsetX: this.hexOffsetX,
      hexOffsetY: this.hexOffsetY,
      scrollX: cam.scrollX,
      scrollY: cam.scrollY,
      zoom: this.mapZoom,
    };
  }

  protected wx(value: number): number {
    return (value - this.hexOffsetX) * MAP_SCALE;
  }

  protected wy(value: number): number {
    return (value - this.hexOffsetY) * MAP_SCALE;
  }

  private isPointerOverFixedUi(pointer: Phaser.Input.Pointer): boolean {
    const point = designPointer(pointer);
    return this.isScreenPointOverFixedUi(point.x, point.y);
  }

  protected isScreenPointOverFixedUi(x: number, y: number): boolean {
    return (
      (this.state.isPaused && !this.state.isStrategyPause) ||
      performance.now() < (window.__suppressMapInputUntil ?? 0) ||
      this.isPointInMinimapUi(x, y) ||
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

  private isPointInMinimapUi(x: number, y: number): boolean {
    const bounds = window.__minimapInputBounds;
    if (bounds) {
      return bounds.some((rect) => (
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      ));
    }

    const barTop = GAME_HEIGHT - ACTION_BAR_HEIGHT;
    return (
      (x >= 4 && x <= 36 && y >= barTop - 36 && y <= barTop - 4) ||
      (x >= 6 && x <= 6 + MINIMAP_W && y >= barTop - 110 && y <= barTop - 110 + MINIMAP_H)
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

  protected findLandIdAt(worldX: number, worldY: number): string | undefined {
    const hexSize = this.state.mapConfig.hexSize;
    const rawX = worldX / MAP_SCALE + this.hexOffsetX;
    const rawY = worldY / MAP_SCALE + this.hexOffsetY;
    const coord = pixelToAxial(rawX, rawY, hexSize);
    return this.hexTileMap.get(hexKey(coord))?.landId;
  }

  private zoomMap(direction: number): void {
    const camera = this.cameras.main;
    const oldZoom = this.mapZoom;
    const nextZoom = Phaser.Math.Clamp(oldZoom + direction * CAMERA_ZOOM_STEP, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    if (nextZoom === oldZoom) {
      return;
    }

    const centerWorldX = camera.scrollX + GAME_WIDTH / (2 * oldZoom);
    const centerWorldY = camera.scrollY + GAME_HEIGHT / (2 * oldZoom);
    this.setMapZoom(nextZoom);
    camera.scrollX = Phaser.Math.Clamp(centerWorldX - GAME_WIDTH / (2 * nextZoom), 0, Math.max(0, this.worldWidth - GAME_WIDTH / nextZoom));
    camera.scrollY = Phaser.Math.Clamp(centerWorldY - GAME_HEIGHT / (2 * nextZoom), 0, Math.max(0, this.worldHeight - GAME_HEIGHT / nextZoom));
    this.state.message = `Map zoom ${Math.round(nextZoom * 100)}%.`;
    this.scene.get(this.uiSceneKey()).events.emit('state-changed');
  }

  protected centerCameraOnPlayerStart(): void {
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
