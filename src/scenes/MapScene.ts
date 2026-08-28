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
import { createMapItemRenderer, LABEL_KEEP_OUT, type MapItemRenderer } from '../ui/MapItemRenderer';
import { ArmyRenderer } from './map/ArmyRenderer';
import { OverlayRenderer } from './map/OverlayRenderer';
import { SeasonRenderer, type SeasonScape } from './map/SeasonRenderer';
import { SettlementRenderer } from './map/SettlementRenderer';
import { BirdRenderer } from './map/BirdRenderer';
import { TrafficRenderer } from './map/TrafficRenderer';
import { ViewIndex, type CullKind } from './map/ViewIndex';
import { BAKE_SEASON, foliagePalette, seasonVisualsEnabled, setFoliageSeason, setRenderSeason } from '../ui/ink/season';
import { UI_FONT } from '../ui/fonts';
import { t } from '../i18n';
import { MINIMAP_H, MINIMAP_W } from '../ui/MinimapRenderer';
import { applyPendingRenderScale, bakeScale, designPointer, liveSettlementInk, lodDropsLabels, lodZoomThreshold, renderScaleNow } from '../game/graphicsQuality';
import { qualityLadder } from '../game/qualityLadder';
import { fitBakeScale } from '../ui/ink/textureLimits';
import { figureEraFor } from '../ui/ink/devices';
import { liveBattles } from '../systems/ascent/fronts';

/** How big a province's standard is drawn against the ground it stands on. See `drawFlags`. */
const MAP_LAND_FLAG_SCALE = 0.55;

/**
 * How far past the camera's edge an object still counts as visible.
 *
 * Enough that a settlement is already drawn by the time its ground scrolls in — culling exactly at
 * the edge makes towns pop into existence at the side of the screen, which is far more noticeable
 * than the handful of extra objects this keeps.
 */
const CULL_MARGIN = 110;

/**
 * The independently-invalidated bands of the map.
 *
 * These used to be one `bake` signature keyed on ownership, visibility and explored-ness together,
 * so any of the three repainted all of them — and `isExplored` changes nothing but a fog alpha
 * while costing the full repaint. Split, each band is repainted by the thing it actually depends on.
 */
type RenderLayer = 'terrain' | 'control' | 'fog' | 'roads' | 'node' | 'badge';
const RENDER_LAYERS: RenderLayer[] = ['terrain', 'control', 'fog', 'roads', 'node', 'badge'];
/** `?nocull=1` — diagnostic, to A/B the view culling the way `?nobake=1` A/Bs the bake. */
const CULLING_DISABLED = typeof window !== 'undefined' && /[?&]nocull=1\b/.test(window.location.search);

const MIN_CAMERA_ZOOM = 0.72;
const MAX_CAMERA_ZOOM = 1.65;
const CAMERA_ZOOM_STEP = 0.16;
const WORLD_PADDING = 300;

/**
 * The settlement band: harvested town ink, the capital ring, name plates, seasonal accents —
 * depths [1.40, 1.50), under the `depth <= 1.5` bake sweep. On tiers with `liveSettlementInk()`
 * these render live (vector-crisp at any zoom) and the sweep must leave them alone; the floor
 * sits just under 1.40 so the exact-1.40 capital ring is included.
 *
 * `bakeScale()` is read at each bake, not once: the quality ladder can change the rung mid-run,
 * and the bake must follow it (the RT is rebuilt when its size stops matching).
 */
const SETTLEMENT_BAND_FLOOR = 1.395;

export class MapScene extends Phaser.Scene {
  protected state!: GameState;
  private touch!: TouchController;
  private landNodes = new Map<string, Phaser.GameObjects.Container>();
  /** The veil over ground the realm sees but does not hold. Baked with the fog. */
  private foreignHazeGraphics?: Phaser.GameObjects.Graphics;
  /** Each node's name plate, held separately so the zoom LOD can drop type without dropping towns. */
  private landLabels = new Map<string, Phaser.GameObjects.Container>();
  /** Settlement ink harvested out of each node into the static-bake band; dies with its node. */
  private landInk = new Map<string, Phaser.GameObjects.Graphics[]>();
  private flagMarkers = new Map<string, Phaser.GameObjects.Container>();
  private acquisitionMarkers: Phaser.GameObjects.GameObject[] = [];
  private buildMarkers: Phaser.GameObjects.GameObject[] = [];
  private siegeMarkers: Phaser.GameObjects.GameObject[] = [];
  private recruitMarkers: Phaser.GameObjects.GameObject[] = [];
  private battleMarkers: Phaser.GameObjects.GameObject[] = [];
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
  private birds!: BirdRenderer;
  /** Last state the ambient map motion was set to, so the sync acts only on a change. */
  private worldMotionHalted = false;
  private overlays!: OverlayRenderer;
  private armies!: ArmyRenderer;
  /** The season's light, ground accents and weather — live layers above the bake.
   *  Protected so a subclass mode driving its own tick can still drift the weather. */
  protected seasons!: SeasonRenderer;
  /** The season the live seasonal layers are currently showing, so the sync acts only on a change. */
  private renderedSeason?: string;
  /** Protected so a subclass mode can trace its own land boundaries from the same grid. */
  protected hexTileMap = new Map<string, HexTile>();
  /**
   * Land lookup for the render loops only.
   *
   * `findLand` is a linear `Array.find` over 42 lands, and the per-tile passes below call it once
   * per hex — the terrain, filler, coast, control and fog loops together run it ~5000 times per
   * repaint, which is ~200k comparisons for a table that never changes shape. Gameplay keeps using
   * `findLand`: this is a render-side index, so no system's behaviour can shift with it.
   */
  private landById = new Map<string, Land>();
  private fillerTiles: HexTile[] = [];
  private fillerTileMap = new Map<string, HexTile>();
  private hexOffsetX = 0;
  private hexOffsetY = 0;
  private worldWidth = 0;
  private worldHeight = 0;
  protected realtimeAccumulator = 0;
  private isDraggingMap = false;
  private dragDistance = 0;
  /** Which live objects the camera can reach. See `ViewIndex` for why this is a grid. */
  private viewIndex = new ViewIndex();
  /** The camera pose the culling was last computed for, so a still camera costs one comparison. */
  private lastCullPose = '';
  private renderSignatures: Record<RenderLayer, string> = {
    terrain: '',
    control: '',
    fog: '',
    roads: '',
    node: '',
    badge: '',
  };
  /** Per-land signature of the live settlement node, so only the lands that changed are rebuilt. */
  private nodeSignatures = new Map<string, string>();
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

    // Twenty, not fourteen, and measured in **Manhattan** distance — the second half is why the
    // old number was tighter than it looked. A thumb travelling four points right and eleven down
    // has moved twelve points as the eye sees it and fifteen as this sum counts it, so a perfectly
    // still-looking press on a name plate was being thrown away as a drag. That is the other half
    // of *click to name of land ... it not work sometime*; the first half was the zoom.
    //
    // Still well under a deliberate pan: the camera only starts moving in `handleDomMove` once the
    // gesture is a drag, and twenty points on a 390-wide surface is about a fifth of an inch.
    if (!point || !this.domDown || this.domDragDistance > 20 || this.isScreenPointOverFixedUi(point.x, point.y)) {
      this.domDown = undefined;
      return;
    }

