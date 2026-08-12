import type { Hero, HeroEra } from '../../state/types';
import type { FaceTintSlot } from './parts.generated';

/**
 * Turns a hero into a stack of portrait parts.
 *
 * The one rule this file exists to enforce: **the seed never decides who someone is.** Sex,
 * monastic vows, role and rank come off the hero's own data and choose a *wardrobe*; only then
 * does the hash pick within it. What that buys is not merely correctness — before this, every
 * one of the five heroes the game names as a woman rendered with facial hair, and the Trúc Lâm
 * Zen master had a full head of hair under a cap — it is also that a portrait becomes readable:
 * a glance at the roster tells you what each person does and roughly when they lived.
 *
 * Era matters as much as role. Đại Việt did not dress the same way for a thousand years, and
 * the roster already spans the dynasties by name; a Nguyễn official in the crossed lapel that
 * the 1744 reform replaced is simply the wrong century.
 */

export interface HeroLookPart {
  key: string;
  tint: FaceTintSlot;
}

export interface HeroLook {
  parts: HeroLookPart[];
  palette: Record<Exclude<FaceTintSlot, 'none'>, number>;
  /** Resolved identity, exposed so the UI can label or debug a portrait. */
  sex: 'man' | 'woman';
  monastic: boolean;
  era: HeroEra;
  age: 'young' | 'prime' | 'elder';
  rank: number;
}

// ── palettes ────────────────────────────────────────────────────────────────
/**
 * Warmer and slightly less saturated than the set this replaces, and wider at the dark end,
 * which is where the old ramp was thinnest.
 */
const SKINS = [0xe8c39a, 0xdcb188, 0xcfa176, 0xbf8d63, 0xaa7852, 0x94643f];
const HAIRS = [0x14100c, 0x1d160f, 0x2a1f14, 0x3a2c1c, 0x4d4238];

/**
 * Court colours rather than an invented set. Vermilion and azure are what the Lê edicts
 * prescribed for the emperor and for high office; jade and gold are the game's own map and UI
 * tokens; nâu is the undyed brown of village dress; chàm the indigo of a field army. The
 * portraits used to carry a magenta, a cobalt and a violet that appeared nowhere else in the
 * product, which is why they read as stickers dropped onto the parchment.
 */
const ROBES = {
  vermilion: 0xaa3a2c,
  azure: 0x2f5170,
  jade: 0x6f8f64,
  ochre: 0xb07a24,
  nau: 0x6b4a2f,
  cham: 0x26313c,
} as const;

const RARITY_RANK: Record<Hero['rarity'], number> = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };
const PLATE = ['plate-common', 'plate-rare', 'plate-epic', 'plate-legendary'];
const RANK_SEAL = [undefined, 'rank-rare', 'rank-epic', 'rank-legendary'];

/** Eras a hero without an explicit one may be drawn in, weighted toward the mode's own period. */
const COMMON_ERAS: HeroEra[] = ['ly', 'tran', 'tran', 'le', 'le', 'dinh', 'nguyen'];

// ── seeding ─────────────────────────────────────────────────────────────────
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function pick<T>(items: readonly T[], next: () => number): T {
  return items[Math.floor(next() * items.length) % items.length];
}

function shade(color: number, amount: number): number {
  const clamp = (value: number) => Math.min(255, Math.max(0, value));
  return (clamp(((color >> 16) & 255) + amount) << 16)
    + (clamp(((color >> 8) & 255) + amount) << 8)
    + clamp((color & 255) + amount);
}

/**
 * Last-resort sex inference, for heroes created without the field.
 *
 * Vietnamese honorifics state it plainly — Bà and Nữ and Công Chúa are not ambiguous — so
 * reading the name is far better than rolling for it. Authored heroes should still set `sex`;
 * this only stops an unlabelled one from defaulting a princess into a beard.
 */
function inferSex(hero: Hero): 'man' | 'woman' {
  if (hero.sex) return hero.sex;
  const name = hero.name.toLocaleLowerCase('vi');
  if (/(^|\s)(bà|nữ|công chúa|hoàng hậu|thái hậu|phu nhân|cô|chị|mẹ)(\s|$)/.test(name)) return 'woman';
  return 'man';
}

