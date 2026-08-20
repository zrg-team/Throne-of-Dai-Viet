/**
 * The five shapes, the ring they answer each other in, and the blocks they stand on.
 *
 * This module is deliberately **Phaser-free** and lives in `data/` rather than `ui/ink/`, because
 * both sides of the game need it and only one of them may import a renderer:
 *
 *   - `ui/ink/devices.ts` draws the four blocks and needs the doctrine weights;
 *   - `systems/ascent/BattleSystem.ts` resolves the fight and needs the same weights to know
 *     whether a block is still standing — and `src/systems/` must never import Phaser, or every
 *     headless harness in the repo stops booting.
 *
 * Duplicating the table in both places would have worked until the first time somebody changed one
 * of them, so the table lives here once and `devices.ts` imports it back.
 *
 * See `docs/14-five-shapes-two-dials.html`, which is the specification for the ring.
 */
import type { ArmyComposition } from '../../state/types';

// ─────────────────────────────────────────────────────────────────────────────
// The blocks
// ─────────────────────────────────────────────────────────────────────────────

/** How many men one drawn mark stands for. */
export const MEN_PER_MARK = 55;

/** Most marks a single host will ever be drawn with, however large it gets. */
export const HOST_MARK_CAP = 420;

export type FormationKey = 'screen' | 'line' | 'bows' | 'horse';

/** The order blocks are listed in — and, because `pri` follows it, the order they die in. */
export const FORMATION_ORDER: FormationKey[] = ['screen', 'line', 'bows', 'horse'];

/**
 * Each doctrine is the same army spent differently: `weight` is its share of the host's marks and
 * `aspect` is how wide the block stands against how deep.
 *
 * The numbers are the ones drawn in `docs/12-armies-of-dai-viet.html`, which plates a 44-mark host
 * — so at 44 marks this table reproduces that page file for file.
 *
 * The zeroes are load-bearing twice over now. They were the doctrine's silhouette; they are also
 * **which shapes a host never had** — a `spears` army has no horse, so Thế Xung is not merely
 * unavailable to it once the wing is spent, it was never on the dock at all.
 */
export const DOCTRINE: Record<ArmyComposition, Record<FormationKey, { weight: number; aspect: number }>> = {
  balanced: {
    screen: { weight: 5, aspect: 5 }, line: { weight: 21, aspect: 7 / 3 },
    bows: { weight: 12, aspect: 3 }, horse: { weight: 6, aspect: 1.5 },
  },
  // Everything in the line: nine files and four ranks deep, a token screen, almost no shot and not
  // one horse. A host that has decided to be an obstacle.
  spears: {
    screen: { weight: 3, aspect: 3 }, line: { weight: 36, aspect: 2.25 },
    bows: { weight: 8, aspect: 2 }, horse: { weight: 0, aspect: 1.5 },
  },
  // The main body is at the back, behind a crust two ranks deep whose whole job is to keep anything
  // off it. The weakness is visible without being written down.
  archers: {
    screen: { weight: 4, aspect: 4 }, line: { weight: 10, aspect: 2.5 },
    bows: { weight: 27, aspect: 3 }, horse: { weight: 0, aspect: 1.5 },
  },
  // No screen at all and a real wing: it gives up the exchange before contact entirely in order to
  // win the exchange at contact. The bare ground where every other doctrine has men is the tell.
  shock: {
    screen: { weight: 0, aspect: 4 }, line: { weight: 32, aspect: 2 },
    bows: { weight: 3, aspect: 3 }, horse: { weight: 10, aspect: 2.5 },
  },
  // A wing this size is paid for out of the block that has to hold the ground while it manoeuvres,
  // and the picture makes the trade legible.
  horse: {
    screen: { weight: 4, aspect: 4 }, line: { weight: 10, aspect: 2.5 },
    bows: { weight: 8, aspect: 2 }, horse: { weight: 18, aspect: 2 },
  },
};

