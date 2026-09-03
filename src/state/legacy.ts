import type { CourtModifier, GameState } from './types';
import { PLAYER_KINGDOM_ID } from '../game/constants';
import { applyResourceDelta } from '../systems/ResourceSystem';
import { addCourtModifier } from '../systems/CourtSystem';
import { REALM_PROJECTS } from '../data/edicts';
import { t } from '../i18n';

const LEGACY_KEY = 'mandate:legacy:v1';

interface LegacyStore {
  points: number;
  bestScore: number;
  ascensions: number;
  /** Ids of perks at level one or more. Kept for every reader that predates the ladder. */
  perks: string[];
  /** Each perk's level, 0–3. The ladder replaced the one-time buy: a perk is bought three times. */
  perkLevels: Record<string, number>;
  /**
   * The perks carried into the next reign — at most `LOADOUT_MAX`. Twenty perks and three slots
   * make the vault a choice about *this* reign rather than a pile that only grows; the rest stay
   * bought and wait their turn.
   */
  loadout: string[];
  /**
   * Schools whose capstone a past reign completed — the quốc bảo, an ancestral law.
   *
   * The missing half of the decree loop: a reign that reached the Hồng Đức code proved something
   * about how it governed, and nothing carried that forward. A completed capstone means every
   * later dynasty may open holding one article of it, which is the only cross-run reward in the
   * game that is earned by *how* you played rather than by how long you lasted.
   */
  codes?: string[];
}

/**
 * What one level of a perk does to a fresh reign. Numbers only; the words are catalog keys.
 *
 * The first table had five perks, each a one-time buy, and each worth far more than it cost —
 * +220 gold for 120 points on a vault that banks a tenth of every score. Reported: *price too
 * cheap compared with the advantage; support upgrades, not one-time buys; at least twenty, but
 * only three carried into a new game.* So: twenty perks, each bought three times, each level a
 * third of the old value, and a loadout of three. Everything a perk touches is an existing lever
 * — an opening seed, a court modifier the edicts already use, the capital's own numbers — so no
 * system learns a new rule.
 */
export interface LegacyPerkLevel {
  gold?: number;
  humans?: number;
  food?: number;
  supplies?: number;
  edictPoints?: number;
  /** Court influence at the founding. */
  influence?: number;
  /** The capital's walls and its standing militia. */
  capitalDefense?: number;
  capitalSoldiers?: number;
  /** Rubbings banked into the Cabinet as the reign opens. */
  rubbings?: number;
  /** A standing court modifier, in force from the founding. */
  modifier?: Partial<Omit<CourtModifier, 'id' | 'label' | 'remainingTicks'>>;
}

export interface LegacyPerk {
  id: string;
  /** Points for level one, two and three. */
  cost: [number, number, number];
  levels: [LegacyPerkLevel, LegacyPerkLevel, LegacyPerkLevel];
  /** The numbers the description prints, per level — `{a}` and `{b}` in the catalog. */
  params: (level: LegacyPerkLevel) => Record<string, number>;
}

/** How many perks ride into a reign. */
export const LOADOUT_MAX = 3;
export const PERK_MAX_LEVEL = 3;

const ladder = (base: number): [number, number, number] => [base, Math.round(base * 1.6), Math.round(base * 2.4)];
const pct = (value: number | undefined): number => Math.round(Math.abs(value ?? 0) * 100);
const three = <T extends LegacyPerkLevel>(a: T, b: T, c: T): [T, T, T] => [a, b, c];

