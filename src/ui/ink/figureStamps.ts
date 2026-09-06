/**
 * Soldiers as articulated stamps.
 *
 * A host marker is dozens of `figure()` calls — each one ~150 ink-path segments that Phaser 4
 * re-triangulates every frame for as long as the marker stands. The frame ledger measured the
 * revealed map dropping from 41 ms to 8.5 ms at 4× throttle with the world's live ink hidden, and
 * hosts are the largest single share of that ink. So a soldier is baked once per *kind* — wardrobe,
 * rank, weapon, colour — and placed as overlapping torso/limb crops per man. All crops share that
 * one reviewed texture; only their transforms change for the four contact/passing frames.
 *
 * **Variants.** A rank of forty identical stamps reads as a rubber stamp, which the hand-drawn
 * look exists to avoid. Three seeded drawings per kind (`FigureKit.seed` pins the wobble that
 * `figure()` otherwise derives from x, y) plus the per-man position jitter `planArmy` keeps is
 * enough that no two neighbours match; more variants would cost texture memory and batch flushes
 * for a difference nobody can see — the same trade the buffalo herd settled on four looks.
 *
 * **Buckets.** Mipmaps are unavailable for NPOT textures, so one raster cannot serve both the map
 * (figures at `GROUND_SCALE` 0.72) and the battlefield (`BATTLE_HOST_SCALE` 2.2) without one of
 * them sampling badly. Two canonical rasters — 'm' and 'f' — and each caller takes the one its
 * own scale rounds to.
 */
import type Phaser from 'phaser';
import { BATTLE_HOST_SCALE } from '../../game/ascentConfig';
import {
  DOC_UNIT, planArmy, type ArmyShape, type FigureArm, type FigureTheme, type FigureTier,
  type HostKit,
} from './devices';
import { unitScale } from './proportion';
import { BASE_SCALE_KEY, placeStamp, stamp, type Stamp, type StampBox } from './stamp';
import { GROUND_SCALE } from './proportion';
import { conquestArtAsset, conquestArtStamp } from '../conquestMapArt';
import { faceTravel, NATIVE_FACING_KEY, type NativeFacing } from './life';

/** The two canonical rasters: map ground scale, battlefield host scale. */
export type FigureBucket = 'm' | 'f';

const BUCKET_SCALE: Record<FigureBucket, number> = { m: GROUND_SCALE, f: BATTLE_HOST_SCALE };

/** Which bucket a caller's drawing scale belongs to. */
export function bucketFor(callerScale: number): FigureBucket {
  return callerScale >= 1.4 ? 'f' : 'm';
}

/**
 * The `placeStamp` scale that draws a figure at the size `figure()` would have drawn it.
 *
 * A stamp is rasterised at its bucket's scale, so placing one at the size the caller wanted means
 * dividing by that bucket — algebra every caller was retyping, and retyping *wrong* the moment its
 * own scale fell in the other bucket: `BattleArenaScene` divides by `BATTLE_HOST_SCALE` literally,
 * which is only right because its preview happens to sit above the 1.4 line.
 */
export function figurePlaceScale(wanted: number): number {
  return wanted / BUCKET_SCALE[bucketFor(wanted)];
}

export const FIGURE_VARIANTS = 3;
/** Arbitrary primes: three distinct wobble streams per kind, stable across runs. */
const VARIANT_SEEDS = [101, 211, 307];

/**
 * How far a figure's ink reaches around its anchor (the feet), in the document's units — read off
 * the drawings and held to by `diag-figure-reach`: a raised spear tops out near 60 above the feet,
 * a mounted man's standard higher still, and the horse's muzzle leads the box to the right.
 */
export const FIGURE_REACH: Record<'foot' | 'mounted', StampBox> = {
  foot: { left: -24, right: 24, top: -68, bottom: 6 },
  mounted: { left: -28, right: 34, top: -79, bottom: 5 },
};

export interface FigureKind {
  theme: FigureTheme;
  tier: FigureTier;
  arm?: FigureArm;
  colour: number;
  accent?: number;
  variant: number;
  bucket: FigureBucket;
}

