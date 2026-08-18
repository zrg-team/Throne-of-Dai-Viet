import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { createAscentGameState, createInitialGameState } from '../state/GameState';
import { hasSnapshot, loadSnapshot, snapshotLabel } from '../state/save';
import { getLegacy, LEGACY_PERKS, purchaseLegacyPerk, rankForScore } from '../state/legacy';
import { getLanguage, setLanguage, t, type LanguageCode } from '../i18n';
import { createMapItemRenderer, type MapItemRenderer } from '../ui/MapItemRenderer';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { InkUI, INK_UI, INK_UI_HEX } from '../ui/InkUI';
import { PIGMENT } from '../ui/ink/palette';
import { INK, brushStroke, inkOutline, shade, washFill, waveLine } from '../ui/inkTheme';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import { getMapTheme, MAP_THEME_OPTIONS, setMapTheme } from '../ui/mapTheme';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { inkPath, mulberry32, thickPath, washFill as washInk, type Pt } from '../ui/ink/stroke';
import { areca, bamboo, banyan, farmer, karstRange, softRidge, tree as treeProp } from '../ui/ink/props';
import { seasonForDate, setFoliageSeason, setRenderSeason } from '../ui/ink/season';
import { grazeInSmallArea, livingSprite } from '../ui/ink/life';
import { bakedBuffalo } from '../ui/ink/sprites';
import { drawFieldPlot, hamlet, paddyLattice } from '../ui/ink/settlements';
import { drawHost, hostFootprint, hostShape, marchInPlace, type HostShape } from '../ui/ink/devices';
import { GRAPHICS_QUALITIES, applyRenderScale, getGraphicsQuality, setGraphicsQuality } from '../game/graphicsQuality';
import { SUPPORT, configuredSupportChannels, supportQrTextureKey, type SupportChannel } from '../data/support';
import { copyToClipboard, openExternalLink } from '../utils/browser';
import { encodeQr, type QrMatrix } from '../utils/qr';

type MenuMode = 'main' | 'classic' | 'confirm-new' | 'legacy' | 'settings';

/**
 * The front page's footer, measured up from the bottom edge.
 *
 * The support row — one sentence offering a coffee and a pull request — sits on the sheet's edge,
 * and the settings button just above it. The row holds pressable phrases rather than buttons, so
 * its height is the band they are centred in, not the height of anything drawn.
 *
 * The button column stops at `SETTINGS_TOP`; the three settings rows that used to live there have
 * their own page now, and what is left above the footer is breathing room for the art.
 */
const SUPPORT_ROW_HEIGHT = 32;
const SUPPORT_TOP = GAME_HEIGHT - 14 - SUPPORT_ROW_HEIGHT;
const SETTINGS_TOP = SUPPORT_TOP - 8 - 34 - 6;