/** What one block mustered, and what is left of it. */
export interface BlockShare {
  /** Marks the block deployed with — this is what sets its frontage, and it never shrinks. */
  full: number;
  /** Marks still on their feet. Zero means the block is gone. */
  standing: number;
}

function marksFor(men: number): number {
  return Math.max(4, Math.min(HOST_MARK_CAP, Math.round(men / MEN_PER_MARK)));
}

/**
 * How a host's marks are divided between its four blocks, and where its casualties have landed.
 *
 * The single source of truth for both the picture and the fight. `armyShape` draws what this
 * returns; `formationAvailability` reads it to decide which shapes a host can still form.
 *
 * Casualties are spent **in formation order** — the screen first, then the line, then the bows, and
 * the horse last. That is the whole reason an army is several blocks: a mixed block loses a mark at
 * random and nothing is learned, where a formation loses its screen inside a few beats and the
 * picture has said the front has collapsed without a word of text.
 */
export function blockShares(
  composition: ArmyComposition, men: number, mustered?: number,
): Record<FormationKey, BlockShare> {
  const total = marksFor(Math.max(mustered ?? men, men));
  const standing = marksFor(men);
  const plan = DOCTRINE[composition] ?? DOCTRINE.balanced;
  const weightSum = FORMATION_ORDER.reduce((sum, key) => sum + plan[key].weight, 0) || 1;

  // Hand out marks by share, then give the rounding remainder to the line — which is the block
  // that should absorb it, and the one block every doctrine has.
  const share: Record<FormationKey, number> = { screen: 0, line: 0, bows: 0, horse: 0 };
  let handed = 0;
  for (const key of FORMATION_ORDER) {
    const n = plan[key].weight === 0 ? 0 : Math.round((total * plan[key].weight) / weightSum);
    share[key] = n;
    handed += n;
  }
  share.line = Math.max(1, share.line + (total - handed));

  const full: Record<FormationKey, number> = { ...share };

  // Casualties come out of the front of the formation, in order.
  let losses = Math.max(0, total - standing);
  for (const key of FORMATION_ORDER) {
    if (losses <= 0) break;
    const spent = Math.min(share[key], losses);
    share[key] -= spent;
    losses -= spent;
  }

  return {
    screen: { full: full.screen, standing: share.screen },
    line: { full: full.line, standing: share.line },
    bows: { full: full.bows, standing: share.bows },
    horse: { full: full.horse, standing: share.horse },
  };
}

/**
 * Which doctrine a host deploys in, read off its real units when nobody has labelled it.
 *
 * Lives here rather than in `devices.ts` because the fight needs the answer too, and it must be the
 * same answer — a host drawn as an archer army that the resolver thinks is balanced would offer
 * Thế Nỏ on a dock while denying it in the exchange.
 */
export function compositionOfUnits(
  units?: { spearmen: number; archers: number; heavyInfantry: number },
  explicit?: ArmyComposition,
): ArmyComposition {
  if (explicit) return explicit;
  if (!units) return 'balanced';
  const total = Math.max(1, units.spearmen + units.archers + units.heavyInfantry);
  if (units.archers / total >= 0.45) return 'archers';
  if (units.heavyInfantry / total >= 0.4) return 'shock';
  if (units.spearmen / total >= 0.7) return 'spears';
  return 'balanced';
}

// ─────────────────────────────────────────────────────────────────────────────
// The ring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The five shapes an army can stand in.
 *
 * Each is an arrangement of the four blocks above — nothing new is added to an army to give it a
 * formation, the same men simply stand differently.
 */
export type BattleFormation = 'chong' | 'xung' | 'tan' | 'quy' | 'no';