// ── wardrobes ───────────────────────────────────────────────────────────────
/** Headwear each era actually offers, by role and sex. A monk's list has one entry. */
function headwearFor(era: HeroEra, type: Hero['type'], woman: boolean, rank: number): string[] {
  if (woman) {
    if (era === 'nguyen') return rank >= 2 ? ['hat-crown-nhatbinh', 'hat-moqua'] : ['hat-moqua', 'hat-moqua'];
    if (era === 'le' || era === 'tayson') return rank >= 2 ? ['hat-coronet', 'hat-moqua'] : ['hat-moqua', ''];
    return rank >= 2 ? ['hat-coronet', ''] : ['', 'hat-band'];
  }
  if (era === 'dinh') return type === 'general' ? ['hat-helm', ''] : ['', 'hat-khanvan'];
  if (era === 'ly') {
    if (type === 'general') return ['hat-helm', 'hat-khanvan'];
    if (type === 'minister') return ['hat-phocdau-short', 'hat-khanvan'];
    return ['hat-khanvan', 'hat-non'];
  }
  if (era === 'tran') {
    if (type === 'general') return ['hat-helm', ''];
    if (type === 'minister') return ['hat-phocdau-short', ''];
    return ['hat-khanvan', '', 'hat-non'];
  }
  if (era === 'le') {
    if (type === 'general') return ['hat-helm', 'hat-khanvan'];
    if (type === 'minister') return ['hat-phocdau-short', 'hat-phocdau-short'];
    return ['hat-khanvan', 'hat-non'];
  }
  if (era === 'tayson') return type === 'general' ? ['hat-helm', 'hat-band'] : ['hat-band', 'hat-khanvan', 'hat-non'];
  return type === 'minister' ? ['hat-phocdau-short', 'hat-khandong'] : ['hat-khandong', 'hat-non'];
}

/** Rank lengthens the dragonfly wings, as the 1499 court regulations did. */
function rankWings(hat: string, rank: number): string {
  if (!hat.startsWith('hat-phocdau')) return hat;
  return rank >= 3 ? 'hat-phocdau-grand' : rank >= 2 ? 'hat-phocdau-long' : 'hat-phocdau-short';
}

/** The robe, its collar, and whatever fastens it — one coherent set per era and sex. */
function garmentsFor(era: HeroEra, woman: boolean, monastic: boolean, type: Hero['type']): HeroLookPart[] {
  if (monastic) {
    return [{ key: 'robe-body', tint: 'robe' }, { key: 'kesa', tint: 'none' }];
  }
  if (woman) {
    if (era === 'nguyen') {
      return [
        { key: 'robe-body', tint: 'robe' },
        { key: 'robe-sheen', tint: 'robeLight' },
        { key: 'collar-nhatbinh', tint: 'robeDark' },
        { key: 'collar-nhatbinh-trim', tint: 'none' },
      ];
    }
    const dress: HeroLookPart[] = [
      { key: 'robe-body', tint: 'robe' },
      { key: 'robe-sheen', tint: 'robeLight' },
      { key: 'collar-yem-wrap', tint: 'robeLight' },
      { key: 'yem', tint: 'none' },
    ];
    if (era === 'le' || era === 'tayson') dress.push({ key: 'sash-waist', tint: 'none' });
    return dress;
  }
  const body: HeroLookPart[] = [
    { key: type === 'general' ? 'robe-armour' : 'robe-body', tint: 'robe' },
    { key: 'robe-sheen', tint: 'robeLight' },
  ];
  if (era === 'nguyen') {
    // Áo ngũ thân: a standing collar closing to the right, five buttons for the Five Constants.
    return [...body, { key: 'collar-nguthan-body', tint: 'robe' }, { key: 'collar-nguthan', tint: 'robeLight' }, { key: 'buttons-five', tint: 'none' }];
  }
  if (era === 'dinh') {
    // The two-flap wrap the Đông Sơn drums show, closed with a sash.
    return [...body, { key: 'collar-twoflap', tint: 'robeDark' }, { key: 'collar-twoflap-over', tint: 'robeLight' }, { key: 'sash-ochre', tint: 'none' }];
  }
  const giaoLinh: HeroLookPart[] = [
    ...body,
    { key: 'collar-giaolinh', tint: 'robeDark' },
    { key: 'collar-giaolinh-over', tint: 'robeLight' },
  ];
  if (era === 'tayson') giaoLinh.push({ key: 'sash-baldric', tint: 'none' });
  return giaoLinh;
}

function robeColour(type: Hero['type'], woman: boolean, monastic: boolean, era: HeroEra, rank: number): number {
  if (monastic) return ROBES.ochre;
  if (woman) return rank >= 3 ? ROBES.vermilion : rank >= 2 ? ROBES.azure : ROBES.nau;
  if (type === 'minister') return rank >= 2 ? ROBES.azure : ROBES.jade;
  if (type === 'general') return era === 'tayson' ? ROBES.vermilion : ROBES.cham;
  if (type === 'governor') return ROBES.nau;
  return rank >= 2 ? ROBES.jade : ROBES.nau;
}

