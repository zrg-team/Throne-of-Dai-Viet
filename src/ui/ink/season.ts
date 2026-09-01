/**
 * The four seasons, as pigment.
 *
 * `state.season` has driven the economy since the first build and been printed in the HUD. This
 * module is what makes the *picture* agree with it: spring in blossom, summer in full leaf, autumn
 * gold and half-bare, winter bare under snow.
 *
 * ## The two failures this file is written against
 *
 * 1. **The photo filter.** Painting a season as one coloured rectangle over the whole world shifted
 *    the paper, the ink, the roofs and the water together — the one thing a woodblock print never
 *    does. So only winter carries a wash, and only because winter genuinely is a change in the
 *    *light*. Every other season is stated by what grows: canopy, grass, blossom, litter, and a soft
 *    tone laid on the open ground *underneath* the ink rather than over the top of it.
 * 2. **Pinning everything to winter.** The fix for (1) was, for a while, to print the map in one
 *    fixed season. That traded a bad filter for a dead country: bare twigs in high summer. The
 *    seasons are back, and they now differ in *shape* — blossom, gold, bare limbs, snow caps — not
 *    only in hue, because a hue shift alone is what needed the filter to be legible.
 *
 * The rule inherited from `palette.ts` still holds: **no new hues.** Every value below is an
 * existing Đông Hồ pigment or one pushed through `shadePigment`/`mutePigment`/`mixPigment`. Spring's
 * blossom is the closest thing to an exception and is deliberately a *muted* sỏi son — a dusty
 * peach at a fifth of the banner's saturation, so the only true red on the sheet is still the
 * player's own.
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
import type { HexTerrainType } from '../../map/terrainTypes';
import { PIGMENT, mutePigment, shadePigment } from './palette';
import { seasonsEnabled } from '../../game/lifeSettings';

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

/**
 * How a deciduous crown is drawn this season.
 *
 * This — not the hue — is what makes the calendar legible at map zoom. Four greens taking turns on
 * the same scalloped stamp read as the sheet being re-lit; a crown that is *in blossom*, then full,
 * then gold with bare limbs showing through, then a line drawing of branches, reads as a year.
 */
export type CanopyLook = 'blossom' | 'leafed' | 'turning' | 'bare';

export interface SeasonPalette {
  /**
   * The season's light, laid over the whole world as one low-alpha rectangle.
   *
   * **Winter's alone.** The other three carry alpha 0 and paint nothing — see the header.
   *
   * A wash rather than a tint because tinting can only multiply, and winter has to come out
   * *paler* than the paper it sits on.
   */
  wash: { colour: number; alpha: number };
  /** The terrain fill under planted ground. Read at `BAKE_SEASON` only — see that constant. */
  ground: number;
  /** Terrain fill for hills, fortress and shrine cells. `BAKE_SEASON` only. */
  groundRelief: number;
  /**
   * A soft tone this season lays over open ground, inside the scenery bake.
   *
   * The one thing that turns the *soil* with the calendar without becoming the filter this art
   * direction threw out: it is drawn per cell into the decoration layer, under the props and above
   * the terrain fill, so the roofs, the water and the ink are untouched by it. Spring is the
   * baseline the ground is baked in, so spring paints nothing.
   */
  groundCast: { colour: number; alpha: number };
  /** Deciduous canopy: the scatter tree, and the crown a settlement's grove is drawn from. */
  foliage: number;
  /** The lighter of the two canopy tones — roughly a third of trees take it. */
  foliagePale: number;
  /**
   * Bamboo, areca, banana, banyan, the scrub on the karst.
   *
   * Split from `foliage` because they are evergreen in the delta and because a country where
   * *everything* turned gold at once was the same flat re-lighting as the filter, one layer down.
   * The village hedge staying green through the snow is also what keeps winter from reading as
   * scorched earth.
   */
  evergreen: number;
  canopy: CanopyLook;
  /**
   * Fraction of deciduous trees standing bare regardless of `canopy`.
   *
   * Autumn's, mostly: a wood where a third of the crowns have already dropped is what autumn looks
   * like, and it is far more legible at map zoom than any shade of gold. Winter is bare outright.
   */
  bareChance: number;
  /** Petals on the crown and fallen at the foot, for `canopy: 'blossom'`. */
  blossom: number;
  /** The second flower tone — every blossoming tree is drawn from both. */
  blossomAlt: number;
  /** Leaf litter under a turning tree. */
  litter: number;
  /** Snow caps on branches, roofs of grass tufts, and the weather overhead. */
  snow: boolean;
  /**
   * Multiplicative weather colour for authored limestone plates.
   *
   * The mountain drawings are shared between all four seasons instead of shipping four copies of
   * five large transparent textures. The live scenery repaint applies this pigment to the authored
   * image, while procedural fallback rock runs its colours through the same multiplier.
   */
  mountainTint: number;
  /** The crop standing in the paddy: young green, full green, ripe gold, or bare mud. */
  paddy: number;
  paddyAlpha: number;
  /**
   * The ink a settlement's name plate is lettered in, as `#rrggbb`.
   *
   * The names are the only type standing in the world rather than in the chrome, so they are one
   * more place the calendar can be read without looking at the HUD. Kept close to the ink brown they
   * were hardcoded at — this is the season leaning on the letters, not colouring them.
   */
  labelInk: string;
}

