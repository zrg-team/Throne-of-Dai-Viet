/**
 * Prototype of the proposed waterway generator, as a pure function over a hex grid.
 *
 * Mirrors the real pipeline's coordinate system and RNG exactly (pointy-top axial,
 * mulberry32, generateRectGrid odd-r offset) so its output can be dropped straight onto
 * `state.hexTiles` and painted by the real renderer.
 *
 * Difference from `carveRiver`: a river here has a source in high ground, runs downhill,
 * accumulates flow, gathers tributaries, pools into a lake when it stalls in a basin, and
 * ends in the sea as a delta. Width follows accumulated flow, so it starts as a stream.
 */

export const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export const key = (c) => `${c.q},${c.r}`;
export const add = (a, b) => ({ q: a.q + b.q, r: a.r + b.r });
export const neighbours = (c) => HEX_DIRECTIONS.map((d) => add(c, d));
export const hexDistance = (a, b) => {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
};
export const axialToPixel = (c, size) => ({
  x: size * Math.sqrt(3) * (c.q + c.r / 2),
  y: size * 1.5 * c.r,
});

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRectGrid(cols, rows) {
  const out = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) out.push({ q: col - Math.floor(row / 2), r: row });
  }
  return out;
}

const randomInt = (rng, n) => Math.floor(rng() * n);

/** The current shipped carve, for side-by-side comparison. */
export function carveRiverCurrent(cells, coords, length, rng) {
  let current = coords[randomInt(rng, coords.length)];
  let dir = randomInt(rng, HEX_DIRECTIONS.length);
  for (let step = 0; step < length; step += 1) {
    const cell = cells.get(key(current));
    if (!cell) break;
    cell.terrain = 'water';
    cell.waterKind = 'river';
    if (rng() < 0.35) dir = (dir + (rng() < 0.5 ? 1 : -1) + 6) % 6;
    current = add(current, HEX_DIRECTIONS[dir]);
    if (!cells.has(key(current))) break;
  }
}

/** Sea band along `sides` edges of the map, four hexes deep — unchanged from the real one. */
export function applySeaBorders(cells, coords, sides, cols, rows) {
  const DEPTH = 4;
  const checks = [
    (c) => c.r < DEPTH,
    (c) => c.q >= cols - 1 - Math.floor(c.r / 2) - DEPTH + 1,
    (c) => c.r >= rows - DEPTH,
    (c) => c.q <= -Math.floor(c.r / 2) + DEPTH - 1,
  ];
  for (const coord of coords) {
    for (let i = 0; i < sides && i < checks.length; i += 1) {
      if (checks[i](coord)) {
        const cell = cells.get(key(coord));
        if (cell) { cell.terrain = 'water'; cell.waterKind = 'sea'; }
        break;
      }
    }
  }
}

/**
 * Cheap elevation field: a handful of massifs with quadratic falloff, ramped down to zero at
 * the sea. There is no noise library in this codebase and this needs none — the field only has
 * to give the water a consistent downhill to follow and a high ground to start from.
 *
 * This is an addition to the original proposal: hydrology has to run before `assignTerrain`,
 * so "source in the mountains" needs a notion of height that does not exist yet. The same field
 * can later bias where `assignTerrain` puts mountains, so the ranges and the rivers agree.
 */
export function buildElevation(cells, coords, rng, opts = {}) {
  const { ridges = 5 } = opts;
  const dry = coords.filter((c) => cells.get(key(c)).terrain !== 'water');
  if (dry.length === 0) return new Map();

  const seeds = [];
  for (let i = 0; i < ridges; i += 1) {
    const at = dry[randomInt(rng, dry.length)];
    seeds.push({ at, radius: 8 + rng() * 11, peak: 0.30 + rng() * 0.40 });
  }

  // Distance to the nearest sea hex, so the land tilts toward the coast everywhere.
  const seaDist = new Map();
  const queue = [];
  for (const c of coords) {
    if (cells.get(key(c)).waterKind === 'sea') { seaDist.set(key(c), 0); queue.push(c); }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const c = queue[head];
    const d = seaDist.get(key(c));
    for (const n of neighbours(c)) {
      const k = key(n);
      if (!cells.has(k) || seaDist.has(k)) continue;
      seaDist.set(k, d + 1);
      queue.push(n);
    }
  }
  let maxDist = 1;
  for (const d of seaDist.values()) maxDist = Math.max(maxDist, d);

  const elev = new Map();
  for (const c of coords) {
    const k = key(c);
    let h = 0;
    for (const s of seeds) {
      const t = 1 - hexDistance(c, s.at) / s.radius;
      if (t > 0) h += s.peak * t * t;
    }
    // Coastal ramp: guarantees a global downhill even where no massif reaches.
    h += ((seaDist.get(k) ?? maxDist) / maxDist) * 0.95;
    // A little hash jitter so ties do not resolve into straight lines.
    h += (((c.q * 73856093) ^ (c.r * 19349663)) % 1000) / 1000 * 0.035;
    elev.set(k, cells.get(k).waterKind === 'sea' ? -1 : h);
  }
  return elev;
}

