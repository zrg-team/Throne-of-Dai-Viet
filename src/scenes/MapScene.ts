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
import { EDGE_DIRECTIONS, axialToPixel, hexCorners, hexKey, hexRoundedCorners, pixelToAxial } from '../map/hex';
import type { HexCoord } from '../map/hex';
import { createRng } from '../map/random';
import { TERRAIN_REGISTRY } from '../map/terrainTypes';
import { recruitHero } from '../systems/HeroSystem';
import { choosePoliticsCard } from '../systems/PoliticsSystem';
import { compactNumber } from '../utils/format';
import { SHEET_TOP } from '../ui/BottomSheet';

const MAP_SCALE = 1.72;
const MIN_CAMERA_ZOOM = 0.72;
const MAX_CAMERA_ZOOM = 1.65;
const CAMERA_ZOOM_STEP = 0.16;
const REALTIME_TICK_MS = 5500;

/** Deterministic small hash, used to seed per-road randomness from a stable key. */
function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export class MapScene extends Phaser.Scene {
  private state!: GameState;
  private touch!: TouchController;
  private landNodes = new Map<string, Phaser.GameObjects.Container>();
  private zoneGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private armyMarkers: Phaser.GameObjects.GameObject[] = [];
  private acquisitionMarkers: Phaser.GameObjects.GameObject[] = [];
  private buildMarkers: Phaser.GameObjects.GameObject[] = [];
  private mapGraphics!: Phaser.GameObjects.Graphics;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private controlGraphics!: Phaser.GameObjects.Graphics;
  private fogGraphics!: Phaser.GameObjects.Graphics;
  private hexTileMap = new Map<string, HexTile>();
  private landBoundaryLoops = new Map<string, Array<Array<{ x: number; y: number }>>>();
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
    this.selectionGraphics = this.add.graphics();
    this.selectionGraphics.setDepth(60);
    this.drawConnections();

    for (const land of this.state.lands) {
      this.createLandNode(land);
    }

    this.drawArmies();
    this.drawFogOfWar();
    this.drawAcquisitionMarkers();
    this.drawBuildMarkers();
  }

  private drawPaperBackground(): void {
    this.add.rectangle(0, 0, this.worldWidth, this.worldHeight, COLORS.paper).setOrigin(0, 0);
    this.add.rectangle(0, 0, this.worldWidth, this.worldHeight, 0xd7c9a8, 0.82).setOrigin(0, 0);
    this.mapGraphics = this.add.graphics();

    for (let index = 0; index < 190; index += 1) {
      const x = (index * 71) % this.worldWidth;
      const y = 40 + ((index * 43) % (this.worldHeight - 80));
      const color = index % 3 === 0 ? 0xf4e7c8 : index % 3 === 1 ? 0xbba987 : 0x8d806f;
      this.mapGraphics.fillStyle(color, 0.08);
      this.mapGraphics.fillEllipse(x, y, 100 + (index % 5) * 22, 38 + (index % 4) * 18);
    }
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
      // City/shrine platforms tile edge-to-edge with no chamfer so they read as one
      // seamless paved area rather than a grid of separate hexes.
      const isCityGround = tile.terrain === 'fortress' || tile.terrain === 'shrine';
      const rawCorners = isCityGround
        ? hexCorners(center, hexSize * MAP_SCALE * 1.01)
        : hexRoundedCorners(center, hexSize * MAP_SCALE);
      const corners = rawCorners.map(([x, y]) => ({ x, y }));

      graphics.fillStyle(TERRAIN_REGISTRY[tile.terrain].color, 1);
      graphics.fillPoints(corners, true);
    }

    for (const group of this.computeTerrainRegions()) {
      const terrain = TERRAIN_REGISTRY[group[0].terrain];
      const centers = group.map((tile) => {
        const pixel = axialToPixel(tile.coord, hexSize);
        return { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      });

      if (terrain.decorateRegion) {
        terrain.decorateRegion(graphics, centers, hexSize * MAP_SCALE, rng);
      } else if (terrain.decorate) {
        for (const center of centers) {
          terrain.decorate(graphics, center, hexSize * MAP_SCALE, rng);
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
      const corners = hexRoundedCorners(center, hexSize * MAP_SCALE).map(([x, y]) => ({ x, y }));
      const color = land?.isVisible ? this.getOwnerColor(land.ownerId) : COLORS.neutral;
      this.controlGraphics.fillStyle(color, land?.isVisible ? 0.88 : 0.45);
      this.controlGraphics.fillPoints(corners, true);
    }
  }

  private applyRenderMode(): void {
    this.terrainGraphics?.setVisible(this.state.mapRenderMode === 'terrain');
    this.controlGraphics?.setVisible(this.state.mapRenderMode === 'control');
  }

  private drawFogOfWar(): void {
    this.fogGraphics = this.add.graphics();
    this.fogGraphics.setDepth(78);
    this.repaintFogOfWar();
  }

  private repaintFogOfWar(): void {
    if (!this.fogGraphics) {
      return;
    }

    this.fogGraphics.clear();
    for (const land of this.state.lands) {
      if (land.isVisible) {
        continue;
      }

      this.fogGraphics.fillStyle(0xd7e4ea, land.isExplored ? 0.85 : 0.94);
      for (const loop of this.traceLandBoundaryLoops(land.id)) {
        this.fogGraphics.fillPoints(loop, true);
      }

      this.paintFogPuffs(land);
    }
  }

  /**
   * Paints a small cluster of overlapping rounded puffs over a hidden district, with a
   * darker shadow layer beneath and brighter highlight circles on top so the fog reads
   * as a cottony cloud rather than a flat tint.
   */
  private paintFogPuffs(land: Land): void {
    const seed = hashString(land.id);
    const baseRadius = Phaser.Math.Clamp(30 + land.buildingCapacity * 9, 38, 78);
    const alpha = land.isExplored ? 0.55 : 0.85;
    const centerX = this.wx(land.x);
    const centerY = this.wy(land.y);
    const puffCount = 6;

    const puffs: Array<{ x: number; y: number; radius: number }> = [];
    for (let index = 0; index < puffCount; index += 1) {
      const angle = ((seed + index * 67) % 360) * Phaser.Math.DEG_TO_RAD;
      const distance = baseRadius * (0.2 + (((seed >> (index * 3)) & 7) / 14));
      const radius = baseRadius * (0.45 + (((seed >> (index * 5)) & 3) * 0.14));
      puffs.push({
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance * 0.7,
        radius,
      });
    }

    // Shadow pass: slightly offset downward, gives the cloud cluster depth.
    this.fogGraphics.fillStyle(0xb9c7cd, alpha * 0.55);
    for (const puff of puffs) {
      this.fogGraphics.fillCircle(puff.x, puff.y + puff.radius * 0.22, puff.radius * 0.96);
    }

    // Body pass: soft white/grey puffs forming the bulk of the cloud.
    this.fogGraphics.fillStyle(0xf3f8fb, alpha);
    for (const puff of puffs) {
      this.fogGraphics.fillCircle(puff.x, puff.y, puff.radius);
    }

    // Highlight pass: brighter, smaller circles on the upper-left of each puff.
    this.fogGraphics.fillStyle(0xffffff, Math.min(1, alpha + 0.1));
    for (const puff of puffs) {
      this.fogGraphics.fillCircle(puff.x - puff.radius * 0.28, puff.y - puff.radius * 0.32, puff.radius * 0.55);
    }
  }

  private traceLandBoundaryLoops(landId: string): Array<Array<{ x: number; y: number }>> {
    const cached = this.landBoundaryLoops.get(landId);
    if (cached) {
      return cached;
    }

    const edges = this.traceLandBoundaryEdges(landId);
    const points = new Map<string, { x: number; y: number }>();
    const adjacency = new Map<string, Array<{ to: string; edgeIndex: number }>>();
    const pointKey = (x: number, y: number) => `${Math.round(x * 10)}:${Math.round(y * 10)}`;

    const addPoint = (x: number, y: number): string => {
      const key = pointKey(x, y);
      if (!points.has(key)) {
        points.set(key, { x, y });
      }
      return key;
    };

    const addAdjacent = (from: string, to: string, edgeIndex: number): void => {
      const list = adjacency.get(from) ?? [];
      list.push({ to, edgeIndex });
      adjacency.set(from, list);
    };

    edges.forEach(([x1, y1, x2, y2], edgeIndex) => {
      const from = addPoint(x1, y1);
      const to = addPoint(x2, y2);
      addAdjacent(from, to, edgeIndex);
      addAdjacent(to, from, edgeIndex);
    });

    const loops: Array<Array<{ x: number; y: number }>> = [];
    const used = new Set<number>();

    while (used.size < edges.length) {
      const startEdgeIndex = edges.findIndex((_, edgeIndex) => !used.has(edgeIndex));
      if (startEdgeIndex < 0) {
        break;
      }

      const [x1, y1, x2, y2] = edges[startEdgeIndex];
      const start = pointKey(x1, y1);
      let previous = start;
      let current = pointKey(x2, y2);
      used.add(startEdgeIndex);

      const loop = [points.get(start)!, points.get(current)!];
      while (current !== start) {
        const candidates = (adjacency.get(current) ?? []).filter((candidate) => !used.has(candidate.edgeIndex));
        if (candidates.length === 0) {
          break;
        }

        const next = candidates.find((candidate) => candidate.to !== previous) ?? candidates[0];
        used.add(next.edgeIndex);
        previous = current;
        current = next.to;
        loop.push(points.get(current)!);
      }

      if (loop.length > 3 && current === start) {
        loops.push(loop);
      }
    }

    this.landBoundaryLoops.set(landId, loops);
    return loops;
  }

  /** Groups contiguous hexes that share the same terrain type, for merged region decoration. */
  private computeTerrainRegions(): HexTile[][] {
    const visited = new Set<string>();
    const regions: HexTile[][] = [];

    for (const tile of this.state.hexTiles) {
      const key = hexKey(tile.coord);
      if (visited.has(key)) {
        continue;
      }

      const group: HexTile[] = [];
      const queue: HexTile[] = [tile];
      visited.add(key);

      while (queue.length > 0) {
        const current = queue.shift()!;
        group.push(current);

        for (const direction of EDGE_DIRECTIONS) {
          const neighborCoord = { q: current.coord.q + direction.q, r: current.coord.r + direction.r };
          const neighborKey = hexKey(neighborCoord);
          const neighborTile = this.hexTileMap.get(neighborKey);
          if (!neighborTile || visited.has(neighborKey) || neighborTile.terrain !== tile.terrain) {
            continue;
          }
          visited.add(neighborKey);
          queue.push(neighborTile);
        }
      }

      regions.push(group);
    }

    return regions;
  }

  /** Outlines each land's merged hex region in its owner's color (terrain fill stays untinted). */
  private drawZoneOverlays(): void {
    for (const land of this.state.lands) {
      const graphics = this.add.graphics();
      this.zoneGraphics.set(land.id, graphics);
    }

    this.repaintAllZones();
  }

  private repaintAllZones(): void {
    for (const land of this.state.lands) {
      this.paintZoneBorder(land);
    }
  }

  private paintZoneBorder(land: Land): void {
    const graphics = this.zoneGraphics.get(land.id);
    if (!graphics) {
      return;
    }

    graphics.clear();
    const edges = this.traceLandBoundaryEdges(land.id);
    const color = land.isVisible ? this.getOwnerColor(land.ownerId) : COLORS.neutral;

    // Dark base stroke keeps the border legible against any terrain color underneath.
    graphics.lineStyle(5, 0x2b2012, 0.32);
    for (const [x1, y1, x2, y2] of edges) {
      graphics.lineBetween(x1, y1, x2, y2);
    }

    graphics.lineStyle(2.5, color, 0.95);
    for (const [x1, y1, x2, y2] of edges) {
      graphics.lineBetween(x1, y1, x2, y2);
    }
  }

  /** Strokes the outer boundary of the selected land's merged hex region. */
  private updateSelectionOutline(): void {
    this.selectionGraphics.clear();
    const landId = this.state.selectedLandId;
    if (!landId) {
      return;
    }

    this.selectionGraphics.lineStyle(4, COLORS.selected, 0.95);
    for (const [x1, y1, x2, y2] of this.traceLandBoundaryEdges(landId)) {
      this.selectionGraphics.lineBetween(x1, y1, x2, y2);
    }
  }

  /** Edges of a land's merged hex region that border another land (or the map edge). */
  private traceLandBoundaryEdges(landId: string): Array<[number, number, number, number]> {
    const hexSize = this.state.mapConfig.hexSize;
    const edges: Array<[number, number, number, number]> = [];

    for (const tile of this.state.hexTiles) {
      if (tile.landId !== landId) {
        continue;
      }
      const pixel = axialToPixel(tile.coord, hexSize);
      const center = { x: this.wx(pixel.x), y: this.wy(pixel.y) };
      const corners = hexCorners(center, hexSize * MAP_SCALE);

      for (let edge = 0; edge < 6; edge += 1) {
        const direction = EDGE_DIRECTIONS[edge];
        const neighborCoord = { q: tile.coord.q + direction.q, r: tile.coord.r + direction.r };
        const neighborTile = this.hexTileMap.get(hexKey(neighborCoord));
        if (neighborTile?.landId === landId) {
          continue;
        }

        const [x1, y1] = corners[edge];
        const [x2, y2] = corners[(edge + 1) % 6];
        edges.push([x1, y1, x2, y2]);
      }
    }

    return edges;
  }

  /** Draws dirt roads connecting each land's settlement (village/city/castle/mine) to its neighbors. */
  private drawConnections(): void {
    const graphics = this.add.graphics();

    for (const land of this.state.lands) {
      for (const neighborId of land.neighbors) {
        const neighbor = this.state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor || land.id > neighbor.id) {
          continue;
        }

        const from = this.getSettlementAnchor(land);
        const to = this.getSettlementAnchor(neighbor);
        const curve = this.buildRoadCurve(from, to, `${land.id}|${neighbor.id}`);
        this.drawRoad(graphics, curve, this.roadWidth(land), this.roadWidth(neighbor));
      }
    }
  }

  /** Pixel position of a land's settlement (its city/shrine cluster, or its centroid for villages/mines). */
  private getSettlementAnchor(land: Land): { x: number; y: number } {
    return this.getCityCenter(land) ?? { x: land.x, y: land.y };
  }

  /** Roads are wider where they meet a bigger settlement: castles widest, then cities/temples, then villages/mines. */
  private roadWidth(land: Land): number {
    if (land.type === 'castle' || land.type === 'enemyCastle') {
      return 7 + land.buildings.length * 0.45;
    }
    if (land.type === 'market' || land.type === 'temple') {
      return 5 + land.buildings.length * 0.35;
    }
    return 3 + land.buildings.length * 0.25;
  }

  /**
   * A gently winding spline between two settlements: a couple of waypoints are nudged
   * sideways by a deterministic, seeded amount so the road meanders instead of running
   * dead straight.
   */
  private buildRoadCurve(from: { x: number; y: number }, to: { x: number; y: number }, seedKey: string): Phaser.Curves.Spline {
    const rng = createRng(this.state.mapConfig.seed + hashString(seedKey));
    const fromW = { x: this.wx(from.x), y: this.wy(from.y) };
    const toW = { x: this.wx(to.x), y: this.wy(to.y) };
    const dx = toW.x - fromW.x;
    const dy = toW.y - fromW.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;

    const points: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(fromW.x, fromW.y)];
    const waypointCount = length > 90 ? 2 : 1;
    for (let index = 1; index <= waypointCount; index += 1) {
      const t = index / (waypointCount + 1);
      const jitter = (rng() - 0.5) * length * 0.22;
      points.push(
        new Phaser.Math.Vector2(fromW.x + dx * t + normalX * jitter, fromW.y + dy * t + normalY * jitter),
      );
    }
    points.push(new Phaser.Math.Vector2(toW.x, toW.y));

    return new Phaser.Curves.Spline(points);
  }

  /**
   * Draws a dirt-road-styled curve as many short segments so its width can taper between
   * the two settlements it connects (wider at a castle, narrower at a village/mine), with
   * an earthy bed and a slightly lighter, narrower worn track on top.
   */
  private drawRoad(graphics: Phaser.GameObjects.Graphics, curve: Phaser.Curves.Spline, widthFrom: number, widthTo: number): void {
    const points = curve.getSpacedPoints(32);

    for (let index = 0; index < points.length - 1; index += 1) {
      const t = index / (points.length - 1);
      const width = Phaser.Math.Linear(widthFrom, widthTo, t);
      const a = points[index];
      const b = points[index + 1];

      graphics.lineStyle(width, 0x8a6f4e, 0.35);
      graphics.lineBetween(a.x, a.y, b.x, b.y);

      graphics.lineStyle(Math.max(1, width * 0.45), 0xd9c08f, 0.55);
      graphics.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  private createLandNode(land: Land): void {
    if (!land.isVisible) {
      return;
    }

    const container = this.add.container(this.wx(land.x), this.wy(land.y));
    const settlement = this.createSettlementCluster(land);
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
    const hexSize = this.state.mapConfig.hexSize;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const tile of this.state.hexTiles) {
      if (tile.landId !== land.id || (tile.terrain !== 'fortress' && tile.terrain !== 'shrine')) {
        continue;
      }
      const pixel = axialToPixel(tile.coord, hexSize);
      sumX += pixel.x;
      sumY += pixel.y;
      count += 1;
    }

    return count > 0 ? { x: sumX / count, y: sumY / count } : undefined;
  }

  /**
   * Cities/temples render one building cluster per "fortress"/"shrine" hex tile they own.
   * Castles get a surrounding wall; markets/temples don't. Built improvements grow density.
   */
  private createSettlementCluster(land: Land): Phaser.GameObjects.Container {
    const cluster = this.add.container(0, 0);
    const hexSize = this.state.mapConfig.hexSize;
    const cityCoords: HexCoord[] = [];
    let isShrineCity = false;

    for (const tile of this.state.hexTiles) {
      if (tile.landId !== land.id || (tile.terrain !== 'fortress' && tile.terrain !== 'shrine')) {
        continue;
      }
      cityCoords.push(tile.coord);
      if (tile.terrain === 'shrine') {
        isShrineCity = true;
      }
    }

    if (cityCoords.length === 0) {
      this.addResourceCluster(cluster, land);
      return cluster;
    }

    const isFortified = land.type === 'castle' || land.type === 'enemyCastle';
    if (isFortified) {
      this.addCityWall(cluster, cityCoords, land, hexSize);
    }

    const houseCount = Math.min(6, 3 + land.buildings.length);
    for (const coord of cityCoords) {
      const pixel = axialToPixel(coord, hexSize);
      const relX = (pixel.x - land.x) * MAP_SCALE;
      const relY = (pixel.y - land.y) * MAP_SCALE;
      this.addBuildingGroup(cluster, relX, relY, isShrineCity, houseCount);
    }

    this.addBuildingDecorations(cluster, land);

    return cluster;
  }

  /** Strokes the outer boundary of the city's contiguous hex cluster, following its actual shape. */
  private addCityWall(cluster: Phaser.GameObjects.Container, cityCoords: HexCoord[], land: Land, hexSize: number): void {
    const citySet = new Set(cityCoords.map(hexKey));
    const graphics = this.add.graphics();

    for (const coord of cityCoords) {
      const pixel = axialToPixel(coord, hexSize);
      const center = { x: (pixel.x - land.x) * MAP_SCALE, y: (pixel.y - land.y) * MAP_SCALE };
      const corners = hexCorners(center, hexSize * MAP_SCALE * 1.18);

      for (let edge = 0; edge < 6; edge += 1) {
        const direction = EDGE_DIRECTIONS[edge];
        const neighborCoord = { q: coord.q + direction.q, r: coord.r + direction.r };
        if (citySet.has(hexKey(neighborCoord))) {
          continue;
        }

        const [x1, y1] = corners[edge];
        const [x2, y2] = corners[(edge + 1) % 6];
        graphics.lineStyle(5, 0x5f5247, 0.85);
        graphics.lineBetween(x1, y1, x2, y2);
      }
    }

    cluster.add(graphics);
  }

  private addBuildingGroup(
    cluster: Phaser.GameObjects.Container,
    x: number,
    y: number,
    isShrine: boolean,
    houseCount: number,
  ): void {
    const count = isShrine ? 1 : houseCount;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));

    for (let index = 0; index < count; index += 1) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const px = x + (col - (cols - 1) / 2) * 8;
      const py = y + (row - (rows - 1) / 2) * 8;
      const house = this.add.rectangle(px, py, 6, 5, 0xf3e6c7, 0.92).setStrokeStyle(1, 0x9c835c, 0.5);
      const roof = this.add.triangle(px, py - 5, -4, 2, 4, 2, 0, -3, isShrine ? 0x87b58a : 0xb9823e, 0.88);
      cluster.add([house, roof]);
    }
  }

  /**
   * Draws small satellite icons around a city/temple settlement for each constructed
   * farm/mine/market building, so completed builds become visible on the map.
   */
  private addBuildingDecorations(cluster: Phaser.GameObjects.Container, land: Land): void {
    const positions: Array<[number, number]> = [
      [-48, -6], [48, -6], [-48, 24], [48, 24], [-48, 54], [48, 54],
    ];
    let posIndex = 0;

    for (const building of land.buildings) {
      const [x, y] = positions[posIndex % positions.length];
      posIndex += 1;

      if (building === 'farm') {
        this.addCropPatch(cluster, x, y, 0.85);
        this.addCottage(cluster, x, y + 5, 0.75, 0xb9823e);
      } else if (building === 'mine') {
        const mound = this.add.triangle(x, y + 4, -11 * 0.8, 7 * 0.8, 11 * 0.8, 7 * 0.8, 0, -8 * 0.8, 0x8d8a86, 0.92);
        const entrance = this.add.rectangle(x, y + 5, 5, 5, 0x3a3530, 0.9);
        cluster.add([mound, entrance]);
      } else if (building === 'market') {
        const stall = this.add.rectangle(x, y, 10, 6, 0xd9b35a, 0.92).setStrokeStyle(1, 0x7c4a2c, 0.5);
        const roof = this.add.triangle(x, y - 5, -6, 2, 6, 2, 0, -4, 0xb33b3b, 0.9);
        cluster.add([stall, roof]);
      }
    }
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
      const marker = this.add.container(this.wx(center.x) + 18, this.wy(center.y) - 28);
      const isPlayer = army.kingdomId === PLAYER_KINGDOM_ID;
      const bannerColor = isPlayer ? 0x0d7747 : 0x7d2d2d;
      const soldierColor = isPlayer ? 0x0b5f39 : 0x4c2020;
      const banner = this.add.rectangle(0, -18, 62, 22, bannerColor, 0.96).setOrigin(0.5);
      const text = this.add.text(0, -18, compactNumber(total), {
        color: '#fff6bd',
        fontSize: '11px',
        fontStyle: '700',
      }).setOrigin(0.5);
      marker.add([banner, text]);

      for (let index = 0; index < 22; index += 1) {
        const col = index % 6;
        const row = Math.floor(index / 6);
        const soldier = this.add.circle(-25 + col * 9, -2 + row * 8, 3.2, soldierColor, 0.92);
        const head = this.add.circle(-25 + col * 9, -6 + row * 8, 2.2, 0xf1d1a8, 0.92);
        this.tweens.add({
          targets: [soldier, head],
          y: `+=${index % 2 === 0 ? 1.5 : -1.5}`,
          duration: 420 + index * 14,
          yoyo: true,
          repeat: -1,
        });
        marker.add([soldier, head]);
      }
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
      const marker = this.add.container(x, y);
      marker.setDepth(72);
      const progress = Phaser.Math.Clamp(order.progress / order.required, 0, 1);
      const back = this.add.circle(0, 0, 17, 0x211103, 0.78).setStrokeStyle(2, 0xffde72, 0.95);
      const wedge = this.add.graphics();
      wedge.fillStyle(0xffde72, 0.88);
      wedge.slice(0, 0, 13, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + progress * 360), false);
      wedge.fillPath();
      const coin = this.add.circle(0, 0, 6, 0xd9b35a, 1).setStrokeStyle(1, 0x3b2410, 0.8);
      const text = this.add.text(0, 23, `${order.progress}/${order.required}`, {
        color: '#211103',
        fontSize: '10px',
        fontStyle: '700',
        backgroundColor: '#f3e6c4',
        padding: { x: 3, y: 1 },
      }).setOrigin(0.5);
      marker.add([back, wedge, coin, text]);
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
      const marker = this.add.container(x, y);
      marker.setDepth(72);
      const progress = Phaser.Math.Clamp(order.progress / order.required, 0, 1);
      const back = this.add.circle(0, 0, 17, 0x2c2210, 0.78).setStrokeStyle(2, 0x8fd97a, 0.95);
      const wedge = this.add.graphics();
      wedge.fillStyle(0x8fd97a, 0.88);
      wedge.slice(0, 0, 13, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + progress * 360), false);
      wedge.fillPath();
      const head = this.add.rectangle(0, -2, 10, 5, 0x9c835c, 1).setStrokeStyle(1, 0x3b2410, 0.8);
      const handle = this.add.rectangle(0, 3, 3, 9, 0x6f4a2a, 1);
      const text = this.add.text(0, 23, `${order.progress}/${order.required}`, {
        color: '#211103',
        fontSize: '10px',
        fontStyle: '700',
        backgroundColor: '#dff5cf',
        padding: { x: 3, y: 1 },
      }).setOrigin(0.5);
      marker.add([back, wedge, head, handle, text]);
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

  /** Lands without a fortress/shrine hex cluster (farms, iron mines) get a small themed village instead. */
  private addResourceCluster(cluster: Phaser.GameObjects.Container, land: Land): void {
    const developmentLevel = land.buildings.length;
    const scale = 1 + developmentLevel * 0.15;

    if (land.type === 'farm') {
      this.addFarmCluster(cluster, scale, developmentLevel);
    } else if (land.type === 'iron') {
      this.addMineCluster(cluster, scale, developmentLevel);
    } else {
      this.addBuildingGroup(cluster, 0, 0, false, Math.min(6, 2 + developmentLevel));
    }
  }

  /** Small house with a peaked roof, used to dress out farm/mine villages. */
  private addCottage(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number, roofColor: number): void {
    const w = 9 * scale;
    const h = 7 * scale;
    const house = this.add.rectangle(x, y, w, h, 0xf3e6c7, 0.94).setStrokeStyle(1, 0x9c835c, 0.5);
    const roof = this.add.triangle(x, y - h / 2 - 1, -w / 2, 0, w / 2, 0, 0, -h * 0.85, roofColor, 0.9);
    cluster.add([house, roof]);
  }

  /** Small striped patch of tilled soil, used to dress out the farm village. */
  private addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xd2c45a, 0.5);
    graphics.fillRect(x - 9 * scale, y - 6 * scale, 18 * scale, 12 * scale);
    graphics.fillStyle(0xeede9d, 0.4);
    for (let row = -1; row <= 1; row += 1) {
      const rowY = y + row * 3 * scale;
      graphics.fillRect(x - 8 * scale, rowY - 0.7 * scale, 16 * scale, 1.4 * scale);
    }
    cluster.add(graphics);
  }

  private addFarmCluster(cluster: Phaser.GameObjects.Container, scale: number, upgradeLevel: number): void {
    // Crop patches behind the buildings give the village some surrounding farmland.
    for (const [px, py] of [[-22, -10], [22, -8], [-20, 14], [20, 14]] as const) {
      this.addCropPatch(cluster, px * scale, py * scale, scale);
    }

    const barn = this.add.rectangle(0, 3 * scale, 13 * scale, 10 * scale, 0xc77b4f, 0.92).setStrokeStyle(1, 0x7c4a2c, 0.5);
    const barnRoof = this.add.triangle(0, 3 * scale - 6 * scale, -6.5 * scale, 0, 6.5 * scale, 0, 0, -7 * scale, 0x8b4a2c, 0.9);
    cluster.add([barn, barnRoof]);

    const cottagePositions: Array<[number, number]> = [
      [-15, -2],
      [15, -2],
      [-17, 13],
      [17, 13],
      [0, -14],
    ];
    const cottageCount = Math.min(cottagePositions.length, 2 + upgradeLevel);
    for (let index = 0; index < cottageCount; index += 1) {
      const [px, py] = cottagePositions[index];
      this.addCottage(cluster, px * scale, py * scale, scale, 0xb9823e);
    }
  }

  private addMineCluster(cluster: Phaser.GameObjects.Container, scale: number, upgradeLevel: number): void {
    const mound = this.add.triangle(0, 4 * scale, -16 * scale, 8 * scale, 16 * scale, 8 * scale, 0, -12 * scale, 0x8d8a86, 0.92);
    const entrance = this.add.rectangle(0, 6 * scale, 8 * scale, 8 * scale, 0x3a3530, 0.9);
    const cart = this.add.rectangle(15 * scale, 11 * scale, 7 * scale, 4 * scale, 0x9c835c, 0.92).setStrokeStyle(1, 0x5f5247, 0.6);
    cluster.add([mound, entrance, cart]);

    const cottagePositions: Array<[number, number]> = [
      [-18, 10],
      [18, -2],
      [-20, -4],
    ];
    const cottageCount = Math.min(cottagePositions.length, 1 + upgradeLevel);
    for (let index = 0; index < cottageCount; index += 1) {
      const [px, py] = cottagePositions[index];
      this.addCottage(cluster, px * scale, py * scale, scale, 0x9c835c);
    }
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
