export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function chooseByIndex<T>(items: T[], index: number): T | undefined {
  if (items.length === 0) {
    return undefined;
  }

  return items[index % items.length];
}

/** Deterministic small hash, used to seed per-feature randomness from a stable key. */
export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
