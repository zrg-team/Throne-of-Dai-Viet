export function compactNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return `${Math.round(value)}`;
}
