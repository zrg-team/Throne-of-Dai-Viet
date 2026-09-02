import {
  PITY_GOLD_STEP,
  PITY_HARD_CAP,
  PITY_JADE_STEP,
  SUMMON_WEIGHTS,
} from '../game/ascentConfig';
import { POWER_CARDS, findPowerCard } from '../data/ascentCards';
import { weightedPickIndex } from '../utils/math';
import { addLegacyPoints } from './legacy';
import { hasTrait } from './dynasty';
import type { AscentRarity } from './types';

/**
 * Tàng Ấn Các — the Cabinet of Seals. Phase 3 of The Return Run.
 *
 * Legacy banks points, the dynasty banks who the house is; this banks *what the house owns*:
 * every Power card ever found, at a level and a copy count. Two faucets fill it — rubbings
 * (thác bản), earned by playing and scratched into a random card, and the ceremony's bind step,
 * which keeps one card the reign actually played. One sink empties the copies: the same card
 * three deep combines into the next level, and a levelled card returns to future drafts heavier.
 *
 * Modelled line-for-line on `legacy.ts` / `dynasty.ts`: one versioned key, one defensive parse,
 * no throw on anything the file might contain. Unlike those two, `getCabinet` is read from the
 * battle tick (rule cards read their level per beat), so the parse is memoised and invalidated
 * by this module's own writes rather than re-read from localStorage per call.
 */

const CABINET_KEY = 'mandate:cabinet:v1';

export interface CabinetCard {
  /** 1–3. Levels are permanent, like a forged seal — there is no un-combine. */
  level: 1 | 2 | 3;
  /** Copies held toward the next combine. Spent by `combineCard`, never lost otherwise. */
  copies: number;
}

export interface CabinetStore {
  /** Keyed by `PowerCardDef` id — ids are append-only save contracts (see `ascentCards.ts`). */
  cards: Record<string, CabinetCard>;
  /** Rubbings waiting to be scratched. */
  rubbings: number;
  /** Reveals since the last gold-or-better — the same soft-pity shape as the summon gacha. */
  rubbingPity: number;
  /** Evolution results whose recipe some run has completed — the forge's learned rows. */
  learnedRecipes: string[];
  /** Card ids slotted for the next run's opening hand. */
  openingHand: string[];
  /** One-time deeds already paid out (`first-relief`, `first-evolution`, `first-jade`). */
  deeds: string[];
  /** Legacy rubbing packs bought — the price climbs with each one. */
  packsBought: number;
}

/**
 * The launch deeds, in the order the cabinet page lists them. Each pays one rubbing, once.
 *
 * The list is **append-only**: the id strings are a save contract, and `getCabinet` filters the
 * stored array against this table, so a retired id silently un-does a deed a player already did.
 *
 * The last three are the Coronation's, and they do two jobs at once. They pay a rubbing like the
 * others, and they are what the wardrobe picker reads to decide which flourishes are still
 * greyed — so every lock in the creator names a system the player has not met yet: waves are the
 * clock the mode runs on, jade is where evolutions live, and eras are milestones rather than
 * scenery. Nothing they gate has power; ornament is the only thing safe to lock.
 */
export const CABINET_DEEDS = [
  'first-relief', 'first-evolution', 'first-jade', 'wave-ten', 'era-empires', 'era-mandate',
] as const;
export type CabinetDeed = (typeof CABINET_DEEDS)[number];

/** What a copy past Lv3 melts into, in Legacy points — no dead pulls. */
const MELT_LEGACY: Record<AscentRarity, number> = { bronze: 10, silver: 20, gold: 40, jade: 80 };

/** The melt payout, for screens that preview an add without making it. */
export function meltValue(rarity: AscentRarity): number {
  return MELT_LEGACY[rarity];
}

/** First pack price, and the climb per pack already bought — the dead Legacy surplus's job. */
const PACK_BASE_COST = 80;
const PACK_COST_STEP = 40;

/** Copies one combine consumes: three to reach Lv2, five to reach Lv3. */
export function combineCost(level: 1 | 2 | 3): number {
  return level >= 2 ? 5 : 3;
}

/**
 * Draft weight a cabinet level buys. Deliberately the steep step of the ladder — the effect
 * step is shallow (inside the dossier-§03 power budget), so a levelled card mostly buys
 * *showing up*, which makes drafts feel like your deck without making them dishonest.
 */
