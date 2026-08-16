import { getLanguage, interpolate } from '../index';
import { reedBannerEn, reedBannerVi } from './reedBanner';
import {
  countingHouseEn,
  countingHouseVi,
  dienHongEn,
  dienHongVi,
  gooseFeathersEn,
  gooseFeathersVi,
  granariesEn,
  granariesVi,
  orangeEn,
  orangeVi,
  riverStakesEn,
  riverStakesVi,
} from './rest';
import {
  assemblyEn, assemblyVi,
  borrowedSwordEn, borrowedSwordVi,
  chamEngineerEn, chamEngineerVi,
  eatTogetherEn, eatTogetherVi,
  noHeirEn, noHeirVi,
  riceRiotEn, riceRiotVi,
  rideTheWindEn, rideTheWindVi,
  sixtyFiveCitadelsEn, sixtyFiveCitadelsVi,
  slanderedEn, slanderedVi,
  substitutionEn, substitutionVi,
  trustedEn, trustedVi,
  unpaidEn, unpaidVi,
} from './histories';
import type { StoryCatalog } from './types';

/**
 * Story text, deliberately **outside** the eagerly merged `i18n/catalogs/*` bundle.
 *
 * Two reasons, both structural. The main catalogues are imported eagerly and validated key-for-key
 * at module load, so putting tens of thousands of words of fragment prose there would push the
 * whole Chronicle into the initial bundle for a mode most sessions never open — and would make
 * every missing Vietnamese line a hard startup crash rather than a graceful fallback to English.
 *
 * Registered per story here so this file is the only thing that changes when a story is added,
 * and so the map can later be swapped for `import()` without touching a single call site.
 */

interface StoryPair {
  en: StoryCatalog;
  vi: StoryCatalog;
}

const CATALOGS: Record<string, StoryPair> = {
  'reed-banner': { en: reedBannerEn, vi: reedBannerVi },
  'goose-feathers': { en: gooseFeathersEn, vi: gooseFeathersVi },
  granaries: { en: granariesEn, vi: granariesVi },
  'river-stakes': { en: riverStakesEn, vi: riverStakesVi },
  'counting-house': { en: countingHouseEn, vi: countingHouseVi },
  'dien-hong': { en: dienHongEn, vi: dienHongVi },
  orange: { en: orangeEn, vi: orangeVi },

  'sixty-five-citadels': { en: sixtyFiveCitadelsEn, vi: sixtyFiveCitadelsVi },
  'ride-the-wind': { en: rideTheWindEn, vi: rideTheWindVi },
  substitution: { en: substitutionEn, vi: substitutionVi },
  'borrowed-sword': { en: borrowedSwordEn, vi: borrowedSwordVi },
  slandered: { en: slanderedEn, vi: slanderedVi },
  trusted: { en: trustedEn, vi: trustedVi },
  'cham-engineer': { en: chamEngineerEn, vi: chamEngineerVi },
  assembly: { en: assemblyEn, vi: assemblyVi },
  'rice-riot': { en: riceRiotEn, vi: riceRiotVi },
  'no-heir': { en: noHeirEn, vi: noHeirVi },
  'eat-together': { en: eatTogetherEn, vi: eatTogetherVi },
  unpaid: { en: unpaidEn, vi: unpaidVi },
};

/**
 * Resolves `<templateId>.<rest>`; falls back to English, then to the key itself.
 *
 * Returning the key rather than throwing is deliberate: a story text miss should show a visibly
 * wrong string in one card, not take the run down. Missing keys are caught by the story test.
 */
export function storyText(key: string, params: Record<string, string | number> = {}): string {
  const split = key.indexOf('.');
  if (split < 0) return key;
  const templateId = key.slice(0, split);
  const rest = key.slice(split + 1);

  const pair = CATALOGS[templateId];
  if (!pair) return key;

  const template = (getLanguage() === 'vi' ? pair.vi[rest] : undefined) ?? pair.en[rest];
  return template ? interpolate(template, params) : key;
}

/** True when a key resolves. Used by the coverage test rather than by the game. */
export function hasStoryText(key: string): boolean {
  const split = key.indexOf('.');
  if (split < 0) return false;
  const pair = CATALOGS[key.slice(0, split)];
  return Boolean(pair && pair.en[key.slice(split + 1)]);
}

/** The story's own title, for the Chronicle and the card header. */
export function storyTitle(templateId: string): string {
  const pair = CATALOGS[templateId];
  if (!pair) return templateId;
  return (getLanguage() === 'vi' ? pair.vi.title : undefined) ?? pair.en.title ?? templateId;
}

export const storyCatalogIds = Object.keys(CATALOGS);
