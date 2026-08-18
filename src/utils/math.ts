export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function chooseByIndex<T>(items: T[], index: number): T | undefined {
  if (items.length === 0) {
    return undefined;
  }

  return items[index % items.length];
}

/**
 * Roulette-wheel pick: returns the index of one item, chosen in proportion to `weights`.
 * Returns -1 for an empty or all-zero set so callers can bail rather than pick a default.
 */
export function weightedPickIndex(weights: number[]): number {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) {
    return -1;
  }

  let roll = Math.random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= Math.max(0, weights[index]);
    if (roll <= 0) {
      return index;
    }
  }
  return weights.length - 1;
}

/** Roulette-wheel pick over items, scored by `weightOf`. Undefined when nothing is eligible. */
export function weightedPick<T>(items: T[], weightOf: (item: T) => number): T | undefined {
  const index = weightedPickIndex(items.map(weightOf));
  return index < 0 ? undefined : items[index];
}

/** Deterministic small hash, used to seed per-feature randomness from a stable key. */
export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** Fisher-Yates copy: the same items in a fresh random order, leaving the input untouched. */
export function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
