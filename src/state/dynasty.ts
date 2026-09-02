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
  /**
   * The given name the player composed, without the họ. Kept beside `name` because `house` is
   * derived from the family name and the two must not have to be re-split to be shown apart.
   */
  givenName?: string;
  /**
   * The portrait the player *made*, rather than the one a seed would have dealt.
   *
   * Stored resolved — the part keys and the three base colours — not as the picker's indices,
   * because a pool that gains an entry between builds would otherwise shift a king's face. The
   * renderer drops a key it no longer has, so a retired part costs one layer and never a crash.
   * `choice` rides along only so the Temple can reopen the steppers where they were left.
   */
  look?: DynastyLook;
  /** Two colours and a mark — the house's chrome, never a map-flag system. */
  banner?: DynastyBanner;
  /**
   * The era the *forces* are styled in, taken from the họ. Decoupled from `era`, which is the
   * court the king himself dresses in: a Lê house may crown a king in Trần court dress.
   */
  armyEra?: string;
}

/** A part stack and its three base colours. The shade ramps are derived, never stored. */
export interface DynastyLook {
  parts: Array<{ key: string; tint: string }>;
  skin: number;
  hair: number;
  robe: number;
  /** The picker's own stepper positions. Advisory: the parts above are what actually renders. */
  choice?: Record<string, number | string>;
}

export interface DynastyBanner {
  field: number;
  trim: number;
  emblem: string;
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

/**
 * The made king's part stack, or nothing.
 *
 * Parsed the same defensive way the rest of this file is: a hand-edited or half-written look
 * must degrade to "no look" — which falls the portrait back to the seed path — rather than
 * take the Tông Phả sheet down. The 240 cap is far past any composed portrait (the real ones
 * run about 20 parts) and exists only so a pasted array cannot make the renderer walk for ever.
 */
function readLook(raw: unknown): DynastyLook | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<DynastyLook>;
  if (!Array.isArray(value.parts)) return undefined;
  const parts = value.parts
    .filter((part): part is { key: string; tint: string } => Boolean(part)
      && typeof (part as { key?: unknown }).key === 'string'
      && typeof (part as { tint?: unknown }).tint === 'string')
    .slice(0, 240)
    .map((part) => ({ key: part.key, tint: part.tint }));
  if (parts.length === 0) return undefined;
  const colour = (input: unknown, fallback: number): number => {
    const parsed = Math.floor(Number(input));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(0xffffff, parsed));
  };
  const choice = value.choice && typeof value.choice === 'object'
    ? Object.fromEntries(Object.entries(value.choice)
      .filter(([, entry]) => typeof entry === 'string'
        || (typeof entry === 'number' && Number.isFinite(entry)))
      .slice(0, 40))
    : undefined;
  return {
    parts,
    skin: colour(value.skin, 0xe8c39a),
    hair: colour(value.hair, 0x1d160f),
    robe: colour(value.robe, 0x2f5170),
    ...(choice ? { choice } : {}),
  };
}

function readBanner(raw: unknown): DynastyBanner | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<DynastyBanner>;
  if (typeof value.emblem !== 'string') return undefined;
  const colour = (input: unknown, fallback: number): number => {
    const parsed = Math.floor(Number(input));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(0xffffff, parsed));
  };
  return {
    field: colour(value.field, 0xaa3a2c),
    trim: colour(value.trim, 0xb08a3a),
    emblem: value.emblem.slice(0, 24),
  };
}

