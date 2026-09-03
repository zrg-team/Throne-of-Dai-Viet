import { dynastyRankRarity, type DynastyStore, type ReignRecord } from '../state/dynasty';
import type { Hero, HeroType } from '../state/types';

/**
 * The house's king, as something the portrait system will draw.
 *
 * `DynastyStore` keeps only the portrait identity (`resolveHeroLook` reads id, name, era, sex,
 * type and monastic) because a founder is generated at run time and an id alone reconstructs
 * nothing. Everything else on `Hero` is filler: the face never reads it, and a partial cast would
 * hide the day one of those fields starts mattering.
 *
 * **The rarity is not the founder's.** It is the *dynasty's* rank, so the badge the portrait wears
 * steps up as the ledger fills — the king visibly ages, and thirty reigns look like thirty reigns
 * rather than like the first one repeated.
 */
/** A past reign's founder, drawn at the rank the house holds now — the same rule as the king. */
export function reignFounderHero(founder: NonNullable<ReignRecord['founder']>, level: number): Hero {
  return {
    id: founder.id,
    name: founder.name,
    type: founder.type as HeroType,
    rarity: dynastyRankRarity(level),
    upkeepGold: 0,
    description: '',
    effect: '',
    stats: { martial: 0, logistics: 0, administration: 0, diplomacy: 0, loyalty: 0, renown: 0 },
    fatigue: 0,
    sex: founder.sex,
    ...(founder.era ? { era: founder.era as Hero['era'] } : {}),
  };
}

export function dynastyFounderHero(store: DynastyStore): Hero | undefined {
  const founder = store.founder;
  if (!founder) return undefined;
  return {
    id: founder.id,
    name: founder.name,
    type: founder.type as HeroType,
    rarity: dynastyRankRarity(store.level),
    upkeepGold: 0,
    description: '',
    effect: '',
    stats: { martial: 0, logistics: 0, administration: 0, diplomacy: 0, loyalty: 0, renown: 0 },
    fatigue: 0,
    sex: founder.sex,
    ...(founder.era ? { era: founder.era as Hero['era'] } : {}),
    ...(founder.monastic ? { monastic: true as const } : {}),
  };
}