// ── the resolver ────────────────────────────────────────────────────────────
export function resolveHeroLook(hero: Hero): HeroLook {
  const next = seededRandom(hashString(hero.id));
  const woman = inferSex(hero) === 'woman';
  const monastic = hero.monastic === true;
  const rank = RARITY_RANK[hero.rarity] ?? 0;
  const era: HeroEra = hero.era ?? pick(COMMON_ERAS, next);
  const age: HeroLook['age'] = monastic ? 'elder' : pick(['young', 'prime', 'prime', 'elder'] as const, next);

  const skin = pick(SKINS, next);
  const hairBase = pick(HAIRS, next);
  // Grey comes with age, not with the dice.
  const hair = age === 'elder' ? shade(hairBase, 74) : hairBase;
  const robe = robeColour(hero.type, woman, monastic, era, rank);

  const parts: HeroLookPart[] = [{ key: PLATE[rank], tint: 'none' }];
  parts.push(...garmentsFor(era, woman, monastic, hero.type));
  parts.push({ key: 'neck', tint: 'skinShadow' });
  parts.push({ key: 'ears', tint: 'skinShadow' });

  // Head shape carries sex and age before any feature does — a narrower jaw on a woman, a
  // slighter one on an elder — which is what stops a roster reading as one man in many hats.
  const headPool = woman
    ? (['head-soft', 'head-narrow', 'head-oval'] as const)
    : age === 'elder'
      ? (['head-narrow', 'head-oval', 'head-soft'] as const)
      : (['head-oval', 'head-broad', 'head-square', 'head-oval'] as const);
  parts.push({ key: pick(headPool, next), tint: 'skin' });

  // Hair, then whatever goes over it.
  const hat = monastic ? 'scalp' : rankWings(pick(headwearFor(era, hero.type, woman, rank), next), rank);
  if (monastic) {
    parts.push({ key: 'scalp-shaven', tint: 'skinLight' });
    parts.push({ key: 'scalp-dots', tint: 'skinShadow' });
  } else if (woman) {
    parts.push({ key: hat === 'hat-moqua' ? 'hair-crown' : 'hair-long', tint: 'hair' });
    if (hat !== 'hat-moqua') parts.push({ key: pick(['bun-high', 'bun-low'] as const, next), tint: 'hair' });
  } else {
    // Trần fashion cropped the hair short — Chinese envoys remarked on it, and it is the
    // cheapest way to make a Trần portrait unmistakable beside a Lê one.
    parts.push({ key: era === 'tran' ? 'hair-cropped' : 'hair-crown', tint: 'hair' });
    if (hat === '' || hat === 'hat-khanvan' || hat === 'hat-khandong') {
      parts.push({ key: era === 'dinh' ? 'topknot-tall' : 'topknot', tint: 'hair' });
      if (era === 'dinh') parts.push({ key: 'hairpin', tint: 'none' });
    }
  }
  if (hat && hat !== 'scalp') parts.push({ key: hat, tint: 'none' });

  // Features.
  parts.push({ key: pick(['brow-flat', 'brow-arched', 'brow-angled'] as const, next), tint: 'hair' });
  parts.push({ key: pick(['eyes-almond', 'eyes-wide', 'eyes-narrow'] as const, next), tint: 'none' });
  parts.push({ key: pick(['nose-straight', 'nose-long', 'nose-soft'] as const, next), tint: 'skinShadow' });

  // Nhuộm răng đen: lacquered teeth were a beauty standard for centuries, commonest among
  // women and in the older eras, and fading under the Nguyễn.
  const lacquered = era === 'nguyen' ? next() > 0.82 : woman ? next() > 0.45 : age === 'elder' ? next() > 0.4 : next() > 0.8;
  parts.push({
    key: lacquered ? 'mouth-lacquered' : pick(['mouth-neutral', 'mouth-smile', 'mouth-firm'] as const, next),
    tint: 'none',
  });

  // Facial hair is gated on identity, never rolled for it.
  if (!woman && !monastic && age !== 'young') {
    const beard = pick(['', 'beard-moustache', 'beard-goatee', 'beard-long', 'beard-full'] as const, next);
    if (beard) parts.push({ key: beard, tint: 'hair' });
  }

  if (age === 'elder') parts.push({ key: 'mark-age', tint: 'skinShadow' });
  if (hero.type === 'general' && !woman && next() > 0.68) parts.push({ key: 'mark-scar', tint: 'skinShadow' });

  // Court tattoos were the price of entry to the Lý and Trần palaces — borne by emperors,
  // every mandarin, and the women of the harem alike.
  if ((era === 'ly' || era === 'tran') && rank >= 1) {
    parts.push({ key: 'mark-tattoo', tint: 'none' });
    if (rank >= 2) parts.push({ key: 'mark-tattoo-court', tint: 'none' });
  }

  const seal = RANK_SEAL[rank];
  if (seal) parts.push({ key: seal, tint: 'none' });

  return {
    parts,
    palette: {
      skin,
      skinShadow: shade(skin, -30),
      skinLight: shade(skin, 20),
      hair,
      robe,
      robeDark: shade(robe, -34),
      robeLight: shade(robe, 30),
    },
    sex: woman ? 'woman' : 'man',
    monastic,
    era,
    age,
    rank,
  };
}