export function cabinetWeightMult(level: number): number {
  return level >= 3 ? 1.6 : level >= 2 ? 1.3 : 1;
}

/** Per-stack multiplier a rule card's number deepens by at each cabinet level. */
export function cabinetRuleMult(cardId: string): number {
  const level = cabinetLevel(cardId);
  return level >= 3 ? 1.5 : level >= 2 ? 1.25 : 1;
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function emptyStore(): CabinetStore {
  return {
    cards: {},
    rubbings: 0,
    rubbingPity: 0,
    learnedRecipes: [],
    openingHand: [],
    deeds: [],
    packsBought: 0,
  };
}

/** A stored number or the fallback — `Number.isFinite`, for the same reason `dynasty.ts` gives. */
function finite(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, parsed));
}

function stringList(raw: unknown, known?: (id: string) => boolean): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((id): id is string => typeof id === 'string' && (!known || known(id)))));
}

function readCards(raw: unknown): Record<string, CabinetCard> {
  if (!raw || typeof raw !== 'object') return {};
  const cards: Record<string, CabinetCard> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    // Filtered against the live table: a card id retired between builds must not sit in the
    // save for ever, counted by the grid and unreachable by everything else.
    if (!findPowerCard(id) || !value || typeof value !== 'object') continue;
    const entry = value as Partial<CabinetCard>;
    const level = Math.min(3, Math.max(1, finite(entry.level, 3) || 1)) as 1 | 2 | 3;
    cards[id] = { level, copies: finite(entry.copies, 999) };
  }
  return cards;
}

/**
 * The memoised parse. The battle tick reads rule-card levels per beat, and a JSON.parse per
 * beat is a cost with no story behind it — but the memo is only trusted while the *raw string*
 * in localStorage is the one it was parsed from. Under Vite's HMR a dev page can hold two
 * instances of this module (the dual-module-instance trap the harness notes keep refinding),
 * and a memo that never re-checks the store turns the second instance's writes invisible: the
 * first verify-cabinet run failed four checks exactly that way. `getItem` is microseconds; the
 * comparison buys per-beat speed without a second source of truth.
 */
let cachedRaw: string | null | undefined;
let cached: CabinetStore | undefined;

export function getCabinet(): CabinetStore {
  if (!canUseLocalStorage()) return cached ?? emptyStore();
  try {
    const raw = localStorage.getItem(CABINET_KEY);
    if (cached && raw === cachedRaw) return cached;
    cachedRaw = raw;
    if (!raw) {
      cached = emptyStore();
      return cached;
    }
    const parsed = JSON.parse(raw) as Partial<CabinetStore>;
    cached = {
      cards: readCards(parsed.cards),
      rubbings: finite(parsed.rubbings, 999),
      rubbingPity: finite(parsed.rubbingPity, 99),
      learnedRecipes: stringList(parsed.learnedRecipes, (id) => Boolean(findPowerCard(id))),
      openingHand: stringList(parsed.openingHand, (id) => Boolean(findPowerCard(id))),
      deeds: stringList(parsed.deeds, (id) => (CABINET_DEEDS as readonly string[]).includes(id)),
      packsBought: finite(parsed.packsBought, 999),
    };
    return cached;
  } catch {
    cached = emptyStore();
    return cached;
  }
}

function writeCabinet(store: CabinetStore): void {
  cached = store;
  if (!canUseLocalStorage()) return;
  try {
    const raw = JSON.stringify(store);
    localStorage.setItem(CABINET_KEY, raw);
    cachedRaw = raw;
  } catch {
    // A full or locked quota must not take the run down. The memo still carries the session,
    // and the un-updated `cachedRaw` simply forces the next read to try the store again.
  }
}

/** Test hook: forget the memo so a harness that pokes localStorage directly is believed. */
export function resetCabinetCache(): void {
  cached = undefined;
  cachedRaw = undefined;
}

export function cabinetCard(cardId: string): CabinetCard | undefined {
  return getCabinet().cards[cardId];
}

/** The level a card drafts at. Unfound cards draft at 1 — ownership never gates the pool. */
export function cabinetLevel(cardId: string): 1 | 2 | 3 {
  return getCabinet().cards[cardId]?.level ?? 1;
}