/**
 * Carve a whole drainage system: trunk rivers from the high ground to the sea, tributaries
 * joining them, lakes where a course stalls in a basin, and a delta at each mouth.
 */
export function carveWaterways(cells, coords, elev, rng, opts = {}) {
  const {
    trunks = 2,
    tributaries = 3,
    streamFlow = 7,      // below this much accumulated flow, a course is a stream
    riverFlow = 22,      // above this, wide enough to widen the channel
    lakeMax = 6,         // largest basin pool, in hexes
    lakeBudget = 16,     // total lake hexes allowed on one map
    deltaSteps = 4,      // how far back from the mouth the channel splits
    maxSteps = 58,       // a course from the far edge to the coast needs about 48
    tribSteps = 20,      // tributaries are short by definition
  } = opts;

  const wet = (k) => cells.get(k)?.terrain === 'water';
  const isSea = (k) => cells.get(k)?.waterKind === 'sea';

  // Hops to the nearest sea hex. A river that stops in a field is the fault being fixed here, so
  // when a course runs out of downhill this is the guaranteed way out to base level.
  const seaDist = new Map();
  const bfs = coords.filter((c) => isSea(key(c)));
  for (const c of bfs) seaDist.set(key(c), 0);
  for (let head = 0; head < bfs.length; head += 1) {
    const d = seaDist.get(key(bfs[head]));
    for (const n of neighbours(bfs[head])) {
      const nk = key(n);
      if (!cells.has(nk) || seaDist.has(nk)) continue;
      seaDist.set(nk, d + 1);
      bfs.push(n);
    }
  }
  const stats = { lakes: 0, reachedSea: 0, courses: 0, merged: 0 };
  const flowAt = new Map();
  let lakeHexes = 0;

  const setWater = (c, kind, flow) => {
    const cell = cells.get(key(c));
    if (!cell || cell.waterKind === 'sea') return;
    cell.terrain = 'water';
    cell.waterKind = kind;
    flowAt.set(key(c), Math.max(flowAt.get(key(c)) ?? 0, flow));
  };

  /** Flood a basin outward from a stalled step, then hand back its lowest rim as the outflow. */
  const poolLake = (start) => {
    const pool = new Set([key(start)]);
    const rim = new Map();
    const consider = (c) => {
      for (const n of neighbours(c)) {
        const k = key(n);
        if (!cells.has(k) || pool.has(k)) continue;
        rim.set(k, { at: n, h: elev.get(k) ?? Infinity });
      }
    };
    consider(start);
    while (pool.size < lakeMax && rim.size > 0) {
      let lowest = null;
      for (const entry of rim.values()) if (!lowest || entry.h < lowest.h) lowest = entry;
      if (!lowest) break;
      // The lake stops where the rim rises clear of the pool: that lip is the outflow.
      if (pool.size >= 3 && lowest.h > (elev.get(key(start)) ?? 0) + 0.06) break;
      rim.delete(key(lowest.at));
      if (isSea(key(lowest.at))) return { pool, outflow: lowest.at };
      pool.add(key(lowest.at));
      consider(lowest.at);
    }
    let outflow = null;
    for (const entry of rim.values()) if (!outflow || entry.h < outflow.h) outflow = entry;
    return { pool, outflow: outflow?.at ?? null };
  };

  /** One watercourse, from a source down to the sea, another course, or a dead end. */
  const runCourse = (source, startFlow, allowLakes, limit = maxSteps, wander = 0.05) => {
    let current = source;
    let flow = startFlow;
    const path = [];
    let lastPoolStep = -99;
    stats.courses += 1;

    for (let step = 0; step < limit; step += 1) {
      const k = key(current);
      if (!cells.has(k)) break;

      if (isSea(k)) { stats.reachedSea += 1; break; }
      if (wet(k) && path.length > 0) { stats.merged += 1; break; }   // joined an existing course

      path.push(current);
      flow += 1;
      const kind = flow < streamFlow ? 'stream' : 'river';
      setWater(current, kind, flow);

      // Downhill, with a wander term so the course meanders instead of running the gradient.
      let best = null;
      for (const n of neighbours(current)) {
        const nk = key(n);
        if (!cells.has(nk)) continue;
        if (path.some((p) => p.q === n.q && p.r === n.r)) continue;
        const h = (elev.get(nk) ?? Infinity) + (rng() - 0.5) * wander;
        if (!best || h < best.h) best = { at: n, h, raw: elev.get(nk) ?? Infinity };
      }
      if (!best) break;

      const here = elev.get(k) ?? 0;
      const canPool = allowLakes && flow > 3 && lakeHexes < lakeBudget && step - lastPoolStep > 3;
      if (best.raw >= here && canPool) {
        // Nowhere lower to go: the water stands. That is a lake.
        const { pool, outflow } = poolLake(current);
        if (pool.size >= 3) {
          stats.lakes += 1;
          lastPoolStep = step;
          for (const pk of pool) {
            const [q, r] = pk.split(',').map(Number);
            if (!wet(pk)) lakeHexes += 1;
            setWater({ q, r }, 'lake', flow);
          }
        }
        if (outflow) { current = outflow; continue; }
      }
      if (best.raw >= here && !canPool) {
        // Out of downhill and out of lake budget: fall back to the shortest way to the sea.
        let toward = null;
        for (const n of neighbours(current)) {
          const nk = key(n);
          if (!cells.has(nk)) continue;
          if (path.some((pp) => pp.q === n.q && pp.r === n.r)) continue;
          const d = (seaDist.get(nk) ?? Infinity) + rng() * 0.9;
          if (!toward || d < toward.d) toward = { at: n, d };
        }
        if (!toward || toward.d === Infinity) break;
        current = toward.at;
        continue;
      }
      current = best.at;
    }
    return { path, flow };
  };

  // Trunk rivers: sources among the highest dry ground, kept apart from each other.
  const dry = coords.filter((c) => !wet(key(c)));
  const highFirst = [...dry].sort((a, b) => (elev.get(key(b)) ?? 0) - (elev.get(key(a)) ?? 0));
  const sources = [];
  for (const c of highFirst) {
    if (sources.length >= trunks) break;
    if (sources.every((s) => hexDistance(s, c) > 12)) sources.push(c);
  }
  const trunkPaths = [];
  for (const s of sources) trunkPaths.push(runCourse(s, 0, true).path);

  // Tributaries: start on high-ish ground and run until they meet something already wet.
  const upper = highFirst.slice(0, Math.max(1, Math.floor(highFirst.length * 0.35)));
  for (let i = 0; i < tributaries; i += 1) {
    const s = upper[randomInt(rng, upper.length)];
    if (wet(key(s))) continue;
    runCourse(s, 0, false, tribSteps, 0.07);
  }

  // Width: a high-flow hex wets one neighbour, so the lower course is visibly broader than
  // the headwaters. This is the single cheapest thing that reads as "a river, going somewhere".
  for (const [k, flow] of [...flowAt.entries()]) {
    if (flow < riverFlow) continue;
    if (rng() > 0.38) continue;                        // about a third of the lower course, not all of it
    const [q, r] = k.split(',').map(Number);
    if (cells.get(k)?.waterKind === 'lake') continue;  // a lake is already as wide as it should be
    const options = neighbours({ q, r }).filter((n) => cells.has(key(n)) && !wet(key(n)));
    if (options.length === 0) continue;
    setWater(options[randomInt(rng, options.length)], 'river', flow);
  }

  // Drainage guarantee. Any body of water that does not reach the sea gets an outlet cut for it,
  // following the sea-distance gradient. Without this, a course that runs out of downhill simply
  // stops — which is exactly the "river that ends in a field" this whole change exists to remove.
  const drains = (startKey) => {
    const seenBody = new Set([startKey]);
    const stack = [startKey];
    const body = [];
    let touchesSea = false;
    while (stack.length) {
      const bk = stack.pop();
      body.push(bk);
      if (isSea(bk)) touchesSea = true;
      const [bq, br] = bk.split(',').map(Number);
      for (const n of neighbours({ q: bq, r: br })) {
        const nk = key(n);
        if (wet(nk) && !seenBody.has(nk)) { seenBody.add(nk); stack.push(nk); }
      }
    }
    return { body, touchesSea };
  };

  const handled = new Set();
  for (const c of coords) {
    const k = key(c);
    if (!wet(k) || handled.has(k) || isSea(k)) continue;
    const { body, touchesSea } = drains(k);
    for (const bk of body) handled.add(bk);
    if (touchesSea) continue;

    // Start from whichever hex of this body is nearest the sea, and cut downhill from there.
    let outlet = null;
    for (const bk of body) {
      const d = seaDist.get(bk) ?? Infinity;
      if (!outlet || d < outlet.d) outlet = { k: bk, d };
    }
    if (!outlet || outlet.d === Infinity) continue;
    let [cq, cr] = outlet.k.split(',').map(Number);
    let cur = { q: cq, r: cr };
    for (let step = 0; step < 70; step += 1) {
      let toward = null;
      for (const n of neighbours(cur)) {
        const nk = key(n);
        if (!cells.has(nk)) continue;
        // + jitter: the gradient is integer hops, so ties are everywhere and taking the first
        // every time draws a ruler-straight diagonal across the map.
        const d = (seaDist.get(nk) ?? Infinity) + rng() * 0.95;
        if (!toward || d < toward.d) toward = { at: n, d, k: nk };
      }
      if (!toward || toward.d === Infinity) break;
      if (isSea(toward.k)) break;                    // reached base level
      const alreadyWet = wet(toward.k);
      setWater(toward.at, 'river', riverFlow);
      cur = toward.at;
      if (alreadyWet) break;                         // merged into a body that already drains
    }
  }

  // Delta: near each mouth, throw two extra distributaries out toward the sea.
  for (const path of trunkPaths) {
    if (path.length < deltaSteps + 2) continue;
    const mouth = path[path.length - 1];
    if (!neighbours(mouth).some((n) => isSea(key(n)))) continue;
    for (const branchStart of path.slice(-deltaSteps - 1, -1)) {
      if (rng() < 0.45) continue;
      let c = branchStart;
      for (let step = 0; step < deltaSteps + 2; step += 1) {
        let best = null;
        for (const n of neighbours(c)) {
          const nk = key(n);
          if (!cells.has(nk)) continue;
          const h = (elev.get(nk) ?? Infinity) + (rng() - 0.5) * 0.16;
          if (!best || h < best.h) best = { at: n, h };
        }
        if (!best) break;
        if (isSea(key(best.at))) break;
        setWater(best.at, 'river', riverFlow);
        c = best.at;
      }
    }
  }

  return { stats, flowAt };
}

