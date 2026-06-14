export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function chooseByIndex<T>(items: T[], index: number): T | undefined {
  if (items.length === 0) {
    return undefined;
  }

  return items[index % items.length];
}
