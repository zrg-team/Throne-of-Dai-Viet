import type { GameState } from './types';
import { t } from '../i18n';

const LEGACY_KEY = 'mandate:legacy:v1';

interface LegacyStore {
  points: number;
  bestScore: number;
  ascensions: number;
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function getLegacy(): LegacyStore {
  if (!canUseLocalStorage()) return { points: 0, bestScore: 0, ascensions: 0 };
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return { points: 0, bestScore: 0, ascensions: 0 };
    const parsed = JSON.parse(raw) as Partial<LegacyStore>;
    return {
      points: Math.max(0, Math.floor(parsed.points ?? 0)),
      bestScore: Math.max(0, Math.floor(parsed.bestScore ?? 0)),
      ascensions: Math.max(0, Math.floor(parsed.ascensions ?? 0)),
    };
  } catch {
    return { points: 0, bestScore: 0, ascensions: 0 };
  }
}

function writeLegacy(store: LegacyStore): void {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(LEGACY_KEY, JSON.stringify(store));
}

/** Score for a finished empire run, from lands held, invasions repelled, and Mandate. */
export function computeRunScore(state: GameState): number {
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