/**
 * Zones, and the single decision that determines whether a river is a border or a feature.
 *
 * `waterPolicy` is the lever:
 *  - `'barrier'`  — growth cannot cross water. Provinces stop at the bank, so rivers become
 *                   province boundaries and genuinely sever adjacency. Inland water is handed to
 *                   the province with the most frontage on it afterwards, so `terrainSummary.water`
 *                   still stops being zero.
 *  - `'permeable'`— growth spreads through inland water, so a province straddles its river. Water
 *                   counts, but nothing is ever separated by it.
 *  - `'none'`     — today's behaviour: water blocks growth and is never claimed, which is what
 *                   makes `terrainSummary.water` structurally 0.
 */
export function growZones(cells, coords, landCount, rng, waterPolicy = 'none') {
  const permeable = waterPolicy === 'permeable';
  const claimable = (cell) =>
    cell && !cell.landId && (cell.terrain !== 'water' || (permeable && cell.waterKind !== 'sea'));
  const frontiers = new Map();
  for (let i = 0; i < landCount; i += 1) {
    const id = `district-${String(i + 1).padStart(2, '0')}`;
    const available = coords.filter((c) => {
      const cell = cells.get(key(c));
      return cell && !cell.landId && cell.terrain !== 'water';
    });
    if (available.length === 0) continue;
    const seed = available[randomInt(rng, available.length)];
    cells.get(key(seed)).landId = id;
    frontiers.set(id, [seed]);
  }
  let active = [...frontiers.keys()];
  while (active.length > 0) {
    const next = [];
    for (const id of active) {
      const frontier = frontiers.get(id);
      if (frontier.length === 0) continue;
      const hex = frontier.splice(randomInt(rng, frontier.length), 1)[0];
      for (const n of neighbours(hex)) {
        const cell = cells.get(key(n));
        if (!claimable(cell)) continue;
        cell.landId = id;
        frontier.push(n);
      }
      if (frontier.length > 0) next.push(id);
    }
    active = next;
  }

  // Barrier policy: the bank stopped the zone, so hand each inland water hex to whichever province
  // holds the most of its shoreline. The water belongs to a province without ever having let that
  // province grow across it.
  if (waterPolicy === 'barrier') {
    const pending = [];
    for (const c of coords) {
      const cell = cells.get(key(c));
      if (!cell || cell.terrain !== 'water' || cell.waterKind === 'sea' || cell.landId) continue;
      const tally = new Map();
      for (const n of neighbours(c)) {
        const nb = cells.get(key(n));
        if (nb?.landId && nb.terrain !== 'water') tally.set(nb.landId, (tally.get(nb.landId) ?? 0) + 1);
      }
      let best = null;
      for (const [id, n] of tally) if (!best || n > best.n) best = { id, n };
      if (best) pending.push({ cell, id: best.id });
    }
    for (const { cell, id } of pending) cell.landId = id;
  }
}

