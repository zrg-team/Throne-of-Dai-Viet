import { createRng } from '../map/random';

/** The original road worker plus five civilian silhouettes from the same print family. */
export const CONQUEST_TRAVELER_STYLES = [
  'traveler', 'traveler-basket', 'traveler-fisher', 'traveler-merchant',
  'traveler-pilgrim', 'traveler-woodcutter',
] as const;

/** A seeded shuffle per road/settlement; siblings differ and refreshes keep their identities. */
export function conquestTravelerArtId(seed: number, index = 0): string {
  const styles = [...CONQUEST_TRAVELER_STYLES];
  const random = createRng(seed);
  for (let i = styles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [styles[i], styles[j]] = [styles[j], styles[i]];
  }
  return `life.${styles[Math.abs(Math.trunc(index)) % styles.length]}`;
}
