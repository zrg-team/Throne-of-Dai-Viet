import { DYNASTY_TRAITS, findDynastyTrait } from '../data/dynastyTraits';

/**
 * Tông Phả — the persistent king.
 *
 * Legacy banks *points to spend*; this banks *who the house is*. Every finished run pours its
 * score into one lifetime number, each level asks one question with two answers, and what the
 * player chose is what the next reign opens holding. The distinction matters: a shop is a thing
 * you save up for, a biography is a thing you accumulate, and only one of the two makes the run
 * after the one you lost feel different from the one before it.
 *
 * Modelled line-for-line on `legacy.ts`: one versioned key, one defensive parse, and no throw on
 * anything the file might contain. A meta-progression store that can crash on garbage is a store
 * that can lock a player out of the game permanently, and localStorage is edited by hand, shared
 * between builds, and truncated by browsers under pressure.
 */

const DYNASTY_KEY = 'mandate:dynasty:v1';

/**
 * The portrait identity of the founder a reign was raised by, kept so the sheet has a face.
 *
 * Only the fields `resolveHeroLook` reads. A founder is generated at run time by the name
 * generator, so an id alone reconstructs nothing — and a dynasty sheet whose king is a blank
 * silhouette is the one thing this page exists not to be.
 */
export interface DynastyFounder {
  id: string;
  name: string;
  type: string;
  sex: 'man' | 'woman';
  era?: string;
  monastic?: boolean;
}

export interface DynastyStore {
  /** Lifetime XP. Never spent — levels are read off it, so a level can never be "lost". */
  xp: number;
  level: number;
  /** Chosen trait ids. */
  traits: string[];
  /** Level-ups not yet chosen. The ceremony offers them one at a time. */
  pendingPicks: number;
  /** Runs completed, for the sheet. */
  reigns: number;
  /** Best run score the house has ever recorded. */
  bestScore: number;
  /** The last reign's founder, for the sheet's portrait. */
  founder?: DynastyFounder;
  /** The last reign's name, e.g. "House of Lê Duyệt". */
  house?: string;
  /** Respecs already taken, against `legacy.ascensions` — one per ascension, never casually. */
  respecs: number;
}

/**
 * XP to gain level `n`, counting from 1.
 *
 * The master dossier sketched `1500 * 1.35^n`, and the arithmetic on that curve walls level 15
 * behind twenty-odd runs — a ladder whose eighth rung is a month of play is a ladder nobody
 * climbs. At `2000 * 1.12^(n-1)` against a typical ~6,000 run score, levels 1–10 each cost well
 * under one run, level 15 costs about 1.6 and level 25 about 5: a first session ends around level
 * 2–3 with two choices already made, and the picks stay meaningful because they stay scarce.
 */
export function dynastyXpStep(level: number): number {
  return Math.round(2000 * Math.pow(1.12, Math.max(0, level - 1)));
}

function emptyStore(): DynastyStore {
  return { xp: 0, level: 0, traits: [], pendingPicks: 0, reigns: 0, bestScore: 0, respecs: 0 };
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readFounder(raw: unknown): DynastyFounder | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<DynastyFounder>;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;
  return {
    id: value.id,
    name: value.name,
    type: typeof value.type === 'string' ? value.type : 'general',
    sex: value.sex === 'woman' ? 'woman' : 'man',
    ...(typeof value.era === 'string' ? { era: value.era } : {}),
    ...(value.monastic === true ? { monastic: true as const } : {}),
  };
}

/**
 * A stored number, or the fallback.
 *
 * `Math.max(0, Math.floor(Number(x) || 0))` looks like it hardens a field and does not: `1e999`
 * parses to `Infinity`, survives `|| 0`, survives `Math.floor`, survives `Math.max`, and lands in
 * the store as an infinite level. `dynastyProgress` and `addRunXp` both walk `for (level = 1;
 * level <= store.level; …)` to sum the steps below the current one — against Infinity that is a
 * hang, not a wrong number, and it takes the menu down with it the moment the sheet is opened.
 * Found by feeding the real browser six shapes of junk; `Number.isFinite` is the whole fix.
 */
