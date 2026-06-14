import type { LandTemplate } from '../state/types';
import {
  HEX_DIRECTIONS,
  type HexCoord,
  type PixelPoint,
  axialToPixel,
  generateRectGrid,
  hexAdd,
  hexKey,
  hexNeighbors,
} from './hex';
import { createRng, pickWeighted, randomInt } from './random';
import { TERRAIN_REGISTRY, type HexTerrainType } from './terrainTypes';

export interface HexTile {
  coord: HexCoord;
  terrain: HexTerrainType;
  landId?: string;
}

export interface MapGenConfig {
  cols: number;
  rows: number;
  hexSize: number;
  seed: number;
  riverHexCount?: number;
}

export interface HexMapResult {
  tiles: HexTile[];
  landHexes: Map<string, HexCoord[]>;
}

export function generateHexMap(lands: LandTemplate[], config: MapGenConfig): HexMapResult {
  const rng = createRng(config.seed);
  const coords = generateRectGrid(config.cols, config.rows);
  const tiles = new Map<string, HexTile>();
  for (const coord of coords) {
    tiles.set(hexKey(coord), { coord, terrain: 'plains' });
  }

  if (config.riverHexCount && config.riverHexCount > 0) {
    carveRiver(tiles, coords, config.riverHexCount, rng);
  }

  const claimOrder = new Map<string, number>();
  growZones(tiles, coords, lands, rng, claimOrder);

  const landHexes = new Map<string, HexCoord[]>();
  for (const tile of tiles.values()) {
    if (!tile.landId) {
      continue;
    }
    const list = landHexes.get(tile.landId) ?? [];
    list.push(tile.coord);
    landHexes.set(tile.landId, list);
  }

  assignTerrain(tiles, lands, landHexes, claimOrder, rng);

  return { tiles: Array.from(tiles.values()), landHexes };
}

function carveRiver(tiles: Map<string, HexTile>, coords: HexCoord[], length: number, rng: () => number): void {
  let current = coords[randomInt(rng, coords.length)];
  let directionIndex = randomInt(rng, HEX_DIRECTIONS.length);

  for (let step = 0; step < length; step += 1) {
    const tile = tiles.get(hexKey(current));
    if (!tile) {
      break;
    }
    tile.terrain = 'water';

    if (rng() < 0.35) {
      directionIndex = (directionIndex + (rng() < 0.5 ? 1 : -1) + HEX_DIRECTIONS.length) % HEX_DIRECTIONS.length;
    }
    current = hexAdd(current, HEX_DIRECTIONS[directionIndex]);
    if (!tiles.has(hexKey(current))) {
      break;
    }
  }
}

function growZones(
  tiles: Map<string, HexTile>,
  coords: HexCoord[],
  lands: LandTemplate[],
  rng: () => number,
  claimOrder: Map<string, number>,
): void {
  let order = 0;
  const frontiers = new Map<string, HexCoord[]>();

  for (const land of lands) {
    const available = coords.filter((coord) => {
      const tile = tiles.get(hexKey(coord));
      return tile && !tile.landId && tile.terrain !== 'water';
    });
    if (available.length === 0) {
      continue;
    }

    const seed = available[randomInt(rng, available.length)];
    const tile = tiles.get(hexKey(seed))!;
    tile.landId = land.id;
    claimOrder.set(hexKey(seed), order++);
    frontiers.set(land.id, [seed]);
  }

  let activeLandIds = lands.map((land) => land.id).filter((id) => frontiers.has(id));
  while (activeLandIds.length > 0) {
    const next: string[] = [];

    for (const landId of activeLandIds) {
      const frontier = frontiers.get(landId)!;
      if (frontier.length === 0) {
        continue;
      }

      const index = randomInt(rng, frontier.length);
      const hex = frontier.splice(index, 1)[0];

      for (const neighbor of hexNeighbors(hex)) {
        const key = hexKey(neighbor);
        const neighborTile = tiles.get(key);
        if (!neighborTile || neighborTile.landId || neighborTile.terrain === 'water') {
          continue;
        }
        neighborTile.landId = landId;
        claimOrder.set(key, order++);
        frontier.push(neighbor);
      }

      if (frontier.length > 0) {
        next.push(landId);
      }
    }

    activeLandIds = next;
  }
}

function assignTerrain(
  tiles: Map<string, HexTile>,
  lands: LandTemplate[],
  landHexes: Map<string, HexCoord[]>,
  claimOrder: Map<string, number>,
  rng: () => number,
): void {
  const landById = new Map(lands.map((land) => [land.id, land]));

  for (const [landId, hexes] of landHexes) {
    const land = landById.get(landId);
    if (!land) {
      continue;
    }

    const candidates = Object.entries(TERRAIN_REGISTRY)
      .filter(([key, def]) => key !== 'fortress' && key !== 'shrine' && key !== 'water' && def.preferredFor.includes(land.type))
      .map(([key, def]) => ({ value: key as HexTerrainType, weight: def.weight }));

    for (const coord of hexes) {
      const tile = tiles.get(hexKey(coord))!;
      tile.terrain = pickWeighted(rng, candidates);
    }

    if (land.type === 'castle' || land.type === 'enemyCastle' || land.type === 'market' || land.type === 'temple') {
      const cityTerrain: HexTerrainType = land.type === 'temple' ? 'shrine' : 'fortress';
      const cityHexCount = Math.min(8, Math.max(1, Math.round(hexes.length * 0.15)));
      const hexSet = new Set(hexes.map(hexKey));
      const byClaimOrder = [...hexes].sort(
        (a, b) => (claimOrder.get(hexKey(a)) ?? 0) - (claimOrder.get(hexKey(b)) ?? 0),
      );

      // BFS out from the land's seed hex so city hexes form one contiguous cluster.
      const start = byClaimOrder[0];
      const visited = new Set<string>([hexKey(start)]);
      const queue: HexCoord[] = [start];
      const cityCoords: HexCoord[] = [];
      while (cityCoords.length < cityHexCount && queue.length > 0) {
        const current = queue.shift()!;
        cityCoords.push(current);
        for (const neighbor of hexNeighbors(current)) {
          const key = hexKey(neighbor);
          if (hexSet.has(key) && !visited.has(key)) {
            visited.add(key);
            queue.push(neighbor);
          }
        }
      }

      for (const coord of cityCoords) {
        tiles.get(hexKey(coord))!.terrain = cityTerrain;
      }
    }
  }
}

export function computeNeighbors(tiles: HexTile[]): Map<string, Set<string>> {
  const byKey = new Map(tiles.map((tile) => [hexKey(tile.coord), tile]));
  const result = new Map<string, Set<string>>();

  for (const tile of tiles) {
    if (!tile.landId) {
      continue;
    }
    for (const neighbor of hexNeighbors(tile.coord)) {
      const neighborTile = byKey.get(hexKey(neighbor));
      if (!neighborTile?.landId || neighborTile.landId === tile.landId) {
        continue;
      }
      if (!result.has(tile.landId)) {
        result.set(tile.landId, new Set());
      }
      result.get(tile.landId)!.add(neighborTile.landId);
    }
  }

  return result;
}

export function computeCentroid(hexes: HexCoord[], hexSize: number): PixelPoint {
  let sumX = 0;
  let sumY = 0;
  for (const hex of hexes) {
    const point = axialToPixel(hex, hexSize);
    sumX += point.x;
    sumY += point.y;
  }
  return { x: sumX / hexes.length, y: sumY / hexes.length };
}
