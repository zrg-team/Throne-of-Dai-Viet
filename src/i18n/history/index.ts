import { getLanguage, interpolate } from '../index';
import { armyEn, armyVi } from './army';
import { dynastiesEn, dynastiesVi } from './dynasties';
import { groupsEn, groupsVi } from './groups';
import { storyNotesEn, storyNotesVi } from './storyNotes';
import { termsEn, termsVi } from './terms';

/**
 * The History page's prose, deliberately **outside** the eagerly merged `i18n/catalogs/*` bundle.
 *
 * Same reasoning as `i18n/story/index.ts`, which said it first: the catalogues are validated
 * key-for-key at module load and throw on a miss, so putting a hundred paragraphs of history there
 * would make one unwritten Vietnamese note a blank screen at boot rather than one English
 * paragraph on a page nobody has opened yet. The chrome — tabs, headings, the button on the front
 * page — does live in the catalogues, because that text is short, finite, and always on screen.
 */

export type HistoryCatalog = Record<string, string>;

const EN: HistoryCatalog = { ...armyEn, ...dynastiesEn, ...groupsEn, ...storyNotesEn, ...termsEn };
const VI: HistoryCatalog = { ...armyVi, ...dynastiesVi, ...groupsVi, ...storyNotesVi, ...termsVi };

/** Resolves Vietnamese, then English, then hands back the key so a miss is visible and harmless. */
export function historyText(key: string, params: Record<string, string | number> = {}): string {
  const template = (getLanguage() === 'vi' ? VI[key] : undefined) ?? EN[key];
  return template ? interpolate(template, params) : key;
}

/** True when the key resolves in the given language. Used by the coverage harness, not the game. */
export function hasHistoryText(key: string, language: 'en' | 'vi' = 'en'): boolean {
  return Boolean((language === 'vi' ? VI : EN)[key]);
}

/** Every key that has prose, in either language. The harness diffs the two sets. */
export function historyKeys(language: 'en' | 'vi' = 'en'): string[] {
  return Object.keys(language === 'vi' ? VI : EN);
}
