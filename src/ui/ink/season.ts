/**
 * The four seasons, as pigment.
 *
 * `state.season` has driven the economy since the first build and been printed in the HUD, but until
 * now nothing on the map read it: deep winter and high summer were the same picture. This module is
 * the single source of that difference.
 *
 * The one rule it inherits from `palette.ts`: **no new hues.** Every value below is an existing
 * Đông Hồ pigment, or one of those pushed through `shadePigment`/`mutePigment`/`mixPigment`. In
 * particular no season spends sỏi son — the red belongs to the player alone, and a map that turns
 * red in autumn would take the focal point away from them.
 *
 * ## Why this is module-level state rather than a parameter
 *
 * The prop functions in `props.ts` are called from inside the scatter loop in `DongHoMapRenderer`,
 * several frames deep, and threading a palette through `tree`/`bamboo`/`banana`/`banyan`/`areca` and
 * every one of their callers would be a large diff that buys nothing. `getActiveMapTheme()` already
 * establishes the ambient-lookup idiom in this codebase; this follows it. The renderer sets the
 * season once at the top of a repaint and everything drawn under that call sees it.
 */
import type { Season } from '../../state/types';
import { PIGMENT, mutePigment, shadePigment } from './palette';

/** Blends two 0xRRGGBB pigments. `t = 0` is all `from`, `t = 1` is all `to`. */
export function mixPigment(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const mix = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * clamped);
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export interface SeasonPalette {
  /**
   * The season's light, laid over the whole world as one low-alpha rectangle.
   *
   * A wash rather than a tint because tinting can only multiply, and winter has to come out
   * *paler* than the paper it sits on.
   */
  wash: { colour: number; alpha: number };
  /** Replaces the fixed `GROUND` tone for planted ground. */
  ground: number;
  /** Ground tone for hills, fortress and shrine cells. */
  groundRelief: number;
  /** Replaces `PIGMENT.giDong` wherever a growing thing is drawn. */
  foliage: number;
  /** Replaces `PIGMENT.giDongPale`. */
  foliagePale: number;
  /** The crop standing in the paddy: young green, full green, ripe gold, or bare mud. */
  paddy: number;
  paddyAlpha: number;
  /**
   * Winter draws branches instead of crowns.
   *
   * This is the only seasonal property that changes *shape*, so it is the only one that cannot be
   * done outside the static terrain bake — which is why it, and not the season itself, is what the
   * bake signature keys on.
   */
  bareCanopy: boolean;
}

/**
 * The four palettes.
 *
 * Pitched to be read at a glance rather than to be tasteful in isolation. The map's baked ground is
 * fixed at the Spring baseline, so every other season has to be carried entirely by the live layers
 * painted over it — a difference that is merely tasteful at this size disappears completely, which
 * is exactly what the first pass of these numbers did.
 */
export const SEASON_PALETTES: Record<Season, SeasonPalette> = {
  /** Fresh growth on pale ground — the look the map shipped with, kept as the baseline. */
  Spring: {
    wash: { colour: PIGMENT.diepHi, alpha: 0.06 },
    ground: PIGMENT.giDongPale,
    groundRelief: PIGMENT.diepLo,
    foliage: PIGMENT.giDong,
    foliagePale: PIGMENT.giDongPale,
    paddy: PIGMENT.giDongPale,
    paddyAlpha: 0.5,
    bareCanopy: false,
  },
  /** Full canopy and standing water: the country at its greenest, under a warm light. */
  Summer: {
    // Verdigris rather than the warmer sophora, because the wash is what greens the open ground —
    // the per-cell tone that used to do it was too expensive to keep. See `SeasonRenderer`.
    wash: { colour: PIGMENT.giDong, alpha: 0.14 },
    ground: mixPigment(PIGMENT.giDongPale, PIGMENT.giDong, 0.62),
    groundRelief: mixPigment(PIGMENT.diepLo, PIGMENT.giDong, 0.3),
    foliage: shadePigment(PIGMENT.giDong, 0.86),
    foliagePale: PIGMENT.giDongPale,
    paddy: PIGMENT.giDong,
    paddyAlpha: 0.62,
    bareCanopy: false,
  },
  /** The harvest. Hoa hòe carries it — the paddy going gold is the clearest cue on the map. */
  Autumn: {
    wash: { colour: PIGMENT.hoe, alpha: 0.16 },
    ground: PIGMENT.hoePale,
    groundRelief: mixPigment(PIGMENT.diepLo, PIGMENT.hoe, 0.4),
    foliage: mixPigment(PIGMENT.giDong, PIGMENT.hoe, 0.6),
    foliagePale: PIGMENT.hoePale,
    paddy: PIGMENT.hoe,
    paddyAlpha: 0.7,
    bareCanopy: false,
  },
  /** Bare and cold: colour pulled out of the land, fields left as mud, the sheet gone pale. */
  Winter: {
    wash: { colour: PIGMENT.diepHi, alpha: 0.2 },
    ground: mixPigment(PIGMENT.diepLo, PIGMENT.mucFaint, 0.16),
    groundRelief: PIGMENT.diepDeep,
    foliage: mutePigment(PIGMENT.giDong, 0.62),
    foliagePale: mutePigment(PIGMENT.giDongPale, 0.62),
    paddy: PIGMENT.diepDeep,
    paddyAlpha: 0.5,
    bareCanopy: true,
  },
};