function readFounder(raw: unknown): DynastyFounder | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<DynastyFounder>;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;
  const look = readLook(value.look);
  const banner = readBanner(value.banner);
  return {
    id: value.id,
    name: value.name,
    type: typeof value.type === 'string' ? value.type : 'general',
    sex: value.sex === 'woman' ? 'woman' : 'man',
    ...(typeof value.era === 'string' ? { era: value.era } : {}),
    ...(value.monastic === true ? { monastic: true as const } : {}),
    ...(typeof value.givenName === 'string' ? { givenName: value.givenName } : {}),
    ...(typeof value.armyEra === 'string' ? { armyEra: value.armyEra } : {}),
    ...(look ? { look } : {}),
    ...(banner ? { banner } : {}),
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

/**
 * The memoised parse, and why this file needed one the day the Coronation landed.
 *
 * `hasTrait` was always a per-call read, and that was affordable: a handful of call sites, none
 * of them per frame. The rite changed the shape of the traffic. `resolveHeroLook` now asks this
 * store who the made king is, and `heroFaceTextureKey` builds its cache *identity* from the
 * king's look stamp — which runs **before** the `textures.exists` hit, so it happens on every
 * portrait lookup, including the cache hits `ArmyRenderer` makes for every marching host on the
 * map, every redraw. A `getItem` plus a `JSON.parse` plus a trait filter on that path is the
 * same defect the i18n cache was written for (measured there at 191–566 storage reads a tick).
 *
 * Memoised the way `cabinet.ts` does it, for the same reason and with the same guard: the memo
 * is only trusted while the *raw string* in localStorage is the one it was parsed from. Under
 * Vite's HMR a dev page can hold two instances of this module, and a memo that never re-checks
 * would make the second instance's writes invisible — the dual-module trap, which cost
 * verify-cabinet four checks the first time it was met. `getItem` is microseconds; the string
 * comparison buys the parse back without creating a second source of truth.
 */
let cachedRaw: string | null | undefined;
let cached: DynastyStore | undefined;

/** Test hook: forget the memo so a harness that pokes localStorage directly is believed. */
export function resetDynastyCache(): void {
  cached = undefined;
  cachedRaw = undefined;
}

export function getDynasty(): DynastyStore {
  if (!canUseLocalStorage()) return emptyStore();
  try {
    const raw = localStorage.getItem(DYNASTY_KEY);
    if (cached && raw === cachedRaw) return cached;
    cachedRaw = raw;
    if (!raw) {
      cached = emptyStore();
      return cached;
    }
    const parsed = JSON.parse(raw) as Partial<DynastyStore>;
    // Traits are filtered against the live table rather than merely against `string`: a trait id
    // retired between builds would otherwise sit in the save for ever, unreadable and unchoosable,
    // and `hasTrait` would keep answering true for a rule nothing implements.
    const known = new Set(DYNASTY_TRAITS.map((trait) => trait.id));
    const traits = Array.isArray(parsed.traits)
      ? Array.from(new Set(parsed.traits.filter((id): id is string => typeof id === 'string' && known.has(id))))
      : [];
    const xp = finite(parsed.xp, MAX_XP);
    cached = {
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
    return cached;
  } catch {
    cached = emptyStore();
    return cached;
  }
}

function writeDynasty(store: DynastyStore): void {
  cached = store;
  if (!canUseLocalStorage()) return;
  try {
    const raw = JSON.stringify(store);
    localStorage.setItem(DYNASTY_KEY, raw);
    cachedRaw = raw;
  } catch {
    // A full or locked quota must not take the run down on its way out of it. The memo still
    // carries the session, and the un-updated `cachedRaw` forces the next read to try again.
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
  // **A made king is never overwritten by the champion who served him.**
  //
  // Before the Coronation the sheet's face was the run's founding champion, because the run's
  // king was a deliberately blank figure and a champion was the only face the house had. Once
  // the player has made a king, that king *is* the house — for every reign after this one — so
  // the run's champion may only fill the seat while it is still empty.
  if (reign?.founder && !store.founder?.look) store.founder = reign.founder;
  if (reign?.house && !store.founder?.look) store.house = reign.house;

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

/**
 * Crowns the house's founder — the one write the Coronation makes.
 *
 * Also sets `house`, because the họ the player chose is what the sheet, the ceremony and the
 * Chronicle call this line for ever after; deriving it here rather than at the call site keeps
 * the two fields from ever disagreeing about which family this is.
 */
export function setDynastyFounder(founder: DynastyFounder, house?: string): void {
  const store = getDynasty();
  store.founder = founder;
  store.house = house ?? founder.name.trim().split(/\s+/)[0];
  writeDynasty(store);
}

/** True once a king has been made. The Coronation is gated on this and nothing else. */
export function isCrowned(store: DynastyStore = getDynasty()): boolean {
  return Boolean(store.founder?.look);
}

/**
 * A short stamp of the made king's look, for the portrait cache.
 *
 * `heroFaceTextureKey` bakes a portrait once per identity string, and the king's identity —
 * id, name, era, sex, type, rarity — does not change when the player re-dresses him in the
 * Temple. Without this the Temple would appear to do nothing: the stored look would change and
 * every screen would keep drawing the cached face from before it.
 */
export function dynastyLookStamp(store: DynastyStore = getDynasty()): string {
  const look = store.founder?.look;
  if (!look) return '';
  let hash = 2166136261;
  const source = `${look.skin}|${look.hair}|${look.robe}|${look.parts.map((p) => `${p.key}:${p.tint}`).join(',')}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
