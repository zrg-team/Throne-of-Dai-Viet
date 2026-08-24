/**
 * The season, drawn over the map.
 *
 * ## Why this is a live layer and not part of the terrain bake
 *
 * All terrain and prop scatter is composited into one cached RenderTexture by
 * `MapScene.bakeStaticTerrain()`, which exists precisely to replace ~160k per-frame fill commands
 * with a single quad. Three things cannot go in there: a wash that has to sit *above* the finished
 * sheet rather than under the ink, an accent that follows land out of the fog, and weather that
 * moves. So the bake keeps the world's structure and everything that grows in it — ground, water,
 * karst, bunds, roads, coast, and the season's own canopy, grass and ground tone — and this draws
 * the rest on top:
 *
 *  - **the wash**, one rectangle carrying winter's light over the whole world;
 *  - **the accents**, mist in the limestone and blossom around the seats;
 *  - **the weather**, a small recycled pool of petals, leaves or snow.
 *
 * Everything here cross-fades over `CROSS_FADE_MS` rather than snapping, because at one season per
 * several seconds a hard cut reads as the map strobing rather than as a year turning. The *canopy*
 * cannot cross-fade — it is inside the bake and there is no second scenery buffer to dissolve
 * against — but a woodblock print does not dissolve either.
 */
import Phaser from 'phaser';
import { PIGMENT } from '../../ui/ink/palette';
import { mulberry32 } from '../../ui/ink/stroke';
import { bakeProp, propImage, type BakedProp } from '../../ui/ink/sprites';
import { applyStamp } from '../../ui/ink/stamp';
import { SEASON_PALETTES, lerpWash } from '../../ui/ink/season';
import { scatterDensity } from '../../game/graphicsQuality';
import type { LandscapeTile } from '../../ui/MapRenderer';
import type { PixelPoint } from '../../map/hex';
import type { Season } from '../../state/types';

/** Long enough to read as a turning year, short enough to finish inside one ascent tick. */
const CROSS_FADE_MS = 1200;

/** Depths: the bake RT sits at 1.9 and settlement containers at 2, markers from 68, fog at 77.5. */
const WASH_DEPTH = 3;
// Inside the static-bake band (depth <= 1.5): the accents are a few dozen fills that turn only
// with the calendar, and as a live layer above the bake they were re-submitted every frame. The
// bake sweep flattens and hides them; `bakeAccents` repaints them just before each seasonal bake.
const ACCENT_DEPTH = 1.45;
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
 * What falls, and when.
 *
 * Petals and leaves were drawn once before and cut, because at ten design units they were
 * five-pixel specks that read as litter blowing across the paper. They are back at the size the
 * snow flake proved works — a mote is drawn to fill a 28-unit box — and at roughly half snow's
 * count, because a petal is a punctuation mark on the season and snow is the weather itself.
 *
 * Summer is the one season with nothing overhead: high summer in the delta is *still*, and the
 * season is already stated by the deepest canopy of the year.
 */
type MoteKind = 'petal' | 'leaf' | 'snow';

const WEATHER: Record<Season, { kind: MoteKind; count: number; fall: [number, number]; drift: number } | undefined> = {
  Spring: { kind: 'petal', count: 16, fall: [9, 18], drift: 14 },
  Summer: undefined,
  Autumn: { kind: 'leaf', count: 14, fall: [13, 24], drift: 16 },
  Winter: { kind: 'snow', count: 34, fall: [16, 30], drift: 10 },
};

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

export class SeasonRenderer {
  private wash?: Phaser.GameObjects.Graphics;
  /** Double-buffered so the outgoing season's accents fade out under the incoming ones. */
  private accents: [Phaser.GameObjects.Graphics?, Phaser.GameObjects.Graphics?] = [undefined, undefined];
  private front = 0;
  private motes: Mote[] = [];
  private activeMotes = 0;

