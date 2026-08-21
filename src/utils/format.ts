/**
 * A whole figure with its thousands grouped: 4820 → "4,820".
 *
 * Shared rather than local to a scene, and that is the point. The readout band and the advisor
 * strip under it quote the same numbers, and the advisor's whole method is that a player can check
 * what it says against the band above it and learn to read the band for themselves. Two
 * implementations of this — one grouping and one not — break that quietly: the same 4,820 appears
 * twice on one screen written two different ways, and the reader has to work out whether they are
 * even the same quantity.
 *
 * `en-US` grouping in both languages on purpose: Vietnamese conventionally groups with a full
 * stop, which reads as a decimal point to a good part of the audience the quốc ngữ build serves.
 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function compactNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return `${Math.round(value)}`;
}