export const LEGACY_PERKS: LegacyPerk[] = [
  { id: 'founders-purse', cost: ladder(60), levels: three({ gold: 60 }, { gold: 120 }, { gold: 180 }), params: (l) => ({ a: l.gold ?? 0 }) },
  { id: 'settlers', cost: ladder(70), levels: three({ humans: 80 }, { humans: 160 }, { humans: 240 }), params: (l) => ({ a: l.humans ?? 0 }) },
  { id: 'full-granary', cost: ladder(55), levels: three({ food: 40, supplies: 15 }, { food: 80, supplies: 30 }, { food: 120, supplies: 45 }), params: (l) => ({ a: l.food ?? 0, b: l.supplies ?? 0 }) },
  { id: 'mandate-of-birth', cost: ladder(110), levels: three({ edictPoints: 1 }, { edictPoints: 1 }, { edictPoints: 2 }), params: (l) => ({ a: l.edictPoints ?? 0 }) },
  { id: 'war-chest', cost: ladder(120), levels: three({ gold: 40, supplies: 20 }, { gold: 80, supplies: 40 }, { gold: 120, supplies: 60 }), params: (l) => ({ a: l.gold ?? 0, b: l.supplies ?? 0 }) },
  { id: 'salt-charter', cost: ladder(80), levels: three({ modifier: { marketGoldOutputModifier: 0.03 } }, { modifier: { marketGoldOutputModifier: 0.06 } }, { modifier: { marketGoldOutputModifier: 0.09 } }), params: (l) => ({ a: pct(l.modifier?.marketGoldOutputModifier) }) },
  { id: 'quartermaster-corps', cost: ladder(80), levels: three({ modifier: { recruitSpeedModifier: 0.05 } }, { modifier: { recruitSpeedModifier: 0.10 } }, { modifier: { recruitSpeedModifier: 0.15 } }), params: (l) => ({ a: pct(l.modifier?.recruitSpeedModifier) }) },
  { id: 'masons-guild', cost: ladder(80), levels: three({ modifier: { buildingCostModifier: -0.04 } }, { modifier: { buildingCostModifier: -0.08 } }, { modifier: { buildingCostModifier: -0.12 } }), params: (l) => ({ a: pct(l.modifier?.buildingCostModifier) }) },
  { id: 'corvee-rolls', cost: ladder(80), levels: three({ modifier: { buildSpeedBonus: 0.05 } }, { modifier: { buildSpeedBonus: 0.10 } }, { modifier: { buildSpeedBonus: 0.15 } }), params: (l) => ({ a: pct(l.modifier?.buildSpeedBonus) }) },
  { id: 'tribute-treaties', cost: ladder(90), levels: three({ modifier: { acquisitionCostModifier: -0.04 } }, { modifier: { acquisitionCostModifier: -0.08 } }, { modifier: { acquisitionCostModifier: -0.12 } }), params: (l) => ({ a: pct(l.modifier?.acquisitionCostModifier) }) },
  { id: 'veterans-pensions', cost: ladder(80), levels: three({ modifier: { armyGoldUpkeepModifier: -0.04 } }, { modifier: { armyGoldUpkeepModifier: -0.08 } }, { modifier: { armyGoldUpkeepModifier: -0.12 } }), params: (l) => ({ a: pct(l.modifier?.armyGoldUpkeepModifier) }) },
  { id: 'drill-yards', cost: ladder(80), levels: three({ modifier: { armyXpModifier: 0.05 } }, { modifier: { armyXpModifier: 0.10 } }, { modifier: { armyXpModifier: 0.15 } }), params: (l) => ({ a: pct(l.modifier?.armyXpModifier) }) },
  { id: 'border-forts', cost: ladder(70), levels: three({ capitalDefense: 4 }, { capitalDefense: 8 }, { capitalDefense: 12 }), params: (l) => ({ a: l.capitalDefense ?? 0 }) },
  { id: 'first-levy', cost: ladder(70), levels: three({ capitalSoldiers: 20 }, { capitalSoldiers: 40 }, { capitalSoldiers: 60 }), params: (l) => ({ a: l.capitalSoldiers ?? 0 }) },
  { id: 'rubbing-press', cost: ladder(90), levels: three({ rubbings: 1 }, { rubbings: 1 }, { rubbings: 2 }), params: (l) => ({ a: l.rubbings ?? 0 }) },
  { id: 'court-favor', cost: ladder(80), levels: three({ influence: 3 }, { influence: 6 }, { influence: 9 }), params: (l) => ({ a: l.influence ?? 0 }) },
  { id: 'granary-wagons', cost: ladder(70), levels: three({ modifier: { buildingSuppliesUpkeepModifier: -0.04 } }, { modifier: { buildingSuppliesUpkeepModifier: -0.08 } }, { modifier: { buildingSuppliesUpkeepModifier: -0.12 } }), params: (l) => ({ a: pct(l.modifier?.buildingSuppliesUpkeepModifier) }) },
  { id: 'loyal-guards', cost: ladder(120), levels: three({ modifier: { armyPowerModifier: 0.01 } }, { modifier: { armyPowerModifier: 0.02 } }, { modifier: { armyPowerModifier: 0.03 } }), params: (l) => ({ a: pct(l.modifier?.armyPowerModifier) }) },
  { id: 'census-scribes', cost: ladder(70), levels: three({ modifier: { courtCardSpeedModifier: 0.05 } }, { modifier: { courtCardSpeedModifier: 0.10 } }, { modifier: { courtCardSpeedModifier: 0.15 } }), params: (l) => ({ a: pct(l.modifier?.courtCardSpeedModifier) }) },
  { id: 'thrifty-stewards', cost: ladder(70), levels: three({ modifier: { buildingGoldUpkeepModifier: -0.04 } }, { modifier: { buildingGoldUpkeepModifier: -0.08 } }, { modifier: { buildingGoldUpkeepModifier: -0.12 } }), params: (l) => ({ a: pct(l.modifier?.buildingGoldUpkeepModifier) }) },
];