/** One texture per (wardrobe, rank, weapon, colour, accent, variant, raster). */
export function figureKindKey(kind: FigureKind): string {
  return `fig:${kind.theme}:${kind.tier}:${kind.arm ?? 'x'}:${kind.colour.toString(16)}`
    + `:${kind.accent === undefined ? 'x' : kind.accent.toString(16)}:v${kind.variant}:${kind.bucket}`;
}

/** Bakes (or returns) the stamp for one kind of soldier. */
export function figureStamp(
  scene: Phaser.Scene,
  kind: FigureKind,
  opts: { procedural?: boolean } = {},
): Stamp {
  const s = BUCKET_SCALE[kind.bucket];
  // The document's units map onto design units through the same algebra `figure()` uses:
  // u = unitScale('figure', s) / DOC_UNIT.
  const u = unitScale('figure', s) / DOC_UNIT;
  const reach = FIGURE_REACH[kind.arm === 'mounted' ? 'mounted' : 'foot'];
  const box: StampBox = {
    left: reach.left * u, right: reach.right * u,
    top: reach.top * u, bottom: reach.bottom * u,
  };
  const tier = ['levy', 'trained', 'royal'][kind.tier];
  // `procedural` remains available when a caller has found an authored sheet unusable. The
  // Vietnamese royal sheets themselves are exported with transparent headroom, so callers can use
  // the reviewed art at both marker scale and the History page's much larger reference-plate scale.
  const generated = opts.procedural ? undefined : conquestArtStamp(
    scene,
    `figure.${kind.theme}.${tier}.${kind.arm ?? 'spear'}`,
    box,
  );
  if (generated) return generated;
  return stamp(scene, figureKindKey(kind), box, (g, x, y, raster) => {
    // Deferred import shape: figure() lives in devices.ts, which imports nothing from here.
    drawFigure(g, x, y, s * raster, kind);
  }, { raster: 'super', pool: 'figure' });
}

function figureAssetId(kind: Pick<FigureKind, 'theme' | 'tier' | 'arm'>): string {
  const tier = ['levy', 'trained', 'royal'][kind.tier];
  return `figure.${kind.theme}.${tier}.${kind.arm ?? 'spear'}`;
}

/**
 * Normalises a stamped soldier to the direction the formation asks for.
 *
 * Generated sheets use viewer-right as their native pose. Keeping that fact on the image makes a
 * side change explicit instead of relying on whichever direction an individual source drawing
 * happened to use. It also leaves room for a future reviewed left-native asset without another
 * renderer special case.
 */
export function faceStampedFigure(
  image: Phaser.GameObjects.Image | Phaser.GameObjects.Container,
  kind: Pick<FigureKind, 'theme' | 'tier' | 'arm'>,
  direction: NativeFacing,
): typeof image {
  const assetId = figureAssetId(kind);
  const nativeFacing = conquestArtAsset(assetId)?.nativeFacing ?? 1;
  image.setData(NATIVE_FACING_KEY, nativeFacing);
  image.setData('conquestFigureAssetId', assetId);
  image.setData('conquestFigureDirection', direction);
  faceTravel(image, direction);
  return image;
}

/** Data key carried by every authored Conquest host and its articulated figures. */
export const CONQUEST_ARMY_FRAME_KEY = 'conquestArmyFrameAnimation';

type ArmyFrame = 0 | 1 | 2 | 3;

interface ArmyLimb {
  pivot: Phaser.GameObjects.Container;
  baseX: number;
  baseY: number;
  /** `-1` and `1` are the opposing feet; mounted figures also use the inner pair. */
  direction: number;
  liftPhase: ArmyFrame;
}

interface ArmyFigureFrameState {
  frame: ArmyFrame;
  phase: ArmyFrame;
  mounted: boolean;
  limbs: ArmyLimb[];
  upper: Phaser.GameObjects.Image;
}

export interface ConquestArmyFrameState {
  frame: ArmyFrame;
  duration: number;
  figures: ArmyFigureFrameState[];
  /** The four-frame clock, held so a caller can start it only while the host is travelling. */
  tween?: Phaser.Tweens.Tween;
}

interface LimbSlice {
  x: number;
  width: number;
  jointX: number;
  direction: number;
  liftPhase: ArmyFrame;
}

const FOOT_JOINT_Y = 84;
const FOOT_UPPER_BOTTOM = 92;
const MOUNTED_JOINT_Y = 97;
const MOUNTED_UPPER_BOTTOM = 103;

