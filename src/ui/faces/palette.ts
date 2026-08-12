import type { FaceTintSlot } from './parts.generated';

/**
 * The colours a portrait is painted in.
 *
 * Kept apart from both the wardrobe and the resolver because these are the numbers most
 * likely to be revised by eye, and they should be findable without reading any logic.
 */

/**
 * Warmer and slightly less saturated than the set this replaces, and wider at the dark end,
 * which is where the old ramp was thinnest.
 */
export const SKINS = [0xe8c39a, 0xdcb188, 0xcfa176, 0xbf8d63, 0xaa7852, 0x94643f];

export const HAIRS = [0x14100c, 0x1d160f, 0x2a1f14, 0x3a2c1c, 0x4d4238];

/**
 * Court colours rather than an invented set. Vermilion and azure are what the Lê edicts
 * prescribed for the emperor and for high office; jade and gold are the game's own map and UI
 * tokens; nâu is the undyed brown of village dress; chàm the indigo of a field army. The
 * portraits used to carry a magenta, a cobalt and a violet that appeared nowhere else in the
 * product, which is why they read as stickers dropped onto the parchment.
 */
export const ROBES = {
  vermilion: 0xaa3a2c,
  azure: 0x2f5170,
  jade: 0x6f8f64,
  ochre: 0xb07a24,
  nau: 0x6b4a2f,
  cham: 0x26313c,
} as const;

export type FacePalette = Record<Exclude<FaceTintSlot, 'none'>, number>;

export function shade(color: number, amount: number): number {
  const clamp = (value: number) => Math.min(255, Math.max(0, value));
  return (clamp(((color >> 16) & 255) + amount) << 16)
    + (clamp(((color >> 8) & 255) + amount) << 8)
    + clamp((color & 255) + amount);
}