export function getLegacyPerk(id: string): LegacyPerk | undefined {
  return LEGACY_PERKS.find((p) => p.id === id);
}

/** The level a perk stands at, 0–3. */
export function perkLevel(id: string, store: LegacyStore = getLegacy()): number {
  return Math.max(0, Math.min(PERK_MAX_LEVEL, store.perkLevels[id] ?? 0));
}

/** What the next level of a perk costs, or undefined at the top of the ladder. */
export function nextPerkCost(perk: LegacyPerk, level: number): number | undefined {
  return level >= PERK_MAX_LEVEL ? undefined : perk.cost[level];
}

/** The description a perk prints at `level` (level 0 reads as what level one would do). */
export function perkDescription(perk: LegacyPerk, level: number): string {
  const entry = perk.levels[Math.max(0, Math.min(PERK_MAX_LEVEL, level) - 1)] ?? perk.levels[0];
  return t(`empire.legacy.perk.${perk.id}.d` as Parameters<typeof t>[0], perk.params(entry));
}

export function isEquipped(id: string, store: LegacyStore = getLegacy()): boolean {
  return store.loadout.includes(id);
}

/** Carries a bought perk into the next reign, or sets it down. Refuses a fourth. */
export function toggleLoadout(id: string): boolean {
  const store = getLegacy();
  if (store.loadout.includes(id)) {
    store.loadout = store.loadout.filter((held) => held !== id);
  } else {
    if (perkLevel(id, store) <= 0 || store.loadout.length >= LOADOUT_MAX) return false;
    store.loadout = [...store.loadout, id];
  }
  writeLegacy(store);
  return true;
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function emptyLegacy(): LegacyStore {
  return { points: 0, bestScore: 0, ascensions: 0, perks: [], perkLevels: {}, loadout: [], codes: [] };
}

export function getLegacy(): LegacyStore {
  if (!canUseLocalStorage()) return emptyLegacy();
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return emptyLegacy();
    const parsed = JSON.parse(raw) as Partial<LegacyStore>;
    const known = new Set(LEGACY_PERKS.map((perk) => perk.id));
    // Levels first; a store from before the ladder lists bought perks by id, and each is level one.
    const perkLevels: Record<string, number> = {};
    if (parsed.perkLevels && typeof parsed.perkLevels === 'object') {
      for (const [id, level] of Object.entries(parsed.perkLevels as Record<string, unknown>)) {
        if (!known.has(id)) continue;
        const n = Math.floor(Number(level));
        if (Number.isFinite(n) && n > 0) perkLevels[id] = Math.min(PERK_MAX_LEVEL, n);
      }
    }
    if (Array.isArray(parsed.perks)) {
      for (const id of parsed.perks) if (typeof id === 'string' && known.has(id) && !perkLevels[id]) perkLevels[id] = 1;
    }
    const owned = Object.keys(perkLevels);
    // A loadout from before the slots existed: the first three bought perks ride, as they always did.
    const loadout = Array.isArray(parsed.loadout)
      ? parsed.loadout.filter((id): id is string => typeof id === 'string' && Boolean(perkLevels[id])).slice(0, LOADOUT_MAX)
      : owned.slice(0, LOADOUT_MAX);
    return {
      points: Math.max(0, Math.floor(parsed.points ?? 0)),
      bestScore: Math.max(0, Math.floor(parsed.bestScore ?? 0)),
      ascensions: Math.max(0, Math.floor(parsed.ascensions ?? 0)),
      perks: owned,
      perkLevels,
      loadout,
      codes: Array.isArray(parsed.codes) ? parsed.codes.filter((id) => typeof id === 'string') : [],
    };
  } catch {
    return emptyLegacy();
  }
}

function writeLegacy(store: LegacyStore): void {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(LEGACY_KEY, JSON.stringify(store));
}

export function ownsPerk(id: string): boolean {
  return perkLevel(id) > 0;
}

