/**
 * Builds the visual cluster for a land's settlement: city/temple building groups with
 * an optional wall, or a themed farm/mine/generic village for lands without a
 * fortress/shrine hex. Delegates actual glyph drawing to `InkMapItemRenderer`.
 */
import Phaser from 'phaser';
import { EDGE_DIRECTIONS, MAP_SCALE, axialToPixel, hexCorners, hexKey } from '../../map/hex';
import type { HexCoord } from '../../map/hex';
import type { GameState, Land } from '../../state/types';
import type { InkMapItemRenderer } from '../../ui/MapItemRenderer';

export class SettlementRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly inkItems: InkMapItemRenderer,
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
      this.inkItems.addBuildingGroup(cluster, relX, relY, isShrineCity, houseCount);
    }

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

    this.inkItems.drawCityWall(graphics, edges);
    cluster.add(graphics);
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
      cluster.add(this.inkItems.createBuildingGlyph(building.type, x, y));
    }
  }

  /** Lands without a fortress/shrine hex cluster (farms, iron mines) get a small themed village instead. */
  private addResourceCluster(cluster: Phaser.GameObjects.Container, land: Land): void {
    const developmentLevel = land.buildings.length;
    const scale = 1 + developmentLevel * 0.15;

    if (land.type === 'farm') {
      cluster.add(this.inkItems.createFarmCluster(scale, developmentLevel));
    } else if (land.type === 'iron') {
      cluster.add(this.inkItems.createMineCluster(scale, developmentLevel));
    } else {
      this.inkItems.addBuildingGroup(cluster, 0, 0, false, Math.min(6, 2 + developmentLevel));
    }
  }
}