  private scape?: SeasonScape;
  private current: Season = 'Spring';
  /** The season `bakeAccents` last painted, so `sync` knows the bake already carries it. */
  private accentSeason?: Season;
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
      this.activeMotes = 0;
      for (const mote of this.motes) {
        mote.image.setVisible(false).setActive(false);
      }
      return;
    }

    this.front = 0;
    this.paintAccents(this.accents[0]!, season);
    this.accents[0]!.setAlpha(1);
    this.accents[1]!.clear().setAlpha(0);
    this.paintWash(SEASON_PALETTES[season].wash);
    this.buildMotes();
    this.applyWeather(season);
  }

  /**
   * Follows a scene's world geometry when it is rebuilt — a new map, a resize, or land coming out
   * of the fog, which is the common one: the accents are drawn per *visible* tile.
   */
  /**
   * Paints the current front accent buffer in `season` at full strength, for a caller about to
   * bake it into the static texture. The back buffer is cleared - nothing fades any more.
   */
  bakeAccents(season: Season): void {
    if (!this.enabled) {
      return;
    }
    const front = this.accents[this.front];
    if (front) {
      this.paintAccents(front, season);
      front.setAlpha(1);
    }
    this.accents[this.front === 0 ? 1 : 0]?.clear();
    this.accentSeason = season;
  }

  setScape(scape: SeasonScape): void {
    this.scape = scape;
    if (this.enabled) {
      const front = this.accents[this.front];
      if (front) {
        this.paintAccents(front, this.current);
      }
    }
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

    // The accents live in the static bake now: `bakeAccents` painted them at full strength just
    // before the seasonal re-composite, so the fade below carries the wash and the weather only.
    if (this.accentSeason !== season) {
      const back = this.front === 0 ? 1 : 0;
      const incoming = this.accents[back];
      if (incoming) {
        this.paintAccents(incoming, season);
        incoming.setAlpha(0);
      }
      this.front = back;
    }

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
    this.paintWash(lerpWash(SEASON_PALETTES[this.previous], SEASON_PALETTES[this.current], this.blend));
    const front = this.accents[this.front];
    const back = this.accents[this.front === 0 ? 1 : 0];
    front?.setAlpha(this.blend);
    back?.setAlpha(1 - this.blend);
  }

  /**
   * The season's light: one rectangle over the whole world. **Winter's alone.**
   *
   * A rectangle rather than `setTint` on the baked RenderTexture, for two reasons — tint can only
   * multiply, so it could never produce winter's *paler* sheet; and RenderTexture tint behaves
   * differently under the Canvas fallback this scene already guards for.
   */
  private paintWash(wash: { colour: number; alpha: number }): void {
    const target = this.wash;
    const scape = this.scape;
    if (!target || !scape) {
      return;
    }
    target.clear();
    if (wash.alpha <= 0.001) {
      return;
    }
    target.fillStyle(wash.colour, wash.alpha);
    target.fillRect(0, 0, scape.worldWidth, scape.worldHeight);
  }

  // ── the accents ──────────────────────────────────────────────────────────────

  /**
   * The two things the season writes onto the ground from up here.
   *
   * Both are deliberately confined to a *handful* of cells. This is a live `Graphics`, so it
   * re-submits its whole command list every frame, not once per repaint — the trap `ink/sprites.ts`
   * documents. An earlier version toned all 241 visible cells here and tripled the per-tick cost
   * (50 ms -> 161 ms measured); that job now belongs to `groundCast` inside the bake, and what is
   * left is the relief and the seats.
   */
  private paintAccents(graphics: Phaser.GameObjects.Graphics, season: Season): void {
    graphics.clear();
    const scape = this.scape;
    if (!scape) {
      return;
    }
    const density = scatterDensity();
    const rand = mulberry32(9311);
    const size = scape.tileSize;

    for (const tile of scape.tiles) {
      if (!scape.isVisible(tile)) {
        continue;
      }
      const centre = scape.centreOf(tile);

      // Mist lying in the limestone — the pale band that says cold without saying snow. The rock is
      // the one ground the bake's cast leaves alone, because its faces are the drawing.
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
      // Through `applyStamp`, not `setTexture(baked.key)`: under the atlas backend the pixels
      // live in a shared page and the stamp's `texture`/`frame` say where.
      applyStamp(mote.image, baked);
      mote.image.setVisible(true).setActive(true);
      mote.fallSpeed = spec.fall[0] + rand() * (spec.fall[1] - spec.fall[0]);
      mote.driftSpeed = (rand() - 0.35) * spec.drift;
      mote.swayRate = 0.6 + rand() * 1.8;
      mote.swayReach = 4 + rand() * 6;
      mote.phase = rand() * Math.PI * 2;
      // A leaf tumbles, a petal turns slowly, a flake barely rotates at all.
      mote.spin = (rand() - 0.5) * (spec.kind === 'leaf' ? 1.6 : spec.kind === 'petal' ? 0.9 : 0.5);
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
   * One texture per mote kind, baked once through the shared prop baker.
   *
   * `bakeProp` caches by key and is otherwise used only for the buffalo, so there is no collision;
   * three textures cover every mote on screen however many are falling.
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
 * The three motes. Every one carries a soot rim.
 *
 * The rim is not decoration — pale pigment on điệp paper is invisible, which is what sank the first
 * petal. It is also why no mote spends sỏi son: a sky full of red would pull the eye off the
 * player's own banners, the one thing the palette forbids. The petal's pink is the same muted peach
 * the blossoming canopy is drawn in, four fifths of the way to grey.
 */
function drawMote(g: Phaser.GameObjects.Graphics, kind: MoteKind, x: number, y: number, raster: number): void {
  const s = raster;
  if (kind === 'snow') {
    g.fillStyle(PIGMENT.diepHi, 1);
    g.fillCircle(x, y, 3.4 * s);
    g.lineStyle(0.7 * s, PIGMENT.mucFaint, 0.5);
    g.strokeCircle(x, y, 3.4 * s);
    g.fillStyle(PIGMENT.diepHi, 0.35);
    g.fillCircle(x, y, 6 * s);
    return;
  }

  if (kind === 'petal') {
    // A cupped petal: two arcs meeting at a point, so a rotating one reads as turning over rather
    // than as a spinning dot.
    g.fillStyle(SEASON_PALETTES.Spring.blossom, 1);
    g.beginPath();
    g.moveTo(x - 3.6 * s, y);
    g.arc(x, y - 1.4 * s, 3.6 * s, Math.PI, 0, false);
    g.lineTo(x, y + 3.2 * s);
    g.closePath();
    g.fillPath();
    g.lineStyle(0.6 * s, PIGMENT.mucFaint, 0.45);
    g.strokePath();
    return;
  }

  // A leaf: a pointed oval with a midrib, in the gold the turning canopy is drawn in.
  g.fillStyle(SEASON_PALETTES.Autumn.litter, 1);
  g.beginPath();
  g.moveTo(x, y - 4.2 * s);
  g.lineTo(x + 2.6 * s, y);
  g.lineTo(x, y + 4.2 * s);
  g.lineTo(x - 2.6 * s, y);
  g.closePath();
  g.fillPath();
  g.lineStyle(0.6 * s, PIGMENT.nauDark, 0.55);
  g.strokePath();
  g.lineBetween(x, y - 3.6 * s, x, y + 3.6 * s);
}