const LAND_TYPES = ['castle', 'farm', 'market', 'iron', 'temple', 'enemyCastle', 'wilderness'];
const REGISTRY = {
  plains: { preferredFor: LAND_TYPES, weight: 2 },
  fields: { preferredFor: ['farm'], weight: 1 },
  riceFields: { preferredFor: ['farm'], weight: 1 },
  forest: { preferredFor: ['farm', 'wilderness'], weight: 1 },
  mountains: { preferredFor: ['iron', 'wilderness'], weight: 2 },
  hills: { preferredFor: ['iron', 'wilderness'], weight: 2 },
};

/**
 * Terrain fill. Water hexes keep their terrain — claiming a river must not paint over it —
 * and `elev` biases which provinces read as upland, so the ranges agree with the rivers.
 */
export function assignTerrain(cells, coords, rng, elev) {
  const byLand = new Map();
  for (const c of coords) {
    const cell = cells.get(key(c));
    if (!cell.landId) continue;
    if (!byLand.has(cell.landId)) byLand.set(cell.landId, []);
    byLand.get(cell.landId).push(c);
  }
  for (const [, hexes] of byLand) {
    const dryHexes = hexes.filter((c) => cells.get(key(c)).terrain !== 'water');
    if (dryHexes.length === 0) continue;
    const mean = dryHexes.reduce((a, c) => a + (elev?.get(key(c)) ?? 0.4), 0) / dryHexes.length;
    const touchesWater = hexes.some((c) => cells.get(key(c)).terrain === 'water')
      || hexes.some((c) => neighbours(c).some((n) => cells.get(key(n))?.terrain === 'water'));
    // Upland provinces read as iron, well-watered lowland as farm — the map's own logic,
    // just informed by the field the rivers were carved on.
    const type = mean > 0.72 ? 'iron' : mean > 0.55 ? 'wilderness' : touchesWater ? 'farm' : 'market';
    const candidates = Object.entries(REGISTRY)
      .filter(([, def]) => def.preferredFor.includes(type))
      .map(([k, def]) => ({ value: k, weight: def.weight }));
    const pool = candidates.length > 0 ? candidates : [{ value: 'plains', weight: 1 }];
    const total = pool.reduce((a, e) => a + e.weight, 0);
    for (const c of dryHexes) {
      let roll = rng() * total;
      let picked = pool[pool.length - 1].value;
      for (const e of pool) { roll -= e.weight; if (roll <= 0) { picked = e.value; break; } }
      cells.get(key(c)).terrain = picked;
    }
  }
}

