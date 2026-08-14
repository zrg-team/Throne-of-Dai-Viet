/**
 * The season, drawn over the map.
 *
 * ## Why this is a live layer and not part of the terrain bake
 *
 * The season advances every economy tick — 5.5s in the classic modes, 3.5s in Dragon Ascent, so a
 * full year passes in about twenty seconds. All terrain and prop scatter is composited into one
 * cached RenderTexture by `MapScene.bakeStaticTerrain()`, which exists precisely to replace ~160k
 * per-frame fill commands with a single quad. Re-baking that every few seconds would give the whole
 * saving back.
 *
 * So the bake keeps the world's season-*independent* structure — water, karst, field bunds, roads,
 * coast — and everything that turns with the year is drawn here instead, above the baked quad:
 *
 *  - **the wash**, one rectangle carrying the season's light over the whole world;
 *  - **the accents**, a few hundred soft tones marking ripe paddy, fallow mud, frost and blossom;
 *  - **the weather**, a small recycled pool of falling snow — winter only, see `MoteKind`.
 *
 * Only vegetation *shape* (winter's bare canopy) cannot be done this way, and that alone still goes
 * through the bake — see `bareCanopy` in `ui/ink/season.ts`.
 *
 * Everything here cross-fades over `CROSS_FADE_MS` rather than snapping, because at one season per
 * few seconds a hard cut reads as the map strobing rather than as a year turning.
 */
import Phaser from 'phaser';
import { PIGMENT } from '../../ui/ink/palette';
import { groundTone, mulberry32 } from '../../ui/ink/stroke';
import { bakeProp, propImage, type BakedProp } from '../../ui/ink/sprites';
import { BAKE_SEASON, SEASON_PALETTES, lerpSeasonPalette, type SeasonPalette } from '../../ui/ink/season';
import { scatterDensity } from '../../game/graphicsQuality';
import type { LandscapeTile } from '../../ui/MapRenderer';
import type { PixelPoint } from '../../map/hex';
import type { Season } from '../../state/types';

/** Long enough to read as a turning year, short enough to finish inside one 3.5s ascent tick. */
const CROSS_FADE_MS = 1200;

/** Depths: the bake RT sits at 1.9 and settlement containers at 2, markers from 68, fog at 77.5. */
const WASH_DEPTH = 3;
const ACCENT_DEPTH = 3.05;
const WEATHER_DEPTH = 78;

/** The most motes ever allocated. Pooled once; the active count varies by season and quality. */
const MOTE_POOL = 40;

/** The geometry the seasonal layers need. Mirrors `LandscapeContext` without the draw targets. */
export interface SeasonScape {
  tiles: LandscapeTile[];
  tileSize: number;
  centreOf(tile: LandscapeTile): PixelPoint;
  isVisible(tile: LandscapeTile): boolean;
  worldWidth: number;
  worldHeight: number;
}

/**
 * Only snow.
 *
 * Falling petals, drifting summer haze and tumbling autumn leaves were all drawn and all cut: at the
 * size a mote occupies on this map they read as specks of litter crossing the paper rather than as
 * weather, and three seasons of that was worse than none. Snow survives because a white fleck on
 * điệp paper is legible at any size and because winter is the one season the map otherwise states
 * only in colour.
 */
type MoteKind = 'snow';

interface Mote {
  image: Phaser.GameObjects.Image;
  /** World units per second. */
  fallSpeed: number;
  driftSpeed: number;
  /** Radians per second through the sway, and how far it carries. */
  swayRate: number;
  swayReach: number;
  phase: number;
  spin: number;
}

/**
 * What falls in each season. `count` is before the quality multiplier.
 *
 * Three of the four are `undefined` by design — see `MoteKind`. `applyWeather` already treats a
 * missing entry as "no weather", so the other seasons state themselves in colour alone.
 */
const WEATHER: Record<Season, { kind: MoteKind; count: number; fall: [number, number]; drift: number } | undefined> = {
  Spring: undefined,
  Summer: undefined,
  Autumn: undefined,
  Winter: { kind: 'snow', count: 34, fall: [16, 30], drift: 10 },
};

export class SeasonRenderer {
  private wash?: Phaser.GameObjects.Graphics;
  /** Double-buffered so the outgoing season's accents fade out under the incoming ones. */
  private accents: [Phaser.GameObjects.Graphics?, Phaser.GameObjects.Graphics?] = [undefined, undefined];
  private front = 0;
  private motes: Mote[] = [];
  private activeMotes = 0;

