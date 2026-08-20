// Does the proposed river system actually cut the realm in two, and how many crossings would it
// take to stitch it back together? Adjacency here follows computeNeighbors: two hexes are only
// neighbours if BOTH carry a landId and the ground between them is dry.
import { buildMap, summarise, key, neighbours } from './_hydrology.mjs';

const analyse = (seed, mode, waterPolicy) => {
  const map = buildMap(seed, mode, { waterPolicy });
  const { cells, coords } = map;
  const dryLand = (k) => {
    const c = cells.get(k);
    return c && c.landId && c.terrain !== 'water' ? c.landId : null;
  };

  // Land graph over dry ground only — water severs, exactly as computeNeighbors does today.
  const adj = new Map();
  const ids = new Set();
  for (const c of coords) {
    const a = dryLand(key(c));
    if (!a) continue;
    ids.add(a);
    if (!adj.has(a)) adj.set(a, new Set());
    for (const n of neighbours(c)) {
      const b = dryLand(key(n));
      if (b && b !== a) adj.get(a).add(b);
    }
  }

  const seen = new Set();
  const comps = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id]; seen.add(id);
    const comp = [];
    while (stack.length) {
      const cur = stack.pop(); comp.push(cur);
      for (const nb of adj.get(cur) ?? []) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);

  // Crossing candidates: a water hex with dry ground of two DIFFERENT provinces on it.
  // These are the places a bridge could physically stand.
  const crossings = [];
  for (const c of coords) {
    const cell = cells.get(key(c));
    if (cell.terrain !== 'water' || cell.waterKind === 'sea') continue;
    const banks = new Set();
    for (const n of neighbours(c)) {
      const b = dryLand(key(n));
      if (b) banks.add(b);
    }
    if (banks.size >= 2) crossings.push({ at: c, banks: [...banks] });
  }

  // How many of those crossings would actually join two separated components?
  const compOf = new Map();
  comps.forEach((comp, i) => comp.forEach((id) => compOf.set(id, i)));
  const joining = crossings.filter((x) => new Set(x.banks.map((b) => compOf.get(b))).size >= 2);

  return {
    provinces: ids.size,
    components: comps.length,
    sizes: comps.map((c) => c.length).slice(0, 6),
    isolated: comps.filter((c) => c.length === 1).length,
    crossingSites: crossings.length,
    crossingsThatReconnect: joining.length,
    bridgesNeeded: Math.max(0, comps.length - 1),
    water: summarise(map).waterTiles,
  };
};

for (const policy of ['permeable', 'barrier']) {
  console.log(`
── ${policy} ──`);
  for (const seed of [1337, 42, 7, 2024, 99, 184411832]) {
    const p = analyse(seed, 'proposed', policy);
    console.log(
      `seed ${String(seed).padStart(9)} | ${p.components} components (largest ${p.sizes.join('/')})` +
      ` | lone provinces ${p.isolated} | bridge sites ${p.crossingSites},` +
      ` reconnecting ${p.crossingsThatReconnect} | min bridges ${p.bridgesNeeded}`
    );
  }
}
