import type { GameState } from './types';
import { applyResourceDelta } from '../systems/ResourceSystem';
import { addCourtModifier } from '../systems/CourtSystem';
import { REALM_PROJECTS } from '../data/edicts';
import { t } from '../i18n';

const LEGACY_KEY = 'mandate:legacy:v1';

interface LegacyStore {
  points: number;
  bestScore: number;
  ascensions: number;
  /** Ids of permanently-purchased ascension perks (the meta-progression spend sink). */
  perks: string[];
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
 * A permanent, cross-run upgrade bought with banked Legacy points. Each is a one-time
 * unlock that seeds every future empire run a little stronger — the roguelite payoff the
 * rank ladder always implied but that nothing previously spent points on.
 */
export interface LegacyPerk {
  id: string;
  cost: number;
  /** Seeds applied to a fresh empire GameState at creation. */
  startGold?: number;
  startHumans?: number;
  startFood?: number;
  startSupplies?: number;
  startEdictPoints?: number;
}

export const LEGACY_PERKS: LegacyPerk[] = [
  { id: 'founders-purse', cost: 120, startGold: 220 },
  { id: 'settlers', cost: 150, startHumans: 260 },
  { id: 'full-granary', cost: 110, startFood: 130, startSupplies: 55 },
  { id: 'mandate-of-birth', cost: 220, startEdictPoints: 2 },
  { id: 'war-chest', cost: 300, startGold: 180, startSupplies: 90, startEdictPoints: 1 },
];

export function getLegacyPerk(id: string): LegacyPerk | undefined {
  return LEGACY_PERKS.find((p) => p.id === id);
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function getLegacy(): LegacyStore {
  if (!canUseLocalStorage()) return { points: 0, bestScore: 0, ascensions: 0, perks: [], codes: [] };
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return { points: 0, bestScore: 0, ascensions: 0, perks: [] };
    const parsed = JSON.parse(raw) as Partial<LegacyStore>;
    return {
      points: Math.max(0, Math.floor(parsed.points ?? 0)),
      bestScore: Math.max(0, Math.floor(parsed.bestScore ?? 0)),
      ascensions: Math.max(0, Math.floor(parsed.ascensions ?? 0)),
      perks: Array.isArray(parsed.perks) ? parsed.perks.filter((id) => typeof id === 'string') : [],
      codes: Array.isArray(parsed.codes) ? parsed.codes.filter((id) => typeof id === 'string') : [],
    };
  } catch {
    return { points: 0, bestScore: 0, ascensions: 0, perks: [] };
  }
}

function writeLegacy(store: LegacyStore): void {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(LEGACY_KEY, JSON.stringify(store));
}

export function ownsPerk(id: string): boolean {
  return getLegacy().perks.includes(id);
}

/** Attempts to buy a perk with banked points. Returns true if purchased. */
export function purchaseLegacyPerk(id: string): boolean {
  const perk = getLegacyPerk(id);
  if (!perk) return false;
  const store = getLegacy();
  if (store.perks.includes(id) || store.points < perk.cost) return false;
  store.points -= perk.cost;
  store.perks.push(id);
  writeLegacy(store);
  return true;
}

/** Applies every owned perk to a freshly-created empire GameState. */
export function applyLegacyPerks(state: GameState): void {
  const owned = getLegacy().perks;
  for (const id of owned) {
    const perk = getLegacyPerk(id);
    if (!perk) continue;
    applyResourceDelta(state, {
      gold: perk.startGold ?? 0,
      humans: perk.startHumans ?? 0,
      food: perk.startFood ?? 0,
      supplies: perk.startSupplies ?? 0,
    });
    if (perk.startEdictPoints && state.mandate) {
      state.mandate.edictPoints += perk.startEdictPoints;
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
];

export function rankForScore(bestScore: number): string {
  let key = RANKS[0].key;
  for (const rank of RANKS) {
    if (bestScore >= rank.minScore) key = rank.key;
  }
  return t(`empire.rank.${key}` as Parameters<typeof t>[0]);
}

export function currentRankLabel(): string {
  return rankForScore(getLegacy().bestScore);
}