/** Seals found, against the whole table — the cabinet header's "23 / 50". */
export function cabinetProgress(): { found: number; total: number } {
  return { found: Object.keys(getCabinet().cards).length, total: POWER_CARDS.length };
}

export function addRubbings(n: number): void {
  if (n <= 0) return;
  const store = getCabinet();
  writeCabinet({ ...store, rubbings: store.rubbings + Math.floor(n) });
}

/** Pays a one-time deed. Returns true the first time only — that is when the rubbing lands. */
export function grantDeed(deed: CabinetDeed): boolean {
  const store = getCabinet();
  if (store.deeds.includes(deed)) return false;
  writeCabinet({ ...store, deeds: [...store.deeds, deed], rubbings: store.rubbings + 1 });
  return true;
}

export function deedDone(deed: CabinetDeed): boolean {
  return getCabinet().deeds.includes(deed);
}

/** What the next Legacy rubbing pack costs — climbs so the surplus is a budget, not a faucet. */
export function rubbingPackPrice(): number {
  return PACK_BASE_COST + getCabinet().packsBought * PACK_COST_STEP;
}

/** Marks a pack bought and banks the rubbing. The Legacy spend happens at the call site. */
export function recordRubbingPack(): void {
  const store = getCabinet();
  writeCabinet({ ...store, packsBought: store.packsBought + 1, rubbings: store.rubbings + 1 });
}

/**
 * The pool a rubbing can mint from: everything a draft could offer plus the founding boons.
 * Evolutions are forged and story cards are earned — a woodblock print of either would cheapen
 * the way they are actually got, and both still reach the cabinet through the bind step.
 */
const RUBBABLE = POWER_CARDS.filter((card) => !card.evolutionOnly && !card.storyOnly);

export type CabinetAddOutcome = 'new' | 'copy' | 'ready' | 'melted';

export interface CabinetAddResult {
  cardId: string;
  rarity: AscentRarity;
  outcome: CabinetAddOutcome;
  /** State after the add, for the reveal to print "copy ×2 of 3". */
  level: 1 | 2 | 3;
  copies: number;
  /** Legacy points a past-Lv3 copy melted into; 0 otherwise. */
  meltedLegacy: number;
}

/**
 * Files one found copy of a card. First find opens the entry; a repeat stacks a copy; a copy
 * of a card already at Lv3 melts to Legacy on the spot — no dead pulls.
 */
export function addCabinetCard(cardId: string): CabinetAddResult | undefined {
  const card = findPowerCard(cardId);
  if (!card) return undefined;
  const store = getCabinet();
  const held = store.cards[cardId];

  if (!held) {
    const entry: CabinetCard = { level: 1, copies: 1 };
    writeCabinet({ ...store, cards: { ...store.cards, [cardId]: entry } });
    return { cardId, rarity: card.rarity, outcome: 'new', level: 1, copies: 1, meltedLegacy: 0 };
  }
  if (held.level >= 3) {
    const points = MELT_LEGACY[card.rarity];
    addLegacyPoints(points);
    return { cardId, rarity: card.rarity, outcome: 'melted', level: held.level, copies: held.copies, meltedLegacy: points };
  }
  const entry: CabinetCard = { level: held.level, copies: held.copies + 1 };
  writeCabinet({ ...store, cards: { ...store.cards, [cardId]: entry } });
  return {
    cardId,
    rarity: card.rarity,
    outcome: entry.copies >= combineCost(entry.level) ? 'ready' : 'copy',
    level: entry.level,
    copies: entry.copies,
    meltedLegacy: 0,
  };
}

export function canCombine(cardId: string): boolean {
  const held = getCabinet().cards[cardId];
  return Boolean(held && held.level < 3 && held.copies >= combineCost(held.level));
}

/** Combines copies into the next level. Permanent, like a forged seal — there is no undo. */
export function combineCard(cardId: string): boolean {
  const store = getCabinet();
  const held = store.cards[cardId];
  if (!held || held.level >= 3) return false;
  const cost = combineCost(held.level);
  if (held.copies < cost) return false;
  const entry: CabinetCard = { level: (held.level + 1) as 2 | 3, copies: held.copies - cost };
  writeCabinet({ ...store, cards: { ...store.cards, [cardId]: entry } });
  return true;
}

