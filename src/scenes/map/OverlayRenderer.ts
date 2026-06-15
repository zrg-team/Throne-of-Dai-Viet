/**
 * Map overlay layers drawn above the terrain: per-land ownership borders, the
 * selection outline, and fog-of-war tiles with drifting ink-cloud puffs over
 * hidden districts. Pairs with `InkMapRenderer` for border/cloud styling and
 * `src/map/boundary.ts` for the underlying region geometry.
 */
import Phaser from 'phaser';
import { COLORS, PLAYER_KINGDOM_ID } from '../../game/constants';
import { traceLandBoundaryEdges, traceLandBoundaryLoops } from '../../map/boundary';
import type { HexTile } from '../../map/hexMapGenerator';
import { hashString } from '../../utils/math';
import type { GameState, Land } from '../../state/types';
import type { InkMapRenderer } from '../../ui/MapRenderer';

type WorldTransform = (value: number) => number;
type OwnerColorLookup = (ownerId: string) => number;

export class OverlayRenderer {
  private zoneGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private cloudGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private landBoundaryLoops = new Map<string, Array<Array<{ x: number; y: number }>>>();
  private armyHighlightLoops = new Map<string, Array<Array<{ x: number; y: number }>>>();
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private fogGraphics!: Phaser.GameObjects.Graphics;
  private armyHighlightGraphics?: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly inkMap: InkMapRenderer,
  ) {}

  /** Outlines each land's merged hex region in its owner's color (terrain fill stays untinted). */
  createZoneLayers(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    getOwnerColor: OwnerColorLookup,
  ): void {
    for (const land of state.lands) {
      const graphics = this.scene.add.graphics();
      // Sit above the terrain fill but behind terrain decorations (mountains, forests,
      // etc.) so border ink strokes don't cut across painted scenery in front of them.
      graphics.setDepth(0.5);
      this.zoneGraphics.set(land.id, graphics);
    }

    this.repaintAllZones(state, hexTileMap, wx, wy, getOwnerColor);
  }

  repaintAllZones(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    getOwnerColor: OwnerColorLookup,
  ): void {
    for (const land of state.lands) {
      this.paintZoneBorder(state, hexTileMap, wx, wy, land, getOwnerColor);
    }
  }

  private paintZoneBorder(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    land: Land,
    getOwnerColor: OwnerColorLookup,
  ): void {
    const graphics = this.zoneGraphics.get(land.id);
    if (!graphics) {
      return;
    }

    graphics.clear();
    const edges = traceLandBoundaryEdges(state, hexTileMap, wx, wy, land.id);
    const color = land.isVisible ? getOwnerColor(land.ownerId) : COLORS.neutral;
    // Unowned territory borders fade into faint ink wash so the map doesn't read as a
    // dense grid of tiles; owned/claimed borders stay crisp as ownership signal.
    const alpha = color === COLORS.neutral ? 0.12 : 0.9;
    this.inkMap.drawZoneBorder(graphics, edges, color, alpha);
  }

  createSelectionLayer(): void {
    this.selectionGraphics = this.scene.add.graphics();
    this.selectionGraphics.setDepth(60);
  }

  /** Strokes the outer boundary of the selected land's merged hex region. */
  updateSelectionOutline(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
  ): void {
    this.selectionGraphics.clear();
    const landId = state.selectedLandId;
    if (!landId) {
      return;
    }

    this.selectionGraphics.lineStyle(4, COLORS.selected, 0.95);
    for (const [x1, y1, x2, y2] of traceLandBoundaryEdges(state, hexTileMap, wx, wy, landId)) {
      this.selectionGraphics.lineBetween(x1, y1, x2, y2);
    }
  }

  createFogLayer(state: GameState, hexTileMap: Map<string, HexTile>, wx: WorldTransform, wy: WorldTransform): void {
    this.fogGraphics = this.scene.add.graphics();
    this.fogGraphics.setDepth(78);
    this.repaintFogOfWar(state, hexTileMap, wx, wy);
  }

  repaintFogOfWar(state: GameState, hexTileMap: Map<string, HexTile>, wx: WorldTransform, wy: WorldTransform): void {
    if (!this.fogGraphics) {
      return;
    }

    this.fogGraphics.clear();
    const activeIds = new Set<string>();
    for (const land of state.lands) {
      if (land.isVisible) {
        continue;
      }

      this.fogGraphics.fillStyle(0xd7e4ea, land.isExplored ? 0.85 : 0.94);
      for (const loop of traceLandBoundaryLoops(state, hexTileMap, wx, wy, this.landBoundaryLoops, land.id)) {
        this.fogGraphics.fillPoints(loop, true);
      }

      activeIds.add(land.id);
      this.paintFogPuffs(land, wx, wy);
    }

    for (const [landId, graphics] of this.cloudGraphics) {
      if (!activeIds.has(landId)) {
        graphics.destroy();
        this.cloudGraphics.delete(landId);
      }
    }
  }

  /**
   * Paints a small cluster of overlapping rounded puffs over a hidden district, with a
   * darker shadow layer beneath and brighter highlight circles on top so the fog reads
   * as a cottony cloud rather than a flat tint. The cloud lives on its own Graphics layer
   * so it can slowly drift back and forth, independent of the static fog tint.
   */
  private paintFogPuffs(land: Land, wx: WorldTransform, wy: WorldTransform): void {
    const seed = hashString(land.id);
    const baseRadius = Phaser.Math.Clamp(30 + land.buildingCapacity * 9, 38, 78);
    const alpha = land.isExplored ? 0.55 : 0.85;
    const baseX = wx(land.x);
    const baseY = wy(land.y);

    let graphics = this.cloudGraphics.get(land.id);
    if (!graphics) {
      graphics = this.scene.add.graphics();
      graphics.setDepth(78);
      graphics.setPosition(baseX, baseY);
      this.cloudGraphics.set(land.id, graphics);

      const driftX = 5 + (seed % 5);
      const driftY = 3 + ((seed >> 3) % 4);
      const duration = 14000 + (seed % 9) * 1300;
      this.scene.tweens.add({
        targets: graphics,
        x: baseX + driftX,
        y: baseY + driftY,
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    graphics.clear();
    this.inkMap.drawCloud(graphics, 0, 0, baseRadius, seed, alpha);
  }

  /**
   * Soft gold highlight over every land the given army could be ordered to: its
   * own territory reachable via owned lands (BFS over `land.neighbors`, same
   * connectivity rule as march pathfinding) plus the non-player lands bordering
   * that territory (attackable on arrival).
   */
  highlightReachableLands(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    armyId: string,
  ): void {
    if (!this.armyHighlightGraphics) {
      this.armyHighlightGraphics = this.scene.add.graphics();
      this.armyHighlightGraphics.setDepth(55);
    }

    this.armyHighlightGraphics.clear();
    const army = state.armies.find((candidate) => candidate.id === armyId);
    if (!army) {
      return;
    }

    const reachable = new Set<string>();
    const visited = new Set<string>([army.landId]);
    const queue: string[] = [army.landId];

    while (queue.length > 0) {
      const current = queue.shift() as string;
      const land = state.lands.find((candidate) => candidate.id === current);
      if (!land) {
        continue;
      }

      for (const neighborId of land.neighbors) {
        if (visited.has(neighborId)) {
          continue;
        }
        visited.add(neighborId);

        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor) {
          continue;
        }

        reachable.add(neighborId);
        if (neighbor.ownerId === PLAYER_KINGDOM_ID) {
          queue.push(neighborId);
        }
      }
    }

    for (const landId of reachable) {
      for (const loop of traceLandBoundaryLoops(state, hexTileMap, wx, wy, this.armyHighlightLoops, landId)) {
        this.armyHighlightGraphics.fillStyle(COLORS.selected, 0.22);
        this.armyHighlightGraphics.fillPoints(loop, true);
      }

      this.armyHighlightGraphics.lineStyle(2.5, COLORS.selected, 0.8);
      for (const [x1, y1, x2, y2] of traceLandBoundaryEdges(state, hexTileMap, wx, wy, landId)) {
        this.armyHighlightGraphics.lineBetween(x1, y1, x2, y2);
      }
    }
  }

  /** Clears the reachable-lands highlight, e.g. when no army is selected. */
  clearArmyHighlight(): void {
    this.armyHighlightGraphics?.clear();
  }
}