    const landId = this.resolveTapLand(
      this.cameras.main.scrollX + point.x / this.mapZoom,
      this.cameras.main.scrollY + point.y / this.mapZoom,
    );
    if (landId) {
      this.selectLand(landId);
    } else {
      // **Tapping the open map puts the card away.**
      //
      // Reported: *cannot close land detail after select*. There was no way to — the card has no
      // dismiss of its own, and a tap that resolved to no province simply did nothing, so once a
      // province was selected the only way out was selecting a different one. Tapping away from a
      // thing to dismiss it is the gesture every sheet on a phone answers to, and this one was
      // silently ignoring it.
      //
      // Only ever a *dismissal*: `isScreenPointOverFixedUi` has already refused every tap that
      // landed on the card itself, the action bar, the HUD or an open overlay, so what reaches
      // here is genuinely a tap on the map with nothing under it.
      this.deselectLand();
    }
    this.domDown = undefined;
  }

  /**
   * Clears the current selection, if there is one. Overridden where a mode keeps more with it.
   *
   * Guarded so an idle tap on empty country does not re-render the map for nothing: `refresh` is
   * the whole scene's repaint and it runs the settlement, marker and label passes with it.
   */
  protected deselectLand(): void {
    if (!this.state.selectedLandId && !this.state.latestBattlePreview) return;
    this.state.selectedLandId = undefined;
    this.state.selectedArmyId = undefined;
    this.state.latestBattlePreview = undefined;
    this.refresh();
    this.scene.get(this.uiSceneKey()).events.emit('state-changed');
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
    this.landLabels = new Map<string, Phaser.GameObjects.Container>();
    this.landInk = new Map<string, Phaser.GameObjects.Graphics[]>();
    this.flagMarkers = new Map<string, Phaser.GameObjects.Container>();
    this.acquisitionMarkers = [];
    this.buildMarkers = [];
    this.siegeMarkers = [];
    this.recruitMarkers = [];
    this.battleMarkers = [];
    this.fillerGraphics = undefined;
    this.fillerDecorationGraphics = undefined;
    this.fillerFogGraphics = undefined;
    this.connectionGraphics = undefined;
    this.hexTileMap = new Map<string, HexTile>();
    this.landById = new Map<string, Land>();
    this.nodeSignatures = new Map<string, string>();
    this.viewIndex = new ViewIndex();
    this.lastCullPose = '';
    this.fillerTiles = [];
    this.fillerTileMap = new Map<string, HexTile>();
    this.hexOffsetX = 0;
    this.hexOffsetY = 0;
    this.worldWidth = 0;
    this.worldHeight = 0;
    this.realtimeAccumulator = 0;
    this.isDraggingMap = false;
    this.dragDistance = 0;
    this.renderSignatures = { terrain: '', control: '', fog: '', roads: '', node: '', badge: '' };
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
    return this.cameras.main.zoom / renderScaleNow();
  }

  /** Sets the map's zoom in design units, leaving the render scale where it is. */
  protected setMapZoom(value: number): void {
    this.cameras.main.setZoom(value * renderScaleNow());
  }

  create(): void {
    // A pending ladder step lands here, at the scene boundary, before any camera is set up.
    applyPendingRenderScale(this.game);
    // The map build and its bakes take real frames; the ladder must not read them as the
    // device failing to keep up — that misread is what stepped iPhones off an explicit high.
    qualityLadder()?.markSceneStart();
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
    // The paper lives on the UI scene as a multiply sheet (paperSheet.ts): the UI camera
    // renders last over this same canvas, so one sheet ages world and chrome together and
    // this scene needs no pass of its own. (?fx=shader restores the old filter, UI-side.)
    this.settlements = new SettlementRenderer(this, this.mapItems, this.mapRenderer.palette);
    this.traffic = new TrafficRenderer(this, this.mapRenderer, this.mapItems);
    this.birds = new BirdRenderer(this);
    this.overlays = new OverlayRenderer(this, this.mapRenderer);
    this.armies = new ArmyRenderer(this, this.mapItems);
    this.seasons = new SeasonRenderer(this);
    this.computeWorldBounds();
    this.touch = new TouchController(this);
    this.touch.enableFullscreenKey();
    // Deliberately no `setBounds`. Phaser's clamp assumes a camera that zooms about its centre and
    // corrects the scroll by (height − height/zoom)/2 — right for the default origin, wrong for
    // this one at (0,0). With the render scale folded into the zoom that error is 422 design
    // units tall on a phone: the opening frame put the capital under the action bar and the
    // southern band of the map could never be scrolled to. Every place this scene moves the
    // camera clamps to the world itself, in the units the camera actually uses.
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

  private cleanup(): void {
    // First, before anything else: the handlers this scene hung on the UI scene's emitter.
    this.offUi();
    this.game.canvas.removeEventListener('pointerdown', this.domPointerDown);
    this.game.canvas.removeEventListener('pointermove', this.domPointerMove);
    this.game.canvas.removeEventListener('pointerup', this.domPointerUp);
    this.game.canvas.removeEventListener('mousedown', this.domMouseDown);
    this.game.canvas.removeEventListener('mousemove', this.domMouseMove);
    this.game.canvas.removeEventListener('mouseup', this.domMouseUp);
    this.game.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.seasons?.destroy();
    this.birds?.destroy();
    this.armies?.destroy();
    // The bake belongs to the display list, which Phaser tears down on shutdown — but the *scene
    // instance* is reused across `scene.start`, so this field survived pointing at a destroyed
    // RenderTexture. On the second entry `bakeStaticTerrain` saw a truthy handle, skipped
    // re-creating it, and `clear()` dereferenced a null GL binding.
    //
    // The throw was caught and warned, which is what made it so expensive to miss: the bake bailed
    // *before* hiding the source layers, so every static layer under depth 1.5 went on drawing live,
    // every frame, for the rest of the run. Roughly 160k fill and upload commands a frame instead of
    // one textured quad — the "second fight is unplayable" bug.
    this.staticBakeRT = undefined;
    this.lastBakedRenderMode = undefined;
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

  /**
   * Handlers this scene has hung on the UI scene's emitter, so `cleanup` can take them off again.
   *
   * The UI scene's `events` emitter survives `scene.stop()` (Phaser only clears it on `destroy`),
   * and both scene instances are reused across runs — so a handler registered here without being
   * removed is registered *again* by the next run's `create`. Measured: after three runs every
   * `state-changed` rebuilt the HUD three times and every land action ran three times.
   */
  private uiHandlers: Array<[string, (...args: unknown[]) => void]> = [];

  /** Registers on the UI scene's emitter and remembers the pair so `cleanup` can undo it. */
  protected onUi<T extends unknown[]>(key: string, fn: (...args: T) => void): void {
    this.scene.get(this.uiSceneKey()).events.on(key, fn);
    this.uiHandlers.push([key, fn as unknown as (...args: unknown[]) => void]);
  }

  private offUi(): void {
    const ui = this.scene.get(this.uiSceneKey());
    for (const [key, fn] of this.uiHandlers) {
      ui.events.off(key, fn);
    }
    this.uiHandlers = [];
  }

  protected registerUiEvents(): void {
    this.onUi('ui:land-action', (action: string, landId: string, heroId?: string) => {
      this.handleLandAction(action, landId, heroId);
    });
    this.onUi('ui:hero-pick', (heroId: string) => {
      recruitHero(this.state, heroId);
      this.refresh();
    });
    this.onUi('ui:hero-mission', (heroId: string, targetKingdomId?: string) => {
      dispatchHeroMission(this.state, heroId, targetKingdomId);
      this.refresh();
    });
    this.onUi('ui:hero-ability', (heroId: string) => {
      useHeroAbility(this.state, heroId);
      this.refresh();
    });
    this.onUi('ui:hero-event-choice', (choiceId: string) => {
      resolveHeroEvent(this.state, choiceId);
      this.refresh();
    });
    this.onUi('ui:politics-choice', (choiceId: string) => {
      choosePoliticsCard(this.state, choiceId);
      this.refresh();
    });
    this.onUi('ui:foreign-choice', (choiceId: string) => {
      resolveForeignChoice(this.state, choiceId);
      this.refresh();
    });
    this.onUi('ui:battle-decision', (decision: 'attack' | 'delegate' | 'retreat') => {
      resolvePendingBattle(this.state, decision);
      this.refresh();
    });
    this.onUi('ui:attack-land', (armyId: string, landId: string, stance: 'assault' | 'balanced' | 'cautious') => {
      attackLand(this.state, armyId, landId, stance);
      this.refresh();
    });
    this.onUi('ui:retreat-siege', (armyId: string, landId: string) => {
      cancelSiege(this.state, armyId, landId);
      this.refresh();
    });
    this.onUi('ui:create-army', (heroId: string, soldiers: number, food: number, supplies: number, composition: 'balanced' | 'spears' | 'archers' | 'shock') => {
      queueRecruitment(this.state, heroId, soldiers, food, supplies, composition);
      this.refresh();
    });
    this.onUi('ui:disband-army', (armyId: string) => {
      disbandArmy(this.state, armyId);
      this.refresh();
    });
    this.onUi('ui:zoom-map', (direction: number) => {
      this.zoomMap(direction);
    });
    this.onUi('ui:toggle-render-mode', () => {
      this.state.mapRenderMode = this.state.mapRenderMode === 'terrain' ? 'control' : 'terrain';
      this.applyRenderMode();
      this.scene.get(this.uiSceneKey()).events.emit('state-changed');
    });
    this.onUi('ui:save-snapshot', () => {
      const snapshot = saveSnapshot(this.state);
      this.state.message = snapshot ? t('msg.snapshotSaved') : t('msg.saveUnavailable');
      this.refresh();
    });
    this.onUi('ui:exit-to-menu', (saveFirst: boolean) => {
      if (saveFirst) {
        saveSnapshot(this.state);
      }
      this.scene.stop(this.uiSceneKey());
      this.scene.start('MenuScene');
    });
    this.onUi('ui:pan-camera', (worldX: number, worldY: number) => {
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
    this.onUi('ui:clear-selection', () => {
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
    this.birds.setPaused(halted);
    this.seasons.setPaused(halted);
  }

  /**
   * Registers every live map object with the view index.
   *
   * Re-run after each `refresh()`, because the objects themselves are rebuilt there — a settlement
   * node is destroyed and recreated when its buildings change, an army marker when its host does.
   * Ids are stable across those rebuilds, which is what lets `ViewIndex.set` hand a replacement the
   * cull state its predecessor had.
   */
  private syncCullables(): void {
    const live = new Set<string>();

    for (const [landId, node] of this.landNodes) {
      const id = `land::${landId}`;
      live.add(id);
      // A settlement reaches well below its land centre — walls, the grove, and the name plate
      // sitting 58px under a walled seat — so the reach is generous rather than tight.
      this.viewIndex.set(id, {
        kind: 'node',
        x: node.x,
        y: node.y,
        radius: 140,
        setCulled: (culled) => node.setVisible(!culled),
      });
    }

    // Live settlement ink (the high tier) is scene-level Graphics, not part of the node — the
    // camera reaches maybe a tenth of the world, so the other nine tenths must not replay their
    // town clusters every frame. Same anchor and reach as the node whose ink it is.
    if (liveSettlementInk()) {
      for (const [landId, ink] of this.landInk) {
        const node = this.landNodes.get(landId);
        if (!node) continue;
        const id = `ink::${landId}`;
        live.add(id);
        this.viewIndex.set(id, {
          kind: 'node',
          x: node.x,
          y: node.y,
          radius: 140,
          setCulled: (culled) => {
            for (const g of ink) g.setVisible(!culled);
          },
        });
      }
    }

    for (const [landId, label] of this.landLabels) {
      const id = `label::${landId}`;
      live.add(id);
      this.viewIndex.set(id, {
        kind: 'label',
        x: label.x + (this.landNodes.get(landId)?.x ?? 0),
        y: label.y + (this.landNodes.get(landId)?.y ?? 0),
        radius: 80,
        setCulled: (culled) => label.setVisible(!culled),
      });
    }

    for (const [landId, flag] of this.flagMarkers) {
      const id = `flag::${landId}`;
      live.add(id);
      this.viewIndex.set(id, {
        kind: 'flag',
        x: flag.x,
        y: flag.y,
        radius: 60,
        setCulled: (culled) => flag.setVisible(!culled),
      });
    }

    for (const { id: armyId, object } of this.armies.cullTargets()) {
      const id = `army::${armyId}`;
      live.add(id);
      // Wider than the marker: between refreshes it tweens along a whole leg of its march, and
      // re-indexing it every frame would cost more than the one object it saves.
      this.viewIndex.set(id, {
        kind: 'army',
        x: object.x,
        y: object.y,
        radius: 200,
        setCulled: (culled) => object.setVisible(!culled),
      });
    }

    for (const target of this.traffic.cullTargets()) {
      live.add(target.id);
      this.viewIndex.set(target.id, {
        kind: 'traffic',
        x: target.x,
        y: target.y,
        radius: target.radius,
        setCulled: (culled) => this.traffic.setCulled(target.id, culled),
      });
    }

    for (const target of this.overlays.cloudTargets()) {
      live.add(target.id);
      this.viewIndex.set(target.id, {
        kind: 'cloud',
        x: target.x,
        y: target.y,
        radius: target.radius,
        setCulled: (culled) => this.overlays.setCloudCulled(target.id, culled),
      });
    }

    this.viewIndex.retainOnly(live);
    // The roster just changed, so the pose cache cannot vouch for the new entries.
    this.syncViewCulling(true);
  }

  /**
   * The detail this device drops at this zoom.
   *
   * Zoomed out, the small live things stop being read and start being texture: an ox-cart is three
   * pixels, and a name plate is type too small to spell a province. Which of them go is the player's
   * Graphics setting rather than one rule for every phone — a device with fill rate to spare has no
   * reason to lose anything, and the tier is already the honest answer to what a device can afford.
   */
  private suppressedDetail(): CullKind[] {
    const threshold = lodZoomThreshold();
    if (threshold === undefined || this.mapZoom >= threshold) {
      return [];
    }
    return lodDropsLabels() ? ['traffic', 'label'] : ['traffic'];
  }

  /**
   * Hides what the camera cannot reach, and stops what animates out there.
   *
   * The map is 2244x3030 and the camera sees between 1.8% and 9.3% of it, so this is the difference
   * between drawing the country and drawing the province the player is looking at. Gated on the
   * camera pose: a still camera costs one string compare, and the work only happens while panning.
   */
  protected syncViewCulling(force = false): void {
    if (CULLING_DISABLED) {
      return;
    }
    const camera = this.cameras.main;
    const pose = `${Math.round(camera.scrollX)}|${Math.round(camera.scrollY)}|${camera.zoom.toFixed(3)}`;
    const lodChanged = this.viewIndex.setSuppressed(this.suppressedDetail());
    if (!force && !lodChanged && pose === this.lastCullPose) {
      return;
    }
    this.lastCullPose = pose;

    // Built from scroll and zoom rather than read off `camera.worldView`, which Phaser only
    // recomputes in preRender. The first cull runs at the end of `drawMap`, before any frame has
    // been rendered, where `worldView` is still empty — and because scroll and zoom are already
    // final by then, the pose cache would have locked that answer in and culled the whole map,
    // player's capital included. The camera's origin is (0,0), so scroll is the top-left corner.
    const view = new Phaser.Geom.Rectangle(
      camera.scrollX,
      camera.scrollY,
      camera.width / camera.zoom,
      camera.height / camera.zoom,
    );
    this.viewIndex.apply(view, CULL_MARGIN);
  }

  update(time: number, delta: number): void {
    this.syncWorldMotion();
    // Before the halt check: a paused map can still be panned, and the player scrolling a stopped
    // world is exactly when they are looking hardest at what is on it.
    this.syncViewCulling();
    if (this.isWorldHalted()) {
      return;
    }
    // After the halt check, so a stopped clock stops the weather with the rest of the world.
    this.seasons.update(time, delta);

    this.state.realtimeSeconds += delta / 1000;
    this.realtimeAccumulator += delta;

    if (this.realtimeAccumulator >= REALTIME_TICK_MS) {
      // Carry the remainder (capped at one tick) instead of zeroing: dropped slack made the
      // month clock drift behind wall time by up to a tick's worth on every slow frame.
      this.realtimeAccumulator = Math.min(this.realtimeAccumulator - REALTIME_TICK_MS, REALTIME_TICK_MS);
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
        const landId = this.resolveTapLand(pointer.worldX, pointer.worldY);
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

  /**
   * The render-side land lookup, rebuilt when the roster changes shape.
   *
   * Lands are fixed at generation today, so this is built once — but a mode that ever adds one
   * would otherwise get a silently stale index, and the size check costs a property read.
   */
  private landAt(landId: string): Land | undefined {
    if (this.landById.size !== this.state.lands.length) {
      this.landById.clear();
      for (const land of this.state.lands) {
        this.landById.set(land.id, land);
      }
    }
    return this.landById.get(landId);
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

    this.redrawLandNodes();
    this.drawFlagMarkers();

    this.drawArmies();
    this.updateArmyHighlight();
    this.drawFogOfWar();
    this.drawFillerFogOfWar();
    this.drawForeignHaze();
    this.bakeFog();
    this.birds.create(this.worldWidth, this.worldHeight, this.state.mapConfig.seed);
    this.drawAcquisitionMarkers();
    this.drawBuildMarkers();
    this.drawSiegeMarkers();
    this.drawRecruitMarkers();
    this.drawBattleMarkers();
    this.bakeStaticTerrain();
    // Created after the bake so the seasonal layers are added above it, and settled straight into
    // the current season with no opening fade.
    this.seasons.create(
      this.state.season,
      this.landscapeGeometry(),
      this.mapRenderer.theme.id === 'dong-ho' && seasonVisualsEnabled(),
    );
    this.renderedSeason = this.state.season;
    for (const layer of RENDER_LAYERS) {
      this.renderSignatures[layer] = this.getSignature(layer);
    }
    // `create()` draws the map and then waits for the first economy tick, several seconds away, so
    // without this the opening view is the one part of the game that renders entirely unculled.
    this.syncCullables();
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
        const sourceLand = sourceTile?.landId ? this.landAt(sourceTile.landId) : undefined;
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
      const sourceLand = tile.landId ? this.landAt(tile.landId) : undefined;
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

  /**
   * The map's geometry, in the shape both the landscape renderer and the seasonal layers want.
   *
   * Shared so the season's accents land on exactly the cells the terrain pass drew, using one
   * definition of "visible" rather than two that can drift apart.
   */
  private landscapeGeometry(): SeasonScape {
    const hexSize = this.state.mapConfig.hexSize;
    return {
      tiles: this.state.hexTiles,
      tileSize: hexSize * MAP_SCALE,
      centreOf: (tile) => {
        const pixel = axialToPixel(tile.coord, hexSize);
        return { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      },
      isVisible: (tile) => {
        const land = tile.landId ? this.landAt(tile.landId) : undefined;
        return !land || land.isVisible;
      },
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
    };
  }

  private repaintHexTerrain(): void {
    const graphics = this.terrainGraphics;
    const decorationGraphics = this.terrainDecorationGraphics;
    graphics.clear();
    decorationGraphics.clear();
    const hexSize = this.state.mapConfig.hexSize;
    const rng = createRng(this.state.mapConfig.seed + 9001);
    // Two seasons are in play here, deliberately.
    //
    // The terrain FILL is pinned to `BAKE_SEASON`: it is the expensive half of this pass, it only
    // needs redrawing when a province changes hands, and repainting it every few seconds is what
    // ruled a seasonal map out in the first place.
    //
    // The DECORATION layer above it — every growing thing, and the soft ground cast under them —
    // follows the calendar, and is re-inked on its own by `rebakeScenery()`. Both are set
    // explicitly rather than left to the module default, because the menu diorama sets the real
    // season on its way in and that must not leak into the map.
    setRenderSeason(BAKE_SEASON);
    setFoliageSeason(this.state.season);

    // A renderer that draws the whole landscape at once owns terrain entirely — ranges, field
    // systems and prop scatters have to cross cell boundaries to look like a country, which the
    // per-hex loop below structurally cannot do. It is wrapped because that renderer owns the
    // layer wholesale: if it throws, the map would be blank rather than merely old-looking.
    if (this.mapRenderer.drawLandscape) {
      try {
        const geometry = this.landscapeGeometry();
        this.mapRenderer.drawLandscape({
          graphics,
          decoration: decorationGraphics,
          tiles: geometry.tiles,
          tileSize: geometry.tileSize,
          centreOf: geometry.centreOf,
          centreAt: (q, r) => {
            const pixel = axialToPixel({ q, r }, hexSize);
            return { x: this.wx(pixel.x), y: this.wy(pixel.y) };
          },
          isVisible: geometry.isVisible,
          settlementAnchors: this.settlementAnchors(),
        });
        return;
      } catch (error) {
        console.warn('Landscape renderer failed; falling back to per-hex terrain:', error);
        graphics.clear();
        decorationGraphics.clear();
      }
    }

    for (const tile of this.state.hexTiles) {
      const land = tile.landId ? this.landAt(tile.landId) : undefined;
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
          const land = tile.landId ? this.landAt(tile.landId) : undefined;
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

      const land = tile.landId ? this.landAt(tile.landId) : undefined;
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
      const land = tile.landId ? this.landAt(tile.landId) : undefined;
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
    // `scene` is nulled by `GameObject.destroy()`, so this catches a handle that outlived its
    // display list even if something else forgets to clear the field.
    // The wanted scale, stepped down only if the world texture would pass the device's
    // MAX_TEXTURE_SIZE - past it the GL call fails and the whole ground renders black.
    const bake = fitBakeScale(this, this.worldWidth, this.worldHeight, bakeScale());
    if (this.staticBakeRT && !this.staticBakeRT.scene) {
      this.staticBakeRT = undefined;
    }
    const bakeW = Math.ceil(this.worldWidth * bake);
    const bakeH = Math.ceil(this.worldHeight * bake);
    // A rung change mid-run changes the bake density; an RT sized for the old one would silently
    // bake soft (or waste the memory the step down was meant to reclaim). Compared through the
    // size that was ASKED for: Phaser rounds RT dimensions up (1683 comes back 1684), so holding
    // the guard against `rt.width` would destroy and rebuild the texture on every single bake.
    if (this.staticBakeRT && this.staticBakeRT.getData('bakeSize') !== `${bakeW}x${bakeH}`) {
      this.staticBakeRT.destroy();
      this.staticBakeRT = undefined;
    }
    if (!this.staticBakeRT) {
      // Texture is baked at the density above, then displayed scaled back to world size.
      // Depth 1.3: UNDER the settlement band [1.40, 1.50), which renders live on tiers with
      // `liveSettlementInk()` and must draw over the baked ground (at 1.9 the fresh bake
      // painted straight over the live towns — measured as "the buildings vanished"). On
      // baking tiers the band is hidden, so 1.3 and the old 1.9 are indistinguishable.
      this.staticBakeRT = this.add.renderTexture(0, 0, bakeW, bakeH)
        .setOrigin(0, 0)
        .setScale(1 / bake)
        .setDepth(1.3)
        .setData('bakeSize', `${bakeW}x${bakeH}`);
    }

    const settlementsLive = liveSettlementInk();
    type BandLayer = Phaser.GameObjects.GameObject & { depth: number; visible: boolean; setVisible(v: boolean): unknown };
    const band = this.children.list.filter((obj): obj is BandLayer => {
      const depth = (obj as unknown as { depth?: unknown }).depth;
      return obj !== this.staticBakeRT && typeof depth === 'number' && depth <= 1.5
        && !(settlementsLive && depth >= SETTLEMENT_BAND_FLOOR);
    });

    // Show every candidate source, then hide the layers that belong to the inactive
    // render mode so the composite matches what the live layers used to show.
    for (const source of band) source.setVisible(true);
    // A live settlement band is excluded from the sweep above, so nothing below re-shows it —
    // and a rung that just stepped UP into live ink inherits pieces a previous bake hid.
    if (settlementsLive) {
      for (const obj of this.children.list) {
        const depth = (obj as unknown as { depth?: unknown }).depth;
        if (obj !== this.staticBakeRT && typeof depth === 'number'
          && depth >= SETTLEMENT_BAND_FLOOR && depth <= 1.5) {
          (obj as unknown as { setVisible(v: boolean): unknown }).setVisible(true);
        }
      }
    }
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

    // Most sources are Graphics anchored at world origin, where a scale is enough; the harvested
    // settlement ink is *positioned*, and `RenderTexture.draw` on WebGL offsets by the object's
    // own x/y — so a positioned source must also stand at its scaled position for the draw, and
    // be put back afterwards whatever happens.
    const scalable = visible as unknown as Array<{ x: number; y: number; setScale(v: number): unknown; setPosition(x: number, y: number): unknown }>;
    const homes = scalable.map((source) => ({ x: source.x, y: source.y }));
    const restore = (): void => {
      for (let i = 0; i < scalable.length; i += 1) {
        scalable[i].setScale(1);
        scalable[i].setPosition(homes[i].x, homes[i].y);
      }
    };
    for (const source of scalable) {
      source.setScale(bake);
      if (source.x !== 0 || source.y !== 0) source.setPosition(source.x * bake, source.y * bake);
    }
    try {
      this.staticBakeRT.clear();
      this.staticBakeRT.draw(visible, 0, 0);
      // Phaser 4 queues `clear`/`draw` into a command buffer; `render` is what executes them.
      // It must happen here, before the loop below puts the sources back to scale 1 and hides
      // them — a deferred flush would replay the buffer against layers that had already moved.
      this.staticBakeRT.render();
    } catch (error) {
      // A context loss racing the guard above can still null the GL bindings mid-bake;
      // keep the live layers visible and recover on the next restore instead of throwing.
      console.warn('Static terrain bake skipped (renderer unavailable):', error);
      restore();
      return;
    }
    restore();

    for (const source of band) source.setVisible(false);
    this.lastBakedRenderMode = this.state.mapRenderMode;

    // Whatever that cost, it was not the frame rate. `create()` already holds the ladder for the
    // first bake, but on a fixed 1500 ms guess — and the bake runs again on a season turn, a
    // render-mode switch and a context restore, none of which `create()` covers. Saying it here
    // covers all of them, and says it after the work rather than in the hope of outlasting it.
    qualityLadder()?.forgetWindow(1200);
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
    this.overlays.createFogLayer(
      this.state,
      this.hexTileMap,
      (value) => this.wx(value),
      (value) => this.wy(value),
      this.fogFrontier(),
    );
  }

  private drawFillerFogOfWar(): void {
    this.fillerFogGraphics = this.add.graphics();
    this.fillerFogGraphics.setDepth(77.5);
    this.repaintFillerFogOfWar();
  }

  private drawForeignHaze(): void {
    this.foreignHazeGraphics = this.overlays.createForeignHazeLayer(
      this.state,
      this.hexTileMap,
      (value) => this.wx(value),
      (value) => this.wy(value),
    );
  }

  private repaintForeignHaze(): void {
    this.overlays.repaintForeignHaze(
      this.state,
      this.hexTileMap,
      (value) => this.wx(value),
      (value) => this.wy(value),
    );
  }

  /** Bakes the static fog tint (main + filler) into a cached texture. Must run after
   *  both fog layers have been repainted for the current visibility state. */
  private bakeFog(): void {
    if (typeof window !== 'undefined' && /[?&]nobake=1\b/.test(window.location.search)) {
      return; // diagnostic: leave live fog Graphics visible to compare against the bake
    }
    if (this.fillerFogGraphics) {
      const extra = [this.fillerFogGraphics];
      if (this.foreignHazeGraphics) {
        extra.push(this.foreignHazeGraphics);
      }
      // The fog is soft-edged cloud by design — density above 1 would spend the dense bake's
      // whole VRAM budget again on blur that cannot be seen. Capped, whatever the tier asks.
      this.overlays.bakeFog(this.worldWidth, this.worldHeight, extra, Math.min(bakeScale(), 1));
    }
  }

  /**
   * The hidden ground the realm actually touches: the one province deep band of fog.
   *
   * Everything past it is left as bare paper — the chronicle simply has not reached it. That is the
   * fix for a cost curve that ran backwards: fog was painted over every hidden province, so the
   * opening position (three lands visible, thirty-nine fogged) was the most expensive the map ever
   * got, and it grew *cheaper* as the player explored. The fog layer was 364k fill commands at a
   * point when almost nothing had been discovered.
   */
  private fogFrontier(): ReadonlySet<string> {
    const frontier = new Set<string>();
    for (const land of this.state.lands) {
      if (land.isVisible) {
        continue;
      }
      for (const neighborId of land.neighbors) {
        if (this.landAt(neighborId)?.isVisible) {
          frontier.add(land.id);
          break;
        }
      }
    }
    return frontier;
  }

  private repaintFogOfWar(): void {
    this.overlays.repaintFogOfWar(
      this.state,
      this.hexTileMap,
      (value) => this.wx(value),
      (value) => this.wy(value),
      this.fogFrontier(),
    );
  }

  private repaintFillerFogOfWar(): void {
    if (!this.fillerFogGraphics) {
      return;
    }

    this.fillerFogGraphics.clear();
    const hexSize = this.state.mapConfig.hexSize;
    const frontier = this.fogFrontier();
    const hiddenGroups = new Map<string, { land: Land; centers: Array<{ x: number; y: number }> }>();

    for (const tile of this.fillerTiles) {
      const sourceLand = tile.landId ? this.landAt(tile.landId) : undefined;
      if (!sourceLand || sourceLand.isVisible || !frontier.has(sourceLand.id)) {
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

  /**
   * Pixel position of a land's settlement: its city/shrine cluster, or — for a village or mine with
   * no seat terrain — the nearest ground in the province a town could actually be built on.
   *
   * That last part used to be the province centroid, full stop, which put a handful of provinces'
   * houses on a limestone face every map. See `SettlementRenderer.getSeatCentre`.
   */
  /** Protected so subclasses can put their own marks on the seat rather than on the centroid. */
  protected getSettlementAnchor(land: Land): { x: number; y: number } {
    return this.settlements.getSeatCentre(this.state, land);
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
  /**
   * World-space centre of every visible settlement, for the scatter to keep clear of.
   *
   * `getSettlementAnchor` is the same source the label, the capital ring and the player's banner
   * already use, so the ground the scatter avoids is exactly the ground the town is drawn on.
   */
  private settlementAnchors(): Array<{ x: number; y: number }> {
    const anchors: Array<{ x: number; y: number }> = [];
    for (const land of this.state.lands) {
      if (!land.isVisible || !land.hasVillage) {
        continue;
      }
      const anchor = this.getSettlementAnchor(land);
      anchors.push({ x: this.wx(anchor.x), y: this.wy(anchor.y) });
    }
    return anchors;
  }

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
    //
    // Depth carries the node's position on the sheet, not a flat 2. Every node used to sit at
    // exactly the same depth, so Phaser fell back to display-list insertion order — which is
    // `state.lands` array order, i.e. the order the generator happened to emit provinces. Two
    // neighbouring towns therefore overlapped by accident of an array index, and a town could cover
    // one drawn well in front of it. The band is [2, 2.8), clear of the season wash at 3.
    //
    // NB this only works because land nodes are scene-level objects. **Phaser does not depth-sort
    // Container children** (`ContainerWebGLRenderer` renders `container.list` as-is), so `setDepth`
    // on anything *inside* one of these is silently a no-op — which is why every composite in
    // `settlements.ts` orders itself by painting order instead.
    const worldY = this.wy(land.y);
    const container = this.add.container(this.wx(land.x), worldY)
      .setDepth(2 + Phaser.Math.Clamp(worldY / Math.max(1, this.worldHeight), 0, 1) * 0.8);
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

    const label = this.createLandLabel(land, isPlayerCapital);
    container.add(label);
    // Kept by hand as well as in the container, because the zoom LOD drops the name plates on the
    // lowest tier without dropping the town under them — each is a `Text` carrying its own canvas.
    this.landLabels.set(land.id, label);
    this.landNodes.set(land.id, container);
    this.harvestSettlementInk(land, container, label);
  }

  /**
   * Lifts a settlement's drawn ink out of its live node and into the static-bake band.
   *
   * A town cluster is hundreds of ink-path segments that never change between rebuilds, and as
   * live `Graphics` Phaser 4 re-triangulates all of them every frame. Everything drawn is moved
   * to scene level inside [1.40, 1.50) — under the `depth <= 1.5` bake sweep — so the next
   * `bakeStaticTerrain` flattens it into the cached texture; what must stay alive stays in the
   * node: the animals (Images, wandering), the name `Text`, and — on tiers whose zoom LOD drops
   * labels — the plate under the name, so the LOD can hide both together.
   *
   * The paint order inside a cluster is preserved exactly: `paintByGround` ordered the layers,
   * and the harvest walks the same list order, stepping depth per piece. The one accepted art
   * change: the animals, staying live above the bake, now stand in front of every roof — the
   * compromise this design chose over a third RenderTexture.
   */
  private harvestSettlementInk(
    land: Land,
    node: Phaser.GameObjects.Container,
    label: Phaser.GameObjects.Container,
  ): void {
    // The rollback switch: live settlement nodes exactly as before the harvest existed.
    if (typeof window !== 'undefined' && window.location.search.indexOf('noharvest=1') >= 0) {
      return;
    }
    const ink: Phaser.GameObjects.Graphics[] = [];
    const base = 1.41 + Phaser.Math.Clamp(node.y / Math.max(1, this.worldHeight), 0, 1) * 0.08;
    let step = 0;
    const walk = (root: Phaser.GameObjects.Container, ox: number, oy: number, depth: () => number): void => {
      for (const child of [...root.list]) {
        if (child instanceof Phaser.GameObjects.Graphics) {
          root.remove(child);
          child.setPosition(ox + child.x, oy + child.y);
          child.setDepth(depth());
          this.add.existing(child);
          ink.push(child);
        } else if (child instanceof Phaser.GameObjects.Container) {
          walk(child, ox + child.x, oy + child.y, depth);
        }
        // Images (the herd), Text and everything else stay live in the node.
      }
    };
    for (const child of [...node.list]) {
      if (child === label) continue;
      if (child instanceof Phaser.GameObjects.Graphics) {
        // The capital ring and any directly-held ink open the band.
        node.remove(child);
        child.setPosition(node.x + child.x, node.y + child.y);
        child.setDepth(1.4 + (step += 1) * 0.0001);
        this.add.existing(child);
        ink.push(child);
      } else if (child instanceof Phaser.GameObjects.Container) {
        walk(child, node.x + child.x, node.y + child.y, () => base + (step += 1) * 0.0001);
      }
    }
    if (!lodDropsLabels()) {
      walk(label, node.x + label.x, node.y + label.y, () => 1.495 + (step += 1) * 0.0001);
    }
    if (ink.length > 0) {
      this.landInk.set(land.id, ink);
    }
  }

  private createLandLabel(land: Land, isPlayerCapital: boolean): Phaser.GameObjects.Container {
    const labelText = isPlayerCapital ? `${this.shortName(land)} ${t('common.capital')}` : this.shortName(land);
    const label = this.add.text(0, 0, labelText, {
      // Lettered in the season now in play — `foliagePalette()` is the live half of the pair, the
      // terrain fill being pinned. These names are the only type standing in the world rather than
      // in the chrome, so with no full-screen wash outside winter they are one more place the
      // calendar can be read. Rewritten by `rebakeScenery()` -> `redrawLandNodes()` when it turns.
      color: foliagePalette().labelInk,
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
    //
    // 48, not 27, for a village: a settlement's props run from the seat down past its herd at +40,
    // so the old offset put the name plate in the middle of the village it names — over a roof
    // about as often as not. Below the herd it labels the settlement instead of sitting in it, and
    // `LABEL_KEEP_OUT` in the item renderer keeps the cluster's own props off the same strip.
    const isSeat = land.type === 'castle' || land.type === 'enemyCastle';
    const labelY = isSeat ? 58 : LABEL_KEEP_OUT.y;
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

    // Sized so `labelWorldRect` can read the plate back without re-deriving the text metrics.
    container.setSize(width, height);
    return container;
  }

  /**
   * Which province a tap at this point selects.
   *
   * The ground, by default. A mode overrides it to narrow the target — see `ConquestScene`, where
   * the name plate is the target and the ground is only the map.
   *
   * Deliberately a step in the *existing* tap path rather than a new interactive object on the
   * plate. This scene hit-tests at DOM level (`handleDomUp`) and drags the camera itself, so a
   * Phaser `setInteractive` on a label never receives the pointer at all: it was written that way
   * first, the plate reported `input` set with a 108x57 hit area, and the tap still did nothing.
   * One input path, one place to reason about it.
   */
  protected resolveTapLand(worldX: number, worldY: number): string | undefined {
    return this.findLandIdAt(worldX, worldY);
  }

  /**
   * The province whose name plate covers this point, if any.
   *
   * **Not the province under the point.** A plate is drawn below the settlement it names — 58
   * units down for a walled seat — which routinely puts it over a *neighbour's* hexes, so
   * resolving the tap through `findLandIdAt` selected the wrong province or none at all. That was
   * the whole of why the first attempt at this appeared to do nothing: the plate was being hit and
   * the answer was somebody else's land.
   *
   * Nearest centre wins where two plates overlap, so a tap in the seam goes to the name it is
   * closest to rather than to whichever province the map generator happened to emit first.
   */
  protected landAtLabel(worldX: number, worldY: number): string | undefined {
    let best: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const landId of this.landLabels.keys()) {
      if (!this.hasVisibleLabel(landId)) continue;
      const rect = this.labelWorldRect(landId);
      if (!rect || !Phaser.Geom.Rectangle.Contains(rect, worldX, worldY)) continue;
      const dx = worldX - (rect.x + rect.width / 2);
      const dy = worldY - (rect.y + rect.height / 2);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = landId;
      }
    }
    return best;
  }

  /** True while this province's name plate is drawn and not culled. */
  protected hasVisibleLabel(landId: string): boolean {
    const label = this.landLabels.get(landId);
    return Boolean(label?.visible && this.landNodes.get(landId)?.visible);
  }

  /**
   * The plate's rectangle in world units, padded to something a thumb can hit.
   *
   * The drawn plate is about sixteen points tall, which is a target barely better than the fault it
   * is meant to fix, so the hit area is grown well past the ink on every side.
   */
  protected labelWorldRect(landId: string): Phaser.Geom.Rectangle | undefined {
    const label = this.landLabels.get(landId);
    const node = this.landNodes.get(landId);
    if (!label || !node) return undefined;
    // The padding is **screen** pixels, converted into world units at the current zoom.
    //
    // Reported: *click to name of land ... it not work sometime*, and the "sometime" was the zoom.
    // A flat 14x16 of world padding is 14x16 of thumb only at 1:1; zoomed out to 0.6 it is nine by
    // ten, which is smaller than the fingertip aiming at it, and the tap lands on nothing. The
    // plate itself shrinks with the map — that is correct, it is drawn on the map — but the
    // forgiveness around it has to stay the same size as the finger.
    const zoom = Math.max(0.2, this.mapZoom || 1);
    const padX = 14 / zoom;
    const padY = 16 / zoom;
    const cx = node.x + label.x;
    const cy = node.y + label.y;
    const w = (label.width || 60) + padX * 2;
    const h = (label.height || 18) + padY * 2;
    return new Phaser.Geom.Rectangle(cx - w / 2, cy - h / 2, w, h);
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
    // **A host that is already marching is not being asked where to go.**
    //
    // The wash answers one question — where can I send this one? — and giving the order answers
    // it. But the order does not deselect the host, so every reachable province stayed lit for
    // the whole journey and after the arrival, until the player happened to tap open ground.
    // Reported as the highlight never going away.
    const marching = this.state.selectedArmyId
      ? this.state.movementOrders.some((order) => order.armyId === this.state.selectedArmyId)
      : false;
    if (this.state.selectedArmyId && !marching) {
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

  /**
   * Whether the five progress-badge layers need rebuilding.
   *
   * They are destroyed and recreated wholesale on every `refresh()`, which on a quiet tick throws
   * away and rebuilds badges identical to the ones just discarded. The camera is part of the
   * signature because `getVisibleLandMarkerPoint` clamps a badge to stay on screen, so a pan moves
   * it even when no order changed — quantised to 8 units so a drag does not rebuild every frame.
   */
  private getBadgeSignature(): string {
    const camera = this.cameras.main;
    const orders = [
      this.state.acquisitionOrders,
      this.state.buildOrders,
      this.state.siegeOrders,
      this.state.recruitmentOrders,
    ]
      .map((list) => list.map((order) => `${order.landId}:${order.progress}/${order.required}`).join(','))
      .join('|');
    // The live engagement is not an order and so is not in the list above, but it draws a badge
    // and its round advances every beat. Left out, the mark would appear only when some *other*
    // order happened to change and would then sit frozen on the round it was built at.
    // Every live field, not only the one under the player's hand — a general holding a province
    // draws the same mark, and its round advances on the same beat clock.
    const battle = liveBattles(this.state)
      .map((fight) => `${fight.landId}:${fight.round}/${fight.totalRounds}`).join(',');
    const view = `${Math.round(camera.scrollX / 8)}:${Math.round(camera.scrollY / 8)}:${camera.zoom.toFixed(2)}`;
    return `${orders}|${battle}|${view}|${this.state.selectedLandId ?? ''}`;
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

  /**
   * Shows the clash mark over every district where two hosts are actually fighting.
   *
   * A siege had a marker and an open engagement had none, so the one thing on the map that is
   * happening *right now* was the one thing the map did not draw: an invader and a host of ours
   * could be locked together in a province for four or five ticks with nothing over them but two
   * army markers, which look exactly like two armies standing still.
   *
   * **Every** live field. It read `activeBattle` alone, which was the whole war when it was
   * written; since `addSideBattle` the second and third fields are held by generals, and those
   * were exactly the fights the player had no way of seeing.
   *
   * Skipped where a siege badge already stands on the same district - that badge carries the same
   * blades with a wall under them, and it is the more specific statement of the two.
   */
  private drawBattleMarkers(): void {
    for (const marker of this.battleMarkers) {
      marker.destroy();
    }
    this.battleMarkers = [];

    for (const fight of liveBattles(this.state)) {
      if (this.state.siegeOrders.some((order) => order.landId === fight.landId)) {
        continue;
      }
      const land = findLand(this.state, fight.landId);
      if (!land?.isVisible) {
        continue;
      }

      const { x, y } = this.getVisibleLandMarkerPoint(land);
      // Rounds fought against the rounds the engagement is expected to run: the same "how far
      // through is this" the other four badges carry, for the one of them the player can still
      // change the answer to.
      const marker = this.mapItems.createProgressBadge(
        x, y, fight.round, Math.max(1, fight.totalRounds), 'battle',
      );
      marker.setDepth(72);
      this.battleMarkers.push(marker);
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
    const terrainChanged = this.updateSignature('terrain');
    const controlChanged = this.updateSignature('control');
    const fogChanged = this.updateSignature('fog');
    const roadsChanged = this.updateSignature('roads');
    const nodeChanged = this.updateSignature('node');

    if (terrainChanged) {
      this.drawBackgroundFillerTiles();
      this.repaintHexTerrain();
      this.repaintCoastBuffer();
    }

    if (controlChanged) {
      this.repaintControlMap();
      this.repaintAllZones();
      this.drawFlagMarkers();
    }

    if (fogChanged) {
      this.repaintFogOfWar();
      this.repaintFillerFogOfWar();
      this.repaintForeignHaze();
      this.bakeFog();
    }

    if (roadsChanged) {
      this.drawConnections();
      this.drawCarts();
      this.drawTravelers();
    }

    // The per-land signatures inside are the real gate; the sweep is cheap when nothing changed.
    const inkChanged = this.redrawLandNodes();
    void nodeChanged;

    if (terrainChanged) {
      // The accents are drawn per visible tile, so land coming out of the fog has to be given its
      // own. BEFORE the bake below: the accents live in the bake band now, so a repaint that
      // landed after the composite would stay invisible until the next one.
      this.seasons.setScape(this.landscapeGeometry());
    }

    // The fog keeps its own texture, so it is deliberately absent here: re-inking the fog must not
    // drag the ground, the ranges and the roads through a re-composite with it. Settlement ink
    // lives in the band too now, so a town rebuilding re-composites once, here.
    if (terrainChanged || controlChanged || roadsChanged || inkChanged) {
      this.bakeStaticTerrain();
    }

    this.syncSeasonVisuals();
    this.applyRenderMode();
    this.updateSelectionOutline();
    this.drawArmies();
    this.updateArmyHighlight();
    if (this.updateSignature('badge')) {
      this.drawAcquisitionMarkers();
      this.drawBuildMarkers();
      this.drawSiegeMarkers();
      this.drawRecruitMarkers();
      this.drawBattleMarkers();
    }
    this.syncCullables();
    this.events.emit('state-changed');
    this.scene.get(this.uiSceneKey()).events.emit('state-changed');
  }

  /**
   * Turns the world's look to the current season.
   *
   * Deliberately outside the `bakeChanged` branch above: the season changes far more often than
   * ownership does, so this must run whether or not the expensive layers were redrawn. It returns
   * immediately unless the season actually changed, so calling it every tick is free.
   */
  protected syncSeasonVisuals(): void {
    if (this.renderedSeason === this.state.season) {
      return;
    }
    this.renderedSeason = this.state.season;
    this.rebakeScenery();
    this.seasons.setScape(this.landscapeGeometry());
    this.seasons.sync(this.state.season);
  }

  /**
   * Turns the leaves. Re-inks every growing thing on the map, and the ground tone under it, in the
   * season now current.
   *
   * This is the path that replaced the full-screen seasonal wash. Only winter paints anything over
   * the world at all now — the year is read off the canopy, the grass, the ground cast and the name
   * plates — so those things have to be genuinely redrawn, and they live inside the static bake.
   *
   * Measured on a 4x-throttled mid-tier profile (`test_scripts/perf/measure-bake.mjs`, 1560 tiles, 42
   * lands): **110-220 ms across four runs, median ~170**, against 1200-1500 ms for the `refresh()`
   * this replaces. Roughly 2% of a seven-second ascent season, once per season. Budget for this
   * path is 250 ms — if a future scatter change pushes it past that, thin the plan rather than
   * going back to a full-screen wash.
   *
   * Three things buy the eleven-fold saving:
   *
   *  · the placement plan is reused, so no scatter generation and no spacing pass — see
   *    `DongHoMapRenderer.repaintScatter`;
   *  · the terrain fill, water, ranges and paddy are not touched, being pinned to `BAKE_SEASON`;
   *  · **no new RenderTexture.** The band layers are still resident `Graphics` after a bake, only
   *    hidden, so `bakeStaticTerrain` re-composites them from what is already in memory. The map
   *    already holds ~52 MB of textures; a second scenery buffer to cross-fade against was the one
   *    design this could not afford, which is why the leaves turn in a single frame rather than
   *    dissolving. A woodblock print does not dissolve either.
   *
   * `redrawLandNodes` is not incidental: a settlement's own grove and its banyan are live objects at
   * depth 2, outside the bake, and would otherwise stand in last season's green inside a re-inked
   * country. It also re-letters the name plates in `palette.labelInk`.
   */
  protected rebakeScenery(): void {
    setFoliageSeason(this.state.season);
    if (this.terrainDecorationGraphics && this.mapRenderer.repaintScatter) {
      this.mapRenderer.repaintScatter(this.terrainDecorationGraphics);
    }
    // At full strength, into the bake band, before the one composite below — the cross-fade
    // went with the layer's liveness (a woodblock print does not dissolve either; see above).
    this.seasons.bakeAccents(this.state.season);
    this.redrawLandNodes();
    this.bakeStaticTerrain();
  }

  /** Updates one cached render signature and reports whether it changed. */
  private updateSignature(kind: RenderLayer): boolean {
    const next = this.getSignature(kind);
    if (next === this.renderSignatures[kind]) {
      return false;
    }
    this.renderSignatures[kind] = next;
    return true;
  }

  /**
   * What each band of the map actually depends on.
   *
   * Keeping these apart is the whole point: a province changing hands does not move a hill, and a
   * province being *remembered* rather than seen changes only how heavily its fog is inked. Bundled
   * together, as they were, either of those repainted the ground, the water, the ranges, the paddy,
   * the fog and the roads alike.
   */
  private getSignature(kind: RenderLayer): string {
    switch (kind) {
      case 'terrain':
        return `${this.state.mapConfig.seed}|${this.state.lands.map((l) => (l.isVisible ? 1 : 0)).join('')}`;
      case 'control':
        return `${this.state.mapRenderMode}|${this.state.lands
          .map((l) => `${l.ownerId}${l.isVisible ? 1 : 0}`)
          .join('|')}`;
      case 'fog': {
        // The frontier is a function of visibility, so visibility is enough to key it — but
        // `isExplored` genuinely belongs here, and only here: it sets the fog's alpha and nothing else.
        //
        // The foreign haze is baked into the same texture, so what lifts it belongs here too:
        // which provinces are held, and which ones a host is standing on. Marching into a
        // province has to take the veil off it on the tick the host arrives.
        const occupied = new Set(
          this.state.armies
            .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
            .map((army) => army.landId),
        );
        return this.state.lands
          .map((l) => `${l.isVisible ? 1 : 0}${l.isExplored ? 1 : 0}${l.ownerId === PLAYER_KINGDOM_ID ? 1 : 0}${occupied.has(l.id) ? 1 : 0}`)
          .join('');
      }
      case 'roads':
        // Roads, carts and travellers run between visible settlements, and `hasVillage` is exactly
        // the test `TrafficRenderer` applies. Deliberately not keyed on buildings: a granary going
        // up must not rebuild the country's roads, which is what `diag-build.mjs` guards.
        return this.state.lands.map((l) => `${l.isVisible ? 1 : 0}${l.hasVillage ? 1 : 0}`).join('');
      case 'node':
        return this.getNodeSignature();
      default:
        return this.getBadgeSignature();
    }
  }

  /**
   * Signature of one land's live settlement node.
   *
   * The season is in here for a reason that is easy to lose: a node carries seasonal ink. Its name
   * plate is lettered in `foliagePalette().labelInk` and its grove and banyan are drawn in the
   * current foliage, and both are live objects at depth 2, outside the bake. `rebakeScenery()`
   * calls `redrawLandNodes()` for exactly that re-inking — so without the season here, the leaves
   * would turn across the country while every town stood in last season's green.
   */
  private landNodeSignature(land: Land): string {
    const buildings = land.buildings.map((building) => `${building.type}${building.level}`).join(',');
    // The era dresses the citadel (`setDrawnEra` inside the cluster build), so a dynasty turning
    // must re-ink the seat — without it the walls stayed fifteenth-century while the host outside
    // advanced through four dynasties.
    return `${land.ownerId}:${land.isVisible ? 1 : 0}:${buildings}:${this.state.season}:${figureEraFor(this.state)}`;
  }

  /** Signature of the live settlement nodes: visibility, ownership, buildings and season. */
  private getNodeSignature(): string {
    return this.state.lands.map((land) => `${land.id}:${this.landNodeSignature(land)}`).join('|');
  }

  /**
   * Rebuilds only the settlement nodes that actually changed.
   *
   * This used to destroy all 42 nodes and recreate them — each one a whole city/wall/road/building
   * composite plus a `Text` name plate with its own canvas texture — whenever *any* building
   * anywhere finished. The stored signature is the authority: a land whose signature is unchanged
   * is skipped whether or not it currently has a node, which is what keeps fogged lands (where
   * `createLandNode` returns early) from rebuilding on every pass.
   */
  private redrawLandNodes(): boolean {
    let changed = false;
    for (const land of this.state.lands) {
      const signature = this.landNodeSignature(land);
      if (this.nodeSignatures.get(land.id) === signature) {
        continue;
      }
      this.nodeSignatures.set(land.id, signature);
      changed = true;

      const existing = this.landNodes.get(land.id);
      if (existing) {
        existing.destroy(true);
        this.landNodes.delete(land.id);
        // The plate is a child of the node and dies with it; the separate handle must go too, or
        // the LOD would keep toggling a destroyed object.
        this.landLabels.delete(land.id);
      }
      // The harvested ink is scene-level now, so the node's destroy cannot reach it.
      for (const g of this.landInk.get(land.id) ?? []) g.destroy();
      this.landInk.delete(land.id);
      this.createLandNode(land);
    }
    return changed;
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
      // Sized to the ground it stands on, which it never was.
      //
      // `createPlayerLandFlag` draws 54 units from finial to base, and the map added it at its
      // natural size — on a sheet where a five-metre house is 11.2 px and a soldier 8.2. A province
      // marker was therefore **6.6 times a man's height and nearly five times a roof**, and it read
      // as a tower rather than as a standard: the biggest thing in the province was the pin saying
      // whose the province was.
      //
      // 0.55 puts it at ~30 px — taller than the dinh it flies beside, which is what a standard
      // should be, and still the thing your eye finds first when you are looking for your own land.
      // The host's own standard was already doing this properly at `FLAG_SCALE` 0.37.
      marker.setScale(MAP_LAND_FLAG_SCALE);
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
      this.isPointInPublishedChrome(x, y) ||
      y > GAME_HEIGHT - ACTION_BAR_HEIGHT
    );
  }

  /**
   * Chrome the HUD drew and told us about, rather than bands hand-copied from its layout.
   *
   * This replaced two fixed rectangles that tried to cover the zoom/mode stack. The stack moves —
   * it floats above the inspect card when a province is selected and above the battle sheet when a
   * preview is up — and the bands covered eight of its nine resting positions. On the ninth the
   * canvas tap handler claimed the press, selected the land underneath, and the re-render
   * destroyed the button before its release could land: the control was visible, pressable and
   * inert. The HUD publishes what it actually drew, so there is nothing left to fall between.
   */
  private isPointInPublishedChrome(x: number, y: number): boolean {
    return (window.__hudTapBounds ?? []).some((rect) => (
      x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
    ));
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

  /**
   * Opens on the player's citadel — the settlement itself, not the province's centroid. The town
   * is drawn on the fortress hexes, which can be most of a province away from the centroid, and
   * a first frame that centres bare ground beside the capital reads as the map having lost it.
   */
  protected centerCameraOnPlayerStart(): void {
    const camera = this.cameras.main;
    const zoom = this.mapZoom;
    const startLand = this.state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID && land.type === 'castle')
      ?? this.state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
    const anchor = startLand ? this.getSettlementAnchor(startLand) : undefined;
    const targetX = anchor ? this.wx(anchor.x) : this.worldWidth / 2;
    const targetY = anchor ? this.wy(anchor.y) : this.worldHeight / 2;

    camera.setScroll(
      Phaser.Math.Clamp(targetX - GAME_WIDTH / (2 * zoom), 0, Math.max(0, this.worldWidth - GAME_WIDTH / zoom)),
      Phaser.Math.Clamp(targetY - GAME_HEIGHT / (2 * zoom), 0, Math.max(0, this.worldHeight - GAME_HEIGHT / zoom)),
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
