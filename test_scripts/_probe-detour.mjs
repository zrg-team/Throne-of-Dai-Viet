// A river does not cut the realm into islands — provinces are big and the graph routes around.
// What it does is sever specific FACING pairs. This measures how far you must march instead.
import { buildMap, key, neighbours } from './_hydrology.mjs';

const analyse = (seed, waterPolicy) => {
  const map = buildMap(seed, 'proposed', { waterPolicy });
  const { cells, coords } = map;
  const dryLand = (k) => {
    const c = cells.get(k);
    return c && c.landId && c.terrain !== 'water' ? c.landId : null;
  };

  const adj = new Map();
  for (const c of coords) {
    const a = dryLand(key(c));
    if (!a) continue;
    if (!adj.has(a)) adj.set(a, new Set());
    for (const n of neighbours(c)) {
      const b = dryLand(key(n));
      if (b && b !== a) adj.get(a).add(b);
    }
  }

  // Facing pairs: two provinces whose dry ground touches the same inland water hex.
  const facing = new Map();
  for (const c of coords) {
    const cell = cells.get(key(c));
    if (cell.terrain !== 'water' || cell.waterKind === 'sea') continue;
    const banks = new Set();
    for (const n of neighbours(c)) {
      const b = dryLand(key(n));
      if (b) banks.add(b);
    }
    const list = [...banks];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const pair = [list[i], list[j]].sort().join('|');
        if (!facing.has(pair)) facing.set(pair, { a: list[i], b: list[j], sites: 0 });
        facing.get(pair).sites += 1;
      }
    }
  }

  const hops = (from, to) => {
    if (from === to) return 0;
    const seen = new Set([from]);
    let frontier = [from], d = 0;
    while (frontier.length) {
      d += 1;
      const next = [];
      for (const cur of frontier) {
        for (const nb of adj.get(cur) ?? []) {
          if (nb === to) return d;
          if (!seen.has(nb)) { seen.add(nb); next.push(nb); }
        }
      }
      frontier = next;
      if (d > 40) break;
    }
    return Infinity;
  };

  let severed = 0, detour2 = 0, detour3 = 0, detour4plus = 0, unreachable = 0;
  const worst = [];
  for (const { a, b, sites } of facing.values()) {
    if (adj.get(a)?.has(b)) continue;           // already neighbours by dry ground; no bridge needed
    severed += 1;
    const d = hops(a, b);
    if (d === Infinity) unreachable += 1;
    else if (d <= 2) detour2 += 1;
    else if (d === 3) detour3 += 1;
    else detour4plus += 1;
    worst.push({ d, sites });
  }
  worst.sort((x, y) => (y.d === Infinity ? 99 : y.d) - (x.d === Infinity ? 99 : x.d));

  return { facingPairs: facing.size, severed, detour2, detour3, detour4plus, unreachable,
           worstDetours: worst.slice(0, 5).map((w) => w.d) };
};

for (const policy of ['permeable', 'barrier']) {
  console.log(`
── growth across water: ${policy} ──`);
  for (const seed of [1337, 42, 7, 2024, 99, 184411832]) {
    console.log(String(seed).padStart(9), JSON.stringify(analyse(seed, policy)));
  }
}