/** Whole-map build. `mode` is 'current' for the shipped pipeline or 'proposed' for the new one. */
export function buildMap(seed, mode, config = {}) {
  const { cols = 30, rows = 52, seaSides = 1, riverHexCount = 92, lands = 42, waterPolicy = 'barrier' } = config;
  const rng = mulberry32(seed);
  const coords = generateRectGrid(cols, rows);
  const cells = new Map(coords.map((c) => [key(c), { coord: c, terrain: 'plains' }]));

  let elev = null;
  let stats = { lakes: 0, reachedSea: 0, courses: 0, merged: 0 };

  if (mode === 'current') {
    carveRiverCurrent(cells, coords, riverHexCount, rng);
    applySeaBorders(cells, coords, seaSides, cols, rows);
    growZones(cells, coords, lands, rng, 'none');
    assignTerrain(cells, coords, rng, null);
  } else {
    applySeaBorders(cells, coords, seaSides, cols, rows);   // sea first, so a mouth exists to find
    elev = buildElevation(cells, coords, rng);
    stats = carveWaterways(cells, coords, elev, rng).stats;
    growZones(cells, coords, lands, rng, waterPolicy);      // see the doc comment above
    assignTerrain(cells, coords, rng, elev);
  }

  return { cells, coords, elev, stats, cols, rows };
}

