import type {
  Hero,
  HeroType,
  LandBuildingType,
  LandType,
  PoliticsCard,
  PoliticsChoice,
  ResourceKey,
  Season,
} from '../state/types';
import { enAscent, viAscent } from './catalogs/ascent';
import { enCore, viCore } from './catalogs/core';
import { enEmpire, viEmpire } from './catalogs/empire';
import { enHeroes, viHeroes } from './catalogs/heroes';
import { viPolitics } from './catalogs/politics';
import { enWorld, viWorld } from './catalogs/world';

export type LanguageCode = 'en' | 'vi';

export const LANGUAGE_STORAGE_KEY = 'mandate:language:v1';

type TranslationParams = Record<string, string | number>;

const en = {
  ...enCore,
  ...enWorld,
  ...enHeroes,
  ...enEmpire,
  ...enAscent,
} as const;

const vi = {
  ...viCore,
  ...viWorld,
  ...viHeroes,
  ...viEmpire,
  ...viAscent,
} satisfies Record<keyof typeof en, string>;

export type TranslationKey = keyof typeof en;

const catalogs = { en, vi };
const listeners = new Set<(language: LanguageCode) => void>();

validateCatalogs();

export function getLanguage(): LanguageCode {
  if (typeof localStorage === 'undefined') {
    return 'en';
  }
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === 'vi' || stored === 'en' ? stored : 'en';
}

export function setLanguage(language: LanguageCode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
  for (const listener of listeners) {
    listener(language);
  }
}

export function subscribeLanguageChange(listener: (language: LanguageCode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: TranslationKey, params: TranslationParams = {}): string {
  return translateKey(key, undefined, params);
}

export function interpolate(template: string, params: TranslationParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = params[name];
    return typeof value === 'undefined' ? match : String(value);
  });
}

export function seasonLabel(season: Season): string {
  return t(`season.${season}` as TranslationKey);
}

export function resourceLabel(resource: ResourceKey): string {
  return t(`resource.${resource}` as TranslationKey);
}

export function buildingLabel(building: LandBuildingType): string {
  return t(`building.${building}` as TranslationKey);
}

export function buildBuildingLabel(building: LandBuildingType): string {
  return t('building.buildLabel', { building: buildingLabel(building) });
}

export function landTypeLabel(type: LandType): string {
  return t(`landType.${type}` as TranslationKey);
}

export function heroTypeLabel(type: HeroType): string {
  return t(`heroType.${type}` as TranslationKey);
}

export function rarityLabel(rarity: Hero['rarity']): string {
  return t(`rarity.${rarity}` as TranslationKey);
}

export function politicsTypeLabel(type: PoliticsCard['type']): string {
  return t(`politics.type.${type}` as TranslationKey);
}

export function tickLabel(count: number): string {
  return t(count === 1 ? 'tick.one' : 'tick.many');
}

export function formatResourceList(values: Partial<Record<ResourceKey, number>>): string {
  return Object.entries(values)
    .map(([key, value]) => `${value} ${resourceLabel(key as ResourceKey)}`)
    .join(', ');
}

export function heroName(hero: Hero): string {
  if (hero.id === 'king') {
    return hero.name;
  }
  return translateKey(heroKey(hero.id, 'name'), hero.name);
}

export function heroDescription(hero: Hero): string {
  return translateKey(heroKey(hero.id, 'description'), hero.description);
}

export function heroEffect(hero: Hero): string {
  if (hero.id === 'king') {
    const traitKey = findKingTraitKey(hero.effect);
    return traitKey ? translateKey(traitKey, hero.effect) : hero.effect;
  }
  return translateKey(heroKey(hero.id, 'effect'), hero.effect);
}

export function politicsTitle(card: PoliticsCard): string {
  return getLanguage() === 'vi' ? viPolitics[card.id]?.title ?? card.title : card.title;
}

export function politicsDescription(card: PoliticsCard): string {
  return getLanguage() === 'vi' ? viPolitics[card.id]?.description ?? card.description : card.description;
}

export function politicsChoiceLabel(choice: PoliticsChoice): string {
  return getLanguage() === 'vi' ? findPoliticsChoice(choice.id)?.label ?? choice.label : choice.label;
}

export function politicsChoiceDescription(choice: PoliticsChoice): string {
  return getLanguage() === 'vi' ? findPoliticsChoice(choice.id)?.description ?? choice.description : choice.description;
}

function translateKey(key: string, fallback?: string, params: TranslationParams = {}): string {
  const language = getLanguage();
  const catalog = catalogs[language] as Record<string, string>;
  const englishCatalog = en as Record<string, string>;
  const template = catalog[key] ?? englishCatalog[key] ?? fallback ?? key;
  return interpolate(template, params);
}

function heroKey(heroId: string, field: 'name' | 'description' | 'effect'): string {
  return `heroes.${heroId}.${field}`;
}

function findKingTraitKey(effect: string): string | undefined {
  for (const key of ['heroes.king.trait_morale.effect', 'heroes.king.trait_power.effect', 'heroes.king.trait_rations.effect']) {
    if (effect === en[key as TranslationKey] || effect === vi[key as TranslationKey]) {
      return key;
    }
  }
  return undefined;
}

function findPoliticsChoice(choiceId: string): { label: string; description: string } | undefined {
  for (const card of Object.values(viPolitics)) {
    const choice = card.choices[choiceId];
    if (choice) {
      return choice;
    }
  }
  return undefined;
}

function validateCatalogs(): void {
  const englishKeys = Object.keys(en);
  const vietnameseKeys = Object.keys(vi);
  const uniqueEnglishKeys = new Set(englishKeys);
  const uniqueVietnameseKeys = new Set(vietnameseKeys);

  if (englishKeys.length !== uniqueEnglishKeys.size || vietnameseKeys.length !== uniqueVietnameseKeys.size) {
    throw new Error('Localization catalogs contain duplicate keys after merge.');
  }

  for (const key of englishKeys) {
    if (!(key in vi)) {
      throw new Error(`Missing Vietnamese translation for "${key}".`);
    }
  }
}