/**
 * Turns one accepted, still army PNG into a tiny articulated figure.
 *
 * The original art remains the source: the torso is one crop and the legs are overlapping crops
 * from the same texture, pivoted at their hips. The overlap is important — the torso covers each
 * cut line, so a moving leg never opens a transparent seam through a robe or horse belly. This
 * gives every wardrobe/tier/weapon real foot frames without recolouring or replacing its reviewed
 * Đông Hồ asset.
 */
function articulatedFigure(
  scene: Phaser.Scene,
  st: Stamp,
  x: number,
  y: number,
  placeScale: number,
  kind: Pick<FigureKind, 'theme' | 'tier' | 'arm'>,
  direction: NativeFacing,
  phase: ArmyFrame,
): { root: Phaser.GameObjects.Container; state: ArmyFigureFrameState; texture: string } {
  const mounted = kind.arm === 'mounted';
  const jointY = mounted ? MOUNTED_JOINT_Y : FOOT_JOINT_Y;
  const upperBottom = mounted ? MOUNTED_UPPER_BOTTOM : FOOT_UPPER_BOTTOM;
  const sourceScale = st.scale * placeScale;
  const sourceWidth = st.width;
  const sourceHeight = st.height;
  const slices: LimbSlice[] = mounted
    ? [
      { x: 0, width: 33, jointX: 25, direction: -1, liftPhase: 1 },
      { x: 33, width: 24, jointX: 42, direction: 1, liftPhase: 3 },
      { x: 57, width: 27, jointX: 75, direction: -1, liftPhase: 3 },
      { x: 84, width: sourceWidth - 84, jointX: 89, direction: 1, liftPhase: 1 },
    ]
    : [
      { x: 0, width: Math.floor(sourceWidth / 2), jointX: 51, direction: -1, liftPhase: 1 },
      {
        x: Math.floor(sourceWidth / 2), width: sourceWidth - Math.floor(sourceWidth / 2),
        jointX: 85, direction: 1, liftPhase: 3,
      },
    ];

  const root = scene.add.container(x, y)
    .setData(BASE_SCALE_KEY, 1)
    .setData('conquestFigureAssetId', figureAssetId(kind))
    .setData('conquestFigureDirection', direction);
  const limbs: ArmyLimb[] = [];

  // Limbs sit behind the overlapping upper crop. Each cropped image keeps the source texture's
  // coordinate system, while its container supplies the hip joint used by the four poses.
  for (const slice of slices) {
    const pivotX = (slice.jointX - st.originX * sourceWidth) * sourceScale;
    const pivotY = (jointY - st.originY * sourceHeight) * sourceScale;
    const pivot = scene.add.container(pivotX, pivotY);
    const image = scene.add.image(0, 0, st.texture, st.frame)
      .setOrigin(slice.jointX / sourceWidth, jointY / sourceHeight)
      .setScale(sourceScale)
      .setCrop(slice.x, jointY - 2, slice.width, sourceHeight - jointY + 2);
    pivot.add(image);
    root.add(pivot);
    limbs.push({
      pivot, baseX: pivotX, baseY: pivotY,
      direction: slice.direction, liftPhase: slice.liftPhase,
    });
  }

  const upper = placeStamp(scene, st, 0, 0, placeScale)
    .setCrop(0, 0, sourceWidth, Math.min(sourceHeight, upperBottom));
  root.add(upper);
  const state: ArmyFigureFrameState = { frame: 0, phase, mounted, limbs, upper };
  root.setData(CONQUEST_ARMY_FRAME_KEY, state);
  faceStampedFigure(root, kind, direction);
  applyArmyFigureFrame(state, phase);
  return { root, state, texture: st.texture };
}

