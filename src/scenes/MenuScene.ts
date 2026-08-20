import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { createAscentGameState, createInitialGameState } from '../state/GameState';
import { hasSnapshot, loadSnapshot, snapshotLabel } from '../state/save';
import { hasSeenTour, markTourSeen } from '../state/tour';
import { getLegacy, LEGACY_PERKS, purchaseLegacyPerk, rankForScore } from '../state/legacy';
import { getLanguage, setLanguage, t, type LanguageCode } from '../i18n';
import { createMapItemRenderer, type MapItemRenderer } from '../ui/MapItemRenderer';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { InkUI, INK_UI, INK_UI_HEX, type UIBounds } from '../ui/InkUI';
import { CARD_ICON_SIZE, drawCardIcon } from '../ui/CardIcons';
import { Copilot, type CopilotStep } from '../ui/Copilot';
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
import { TRAFFIC_DENSITIES, getLifeSettings, setLifeSettings } from '../game/lifeSettings';
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
 * 46 rather than 32 because the sentence wraps to two lines in Vietnamese, and two pressable
 * phrases need real space between them before a thumb can tell them apart. A band sized for one
 * line puts both of them inside a single fingertip.
 *
 * The button column stops at `SETTINGS_TOP`; the three settings rows that used to live there have
 * their own page now, and what is left above the footer is breathing room for the art.
 */
const SUPPORT_ROW_HEIGHT = 46;
const SUPPORT_TOP = GAME_HEIGHT - 14 - SUPPORT_ROW_HEIGHT;
/** The language line under the settings button: two words and the space to tap one. */
const LANGUAGE_ROW_HEIGHT = 20;
/**
 * Settings and the language line are ONE block, and they are spaced like one.
 *
 * Distance is what says which things belong together — before colour, before a border, before a
 * heading. The footer had a single gap size for the whole column, so Continue sat as near to
 * Settings as it did to Classic Modes, and Settings sat as far from the language line as it did
 * from a game mode: the two settings read as strangers and a setting read as a game mode. Four
 * pixels here and a double gap above the block (see `renderMain`) is the whole of the fix.
 */
const SETTINGS_BLOCK_GAP = 0;
const SETTINGS_TOP = SUPPORT_TOP - 14 - LANGUAGE_ROW_HEIGHT - SETTINGS_BLOCK_GAP - 34;
const LANGUAGE_TOP = SETTINGS_TOP + 34 + SETTINGS_BLOCK_GAP;

