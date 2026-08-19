import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { inkPath, mulberry32, printedShape, type Pt } from './stroke';
import { UNIT, unitScale } from './proportion';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { Army, GameState } from '../../state/types';

/**
 * Đông Sơn bronze — the narrator's register, kept deliberately distinct from the world's.
 *
 * The rule that resolves the anachronism: **drum in the chrome, dynasty in the world.** The Ngọc Lũ
 * drum is 2,500 years old and predates every dynasty in the game by fifteen centuries, so using it
 * as world decoration would simply be wrong. But the game's frame is a modern retelling, and the
 * frame is allowed to speak in the oldest Vietnamese visual language there is.
 *
 * Also here: the host, whose block is sized by the number of men in it, and the seal, which carries
 * a **drawn device** and never a written character — the game ships in English and quốc ngữ, and a
 * Hán glyph is decoration pretending to be information.
 */

type G = Phaser.GameObjects.Graphics;

// ── the host ──────────────────────────────────────────────────────────────────

/** One drawn figure stands for about this many men. Nobody counts them; the eye compares blocks. */
export const MEN_PER_MARK = 55;
/** Past this, density stops adding information and starts costing frames — ranks deepen instead. */
export const HOST_MARK_CAP = 420;

/**
 * Ground between one man and the next, along the file and back through the ranks.
 *
 * **These carry `UNIT.figure`, and that is the whole point of them existing as named constants.**
 * The living exaggeration was applied inside `figure()` and nowhere else, while the spacing stayed
 * on the raw caller scale — so when people were made 1.8x life size the ranks did not open up to
 * make room. Each man ended up 2.4 rank-pitches tall with a spear 2.9 files long, and a host read as
 * a smudge of overlapping strokes rather than as a block of soldiers. That was the "army renders
 * badly" complaint, in one missing multiplication.
 *
 * Files are wider than ranks are deep, so a host is wider than it is deep the way one on the march
 * is. The rank shear is what stops the block reading as a grid.
 */
const FILE_PITCH = 4.6 * UNIT.figure;
const RANK_PITCH = 4.0 * UNIT.figure;
const RANK_SHEAR = 1.2 * UNIT.figure;

export interface HostShape {
  marks: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
}

/**
 * The block's AREA tracks the count, so a nine-thousand-man army is visibly a different object from
 * a two-thousand-man one without anybody reading a label. Formation is wider than deep, the way a
 * host on the march actually is.
 */
export function hostShape(men: number, markSpacing = FILE_PITCH, rankSpacing = RANK_PITCH): HostShape {
  const marks = Math.max(4, Math.min(HOST_MARK_CAP, Math.round(men / MEN_PER_MARK)));
  const cols = Math.max(3, Math.round(Math.sqrt(marks * 2.6)));
  const rows = Math.ceil(marks / cols);
  return { marks, cols, rows, width: cols * markSpacing, height: rows * rankSpacing };
}

/**
 * The block a host of this many men fills at drawing scale `s` — the shape `drawHost` will produce.
 *
 * Callers want this rather than `hostShape` directly: it is the only place that knows the pitch is
 * `FILE_PITCH`/`RANK_PITCH` and not some other pair of numbers. A caller that spells the
 * multiplication out itself is a caller that will still be spelling out the old one after the
 * spacing changes, which is precisely how the marker, its shadow and its standard came to disagree.
 */
export function hostShapeAt(men: number, s = 1): HostShape {
  return hostShape(men, FILE_PITCH * s, RANK_PITCH * s);
}

/**
 * One soldier: a body, a nón, and usually a spear. Five marks of information.
 *
 * Drawn through `inkPath` like every other living thing on the map. It used to be the sole
 * exception — a ruled `lineBetween`, a `fillCircle` and a second ruled line — while the farmer
 * standing forty pixels away went through the full two-pass soaked-underlay treatment. At a
 * distance that difference reads exactly as the complaint it drew: the villagers look printed and
 * the army looks like tally marks someone left on the paper.
 *
 * Kept to five strokes, because this runs up to `HOST_MARK_CAP` times per host and several hosts
 * can be on screen. The cost is paid once when the marker is built, not per frame — each rank is
 * its own `Graphics` that is tweened rather than redrawn.
 */