  private scape?: SeasonScape;
  private current: Season = 'Spring';
  private previous: Season = 'Spring';
  private blend = 1;
  private fade?: Phaser.Tweens.Tween;
  private halted = false;
  /** False for the Atlas and Ink Wash themes, which render exactly as they did before. */
  private enabled = true;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Builds the layers and settles straight into `season` with no fade.
   *
   * `enabled` is false for the themes that opt out; the layers are still created (so nothing has to
   * null-check downstream) but stay empty and transparent.
   */
  create(season: Season, scape: SeasonScape, enabled: boolean): void {
    this.enabled = enabled;
    this.scape = scape;
    this.current = season;
    this.previous = season;
    this.blend = 1;

    this.wash ??= this.scene.add.graphics().setDepth(WASH_DEPTH);
    this.accents[0] ??= this.scene.add.graphics().setDepth(ACCENT_DEPTH);
    this.accents[1] ??= this.scene.add.graphics().setDepth(ACCENT_DEPTH + 0.01);

    if (!enabled) {
      this.wash.clear();
      this.accents[0]?.clear();
      this.accents[1]?.clear();
      return;
    }

    this.front = 0;
    this.paintAccents(this.accents[0]!, season);
    this.accents[0]!.setAlpha(1);
    this.accents[1]!.clear().setAlpha(0);
    this.paintWash(SEASON_PALETTES[season]);
    this.buildMotes();
    this.applyWeather(season);
  }

  /** Follows a scene's world geometry when it is rebuilt (a new map, or a resize). */
  setScape(scape: SeasonScape): void {
    this.scape = scape;
  }