function finite(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, parsed));
}

/**
 * A ceiling on lifetime XP, so the step-summing loops are bounded by construction.
 *
 * Not a game rule — no reachable run approaches it. At 2,000 x 1.12^(n-1) a trillion XP is about
 * level 158, so a hand-edited save can cost a few hundred iterations and never more.
 */
const MAX_XP = 1e12;

/**
 * The level a lifetime XP total buys, and the XP consumed reaching it.
 *
 * The one walk of the curve — `getDynasty`, `dynastyProgress` and `addRunXp` all read it, so the
 * level shown on the sheet, the bar's fill and the number of picks a run produces can never
 * disagree about where the house is. Terminates by construction: `dynastyXpStep` grows 12% a rung
 * against an `xp` that `finite` has already capped at `MAX_XP`.
 */
function walkLevels(xp: number): { level: number; spent: number } {
  let level = 0;
  let spent = 0;
  for (;;) {
    const next = spent + dynastyXpStep(level + 1);
    if (xp < next) return { level, spent };
    spent = next;
    level += 1;
  }
}

/** The level a lifetime XP total buys. */
export function levelForXp(xp: number): number {
  return walkLevels(xp).level;
}

export function getDynasty(): DynastyStore {
  if (!canUseLocalStorage()) return emptyStore();
  try {
    const raw = localStorage.getItem(DYNASTY_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<DynastyStore>;
    // Traits are filtered against the live table rather than merely against `string`: a trait id
    // retired between builds would otherwise sit in the save for ever, unreadable and unchoosable,
    // and `hasTrait` would keep answering true for a rule nothing implements.
    const known = new Set(DYNASTY_TRAITS.map((trait) => trait.id));
    const traits = Array.isArray(parsed.traits)
      ? Array.from(new Set(parsed.traits.filter((id): id is string => typeof id === 'string' && known.has(id))))
      : [];
    const xp = finite(parsed.xp, MAX_XP);
    return {
      xp,
      // **Derived, never trusted.** `xp` is lifetime and never spent, so the level is a pure
      // function of it — which makes the stored copy redundant state that can disagree with the
      // number it is supposed to describe. Recomputing means a hand-edited, truncated or
      // half-written file heals itself instead of carrying a lie into every later level-up, and it
      // is what bounds the summing loops: they now run off `xp`, which `finite` has already capped.
      level: levelForXp(xp),
      traits,
      // Never more picks outstanding than there are traits left to take, or the ceremony offers
      // a level-up card it has nothing to put on.
      pendingPicks: Math.min(DYNASTY_TRAITS.length - traits.length, finite(parsed.pendingPicks)),
      reigns: finite(parsed.reigns),
      bestScore: finite(parsed.bestScore),
      ...(readFounder(parsed.founder) ? { founder: readFounder(parsed.founder) } : {}),
      ...(typeof parsed.house === 'string' ? { house: parsed.house } : {}),
      respecs: finite(parsed.respecs),
    };
  } catch {
    return emptyStore();
  }
}

function writeDynasty(store: DynastyStore): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(DYNASTY_KEY, JSON.stringify(store));
  } catch {
    // A full or locked quota must not take the run down on its way out of it.
  }
}

/** XP earned so far *within* the current level, and what the next one costs. */
export function dynastyProgress(store: DynastyStore = getDynasty()): { into: number; need: number } {
  const { level, spent } = walkLevels(store.xp);
  return { into: Math.max(0, store.xp - spent), need: dynastyXpStep(level + 1) };
}

/**
 * Pours a finished run's score into the house.
 *
 * Returns the number of level-ups it produced, which is what the ceremony has to walk the player
 * through before it lets them leave. Called from `endAscentRun` inside the same `legacyBanked`
 * guard Legacy banks under — a re-entrant tick that paid this twice would hand out free traits.
 */
