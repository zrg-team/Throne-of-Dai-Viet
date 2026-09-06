/**
 * The pigments of a Đông Hồ woodblock print.
 *
 * Not chosen for taste. Every one is a material a Đông Hồ printer actually ground, matched to a
 * screen value that survives an OLED phone in daylight: black from the charcoal of burnt bamboo
 * leaves, red from gravel of Thiên Thai hill, yellow from sophora flower buds, blue from fermented
 * indigo, green from copper verdigris, white from the crushed seashell that coats the paper.
 *
 * The one rule the whole art direction hangs on: **sỏi son is spent on the player alone** — your
 * banner, your seal, your losses. The moment a second thing on screen earns that red, the map stops
 * having a focal point.
 */
export const PIGMENT = {
  /** Điệp — dó-bark paper coated in crushed seashell. The ground everything sits on. */
  diep: 0xe9dfc2,
  diepHi: 0xf3ecd8,
  diepLo: 0xd8c9a4,
  diepDeep: 0xc9b78c,
  /**
   * Điệp warmed three tenths of the way toward hoa hòe — the "vàng cái" sheet a printer makes by
   * stirring hòe water into the shell paste. The fill under open ground and cropland in every
   * season, because on a print that ground *is* the sheet and the calendar is stated by what
   * stands in it. A mix of two pigments already here, not a new hue: `mixPigment(diep, hoePale, 0.3)`.
   */
  diepWarm: 0xe5d5ae,

  /** Mực nho — burnt bamboo-leaf soot. Warm, never blue-black. */
  muc: 0x2a2118,
  mucSoft: 0x5a4c39,
  mucFaint: 0x8c7e67,

  /** Sỏi son — red gravel from Thiên Thai hill. Reserved for the player. */
  son: 0xb33a26,
  sonDeep: 0x8a2a1b,
  sonPale: 0xd98a72,

  /** Chàm — fermented indigo leaf. Water and distance. */
  cham: 0x42596b,
  chamPale: 0x8fa5b2,
  chamWash: 0xafc0c7,

  /**
   * Lá tràm — cajuput leaf. Every growing thing.
   *
   * Split out of `giDong`, which was doing two jobs that are not the same colour. The Đông Hồ
   * greens come from cajuput leaves boiled down; copper verdigris is the *blue*-green the same
   * accounts put beside indigo, and it belongs on bronze and on jade rather than on rice.
   *
   * Warmer and yellower than the green it replaces, which is the direction a leaf actually sits
   * in — and only a little, so the map it repaints is the same country.
   */
  tram: 0x7d9160,
  tramPale: 0xa7b98d,
  tramDeep: 0x5b6d45,

  /** Gỉ đồng — copper verdigris. Bronze, jade, and the patina on both. */
  giDong: 0x5f8a82,
  giDongPale: 0x94b2ab,

  /** Hoa hòe — sophora flower bud. Grain, gold, lamplight. */
  hoe: 0xc08a2e,
  hoePale: 0xdcbe7e,

  /** Nâu — the iron-brown glaze of Trần ware. Timber and earth. */
  nau: 0x7a5636,
  nauDark: 0x5c3f26,

  /** Livestock: a near-black hide so the cream horn carries the colour. */
  hide: 0x3e3226,
  hideLo: 0x584833,
  horn: 0xdccfae,
  // Deliberately NOT `as const`: these values feed palettes whose entries are compared and
  // reassigned, and literal types would make every one of those a type error.
};

export type PigmentKey = keyof typeof PIGMENT;

/** Darkens (factor < 1) or lightens (factor > 1) a 0xRRGGBB pigment. */
export function shadePigment(colour: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((colour >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((colour >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((colour & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

/**
 * Pulls a pigment toward the paper, for a rival's version of a player device.
 *
 * A rival flies the same five standards as the player, desaturated, so that the only saturated red
 * anywhere on the map is still the player's own.
 */
export function mutePigment(colour: number, amount = 0.62): number {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  const grey = Math.round(r * 0.32 + g * 0.5 + b * 0.18);
  const mix = (channel: number) => Math.round(channel + (grey - channel) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}
