/**
 * The five shapes, the ring they answer each other in, and the blocks they stand on.
 *
 * This module is deliberately **Phaser-free** and lives in `data/` rather than `ui/ink/`, because
 * both sides of the game need it and only one of them may import a renderer:
 *
 *   - `ui/ink/devices.ts` draws the four blocks and needs the doctrine weights;
 *   - `systems/ascent/BattleSystem.ts` resolves the fight and needs the ring — and `src/systems/`
 *     must never import Phaser, or every headless harness in the repo stops booting.
 *
 * Duplicating the table in both places would have worked until the first time somebody changed one
 * of them, so the table lives here once and `devices.ts` imports it back.
 *
 * See `docs/14-five-shapes-two-dials.html` for the ring, `docs/19-five-shapes-one-clock.html` for
 * the wind clock that retiered it, and `formationsClassic.ts` for the retired availability rules.
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
 * The zeroes are the doctrine's silhouette. They used to be load-bearing twice over — which
 * shapes a host could never form — until the availability rule was retired for the wind clock
 * (docs/18, docs/19): every host has all five shapes now, and a `spears` army standing in Thế
 * Xung simply draws a wedge whose point block has no marks in it. The picture, not the dock,
 * carries what an army is.
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

/** How many marks a host of this many men is drawn with — the column's length scales off it. */
export function marksFor(men: number, cap = HOST_MARK_CAP): number {
  return Math.max(4, Math.min(cap, Math.round(men / MEN_PER_MARK)));
}

/**
 * How a host's marks are divided between its four blocks, and where its casualties have landed.
 *
 * The single source of truth for the picture. `armyShape` draws what this returns; the fight
 * stopped reading it when availability-by-blocks was retired (`formationsClassic.ts`, docs/18).
 *
 * Casualties are spent **in formation order** — the screen first, then the line, then the bows, and
 * the horse last. That is the whole reason an army is several blocks: a mixed block loses a mark at
 * random and nothing is learned, where a formation loses its screen inside a few beats and the
 * picture has said the front has collapsed without a word of text.
 */