/** Combines waiting across the whole cabinet, for the header's "2 combines ready". */
export function combinesReady(): number {
  return Object.keys(getCabinet().cards).filter((id) => canCombine(id)).length;
}

export interface RubbingReveal extends CabinetAddResult {
  /** The hard-pity guarantee fired on this reveal. */
  pityUsed: boolean;
  /** Rubbings left after this one. */
  remaining: number;
}

/**
 * Rarity weights for one reveal — the summon gacha's own table and pity shape
 * (`SUMMON_WEIGHTS`, soft pity per dry pull, hard pity at `PITY_HARD_CAP`), reused rather than
 * re-invented so the two collections teach one set of odds.
 */
function rubbingWeights(pity: number): Record<AscentRarity, number> {
  return {
    bronze: Math.max(4, SUMMON_WEIGHTS.bronze - pity * (PITY_GOLD_STEP * 0.8)),
    silver: SUMMON_WEIGHTS.silver,
    gold: SUMMON_WEIGHTS.gold + pity * PITY_GOLD_STEP,
    jade: SUMMON_WEIGHTS.jade + pity * PITY_JADE_STEP,
  };
}

const TIER_ORDER: AscentRarity[] = ['bronze', 'silver', 'gold', 'jade'];

/**
 * Spends one rubbing and scratches it into a random card. Returns undefined with none banked.
 */
export function revealRubbing(): RubbingReveal | undefined {
  const store = getCabinet();
  if (store.rubbings <= 0) return undefined;

  const pityUsed = store.rubbingPity >= PITY_HARD_CAP;
  const weights = rubbingWeights(store.rubbingPity);
  let rarity: AscentRarity;
  if (pityUsed) {
    // The guarantee promises gold-or-better; jade keeps its pity-lifted share of the two.
    rarity = weightedPickIndex([weights.gold, weights.jade]) === 1 ? 'jade' : 'gold';
  } else {
    const index = weightedPickIndex(TIER_ORDER.map((tier) => weights[tier]));
    rarity = TIER_ORDER[index < 0 ? 0 : index];
  }

  // Walk down the ladder if the pool has no card of the rolled tier — mirrors the summon's own
  // never-upgrade rule, though with the live table every tier is populated.
  let pool: typeof RUBBABLE = [];
  for (let step = TIER_ORDER.indexOf(rarity); step >= 0 && pool.length === 0; step -= 1) {
    pool = RUBBABLE.filter((card) => card.rarity === TIER_ORDER[step]);
  }
  if (pool.length === 0) return undefined;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  // Spend the rubbing and move pity *before* filing the card: `addCabinetCard` writes the store
  // too, and both writes must land on the same base or one overwrites the other.
  const spent = getCabinet();
  writeCabinet({
    ...spent,
    rubbings: spent.rubbings - 1,
    rubbingPity: rarity === 'gold' || rarity === 'jade' ? 0 : spent.rubbingPity + 1,
  });

  const added = addCabinetCard(picked.id);
  if (!added) return undefined;
  return { ...added, pityUsed, remaining: getCabinet().rubbings };
}

/** Teaches the forge a recipe. Idempotent; called when an evolution completes or is bound. */
export function learnRecipe(evolutionId: string): void {
  const store = getCabinet();
  if (store.learnedRecipes.includes(evolutionId)) return;
  writeCabinet({ ...store, learnedRecipes: [...store.learnedRecipes, evolutionId] });
}

export function recipeLearned(evolutionId: string): boolean {
  return getCabinet().learnedRecipes.includes(evolutionId);
}

/**
 * Opening-hand slots the house has earned: one, plus one for Deep Shelf. The doc caps the
 * ladder at three; the third slot belongs to a later phase.
 */
export function openingHandSlots(): number {
  return Math.min(3, 1 + (hasTrait('deep-shelf') ? 1 : 0));
}

/** Slots the next run's opening hand. Only owned cards, only as many as there are slots. */
export function setOpeningHand(cardIds: string[]): void {
  const store = getCabinet();
  const owned = Array.from(new Set(cardIds)).filter((id) => Boolean(store.cards[id]));
  writeCabinet({ ...store, openingHand: owned.slice(0, openingHandSlots()) });
}

/** The hand the next run opens with — already clamped to the slots the house has. */
export function openingHand(): string[] {
  return getCabinet().openingHand.slice(0, openingHandSlots());
}
