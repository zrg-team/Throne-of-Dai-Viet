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
 *
 * ## The two voices, and why the Vietnamese is not a translation
 *
 * Every entry here is a pair: what the record says, then what the game made of it. They are written
 * in **different registers on purpose**, and that split is the page's whole editorial claim. Blur
 * them and a reader can no longer tell which half is the country's and which half is ours.
 *
 * **The record half** — `*.body`, `*.happened`, `terms.*.body`, the era prose — is written to read
 * like a Vietnamese history book, because that is what it claims to be. The model is modern
 * Vietnamese historiography (Viet Nam su luoc and the standard reference articles), not pastiche
 * Han van, and it follows that register's rules:
 *
 * - The year leads. "Nam 938, Ngo Quyen sai dong coc..." and never "Ngo Quyen, nam 938, ...".
 * - Han-Viet for institutions and events, plain Vietnamese for the narration around them: `day
 *   binh`, `dem quan`, `dep`, `len ngoi`, `dat quoc hieu`, `doi do`, `cuop ngoi`, `tu tran`,
 *   `tiet do su`, `thai thu`, `suu thue`. The chronicle connectives carry the sentences: `ben`,
 *   `tu do`, `den khi ... moi ...`.
 * - Sources get named wherever a claim is disputed: `Su chep`, `Toan thu xep...`, `Truyen rang`,
 *   `su ta chep la`. A figure the annals give and modern scholarship halves is printed as a figure
 *   the annals give, not as a fact.
 * - Quotations use the canonical Vietnamese wording rather than a back-translation of the English.
 *   Ba Trieu, Tran Thu Do and Tran Binh Trong say here what every schoolbook has them say.
 * - **No second person, ever.** A history book does not address its reader, and the moment this
 *   half says `nguoi` it has stopped being the record and started being the game.
 *
 * **The game half** — `*.inGame` — is the designer talking, and stays modern and plain. It keeps
 * `nguoi`, the address the rest of the game already uses; `ban` is wrong here because it is wrong
 * everywhere else in this product. It says `tro choi`, never the English word.
 *
 * The Vietnamese is **not** a translation of the English and should not be edited as one. It was
 * written against the same facts in its own register, so a sentence-for-sentence diff between the
 * two will not line up — and making it line up would cost the exact thing this page is for.
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