/** Banks points outside a run's own payout — a cabinet copy past Lv3 melting, for one. */
export function addLegacyPoints(points: number): void {
  if (points <= 0) return;
  const store = getLegacy();
  store.points += Math.round(points);
  writeLegacy(store);
}

/** Spends banked points on something that is not a perk (the cabinet's rubbing pack). */
export function spendLegacyPoints(points: number): boolean {
  const store = getLegacy();
  if (points <= 0 || store.points < points) return false;
  store.points -= Math.round(points);
  writeLegacy(store);
  return true;
}

/** Buys the next level of a perk with banked points. Returns true if the level was bought. */
export function purchaseLegacyPerk(id: string): boolean {
  const perk = getLegacyPerk(id);
  if (!perk) return false;
  const store = getLegacy();
  const level = perkLevel(id, store);
  const cost = nextPerkCost(perk, level);
  if (cost === undefined || store.points < cost) return false;
  store.points -= cost;
  store.perkLevels = { ...store.perkLevels, [id]: level + 1 };
  if (!store.perks.includes(id)) store.perks = [...store.perks, id];
  // The first perk bought rides by default: a vault with one thing in it should not need a
  // second tap to mean anything.
  if (!store.loadout.includes(id) && store.loadout.length < LOADOUT_MAX) store.loadout = [...store.loadout, id];
  writeLegacy(store);
  return true;
}

/** The player's capital, for the perks that build on it. */
function playerCapital(state: GameState) {
  const byId = state.ascent?.capitalLandId ? state.lands.find((land) => land.id === state.ascent?.capitalLandId) : undefined;
  return byId ?? state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).sort((a, b) => b.defense - a.defense)[0];
}

/** The rubbings the loadout banks at the founding — paid by the caller, which owns the cabinet. */
export function legacyStartRubbings(): number {
  const store = getLegacy();
  return store.loadout.reduce((sum, id) => {
    const perk = getLegacyPerk(id);
    const level = perkLevel(id, store);
    return sum + (perk && level > 0 ? perk.levels[level - 1].rubbings ?? 0 : 0);
  }, 0);
}

/** Applies the perks carried into this reign, at their levels, to a freshly-created GameState. */
export function applyLegacyPerks(state: GameState): void {
  const store = getLegacy();
  for (const id of store.loadout) {
    const perk = getLegacyPerk(id);
    const level = perkLevel(id, store);
    if (!perk || level <= 0) continue;
    const entry = perk.levels[level - 1];
    applyResourceDelta(state, {
      gold: entry.gold ?? 0,
      humans: entry.humans ?? 0,
      food: entry.food ?? 0,
      supplies: entry.supplies ?? 0,
    });
    if (entry.edictPoints && state.mandate) state.mandate.edictPoints += entry.edictPoints;
    if (entry.influence && state.court) state.court.influence += entry.influence;
    if (entry.capitalDefense || entry.capitalSoldiers) {
      const capital = playerCapital(state);
      if (capital) {
        capital.defense += entry.capitalDefense ?? 0;
        capital.localSoldiers += entry.capitalSoldiers ?? 0;
      }
    }
    if (entry.modifier) {
      addCourtModifier(state, {
        id: `legacy-${id}`,
        label: t(`empire.legacy.perk.${id}` as Parameters<typeof t>[0]),
        ...entry.modifier,
      });
    }
  }
  applyAncestralCodes(state);
}

/**
 * Quốc bảo — one article of an ancestral code, in force from the founding.
 *
 * Deliberately the *cheapest* decree of the school rather than its capstone: what carries forward
 * is the tradition, not the achievement. Reaching the Hồng Đức code once means every later dynasty
 * starts already Confucian-leaning, which nudges a run toward that school without deciding it —
 * the player can still commit against it and pay the ordinary price.
 *
 * Passed through `mandate.edicts` directly rather than `enactProject`, because a founding
 * inheritance costs no edict points and angers nobody: it has always been the law here.
 */
function applyAncestralCodes(state: GameState): void {
  const codes = getLegacy().codes ?? [];
  const mandate = state.mandate;
  if (!mandate || codes.length === 0) return;

  for (const school of codes) {
    const seed = REALM_PROJECTS
      .filter((project) => project.school === school && project.kind === 'edict' && !project.unlock)
      .sort((a, b) => (a.edictCost ?? 0) - (b.edictCost ?? 0))[0];
    if (!seed || mandate.edicts.includes(seed.id)) continue;
    mandate.edicts.push(seed.id);
    addCourtModifier(state, {
      id: `project-${seed.id}`,
      label: t(`empire.edict.${seed.id}` as Parameters<typeof t>[0]),
      ...seed.modifier,
    });
  }
}