export class MenuScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  private mapItems!: MapItemRenderer;
  private content: Phaser.GameObjects.GameObject[] = [];
  /** The coffee modal, when open. Kept apart from `content` so a re-render underneath cannot orphan it. */
  private modalObjects: Phaser.GameObjects.GameObject[] = [];
  private mode: MenuMode = 'main';
  private previewFlagSeed = 0;

  constructor() {
    super('MenuScene');
  }

  /**
   * The menu was drawn against an 844-tall sheet, but the design height now follows the device, so
   * on a phone with browser chrome it can be two hundred units shorter.
   *
   * Everything in the button column sits at a fixed y while the theme picker and language row are
   * anchored to the bottom — so a shorter sheet slid the two into each other and the tagline came
   * out underneath the theme tiles. These map the design's own coordinates into whatever vertical
   * band is actually left above those bottom rows, which also relieves a collision the 844 layout
   * already had whenever the legacy-shop button was showing.
   */
  private get vScale(): number {
    const BOTTOM_ROWS = 118;   // the footer: settings button and the support row beneath it
    const DESIGN_BOTTOM = 790; // lowest content y in the 844 design
    return Math.max(0.62, Math.min(1, (GAME_HEIGHT - BOTTOM_ROWS) / DESIGN_BOTTOM));
  }

  /** A design-space y in the band the device actually leaves. */
  private vy(y: number): number {
    return Math.round(y * this.vScale);
  }

  /** A design-space height, scaled with its position so gaps stay proportional. */
  private vh(height: number): number {
    return Math.round(height * this.vScale);
  }

  create(): void {
    applyRenderScale(this);
    // The chrome is printed on the same sheet as the world, so it takes the same paper pass.
    applyPaperFX(this);
    window.__mandateState = undefined;
    this.registry.remove('gameState');
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    this.mapItems = createMapItemRenderer(this);
    this.previewFlagSeed = loadSnapshot()?.state.mapConfig.seed ?? Math.floor(Math.random() * 1_000_000);
    this.drawBackground();
    this.render();
  }

  private drawBackground(): void {
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT).setDepth(-10);
    const menu = this.mapRenderer.theme.renderers.menu;

    if (menu === 'dongho') {
      // The title screen wears the player's own month. It is drawn once per launch and never
      // re-baked, so unlike the map it can afford the full seasonal treatment of the props: bare
      // branches in January, gold paddy in October. `MapScene` pins itself back to `BAKE_SEASON`
      // on the way in, so this cannot leak into the world's terrain fill.
      //
      // Both halves of the pair, or the diorama draws January ground under Spring canopy: the map
      // splits these deliberately (pinned fill, live scenery) and the menu is the one place that
      // wants them together.
      const month = seasonForDate();
      setRenderSeason(month);
      setFoliageSeason(month);

      // The hosts are planned before the land is drawn, because the land has to leave their ground
      // clear: fields drawn first and men placed into them afterwards is how a host ends up
      // standing in a paddy, and the same reasoning put one of them in the river.
      const river = createMenuRiver();
      const hosts = planDongHoHosts(river);
      // Exposed so a driver script can assert nothing is standing in the water; a host in the river
      // is exactly the kind of defect that is invisible until somebody looks at the right screen.
      (this as unknown as { __menuRiver: (y: number) => unknown }).__menuRiver = (y: number) => river.spanAt(y / this.vScale);
      this.fitLandscapeLayer(() => this.drawDongHoLandscape(river, hosts));
      this.drawDongHoLife(hosts);
      this.drawDongHoWeather(river);
    } else if (menu === 'atlas') {
      this.fitLandscapeLayer(() => {
        this.drawAtlasLandscape();
        this.drawArmies();
      });
    } else {
      this.fitLandscapeLayer(() => {
        this.drawLandscape();
        this.drawArmies();
        this.drawFogBands();
      });
    }

    // Outside the squash, always. The seal is a piece of identity, not scenery: run through the same
    // vertical-only scale as the landscape it used to be collected with, a 96-unit circle comes out
    // 96 wide and 66 tall on a 664-tall phone sheet, and the emblem inside it flattens with it.
    this.drawDaiVietLotusSeal();
  }

  /**
   * Runs `draw` and collects everything it created into a landscape fitted onto the device's sheet.
   *
   * Large ground washes and the river may compress vertically; they are the layout. Recognizable
   * objects tagged `menuAspectSafe` counter-scale inside the container, so mountains, trees,
   * houses and people keep their authored proportions while their anchor positions still fit the
   * short sheet. This is the difference between moving a tree closer and flattening the tree.
   *
   * Live objects remain outside this container so they can move and use `vy` for the same fitted
   * ground position.
   */
  private fitLandscapeLayer(draw: () => void): Phaser.GameObjects.Container {
    const before = new Set(this.children.list);
    draw();
    const art = this.add.container(0, 0).setDepth(-8);
    for (const child of this.children.list.slice()) {
      if (before.has(child) || child === art) continue;
      art.add(child as Phaser.GameObjects.GameObject & { x: number; y: number });
    }
    art.setScale(1, this.vScale);
    // A tagged object is drawn around its own local origin. Countering the parent's vertical scale
    // restores a 1:1 world aspect without changing the fitted y position of that origin.
    for (const child of art.list) {
      const transform = child as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & {
        getData?: (key: string) => unknown;
      };
      if (transform.getData?.('menuAspectSafe')) {
        transform.setScale(1, 1 / this.vScale);
      }
    }
    return art;
  }

  /** Draw one recognizable landscape object around its anchor, preserving its world aspect. */
  private aspectProp(x: number, y: number, draw: (g: Phaser.GameObjects.Graphics) => void): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics({ x, y });
    draw(graphics);
    graphics.setData('menuAspectSafe', true);
    return graphics;
  }

  /**
   * The menu, drawn in the same hand as the map.
   *
   * The shared ink landscape here is flat vector: banded polygons, a ribbon river, grey triangles
   * with snow on them. It is the first screen anybody sees, and under this theme it was announcing
   * a different game from the one behind it. Same idea — two hosts facing across a river — drawn
   * with the props the world uses, and kept inside a band that leaves the button column clear.
   */
  private drawDongHoLandscape(river: MenuRiver, hosts: MenuHost[]): void {
    const g = this.add.graphics();
    const rand = mulberry32(1307);
    const HORIZON = 292;
    const FLOOR = 556;

    // Limestone at the horizon with soft earth hills tucked in front of it. Two landforms, because
    // one of them used for both gives a row of teeth.
    this.aspectProp(0, HORIZON, (landforms) => {
      softRidge(landforms, -30, 236, 4, 30, 9021);
      softRidge(landforms, 168, GAME_WIDTH + 30, 2, 25, 9022);
      // The last argument thins the range out. On the map a massif has to fill its tiles, but
      // the menu wants open country between the towers rather than a solid wall of rock.
      karstRange(landforms, -24, 196, 0, 74, 4118, false, 1.85);
      karstRange(landforms, 214, GAME_WIDTH + 24, -4, 62, 4119, false, 1.85);
    });

    // Mist at the foot of the range. Towers are seated at varying depths, so their base fills stop
    // on a stepped line — invisible on the map, where ground tone covers it, and a row of pale
    // blocks here on bare paper. A band of haze is both the fix and what the eye expects anyway.
    // Laid as a GRADED stack rather than one flat block. A single polygon of paper tone ends
    // on a ruled horizontal edge, and because it is paper-on-paper everywhere except over the
    // towers, the only place that edge shows is across the rock — which is why the foot of the
    // range came out as a row of pale rectangles with a hard line under them. Ten thin slices
    // of falling opacity have no edge to find, and the rock fades into the ground instead of
    // stopping on it.
    const mist: Pt[] = [];
    for (let step = 0; step <= 14; step += 1) {
      mist.push({ x: -20 + (step / 14) * (GAME_WIDTH + 40), y: HORIZON - 14 + (rand() - 0.5) * 9 });
    }
    // Its OWN graphics, created after the landforms. `g` is made before them, and Phaser orders
    // by creation rather than by draw call — so every slice of this laid on `g` went UNDER the
    // range and showed only in the gaps between towers, as pale blocks with the rock stepping
    // over them. The haze has to be able to cover the feet it is there to hide.
    const haze = this.add.graphics();
    // A BAND centred on the feet, not a curtain hung from the horizon. Stacked as overlapping
    // sheets that each ran from the skyline downward, the opacity accumulated and swallowed the
    // range whole; and because each sheet took the print's hand registration, the fourteen of
    // them slipped apart into fourteen horizontal streaks. So: thin non-overlapping slices,
    // opacity rising from nothing at the skyline to full across the zone where the tower bases
    // stop, then back to nothing before the fields — and zero registration, because this is
    // atmosphere rather than a colour block.
    const HAZE_SLICES = 16;
    const HAZE_DEPTH = 54;
    for (let slice = 0; slice < HAZE_SLICES; slice += 1) {
      const t0 = slice / HAZE_SLICES;
      const t1 = (slice + 1) / HAZE_SLICES;
      const mid = (t0 + t1) / 2;
      const strength = Math.min(1, mid / 0.26, (1 - mid) / 0.34);
      washInk(
        haze,
        [
          ...mist.map((point) => ({ x: point.x, y: point.y + t0 * HAZE_DEPTH })),
          ...[...mist].reverse().map((point) => ({ x: point.x, y: point.y + t1 * HAZE_DEPTH })),
        ],
        PIGMENT.diep,
        4200 + slice,
        0.62 * Math.max(0, strength),
        0,
      );
    }

    // The near ground, so the props stand on something rather than floating on bare paper.
    for (let band = 0; band < 7; band += 1) {
      const y = HORIZON + band * ((FLOOR - HORIZON) / 7);
      g.fillStyle(band % 2 === 0 ? PIGMENT.diepLo : PIGMENT.hoePale, 0.1 - band * 0.008);
      g.fillEllipse(GAME_WIDTH / 2 + (rand() - 0.5) * 90, y + 20, GAME_WIDTH * 1.5, 130);
    }

    // The river as a course rather than a stripe: a band that narrows upstream, with its own inked
    // banks, running off the left edge before it reaches the buttons.
    washInk(g, river.banks, PIGMENT.chamWash, 3007, 0.55);
    inkPath(g, river.banks, 3008, { width: 0.85, alpha: 0.36, colour: PIGMENT.cham, wobble: 1.2, step: 13 });

    // Paddy on the far bank, from the same lattice the map's delta is drawn with: bund lines run the
    // width of the field system and every plot is cut from the strip between two of them, so
    // neighbours share their banks. The sixteen independently-placed rectangles this replaces had
    // their own outlines, their own random sizes and their own gaps — sixteen paper scraps dropped
    // on the grass, which is what "the fields look very bad" is looking at.
    // Kept to a handful of field systems around the hamlets that work them, the way the map keeps
    // its plots to the paddy tiles. Filling the whole bank edge to edge — which a lattice will
    // happily do — turns the far side of the river into a course of masonry.
    const farms = [
      { x: 272, y: 334, reach: 34 },
      { x: 352, y: 322, reach: 30 },
      { x: 318, y: 410, reach: 36 },
    ];
    for (const plot of paddyLattice({
      // Matched to the plot size the map draws at, so the two read as the same country. Bigger and
      // the bunds start to look like mortar courses.
      // Started BELOW the haze band, not six pixels under the horizon. The towers are seated
      // at varying depths and their feet run as much as a third of the range height below
      // `HORIZON`, so a lattice beginning at +6 lays paddy over the bottom of the mountains.
      x0: 214, x1: GAME_WIDTH + 16, y0: HORIZON + 40, y1: 480, cell: 11, seed: 4200,
      keep: (x, y) => {
        const span = river.spanAt(y);
        // Dry ground only: never over the water, never under a host's feet.
        if (span && x < span.right + 9) return false;
        if (hosts.some((host) => host.covers(x, y, 8))) return false;
        return farms.some((farm) => (farm.x - x) ** 2 + (farm.y - y) ** 2 < farm.reach ** 2);
      },
    })) {
      drawFieldPlot(g, plot);
    }
    // The far bank is a place, not a texture: the hamlet whose fields those are, the people working
    // them, and trees breaking the field system up so it reads as farmland rather than as tiling.
    this.aspectProp(318, 366, (prop) => hamlet(prop, 0, 0, 0.42, 4300, 3));
    this.aspectProp(288, 372, (prop) => farmer(prop, 0, 0, 0.7, 4310));
    this.aspectProp(356, 400, (prop) => farmer(prop, 0, 0, 0.62, 4311));
    this.aspectProp(340, 352, (prop) => areca(prop, 0, 0, 0.42, 4320));
    // Nothing stands above `HORIZON + 40`. A tree planted at 300 is eight pixels under the
    // horizon and lands halfway up a tower — it reads as growing out of the rock face.
    this.aspectProp(246, 344, (prop) => treeProp(prop, 0, 0, 0.5, 4321));
    this.aspectProp(384, 372, (prop) => treeProp(prop, 0, 0, 0.46, 4322));
    this.aspectProp(300, 452, (prop) => treeProp(prop, 0, 0, 0.44, 4323));
    this.aspectProp(372, 338, (prop) => treeProp(prop, 0, 0, 0.4, 4324));

    // Ripples ride the surface rather than being scratched onto it at random. Level strokes only:
    // randomising both ends put crossed scratches on the water.
    for (let ripple = 0; ripple < 10; ripple += 1) {
      const y = HORIZON + 20 + rand() * 220;
      const span = river.spanAt(y);
      if (!span) continue;
      const x = span.left + 3 + rand() * Math.max(2, span.right - span.left - 6);
      inkPath(g, [{ x: x - 6, y }, { x: x + 6, y: y + 1 }], 3100 + ripple,
        { width: 0.6, alpha: 0.26, colour: PIGMENT.cham, wobble: 0.4, step: 6 });
    }

    // The near bank: a village under its banyan. The herd is drawn in `drawDongHoLife`, because an
    // animal baked into this buffer can never take a step.
    this.aspectProp(52, 356, (prop) => banyan(prop, 0, 0, 0.75, 5001));
    this.aspectProp(112, 366, (prop) => hamlet(prop, 0, 0, 0.58, 5002, 5));
    this.aspectProp(20, 392, (prop) => bamboo(prop, 0, 0, 0.62, 5003));
    this.aspectProp(158, 344, (prop) => areca(prop, 0, 0, 0.5, 5004));
    for (let index = 0; index < 8; index += 1) {
      const x = 8 + rand() * 190;
      const y = 334 + rand() * 84;
      if (hosts.some((host) => host.covers(x, y, 12))) continue;
      const scale = 0.42 + rand() * 0.26;
      this.aspectProp(x, y, (prop) => treeProp(prop, 0, 0, scale, 5100 + index));
    }
  }

  /**
   * Everything on the menu that is alive: the two hosts with their standards, and the herd.
   *
   * Drawn outside the fitted landscape layer so each object can animate independently. Their
   * positions go through `vy` to stay registered with the compressed ground.
   */
  private drawDongHoLife(hosts: MenuHost[]): void {
    for (const host of hosts) {
      const container = this.add.container(host.x, this.vy(host.y)).setDepth(-7);
      const ground = this.add.graphics();
      // The same footprint the map's own markers use, given the same anchor as the `drawHost` call
      // below, so the menu cannot drift back to a blob sitting beside the men.
      hostFootprint(ground, -host.shape.width / 2, -host.shape.height, host.shape, MENU_HOST_SCALE);
      container.add(ground);

      const ranks: Phaser.GameObjects.Graphics[] = [];
      drawHost(
        ground, -host.shape.width / 2, -host.shape.height, host.men, host.men + 17,
        host.player ? PIGMENT.muc : PIGMENT.mucSoft, MENU_HOST_SCALE, true,
        (rank) => {
          while (ranks.length <= rank) {
            const layer = this.add.graphics();
            ranks.push(layer);
            container.add(layer);
          }
          return ranks[rank];
        },
      );
      marchInPlace(this, ranks, MENU_HOST_SCALE);

      const flag = this.mapItems.createPlayerLandFlag(
        false,
        host.player ? this.previewFlagSeed : this.previewFlagSeed + 777,
      );
      // Planted on the outward side, so the cloth streams away from its own ranks rather than
      // across the front of them.
      flag.setPosition(host.player ? host.shape.width / 2 + 11 : -host.shape.width / 2 - 11, 3);
      flag.setScale(host.player ? 0.78 : -0.78, 0.78);
      container.add(flag);
    }

    // The herd in front of the village, each animal on its own object and grazing its own patch.
    // Baked to a texture like the map's, so the menu is not rebuilding several hundred path
    // segments per animal per frame behind a screen that is mostly buttons.
    for (const beast of MENU_HERD) {
      const home = { x: beast.x, y: this.vy(beast.y) };
      const animal = livingSprite(this, bakedBuffalo(this, beast.seed, beast.rider), home.x, home.y, beast.scale);
      animal.setDepth(-7);
      grazeInSmallArea(this, animal, home.x, home.y, beast.rider ? 9 : 15, beast.seed, -1);
    }
  }

  /**
   * What moves on the front page: the water, and the birds over it.
   *
   * The Đông Hồ menu had four banners twitching and nothing else — a printed picture with a corner
   * flapping. The river is the largest thing on the sheet and was the most obviously frozen, so it
   * carries the load: strokes ride the surface downstream and fade at each end of their run.
   */
  private drawDongHoWeather(river: MenuRiver): void {
    const rand = mulberry32(6100);

    for (let index = 0; index < 8; index += 1) {
      const stroke = this.add.graphics().setDepth(-7);
      const width = 5 + rand() * 5;
      inkPath(stroke, [{ x: -width, y: 0 }, { x: width, y: 1 }], 6200 + index,
        { width: 0.6, alpha: 0.5, colour: PIGMENT.cham, wobble: 0.4, step: 6 });

      // Each stroke keeps its own lane across the channel so they do not all run down the middle.
      const lane = rand();
      const drift = { t: rand() };
      const place = (): void => {
        const y = 300 + drift.t * 250;
        const span = river.spanAt(y);
        if (!span) {
          stroke.setAlpha(0);
          return;
        }
        stroke.setPosition(span.left + 4 + lane * Math.max(2, span.right - span.left - 8), this.vy(y));
        // Fade in and out at the ends of the run, so nothing pops into existence mid-water.
        stroke.setAlpha(Math.sin(drift.t * Math.PI) * 0.9);
      };
      place();
      this.tweens.add({
        targets: drift,
        t: 1,
        duration: 9000 + index * 1100,
        repeat: -1,
        ease: 'Linear',
        onUpdate: place,
      });
    }

    // No birds. Two herons were tried here and cut: this composition has no sky to fly in — the
    // karst reaches the title's own rule — so they crossed the rock face, and a filled `heron` at
    // the size that fits reads unmistakably as a fish. The water and the herd carry the motion.
  }

  /** Illustrated parchment landscape matching the selectable atlas map style. */
  private drawAtlasLandscape(): void {
    const g = this.add.graphics();
    const rng = createMenuRng(1904);
    const { ink, inkSoft, water, waterDeep, waterHighlight, terrain, fog } = this.mapRenderer.palette;

    // Soft horizon haze so the receding ranges read as distance.
    g.fillStyle(fog, 0.45);
    g.fillRect(0, 150, GAME_WIDTH, 96);

    // Layered ink-silhouette ranges along the horizon (drawn before the land so it overlaps their base).
    this.mapRenderer.decorateTerrain(g, 'mountains', [
      { x: 40, y: 214 }, { x: 122, y: 206 }, { x: 210, y: 212 }, { x: 300, y: 204 }, { x: 372, y: 214 },
    ], 58, createMenuRng(806));

    // Rolling plains from the horizon to the foot of the page.
    const mainLand = [
      { x: -20, y: 250 }, { x: 70, y: 232 }, { x: 158, y: 246 }, { x: 246, y: 226 },
      { x: 330, y: 244 }, { x: GAME_WIDTH + 20, y: 250 },
      { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 }, { x: -20, y: GAME_HEIGHT + 20 },
    ];
    washFill(g, mainLand, terrain.plains, 0.92, () => rng());
    inkOutline(g, mainLand.slice(0, 6), inkSoft, 0.2, false, 31);

    // Left-bank forest band with scattered groves.
    const forestShape = [
      { x: -20, y: 238 }, { x: 96, y: 230 }, { x: 196, y: 250 }, { x: 196, y: 320 },
      { x: 158, y: 430 }, { x: 120, y: 540 }, { x: 78, y: 648 }, { x: 36, y: 752 }, { x: -20, y: 844 },
    ];
    washFill(g, forestShape, terrain.forest, 0.78, () => rng());
    // A handful of distinct groves in the upper-left bank, all kept above the button column.
    this.mapRenderer.decorateTerrain(g, 'forest', [
      { x: 56, y: 300 }, { x: 116, y: 356 }, { x: 40, y: 424 }, { x: 100, y: 452 },
    ], 44, createMenuRng(444));

    // Right-bank rice terraces.
    const riceShape = [
      { x: 232, y: 320 }, { x: GAME_WIDTH + 20, y: 296 }, { x: GAME_WIDTH + 20, y: 560 },
      { x: 250, y: 572 }, { x: 214, y: 448 },
    ];
    washFill(g, riceShape, terrain.riceFields, 0.7, () => rng());
    this.mapRenderer.decorateTerrain(g, 'riceFields', [
      { x: 322, y: 372 }, { x: 346, y: 452 },
    ], 50, createMenuRng(555));

    // Lower plains behind the button column.
    const lowerPlains = [
      { x: -20, y: 560 }, { x: GAME_WIDTH + 20, y: 560 },
      { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 }, { x: -20, y: GAME_HEIGHT + 20 },
    ];
    washFill(g, lowerPlains, shade(terrain.plains, 0.96), 0.5, () => rng());

    // A broad hand-drawn river dividing the two banks.
    const river = [
      { x: 214, y: 226 }, { x: 200, y: 320 }, { x: 224, y: 414 }, { x: 196, y: 512 },
      { x: 214, y: 612 }, { x: 178, y: 726 }, { x: 188, y: 844 },
    ];
    brushStroke(g, river, 40, ink, 0.42, 705);
    brushStroke(g, river, 34, water, 0.97, 719);
    brushStroke(g, river, 12, waterHighlight, 0.72, 727);
    for (let index = 0; index < river.length - 1; index += 1) {
      waveLine(g, river[index].x - 12, river[index].y + 10, river[index].x + 12, river[index].y + 10, 2, 4, waterDeep, 0.4);
    }

    // Fortified citadel on the right bank, rendered with the shared iso building renderer.
    const citadelCenter = { x: 312, y: 256 };
    const wallG = this.add.graphics();
    this.mapItems.drawCityWall(wallG, ringEdges(citadelCenter.x, citadelCenter.y, 46, 30));
    const citadel = this.add.container(0, 0);
    this.mapItems.addCityCluster(citadel, [citadelCenter, { x: 328, y: 282 }], false, 'city');

    // Riverside villages in the open strip beside the button column.
    const villages = this.add.container(0, 0);
    this.mapItems.addCottage(villages, 362, 596, 0.95);
    this.mapItems.addCottage(villages, 356, 662, 0.85);
  }

  private drawLandscape(): void {
    const g = this.add.graphics();
    const rng = createMenuRng(1307);

    // Pale mist at the horizon – fades into the sea-teal background
    g.fillGradientStyle(PIGMENT.diepHi, PIGMENT.diepHi, PIGMENT.diepLo, PIGMENT.diepLo, 0.55);
    g.fillRect(0, 0, GAME_WIDTH, 252);

    // Layered mountains drawn before the land polygon so they sit behind it
    this.drawMenuMountains(g);

    // Main land polygon – rolling fields from horizon to bottom
    const mainLand = [
      { x: -20, y: 252 },
      { x: 64, y: 228 },
      { x: 148, y: 244 },
      { x: 230, y: 218 },
      { x: 312, y: 236 },
      { x: GAME_WIDTH + 20, y: 250 },
      { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 },
      { x: -20, y: GAME_HEIGHT + 20 },
    ];
    washFill(g, mainLand, PIGMENT.hoePale, 0.88, () => rng());
    inkOutline(g, mainLand.slice(0, 6), PIGMENT.mucSoft, 0.22, false, 31);

    // Forest – organic shape that fills the entire left bank of the river.
    // Right edge follows the river control points with a small inset so the
    // river stroke visually reads as the border between forest and fields.
    const forestShape = [
      { x: -20, y: 236 },
      { x: 88, y: 228 },
      { x: 192, y: 246 },
      // river left bank: mirror river control points with ~6 px inset
      { x: 192, y: 306 },
      { x: 166, y: 412 },
      { x: 134, y: 524 },
      { x: 90, y: 632 },
      { x: 46, y: 740 },
      { x: 14, y: 844 },
      { x: -20, y: 844 },
    ];
    washFill(g, forestShape, PIGMENT.giDong, 0.80, () => rng());

    // Tree silhouettes distributed across the full forest band
    this.mapRenderer.decorateTerrain(g, 'forest', [
      { x: 42, y: 272 },
      { x: 106, y: 292 },
      { x: 58, y: 362 },
      { x: 144, y: 350 },
      { x: 26, y: 438 },
      { x: 112, y: 424 },
      { x: 62, y: 516 },
      { x: 88, y: 578 },
      { x: 28, y: 618 },
      { x: 56, y: 676 },
      { x: 22, y: 722 },
      { x: 46, y: 774 },
    ], 44, createMenuRng(444));

    // Rice terraces – right side of the river
    const riceShape = [
      { x: 220, y: 328 },
      { x: GAME_WIDTH + 20, y: 300 },
      { x: GAME_WIDTH + 20, y: 540 },
      { x: 234, y: 554 },
      { x: 200, y: 450 },
    ];
    washFill(g, riceShape, PIGMENT.giDongPale, 0.74, () => rng());

    const riceRng = createMenuRng(555);
    for (let y = 336; y <= 520; y += 30) {
      waveLine(g, 222, y, GAME_WIDTH - 14, y - 7, 2.5, 8, PIGMENT.mucSoft, 0.28);
    }
    this.mapRenderer.decorateTerrain(g, 'riceFields', [{ x: 306, y: 376 }, { x: 358, y: 442 }, { x: 300, y: 496 }], 52, riceRng);

    // Lower plains behind the button row
    const lowerPlains = [
      { x: -20, y: 498 },
      { x: GAME_WIDTH + 20, y: 498 },
      { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 },
      { x: -20, y: GAME_HEIGHT + 20 },
    ];
    washFill(g, lowerPlains, shade(PIGMENT.giDongPale, 0.96), 0.60, () => rng());

    for (let y = 518; y < 780; y += 44) {
      brushStroke(g, [{ x: 14, y }, { x: GAME_WIDTH - 14, y: y - 10 }], 0.9, PIGMENT.mucFaint, 0.14, y + 500);
    }

    // River from mountain area, flowing through forest to the sea
    this.drawInkRiver();
  }

  /**
   * Two-layer mountain range drawn manually for the menu:
   *   – Far layer: pale, low-alpha silhouettes near the horizon
   *   – Near layer: solid peaks with inner ridge, snow cap, and mist band
   */
  private drawMenuMountains(g: Phaser.GameObjects.Graphics): void {
    // ── Far range – horizon silhouettes ──────────────────────────────────
    const farRng = createMenuRng(800);
    const farPeaks = [
      { cx: 52,  baseY: 228, halfW: 64, h: 70 },
      { cx: 152, baseY: 218, halfW: 82, h: 88 },
      { cx: 256, baseY: 224, halfW: 70, h: 76 },
      { cx: 362, baseY: 216, halfW: 60, h: 82 },
    ];
    for (const { cx, baseY, halfW, h } of farPeaks) {
      const jx = (farRng() - 0.5) * 14;
      const pts = [
        { x: cx - halfW,            y: baseY },
        { x: cx - halfW * 0.30,     y: baseY - h * 0.44 },
        { x: cx + jx,               y: baseY - h },
        { x: cx + halfW * 0.34,     y: baseY - h * 0.40 },
        { x: cx + halfW,            y: baseY },
      ];
      washFill(g, pts, shade(PIGMENT.diepLo, 1.10), 0.30);
      inkOutline(g, pts, PIGMENT.mucFaint, 0.16, false, cx);
      // Mist streak across lower slopes
      g.fillStyle(PIGMENT.diepHi, 0.16);
      g.fillEllipse(cx, baseY - h * 0.30, halfW * 1.7, h * 0.22);
    }

    // ── Near range – right side, behind citadel ───────────────────────────
    const nearRng = createMenuRng(305);
    const nearPeaks = [
      { cx: 302, baseY: 272, halfW: 76, h: 94 },
      { cx: 368, baseY: 260, halfW: 62, h: 110 },
    ];
    for (const { cx, baseY, halfW, h } of nearPeaks) {
      const jx = (nearRng() - 0.5) * 10;
      // Main silhouette with a secondary shoulder peak
      const pts = [
        { x: cx - halfW,             y: baseY },
        { x: cx - halfW * 0.56,      y: baseY - h * 0.52 },
        { x: cx - halfW * 0.16 + jx, y: baseY - h * 0.80 },
        { x: cx + jx,                y: baseY - h },
        { x: cx + halfW * 0.22 + jx, y: baseY - h * 0.84 },
        { x: cx + halfW * 0.52,      y: baseY - h * 0.48 },
        { x: cx + halfW,             y: baseY },
      ];
      washFill(g, pts, shade(PIGMENT.diepLo, 0.86), 0.88);
      inkOutline(g, pts, PIGMENT.muc, 0.60, false, cx);

      // Fainter inner ridge for depth
      const innerPts = [
        { x: cx - halfW * 0.54,      y: baseY - 2 },
        { x: cx - halfW * 0.20 + jx, y: baseY - h * 0.74 },
        { x: cx + jx,                y: baseY - h * 0.96 },
        { x: cx + halfW * 0.26 + jx, y: baseY - h * 0.76 },
        { x: cx + halfW * 0.52,      y: baseY - 2 },
      ];
      inkOutline(g, innerPts, PIGMENT.mucSoft, 0.26, false, cx + 11);

      // Snow cap at peak
      g.fillStyle(PIGMENT.diepHi, 0.84);
      g.fillTriangle(
        cx + jx,                     baseY - h,
        cx + jx - halfW * 0.22,      baseY - h * 0.72,
        cx + jx + halfW * 0.20,      baseY - h * 0.68,
      );

      // Mist band across mid-slopes
      g.fillStyle(PIGMENT.diepHi, 0.22);
      g.fillEllipse(cx, baseY - h * 0.40, halfW * 1.5, h * 0.20);
    }
  }

  private drawInkRiver(): void {
    const river = this.add.graphics();
    const riverPoints = [
      { x: 16,  y: 844 },
      { x: 52,  y: 738 },
      { x: 96,  y: 630 },
      { x: 140, y: 522 },
      { x: 172, y: 410 },
      { x: 194, y: 318 },
      { x: 200, y: 226 },
    ];
    brushStroke(river, riverPoints, 26, PIGMENT.cham, 0.54, 87);
    brushStroke(river, riverPoints, 18,  PIGMENT.chamWash, 0.46, 91);
    const rng = createMenuRng(91);
    for (const point of riverPoints) {
      this.mapRenderer.decorateTerrain(river, 'water', [point], 44, rng);
    }
    for (let index = 0; index < 6; index += 1) {
      waveLine(river, 26 + index * 28, 816 - index * 96, 72 + index * 26, 806 - index * 96, 3, 5, PIGMENT.chamWash, 0.20);
    }
  }

  /** Two opposing armies facing each other across the river. */
  private drawArmies(): void {
    const g = this.add.graphics();

    // Right bank – Dai Viet (player), all same red with same flag.
    // Kept in the upper field so nothing collides with the button column below (y ≥ 512).
    const rightFormations = [
      { cx: 268, cy: 356, cols: 5, rows: 3 },
      { cx: 316, cy: 438, cols: 4, rows: 3 },
    ];
    for (const { cx, cy, cols, rows } of rightFormations) {
      this.drawSoldiers(g, cx, cy, this.mapRenderer.palette.mapObjects.player, cols, rows);
      const totalW = (cols - 1) * 11;
      const totalH = (rows - 1) * 11;
      const flag = this.mapItems.createPlayerLandFlag(false, this.previewFlagSeed);
      flag.setPosition(cx + totalW / 2 + 14, cy + totalH / 2 + 4);
    }

    // Left bank – enemy army, all same dark olive with same flag.
    const leftFormations = [
      { cx: 100, cy: 356, cols: 4, rows: 3 },
      { cx: 62,  cy: 438, cols: 5, rows: 3 },
    ];
    const enemySeed = this.previewFlagSeed + 777;
    for (const { cx, cy, cols, rows } of leftFormations) {
      this.drawSoldiers(g, cx, cy, this.mapRenderer.palette.mapObjects.rival, cols, rows);
      const totalW = (cols - 1) * 11;
      const totalH = (rows - 1) * 11;
      const flag = this.mapItems.createPlayerLandFlag(false, enemySeed);
      flag.setPosition(cx - totalW / 2 - 14, cy + totalH / 2 + 4);
    }
  }

  /** Draws a cols×rows grid of soldier silhouettes (body + head + spear). */
  private drawSoldiers(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    bodyColor: number,
    cols: number,
    rows: number,
  ): void {
    const spacing = 11;
    const startX = x - (cols - 1) * spacing / 2;
    const startY = y - (rows - 1) * spacing / 2;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const sx = startX + col * spacing;
        const sy = startY + row * spacing;
        g.fillStyle(bodyColor, 0.82);
        g.fillRect(sx - 2, sy, 4, 6);
        g.fillStyle(shade(bodyColor, 1.28), 0.82);
        g.fillCircle(sx, sy - 2, 2.4);
        g.lineStyle(0.8, this.mapRenderer.palette.ink, 0.55);
        g.lineBetween(sx + 1, sy - 4, sx + 1, sy - 11);
      }
    }
  }

  private drawFogBands(): void {
    const clouds = [
      { x: 64,  y: 154, radius: 48, seed: 91,  alpha: 0.72 },
      { x: 306, y: 594, radius: 38, seed: 207, alpha: 0.58 },
      { x: 116, y: 736, radius: 42, seed: 332, alpha: 0.42 },
    ];
    for (const config of clouds) {
      const cloud = this.add.graphics();
      this.mapRenderer.drawCloud(cloud, config.x, config.y, config.radius, config.seed, config.alpha);
      this.tweens.add({
        targets: cloud,
        x: 16,
        duration: 9000 + config.x * 12,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /**
   * The dynastic seal: a lotus rising inside a square cartouche.
   *
   * Two things made it read as "scaled wrong". It was collected into the squashed landscape layer,
   * so on a phone sheet a circle came out a third wider than tall — fixed by drawing it after that
   * layer and scaling it *uniformly*. And the flower itself was five wide `fillEllipse` calls making
   * a fan 66 units across and 44 high: wider than it was tall, spilling past both sides of the frame
   * that was supposed to contain it, and reading as a squashed shell rather than a lotus. It is now
   * built from petals swung out around the stem, taller than the flower is wide, sized to sit inside
   * the cartouche.
   */
  private drawDaiVietLotusSeal(): void {
    const seal = this.add.graphics({ x: GAME_WIDTH / 2, y: this.vy(66) }).setDepth(-6);
    seal.setScale(this.vScale);

    seal.fillStyle(PIGMENT.sonDeep, 0.94);
    seal.fillCircle(0, 0, 44);
    seal.lineStyle(5, INK_UI.gold, 0.92);
    seal.strokeCircle(0, 0, 44);

    seal.fillStyle(shade(PIGMENT.sonDeep, 0.72), 0.34);
    seal.fillCircle(0, 0, 34);
    seal.lineStyle(1.4, INK_UI.goldLight, 0.48);
    seal.strokeCircle(0, 0, 32);

    // 40 across the flats, so the cartouche's corners stay inside the inner ring.
    seal.lineStyle(2.2, INK_UI.gold, 0.78);
    seal.strokeRoundedRect(-20, -23, 40, 45, 7);

    seal.lineStyle(3.4, PIGMENT.muc, 0.3);
    seal.lineBetween(0, 19, 0, 5);
    seal.lineStyle(2.1, INK_UI.goldLight, 0.94);
    seal.lineBetween(0, 19, 0, 5);

    // Two lotus pads floating either side of the stem, drawn before the flower.
    for (const sign of [-1, 1] as const) {
      const pad = petalOutline(sign * 2, 10, 7.5, 12, sign * 1.35);
      seal.fillStyle(shade(INK_UI.gold, 0.9), 0.92);
      seal.fillPoints(pad, true);
      seal.lineStyle(0.9, PIGMENT.muc, 0.35);
      seal.strokePoints(pad, true);
    }

    // Petals, outermost first so the centre one reads in front. Each pair swings further out than
    // the last and stands shorter, which is what makes an open lotus rather than a sheaf of wheat.
    const petals: Array<{ angle: number; height: number; width: number; colour: number }> = [
      { angle: -0.82, height: 18, width: 8.5, colour: shade(INK_UI.gold, 0.92) },
      { angle: 0.82, height: 18, width: 8.5, colour: shade(INK_UI.gold, 0.92) },
      { angle: -0.44, height: 25, width: 9.5, colour: INK_UI.gold },
      { angle: 0.44, height: 25, width: 9.5, colour: INK_UI.gold },
      { angle: 0, height: 31, width: 10.5, colour: INK_UI.goldLight },
    ];
    for (const petal of petals) {
      const points = petalOutline(0, 6, petal.width, petal.height, petal.angle);
      seal.fillStyle(petal.colour, 0.98);
      seal.fillPoints(points, true);
      seal.lineStyle(1, PIGMENT.muc, 0.5);
      seal.strokePoints(points, true);
      // Centre vein, so each petal reads separately against its neighbour.
      seal.lineStyle(0.8, PIGMENT.muc, 0.3);
      seal.lineBetween(0, 6, Math.sin(petal.angle) * petal.height * 0.82, 6 - Math.cos(petal.angle) * petal.height * 0.82);
    }

    seal.fillStyle(INK_UI.gold, 0.98);
    seal.fillEllipse(0, 7, 13, 6);
    seal.lineStyle(1, PIGMENT.muc, 0.4);
    seal.strokeEllipse(0, 7, 13, 6);
  }

  private render(): void {
    this.clearContent();
    this.renderTitle();
    if (this.mode === 'settings') {
      this.renderSettings();
      return;
    }
    if (this.mode === 'confirm-new') {
      this.renderConfirmNew();
    } else if (this.mode === 'legacy') {
      this.renderLegacyShop();
    } else if (this.mode === 'classic') {
      this.renderClassic();
    } else {
      this.renderMain();
    }
  }

  private renderTitle(): void {
    const shadow = this.ui.label(GAME_WIDTH / 2 + 2, this.vy(130), 'MANDATE', 'title', {
      color: '#301509',
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(36 * this.vScale)}px`,
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5);
    const title = this.ui.label(GAME_WIDTH / 2, this.vy(127), 'MANDATE', 'title', {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(36 * this.vScale)}px`,
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5);
    const subtitleShadow = this.ui.label(GAME_WIDTH / 2 + 1, this.vy(161), 'OF ĐẠI VIỆT', 'title', {
      color: '#301509',
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(19 * this.vScale)}px`,
      fontStyle: '700',
    }).setOrigin(0.5);
    const subtitle = this.ui.label(GAME_WIDTH / 2, this.vy(159), 'OF ĐẠI VIỆT', 'title', {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(19 * this.vScale)}px`,
      fontStyle: '700',
    }).setOrigin(0.5);
    const rule = this.add.rectangle(GAME_WIDTH / 2, this.vy(184), 210, 2, INK_UI.gold, 0.88);
    this.content.push(shadow, title, subtitleShadow, subtitle, rule);
  }

  /**
   * The front page's button column, stacked by flow.
   *
   * Every row used to sit at a fixed y measured against an 844-tall sheet. The gaps between them
   * scale with the sheet; the type inside them does not, and a tagline that is one line in English
   * is two in Vietnamese. On a short viewport the tagline landed across the button under it and
   * the save stamp across the one under that. Measuring each row and starting the next below it
   * cannot produce that, in any language, at any height.
   */
  private renderMain(): void {
    const saved = hasSnapshot();

    // The settings block is pinned to the bottom of the sheet, so the column above it has a hard
    // floor. Both texts are built first because only Phaser knows how many lines they wrap to, and
    // then the gaps are shared out of whatever room is left — which is how the page fits at any
    // height in any language instead of fitting at 844 in English.
    const tagline = this.add.text(GAME_WIDTH / 2, 0, t('ascent.menu.tagline'), {
      color: '#8a5f1c',
      fontFamily: UI_FONT,
      fontSize: '11px',
      align: 'center',
      wordWrap: { width: 270 },
    }).setOrigin(0.5, 0);
    const saveLabel = this.add.text(GAME_WIDTH / 2, 0, snapshotLabel(), {
      color: saved ? '#2a2118' : '#5a4c39',
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: '700',
      align: 'center',
      backgroundColor: 'rgba(243,230,196,0.72)',
      padding: { x: 6, y: 3 },
      wordWrap: { width: 250 },
    }).setOrigin(0.5, 0);

    // The column sits against the settings button rather than at a fixed height, so the art above
    // it keeps whatever room is left over instead of the page ending in a hole.
    const rows = this.vh(58) + this.vh(46) + this.vh(42) + tagline.height + saveLabel.height;
    const floor = SETTINGS_TOP - 18;
    const gap = Phaser.Math.Clamp(Math.round((floor - this.vy(470) - rows) / 4), 4, Math.round(16 * this.vScale));
    let cursor = Math.max(this.vy(420), floor - rows - gap * 4);

    this.content.push(this.ui.button({ x: 54, y: cursor, width: 282, height: this.vh(58) }, t('ascent.menu.title'), () => {
      this.startAscentRun();
    }, { variant: 'primary', fontSize: '17px' }));
    cursor += this.vh(58) + gap;

    tagline.setY(cursor);
    this.content.push(tagline);
    cursor += tagline.height + gap;

    this.content.push(this.ui.button({ x: 54, y: cursor, width: 282, height: this.vh(46) }, t('ascent.menu.classic'), () => {
      this.mode = 'classic';
      this.render();
    }, { variant: 'secondary', fontSize: '15px' }));
    cursor += this.vh(46) + gap;

    this.content.push(this.ui.button({ x: 54, y: cursor, width: 282, height: this.vh(42) }, t('menu.continue'), () => {
      const snapshot = loadSnapshot();
      if (snapshot) {
        this.startGame(snapshot.state);
      }
    }, { variant: saved ? 'ghost' : 'disabled', fontSize: '15px' }));
    cursor += this.vh(42) + Math.round(gap * 0.6);

    saveLabel.setY(cursor);
    this.content.push(saveLabel);
    cursor += saveLabel.height + gap;

    this.content.push(this.ui.button(
      { x: 108, y: SETTINGS_TOP + 6, width: 174, height: this.vh(34) },
      t('menu.settings'),
      () => {
        this.mode = 'settings';
        this.render();
      },
      { variant: 'ghost', fontSize: '13px' },
    ));

    this.renderSupportRow();

    // Lifetime standing across all Throne of Empires runs (hidden until earned).
    // Tapping it opens the Ascension Legacy shop, where banked points buy permanent perks.
    const legacy = getLegacy();
    if ((legacy.points > 0 || legacy.bestScore > 0) && cursor + this.vh(30) + 18 < SETTINGS_TOP) {
      const rankLabel = this.add.text(GAME_WIDTH / 2, cursor, t('empire.legacy.rank', {
        rank: rankForScore(legacy.bestScore),
        total: legacy.points,
      }), {
        color: '#2a2118',
        fontFamily: UI_FONT,
        fontSize: '11px',
        align: 'center',
        backgroundColor: 'rgba(243,230,196,0.72)',
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      rankLabel.on('pointerup', () => { this.mode = 'legacy'; this.render(); });
      this.content.push(rankLabel);
      cursor += rankLabel.height + Math.round(gap * 0.5);
      this.content.push(this.ui.button({ x: 108, y: cursor, width: 174, height: this.vh(30) }, t('empire.legacy.openShop'), () => {
        this.mode = 'legacy';
        this.render();
      }, { variant: 'ghost', fontSize: '12px' }));
    }
  }

  /**
   * Both hand-played modes, stacked by flow rather than at fixed heights.
   *
   * `InkUI.card` grows to fit whatever its body wraps to and reports the result — the requested
   * height is only a minimum — so a caller that puts the next card at a hardcoded y is asserting a
   * height the card never promised. In Vietnamese the blurbs run a line longer and the two cards
   * climbed on top of each other. Each one now starts below the last one actually ended.
   */
  private renderClassic(): void {
    let cursor = this.vy(250);
    const title = this.add.text(GAME_WIDTH / 2, cursor, t('ascent.menu.classicTitle'), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '20px',
      fontStyle: '700',
      align: 'center',
      wordWrap: { width: GAME_WIDTH - 56 },
    }).setOrigin(0.5, 0);
    this.content.push(title);
    cursor += title.height + 16;

    for (const mode of [
      {
        title: t('empire.menu.title'),
        body: t('ascent.menu.empireBlurb'),
        border: INK_UI.gold,
        variant: 'primary' as const,
        start: 'empire' as const,
      },
      {
        title: t('menu.startCampaign'),
        body: t('ascent.menu.campaignBlurb'),
        border: INK_UI.softBrush,
        variant: 'secondary' as const,
        start: 'campaign' as const,
      },
    ]) {
      const card = this.ui.card({ x: 28, y: cursor, width: GAME_WIDTH - 56, height: this.vh(88) }, {
        title: mode.title,
        body: mode.body,
        border: mode.border,
        actionPlacement: 'bottom',
        action: {
          label: t('ascent.menu.play'),
          variant: mode.variant,
          onClick: () => this.scene.start('CampaignScene', { mode: mode.start }),
        },
      });
      this.content.push(card);
      cursor += (card.getData('cardHeight') as number) + 14;
    }

    this.content.push(this.ui.button({ x: 54, y: cursor + 6, width: 282, height: this.vh(44) }, t('ascent.menu.back'), () => {
      this.mode = 'main';
      this.render();
    }, { variant: 'secondary', fontSize: '14px' }));
  }

  /**
   * Dragon Ascent skips the setup screen entirely: the founder choice is the run's first
   * in-game prompt, so starting a run is one tap and no menu.
   */
  private startAscentRun(): void {
    const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    this.scene.start('ConquestScene', { state });
  }

  private renderLegacyShop(): void {
    const legacy = getLegacy();
    this.content.push(this.add.text(GAME_WIDTH / 2, this.vy(236), t('empire.legacy.shopTitle'), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '20px', fontStyle: '700', align: 'center',
    }).setOrigin(0.5));
    this.content.push(this.add.text(GAME_WIDTH / 2, this.vy(262), t('empire.legacy.banked', { total: legacy.points }), {
      color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '13px', align: 'center',
    }).setOrigin(0.5));

    let y = 290;
    for (const perk of LEGACY_PERKS) {
      const owned = legacy.perks.includes(perk.id);
      const affordable = legacy.points >= perk.cost;
      this.content.push(this.ui.card({ x: 28, y, width: GAME_WIDTH - 56, height: 74 }, {
        title: t(`empire.legacy.perk.${perk.id}` as Parameters<typeof t>[0]),
        subtitle: owned ? t('empire.legacy.owned') : t('empire.legacy.cost', { cost: perk.cost }),
        body: t(`empire.legacy.perk.${perk.id}.d` as Parameters<typeof t>[0]),
        border: owned ? INK_UI.jade : affordable ? INK_UI.gold : INK_UI.softBrush,
        muted: !owned && !affordable,
        actionPlacement: 'right',
        action: {
          label: owned ? t('empire.legacy.ownedShort') : t('empire.legacy.buy'),
          variant: owned ? 'disabled' : affordable ? 'primary' : 'disabled',
          disabled: owned || !affordable,
          onClick: () => {
            if (purchaseLegacyPerk(perk.id)) this.render();
          },
        },
      }));
      y += 82;
    }

    this.content.push(this.ui.button({ x: 54, y: Math.min(y + 6, this.vy(726)), width: 282, height: this.vh(44) }, t('menu.back'), () => {
      this.mode = 'main';
      this.render();
    }, { variant: 'secondary', fontSize: '14px' }));
  }

  /**
   * One row of mutually exclusive settings: a heading and a strip of tiles.
   *
   * Style, graphics and language were three copies of the same twenty lines, which is why they had
   * drifted to three different tile heights.
   */
  private renderChoiceRow<T extends string>(
    y: number,
    heading: string,
    options: ReadonlyArray<{ id: T; label: string }>,
    current: T,
    pick: (id: T) => void,
  ): void {
    const itemWidth = Math.min(112, (GAME_WIDTH - 24) / options.length);
    const itemHeight = 28;
    const x = GAME_WIDTH / 2 - (itemWidth * options.length) / 2;

    this.content.push(this.ui.label(GAME_WIDTH / 2, y - 15, heading, 'caption', {
      color: '#3a2a14', fontSize: '10px', fontStyle: '700', align: 'center',
      backgroundColor: 'rgba(243,230,196,0.55)', padding: { x: 5, y: 1 },
    }).setOrigin(0.5, 0));

    options.forEach((option, index) => {
      const selected = current === option.id;
      const bounds = { x: x + index * itemWidth + 3, y, width: itemWidth - 6, height: itemHeight };
      const tile = this.ui.crayonTile(bounds, { selected });
      const label = this.ui.label(bounds.x + bounds.width / 2, y + itemHeight / 2, option.label, 'button', {
        color: '#211103', fontSize: '11px', fontStyle: selected ? '700' : '400', align: 'center',
      }).setOrigin(0.5);
      const hit = this.add
        .rectangle(bounds.x + bounds.width / 2, y + itemHeight / 2, bounds.width, itemHeight, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => pick(option.id));
      this.content.push(tile, label, hit);
    });
  }

  private renderMapThemeSelector(): void {
    this.renderChoiceRow(
      GAME_HEIGHT - 90,
      t('menu.mapTheme'),
      MAP_THEME_OPTIONS.map((option) => ({ id: option.id, label: t(option.labelKey) })),
      getMapTheme(),
      (id) => {
        setMapTheme(id);
        this.scene.restart();
      },
    );
  }

  /**
   * How much resolution and detail to spend.
   *
   * Reloads rather than restarting the scene: the drawing buffer is sized once when the game is
   * constructed, so a new render scale cannot take effect without building the game again.
   */
  private renderGraphicsSelector(): void {
    this.renderChoiceRow(
      SETTINGS_TOP,
      t('menu.graphics'),
      GRAPHICS_QUALITIES.map((id) => ({ id, label: t(`menu.graphics.${id}` as 'menu.graphics.low') })),
      getGraphicsQuality(),
      (id) => {
        if (id === getGraphicsQuality()) {
          return;
        }
        setGraphicsQuality(id);
        window.location.reload();
      },
    );
  }

  /**
   * Graphics, map style and language, on a page of their own.
   *
   * All three were on the home screen, stacked above each other in the bottom third — a wall of
   * nine buttons in front of a player who wants to press Play. They are set once and then never
   * again, which is exactly what a settings page is for.
   */
  private renderSettings(): void {
    // A plate to read on. Three rows of small labels sitting straight on a landscape is the one
    // place in the game where the art actively fights the text.
    const rowGap = 62;
    const plateTop = this.vy(232);
    const plateHeight = Math.min(GAME_HEIGHT - plateTop - 24, 62 + rowGap * 3 + this.vh(44) + 40);
    this.content.push(this.ui.panel(
      { x: 16, y: plateTop, width: GAME_WIDTH - 32, height: plateHeight },
      { fill: INK_UI.parchment, fillAlpha: 0.94 },
    ));

    let cursor = plateTop + 18;
    const title = this.add.text(GAME_WIDTH / 2, cursor, t('menu.settingsTitle'), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '20px',
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5, 0);
    this.content.push(title);
    cursor += title.height + 26;

    this.renderChoiceRow(
      cursor,
      t('menu.graphics'),
      GRAPHICS_QUALITIES.map((id) => ({ id, label: t(`menu.graphics.${id}` as 'menu.graphics.low') })),
      getGraphicsQuality(),
      (id) => {
        if (id === getGraphicsQuality()) {
          return;
        }
        setGraphicsQuality(id);
        window.location.reload();
      },
    );
    cursor += rowGap;

    this.renderChoiceRow(
      cursor,
      t('menu.mapTheme'),
      MAP_THEME_OPTIONS.map((option) => ({ id: option.id, label: t(option.labelKey) })),
      getMapTheme(),
      (id) => {
        setMapTheme(id);
        this.scene.restart();
      },
    );
    cursor += rowGap;

    this.renderChoiceRow(
      cursor,
      t('menu.language'),
      [{ id: 'en' as LanguageCode, label: 'English' }, { id: 'vi' as LanguageCode, label: 'Tiếng Việt' }],
      getLanguage(),
      (code) => {
        setLanguage(code);
        this.render();
      },
    );
    cursor += rowGap + 8;

    this.content.push(this.ui.button({ x: 54, y: cursor, width: 282, height: this.vh(44) }, t('menu.back'), () => {
      this.mode = 'main';
      this.render();
    }, { variant: 'secondary', fontSize: '14px' }));
  }

  private renderConfirmNew(): void {
    const panel = this.ui.card({ x: 28, y: this.vy(528), width: GAME_WIDTH - 56, height: this.vh(178) }, {
      title: t('menu.startNewQuestion'),
      body: t('menu.savedSnapshotKept'),
      border: INK_UI.gold,
      fill: 0xd9c584,
    });
    this.content.push(panel);

    this.content.push(this.ui.button({ x: 54, y: this.vy(632), width: 282, height: this.vh(46) }, t('menu.startNewCampaign'), () => {
      this.startGame(createInitialGameState());
      // Note: full campaign setup is via "Start Campaign" → CampaignScene
    }, { variant: 'danger', fontSize: '14px' }));
    this.content.push(this.ui.button({ x: 54, y: this.vy(690), width: 282, height: this.vh(44) }, t('menu.back'), () => {
      this.mode = 'main';
      this.render();
    }, { variant: 'secondary', fontSize: '14px' }));
  }

  /**
   * The line at the foot of the front page: a coffee, and — better — a hand with the game.
   *
   * One sentence, not two controls. They were a pair of ghost buttons, and a button is the game
   * asking you to press it; these are asides, and drawn as chrome they competed with "Dragon
   * Ascent" for the eye while saying nothing about what they lead to. Written out with the words
   * that join them — "Buy me a coffee — or even better, help build the game" — the sentence itself
   * does the persuading, and the two phrases inside it are simply the parts you can press: marked
   * with a glyph, ruled underneath, and cinnabar under the finger.
   *
   * That is also why the second phrase is lowercase in both catalogues. It is the back half of a
   * sentence, not a label, and a capital there gives the game away as two buttons wearing prose.
   *
   * The parts are measured and then centred as one line, so the connective always sits between
   * them whatever it says. Vietnamese runs longer than English here; if the line ever outgrows the
   * sheet it shrinks to fit rather than wrapping under itself, since there is exactly one line of
   * room above the bottom edge.
   */
  private renderSupportRow(): void {
    const row = this.add.container(GAME_WIDTH / 2, SUPPORT_TOP + SUPPORT_ROW_HEIGHT / 2);

    const coffee = this.ui.textLink(0, 0, t('menu.support.coffee'), () => this.renderSupportModal(), { icon: 'cup' });
    const improve = this.ui.textLink(0, 0, t('menu.support.improve'), () => openExternalLink(SUPPORT.github), { icon: 'brush' });
    // Quieter than either phrase, and deliberately not pressable: it is the sentence's connective
    // tissue, and a player hunting for what is clickable must never land on it.
    const connective = this.ui.label(0, 0, t('menu.support.or'), 'caption', {
      color: INK_UI_HEX.mutedText,
      fontSize: '11px',
    }).setOrigin(0, 0.5);

    const gap = 6;
    const coffeeWidth = coffee.getData('linkWidth') as number;
    const improveWidth = improve.getData('linkWidth') as number;
    const total = coffeeWidth + gap + connective.width + gap + improveWidth;

    let cursor = -total / 2;
    coffee.x = cursor;
    cursor += coffeeWidth + gap;
    connective.x = cursor;
    cursor += connective.width + gap;
    improve.x = cursor;

    row.add([coffee, connective, improve]);
    const maxWidth = GAME_WIDTH - 20;
    if (total > maxWidth) {
      row.setScale(maxWidth / total);
    }
    this.content.push(row);
  }

  /**
   * The coffee modal.
   *
   * One channel at a time, chosen by a pair of tabs, because the thing that has to be big is the
   * code: a player on a laptop pays by pointing a phone at the screen, and a code squeezed under
   * two stacked cards is not scannable from arm's length. Under the tabs: what the channel is, the
   * detail a sender would type by hand, Open (the phone path) and Copy link, then the code (the
   * desktop path) — MoMo's own VietQR image when it has been dropped in, otherwise one drawn from
   * the link itself, which any phone camera reads.
   *
   * Everything is measured as it is placed, so a Vietnamese hint that runs a line longer only
   * moves what is under it and the code takes whatever room is left. Nothing sits at a hard y.
   */
  private renderSupportModal(activeId?: SupportChannel['id']): void {
    this.closeModal();
    const channels = configuredSupportChannels();
    const active = channels.find((c) => c.id === activeId) ?? channels[0];

    const HEADER = 104;
    const FOOTER = 66;
    const QR_MAX = 200;
    // Ask for the height the content wants; `modal` caps it at the sheet and the code shrinks to
    // what is left. The empty state has no thanks line and gives the footer band back.
    const wanted = HEADER + FOOTER + 20 + (active ? 214 + QR_MAX + 16 : 124 - FOOTER);

    const modal = this.ui.modal({
      title: t('menu.support.title'),
      subtitle: t('menu.support.subtitle'),
      onClose: () => this.closeModal(),
      height: wanted,
    });
    this.modalObjects.push(...modal.objects);
    const { contentBounds, footerBounds } = modal;
    const centreX = contentBounds.x + contentBounds.width / 2;
    let cursor = contentBounds.y;

    if (!active) {
      const body = this.add.text(centreX, cursor + 6, t('menu.support.none'), {
        color: '#2a2118', fontFamily: UI_FONT, fontSize: '13px', align: 'center', lineSpacing: 3,
        wordWrap: { width: contentBounds.width - 24 },
      }).setOrigin(0.5, 0);
      this.modalObjects.push(body);
      cursor += body.height + 18;
      this.modalObjects.push(this.ui.button(
        { x: centreX - 100, y: cursor, width: 200, height: 40 },
        t('menu.support.github'),
        () => openExternalLink(SUPPORT.github),
        { variant: 'primary', fontSize: '14px' },
      ));
      return;
    }

    // Tabs — only when there is a choice to make.
    if (channels.length > 1) {
      const tabHeight = 30;
      const tabWidth = Math.floor((contentBounds.width - 8 * (channels.length - 1)) / channels.length);
      channels.forEach((channel, index) => {
        const selected = channel.id === active.id;
        const bounds = { x: contentBounds.x + index * (tabWidth + 8), y: cursor, width: tabWidth, height: tabHeight };
        const tile = this.ui.crayonTile(bounds, { selected, accent: channel.id === 'momo' ? INK_UI.cinnabar : INK_UI.jade });
        const label = this.ui.label(bounds.x + bounds.width / 2, cursor + tabHeight / 2, t(`menu.support.${channel.id}.title`), 'button', {
          color: '#211103', fontSize: '12px', fontStyle: selected ? '700' : '400', align: 'center',
        }).setOrigin(0.5);
        const hit = this.add.rectangle(bounds.x + bounds.width / 2, cursor + tabHeight / 2, bounds.width, tabHeight, 0xffffff, 0.001)
          .setInteractive(selected ? undefined : { useHandCursor: true });
        hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          if (!selected) {
            this.renderSupportModal(channel.id);
          }
        });
        this.modalObjects.push(tile, label, hit);
      });
      cursor += tabHeight + 14;
    }

    const hint = this.add.text(contentBounds.x + 6, cursor, t(`menu.support.${active.id}.hint`), {
      color: '#5a4c39', fontFamily: UI_FONT, fontSize: '11px', lineSpacing: 2,
      wordWrap: { width: contentBounds.width - 12 },
    }).setOrigin(0, 0);
    this.modalObjects.push(hint);
    cursor += hint.height + 10;

    // What a sender types by hand — the tag — with Open and Copy link on the same row, right-
    // aligned. A channel with no tag shows the link's host instead: `me.momo.vn` says what it is,
    // and the full address is one tap away on either button, so nobody has to read the token.
    const link = active.link.trim();
    const shownHandle = active.handle.trim() || linkHost(link);
    const rowHeight = 30;
    let bx = contentBounds.x + contentBounds.width - 4;
    const copyWidth = 96;
    bx -= copyWidth;
    const copyX = bx;
    this.modalObjects.push(this.ui.button({ x: copyX, y: cursor, width: copyWidth, height: rowHeight }, t('menu.support.copy'), () => {
      void copyToClipboard(link || shownHandle).then((ok) => {
        if (ok) {
          this.flashCopied(copyX + copyWidth / 2, cursor - 6);
        }
      });
    }, { variant: 'secondary', fontSize: '12px' }));
    if (link) {
      const openWidth = 64;
      bx -= openWidth + 8;
      this.modalObjects.push(this.ui.button({ x: bx, y: cursor, width: openWidth, height: rowHeight }, t('menu.support.open'), () => {
        openExternalLink(link);
      }, { variant: 'primary', fontSize: '12px' }));
    }
    const handle = this.add.text(contentBounds.x + 6, cursor + rowHeight / 2, shownHandle, {
      color: '#2a2118', fontFamily: UI_FONT, fontSize: '14px', fontStyle: '700',
      backgroundColor: 'rgba(243,230,196,0.9)', padding: { x: 7, y: 4 },
      wordWrap: { width: Math.max(60, bx - 10 - (contentBounds.x + 6)), useAdvancedWrap: true },
    }).setOrigin(0, 0.5);
    this.modalObjects.push(handle);
    cursor += Math.max(rowHeight, handle.height) + 14;

    // The code: the official image when it is there, else one drawn from the link.
    const qrKey = supportQrTextureKey(active);
    const hasImage = Boolean(active.qrImage && this.textures.exists(qrKey));
    const drawn = !hasImage && link ? encodeQr(link, 'M') : null;

    // Two captions sit under the code; whatever height is left after them is the code's.
    const how = this.add.text(centreX, 0, t('menu.support.how'), {
      color: '#5a4c39', fontFamily: UI_FONT, fontSize: '10.5px', align: 'center', lineSpacing: 2,
      wordWrap: { width: contentBounds.width - 24 },
    }).setOrigin(0.5, 0);
    const scanLabel = this.add.text(centreX, 0, hasImage ? t('menu.support.qrHint') : t('menu.support.qrPhone'), {
      color: '#5a4c39', fontFamily: UI_FONT, fontSize: '10px', align: 'center',
    }).setOrigin(0.5, 0);
    this.modalObjects.push(how, scanLabel);

    const contentBottom = contentBounds.y + contentBounds.height;
    const captions = scanLabel.height + 6 + how.height + 6;
    const plate = 8; // white margin around the code — the quiet zone a reader needs
    const qrSize = Math.max(96, Math.min(QR_MAX, contentBottom - cursor - captions - plate * 2));

    if (hasImage || drawn) {
      const g = this.add.graphics();
      const left = centreX - qrSize / 2;
      g.fillStyle(0xffffff, 1);
      g.fillRect(left - plate, cursor - plate, qrSize + plate * 2, qrSize + plate * 2);
      g.lineStyle(1.2, INK_UI.brush, 0.6);
      g.strokeRect(left - plate, cursor - plate, qrSize + plate * 2, qrSize + plate * 2);
      this.modalObjects.push(g);
      if (hasImage) {
        const source = this.textures.get(qrKey).getSourceImage() as { width: number; height: number };
        const fit = Math.min(qrSize / source.width, qrSize / source.height);
        this.modalObjects.push(this.add.image(centreX, cursor + qrSize / 2, qrKey).setDisplaySize(source.width * fit, source.height * fit));
      } else if (drawn) {
        drawQrCode(g, drawn, left, cursor, qrSize);
      }
      cursor += qrSize + plate + 6;
    }
    scanLabel.setY(cursor);
    cursor += scanLabel.height + 6;
    how.setY(cursor);

    this.modalObjects.push(this.add.text(footerBounds.x + footerBounds.width / 2, footerBounds.y + footerBounds.height / 2, t('menu.support.thanks'), {
      color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '11px', align: 'center', fontStyle: 'italic',
      wordWrap: { width: footerBounds.width - 16 },
    }).setOrigin(0.5));
  }

  /** A small "Copied ✓" that rises off the button and fades. */
  private flashCopied(x: number, y: number): void {
    const note = this.add.text(x, y, t('menu.support.copied'), {
      color: '#fbf2df', fontFamily: UI_FONT, fontSize: '11px', fontStyle: '700',
      backgroundColor: 'rgba(42,33,24,0.92)', padding: { x: 7, y: 3 },
    }).setOrigin(0.5, 1);
    this.modalObjects.push(note);
    this.tweens.add({
      targets: note, y: y - 14, alpha: { from: 1, to: 0 }, duration: 1300, ease: 'Sine.easeOut',
      onComplete: () => note.destroy(),
    });
  }

  private closeModal(): void {
    for (const item of this.modalObjects) {
      item.destroy();
    }
    this.modalObjects = [];
  }

  private renderLanguageSelector(): void {
    this.renderChoiceRow(
      GAME_HEIGHT - 40,
      t('menu.language'),
      [{ id: 'en' as LanguageCode, label: 'English' }, { id: 'vi' as LanguageCode, label: 'Tiếng Việt' }],
      getLanguage(),
      (code) => {
        setLanguage(code);
        this.render();
      },
    );
  }

  private startGame(state: ReturnType<typeof createInitialGameState>): void {
    // One save slot is shared across modes, so resume into the world scene the run belongs
    // to — an ascent save booted into MapScene would run the classic tick over ascent state.
    this.scene.start(state.gameMode === 'ascent' ? 'ConquestScene' : 'MapScene', { state });
  }

  private clearContent(): void {
    // A re-render underneath an open modal would put fresh buttons on top of its blocker.
    this.closeModal();
    for (const item of this.content) {
      item.destroy();
    }
    this.content = [];
  }
}