/**
 * The four palettes.
 *
 * Pitched to be read at a glance rather than to be tasteful in isolation. A difference that is
 * merely tasteful at this size disappears completely, which is exactly what the first pass of these
 * numbers did.
 */
export const SEASON_PALETTES: Record<Season, SeasonPalette> = {
  /**
   * Đào and mai in flower over new growth. The lightest green of the year — spring is *young*
   * leaf, and pitching it as deep as summer left the two indistinguishable.
   */
  Spring: {
    wash: { colour: PIGMENT.diepHi, alpha: 0 },
    ground: PIGMENT.tramPale,
    groundRelief: PIGMENT.diepLo,
    // Nothing: the ground is baked in this season already (`BAKE_SEASON`), and laying spring's own
    // tone over spring's own fill would only darken ground it agrees with.
    groundCast: { colour: PIGMENT.tramPale, alpha: 0 },
    foliage: mixPigment(PIGMENT.tram, PIGMENT.tramPale, 0.5),
    foliagePale: mixPigment(PIGMENT.tramPale, PIGMENT.diepHi, 0.28),
    evergreen: PIGMENT.tram,
    canopy: 'blossom',
    bareChance: 0,
    // A fifth of sỏi son's saturation — see the header. At full strength this is the player's red
    // and it would pull the eye off their banners; muted this far it is peach blossom and nothing
    // else on the map is anywhere near it.
    blossom: mutePigment(PIGMENT.sonPale, 0.55),
    blossomAlt: PIGMENT.diepHi,
    litter: PIGMENT.hoePale,
    snow: false,
    mountainTint: 0xffffff,
    paddy: PIGMENT.tramPale,
    paddyAlpha: 0.5,
    labelInk: '#241407',
  },
  /** Full canopy and standing water: the country at its greenest and its darkest. */
  Summer: {
    wash: { colour: PIGMENT.tram, alpha: 0 },
    ground: mixPigment(PIGMENT.tramPale, PIGMENT.tram, 0.62),
    groundRelief: mixPigment(PIGMENT.diepLo, PIGMENT.tram, 0.3),
    groundCast: { colour: PIGMENT.tram, alpha: 0.14 },
    foliage: shadePigment(PIGMENT.tram, 0.78),
    // Deliberately not a pale tone at all: summer's lighter trees are still solidly green, or the
    // third of the wood that takes this reads as a wood already half turned.
    foliagePale: PIGMENT.tram,
    evergreen: shadePigment(PIGMENT.tram, 0.88),
    canopy: 'leafed',
    bareChance: 0,
    blossom: PIGMENT.hoePale,
    blossomAlt: PIGMENT.diepHi,
    litter: PIGMENT.hoePale,
    snow: false,
    mountainTint: mixPigment(0xffffff, PIGMENT.tram, 0.35),
    paddy: PIGMENT.tram,
    paddyAlpha: 0.62,
    labelInk: '#1f2a16',
  },
  /**
   * The harvest, and the drop. Hoa hòe carries the colour; `bareChance` carries the rest — a third
   * of the wood standing bare with its litter on the ground beneath is what says autumn at a size
   * where gold and green are two similar smudges.
   */
  Autumn: {
    wash: { colour: PIGMENT.hoe, alpha: 0 },
    ground: PIGMENT.hoePale,
    groundRelief: mixPigment(PIGMENT.diepLo, PIGMENT.hoe, 0.4),
    groundCast: { colour: PIGMENT.hoe, alpha: 0.15 },
    foliage: mixPigment(PIGMENT.tram, PIGMENT.hoe, 0.82),
    foliagePale: PIGMENT.hoePale,
    evergreen: mixPigment(PIGMENT.tram, PIGMENT.hoe, 0.28),
    canopy: 'turning',
    bareChance: 0.22,
    blossom: PIGMENT.hoePale,
    blossomAlt: PIGMENT.hoe,
    litter: mixPigment(PIGMENT.hoe, PIGMENT.nau, 0.3),
    snow: false,
    mountainTint: mixPigment(0xffffff, PIGMENT.hoe, 0.35),
    paddy: PIGMENT.hoe,
    paddyAlpha: 0.7,
    labelInk: '#5c3a10',
  },
  /**
   * Bare and cold. The one season that keeps its wash: winter is a change in the *light*, the sheet
   * itself goes pale, and it is the season carrying the snow.
   */
  Winter: {
    // Lighter than it was, because the ground now carries its own pale cast underneath the ink and
    // the two used to stack into a washed-out sheet.
    wash: { colour: PIGMENT.diepHi, alpha: 0.13 },
    ground: mixPigment(PIGMENT.diepLo, PIGMENT.mucFaint, 0.16),
    groundRelief: PIGMENT.diepDeep,
    groundCast: { colour: PIGMENT.diepHi, alpha: 0.2 },
    foliage: mutePigment(PIGMENT.tram, 0.62),
    foliagePale: mutePigment(PIGMENT.tramPale, 0.62),
    // Greener than the deciduous tone on purpose — bamboo and areca hold their leaves through the
    // cold, and they are the only living colour left in the picture.
    evergreen: mutePigment(PIGMENT.tram, 0.42),
    canopy: 'bare',
    bareChance: 1,
    blossom: PIGMENT.diepHi,
    blossomAlt: PIGMENT.diepHi,
    litter: PIGMENT.mucFaint,
    snow: true,
    mountainTint: mixPigment(0xffffff, PIGMENT.chamPale, 0.35),
    paddy: PIGMENT.diepDeep,
    paddyAlpha: 0.5,
    labelInk: '#3d4348',
  },
};

