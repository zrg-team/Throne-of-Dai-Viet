import type { LandTemplate } from '../state/types';
import {
  HEX_DIRECTIONS,
  type HexCoord,
  type PixelPoint,
  axialToPixel,
  generateRectGrid,
  hexEquals,
  hexKey,
  hexNeighbors,
} from './hex';
import { createRng, pickWeighted, randomInt } from './random';
import { TERRAIN_REGISTRY, type HexTerrainType } from './terrainTypes';

/**
 * What kind of water a wet hex is.
 *
 * `water` stays a single terrain — splitting it into three would mean walking the whole terrain
 * recipe three times for what is one substance, and every consumer that only cares "is this wet"
 * would have to learn all three. The kind rides alongside instead, so `terrainSummary.water` keeps
 * meaning what it says while the economy, the renderer and the war layer can still tell a stream
 * from a shipping lane.
 */
export type WaterKind = 'sea' | 'river' | 'stream' | 'lake';

export interface HexTile {
  coord: HexCoord;
  terrain: HexTerrainType;
  landId?: string;
  /** Only set on `water` tiles. */
  waterKind?: WaterKind;
}

export interface MapGenConfig {
  cols: number;
  rows: number;
  hexSize: number;
  seed: number;
  /** Number of map sides (top, right, bottom, left in order) to flood as sea. 0 = all land, 3 = three sea borders. */
  seaBorderSides?: number;
  /** How the realm is watered. Omit for the defaults in `DRAINAGE_DEFAULTS`. */
  drainage?: Partial<DrainageConfig>;
}

/**
 * The whole tuning surface for the realm's water. Every value here is a dial someone will want to
 * turn, so they are named rather than buried as literals in the carve.
 */
export interface DrainageConfig {
  /** Rivers that start in the high ground and run for the sea. */
  trunks: number;
  /** Shorter courses that run until they meet something already wet. */
  tributaries: number;
  /** Accumulated flow below which a course is still a stream rather than a river. */
  streamFlow: number;
  /** Flow above which the channel is broad enough to spill into a neighbouring cell. */
  riverFlow: number;
  /** Chance that a broad cell actually widens. All of them and the river becomes a lake. */
  widenChance: number;
  /** Largest basin pool, in hexes. */
  lakeMax: number;
  /** Total lake hexes allowed on one map. */
  lakeBudget: number;
  /** How far back from the mouth the channel splits into distributaries. */
  deltaSteps: number;
  /** Longest a single trunk may run. A course from the far edge to the coast needs about 48. */
  maxSteps: number;
  /** Longest a tributary may run. They are short by definition. */
  tributarySteps: number;
  /** Massifs raised for the elevation field the water runs down. */
  ridges: number;
}

export const DRAINAGE_DEFAULTS: DrainageConfig = {
  trunks: 2,
  tributaries: 3,
  streamFlow: 7,
  riverFlow: 22,
  widenChance: 0.38,
  lakeMax: 6,
  lakeBudget: 16,
  deltaSteps: 4,
  maxSteps: 58,
  tributarySteps: 20,
  ridges: 5,
};

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

  // The sea is laid down first, and that ordering is load-bearing: every watercourse below is
  // carved by running downhill *towards the coast*, so there has to be a coast to run towards.
  // The old pipeline carved its river first and flooded the sea over the top, which is why the two
  // merged into one body and the map could never contain a lake.
  if (config.seaBorderSides && config.seaBorderSides > 0) {
    applySeaBorders(tiles, coords, config.seaBorderSides, config.cols, config.rows);
  }

  const drainage = { ...DRAINAGE_DEFAULTS, ...(config.drainage ?? {}) };
  const elevation = buildElevation(tiles, coords, rng, drainage.ridges);
  carveWaterways(tiles, coords, elevation, rng, drainage);

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

function applySeaBorders(
  tiles: Map<string, HexTile>,
  coords: HexCoord[],
  seaBorderSides: number,
  cols: number,
  rows: number,
): void {
  const SEA_DEPTH = 4;
  const sideChecks: Array<(coord: HexCoord) => boolean> = [
    (c) => c.r < SEA_DEPTH,
    (c) => c.q >= cols - 1 - Math.floor(c.r / 2) - SEA_DEPTH + 1,
    (c) => c.r >= rows - SEA_DEPTH,
    (c) => c.q <= -Math.floor(c.r / 2) + SEA_DEPTH - 1,
  ];

  for (const coord of coords) {
    for (let i = 0; i < seaBorderSides && i < sideChecks.length; i += 1) {
      if (sideChecks[i](coord)) {
        const tile = tiles.get(hexKey(coord));
        if (tile) {
          tile.terrain = 'water';
          tile.waterKind = 'sea';
        }
        break;
      }
    }
  }
}

