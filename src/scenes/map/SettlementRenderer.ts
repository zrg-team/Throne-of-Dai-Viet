/**
 * Builds the visual cluster for a land's settlement: city/temple building groups with
 * an optional wall, or a themed farm/mine/generic village for lands without a
 * fortress/shrine hex. Delegates actual glyph drawing to the selected item renderer.
 */
import Phaser from 'phaser';
import { EDGE_DIRECTIONS, MAP_SCALE, axialToPixel, hexCorners, hexKey } from '../../map/hex';
import type { HexCoord } from '../../map/hex';
import type { GameState, Land } from '../../state/types';
import type { MapItemRenderer } from '../../ui/MapItemRenderer';
import { brushStroke } from '../../ui/inkTheme';
import type { MapThemePalette } from '../../ui/mapTheme';

export class SettlementRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapItems: MapItemRenderer,
    private readonly palette: MapThemePalette,
  ) {}

  /** Average pixel position of a land's city/shrine hexes, or undefined if it has none. */
  getCityCenter(state: GameState, land: Land): { x: number; y: number } | undefined {
    const hexSize = state.mapConfig.hexSize;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const tile of state.hexTiles) {
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
  createSettlementCluster(state: GameState, land: Land): Phaser.GameObjects.Container {
    const cluster = this.scene.add.container(0, 0);
    if (!land.hasVillage) {
      return cluster;
    }

    const hexSize = state.mapConfig.hexSize;
    const cityCoords: HexCoord[] = [];
    let isShrineCity = false;

    for (const tile of state.hexTiles) {
      if (tile.landId !== land.id || (tile.terrain !== 'fortress' && tile.terrain !== 'shrine')) {
        continue;
      }
      cityCoords.push(tile.coord);
      if (tile.terrain === 'shrine') {
        isShrineCity = true;
      }
    }

    if (cityCoords.length === 0) {
      // A land the game calls a castle has to look like one even when the generator gave it no
      // fortress terrain — which is how the player's own capital ended up rendering as a bare
      // handful of huts while every rival seat had walls.
      if (land.type === 'castle' || land.type === 'enemyCastle') {
        this.mapItems.addCityCluster(cluster, [{ x: 0, y: 0 }], false, 'city');
        this.addBuildingDecorations(cluster, land);
        return cluster;
      }
      this.addResourceCluster(cluster, land);
      return cluster;
    }

    const isFortified = land.type === 'castle' || land.type === 'enemyCastle';
    if (isFortified) {
      this.addCityWall(cluster, cityCoords, land, hexSize);
    }

    // Inter-hex roads added before buildings so they render underneath.
    this.addInterHexRoads(cluster, cityCoords, land, hexSize);

    // Collect all hex centers in relative pixel space, sorted back-to-front.
    // addCityCluster renders them all in a single globally Y-sorted pass so
    // buildings from different hexes correctly interleave in depth.
    const centers = [...cityCoords]
      .sort((a, b) => axialToPixel(a, hexSize).y - axialToPixel(b, hexSize).y)
      .map(coord => {
        const pixel = axialToPixel(coord, hexSize);
        return { x: (pixel.x - land.x) * MAP_SCALE, y: (pixel.y - land.y) * MAP_SCALE };
      });

    this.mapItems.addCityCluster(cluster, centers, isShrineCity, land.type === 'market' ? 'market' : isShrineCity ? 'shrine' : 'city');

    this.addBuildingDecorations(cluster, land);

    return cluster;
  }

  /** Strokes the outer boundary of the city's contiguous hex cluster, following its actual shape. */
  private addCityWall(cluster: Phaser.GameObjects.Container, cityCoords: HexCoord[], land: Land, hexSize: number): void {
    const citySet = new Set(cityCoords.map(hexKey));
    const graphics = this.scene.add.graphics();
    const edges: Array<[number, number, number, number]> = [];

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
        edges.push([x1, y1, x2, y2]);
      }
    }

    this.mapItems.drawCityWall(graphics, edges);
    cluster.add(graphics);
  }

  /**
   * Draws small satellite icons around a city/temple settlement for each constructed
   * farm/mine/market building, so completed builds become visible on the map.
   *
   * **The positions encode the draw order.** These are added after `addCityCluster` has already
   * painted its parts back-to-front, so they land on top of everything regardless of where they sit
   * — and the first row used to sit at `y = −6`, *behind* a citadel based at `y + 12`, which put a
   * barracks glyph over the gate tower it belongs to. Rather than thread six icons through the
   * cluster's sort (`addCityCluster` is shared by four renderers, only one of which sorts), they are
   * placed where painting last is the correct answer: two columns down either flank, all of them in
   * front of the seat. A satellite icon hidden behind a roof conveyed nothing anyway.
   *
   * `x = ±60` clears the name plate, which is at most 90 wide and centred.
   */
  private addBuildingDecorations(cluster: Phaser.GameObjects.Container, land: Land): void {
    const positions: Array<[number, number]> = [
      [-60, 24], [60, 24], [-60, 48], [60, 48], [-60, 72], [60, 72],
    ];
    let posIndex = 0;

    for (const building of land.buildings) {
      const [x, y] = positions[posIndex % positions.length];
      posIndex += 1;
      cluster.add(this.mapItems.createBuildingGlyph(building.type, x, y));
    }
  }

  /**
   * Draws a dirt/stone road between every pair of adjacent city hexes in the cluster.
   * Added before building groups so roads appear beneath buildings.
   */
  private addInterHexRoads(
    cluster: Phaser.GameObjects.Container,
    cityCoords: HexCoord[],
    land: Land,
    hexSize: number,
  ): void {
    if (cityCoords.length < 2) return;

    const graphics = this.scene.add.graphics();
    const maxAdjacentDist = hexSize * MAP_SCALE * 2.1;
    const { cityRoad } = this.palette;

    const segments: Array<[number, number, number, number]> = [];
    for (let i = 0; i < cityCoords.length; i += 1) {
      for (let j = i + 1; j < cityCoords.length; j += 1) {
        const pA = axialToPixel(cityCoords[i], hexSize);
        const pB = axialToPixel(cityCoords[j], hexSize);
        const ax = (pA.x - land.x) * MAP_SCALE;
        const ay = (pA.y - land.y) * MAP_SCALE;
        const bx = (pB.x - land.x) * MAP_SCALE;
        const by = (pB.y - land.y) * MAP_SCALE;
        if (Math.hypot(ax - bx, ay - by) > maxAdjacentDist) continue;
        segments.push([ax, ay, bx, by]);
      }
    }

    if (this.mapItems.drawCityRoad) {
      this.mapItems.drawCityRoad(graphics, segments);
    } else {
      for (const [ax, ay, bx, by] of segments) {
        const seed = Math.round(ax + ay * 3 + bx * 7 + by * 11);
        brushStroke(graphics, [{ x: ax, y: ay }, { x: bx, y: by }], 5, cityRoad.bed, 0.55, seed);
        brushStroke(graphics, [{ x: ax, y: ay }, { x: bx, y: by }], 2.5, cityRoad.track, 0.5, seed + 53);
      }
    }

    cluster.add(graphics);
  }

  /** Lands without a fortress/shrine hex cluster (farms, iron mines) get a small themed village instead. */
  private addResourceCluster(cluster: Phaser.GameObjects.Container, land: Land): void {
    const developmentLevel = land.buildings.length;
    const scale = 1 + developmentLevel * 0.15;

    if (land.type === 'farm') {
      cluster.add(this.mapItems.createFarmCluster(scale, developmentLevel));
    } else if (land.type === 'iron') {
      cluster.add(this.mapItems.createMineCluster(scale, developmentLevel));
    } else {
      this.mapItems.addBuildingGroup(cluster, 0, 0, false, Math.min(6, 2 + developmentLevel));
    }
  }
}
