/** Deterministic PRNG (mulberry32) so a given seed always yields the same map. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function pickWeighted<T>(rng: () => number, entries: Array<{ value: T; weight: number }>): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.value;
    }
  }
  return entries[entries.length - 1].value;
}