/** Interpolates two season palettes, for the cross-fade between one tick's season and the next. */
export function lerpSeasonPalette(from: SeasonPalette, to: SeasonPalette, t: number): SeasonPalette {
  const clamped = Math.max(0, Math.min(1, t));
  const blend = (a: number, b: number): number => a + (b - a) * clamped;
  return {
    wash: {
      colour: mixPigment(from.wash.colour, to.wash.colour, clamped),
      alpha: blend(from.wash.alpha, to.wash.alpha),
    },
    ground: mixPigment(from.ground, to.ground, clamped),
    groundRelief: mixPigment(from.groundRelief, to.groundRelief, clamped),
    foliage: mixPigment(from.foliage, to.foliage, clamped),
    foliagePale: mixPigment(from.foliagePale, to.foliagePale, clamped),
    paddy: mixPigment(from.paddy, to.paddy, clamped),
    paddyAlpha: blend(from.paddyAlpha, to.paddyAlpha),
    // Shape cannot be half-drawn: it flips at the midpoint, hidden under the wash cross-fade.
    bareCanopy: clamped < 0.5 ? from.bareCanopy : to.bareCanopy,
  };
}

const SEASON_ORDER: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

/**
 * The season the map's *baked* layers are painted in — always, regardless of the date in play.
 *
 * The static terrain bake costs about 1.5 s to rebuild on a mid-tier device
 * (`test_scripts/measure-season-bake.mjs`), and the season turns every 3.5–5.5 s, so the map can
 * never re-bake to follow the calendar. Two consequences, and the second is the reason this constant
 * exists rather than the scene simply passing `state.season`:
 *
 *  1. everything seasonal on the map is drawn live above the bake, by `SeasonRenderer`; and
 *  2. the bake must be pinned to one fixed season, because otherwise whatever season happened to be
 *     current at the last *ownership* change — the thing that does trigger a re-bake — would stay
 *     painted into the ground for months of game time, leaving gold autumn canopy under a winter sky.
 *
 * The menu diorama has no such constraint: it is drawn once per launch and never re-baked, so it
 * uses the real season and shows the full seasonal treatment of the props.
 */
export const BAKE_SEASON: Season = 'Spring';

let renderSeason: Season = BAKE_SEASON;

/**
 * Sets the season everything drawn from here on will be painted in.
 *
 * Called at the top of a repaint, not per prop. Anything baked while this is set keeps that season
 * until the layer is redrawn.
 */
export function setRenderSeason(season: Season): void {
  renderSeason = season;
}

export function getRenderSeason(): Season {
  return renderSeason;
}

/** The palette every prop and ground tone reads. */
export function seasonPalette(): SeasonPalette {
  return SEASON_PALETTES[renderSeason];
}

/**
 * True unless the run asked for the seasonal layers to be left off.
 *
 * Matches the `?nobake=1` / `?nofx=1` escape hatches the map already honours, and exists for the
 * same reason: so a perf run can measure the map with and without this pass and attribute the
 * difference to it rather than to six weeks of unrelated change.
 */
export function seasonVisualsEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return !/[?&]noseason=1\b/.test(window.location.search);
}

/**
 * Where each paddy plot stands in its cycle, this season.
 *
 * `drawFieldPlot` already draws five stages — flooded, fallow, transplanted, ripe, nursery — chosen
 * by a per-plot number, precisely so that a delta reads as a patchwork of fields out of step with
 * each other rather than as one flat colour. The season should not flatten that; it should change
 * *which* stages dominate. So rather than overriding the colour, each season names the handful of
 * stages its fields stand at, and a plot's own number picks one.
 *
 * Values index the bands in `drawFieldPlot`: <0.28 flooded, <0.4 fallow, <0.68 transplanted,
 * <0.9 ripe, else nursery.
 */
const STAGE_MIX: Record<Season, number[]> = {
  // The water goes on and the seedlings go out: flooded plots, a nursery bed, the first rows.
  Spring: [0.14, 0.14, 0.5, 0.95, 0.33],
  // Everything standing green, with one plot still under water.
  Summer: [0.5, 0.55, 0.5, 0.6, 0.2],
  // The harvest — gold dominates, with one field late and one already cut.
  Autumn: [0.78, 0.8, 0.78, 0.5, 0.33],
  // Cut and turned over: bare mud, one plot flooded again, one still standing.
  Winter: [0.33, 0.35, 0.33, 0.14, 0.78],
};

export function seasonalStage(stage: number): number {
  const mix = STAGE_MIX[renderSeason];
  const slot = Math.min(mix.length - 1, Math.floor(stage * mix.length));
  // A little spread inside the chosen band, so neighbouring plots of the same stage still differ.
  const within = stage * mix.length - slot;
  return Math.max(0, Math.min(0.999, mix[slot] + (within - 0.5) * 0.05));
}

/**
 * The season a title screen should wear.
 *
 * The menu has no `GameState` to read, so it borrows the player's own calendar: opening the game in
 * November should show a November country. Northern-hemisphere months, matching the Red River delta
 * the map is drawn from.
 */
export function seasonForDate(date = new Date()): Season {
  return SEASON_ORDER[Math.floor((((date.getMonth() - 2) % 12) + 12) % 12 / 3)];
}