/**
 * Draws a QR matrix into `size` design units at (x, y), dark modules in soot on whatever the
 * caller painted underneath (a white plate, with the quiet zone the reader needs).
 *
 * Dark runs are merged along each row and every rectangle is drawn a hair taller than its cell:
 * fractional module widths at RENDER_SCALE 2 otherwise leave antialiased hairline seams between
 * neighbouring modules, and a reader looking for solid finder squares does not care for those.
 */
function drawQrCode(g: Phaser.GameObjects.Graphics, matrix: QrMatrix, x: number, y: number, size: number): void {
  const cell = size / matrix.size;
  g.fillStyle(PIGMENT.muc, 1);
  for (let row = 0; row < matrix.size; row += 1) {
    let start = -1;
    for (let col = 0; col <= matrix.size; col += 1) {
      const dark = col < matrix.size && matrix.modules[row][col];
      if (dark && start < 0) {
        start = col;
      } else if (!dark && start >= 0) {
        g.fillRect(x + start * cell, y + row * cell, (col - start) * cell + 0.2, cell + 0.35);
        start = -1;
      }
    }
  }
}

/** `https://me.momo.vn/6Ofbt…` → `me.momo.vn`; falls back to the bare link if it does not parse. */
function linkHost(link: string): string {
  try {
    return new URL(link).host;
  } catch {
    return link.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

/**
 * Outline of one lotus petal: a pointed leaf rooted at `(baseX, baseY)`, `height` tall and `width`
 * across at its widest, swung `angle` radians off vertical.
 *
 * Splayed by rotation rather than by leaning the tips, which is what makes the flower read as an
 * open lotus instead of one shape with a few slivers behind it.
 */
function petalOutline(baseX: number, baseY: number, width: number, height: number, angle: number): Pt[] {
  const steps = 9;
  const right: Pt[] = [];
  const left: Pt[] = [];
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const place = (ox: number, oy: number): Pt => ({
    x: baseX + ox * cos - oy * sin,
    y: baseY + ox * sin + oy * cos,
  });

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const spread = Math.sin(Math.PI * t) ** 0.68 * (width / 2) * (1 - t * 0.2);
    right.push(place(spread, -height * t));
    left.push(place(-spread, -height * t));
  }
  return [...right, ...left.reverse()];
}

/** The figure scale the menu's hosts are drawn at. */
const MENU_HOST_SCALE = 0.74;

/** The herd in front of the near-bank village, in landscape design coordinates. */
const MENU_HERD: ReadonlyArray<{ x: number; y: number; scale: number; seed: number; rider: boolean }> = [
  { x: 74, y: 424, scale: 1.05, seed: 5005, rider: true },
  { x: 152, y: 410, scale: 0.85, seed: 5006, rider: false },
];

/**
 * The menu river, as a shape that can be asked questions.
 *
 * The course used to be an array of points inside the drawing routine and the hosts' positions were
 * four hand-typed pairs somewhere else — so when the course was last re-drawn, one host was left
 * standing in the water and nothing in the code could notice. Everything that must keep off the
 * water now asks the river where it is.
 */
interface MenuRiver {
  /** The bank polygon, exactly as drawn. */
  banks: Pt[];
  /** Horizontal extent of the water at a given height, or undefined above/below the course. */
  spanAt(y: number): { left: number; right: number } | undefined;
}

function createMenuRiver(): MenuRiver {
  const course: Pt[] = [
    { x: 246, y: 286 }, { x: 232, y: 340 }, { x: 208, y: 392 },
    { x: 174, y: 444 }, { x: 128, y: 492 }, { x: 62, y: 530 }, { x: -24, y: 552 },
  ];
  const banks = thickPath(course, course.map((_, index) => 5 + index * 2.4));

  return {
    banks,
    // Read off the drawn polygon rather than recomputed from the centre line: the band is offset
    // perpendicular to a course that runs diagonally, so its horizontal extent at a given height is
    // markedly wider than its width, and an army placed against the width alone stands in the water.
    spanAt(y: number) {
      let left = Infinity;
      let right = -Infinity;
      for (let index = 0; index < banks.length; index += 1) {
        const a = banks[index];
        const b = banks[(index + 1) % banks.length];
        if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
          const t = Math.abs(b.y - a.y) < 1e-6 ? 0 : (y - a.y) / (b.y - a.y);
          const x = a.x + (b.x - a.x) * t;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      return left === Infinity ? undefined : { left, right };
    },
  };
}

/** One host drawn up on the menu, with the ground it occupies. */
interface MenuHost {
  x: number;
  y: number;
  men: number;
  player: boolean;
  shape: HostShape;
  /** Whether a point falls on this host's ground, with `pad` units of clearance. */
  covers(x: number, y: number, pad?: number): boolean;
}

/** Dry ground left between the water's edge and the nearest file of a host. */
const BANK_MARGIN = 13;

/**
 * Draws the two sides up on opposite banks, each one placed off the water's actual edge.
 *
 * Their positions were literal coordinates before, and the far-left pair had ended up inside the
 * river band — a host standing in the water on the first screen of the game. Deriving x from
 * `spanAt` means that cannot come back whatever the course does next.
 */
function planDongHoHosts(river: MenuRiver): MenuHost[] {
  const plan: Array<{ y: number; men: number; player: boolean }> = [
    { y: 442, men: 1900, player: true },
    { y: 488, men: 1100, player: true },
    { y: 442, men: 1500, player: false },
    { y: 488, men: 900, player: false },
  ];

  return plan.map(({ y, men, player }) => {
    // The shape `drawHost` will actually draw, at the scale it will actually draw it. Measuring the
    // block with one spacing and drawing it with another is what left the old menu's shadow sitting
    // a third of a block below the men it belonged to.
    const shape = hostShape(men, 4.6 * MENU_HOST_SCALE, 4 * MENU_HOST_SCALE);
    const span = river.spanAt(y) ?? { left: GAME_WIDTH / 2, right: GAME_WIDTH / 2 };
    const x = player
      ? span.right + BANK_MARGIN + shape.width / 2
      : span.left - BANK_MARGIN - shape.width / 2;
    return {
      x, y, men, player, shape,
      covers(px: number, py: number, pad = 0) {
        return Math.abs(px - x) <= shape.width / 2 + pad && py >= y - shape.height - pad && py <= y + pad;
      },
    };
  });
}

/** Polygon ring of wall edges around a centre, used to fortify the menu citadel. */
function ringEdges(cx: number, cy: number, rx: number, ry: number, sides = 8): Array<[number, number, number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return points.map((p, i): [number, number, number, number] => {
    const next = points[(i + 1) % sides];
    return [p[0], p[1], next[0], next[1]];
  });
}

function createMenuRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