export class MenuScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  private mapItems!: MapItemRenderer;
  private content: Phaser.GameObjects.GameObject[] = [];
  /** The coffee modal, when open. Kept apart from `content` so a re-render underneath cannot orphan it. */
  private modalObjects: Phaser.GameObjects.GameObject[] = [];
  private mode: MenuMode = 'main';
  private previewFlagSeed = 0;
  /**
   * The front-page tour, while it is running.
   *
   * Kept out of `content` for the same reason the coffee modal is: a re-render underneath would
   * destroy the tour's veil and leave its card floating over a page it no longer blocks.
   */
  private copilot?: Copilot;
  /**
   * What the tour points at, filled in by `renderMain` as it lays the column out.
   *
   * The column is measured against the sheet's real height and the language's real line count, so
   * none of these rectangles exists until the page has been built. A tour step asks for its target
   * at the moment it is drawn and reads whatever is here — which is why the tour is started after
   * `render()` and not before it.
   */
  private tourTargets: Partial<Record<'play' | 'classic' | 'footer', UIBounds>> = {};

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
    const BOTTOM_ROWS = 148;   // the footer: settings, the language line, and the support row
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.copilot?.destroy();
      this.copilot = undefined;
    });
    // After the page, never before it: every rectangle the tour points at is a measured one.
    if (this.mode === 'main' && !hasSeenTour()) {
      this.startTour();
    }
  }

  /**
   * The five cards a first-time player is shown, once.
   *
   * The steps are declared here rather than in `Copilot` because they are about *this page* — its
   * primary button, its Classic Modes door, its footer — and a tour component that knew which
   * scene it was touring would be a tour component that could only ever tour one.
   */
  private startTour(): void {
    const steps: CopilotStep[] = [
      { id: 'welcome', heading: 'copilot.welcome.h', body: 'copilot.welcome.b' },
      { id: 'play', heading: 'copilot.play.h', body: 'copilot.play.b', target: () => this.tourTargets.play },
      { id: 'modes', heading: 'copilot.modes.h', body: 'copilot.modes.b', target: () => this.tourTargets.classic },
      { id: 'learn', heading: 'copilot.learn.h', body: 'copilot.learn.b', target: () => this.tourTargets.footer },
      { id: 'ready', heading: 'copilot.ready.h', body: 'copilot.ready.b' },
    ];
    this.copilot = new Copilot(this, {
      steps,
      onGuide: () => this.scene.start('GuideScene'),
      // Skipped and finished are the same event here. A player who dismissed the tour has answered
      // the question it was asking, and showing it again next time refuses to take that answer.
      onClose: () => {
        markTourSeen();
        this.copilot = undefined;
      },
    });
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
    this.drawColumnVeil();
    this.drawDaiVietDrumSeal();
  }

  /**
   * A wash of điệp laid back over the lower half of the diorama.
   *
   * The menu's landscape is the same art the map is drawn with — two hosts under standards, a
   * river, paddies, a village, a buffalo — and at full strength every one of those competes with
   * the one thing this page exists for, which is pressing a button. The scene is not thinned to
   * fix that, because it is the map's own code and thinning it here would fork it. The sheet is
   * simply laid back down over it, gaining opacity down the page, so the button column sits on
   * calm paper and the art reads as what is behind the page rather than what is on it.
   *
   * Graded slices with no overlap, for the same reason the horizon haze uses them: sheets that
   * each run from a shared top accumulate their opacity and arrive as a curtain, with a seam
   * everywhere the registration offsets one from the next. Slice edges are rounded to whole
   * pixels and each slice starts where the last one ended, so there is neither a gap nor a
   * double-painted line between them.
   */
  private drawColumnVeil(): void {
    const veil = this.add.graphics().setDepth(-5);
    const band = (from: number, to: number, at: (t: number) => number) => {
      const SLICES = 30;
      for (let slice = 0; slice < SLICES; slice += 1) {
        const y0 = Math.round(from + (slice / SLICES) * (to - from));
        const y1 = Math.round(from + ((slice + 1) / SLICES) * (to - from));
        veil.fillStyle(PIGMENT.diep, at((slice + 0.5) / SLICES));
        veil.fillRect(0, y0, GAME_WIDTH, y1 - y0);
      }
    };

    // The plate the wordmark stands on. Type never sits on busy ground in this art — the same rule
    // that puts a `clearPlate` behind a label on hatching. The karst tops reach 204 in the design,
    // well up into the title block, and a gold rule ruled straight across a mountain ridge is the
    // exact thing that rule is there to prevent.
    band(0, this.vy(268), (t) => 0.94 * (1 - t) ** 1.5);

    // And the wash the button column stands on. Squared rather than linear: a straight ramp greys
    // the mountains as much as it settles the foreground, and the mountains were already quiet.
    band(this.vy(286), GAME_HEIGHT, (t) => 0.9 * t ** 1.6);
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
      // The last argument thins the range out. On the map a massif has to fill its tiles; the
      // menu wants a horizon rather than a wall — but not the wide-apart fence posts it asked for
      // at 1.85, drawn back when every tower carried the same contour and overlapping them was
      // the only way they could hide each other. The towers are told their own distance now, so
      // they can stand close and the tone does the separating.
      karstRange(landforms, -24, 200, 0, 88, 4118, false, 1.0);
      karstRange(landforms, 186, GAME_WIDTH + 24, -4, 78, 4119, false, 1.0);
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
      // 0.57, not 0.78. The menu draws its men at `MENU_HOST_SCALE` 0.74 — a soldier 8.4 px tall —
      // and a flag at 0.78 is 42 px finial to base, **five times his height**, which is why the
      // banners were the loudest thing on a screen that is mostly buttons. This is the map's own
      // `MAP_LAND_FLAG_SCALE` carried across, adjusted for the menu's slightly larger ground.
      flag.setScale(host.player ? 0.57 : -0.57, 0.57);
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
    washFill(g, forestShape, PIGMENT.tram, 0.80, () => rng());

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
    washFill(g, riceShape, PIGMENT.tramPale, 0.74, () => rng());

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
    washFill(g, lowerPlains, shade(PIGMENT.tramPale, 0.96), 0.60, () => rng());

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
   * The dynastic seal: the face of a Đông Sơn drum, which is also the mark on the app icon.
   *
   * It used to be a lotus, and a lotus at eighty-eight pixels across is a pale fan that reads as a
   * sheaf of wheat — five petals is not enough shape to survive that size, however carefully the
   * petals are swung. A drum face survives it because it is a *pattern* rather than a silhouette:
   * a sun on a raised boss, răng cưa at the rim, and enough register between them that the eye
   * reads an object. Fourteen rays, because that is the count on the Ngọc Lũ drum in Hanoi, which
   * is the drum this is drawn from and the same one `scripts/build-icon.mjs` draws.
   *
   * Drawn after the landscape layer and scaled *uniformly*. Collected into that squashed layer, a
   * 44-unit circle came out a third wider than tall on a phone sheet, and the device inside it
   * flattened with it.
   *
   * Flat, and deliberately so. The first cut of this had a soft sheen disc over it to suggest cast
   * metal, which is a thing a painter can do and a woodblock printer cannot.
   */
  private drawDaiVietDrumSeal(): void {
    const seal = this.add.graphics({ x: GAME_WIDTH / 2, y: this.vy(68) }).setDepth(-4);
    // The device is drawn at a 44-unit radius and scaled up, rather than every radius in it being
    // rewritten: the proportions between the sun, the dot ring and the sawtooth were tuned against
    // each other, and re-typing eleven numbers is how one of them ends up not scaling with the rest.
    seal.setScale(this.vScale * 1.3);

    // Three blocks and the paper, and every one of them is already on this page.
    //
    // The drum is bronze, and the first cut of this was gỉ đồng because of it — which made the seal
    // the only green thing on a sheet whose whole palette is điệp, mực, sỏi son and hoa hòe. One
    // cool hue at the top of a warm page pulls the eye straight off the button column. A Đông Hồ
    // printer cut what was in the tray, not what the subject was made of, so this is cut in the
    // tray's red: the same red as the standards on the field below it and the primary button under
    // that. The brightest thing on it is unprinted điệp — on a real print the white is always the
    // sheet showing through — and the contour is mực, because a Đông Hồ contour is soot and nothing
    // else. `scripts/build-icon.mjs --mark drum-bronze` still cuts the green one.
    const block = PIGMENT.son;
    const gold = PIGMENT.hoePale;
    const white = PIGMENT.diepHi;
    const RAYS = 14;
    // The register slip. The colour block is pulled first and the contour second, and they never
    // land together; a device whose fill sits exactly inside its own outline reads as clip art.
    const SLIP = 1;

    seal.fillStyle(block, 0.97);
    seal.fillCircle(-SLIP, -SLIP * 0.8, 44);
    seal.lineStyle(2, PIGMENT.muc, 0.92);
    seal.strokeCircle(0, 0, 44);

    // Răng cưa — the sawtooth register that rings every tympanum.
    seal.fillStyle(gold, 0.95);
    const TEETH = 22;
    for (let tooth = 0; tooth < TEETH; tooth += 1) {
      const a0 = (tooth / TEETH) * Math.PI * 2;
      const a1 = ((tooth + 1) / TEETH) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      seal.fillPoints(
        [
          { x: Math.cos(a0) * 33, y: Math.sin(a0) * 33 },
          { x: Math.cos(mid) * 40, y: Math.sin(mid) * 40 },
          { x: Math.cos(a1) * 33, y: Math.sin(a1) * 33 },
        ],
        true,
      );
    }
    seal.lineStyle(1, gold, 0.85);
    seal.strokeCircle(0, 0, 32.5);

    // A ring of raised dots: the plainest register a drum carries, and the one that keeps the band
    // between the sun and the rim from reading as bare metal.
    seal.fillStyle(gold, 0.9);
    for (let dot = 0; dot < RAYS; dot += 1) {
      const angle = ((dot + 0.5) / RAYS) * Math.PI * 2;
      seal.fillCircle(Math.cos(angle) * 28, Math.sin(angle) * 28, 1.5);
    }

    // The sun, as a fourteen-point star whose valleys land on the edge of the boss.
    const sun: Pt[] = [];
    for (let point = 0; point < RAYS * 2; point += 1) {
      const angle = (point / (RAYS * 2)) * Math.PI * 2 - Math.PI / 2;
      const radius = point % 2 === 0 ? 23 : 9.5;
      sun.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    seal.fillStyle(white, 0.98);
    seal.fillPoints(sun.map((point) => ({ x: point.x - SLIP * 0.8, y: point.y - SLIP * 0.7 })), true);
    seal.lineStyle(1, PIGMENT.muc, 0.8);
    seal.strokePoints(sun, true);

    seal.fillStyle(white, 1);
    seal.fillCircle(-SLIP * 0.8, -SLIP * 0.7, 9);
    seal.lineStyle(1, PIGMENT.muc, 0.85);
    seal.strokeCircle(0, 0, 9);
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

  /**
   * The wordmark.
   *
   * It was set at 36 units on a 390-wide sheet with the seal at 44 — a mark and a title that both
   * sat there being legible while the landscape behind them was the loudest thing on the page. A
   * front page has a subject, and on this one it has to be the name. So: half again the type, a
   * third again the device, and the block spaced as a block — device, name, country, rule — rather
   * than four things that happen to be stacked.
   *
   * Both lines are printed twice, the lower copy offset by two units. That is the woodblock's
   * doubled pull, not a drop shadow: it is the same colour family as the ink, not a grey.
   */
  private renderTitle(): void {
    // `pull` is how far the second impression sits off the first. It scales with the type: the
    // 46-unit name can carry a 2-unit slip and read as a woodblock pulled twice, while the same
    // slip under a 14-unit line is a third of its stroke width and just prints muddy.
    const wordmark = (text: string, y: number, size: number, spacing: number, pull = 2) => {
      const style = {
        fontFamily: TITLE_FONT,
        fontSize: `${Math.round(size * this.vScale)}px`,
        fontStyle: '700',
        align: 'center',
      };
      const under = this.ui.label(GAME_WIDTH / 2 + pull, this.vy(y + pull * 1.5), text, 'title', { ...style, color: '#301509' }).setOrigin(0.5);
      const over = this.ui.label(GAME_WIDTH / 2, this.vy(y), text, 'title', { ...style, color: '#2a2118' }).setOrigin(0.5);
      // Letter-spacing is what makes a short line read as a wordmark rather than as a caption, and
      // it is the only thing holding ĐẠI VIỆT's two words apart at this size.
      under.setLetterSpacing?.(spacing);
      over.setLetterSpacing?.(spacing);
      return [under, over];
    };

    const title = wordmark('VẠN THẮNG', 152, 46, 2);
    // Both lines are the mark, and the mark does not change with the language: the game is called
    // Vạn Thắng in Vietnamese and in English, and the line under it says what that means for the
    // half of the audience it does not mean anything to yet. Hardcoded rather than keyed for the
    // same reason — a name handed to a catalog is a name somebody eventually translates.
    //
    // Fitted rather than sized, because it is a long line on a 390-unit sheet: set at 21, measured,
    // and stepped down until it clears the margins. A wordmark that runs off the page is not one.
    const sub = wordmark('TEN THOUSAND VICTORIES', 188, 21, 3, 1);
    // 200, not the sheet's margin and not the width of the name. Fitted to the margin the gloss
    // comes out as wide as VẠN THẮNG above it, and two lines of equal width are two titles rather
    // than a title and the thing it means.
    const SUB_MAX = 200;
    // Measured and re-measured rather than solved in one step. Phaser reports a Text's width
    // without the letter-spacing it was just given, so a single divide lands about a spacing-unit
    // per character too wide — twenty-two characters at three units is a fifth of the line. Three
    // passes converge on the real width whether the metric includes the spacing or not.
    let subSize = 21 * this.vScale;
    for (let pass = 0; pass < 3 && sub[1].width > SUB_MAX; pass += 1) {
      subSize = Math.max(9, subSize * (SUB_MAX / sub[1].width));
      for (const line of sub) {
        line.setFontSize(Math.round(subSize));
      }
    }
    // The rule is the bottom of the wordmark, so it tracks the line above it rather than sitting at
    // a width of its own — and it stops at 206. The karst tops reach 204 in the design, so a rule
    // hung any lower is ruled straight across a mountain, which is what the first pass did: it read
    // as a stray stroke rather than as part of the mark.
    const ruleWidth = Phaser.Math.Clamp(Math.round(sub[1].width + 28), 186, 300);
    const rule = this.add.rectangle(GAME_WIDTH / 2, this.vy(206), ruleWidth, 2, INK_UI.gold, 0.88);
    this.content.push(...title, ...sub, rule);
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
    // floor. The tagline is built first because only Phaser knows how many lines it wraps to, and
    // then the gaps are shared out of whatever room is left — which is how the page fits at any
    // height in any language instead of fitting at 844 in English.
    const tagline = this.add.text(GAME_WIDTH / 2, 0, t('ascent.menu.tagline'), {
      color: '#8a5f1c',
      fontFamily: UI_FONT,
      fontSize: '11px',
      align: 'center',
      wordWrap: { width: 270 },
    }).setOrigin(0.5, 0);

    // The save note used to be a stamped row of its own under Continue, with a gap above it and the
    // doubled group break below. On a first run it said nothing but "the button above does nothing"
    // and charged a line of a 620-tall sheet for it. Folded into the button as a second line, it
    // greys out with the button and hands its row back to the column — which is what pays for the
    // History button below.
    //
    // ONE height for both rows of this tier, not one per row.
    //
    // Continue carries a second line and so needs 38 (font sizes here are fixed px and do NOT scale
    // with vScale, so at 0.62 a vh(46) button is 29 units and cannot hold a 15px line over a 10px
    // one). It used to be the only row that took it, which made it visibly taller than the button
    // directly above it — the odd one out in a stack whose whole job is to look like a stack. The
    // taller of the two heights now sets both.
    const ROW = Math.max(38, this.vh(46));

    // The column sits against the settings button rather than at a fixed height, so the art above
    // it keeps whatever room is left over instead of the page ending in a hole.
    //
    // Spacing is grouping, so there are two sizes of it and not one.
    //
    //   · `gap` runs between the things you came here to press — the two modes, the tagline under
    //     the one it belongs to, Continue and the History page under those.
    //   · TWICE that runs between the last of them and Settings, because Settings is not one of
    //     them. It and the language line under it are the other block on this page.
    //
    // The column carried one gap size for all of it, which reads exactly backwards: Continue as
    // near to Settings as to Classic Modes, and Settings as far from its own language row as from
    // a game mode. Even spacing is not neutral — it says everything belongs to everything.
    //
    // The gaps are also counted here EXACTLY as they are spent below, or the slack piles up in
    // whichever one the arithmetic forgot.
    // Continue is not drawn at all without a save behind it. A disabled button that says "no saved
    // campaign" is a row of a phone screen spent telling a first-time player that something they
    // have never done cannot be resumed; the tier below carries the same information by simply not
    // being there. It is also one fewer thing to read on a page that had five buttons on it.
    const rows = this.vh(58) + tagline.height + ROW + (saved ? ROW : 0);
    // TWICE the gap for the break, not three times it. Three left an obvious hole between the last
    // row and Settings while the art above the column was being crowded — the page had its slack
    // in the one place nothing needed it. Doubling is still an unmissable break (the gaps inside
    // the group are 12 design units at 844 against 24 here) and it hands the difference back to
    // the column, which now sits that much lower down the sheet.
    //
    // The budget, at the 620 floor where it is tightest: SETTINGS_TOP is 506 and ART_FLOOR 322, so
    // the column has 184. The rows come to 36 + 28 (the tagline wraps to two lines in Vietnamese)
    // + 29 + 38 + 26 = 157, and six gaps at the 4-unit clamp are 24. It fits by three. The save
    // label's row, now folded into Continue, is what buys History its own.
    const inner = saved ? 3 : 2;
    const GAPS = inner + 2;
    // The floor the column may not climb above: the rear host's feet stand at 488 in the design,
    // and the pair of them are the busiest thing on the page. At 844 the bottom-anchored column
    // landed at 463 and cleared them by luck; on a 620 sheet everything above the footer is
    // squeezed, the same arithmetic put the first button at 303 against feet at 302, and the
    // primary button was printed straight over the marching men and a standard. Anchoring to the
    // art rather than to a number the art has since moved past is what keeps them apart, and the
    // gaps pay for it — which also tightens a column that was the loosest thing on the screen.
    const ART_FLOOR = this.vy(520);
    const gap = Phaser.Math.Clamp(
      Math.round((SETTINGS_TOP - ART_FLOOR - rows) / GAPS),
      4,
      Math.round(14 * this.vScale),
    );
    // Centred in the open paper, not hung off the footer.
    //
    // Bottom-anchoring was right when the column was five rows and filled the lane. With two it
    // sank to the footer and left the hole where the fifth, fourth and third rows used to be —
    // right in the middle of the page, which is the one place a hole is read as a mistake rather
    // than as air. Splitting the slack puts the same buttons in the same order with the emptiness
    // shared between the art above and the footer below, where both of them can use it.
    const stack = rows + gap * inner;
    const lane = SETTINGS_TOP - gap * 2 - ART_FLOOR;
    let cursor = ART_FLOOR + Math.max(0, Math.round((lane - stack) / 2));

    this.tourTargets.play = { x: 54, y: cursor, width: 282, height: this.vh(58) };
    this.content.push(this.ui.button(this.tourTargets.play, t('ascent.menu.title'), () => {
      this.startAscentRun();
    }, { variant: 'primary', fontSize: '17px' }));
    cursor += this.vh(58) + gap;

    tagline.setY(cursor);
    this.content.push(tagline);
    cursor += tagline.height + gap;

    this.tourTargets.classic = { x: 54, y: cursor, width: 282, height: ROW };
    this.content.push(this.ui.button(this.tourTargets.classic, t('ascent.menu.classic'), () => {
      this.mode = 'classic';
      this.render();
    }, { variant: 'secondary', fontSize: '15px' }));
    cursor += ROW + gap;

    if (saved) {
      this.content.push(this.ui.button({ x: 54, y: cursor, width: 282, height: ROW }, t('menu.continue'), () => {
        const snapshot = loadSnapshot();
        if (snapshot) {
          this.startGame(snapshot.state);
        }
      }, { variant: 'ghost', fontSize: '15px', subLabel: snapshotLabel() }));
      cursor += ROW + gap;
    }
    // The group break, and the reason the footer reads as a different kind of thing from the
    // buttons above it.
    cursor += gap * 2;

    this.renderLanguageSwitch();
    this.renderFooterPair();

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
      // The fight on its own. Not a mode with a map and an economy — one matchup, dialled in and
      // fought, so the battle can be judged without playing a run to reach one.
      {
        title: t('arena.title'),
        body: t('arena.menuBlurb'),
        border: INK_UI.cinnabar,
        variant: 'secondary' as const,
        start: 'arena' as const,
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
          onClick: () => (mode.start === 'arena'
            ? this.scene.start('BattleArenaScene')
            : this.scene.start('CampaignScene', { mode: mode.start })),
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
  /**
   * The language switch: two words under the settings button, the one you are not using tappable.
   *
   * On the front page at all because it was three taps in — main, settings, then the row — and that
   * is three taps too many for the one control a player needs *before* they can read the rest of
   * the menu: somebody who cannot read "Settings" cannot find the setting that fixes it.
   *
   * It spent one pass beside Settings, where it read as a pair of buttons offering two comparable
   * things (they are not — one opens a page, the other changes the language of every page), and one
   * pass as a pill in the top-right corner, which is worse: on a phone that corner is under the
   * status bar and nowhere near a thumb. Under the settings button it is where the eye already is
   * when it is looking for settings, inside the column, and the last thing above the footer.
   *
   * BOTH languages are shown, with the current one inked and the other in muted type. A single
   * button naming only the other language has to be understood before it can be used; a pair says
   * "these are the two, this is the one you are on" at a glance, and the tap target is unambiguous.
   */
  private renderLanguageSwitch(): void {
    const current = getLanguage();
    const options: Array<{ id: LanguageCode; label: string }> = [
      { id: 'en', label: 'English' },
      { id: 'vi', label: 'Tiếng Việt' },
    ];
    // Sat on the top of its row rather than centred in it: the row's own height was adding a
    // third of the gap this block is trying not to have.
    const y = LANGUAGE_TOP + 8;

    const labels = options.map((option) => this.ui.label(0, y, option.label, 'button', {
      color: option.id === current ? '#3a2a14' : INK_UI_HEX.mutedText,
      fontSize: '11px',
      fontStyle: option.id === current ? '700' : '400',
    }).setOrigin(0, 0.5));
    const dot = this.ui.label(0, y, '·', 'caption', {
      color: INK_UI_HEX.mutedText,
      fontSize: '12px',
    }).setOrigin(0, 0.5);

    const GAP = 7;
    const total = labels[0].width + GAP + dot.width + GAP + labels[1].width;
    let cursor = (GAME_WIDTH - total) / 2;
    labels[0].setX(cursor);
    cursor += labels[0].width + GAP;
    dot.setX(cursor);
    cursor += dot.width + GAP;
    labels[1].setX(cursor);

    this.content.push(labels[0], dot, labels[1]);

    labels.forEach((label, index) => {
      const option = options[index];
      if (option.id === current) {
        return;
      }
      // Padded well past the type: eleven-pixel words are a tap target only if the box around them
      // is not.
      const hit = this.add
        .rectangle(label.x + label.width / 2, y, label.width + 20, LANGUAGE_ROW_HEIGHT + 14, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        setLanguage(option.id);
        this.render();
      });
      this.content.push(hit);
    });
  }


  /**
   * One setting: its name on the left, its choices on the right.
   *
   * Written first as a centred caption with the tiles centred under it, which is how a settings
   * page turns into a poster: five headings floating over five bands of buttons, each pair a
   * separate island, nothing lining up with anything, and the tiles wider than the plate they sit
   * on so the outer ones were cut off by its own border. A settings page is a LIST — one line per
   * setting, names in a column you can run your eye down, controls in a column beside it.
   *
   * The selected tile is the FILLED one. `crayonTile` marks its selection with a cinnabar edge on
   * paper and leaves the unselected ones filled gold, which is the game's action-versus-quiet
   * convention and reads backwards here: every screenshot of this page showed the two unchosen
   * qualities looking chosen and the chosen one looking empty.
   */
  private renderSettingRow<T extends string>(
    box: { x: number; y: number; width: number; height: number },
    name: string,
    options: ReadonlyArray<{ id: T; label: string }>,
    current: T,
    pick: (id: T) => void,
  ): void {
    const LABEL_WIDTH = 96;
    const GAP = 5;
    const label = this.ui.label(box.x, box.y + box.height / 2, name, 'caption', {
      color: INK_UI_HEX.mutedText,
      fontSize: '10px',
      fontStyle: '700',
      wordWrap: { width: LABEL_WIDTH },
    }).setOrigin(0, 0.5);
    label.setLetterSpacing?.(0.8);
    this.content.push(label);

    const trackX = box.x + LABEL_WIDTH + 8;
    const trackWidth = box.width - LABEL_WIDTH - 8;
    const tileWidth = (trackWidth - GAP * (options.length - 1)) / options.length;

    options.forEach((option, index) => {
      const selected = current === option.id;
      const x = trackX + index * (tileWidth + GAP);
      this.content.push(this.ui.panel({ x, y: box.y, width: tileWidth, height: box.height }, selected
        ? { fill: INK_UI.goldLight, fillShade: INK_UI.gold, border: INK_UI.cinnabar, borderWidth: 2 }
        : { fill: INK_UI.parchment, fillAlpha: 0.5, border: INK_UI.softBrush, borderWidth: 1.2, muted: true }));
      this.content.push(this.ui.label(x + tileWidth / 2, box.y + box.height / 2, option.label, 'button', {
        color: selected ? '#8a2a1b' : INK_UI_HEX.mutedText,
        fontSize: options.length > 3 ? '10px' : '11px',
        fontStyle: selected ? '700' : '400',
        align: 'center',
        wordWrap: { width: tileWidth - 6 },
      }).setOrigin(0.5));
      const hit = this.add
        .rectangle(x + tileWidth / 2, box.y + box.height / 2, tileWidth, box.height + 6, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => pick(option.id));
      this.content.push(hit);
    });
  }

  private renderSettings(): void {
    // A plate to read on. Small labels sitting straight on a landscape is the one place in the game
    // where the art actively fights the text.
    //
    // Laid out as a LIST: one line per setting, names down the left, controls down the right, and
    // the whole thing measured from the rows rather than from a guess — the plate used to be sized
    // by a formula that did not know how many rows it held, so the last one hung out of the bottom
    // and the widest ones were cut off by its own border.
    const ROW_HEIGHT = 30;
    const ROW_GAP = 12;
    const PAD = 18;
    const life = getLifeSettings();
    const onOff = [
      { id: 'on' as const, label: t('menu.toggle.on') },
      { id: 'off' as const, label: t('menu.toggle.off') },
    ];

    const plateX = 16;
    const plateWidth = GAME_WIDTH - 32;
    const contentX = plateX + PAD;
    const contentWidth = plateWidth - PAD * 2;
    const settings: Array<{ name: string; build: (y: number) => void }> = [
      {
        name: t('menu.graphics'),
        build: (y) => this.renderSettingRow(
          { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
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
        ),
      },
      {
        name: t('menu.mapTheme'),
        build: (y) => this.renderSettingRow(
          { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
          t('menu.mapTheme'),
          MAP_THEME_OPTIONS.map((option) => ({ id: option.id, label: t(option.labelKey) })),
          getMapTheme(),
          (id) => {
            setMapTheme(id);
            this.scene.restart();
          },
        ),
      },
      // ── What the map is allowed to be doing ──
      //
      // Not the same question as graphics quality, which buys pixels. These buy *movement*: every
      // bird, cart and traveller is a live object with a tween on it, and a busy map is a hundred
      // of them ticking at once — a cost a resolution slider cannot answer. They are taste
      // settings too: a player who finds the sky distracting should be able to still it without
      // dropping to a 1x buffer.
      {
        name: t('menu.traffic'),
        build: (y) => this.renderSettingRow(
          { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
          t('menu.traffic'),
          TRAFFIC_DENSITIES.map((id) => ({ id, label: t(`menu.traffic.${id}` as 'menu.traffic.none') })),
          life.traffic,
          (id) => {
            setLifeSettings({ traffic: id });
            this.render();
          },
        ),
      },
      {
        name: t('menu.birds'),
        build: (y) => this.renderSettingRow(
          { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
          t('menu.birds'),
          onOff,
          life.birds ? 'on' : 'off',
          (id) => {
            setLifeSettings({ birds: id === 'on' });
            this.render();
          },
        ),
      },
      {
        name: t('menu.seasons'),
        build: (y) => this.renderSettingRow(
          { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
          t('menu.seasons'),
          onOff,
          life.seasons ? 'on' : 'off',
          (id) => {
            setLifeSettings({ seasons: id === 'on' });
            this.render();
          },
        ),
      },
      // Last, and still here even though the front page carries a switch of its own: this is where
      // a player goes looking for it, and a settings page that does not list the language is a
      // settings page with a hole in it.
      {
        name: t('menu.language'),
        build: (y) => this.renderSettingRow(
          { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
          t('menu.language'),
          [{ id: 'en' as LanguageCode, label: 'English' }, { id: 'vi' as LanguageCode, label: 'Tiếng Việt' }],
          getLanguage(),
          (code) => {
            setLanguage(code);
            this.render();
          },
        ),
      },
    ];

    const title = this.add.text(GAME_WIDTH / 2, 0, t('menu.settingsTitle'), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '20px',
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5, 0);

    const backHeight = this.vh(40);
    const plateHeight = PAD + title.height + 20
      + settings.length * ROW_HEIGHT + (settings.length - 1) * ROW_GAP
      + 22 + backHeight + PAD;
    const plateTop = Math.max(this.vy(150), Math.min(this.vy(232), GAME_HEIGHT - 24 - plateHeight));

    this.content.push(this.ui.panel(
      { x: plateX, y: plateTop, width: plateWidth, height: plateHeight },
      { fill: INK_UI.parchment, fillAlpha: 0.94 },
    ));

    let cursor = plateTop + PAD;
    title.setY(cursor);
    // Built before the plate, because the plate is sized from its height — and Phaser draws in
    // creation order, so without this the page's own title is behind the page.
    this.children.bringToTop(title);
    this.content.push(title);
    cursor += title.height + 20;

    for (const setting of settings) {
      setting.build(cursor);
      cursor += ROW_HEIGHT + ROW_GAP;
    }
    cursor += 22 - ROW_GAP;

    this.content.push(this.ui.button(
      { x: contentX, y: cursor, width: contentWidth, height: backHeight },
      t('menu.back'),
      () => {
        this.mode = 'main';
        this.render();
      },
      { variant: 'secondary', fontSize: '14px' },
    ));
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
  /**
   * The three places that are not a game: the manual, the history the game is built out of, and
   * the settings.
   *
   * They were full-width rows in the column above, which put five buttons of the same width down
   * the middle of the page and made a page of choices out of what is really one choice with some
   * doors beside it. Side by side in the footer they are half the height of the page's furniture
   * and read as the tier they are — and none of them lost anything, because a button you can still
   * see and still press has not been demoted, only stopped shouting.
   *
   * How to Play joins them rather than going in the column, and it is worth saying why, because it
   * is the one door here a first-time player actually needs. A manual advertised as loudly as the
   * game would be a front page that leads with homework — and the tour already walks a new player
   * to this exact rectangle on their first load, which is a better introduction than a bigger
   * button would have been. Anyone who skipped the tour finds it where a manual belongs: with the
   * other reference material, at the foot of the page.
   *
   * Three at 104 rather than two at 122, and the row is 22 units NARROWER overall than the pair
   * was. A footer that grows with each door added is the failure mode here; this one gets tighter,
   * and the inset from the column's 282 is the whole point — a footer row as wide as the primary
   * button is just another row of the same thing.
   */
  private renderFooterPair(): void {
    const WIDTH = 104;
    const GAP = 7;
    const left = Math.round((GAME_WIDTH - (WIDTH * 3 + GAP * 2)) / 2);
    const height = this.vh(34);
    // Remembered as one rectangle rather than three: the tour's card is about the footer as a
    // tier — the manual, the record and the settings — and framing one of the three would say the
    // other two were something else.
    this.tourTargets.footer = { x: left, y: SETTINGS_TOP, width: WIDTH * 3 + GAP * 2, height };

    // 12px, not 13. "How to Play" is three words where the other two are two and one, and at 13 it
    // wraps to a second line inside a 34-unit button — which centres the pair of lines and leaves
    // the row looking like one button broke.
    const doors: Array<{ label: string; onPress: () => void }> = [
      { label: t('guide.menu.button'), onPress: () => this.scene.start('GuideScene') },
      { label: t('history.menu.button'), onPress: () => this.scene.start('HistoryScene') },
      { label: t('menu.settings'), onPress: () => { this.mode = 'settings'; this.render(); } },
    ];
    doors.forEach((door, index) => {
      this.content.push(this.ui.button(
        { x: left + index * (WIDTH + GAP), y: SETTINGS_TOP, width: WIDTH, height },
        door.label,
        door.onPress,
        { variant: 'ghost', fontSize: '12px' },
      ));
    });
  }

  private renderSupportRow(): void {
    const row = this.add.container(GAME_WIDTH / 2, SUPPORT_TOP + SUPPORT_ROW_HEIGHT / 2);

    const coffee = this.ui.textLink(0, 0, t('menu.support.coffee'), () => this.renderSupportModal(), { icon: 'cup' });
    const improve = this.ui.textLink(0, 0, t('menu.support.improve'), () => openExternalLink(SUPPORT.github), { icon: 'hammer' });
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

    /**
     * One line if it fits with margins to spare; two if it does not.
     *
     * The sentence is a comfortable single line in English and runs the full width of the sheet in
     * Vietnamese, where it was printing edge to edge and shrinking itself to do it — a footer aside
     * laid out like a banner, in type a size smaller than the aside above it. Broken after the
     * connective it is two short centred lines at full size, with the same margins as everything
     * else on the page.
     */
    const maxWidth = GAME_WIDTH - 64;
    if (total <= maxWidth) {
      let cursor = -total / 2;
      coffee.x = cursor;
      cursor += coffeeWidth + gap;
      connective.x = cursor;
      cursor += connective.width + gap;
      improve.x = cursor;
    } else {
      const second = connective.width + gap + improveWidth;
      // 15 apart, not 9. Two pressable phrases nine units either side of a centre line are two
      // tap targets sharing an edge, and a thumb aiming for one of them lands between both. This
      // is also why SUPPORT_ROW_HEIGHT grew: the band has to be tall enough to hold the gap.
      coffee.setPosition(-coffeeWidth / 2, -15);
      connective.setPosition(-second / 2, 15);
      improve.setPosition(-second / 2 + connective.width + gap, 15);
      // Only if a single one of the two lines still overruns, which no language does today.
      const widest = Math.max(coffeeWidth, second);
      if (widest > maxWidth) {
        row.setScale(maxWidth / widest);
      }
    }

    row.add([coffee, connective, improve]);
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
        // A glyph apiece: a globe for the one that takes any currency from anywhere, a phone for
        // the one you open on a phone. The two labels are both "<name> · <place>" at the same size
        // in the same weight, and a tab strip whose only difference is the letters is a tab strip
        // you have to read. Grouped with the label and centred with it, as on a button.
        const glyph = drawCardIcon(this, channel.id === 'momo' ? 'phone' : 'globe', PIGMENT.muc);
        const glyphScale = 0.56;
        glyph.setScale(glyphScale).setAlpha(selected ? 0.9 : 0.6);
        const glyphWidth = CARD_ICON_SIZE * glyphScale;
        const group = glyphWidth + 6 + label.width;
        glyph.setPosition(bounds.x + bounds.width / 2 - group / 2 + glyphWidth / 2, cursor + tabHeight / 2);
        label.setX(bounds.x + bounds.width / 2 - group / 2 + glyphWidth + 6 + label.width / 2);
        this.modalObjects.push(glyph);
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

/** The figure scale the menu's hosts are drawn at. */
const MENU_HOST_SCALE = 0.74;

/** The herd in front of the near-bank village, in landscape design coordinates. */
/**
 * The herd, at the ground scale the rest of the diorama is drawn at.
 *
 * These were 1.05 and 0.85 while the hosts beside them were `MENU_HOST_SCALE` 0.74 — and the map
 * itself passes `GROUND_SCALE` to the very same buffalo. A 1.5 m animal was therefore drawn 10 px
 * tall next to an 8.4 px man, which is the one thing `verify-ground-scale` names outright: *a
 * buffalo does not out-stand a soldier*. The menu is not covered by that harness, so it drifted.
 *
 * Kept as two different sizes, because a herd of identical animals is a pattern rather than a herd.
 */
const MENU_HERD: ReadonlyArray<{ x: number; y: number; scale: number; seed: number; rider: boolean }> = [
  { x: 74, y: 424, scale: 0.76, seed: 5005, rider: true },
  { x: 152, y: 410, scale: 0.61, seed: 5006, rider: false },
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
