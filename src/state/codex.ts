import { heroTemplates } from '../data/heroes';

const CODEX_KEY = 'mandate:codex:v1';

/**
 * The Hero Codex: the permanent record of every champion ever summoned in a Dragon Ascent
 * run. In-run rosters reset with the run — that keeps each run's balance readable — but the
 * Codex persists, and anything recorded in it can be chosen as the founder of a later run.
 * That's the collection/achievement layer without the power creep of a carried-over squad.
 */
interface CodexStore {
  /** Hero ids ever summoned. */
  unlocked: string[];
  /** Times each hero has been pulled, so duplicates still register as progress. */
  pulls: Record<string, number>;
}

const EMPTY: CodexStore = { unlocked: [], pulls: {} };

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function getCodex(): CodexStore {
  if (!canUseLocalStorage()) return { ...EMPTY };
  try {
    const raw = localStorage.getItem(CODEX_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<CodexStore>;
    return {
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => typeof id === 'string') : [],
      pulls: typeof parsed.pulls === 'object' && parsed.pulls ? parsed.pulls : {},
    };
  } catch {
    return { ...EMPTY };
  }
}

function writeCodex(store: CodexStore): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(CODEX_KEY, JSON.stringify(store));
  } catch {
    // A full or blocked storage must never break a run in progress.
  }
}

export function isHeroUnlocked(heroId: string): boolean {
  return getCodex().unlocked.includes(heroId);
}

/** Records a summon. Returns true when this is the first time this hero has been seen. */
export function unlockHero(heroId: string): boolean {
  const store = getCodex();
  const isNew = !store.unlocked.includes(heroId);
  if (isNew) {
    store.unlocked.push(heroId);
  }
  store.pulls[heroId] = (store.pulls[heroId] ?? 0) + 1;
  writeCodex(store);
  return isNew;
}

export function codexProgress(): { unlocked: number; total: number } {
  return { unlocked: getCodex().unlocked.length, total: heroTemplates.length };
}

/**
 * Heroes offered on the founder prompt at the start of a run: everything recorded in the
 * Codex, best first. A first-ever run has an empty Codex, so the caller falls back to a
 * starter set — the founder choice is never a dead end.
 */
export function getFounderPool(): string[] {
  const unlocked = getCodex().unlocked;
  return heroTemplates.filter((hero) => unlocked.includes(hero.id)).map((hero) => hero.id);
}