export function addRunXp(score: number, reign?: { founder?: DynastyFounder; house?: string }): number {
  const store = getDynasty();
  store.xp += Math.max(0, Math.round(score));
  store.reigns += 1;
  store.bestScore = Math.max(store.bestScore, Math.max(0, Math.round(score)));
  if (reign?.founder) store.founder = reign.founder;
  if (reign?.house) store.house = reign.house;

  const before = store.level;
  store.level = levelForXp(store.xp);

  // Capped by the table, not by the curve: a house that has taken all eight has nothing left to
  // be asked, and banking picks it can never spend would open a ceremony step with no options on
  // it every single run. The XP still accrues, so a longer table later pays the backlog out.
  const room = DYNASTY_TRAITS.length - store.traits.length - store.pendingPicks;
  const gained = Math.max(0, Math.min(room, store.level - before));
  store.pendingPicks += gained;
  writeDynasty(store);
  return gained;
}

/**
 * Two of the un-owned traits, rolled, with no reroll.
 *
 * A pick has to be a fork rather than a menu. Offering the whole remaining table would make every
 * house converge on the same order — the strongest first, every run, for ever — and a level-up
 * that always answers itself is a loading screen with a button on it.
 */
export function rollTraitOffer(store: DynastyStore = getDynasty()): string[] {
  const pool = DYNASTY_TRAITS.filter((trait) => !store.traits.includes(trait.id)).map((t) => t.id);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 2);
}

/** Takes one trait against one pending pick. Returns false if it was not on offer to take. */
export function chooseTrait(id: string): boolean {
  const store = getDynasty();
  if (store.pendingPicks <= 0) return false;
  if (!findDynastyTrait(id) || store.traits.includes(id)) return false;
  store.traits.push(id);
  store.pendingPicks -= 1;
  writeDynasty(store);
  return true;
}

/**
 * Is this trait in force?
 *
 * Read straight off localStorage at every call site rather than copied onto `GameState`, on
 * purpose: a trait chosen in the ceremony has to be true for the very next run, and a run's state
 * is built before the ceremony that precedes it has finished being answered.
 */
export function hasTrait(id: string): boolean {
  return getDynasty().traits.includes(id);
}

/**
 * How many respecs the house is still owed, one per ascension.
 *
 * Traits are a biography, not a loadout. A respec at will would make the level-up card a
 * preference rather than a fork, which is precisely the thing `rollTraitOffer` exists to prevent
 * — but a house thirty reigns deep that took Deep Shelf before seals existed deserves one way out.
 */
export function respecsAvailable(ascensions: number): number {
  return Math.max(0, ascensions - getDynasty().respecs);
}

/** Returns every trait to the table and hands the picks back. Spends one respec. */
export function respecDynasty(ascensions: number): boolean {
  if (respecsAvailable(ascensions) <= 0) return false;
  const store = getDynasty();
  store.pendingPicks = Math.min(DYNASTY_TRAITS.length, store.pendingPicks + store.traits.length);
  store.traits = [];
  store.respecs += 1;
  writeDynasty(store);
  return true;
}

/**
 * Champions the founding card deals — three, or five with Second Founder.
 *
 * Lives here rather than in `GameState` so the next-reign screen can quote the same number the
 * founding card will actually deal, without the scenes importing the world factory.
 */
export function founderOptionCount(): number {
  return hasTrait('second-founder') ? 5 : 3;
}

/** The rank the house's badge is drawn at — the king visibly ages with the ledger. */
export function dynastyRankRarity(level: number): 'Common' | 'Rare' | 'Epic' | 'Legendary' {
  if (level >= 20) return 'Legendary';
  if (level >= 12) return 'Epic';
  if (level >= 5) return 'Rare';
  return 'Common';
}
