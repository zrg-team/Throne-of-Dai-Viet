/**
 * The quality ladder's rungs: every coherent step between "all of it" and "keeps running".
 *
 * A rung is not a tier. The three player-facing tiers are promises about how the game LOOKS; the
 * rungs are the intermediate positions the ladder may stand on while keeping a device at frame
 * rate, ordered so that each step down buys real frame time and drops the least-missed thing
 * first: the paper sheet, then buffer resolution, then — only at the floor — the 60 fps target
 * itself, because a locked 30 reads better than a lurching 45.
 *
 * Pure data, no Phaser import: the sampler (qualityLadder.ts) owns the machinery.
 */
import type { GraphicsQuality } from './graphicsQuality';

export type RungId = 'high' | 'medium' | 'medium-lite' | 'low' | 'low-30';

export interface Rung {
  id: RungId;
  /** Drawing-buffer multiplier (capped by the device ratio downstream). */
  scale: 1 | 2 | 3;
  /** Whether the paper sheet shows. */
  paper: boolean;
  /** Resolution of the two world RenderTextures, in texels per design unit (device-capped). */
  bakeScale: number;
  /** Whether settlement ink renders live (vector-crisp) instead of baked. */
  liveSettlementInk: boolean;
  /** Multiplier on landscape scatter counts. */
  scatter: number;
  /** Below this map zoom the small live detail drops; undefined keeps it all. */
  lodZoomBelow?: number;
  lodDropsLabels: boolean;
  /** The pacing target while on this rung. */
  fps: 30 | 60;
}

/** Top to bottom — index + 1 is one step down. */
export const RUNGS: Rung[] = [
  { id: 'high', scale: 3, paper: true, bakeScale: 2, liveSettlementInk: true, scatter: 1.25, lodDropsLabels: false, fps: 60 },
  { id: 'medium', scale: 2, paper: true, bakeScale: 1.25, liveSettlementInk: false, scatter: 1, lodZoomBelow: 0.85, lodDropsLabels: false, fps: 60 },
  // The first step down is now a real one. Its old job — dropping the paper sheet — went vacuous
  // the day the sheet stopped shipping by default, so this rung stood at medium's exact cost and
  // bought the ladder nothing. It gives back the dense bake instead: same buffer, 0.75 texels,
  // which is the old medium and still a coherent picture.
  { id: 'medium-lite', scale: 2, paper: false, bakeScale: 0.75, liveSettlementInk: false, scatter: 0.8, lodZoomBelow: 0.85, lodDropsLabels: false, fps: 60 },
  { id: 'low', scale: 1, paper: false, bakeScale: 0.5, liveSettlementInk: false, scatter: 0.6, lodZoomBelow: 0.85, lodDropsLabels: true, fps: 60 },
  { id: 'low-30', scale: 1, paper: false, bakeScale: 0.5, liveSettlementInk: false, scatter: 0.6, lodZoomBelow: 0.85, lodDropsLabels: true, fps: 30 },
];

export const RUNG_STORAGE_KEY = 'mandate:graphics:rung:v1';

export function rungById(id: string | null | undefined): Rung | undefined {
  return RUNGS.find((rung) => rung.id === id);
}

/** The rung a player-facing tier stands on when nothing has forced it lower. */
export function rungForTier(tier: GraphicsQuality): Rung {
  return rungById(tier === 'high' ? 'high' : tier === 'medium' ? 'medium' : 'low') ?? RUNGS[0];
}

/**
 * Where a session starts, and how high the ladder may ever climb.
 *
 * An explicit player tier is a promise: start there, stay there — the ladder is pinned for the
 * whole session (see `QualityLadder.pinned`). Without one, the ceiling comes
 * from the device's own ratio (a dense screen may deserve `high`) but the ladder STARTS a step
 * conservative and climbs on evidence — a stutter on first launch loses more players than a
 * briefly-soft first minute. A persisted rung from an earlier session wins if it is not above
 * the ceiling: the device already taught us where it lives.
 */
export function startingRung(args: {
  explicitTier?: GraphicsQuality;
  defaultTier: GraphicsQuality;
  devicePixelRatio: number;
  persisted?: string | null;
}): { rung: Rung; ceiling: Rung } {
  if (args.explicitTier) {
    const chosen = rungForTier(args.explicitTier);
    return { rung: chosen, ceiling: chosen };
  }
  // No pixel-ratio promotion: a dense screen says nothing about the GPU behind it, and 'high'
  // now spends real VRAM (the dense bake) on top of fill rate. Default sessions cap at the
  // default tier; 'high' is only ever an explicit choice.
  const ceiling = rungForTier(args.defaultTier);
  const remembered = rungById(args.persisted);
  if (remembered && RUNGS.indexOf(remembered) >= RUNGS.indexOf(ceiling)) {
    return { rung: remembered, ceiling };
  }
  // Start AT the ceiling. A conservative step below was tried first and read as a regression:
  // every healthy device's first session was softer than the game had ever been, to spare the
  // rare weak one a minute of stutter the ladder exists to catch anyway.
  return { rung: ceiling, ceiling };
}