export type FigureEra = 'ly' | 'tran' | 'le' | 'nguyen';
/** levy → trained → royal guard, straight off `army.elite`. */
export type FigureTier = 0 | 1 | 2;
export type FigureArm = 'spear' | 'bow' | 'heavy';

/**
 * What a soldier is wearing and carrying. Everything optional: a caller that passes nothing gets
 * the old silhouette, so this stayed additive across forty-odd call sites.
 */
export interface FigureKit {
  era?: FigureEra;
  tier?: FigureTier;
  arm?: FigureArm;
  /** The realm's colour, for the sash. The player's is sỏi son; a rival's is muted. */
  accent?: number;
}

/**
 * One soldier: five slots, and every one of them is doing a job.
 *
 * The old figure was a body, a nón and a spear — a generic pikeman that would suit any army in
 * any century. Đạt H. Võ's *Timeline of Vietnamese army costume* separates eight periods with no
 * text on the figures at all, and the way it does that is the design here: **headwear carries
 * most of the identification, the chest carries the rank, one accent carries the realm.**
 *
 *   1. crown  — the era. The most identifying mark, so it is the one that never drops at any zoom.
 *   2. chest  — the tier. Nothing, a mirror plate, or a plate with shoulder pieces.
 *   3. sash   — the realm. One diagonal stroke; the only place the scarcity law touches a soldier.
 *   4. arm    — the weapon, as a silhouette. The angle reads where a shape would not.
 *   5. ground — bare feet, or boots. Small, but it is what makes a levy read as farmers.
 *
 * The crowns come from the written record as much as the reference: the mirror plate on the chest
 * is the commonest armour found in northern Việt Nam, the Trần officer's round disc is in both the
 * timeline and the texts, and a levy has none of it because *ngụ binh ư nông* turned farmers out
 * and sent them home again.
 *
 * Still drawn through `inkPath` like every other living thing on the map, and still counted: this
 * runs up to `HOST_MARK_CAP` times per host and several hosts can be on screen, so the budget went
 * from five marks to eight and not one further.
 */