/**
 * The ring, in order. **Each shape beats the two clockwise from it and loses to the other two.**
 *
 * A five-cycle rather than a three-cycle because three options with two answers each cannot avoid
 * a dominant one for long, and because every edge here is defensible on its own terms:
 *
 *   chông → xung   a levelled hedge of stakes is what a horse will not run onto
 *   chông → tán    loose men cannot stop a hedge that simply keeps walking
 *   xung  → tán    scattered men in the open are what cavalry was made for
 *   xung  → quy    a wedge is a tool for splitting a packed block, and a turtle cannot step aside
 *   tán   → quy    a turtle catches nobody; it is bled from the flanks for as long as they have
 *                  anything left to throw
 *   tán   → nỏ     arrows loosed by the thousand into open order mostly find ground
 *   quy   → nỏ     shields up is the answer to arrows, and always was
 *   quy   → chông  locked shields turn the points aside and the denser side wins the shove
 *   nỏ    → chông  a hedge holds still, and holding still in front of massed crossbows is the
 *                  oldest mistake there is
 *   nỏ    → xung   the crossbow is the one thing in this country's memory that has stopped cavalry
 *
 * This order is also the order the chips are laid out on the dock, so the two shapes you beat are
 * always the two immediately to the right, wrapping. The rule is legible from the layout alone.
 */
export const FORMATION_RING: BattleFormation[] = ['chong', 'xung', 'tan', 'quy', 'no'];

/** The block each shape is built around, and therefore the block whose loss takes it away. */
export const BLOCK_OF: Record<BattleFormation, FormationKey> = {
  chong: 'line',
  xung: 'horse',
  tan: 'screen',
  quy: 'line',
  no: 'bows',
};

function ringIndex(formation: BattleFormation): number {
  return FORMATION_RING.indexOf(formation);
}

/** Does `a` answer `b`? True when `b` is one or two steps clockwise of `a`. */
export function formationBeats(a: BattleFormation, b: BattleFormation): boolean {
  const step = (ringIndex(b) - ringIndex(a) + FORMATION_RING.length) % FORMATION_RING.length;
  return step === 1 || step === 2;
}

/**
 * Which way the exchange leans, before any tempo is applied.
 *
 * Positive is ours: we deal more and take less. Deliberately a plain sign rather than a magnitude
 * — the *size* of the swing is a tuning constant in `ascentConfig`, so it can be moved in one
 * place after the first ten real fights without touching the geometry.
 */
export function formationTiltSign(ours: BattleFormation, theirs: BattleFormation): number {
  if (ours === theirs) return 0;
  if (formationBeats(ours, theirs)) return 1;
  if (formationBeats(theirs, ours)) return -1;
  return 0;
}

/**
 * Whether a host can still form each shape.
 *
 * - `gone` — the block it stands on was never in this doctrine, or has been spent. The chip is
 *   faded and refuses the tap.
 * - `blunt` — the shape can be taken but only half the counter is worth anything.
 * - `ready` — as intended.
 *
 * **Thế Chông and Thế Quy are always `ready`.** The document is explicit that the line is the last
 * thing to die, and a dock on which every chip is dead is a bug rather than a hard moment: the
 * tortoise is the floor of the fight and there has to be a floor.
 *
 * The narrowing that gives a long engagement its shape therefore comes from the other three — the
 * screen dies first and takes Thế Tán with it, the horse is spent last and takes Thế Xung, and the
 * bows blunt Thế Nỏ rather than removing it. Open with five shapes, finish with two.
 */
export function formationAvailability(
  composition: ArmyComposition, men: number, mustered?: number,
): Record<BattleFormation, 'ready' | 'blunt' | 'gone'> {
  const shares = blockShares(composition, men, mustered);
  const spent = (key: FormationKey): boolean => shares[key].full <= 0 || shares[key].standing <= 0;
  return {
    chong: 'ready',
    quy: 'ready',
    xung: spent('horse') ? 'gone' : 'ready',
    tan: spent('screen') ? 'gone' : 'ready',
    no: spent('bows') ? 'blunt' : 'ready',
  };
}
