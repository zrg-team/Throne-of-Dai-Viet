import { garmentsFor, headwearFor, rankWings, robeColour } from './wardrobe';
import { HAIRS, ROBES, SKINS, shade, type FacePalette } from './palette';
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
  palette: FacePalette;
  /** Resolved identity, exposed so the UI can label or debug a portrait. */
  sex: 'man' | 'woman';
  monastic: boolean;
  era: HeroEra;
  age: 'young' | 'prime' | 'elder';
  rank: number;
}

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