export function blockShares(
  composition: ArmyComposition, men: number, mustered?: number, markCap?: number,
): Record<FormationKey, BlockShare> {
  // `markCap` overrides the density ceiling for callers with less room than the map has. The
  // battle screen is the only one — see `BATTLE_HOST_MARK_CAP`, where 420 marks come out 208 px
  // wide on a 390 px field and two hosts cannot both be on the screen. Applied to `total` and
  // `standing` alike so the block still empties in formation order as men fall.
  const cap = markCap ?? HOST_MARK_CAP;
  const total = marksFor(Math.max(mustered ?? men, men), cap);
  const standing = marksFor(men, cap);
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

/** How one shape re-states one block: where it stands, how wide, how loose. */
export interface FormationTweak {
  /** Toward the enemy, in file pitches. */
  dx?: number;
  /** Toward the viewer, in rank pitches. */
  dy?: number;
  /** Looser or tighter than the block normally stands. */
  pitch?: number;
  /** Frontage against depth. Higher is wider and shallower. */
  aspect?: number;
  /** Ranks of one, two, three — a point rather than a column. Only the wedge wants this. */
  wedge?: boolean;
}

/**
 * The five shapes, as an override of the one arrangement `devices.ts` otherwise always draws.
 *
 * A formation does not change who is in the host or how a man is drawn. It re-states, per block,
 * **how far forward it stands, how wide, and how loose** — which is exactly the three fields the
 * base table already carries. So this is that table with a fifth axis, and a shape the player
 * cannot see is a shape they cannot answer.
 *
 * Anything omitted keeps the base value, and a host with no plan at all draws exactly as it always
 * has. That default is load-bearing: `armyShape` has three callers and only one of them is in a
 * battle — the map marker and the History plate must never re-form, because an army crossing a
 * province is not standing in Thế Nỏ.
 *
 * The numbers are Doc 14's `PLAN` carried into this space, with one correction. Doc 14 drew its
 * frontages on a 780-wide chart: `front: 24` at a 16-unit pitch is 176 units of a host that has
 * about 205 to stand in before it is inside the enemy. On the real 390-wide surface the fronts come
 * down and each shape carries its character in **depth, looseness and which block is at the seam**
 * instead. See `docs/14-five-shapes-two-dials.html`.
 */
export const FORMATION_PLAN: Record<BattleFormation, Partial<Record<FormationKey, FormationTweak>>> = {
  // The hedge: the line wide and shallow at the seam, everything else stacked behind it.
  chong: {
    line: { dx: 6.25, dy: 0, aspect: 5.5 },
    screen: { dx: 1.88, dy: -3.0 },
    bows: { dx: -3.13, dy: 3.0, aspect: 3 },
    horse: { dx: -6.56, dy: 7.17 },
  },
  // The wedge: the horse at the point, in ranks of one, two, three, and the foot behind it.
  // The point stands nine files out, not seven: at seven it read as the line's own right edge on
  // a phone, and the hardest setting has nothing but this silhouette to say "charge".
  xung: {
    horse: { dx: 9.0, dy: -0.83, wedge: true },
    line: { dx: 1.88, dy: 2.0, aspect: 2.33 },
    screen: { dx: -1.88, dy: -2.83 },
    bows: { dx: -5.94, dy: 3.33, aspect: 3 },
  },
  // The skirmish: the screen thrown forward and deliberately loose, the body massed behind.
  // The screen likewise: further out and looser, so the gap between it and the body is the shape.
  tan: {
    screen: { dx: 8.25, dy: -1.5, pitch: 2.6 },
    line: { dx: 0.63, dy: 1.67, aspect: 2.33 },
    bows: { dx: -3.75, dy: 4.33, aspect: 3 },
    horse: { dx: -6.88, dy: 8.0 },
  },
  // The tortoise: packed tight and deep. The smallest footprint of the five, and it should read so.
  quy: {
    line: { dx: 5.31, dy: 0, pitch: 0.81, aspect: 1 },
    bows: { dx: 1.38, dy: 3.83, pitch: 0.88, aspect: 1.33 },
    screen: { dx: -0.88, dy: -2.83, pitch: 0.88 },
    horse: { dx: -5.0, dy: 7.67 },
  },
  // The volley: one thin rank across the whole front, the bows banked deep behind it, and the
  // screen and horse pushed out onto the wings where they are not in the way of the shooting.
  no: {
    line: { dx: 5.94, dy: 0, pitch: 0.72, aspect: 12 },
    bows: { dx: 2.19, dy: 3.67, pitch: 1.31, aspect: 1.33 },
    screen: { dx: 0.31, dy: -4.33 },
    horse: { dx: -0.31, dy: 8.33 },
  },
};

/**
 * **Hành quân — the host on the road.**
 *
 * Not a battle shape and deliberately not a member of `BattleFormation`: nothing resolves a fight
 * against it, it has no place on the counter ring, and adding a sixth member there would change
 * every matchup in the mode. It is a *drawing*, used only by the map marker while a host is
 * between provinces.
 *
 * A host at rest stands in its doctrine's arrangement — a line, a screen thrown forward, the bows
 * banked behind, the horse off the flank — which is a wide, loose thing that reads as men holding
 * ground. A host on the march is the opposite: the blocks close up and fall in one behind another,
 * narrow at the front and long from front to back. Every `aspect` here is below one, which is what
 * makes each block deeper than it is wide, and the `dy` values file the blocks in marching order:
 * screen out ahead, then the line, the bows, and the horse bringing up the rear.
 *
 * **The numbers here are the whole difference between a column and a smudge.** They used to read
 * `pitch: 0.5, aspect: 2.6`, which is the opposite of both sentences above: `aspect` above one
 * makes a block *wider* than it is deep (`fullRows = √(full / aspect)`), and halving the pitch
 * pulled the files in under half a figure's width. Together with `dy` steps of barely one rank
 * they collapsed the four blocks into each other. Measured on a 460-man host at map scale
 * (`_shapeprobe`): standing, its eight marks covered 80 × 37 px; marching, the same eight covered
 * 10 × 15 — less ground than ONE figure, which is drawn 9.3 × 8.3. That is the host that "looked
 * unreal and disappeared" on the road: it was eight men stacked on one spot.
 *
 * So: `pitch` near one (the files keep a standing host's spacing, only slightly closed up),
 * `aspect` genuinely below one, and `dy` steps of four rank pitches — about a block's own depth
 * plus a gap — so each block clears the one ahead of it instead of standing inside it.
 */
export const MARCH_PLAN: Partial<Record<FormationKey, FormationTweak>> = {
  screen: { dx: 0.35, dy: -4.0, pitch: 0.95, aspect: 0.5 },
  line: { dx: 0, dy: 0, pitch: 0.95, aspect: 0.5 },
  bows: { dx: -0.35, dy: 4.0, pitch: 0.95, aspect: 0.5 },
  horse: { dx: 0.2, dy: 8.4, pitch: 1, aspect: 0.55 },
};

/**
 * The march column, turned to face the way the host is walking.
 *
 * `MARCH_PLAN` files its blocks front-to-back along one axis, which is right for a host walking
 * that way and wrong for every other heading — a column marching east that is drawn stacked
 * north-to-south is a queue standing side-on to its own road.
 *
 * **And that is what it did.** The rotation was applied as if the plan's base column pointed along
 * +x, but `MARCH_PLAN` files its blocks on `dy` — it points along **+y**, due south. So the turn
 * was a quarter circle out, and the only headings that came out right were the two that happen to
 * be symmetric about it. Measured on a host ordered due west (`_colcheck`): standing it covered
 * 49.8 x 32.9, marching 6.1 x 41.3 — still 41 units long north to south while walking west. A
 * player reads that as the host never forming column at all, which is exactly what was reported.
 * The base points south, so the turn is `heading - π/2`.
 *
 * `dx` is counted in file pitches and `dy` in rank pitches, and those are not the same distance —
 * so the depth is converted to file pitches before the turn and back afterwards. Without that a
 * column heading north-east comes out sheared.
 *
 * **The blocks turn too, as far as an axis-aligned block can.** Each one is built `cols` across by
 * `rows` deep in screen axes, so a block that is deeper than it is wide reads as a column only
 * while the road runs up and down the sheet. On an east-west road the same block is a bar standing
 * across its own line of march. `aspect` therefore follows the heading: elongated along x when the
 * road runs across the sheet, along y when it runs up it, and square on the diagonals where
 * neither reads as either.
 */
/**
 * Marks a host is drawn with before the column has to lengthen to hold them.
 *
 * `MARCH_PLAN` files its blocks at fixed offsets — four rank pitches apart — which is a column for
 * a host of eight marks and a *crowd* for one of four hundred: the gaps stay put while each block
 * grows with the men in it. Swept over every size, doctrine and heading, a 24,000-man host came
 * out **109 units long and 132 across** — wider than it was deep, which is the opposite of a
 * column and exactly the "sometimes it does not form up" a player sees, because it only happens
 * to the big hosts. Below 1,800 men nothing failed; above it, 87 of 360 cases did.
 *
 * A block's depth grows with the square root of its marks (rows = √(marks / aspect)), so the
 * spacing between blocks is scaled the same way and the column stays a column at any size.
 */
const MARCH_REFERENCE_MARKS = 8;
/** A very large host makes a very long column, but not one that crosses a province. */
const MARCH_MAX_STRETCH = 5;

export function marchPlanFacing(
  radians: number,
  rankPerFile: number,
  marks = MARCH_REFERENCE_MARKS,
): Partial<Record<FormationKey, FormationTweak>> {
  // The plan's own blocks are filed south (`dy`), so the base heading is +y, not +x.
  const turn = radians - Math.PI / 2;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const stretch = Math.min(
    MARCH_MAX_STRETCH,
    Math.sqrt(Math.max(1, marks) / MARCH_REFERENCE_MARKS),
  );
  /**
   * Which way each block is laid out, as a function of the road's own angle.
   *
   * `cos(2θ)` is +1 due east or west, −1 due north or south, and 0 on all four diagonals — so
   * raising the plan's depth-wise aspect to `-cos(2θ)` gives the block laid along the road at the
   * axes and a square block on the diagonals, with no seam in between. Interpolating on `|cos θ|`
   * instead put the diagonals at 1.56 — wide blocks on the one heading that can least afford them,
   * which is why the diagonals were where this failed most.
   */
  const lay = -Math.cos(2 * radians);
  const out: Partial<Record<FormationKey, FormationTweak>> = {};
  for (const key of Object.keys(MARCH_PLAN) as FormationKey[]) {
    const tweak = MARCH_PLAN[key];
    if (!tweak) continue;
    const dx = (tweak.dx ?? 0) * stretch;
    const dy = (tweak.dy ?? 0) * stretch * rankPerFile;
    const deep = tweak.aspect ?? 0.5;
    out[key] = {
      ...tweak,
      aspect: Math.pow(deep, lay),
      dx: dx * cos - dy * sin,
      dy: (dx * sin + dy * cos) / rankPerFile,
    };
  }
  return out;
}

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
 * How hard one shape answers another, as a signed tier: the ring with its distances kept.
 *
 * `formationBeats` says every shape beats the two that follow it. This says the *near* one of the
 * two is the real answer: one step clockwise is a **strong** counter (±2, full tilt), two steps a
 * **soft** counter (±1, half tilt via `BATTLE_FORMATION_TILT_BLUNT`), the mirror is 0. Encoded so
 * that magnitude is strength — `tilt = (tier / 2) × size` — and `tier(a, b) === -tier(b, a)` by
 * construction.
 *
 * This gradient is what makes a wind clock bite at all: with both answers equal, denying a player
 * one of them meant they shrugged and took the other, and the second-best shape was never learned.
 */
export function formationTier(ours: BattleFormation, theirs: BattleFormation): number {
  const step = (ringIndex(theirs) - ringIndex(ours) + FORMATION_RING.length) % FORMATION_RING.length;
  if (step === 1) return 2;
  if (step === 2) return 1;
  if (step === 3) return -1;
  if (step === 4) return -2;
  return 0;
}

