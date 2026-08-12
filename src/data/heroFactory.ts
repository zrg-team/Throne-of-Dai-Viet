import { GENERATED_ERAS, makeHeroName } from './heroNames';
import { t } from '../i18n';
import type { GameState, Hero, HeroEra, HeroStats, HeroType } from '../state/types';

/**
 * Champions the game did not have to write down.
 *
 * The authored roster is twenty-six templates that are *removed from the deck as they are
 * recruited* — so a long run empties it, `offerHeroSummon` starts returning nothing, and the
 * champion lane, which is half the mode's identity, quietly stops existing. This is the tap
 * that keeps it running: a generated champion is a real Hero with a Vietnamese name, an
 * office, a rarity, a sex and an era, and the portrait system draws it exactly as it draws an
 * authored one, because the renderer never knew about the roster in the first place.
 *
 * Generated heroes are deliberately *plainer* than authored ones — generic effect text, no
 * signature politics card — so the written characters stay the memorable ones and these are
 * the supporting cast.
 */

const TYPES: readonly HeroType[] = ['general', 'governor', 'minister', 'agent'];

/** Rarity mix for a generated draw. Legendary stays rare enough to feel like one. */
const RARITY_TABLE: ReadonlyArray<{ rarity: Hero['rarity']; weight: number }> = [
  { rarity: 'Common', weight: 46 },
  { rarity: 'Rare', weight: 32 },
  { rarity: 'Epic', weight: 17 },
  { rarity: 'Legendary', weight: 5 },
];

/** Where each office puts its weight, before rarity scales the whole line. */
const PROFILE: Record<HeroType, HeroStats> = {
  general: { martial: 62, logistics: 40, administration: 18, diplomacy: 20, loyalty: 40, renown: 46 },
  governor: { martial: 22, logistics: 44, administration: 58, diplomacy: 26, loyalty: 48, renown: 34 },
  minister: { martial: 16, logistics: 30, administration: 56, diplomacy: 50, loyalty: 44, renown: 42 },
  agent: { martial: 30, logistics: 24, administration: 20, diplomacy: 60, loyalty: 32, renown: 40 },
};

const RARITY_SCALE: Record<Hero['rarity'], number> = {
  Common: 0.72, Rare: 0.88, Epic: 1.04, Legendary: 1.22,
};
const RARITY_UPKEEP: Record<Hero['rarity'], number> = { Common: 5, Rare: 8, Epic: 10, Legendary: 13 };

/**
 * Share of women among generated champions.
 *
 * Not a token minority. Vietnam's founding rebellion was led by two women whose army was
 * mostly women and who trained thirty-six of them as generals; Bùi Thị Xuân commanded the Tây
 * Sơn elephant corps; Ỷ Lan and Dương Vân Nga ran the state outright. A roster that produced
 * the occasional woman as a curiosity would be the ahistorical choice, not this one.
 */
const WOMAN_SHARE = 0.42;

/** Monastics are a flavour, not a role — rare, and only ever ministers. */
const MONASTIC_SHARE = 0.05;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function pickWeighted<T>(rows: ReadonlyArray<{ weight: number } & Record<string, unknown>>, next: () => number): T {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let roll = next() * total;
  for (const row of rows) {
    roll -= row.weight;
    if (roll <= 0) return row as unknown as T;
  }
  return rows[rows.length - 1] as unknown as T;
}

function scaleStats(base: HeroStats, scale: number, next: () => number): HeroStats {
  const jitter = () => 0.88 + next() * 0.24;   // ±12%, so two generals of a rarity still differ
  const clamp = (value: number) => Math.max(6, Math.min(96, Math.round(value)));
  return {
    martial: clamp(base.martial * scale * jitter()),
    logistics: clamp(base.logistics * scale * jitter()),
    administration: clamp(base.administration * scale * jitter()),
    diplomacy: clamp(base.diplomacy * scale * jitter()),
    loyalty: clamp(base.loyalty * scale * jitter()),
    renown: clamp(base.renown * scale * jitter()),
  };
}

export interface GenerateHeroOptions {
  type?: HeroType;
  rarity?: Hero['rarity'];
  sex?: 'man' | 'woman';
  era?: HeroEra;
  /** Forces a specific id, so a caller can keep generation reproducible. */
  id?: string;
}

/**
 * One champion, wholly determined by `seed` — the same seed always yields the same person,
 * so a save that stores only the seed can reconstruct them.
 */
export function generateHero(seed: number, options: GenerateHeroOptions = {}): Hero {
  const next = seededRandom(seed);
  const type = options.type ?? TYPES[Math.floor(next() * TYPES.length) % TYPES.length];
  const rarity = options.rarity ?? pickWeighted<{ rarity: Hero['rarity'] }>(RARITY_TABLE, next).rarity;
  const sex = options.sex ?? (next() < WOMAN_SHARE ? 'woman' : 'man');
  const era = options.era ?? GENERATED_ERAS[Math.floor(next() * GENERATED_ERAS.length) % GENERATED_ERAS.length];
  // Only a male minister may be a monastic: a Trúc Lâm master is a specific thing, and the
  // wardrobe for it is shaven head and kesa, which is not a costume to hand out at random.
  const monastic = type === 'minister' && sex === 'man' && next() < MONASTIC_SHARE;

  return {
    id: options.id ?? `gen-${seed >>> 0}`,
    name: makeHeroName(type, sex, rarity, next),
    type,
    rarity,
    sex,
    era,
    ...(monastic ? { monastic: true } : {}),
    upkeepGold: RARITY_UPKEEP[rarity],
    description: t(`heroes.gen.${type}.description` as Parameters<typeof t>[0]),
    effect: t(`heroes.gen.${type}.effect` as Parameters<typeof t>[0]),
    stats: scaleStats(PROFILE[type], RARITY_SCALE[rarity], next),
    fatigue: 0,
  };
}

/**
 * Tops a deck up so the champion lane never runs dry.
 *
 * Returns the heroes added. Ids are namespaced `gen-` and checked against the deck *and* the
 * roster already recruited, because a duplicate id would make two champions share a portrait
 * seed and, worse, make `heroDeck.filter(id)` remove the wrong one.
 */
export function replenishHeroDeck(
  deck: Hero[],
  recruited: readonly Hero[],
  target: number,
  seedBase: number,
): Hero[] {
  const taken = new Set([...deck.map((h) => h.id), ...recruited.map((h) => h.id)]);
  const added: Hero[] = [];
  let salt = 0;
  while (deck.length + added.length < target && salt < target * 40) {
    const hero = generateHero(seedBase + salt * 2654435761);
    salt += 1;
    if (taken.has(hero.id)) continue;
    taken.add(hero.id);
    added.push(hero);
  }
  deck.push(...added);
  return added;
}

/**
 * Keeps the champion deck stocked, so no run can exhaust it.
 *
 * Called once per tick rather than at each draw site: every consumer already guards on
 * `heroDeck.length`, so topping the deck up in one place makes all of them work without
 * touching their logic. Cheap when the deck is full — a length check and nothing else.
 *
 * The seed derives from run state, so a replayed run generates the same champions.
 */
export function ensureHeroDeck(state: GameState, minimum = 8): void {
  if (state.heroDeck.length >= minimum) return;
  replenishHeroDeck(state.heroDeck, state.heroes, minimum, (state.turn + 1) * 7919 + state.heroDeck.length);
}