export function figure(g: G, x: number, y: number, scale: number, colour: number, kit: FigureKit | boolean = {}): void {
  const s = unitScale('figure', scale);
  const seed = Math.round(x * 31 + y * 17);
  const ink = { colour, wobble: 0.16 * s, step: 2.2 };
  // A bare boolean is the old sixth argument — "does this one carry a spear".
  const spec: FigureKit = typeof kit === 'boolean' ? { arm: kit ? 'spear' : undefined } : kit;
  const era = spec.era ?? 'le';
  const tier = spec.tier ?? 1;

  // Body: hem to shoulder. Slightly off vertical, so a rank is people standing rather than a comb.
  const lean = ((seed % 7) - 3) * 0.055 * s;
  const cx = x + lean;
  // Thinner than it looks. `inkPath` lays a soaked underlay at 2.6x the stated width, so 0.85
  // painted 2.2 units across a figure 1.9 wide — every mark merged into one blob and the crowns,
  // which are the whole point of the wardrobe, were lost inside it.
  inkPath(g, [{ x, y }, { x: cx, y: y - 3.0 * s }], seed, { width: 0.52 * s, alpha: 0.85, ...ink });
  // Shoulders — the one mark that separates a man from a stick at this size.
  inkPath(
    g,
    [{ x: cx - 0.95 * s, y: y - 2.85 * s }, { x: cx + 0.95 * s, y: y - 3.05 * s }],
    seed + 1,
    { width: 0.4 * s, alpha: 0.66, ...ink },
  );

  // ── 2. chest ──────────────────────────────────────────────────────────────
  // Hộ tâm kính, the mirror plate: one square over the heart, and the commonest armour the
  // northern record knows. A single fill, and the silhouette stops being generic.
  if (tier >= 1) {
    g.fillStyle(PIGMENT.horn, 0.85);
    if (era === 'tran') g.fillCircle(cx, y - 2.4 * s, 0.46 * s);
    else g.fillRect(cx - 0.42 * s, y - 2.75 * s, 0.84 * s, 0.8 * s);
  }
  // Shoulder pieces, for the guard only.
  if (tier >= 2) {
    inkPath(
      g,
      [{ x: cx - 1.05 * s, y: y - 2.95 * s }, { x: cx - 1.2 * s, y: y - 2.5 * s }],
      seed + 7,
      { width: 0.4 * s, alpha: 0.55, ...ink },
    );
  }

  // ── 3. sash ───────────────────────────────────────────────────────────────
  if (spec.accent !== undefined) {
    inkPath(
      g,
      [{ x: cx - 0.8 * s, y: y - 1.6 * s }, { x: cx + 0.8 * s, y: y - 2.2 * s }],
      seed + 8,
      { width: 0.3 * s, alpha: 0.9, colour: spec.accent, wobble: 0.08 * s, step: 2.2 },
    );
  }

  // Head, then the crown over it.
  //
  // Bigger than it was, and the crown now sits *above* it rather than through it. The old brow
  // line ran at -3.75 while the head reached -4.27, so every hat was drawn inside the skull and
  // the two smeared together. A hat has to have air under it to be a hat.
  g.fillStyle(colour, 0.85);
  g.fillCircle(cx, y - 3.72 * s, 0.72 * s);

  // ── 1. crown ──────────────────────────────────────────────────────────────
  const brow = y - 4.4 * s;
  if (tier === 0) {
    // A levy is bare-headed: a topknot under the Lý and Trần, a bun under the Nguyễn. Farmers
    // turned out of the fields, which is exactly what `raiseGarrisonLevy` musters.
    g.fillStyle(colour, 0.8);
    g.fillCircle(cx, y - 4.72 * s, era === 'nguyen' ? 0.44 * s : 0.32 * s);
  } else if (era === 'nguyen') {
    // Nón dấu: a shallow, wide cone with a spike at the crown.
    inkPath(g, [{ x: cx - 1.3 * s, y: brow }, { x: cx, y: y - 5.45 * s }, { x: cx + 1.3 * s, y: brow }],
      seed + 2, { width: 0.38 * s, alpha: 0.85, ...ink });
    inkPath(g, [{ x: cx, y: y - 5.45 * s }, { x: cx, y: y - 5.95 * s }], seed + 3,
      { width: 0.26 * s, alpha: 0.8, ...ink });
  } else if (era === 'le') {
    // A brimmed dome: the helm gains a brim under the Later Lê.
    inkPath(g, [{ x: cx - 0.82 * s, y: brow }, { x: cx, y: y - 5.35 * s }, { x: cx + 0.82 * s, y: brow }],
      seed + 2, { width: 0.38 * s, alpha: 0.85, ...ink });
    inkPath(g, [{ x: cx - 1.4 * s, y: brow }, { x: cx + 1.4 * s, y: brow }], seed + 3,
      { width: 0.3 * s, alpha: 0.8, ...ink });
  } else {
    // Lý and Trần both wear a dome; the Lý officer's sweeps a long crest back off it, and the
    // Trần's carries cheek flaps instead. Those two marks are the whole difference, and they are
    // enough — cover everything below the neck and the periods are still separable.
    inkPath(g, [{ x: cx - 0.9 * s, y: brow }, { x: cx, y: y - 5.3 * s }, { x: cx + 0.9 * s, y: brow }],
      seed + 2, { width: 0.38 * s, alpha: 0.85, ...ink });
    if (era === 'ly') {
      // The crest sweeps back and *up*, well clear of the dome, or it is just a thicker helmet.
      inkPath(g, [{ x: cx + 0.35 * s, y: y - 5.1 * s }, { x: cx + 1.5 * s, y: y - 6.0 * s }], seed + 3,
        { width: 0.28 * s, alpha: 0.8, ...ink });
    } else {
      // Cheek flaps hang below the brow on both sides — two short strokes, and the Trần helm is
      // not the Lý one.
      inkPath(g, [{ x: cx - 0.88 * s, y: brow }, { x: cx - 0.98 * s, y: y - 3.5 * s }], seed + 3,
        { width: 0.26 * s, alpha: 0.75, ...ink });
      inkPath(g, [{ x: cx + 0.88 * s, y: brow }, { x: cx + 0.98 * s, y: y - 3.5 * s }], seed + 9,
        { width: 0.26 * s, alpha: 0.75, ...ink });
    }
  }

  // ── 4. arm ────────────────────────────────────────────────────────────────
  const arm = spec.arm;
  if (arm === 'spear') {
    // Held upright and close in. The old spear ran 8.5 units — nearly three files — so every
    // soldier's weapon crossed the men beside him.
    inkPath(g, [{ x: cx + 1.15 * s, y: y - 0.7 * s }, { x: cx + 1.3 * s, y: y - 6.6 * s }], seed + 4,
      { width: 0.3 * s, alpha: 0.7, ...ink });
  } else if (arm === 'bow') {
    // A bow is a curve held out from the body — three points, because two is a stick.
    inkPath(
      g,
      [
        { x: cx + 1.1 * s, y: y - 3.5 * s },
        { x: cx + 1.6 * s, y: y - 2.3 * s },
        { x: cx + 1.1 * s, y: y - 1.1 * s },
      ],
      seed + 4,
      { width: 0.28 * s, alpha: 0.75, ...ink },
    );
  } else if (arm === 'heavy') {
    // Cái khiên: wood with a rattan-bound edge, lacquered black with a silver-foil inlay. A dark
    // disc and one pale dot, and the heavy arm has a read at eight pixels.
    g.fillStyle(colour, 0.62);
    g.fillCircle(cx - 1.15 * s, y - 2.1 * s, 0.6 * s);
    g.fillStyle(PIGMENT.horn, 0.7);
    g.fillCircle(cx - 1.15 * s, y - 2.1 * s, 0.18 * s);
    inkPath(g, [{ x: cx + 1.05 * s, y: y - 1.2 * s }, { x: cx + 1.2 * s, y: y - 5.4 * s }], seed + 4,
      { width: 0.34 * s, alpha: 0.7, ...ink });
  }

  // ── 5. ground ─────────────────────────────────────────────────────────────
  // Bare feet leave no mark; a guard's boots do. It is two fills, and it is what makes the levy
  // beside him read as men pulled off the fields.
  if (tier >= 2) {
    g.fillStyle(colour, 0.62);
    g.fillRect(cx - 0.75 * s, y - 0.28 * s, 0.6 * s, 0.32 * s);
    g.fillRect(cx + 0.18 * s, y - 0.28 * s, 0.6 * s, 0.32 * s);
  }
}

