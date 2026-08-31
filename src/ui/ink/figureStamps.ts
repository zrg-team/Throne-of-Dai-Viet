/**
 * Soldiers as stamps.
 *
 * A host marker is dozens of `figure()` calls — each one ~150 ink-path segments that Phaser 4
 * re-triangulates every frame for as long as the marker stands. The frame ledger measured the
 * revealed map dropping from 41 ms to 8.5 ms at 4× throttle with the world's live ink hidden, and
 * hosts are the largest single share of that ink. So a soldier is baked once per *kind* — wardrobe,
 * rank, weapon, colour — and placed as an image per man.
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
import { placeStamp, stamp, type Stamp, type StampBox } from './stamp';
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
export function figureStamp(scene: Phaser.Scene, kind: FigureKind): Stamp {
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
  const generated = conquestArtStamp(
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
  image: Phaser.GameObjects.Image,
  kind: Pick<FigureKind, 'theme' | 'tier' | 'arm'>,
  direction: NativeFacing,
): Phaser.GameObjects.Image {
  const assetId = figureAssetId(kind);
  const nativeFacing = conquestArtAsset(assetId)?.nativeFacing ?? 1;
  image.setData(NATIVE_FACING_KEY, nativeFacing);
  image.setData('conquestFigureAssetId', assetId);
  image.setData('conquestFigureDirection', direction);
  faceTravel(image, direction);
  return image;
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
  /** One layer per rank — the same layers `marchInPlace` breathes. */
  ranks: Phaser.GameObjects.Container[];
  shape: ArmyShape;
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
   * angle `MARCH_PLAN` files its blocks along, so the men and the column agree.
   *
   * Per figure rather than by mirroring the marker: flipping the container would mirror the
   * formation too, and a screen thrown forward would end up behind the line.
   */
  const facing: NativeFacing = kit.marching && Math.cos(kit.marchHeading ?? 0) < 0 ? -1 : 1;

  const perRank: Phaser.GameObjects.Image[][] = [];
  plan.figures.forEach((man, index) => {
    const kind: FigureKind = {
      theme, tier, arm: man.arm, colour, accent: kit.accent,
      variant: (seed + index) % FIGURE_VARIANTS, bucket,
    };
    const st = figureStamp(scene, kind);
    const image = faceStampedFigure(placeStamp(scene, st, man.x, man.y, placeScale), kind, facing);
    while (perRank.length <= man.rank) perRank.push([]);
    perRank[man.rank].push(image);
  });

  for (const images of perRank) {
    const rank = scene.add.container(0, 0);
    // Within a rank, neighbours barely overlap — grouping by texture keeps a whole rank in one
    // draw-call batch under the canvas backend instead of flushing per soldier.
    images.sort((a, b) => (a.texture.key < b.texture.key ? -1 : a.texture.key > b.texture.key ? 1 : 0));
    for (const image of images) rank.add(image);
    ranks.push(rank);
    container.add(rank);
  }

  return { container, ranks, shape: plan.shape };
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