/** Four discrete contact/passing poses. Feet move around a fixed hip; the host itself never hops. */
function applyArmyFigureFrame(state: ArmyFigureFrameState, frame: ArmyFrame): void {
  state.frame = frame;
  const passing = frame === 1 || frame === 3;
  const swing = frame === 0 ? 1 : frame === 2 ? -1 : 0;
  const angle = state.mounted ? 5.5 : 8;
  const lift = state.mounted ? 0.72 : 0.9;
  const reach = state.mounted ? 0.4 : 0.52;

  state.limbs.forEach((limb) => {
    limb.pivot.angle = swing * limb.direction * angle;
    const lifted = passing && frame === limb.liftPhase;
    limb.pivot.y = limb.baseY + (lifted ? -lift : 0);
    limb.pivot.x = limb.baseX + (lifted ? limb.direction * reach : 0);
  });
  // A restrained counter-shift belongs to the torso crop only. The feet remain planted and visibly
  // trade places; this is not the old whole-rank vertical bob.
  state.upper.y = passing ? (state.mounted ? 0.18 : 0.24) : 0;
  state.upper.angle = passing ? (frame === 1 ? -0.45 : 0.45) : 0;
}

function animateStampedArmy(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  figures: ArmyFigureFrameState[],
  bucket: FigureBucket,
  marching: boolean,
): ConquestArmyFrameState {
  const duration = bucket === 'f' ? 620 : marching ? 700 : 920;
  const state: ConquestArmyFrameState = { frame: 0, duration, figures };
  container.setData(CONQUEST_ARMY_FRAME_KEY, state);
  const clock = container as Phaser.GameObjects.Container & { conquestArmyFrameClock: number };
  clock.conquestArmyFrameClock = 0;
  let previous = -1;
  // **Created stopped.** This is a `repeat: -1` clock, and it used to start the moment a host was
  // drawn — so every garrison on the map, and both hosts on a paused battlefield, walked on the
  // spot for the whole game. Feet move when the host moves: `setConquestArmyStepping` is what
  // starts them, from the one place that knows whether this host is going anywhere.
  const tween = scene.tweens.add({
    targets: clock,
    conquestArmyFrameClock: 4,
    duration,
    repeat: -1,
    ease: 'Linear',
    paused: true,
    onUpdate: () => {
      const frame = (Math.floor(clock.conquestArmyFrameClock) % 4) as ArmyFrame;
      if (frame === previous) return;
      previous = frame;
      state.frame = frame;
      for (const figure of figures) {
        applyArmyFigureFrame(figure, ((frame + figure.phase) % 4) as ArmyFrame);
      }
    },
  });
  state.tween = tween;
  return state;
}

/**
 * Starts or stops a host's feet, wherever the frame state hangs in its tree.
 *
 * Callers hold a marker, not the inner container the state was set on, and the two differ between
 * the map and the battle screen — so this walks for it rather than making every call site know.
 * Stopping settles every figure back on frame zero, which is the standing pose the still art was
 * cut from: a host that halts mid-stride with one leg up is the same fault seen from the other end.
 */
export function setConquestArmyStepping(
  root: Phaser.GameObjects.GameObject,
  stepping: boolean,
): void {
  const holder = root as Phaser.GameObjects.GameObject & {
    getData?(key: string): unknown;
    list?: Phaser.GameObjects.GameObject[];
  };
  const state = holder.getData?.(CONQUEST_ARMY_FRAME_KEY) as ConquestArmyFrameState | undefined;
  if (state?.tween) {
    if (stepping) {
      state.tween.resume();
    } else {
      state.tween.pause();
      state.frame = 0;
      for (const figure of state.figures) {
        applyArmyFigureFrame(figure, (figure.phase % 4) as ArmyFrame);
      }
    }
  }
  if (holder.list) {
    for (const child of holder.list) setConquestArmyStepping(child, stepping);
  }
}

// A local indirection so the draw closure above stays readable; devices.figure's own signature.
import { figure } from './devices';
function drawFigure(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number, kind: FigureKind): void {
  figure(g, x, y, scale, kind.colour, {
    theme: kind.theme, tier: kind.tier, arm: kind.arm, accent: kind.accent,
    seed: VARIANT_SEEDS[kind.variant % FIGURE_VARIANTS],
  });
}

export interface StampedArmy {
  container: Phaser.GameObjects.Container;
  /** One layer per rank, retained for the procedural/stamp comparison and depth cleanup. */
  ranks: Phaser.GameObjects.Container[];
  shape: ArmyShape;
  /** Present for accepted authored figures; procedural rollback keeps the old rank cadence. */
  animation?: ConquestArmyFrameState;
}

/**
 * The stamped equivalent of `drawArmy` + per-rank layers: the exact placements `planArmy` walks,
 * each man an image of his kind's stamp. The caller owns positioning the container, exactly as it
 * owned positioning the Graphics before.
 */