/**
 * What a whole host is wearing and carrying.
 *
 * `units` is the host's real composition, so the block draws the army the player actually
 * mustered: bring bowmen and the block fills with bows.
 */
export interface HostKit {
  era?: FigureEra;
  tier?: FigureTier;
  accent?: number;
  units?: { spearmen: number; archers: number; heavyInfantry: number };
  /** The old boolean, kept so callers that only ever said "spears or not" still work. */
  spear?: boolean;
}

/**
 * The dynasty a run is currently dressed in.
 *
 * `mandate.era` is the progression track; `FigureEra` is the wardrobe. Four to four, so this is a
 * lookup rather than a judgement — and it is the *only* place the mapping is written down, so the
 * citadel and the host can never end up in different centuries.
 *
 * Modes without a Mandate track sit in the Later Lê, which is where the citadel has been hard-coded
 * since it was written.
 */
export function figureEraFor(state: GameState): FigureEra {
  switch (state.mandate?.era) {
    case 'founding': return 'ly';
    case 'rivalry': return 'tran';
    case 'mandate': return 'nguyen';
    default: return 'le';
  }
}

/** What a host is wearing: its dynasty, its elite tier, its realm's colour, its real arms. */
export function hostKitFor(state: GameState, army: Army): HostKit {
  return {
    era: figureEraFor(state),
    // levy → trained → royal guard, straight off the tier the barracks and the era already set.
    tier: Math.max(0, Math.min(2, army.isLevy ? 0 : (army.elite ?? 0) + 1)) as 0 | 1 | 2,
    accent: army.kingdomId === PLAYER_KINGDOM_ID ? PIGMENT.son : PIGMENT.mucSoft,
    units: army.units,
  };
}

/**
 * Draws a host sized by `men`, anchored at its top-left. Returns the block it filled.
 *
 * `rankTarget` lets a caller collect each rank into its own object — which is what a host needs to
 * be able to move at all, since one `Graphics` holding the whole block can only ever stand still.
 * The figures, their jitter and their order are identical either way.
 */
