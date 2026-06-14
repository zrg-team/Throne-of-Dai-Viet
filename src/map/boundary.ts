/**
 * Boundary tracing for a land's merged hex region: the edges/loops where it meets
 * another land (or the map edge), and contiguous-terrain region grouping. Pure
 * geometry helpers shared by `MapScene` for zone borders, fog-of-war shapes, and
 * the selection outline.
 */
import type { GameState } from '../state/types';
import type { HexTile } from './hexMapGenerator';
import { EDGE_DIRECTIONS, MAP_SCALE, axialToPixel, hexCorners, hexKey } from './hex';

type WorldTransform = (value: number) => number;

/** Edges of a land's merged hex region that border another land (or the map edge). */
export function traceLandBoundaryEdges(
  state: GameState,
  hexTileMap: Map<string, HexTile>,
  wx: WorldTransform,
  wy: WorldTransform,
  landId: string,
): Array<[number, number, number, number]> {
  const hexSize = state.mapConfig.hexSize;
  const edges: Array<[number, number, number, number]> = [];

  for (const tile of state.hexTiles) {
    if (tile.landId !== landId) {
      continue;
    }
    const pixel = axialToPixel(tile.coord, hexSize);
    const center = { x: wx(pixel.x), y: wy(pixel.y) };
    const corners = hexCorners(center, hexSize * MAP_SCALE);

    for (let edge = 0; edge < 6; edge += 1) {
      const direction = EDGE_DIRECTIONS[edge];
      const neighborCoord = { q: tile.coord.q + direction.q, r: tile.coord.r + direction.r };
      const neighborTile = hexTileMap.get(hexKey(neighborCoord));
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

/** Closed loops formed by a land's boundary edges, cached per-land in `cache`. */
export function traceLandBoundaryLoops(
  state: GameState,
  hexTileMap: Map<string, HexTile>,
  wx: WorldTransform,
  wy: WorldTransform,
  cache: Map<string, Array<Array<{ x: number; y: number }>>>,
  landId: string,
): Array<Array<{ x: number; y: number }>> {
  const cached = cache.get(landId);
  if (cached) {
    return cached;
  }

  const edges = traceLandBoundaryEdges(state, hexTileMap, wx, wy, landId);
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

  cache.set(landId, loops);
  return loops;
}

/** Groups contiguous hexes that share the same terrain type, for merged region decoration. */
export function computeTerrainRegions(state: GameState, hexTileMap: Map<string, HexTile>): HexTile[][] {
  const visited = new Set<string>();
  const regions: HexTile[][] = [];

  for (const tile of state.hexTiles) {
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
        const neighborTile = hexTileMap.get(neighborKey);
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