/** Cross-fades the one thing that fades: winter's light coming on and going off. */
export function lerpWash(from: SeasonPalette, to: SeasonPalette, t: number): { colour: number; alpha: number } {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    colour: mixPigment(from.wash.colour, to.wash.colour, clamped),
    alpha: from.wash.alpha + (to.wash.alpha - from.wash.alpha) * clamped,
  };
}

const SEASON_ORDER: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

/**
 * The season the map's *terrain fill* is painted in — always, regardless of the date in play.
 *
 * The full terrain bake costs about 1.5 s to rebuild on a mid-tier device
 * (`test_scripts/perf/measure-bake.mjs`), and the season turns every several seconds, so the ground fill
 * can never be repainted to follow the calendar. What follows it instead is everything in the
 * *decoration* layer above that fill — the prop scatter and `groundCast` — which is re-inked from a
 * cached plan in ~170 ms by `MapScene.rebakeScenery()`.
 *
 * Spring, because it is the season that then needs no cast at all: the fill is already its colour.
 *
 * The menu diorama has no such constraint: it is drawn once per launch and never re-baked, so it
 * uses the real season for both halves.
 */
export const BAKE_SEASON: Season = 'Spring';

let renderSeason: Season = BAKE_SEASON;
let foliageSeason: Season = BAKE_SEASON;