export function drawHost(
  g: G,
  x: number,
  y: number,
  men: number,
  seed: number,
  colour: number,
  s = 1,
  spear: boolean | HostKit = true,
  rankTarget?: (rank: number) => G,
): HostShape {
  const rand = mulberry32(seed);
  const kit: HostKit = typeof spear === 'boolean' ? { spear } : spear;
  // Which arm each figure carries, drawn from the host's own composition rather than a die.
  //
  // It used to be `spear && rand() > 0.25` — three quarters of every host carried a spear no
  // matter what it was made of. So a bow-heavy host and a wall of spearmen drew identically, and
  // the composition the player chose at muster, and now reads on the Order of Battle, was the one
  // thing about an army the picture would not show.
  const mix = kit.units;
  const total = mix ? Math.max(1, mix.spearmen + mix.archers + mix.heavyInfantry) : 0;
  const bowShare = mix ? mix.archers / total : 0;
  const heavyShare = mix ? mix.heavyInfantry / total : 0;
  const armFor = (roll: number): FigureArm | undefined => {
    if (!mix) return kit.spear !== false && roll > 0.25 ? 'spear' : undefined;
    if (roll < bowShare) return 'bow';
    if (roll < bowShare + heavyShare) return 'heavy';
    // A quarter of the spearmen are drawn without one, so a block is not a picket fence.
    return roll > bowShare + heavyShare + (1 - bowShare - heavyShare) * 0.2 ? 'spear' : undefined;
  };
  const shape = hostShapeAt(men, s);
  let drawn = 0;
  for (let rank = 0; rank < shape.rows && drawn < shape.marks; rank += 1) {
    const target = rankTarget?.(rank) ?? g;
    for (let file = 0; file < shape.cols && drawn < shape.marks; file += 1) {
      figure(
        target,
        // Jitter scaled by `s` like everything else. It used to be absolute, so at the marker's
        // 0.82 it was a third of a file wide and at menu scale it was half of one — a formation
        // whose raggedness changed with how far away you were standing.
        x + file * FILE_PITCH * s + (rand() - 0.5) * 0.32 * FILE_PITCH * s + rank * RANK_SHEAR * s,
        y + rank * RANK_PITCH * s + (rand() - 0.5) * 0.3 * RANK_PITCH * s,
        s,
        colour,
        { era: kit.era, tier: kit.tier, accent: kit.accent, arm: armFor(rand()) },
      );
      drawn += 1;
    }
  }
  return shape;
}

/**
 * The ground a host stands on. Takes the **same `x, y` and `s` as the `drawHost` call it belongs
 * to** — one anchoring convention, because two is how the shadow drifted off the men twice.
 *
 * Computed from where the feet actually land, not from `shape.width/height`. Those are the block's
 * *pitch* (`cols × spacing`), which overshoots the outermost figure by a full spacing in each axis,
 * and `y` is the BACK rank — the front rank's feet are a spacing short of `y + height`. Sizing the
 * ellipse off them put it a spacing low and, once an `x`-offset convention slipped, most of a block
 * to the left as well: a puddle beside the men rather than the ground under them.
 *
 * A round `groundShadow` cannot do this job at all — its height is tied to its width, and these
 * blocks are wide, shallow and sheared.
 */
export function hostFootprint(g: G, x: number, y: number, shape: HostShape, s = 1, alpha = 0.07): void {
  const { spanX, spanY } = hostSpan(shape, s);
  g.fillStyle(PIGMENT.muc, alpha);
  g.fillEllipse(x + spanX / 2, y + spanY / 2 + 1.1 * s, spanX + 9 * s, spanY + 6 * s);
}

/**
 * The ground the men's feet actually cover, measured from the same anchor `drawHost` is given.
 *
 * Deliberately **not** `shape.width`/`shape.height`: those are the block's *pitch*, `cols × spacing`,
 * which overshoots the outermost figure by a full spacing on each axis. Sizing anything off them
 * puts it a spacing too low and too wide. The shadow learned this the hard way (see
 * `hostFootprint`'s history); the standard then made the identical mistake independently, planting
 * itself a constant ~9 px in front of the men and ~2 px outside the shadow's left edge, at every
 * army size. Exported so there is exactly one answer to "where is this host standing".
 */