/** Axial distance, for the falloff of a massif. */
function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/** Hops to the nearest sea hex, for every cell on the map. */
function distanceFromSea(tiles: Map<string, HexTile>, coords: HexCoord[]): Map<string, number> {
  const distance = new Map<string, number>();
  const queue: HexCoord[] = [];
  for (const coord of coords) {
    if (tiles.get(hexKey(coord))!.waterKind === 'sea') {
      distance.set(hexKey(coord), 0);
      queue.push(coord);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const here = distance.get(hexKey(queue[head]))!;
    for (const neighbor of hexNeighbors(queue[head])) {
      const key = hexKey(neighbor);
      if (!tiles.has(key) || distance.has(key)) {
        continue;
      }
      distance.set(key, here + 1);
      queue.push(neighbor);
    }
  }
  return distance;
}

/**
 * Height, cheaply.
 *
 * A handful of massifs with quadratic falloff, laid over a ramp that rises with distance from the
 * sea. There is no noise library in this codebase and this needs none: the field only has to give
 * water a consistent downhill to follow and a high ground to start from, and the coastal ramp is
 * what guarantees that downhill exists everywhere rather than only near a massif.
 *
 * The ramp deliberately dominates the peaks. Let the massifs win and courses pool in basins
 * instead of reaching the coast.
 */
function buildElevation(
  tiles: Map<string, HexTile>,
  coords: HexCoord[],
  rng: () => number,
  ridges: number,
): Map<string, number> {
  const dry = coords.filter((coord) => tiles.get(hexKey(coord))!.terrain !== 'water');
  const elevation = new Map<string, number>();
  if (dry.length === 0) {
    return elevation;
  }

  const seeds: Array<{ at: HexCoord; radius: number; peak: number }> = [];
  for (let index = 0; index < ridges; index += 1) {
    seeds.push({
      at: dry[randomInt(rng, dry.length)],
      radius: 8 + rng() * 11,
      peak: 0.3 + rng() * 0.4,
    });
  }

  const seaDistance = distanceFromSea(tiles, coords);
  let furthest = 1;
  for (const distance of seaDistance.values()) {
    furthest = Math.max(furthest, distance);
  }

  for (const coord of coords) {
    const key = hexKey(coord);
    let height = 0;
    for (const seed of seeds) {
      const falloff = 1 - hexDistance(coord, seed.at) / seed.radius;
      if (falloff > 0) {
        height += seed.peak * falloff * falloff;
      }
    }
    height += ((seaDistance.get(key) ?? furthest) / furthest) * 0.95;
    // A little hash jitter, so ties do not resolve into straight lines.
    height += ((((coord.q * 73856093) ^ (coord.r * 19349663)) % 1000) / 1000) * 0.035;
    elevation.set(key, tiles.get(key)!.waterKind === 'sea' ? -1 : height);
  }

  return elevation;
}

/**
 * Carve a whole drainage system: trunks from the high ground to the sea, tributaries that join
 * them, lakes where a course stalls in a basin, width that grows with accumulated flow, and a
 * delta at the mouth.
 *
 * This replaces `carveRiver`, which was a 92-step random walk that turned +/-1 direction with 35%
 * probability per step. That river had no source, no mouth, no downhill and no width: it began
 * nowhere, wandered, and stopped wherever it ran out of steps or fell off the grid.
 */
function carveWaterways(
  tiles: Map<string, HexTile>,
  coords: HexCoord[],
  elevation: Map<string, number>,
  rng: () => number,
  config: DrainageConfig,
): void {
  const isWet = (key: string): boolean => tiles.get(key)?.terrain === 'water';
  const isSea = (key: string): boolean => tiles.get(key)?.waterKind === 'sea';
  const seaDistance = distanceFromSea(tiles, coords);
  const flowAt = new Map<string, number>();
  let lakeHexes = 0;

  const setWater = (coord: HexCoord, kind: WaterKind, flow: number): void => {
    const key = hexKey(coord);
    const tile = tiles.get(key);
    if (!tile || tile.waterKind === 'sea') {
      return;
    }
    tile.terrain = 'water';
    tile.waterKind = kind;
    flowAt.set(key, Math.max(flowAt.get(key) ?? 0, flow));
  };

  /** Flood a basin outward from a stalled step, and hand back its lowest rim as the outflow. */
  const poolLake = (start: HexCoord): { pool: Set<string>; outflow?: HexCoord } => {
    const pool = new Set<string>([hexKey(start)]);
    const rim = new Map<string, { at: HexCoord; height: number }>();
    const consider = (coord: HexCoord): void => {
      for (const neighbor of hexNeighbors(coord)) {
        const key = hexKey(neighbor);
        if (!tiles.has(key) || pool.has(key)) {
          continue;
        }
        rim.set(key, { at: neighbor, height: elevation.get(key) ?? Infinity });
      }
    };
    consider(start);

    while (pool.size < config.lakeMax && rim.size > 0) {
      let lowest: { at: HexCoord; height: number } | undefined;
      for (const entry of rim.values()) {
        if (!lowest || entry.height < lowest.height) {
          lowest = entry;
        }
      }
      if (!lowest) {
        break;
      }
      // The lake stops where the rim rises clear of the pool. That lip is the outflow.
      if (pool.size >= 3 && lowest.height > (elevation.get(hexKey(start)) ?? 0) + 0.06) {
        break;
      }
      rim.delete(hexKey(lowest.at));
      if (isSea(hexKey(lowest.at))) {
        return { pool, outflow: lowest.at };
      }
      pool.add(hexKey(lowest.at));
      consider(lowest.at);
    }

    let outflow: { at: HexCoord; height: number } | undefined;
    for (const entry of rim.values()) {
      if (!outflow || entry.height < outflow.height) {
        outflow = entry;
      }
    }
    return { pool, outflow: outflow?.at };
  };

  /** One watercourse, from a source down to the sea, into another course, or into a basin. */
  const runCourse = (source: HexCoord, allowLakes: boolean, limit: number, wander: number): HexCoord[] => {
    let current = source;
    let flow = 0;
    let lastPoolStep = -99;
    const path: HexCoord[] = [];

    for (let step = 0; step < limit; step += 1) {
      const key = hexKey(current);
      if (!tiles.has(key) || isSea(key)) {
        break;
      }
      if (isWet(key) && path.length > 0) {
        break; // joined a course that is already running
      }

      path.push(current);
      flow += 1;
      setWater(current, flow < config.streamFlow ? 'stream' : 'river', flow);

      // Downhill, with a wander term so the course meanders instead of running the gradient.
      let best: { at: HexCoord; jittered: number; height: number } | undefined;
      for (const neighbor of hexNeighbors(current)) {
        const neighborKey = hexKey(neighbor);
        if (!tiles.has(neighborKey) || path.some((seen) => hexEquals(seen, neighbor))) {
          continue;
        }
        const height = elevation.get(neighborKey) ?? Infinity;
        const jittered = height + (rng() - 0.5) * wander;
        if (!best || jittered < best.jittered) {
          best = { at: neighbor, jittered, height };
        }
      }
      if (!best) {
        break;
      }

      const here = elevation.get(key) ?? 0;
      const canPool = allowLakes && flow > 3 && lakeHexes < config.lakeBudget && step - lastPoolStep > 3;
      if (best.height >= here && canPool) {
        // Nowhere lower to go, so the water stands. That is a lake.
        const { pool, outflow } = poolLake(current);
        if (pool.size >= 3) {
          lastPoolStep = step;
          for (const pooled of pool) {
            const [q, r] = pooled.split(',').map(Number);
            if (!isWet(pooled)) {
              lakeHexes += 1;
            }
            setWater({ q, r }, 'lake', flow);
          }
        }
        if (!outflow) {
          break;
        }
        current = outflow;
        continue;
      }

      if (best.height >= here) {
        // Out of downhill and out of lake budget: fall back to the shortest way to the sea.
        let toward: { at: HexCoord; distance: number } | undefined;
        for (const neighbor of hexNeighbors(current)) {
          const neighborKey = hexKey(neighbor);
          if (!tiles.has(neighborKey) || path.some((seen) => hexEquals(seen, neighbor))) {
            continue;
          }
          const distance = (seaDistance.get(neighborKey) ?? Infinity) + rng() * 0.9;
          if (!toward || distance < toward.distance) {
            toward = { at: neighbor, distance };
          }
        }
        if (!toward || !Number.isFinite(toward.distance)) {
          break;
        }
        current = toward.at;
        continue;
      }

      current = best.at;
    }

    return path;
  };

  // Trunks start on the highest dry ground, kept well apart from each other.
  const dry = coords.filter((coord) => !isWet(hexKey(coord)));
  const highestFirst = [...dry].sort(
    (a, b) => (elevation.get(hexKey(b)) ?? 0) - (elevation.get(hexKey(a)) ?? 0),
  );
  const sources: HexCoord[] = [];
  for (const coord of highestFirst) {
    if (sources.length >= config.trunks) {
      break;
    }
    if (sources.every((chosen) => hexDistance(chosen, coord) > 12)) {
      sources.push(coord);
    }
  }
  const trunkPaths = sources.map((source) => runCourse(source, true, config.maxSteps, 0.05));

  // Tributaries start on high-ish ground and run until they meet something already wet.
  const upper = highestFirst.slice(0, Math.max(1, Math.floor(highestFirst.length * 0.35)));
  for (let index = 0; index < config.tributaries; index += 1) {
    const source = upper[randomInt(rng, upper.length)];
    if (isWet(hexKey(source))) {
      continue;
    }
    runCourse(source, false, config.tributarySteps, 0.07);
  }

  // Width. A high-flow cell wets a neighbour, so the lower course reads as broader than the
  // headwaters: the cheapest single thing that makes a river look like it is going somewhere.
  // Not every cell, or the channel stops being a channel.
  for (const [key, flow] of [...flowAt.entries()]) {
    if (flow < config.riverFlow || rng() > config.widenChance) {
      continue;
    }
    if (tiles.get(key)?.waterKind === 'lake') {
      continue; // a lake is already as wide as it should be
    }
    const [q, r] = key.split(',').map(Number);
    const options = hexNeighbors({ q, r }).filter(
      (neighbor) => tiles.has(hexKey(neighbor)) && !isWet(hexKey(neighbor)),
    );
    if (options.length > 0) {
      setWater(options[randomInt(rng, options.length)], 'river', flow);
    }
  }

  ensureDrainage(tiles, coords, seaDistance, rng);

  // Delta: near each mouth, throw a couple of extra distributaries out towards the sea.
  for (const path of trunkPaths) {
    if (path.length < config.deltaSteps + 2) {
      continue;
    }
    const mouth = path[path.length - 1];
    if (!hexNeighbors(mouth).some((neighbor) => isSea(hexKey(neighbor)))) {
      continue;
    }
    for (const branchStart of path.slice(-config.deltaSteps - 1, -1)) {
      if (rng() < 0.45) {
        continue;
      }
      let current = branchStart;
      for (let step = 0; step < config.deltaSteps + 2; step += 1) {
        let best: { at: HexCoord; height: number } | undefined;
        for (const neighbor of hexNeighbors(current)) {
          const key = hexKey(neighbor);
          if (!tiles.has(key)) {
            continue;
          }
          const height = (elevation.get(key) ?? Infinity) + (rng() - 0.5) * 0.16;
          if (!best || height < best.height) {
            best = { at: neighbor, height };
          }
        }
        if (!best || isSea(hexKey(best.at))) {
          break;
        }
        setWater(best.at, 'river', config.riverFlow);
        current = best.at;
      }
    }
  }
}

/**
 * Every drop of water on the map drains somewhere.
 *
 * A course that runs out of downhill simply stops, and a river that ends in a field is precisely
 * the fault this whole change exists to remove, so any body that does not reach the sea has an
 * outlet cut for it along the sea-distance gradient.
 *
 * The jitter matters. That gradient is integer hops, so ties are everywhere, and taking the first
 * one every time draws a ruler-straight diagonal across the map.
 */
function ensureDrainage(
  tiles: Map<string, HexTile>,
  coords: HexCoord[],
  seaDistance: Map<string, number>,
  rng: () => number,
): void {
  const isWet = (key: string): boolean => tiles.get(key)?.terrain === 'water';
  const isSea = (key: string): boolean => tiles.get(key)?.waterKind === 'sea';
  const handled = new Set<string>();

  for (const coord of coords) {
    const key = hexKey(coord);
    if (!isWet(key) || isSea(key) || handled.has(key)) {
      continue;
    }

    // Walk this body: does it reach the sea, and which of its cells lies nearest to one?
    const body: string[] = [];
    const seen = new Set<string>([key]);
    const stack: HexCoord[] = [coord];
    let touchesSea = false;
    let outlet: { key: string; distance: number } | undefined;
    while (stack.length > 0) {
      const here = stack.pop()!;
      const hereKey = hexKey(here);
      body.push(hereKey);
      if (isSea(hereKey)) {
        touchesSea = true;
      }
      const distance = seaDistance.get(hereKey) ?? Infinity;
      if (!outlet || distance < outlet.distance) {
        outlet = { key: hereKey, distance };
      }
      for (const neighbor of hexNeighbors(here)) {
        const neighborKey = hexKey(neighbor);
        if (isWet(neighborKey) && !seen.has(neighborKey)) {
          seen.add(neighborKey);
          stack.push(neighbor);
        }
      }
    }
    for (const member of body) {
      handled.add(member);
    }
    if (touchesSea || !outlet || !Number.isFinite(outlet.distance)) {
      continue;
    }

    const [startQ, startR] = outlet.key.split(',').map(Number);
    let current: HexCoord = { q: startQ, r: startR };
    for (let step = 0; step < 70; step += 1) {
      let toward: { at: HexCoord; key: string; distance: number } | undefined;
      for (const neighbor of hexNeighbors(current)) {
        const neighborKey = hexKey(neighbor);
        if (!tiles.has(neighborKey)) {
          continue;
        }
        const distance = (seaDistance.get(neighborKey) ?? Infinity) + rng() * 0.95;
        if (!toward || distance < toward.distance) {
          toward = { at: neighbor, key: neighborKey, distance };
        }
      }
      if (!toward || !Number.isFinite(toward.distance) || isSea(toward.key)) {
        break;
      }
      const alreadyWet = isWet(toward.key);
      const tile = tiles.get(toward.key)!;
      if (tile.waterKind !== 'sea') {
        tile.terrain = 'water';
        tile.waterKind = 'river';
      }
      current = toward.at;
      if (alreadyWet) {
        break; // merged into a body that already drains
      }
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
        if (!neighborTile || neighborTile.landId) {
          continue;
        }
        // A province grows across its own river but never out into the sea.
        //
        // This one condition is what takes `terrainSummary.water` off zero. Water hexes never
        // received a `landId`, so the counting loop in `GameState` — `summary[tile.terrain] += 1`,
        // which only ever runs for tiles belonging to the province — could not see a drop of it,
        // and seven shipped mechanics read a field that was structurally always 0.
        //
        // The sea stays unclaimed on purpose: it is the edge of the world, not a province's back
        // garden, and leaving it out is what keeps a coast a coast.
        if (neighborTile.terrain === 'water' && neighborTile.waterKind === 'sea') {
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
      // A province owns its river, which means the river is in this list. Rolling terrain for it
      // would paint the water back into dry ground on the very pass that is supposed to describe
      // the province — the map would generate a river and then quietly fill it in.
      if (tile.terrain === 'water') {
        continue;
      }
      tile.terrain = pickWeighted(rng, candidates);
    }

    if (land.type === 'castle' || land.type === 'enemyCastle' || land.type === 'market' || land.type === 'temple') {
      const cityTerrain: HexTerrainType = land.type === 'temple' ? 'shrine' : 'fortress';
      const cityHexCount = Math.min(8, Math.max(1, Math.round(hexes.length * 0.15)));
      const hexSet = new Set(hexes.filter((coord) => tiles.get(hexKey(coord))!.terrain !== 'water').map(hexKey));
      const byClaimOrder = [...hexes]
        .filter((coord) => tiles.get(hexKey(coord))!.terrain !== 'water')
        .sort((a, b) => (claimOrder.get(hexKey(a)) ?? 0) - (claimOrder.get(hexKey(b)) ?? 0));

      // BFS out from the land's seed hex so city hexes form one contiguous cluster.
      const start = byClaimOrder[0];
      if (!start) {
        continue;
      }
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