/**
 * Sets the season the **terrain fill** is painted in.
 *
 * Called at the top of a repaint, not per prop. Anything baked while this is set keeps that season
 * until the layer is redrawn — which for the fill means: until ownership changes. Hence
 * `BAKE_SEASON`.
 */
export function setRenderSeason(season: Season): void {
  renderSeason = season;
}

export function getRenderSeason(): Season {
  return renderSeason;
}

/**
 * Sets the season the **scenery** is painted in: every growing thing, and the ground cast under it.
 *
 * Split from `setRenderSeason` because the two layers turn at completely different rates. The fill
 * is the expensive half of the bake and is pinned; the decoration layer is redrawn and
 * re-composited every time the calendar moves (`MapScene.rebakeScenery`).
 */
export function setFoliageSeason(season: Season): void {
  foliageSeason = season;
}

export function getFoliageSeason(): Season {
  return foliageSeason;
}

/** The palette the terrain fill and the paddy stages read. Pinned — see `BAKE_SEASON`. */
export function seasonPalette(): SeasonPalette {
  return SEASON_PALETTES[renderSeason];
}

/** The palette every growing thing reads: canopies, culms, fronds, blades. Follows the calendar. */
export function foliagePalette(): SeasonPalette {
  return SEASON_PALETTES[foliageSeason];
}

/** The tint worn by authored mountain plates in the weather currently over the map. */
export function mountainWeatherTint(): number {
  return foliagePalette().mountainTint;
}

/** Applies the authored-image mountain tint to one procedural pigment channel-for-channel. */
export function tintForMountainWeather(colour: number): number {
  const tint = mountainWeatherTint();
  const channel = (shift: number): number => Math.round(
    (((colour >> shift) & 0xff) * ((tint >> shift) & 0xff)) / 255,
  );
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * The tone this season lays over one kind of ground, or `undefined` for ground that does not turn.
 *
 * Cropland takes the strongest hand, because a delta's year is measured in the paddy. Open water and
 * bare limestone take none — neither changes colour with the calendar, and toning them was what made
 * the earlier version of this read as a filter over the whole sheet.
 */
export function groundCast(terrain: HexTerrainType): { colour: number; alpha: number } | undefined {
  const palette = foliagePalette();
  switch (terrain) {
    case 'riceFields':
    case 'fields':
      return { colour: palette.paddy, alpha: palette.paddyAlpha * 0.55 };
    case 'plains':
    case 'forest':
    case 'hills':
    case 'fortress':
    case 'shrine':
      return palette.groundCast.alpha > 0.001 ? palette.groundCast : undefined;
    default:
      return undefined;
  }
}

/**
 * True unless the run asked for the seasonal layers to be left off.
 *
 * Matches the `?nobake=1` / `?nofx=1` escape hatches the map already honours, and exists for the
 * same reason: so a perf run can measure the map with and without this pass and attribute the
 * difference to it rather than to six weeks of unrelated change.
 */
export function seasonVisualsEnabled(): boolean {
  // The player's own answer first — a map whose year is not allowed to turn costs no cross-fade,
  // no weather pool and no accent layer, which on a modest phone is the cheapest thing here to
  // give up. The query flag stays for the capture scripts, which need a fixed season to diff
  // screenshots against.
  if (!seasonsEnabled()) {
    return false;
  }
  if (typeof window === 'undefined') {
    return true;
  }
  return !/[?&]no(season|winter)=1\b/.test(window.location.search);
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