/** Everything the audit needs to be checkable rather than asserted. */
/** Connected components of the cells matching `pred` — used to count distinct lakes. */
function countClusters(cells, coords, pred) {
  const seen = new Set();
  let n = 0;
  for (const c of coords) {
    const k = key(c);
    if (seen.has(k) || !pred(cells.get(k))) continue;
    n += 1;
    const stack = [c]; seen.add(k);
    while (stack.length) {
      const cur = stack.pop();
      for (const nb of neighbours(cur)) {
        const nk = key(nb);
        if (!seen.has(nk) && cells.get(nk) && pred(cells.get(nk))) { seen.add(nk); stack.push(nb); }
      }
    }
  }
  return n;
}

export function summarise(map) {
  const { cells, coords } = map;
  const counts = {};
  const kinds = { sea: 0, river: 0, stream: 0, lake: 0 };
  for (const c of coords) {
    const cell = cells.get(key(c));
    counts[cell.terrain] = (counts[cell.terrain] ?? 0) + 1;
    if (cell.terrain === 'water') kinds[cell.waterKind ?? 'river'] += 1;
  }

  // Connected water bodies, and how many of them never touch the sea band (i.e. real lakes).
  const seen = new Set();
  const bodies = [];
  for (const c of coords) {
    const k = key(c);
    if (cells.get(k).terrain !== 'water' || seen.has(k)) continue;
    const stack = [c]; seen.add(k);
    let size = 0; let touchesSea = false; let allLake = true;
    while (stack.length) {
      const cur = stack.pop(); size += 1;
      const kind = cells.get(key(cur)).waterKind;
      if (kind === 'sea') touchesSea = true;
      if (kind !== 'lake') allLake = false;
      for (const n of neighbours(cur)) {
        const nk = key(n);
        if (cells.get(nk)?.terrain === 'water' && !seen.has(nk)) { seen.add(nk); stack.push(n); }
      }
    }
    bodies.push({ size, touchesSea, allLake });
  }

  // Per-province water and coast, the two numbers the whole audit turns on.
  const lands = new Map();
  for (const c of coords) {
    const cell = cells.get(key(c));
    if (!cell.landId) continue;
    if (!lands.has(cell.landId)) lands.set(cell.landId, { water: 0, coast: 0, hexes: 0 });
    const rec = lands.get(cell.landId);
    rec.hexes += 1;
    if (cell.terrain === 'water') rec.water += 1;
    else if (neighbours(c).some((n) => cells.get(key(n))?.waterKind === 'sea')) rec.coast += 1;
  }
  const list = [...lands.values()];

  return {
    counts,
    kinds,
    waterTiles: counts.water ?? 0,
    waterShare: ((counts.water ?? 0) / coords.length * 100).toFixed(1),
    bodies: bodies.length,
    lakeBodies: countClusters(cells, coords, (cell) => cell.waterKind === 'lake'),
    noOutlet: bodies.filter((b) => !b.touchesSea).length,
    provinces: list.length,
    withWater: list.filter((l) => l.water > 0).length,
    withCoast: list.filter((l) => l.coast > 0).length,
    harbourable: list.filter((l) => l.water + l.coast > 0).length,
    unclaimedWater: coords.filter((c) => {
      const cell = cells.get(key(c));
      return cell.terrain === 'water' && !cell.landId;
    }).length,
  };
}