export function stampedArmy(
  scene: Phaser.Scene,
  x: number,
  y: number,
  men: number,
  seed: number,
  colour: number,
  s: number,
  kit: HostKit = {},
  articulated = false,
): StampedArmy {
  const plan = planArmy(x, y, men, seed, s, kit);
  const bucket = bucketFor(s);
  const theme = kit.theme ?? kit.era ?? 'le';
  const tier = kit.tier ?? 1;
  const container = scene.add.container(0, 0);
  const ranks: Phaser.GameObjects.Container[] = [];
  const placeScale = s / BUCKET_SCALE[bucket];

  /**
   * **Which way the men are looking.**
   *
   * Every stamped soldier was placed facing viewer-right, whatever the host was doing. A column
   * marching west was therefore drawn walking backwards down its own road — half of all marches,
   * and the single most obviously wrong thing about a host in motion. A host at rest keeps the
   * native pose (there is nothing to face); a marching one turns with `marchHeading`, the same
   * angle `marchColumn` files its blocks along, so the men and the column agree.
   *
   * Per figure rather than by mirroring the marker: flipping the container would mirror the
   * formation too, and a screen thrown forward would end up behind the line.
   */
  const facing: NativeFacing = kit.marching && Math.cos(kit.marchHeading ?? 0) < 0 ? -1 : 1;

  const perRank: Array<Array<{ root: Phaser.GameObjects.GameObject; texture: string }>> = [];
  const figures: ArmyFigureFrameState[] = [];
  plan.figures.forEach((man, index) => {
    const kind: FigureKind = {
      theme, tier, arm: man.arm, colour, accent: kit.accent,
      variant: (seed + index) % FIGURE_VARIANTS, bucket,
    };
    const st = figureStamp(scene, kind);
    while (perRank.length <= man.rank) perRank.push([]);
    // Only the accepted assets share the reviewed 144×128 frame contract used by the limb cuts.
    // `?mapart=procedural` deliberately bypasses it; keep that rollback path as the former single
    // stamp and let `marchInPlace` animate its ranks instead of feeding arbitrary raster sizes into
    // authored-image crop coordinates.
    if (articulated && st.key === `generated:${figureAssetId(kind)}` && st.width >= 100 && st.height >= 100) {
      const articulated = articulatedFigure(
        scene, st, man.x, man.y, placeScale, kind, facing,
        ((seed + index + man.rank) % 4) as ArmyFrame,
      );
      perRank[man.rank].push({ root: articulated.root, texture: articulated.texture });
      figures.push(articulated.state);
    } else {
      const image = faceStampedFigure(
        placeStamp(scene, st, man.x, man.y, placeScale), kind, facing,
      );
      perRank[man.rank].push({ root: image, texture: st.texture });
    }
  });

  for (const figuresInRank of perRank) {
    const rank = scene.add.container(0, 0);
    // Within a rank, neighbours barely overlap — grouping by texture keeps a whole rank in one
    // draw-call batch under the canvas backend instead of flushing per soldier.
    figuresInRank.sort((a, b) => (a.texture < b.texture ? -1 : a.texture > b.texture ? 1 : 0));
    for (const figure of figuresInRank) rank.add(figure.root);
    ranks.push(rank);
    container.add(rank);
  }

  const animation = figures.length > 0
    ? animateStampedArmy(scene, container, figures, bucket, kit.marching === true)
    : undefined;
  return { container, ranks, shape: plan.shape, animation };
}

/**
 * Pre-bakes a wardrobe at a loading boundary, so no fight or map reveal pays the raster cost of
 * a first-seen kind under the player's finger.
 */
export function warmFigureStamps(
  scene: Phaser.Scene,
  kit: HostKit,
  colour: number,
  bucket: FigureBucket,
  arms: ReadonlyArray<FigureArm | undefined> = ['spear', 'sword', 'bow', 'mounted', 'skirmish'],
): void {
  const theme = kit.theme ?? kit.era ?? 'le';
  const tier = kit.tier ?? 1;
  for (const arm of arms) {
    for (let variant = 0; variant < FIGURE_VARIANTS; variant += 1) {
      void figureStamp(scene, { theme, tier, arm, colour, accent: kit.accent, variant, bucket });
    }
  }
}