export function hostSpan(shape: HostShape, s = 1): { spanX: number; spanY: number } {
  return {
    // The rank shear pushes each rank right, so the feet span wider than the files alone.
    spanX: (shape.cols - 1) * FILE_PITCH * s + (shape.rows - 1) * RANK_SHEAR * s,
    spanY: (shape.rows - 1) * RANK_PITCH * s,
  };
}

/**
 * The cadence of a standing host: each rank shifts on its own phase, front rank first, so the block
 * breathes instead of sitting there as a printed stamp.
 *
 * Per *rank* rather than per figure on purpose. A busy map carries dozens of these markers, and four
 * tweens per host instead of forty is the difference between free and a frame budget.
 */
export function marchInPlace(scene: Phaser.Scene, ranks: Phaser.GameObjects.Graphics[], s = 1): void {
  ranks.forEach((rank, index) => {
    scene.tweens.add({
      targets: rank,
      y: rank.y - 0.29 * RANK_PITCH * s,
      duration: 900 + index * 80,
      delay: index * 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  });
}

// ── seals ─────────────────────────────────────────────────────────────────────

export type SealMotif = 'star' | 'lotus' | 'bird' | 'stakes';

/**
 * A stamped seal. The device is drawn, never written: the drum sun, a lotus, a Lạc bird, or the
 * Bạch Đằng stakes. Slightly crooked, because a seal pressed by hand is.
 */
export function seal(g: G, x: number, y: number, size: number, motif: SealMotif = 'star'): void {
  const half = size / 2;
  const unit = size * 0.28;
  const rotate = -0.06;
  const at = (dx: number, dy: number): Pt => ({
    x: x + dx * Math.cos(rotate) - dy * Math.sin(rotate),
    y: y + dx * Math.sin(rotate) + dy * Math.cos(rotate),
  });

  g.fillStyle(PIGMENT.son, 0.9);
  g.fillPoints([at(-half, -half), at(half, -half), at(half, half), at(-half, half)], true);
  g.lineStyle(1.1, 0xfbf2df, 0.42);
  g.strokePoints(
    [at(-half + 2.5, -half + 2.5), at(half - 2.5, -half + 2.5), at(half - 2.5, half - 2.5), at(-half + 2.5, half - 2.5), at(-half + 2.5, -half + 2.5)],
    false,
    false,
  );

  g.lineStyle(Math.max(1, size * 0.055), 0xfbf2df, 0.95);
  if (motif === 'lotus') {
    for (let petal = -2; petal <= 2; petal += 1) {
      const angle = -Math.PI / 2 + petal * 0.52;
      g.strokePoints(
        [at(0, unit * 0.9), at(Math.cos(angle) * unit * 1.1, Math.sin(angle) * unit * 0.9), at(Math.cos(angle) * unit * 0.6, -unit * 0.9)],
        false,
        false,
      );
    }
  } else if (motif === 'stakes') {
    for (let stake = -2; stake <= 2; stake += 1) {
      g.strokePoints([at(stake * unit * 0.52, unit), at(stake * unit * 0.52 + (stake % 2 ? 1.5 : -1.5), -unit)], false, false);
    }
    g.lineStyle(Math.max(1, size * 0.045), 0xfbf2df, 0.6);
    g.strokePoints([at(-unit * 1.3, unit * 0.2), at(unit * 1.3, unit * 0.05)], false, false);
  } else if (motif === 'bird') {
    heron(g, x, y, size * 0.11, true, 0xfbf2df);
  } else {
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = (ray / 12) * Math.PI * 2;
      g.strokePoints(
        [at(Math.cos(angle) * unit * 0.32, Math.sin(angle) * unit * 0.32), at(Math.cos(angle) * unit * 1.15, Math.sin(angle) * unit * 1.15)],
        false,
        false,
      );
    }
    g.fillStyle(0xfbf2df, 0.95);
    g.fillCircle(x, y, unit * 0.3);
  }
}

// ── the drum, unrolled ────────────────────────────────────────────────────────

/**
 * Răng cưa — the sawtooth band. The commonest geometric register on a drum, and the one that still
 * reads at seven pixels tall. A Greek-key meander at that size renders, unmistakably, as the letter
 * P repeated ninety times; this does not.
 */
export function sawtoothBand(g: G, x: number, y: number, width: number, height: number, alpha = 0.42): void {
  g.lineStyle(0.75, PIGMENT.muc, alpha);
  g.lineBetween(x, y, x + width, y);
  g.lineBetween(x, y + height, x + width, y + height);
  const step = height * 1.05;
  g.lineStyle(0.75, PIGMENT.muc, alpha * 1.2);
  for (let index = 0; x + index * step < x + width - step; index += 1) {
    const px = x + 1 + index * step;
    g.strokePoints(
      [
        { x: px, y: y + height - 0.5 },
        { x: px + step * 0.5, y: y + 0.5 },
        { x: px + step, y: y + height - 0.5 },
      ],
      false,
      false,
    );
  }
}

/**
 * Chim Lạc — the long-billed water bird of the tympanum. At meter size the bill is the only
 * recognisable part, so it gets 40% of the length.
 */
export function heron(g: G, x: number, y: number, s: number, filled: boolean, colour: number = PIGMENT.muc): void {
  const points: Pt[] = [
    { x: x - 10.5 * s, y: y - 0.2 * s }, { x: x - 4.0 * s, y: y - 1.6 * s }, { x: x - 2.0 * s, y: y - 2.4 * s },
    { x: x + 1.2 * s, y: y - 2.0 * s }, { x: x + 4.0 * s, y: y - 5.0 * s }, { x: x + 7.4 * s, y: y - 4.2 * s },
    { x: x + 6.0 * s, y: y - 1.6 * s }, { x: x + 10.6 * s, y: y - 2.4 * s }, { x: x + 10.2 * s, y: y + 0.6 * s },
    { x: x + 5.6 * s, y: y + 1.6 * s }, { x: x + 6.2 * s, y: y + 4.6 * s }, { x: x + 4.8 * s, y: y + 4.4 * s },
    { x: x + 3.4 * s, y: y + 1.8 * s }, { x: x - 2.6 * s, y: y + 1.0 * s }, { x: x - 4.4 * s, y: y - 0.2 * s },
  ];
  if (filled) {
    g.fillStyle(colour, 0.8);
    g.fillPoints(points, true);
  }
  inkPath(g, points, 5, {
    width: 0.55 * Math.max(1, s * 0.5), alpha: filled ? 0.6 : 0.3, colour, wobble: 0.15, step: 3.5, closed: true,
  });
}

/**
 * The wave meter: herons ink in as the wave approaches. A bar chart from 500 BCE.
 *
 * Many small birds, not few large ones — at frieze density the eye reads the rhythm and supplies
 * the bird, exactly as it does on the drum itself. The opposite instinct produces a row of blobs.
 */
export function heronMeter(
  g: G,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  onDark = false,
): void {
  // On paper the birds are ink on a pale plate; on the dark chrome band the plate would read as a
  // grey placeholder, so there the birds are light and the ground is left alone.
  const flown = onDark ? PIGMENT.hoePale : PIGMENT.muc;
  const waiting = onDark ? PIGMENT.mucFaint : PIGMENT.muc;
  if (!onDark) {
    printedShape(
      g,
      [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
      PIGMENT.diepLo, 904, { width: 0.8, alpha: 0.45, wobble: 0.3, step: 9, fillAlpha: 0.4 },
    );
  } else {
    g.lineStyle(0.8, PIGMENT.mucFaint, 0.35);
    g.lineBetween(x, y + height, x + width, y + height);
  }
  const count = Math.max(8, Math.round(width / (height * 1.05)));
  const gap = (width - height * 0.7) / count;
  for (let index = 0; index < count; index += 1) {
    const done = index / count < progress;
    heron(g, x + height * 0.6 + index * gap, y + height * 0.5, height * 0.05, done, done ? flown : waiting);
  }
}

/** A cleared plate of paper for text to sit on. Type never sits on hatching. */
export function clearPlate(g: G, x: number, y: number, width: number, height: number, seed: number): void {
  const points: Pt[] = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  g.fillStyle(PIGMENT.diepHi, 0.88);
  g.fillPoints(points, true);
  inkPath(g, points, seed, { width: 0.9, alpha: 0.4, wobble: 0.5, step: 12, closed: true });
}