  /**
   * Moves to `season`, cross-fading from whatever is on screen.
   *
   * Cheap to call every tick: it returns immediately unless the season actually changed.
   */
  sync(season: Season): void {
    if (!this.enabled || season === this.current) {
      return;
    }
    this.previous = this.current;
    this.current = season;

    // The incoming season is painted into the back buffer, which then fades in over the front.
    const back = this.front === 0 ? 1 : 0;
    const incoming = this.accents[back];
    if (incoming) {
      this.paintAccents(incoming, season);
      incoming.setAlpha(0);
    }
    this.front = back;

    this.applyWeather(season);

    this.fade?.stop();
    this.blend = 0;
    this.fade = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: CROSS_FADE_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        this.blend = tween.getValue() ?? 1;
        this.applyBlend();
      },
      onComplete: () => {
        this.blend = 1;
        this.applyBlend();
      },
    });
    this.applyBlend();
  }

  /** Holds the weather when the world's clock stops, so a pause pauses the snow too. */
  setPaused(halted: boolean): void {
    this.halted = halted;
  }

  /** Drifts the motes. Called from the scene's update; everything else here is event-driven. */
  update(_time: number, delta: number): void {
    if (!this.enabled || this.halted || this.activeMotes === 0) {
      return;
    }
    const seconds = delta / 1000;
    const view = this.scene.cameras.main.worldView;
    for (let index = 0; index < this.activeMotes; index += 1) {
      const mote = this.motes[index];
      const image = mote.image;
      mote.phase += mote.swayRate * seconds;
      image.y += mote.fallSpeed * seconds;
      image.x += (mote.driftSpeed + Math.cos(mote.phase) * mote.swayReach) * seconds;
      image.rotation += mote.spin * seconds;

      // Respawn against the camera's own view rather than the world, so a handful of motes always
      // covers the screen at any zoom instead of being scattered thinly across the whole map.
      if (image.y - view.bottom > 24 || image.x < view.left - 48 || image.x > view.right + 48) {
        this.placeMote(mote, view, true);
      }
    }
  }

  destroy(): void {
    this.fade?.stop();
    this.wash?.destroy();
    this.accents[0]?.destroy();
    this.accents[1]?.destroy();
    for (const mote of this.motes) {
      mote.image.destroy();
    }
    this.motes = [];
    this.activeMotes = 0;
  }

  // ── the cross-fade ───────────────────────────────────────────────────────────

  private applyBlend(): void {
    const from = SEASON_PALETTES[this.previous];
    const to = SEASON_PALETTES[this.current];
    this.paintWash(lerpSeasonPalette(from, to, this.blend));
    const front = this.accents[this.front];
    const back = this.accents[this.front === 0 ? 1 : 0];
    front?.setAlpha(this.blend);
    back?.setAlpha(1 - this.blend);
  }

  /**
   * The season's light: one rectangle over the whole world.
   *
   * A rectangle rather than `setTint` on the baked RenderTexture, for two reasons — tint can only
   * multiply, so it could never produce winter's *paler* sheet; and RenderTexture tint behaves
   * differently under the Canvas fallback this scene already guards for.
   */
  private paintWash(palette: SeasonPalette): void {
    const wash = this.wash;
    const scape = this.scape;
    if (!wash || !scape) {
      return;
    }
    wash.clear();
    if (palette.wash.alpha <= 0.001) {
      return;
    }
    wash.fillStyle(palette.wash.colour, palette.wash.alpha);
    wash.fillRect(0, 0, scape.worldWidth, scape.worldHeight);
  }

  // ── the accents ──────────────────────────────────────────────────────────────

  /**
   * The season written onto the ground itself.
   *
   * One pass over the visible tiles, run only when the season changes — a few hundred soft tones,
   * against the ~160k commands a terrain re-bake would cost.
   */
  private paintAccents(graphics: Phaser.GameObjects.Graphics, season: Season): void {
    graphics.clear();
    const scape = this.scape;
    if (!scape) {
      return;
    }
    const palette = SEASON_PALETTES[season];
    // The bake is already painted in `BAKE_SEASON`, so that one season needs no re-toning at all —
    // laying its own colour over itself would only darken the ground it already agrees with.
    const isBaseline = season === BAKE_SEASON;
    const density = scatterDensity();
    const rand = mulberry32(9311);
    const size = scape.tileSize;

    for (const tile of scape.tiles) {
      if (!scape.isVisible(tile)) {
        continue;
      }
      const centre = scape.centreOf(tile);

      // Re-tone the ground itself. This is the bulk of the work and the reason the season reads at
      // all: the baked ground beneath is pinned to the baseline season, so on a map that is mostly
      // plains, accenting only the cropland changed nothing anybody could see.
      const tone = isBaseline ? undefined : this.groundAccent(tile.terrain, palette);
      if (tone) {
        // Wide and many-ringed on purpose. `groundTone` blends by overlapping its falloff with the
        // neighbouring cells', and at the alpha this layer needs, a cell-sized radius left its
        // innermost ring standing alone as a visible disc — the hex grid leaking back into the
        // picture, which is the one thing this renderer exists to avoid. Reach past the neighbours.
        groundTone(graphics, centre.x, centre.y, size * 1.5, tone.colour, tone.alpha, 5);
      }

      // Winter mist lying in the limestone — the pale band that says cold without saying snow.
      if (season === 'Winter' && (tile.terrain === 'mountains' || tile.terrain === 'hills')) {
        graphics.fillStyle(PIGMENT.diepHi, 0.22);
        graphics.fillEllipse(centre.x, centre.y + size * 0.18, size * 2.1, size * 0.5);
      }

      // Blossom around the seats, where the people are — spring reads as inhabited, not just green.
      if (season === 'Spring' && (tile.terrain === 'fortress' || tile.terrain === 'shrine')) {
        const flecks = Math.max(1, Math.round(9 * density));
        for (let fleck = 0; fleck < flecks; fleck += 1) {
          const angle = rand() * Math.PI * 2;
          const reach = Math.sqrt(rand()) * size * 1.4;
          graphics.fillStyle(rand() > 0.5 ? PIGMENT.diepHi : PIGMENT.hoePale, 0.45 + rand() * 0.3);
          graphics.fillCircle(
            centre.x + Math.cos(angle) * reach,
            centre.y + Math.sin(angle) * reach * 0.86,
            size * (0.025 + rand() * 0.03),
          );
        }
      }
    }
  }

  /**
   * The tone this season lays over one kind of ground, and how heavily.
   *
   * Cropland gets the strongest hand because the paddy is what a delta's year is actually measured
   * in; bare rock and open water get nothing, since neither changes colour with the season.
   */
  private groundAccent(
    terrain: LandscapeTile['terrain'],
    palette: SeasonPalette,
  ): { colour: number; alpha: number } | undefined {
    switch (terrain) {
      case 'riceFields':
      case 'fields':
        return { colour: palette.paddy, alpha: palette.paddyAlpha };
      default:
        // Everything else takes the season from the wash instead.
        //
        // This layer is a live `Graphics`, so it re-submits its whole command list every frame, not
        // once per repaint — the trap `ink/sprites.ts` documents. Toning all 241 visible cells here
        // meant ~1450 tessellated circles per frame and tripled the per-tick cost (50 ms -> 161 ms
        // measured). The paddy earns its place because no flat wash can turn one field gold and
        // leave the rock beside it alone; open ground does not, so it goes through the free
        // single-rectangle wash instead.
        return undefined;
    }
  }

  // ── the weather ──────────────────────────────────────────────────────────────

  private buildMotes(): void {
    if (this.motes.length > 0) {
      return;
    }
    const baked = this.bakedMote('snow');
    for (let index = 0; index < MOTE_POOL; index += 1) {
      const image = propImage(this.scene, baked, 0, 0, 1)
        .setDepth(WEATHER_DEPTH)
        .setVisible(false)
        .setActive(false);
      this.motes.push({
        image,
        fallSpeed: 20,
        driftSpeed: 0,
        swayRate: 1,
        swayReach: 0,
        phase: 0,
        spin: 0,
      });
    }
  }

  /** Switches the pool to this season's mote, and sizes it to the quality profile. */
  private applyWeather(season: Season): void {
    const spec = WEATHER[season];
    const density = scatterDensity();
    const wanted = spec ? Math.min(MOTE_POOL, Math.round(spec.count * density)) : 0;
    this.activeMotes = wanted;

    for (let index = wanted; index < this.motes.length; index += 1) {
      this.motes[index].image.setVisible(false).setActive(false);
    }
    if (!spec || wanted === 0) {
      return;
    }

    const baked = this.bakedMote(spec.kind);
    const view = this.scene.cameras.main.worldView;
    const rand = mulberry32(season.length * 7717 + wanted);
    for (let index = 0; index < wanted; index += 1) {
      const mote = this.motes[index];
      mote.image
        .setTexture(baked.key)
        .setOrigin(baked.originX, baked.originY)
        .setVisible(true)
        .setActive(true);
      mote.fallSpeed = spec.fall[0] + rand() * (spec.fall[1] - spec.fall[0]);
      mote.driftSpeed = (rand() - 0.35) * spec.drift;
      mote.swayRate = 0.6 + rand() * 1.8;
      mote.swayReach = 4 + rand() * 6;
      mote.phase = rand() * Math.PI * 2;
      mote.spin = (rand() - 0.5) * 0.5;
      // Seeded across the whole view on a season change, so the weather is already falling rather
      // than arriving as a line from the top edge.
      this.placeMote(mote, view, false, rand);
    }
  }

  /** Puts one mote somewhere sensible: above the view when recycled, anywhere in it when seeding. */
  private placeMote(mote: Mote, view: Phaser.Geom.Rectangle, recycled: boolean, rand = Math.random): void {
    // `moteBaseScale` returns the raster to design units; the variation on top is this copy's size.
    mote.image.setScale(this.moteBaseScale * (0.5 + rand() * 0.7));
    mote.image.x = view.left + rand() * view.width;
    mote.image.y = recycled ? view.top - rand() * view.height * 0.35 - 16 : view.top + rand() * view.height;
    mote.image.setAlpha(0.6 + rand() * 0.4);
  }

  /** `BakedProp.scale` for the mote currently in the pool — motes are baked above design size. */
  private moteBaseScale = 1;

  /**
   * One texture per mote, baked once through the shared prop baker.
   *
   * `bakeProp` caches by key and is otherwise used only for the buffalo, so there is no collision;
   * four textures cover every mote on screen however many are falling.
   */
  private bakedMote(kind: MoteKind): BakedProp {
    // Design units, and generous: the first pass boxed these at 10 units, which put a five-pixel
    // leaf on a 390-unit screen — present in the scene graph and invisible to the eye.
    const box = { left: -14, right: 14, top: -14, bottom: 14 };
    const baked = bakeProp(this.scene, `prop:mote:${kind}`, box, (g, x, y, raster) => {
      drawMote(g, kind, x, y, raster);
    });
    this.moteBaseScale = baked.scale;
    return baked;
  }
}

/**
 * Snow: shell white with a soot rim, and a soft halo behind it.
 *
 * The rim is not decoration — pure điệp white on điệp paper is invisible, which is what sank the
 * petal mote this replaced. It is also why no mote spends sỏi son: a sky full of red would pull the
 * eye off the player's own banners, the one thing the palette forbids.
 */
function drawMote(g: Phaser.GameObjects.Graphics, _kind: MoteKind, x: number, y: number, raster: number): void {
  const s = raster;
  g.fillStyle(PIGMENT.diepHi, 1);
  g.fillCircle(x, y, 3.4 * s);
  g.lineStyle(0.7 * s, PIGMENT.mucFaint, 0.5);
  g.strokeCircle(x, y, 3.4 * s);
  g.fillStyle(PIGMENT.diepHi, 0.35);
  g.fillCircle(x, y, 6 * s);
}