/** Score for a finished empire run, from lands held, invasions repelled, and Mandate. */
export function computeRunScore(state: GameState): number {
  // Dragon Ascent is scored on the things that run is actually about: how long you held
  // the wave line, how high the power curve climbed, and how deep the build went.
  if (state.gameMode === 'ascent' && state.ascent) {
    const ascent = state.ascent;
    const cardsTaken = Object.values(ascent.cardStacks).reduce((sum, stacks) => sum + stacks, 0);
    const peakLands = state.campaignScore?.peakLandsHeld ?? 0;
    // Endings the Chronicle recorded. Weighted so a recorded ending is worth more than a
    // divergent one — that is the permanence half of the reward asymmetry, expressed in the one
    // number the player is actually chasing. Without it, following the annals paid nothing at all
    // and the tag was decoration.
    const endings = (state.chronicle ?? []).reduce(
      (sum, entry) => sum + ((entry.historicity ?? 'chinh-su') === 'ngoai-truyen' ? 40 : 70),
      0,
    );
    return (
      ascent.wavesSurvived * 120 +
      Math.round(ascent.peakPower / 8) +
      peakLands * 15 +
      cardsTaken * 20 +
      ascent.heroesSummoned * 40 +
      endings
    );
  }

  const score = state.campaignScore;
  const mandate = state.mandate;
  const turns = score?.turnsAlive ?? state.turn;
  const repelled = state.invasionsRepelled ?? 0;
  const peakLands = score?.peakLandsHeld ?? 0;
  const mandatePts = Math.round(mandate?.points ?? 0);
  const wonders = state.wondersBuilt ?? 0;
  return turns * 2 + repelled * 25 + peakLands * 15 + mandatePts * 3 + wonders * 60;
}

/**
 * Banks Legacy from a finished run. Ascension pays a large bonus. Returns the
 * points earned this run (already added to the persistent total).
 */
export function bankLegacy(state: GameState, ascended: boolean): number {
  const runScore = computeRunScore(state);
  const earned = Math.round(runScore / 10) + (ascended ? 200 : 0);
  const store = getLegacy();
  store.points += earned;
  store.bestScore = Math.max(store.bestScore, runScore);
  if (ascended) store.ascensions += 1;
  // A capstone reached is a code the dynasty leaves behind, whether or not the run ended well —
  // Lê Thánh Tông's laws outlived his reign, which is the whole idea.
  store.codes = Array.from(new Set([...(store.codes ?? []), ...(state.mandate?.capstones ?? [])]));
  writeLegacy(store);
  return earned;
}

interface Rank {
  minScore: number;
  key: string;
}

// Named lifetime ladder, keyed by best single-run score.
const RANKS: Rank[] = [
  { minScore: 0, key: 'villageChief' },
  { minScore: 300, key: 'prefect' },
  { minScore: 800, key: 'lord' },
  { minScore: 1600, key: 'king' },
  { minScore: 3000, key: 'sonOfHeaven' },
  { minScore: 5000, key: 'emperor' },
  // Two above the old ceiling: the median autopilot run scores ~4,000 and a strong one ~8,600, so
  // a ladder that ended at 5,000 stopped naming a rank exactly when a player got good.
  { minScore: 8000, key: 'greatEmperor' },
  { minScore: 12000, key: 'dragonThrone' },
];

export function rankForScore(bestScore: number): string {
  let key = RANKS[0].key;
  for (const rank of RANKS) {
    if (bestScore >= rank.minScore) key = rank.key;
  }
  return t(`empire.rank.${key}` as Parameters<typeof t>[0]);
}

/**
 * The first rung above a score, for the in-run ledger's "Lord at 340 more".
 *
 * Returns the label rather than the key because `RANKS` is private and every reader of this
 * file already gets labels from `rankForScore`; two readers spelling the same rung two ways is
 * the fault `formatNumber` exists to prevent. Undefined past the top of the ladder.
 */
export function nextRankAbove(score: number): { label: string; minScore: number } | undefined {
  const above = RANKS.find((rank) => rank.minScore > score);
  if (!above) return undefined;
  return { label: t(`empire.rank.${above.key}` as Parameters<typeof t>[0]), minScore: above.minScore };
}

export function currentRankLabel(): string {
  return rankForScore(getLegacy().bestScore);
}
