import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { createAscentGameState, createInitialGameState } from '../state/GameState';
import { hasSnapshot, loadSnapshot, snapshotLabel } from '../state/save';
import {
  hasSeenClassicTour, hasSeenTour, markClassicTourSeen, markTourSeen, requestGuidedRun,
} from '../state/tour';
import { getLegacy, LEGACY_PERKS, purchaseLegacyPerk, rankForScore } from '../state/legacy';
import { getLanguage, setLanguage, t, type LanguageCode } from '../i18n';
import {
  applyUpdate, buildStamp, checkForUpdate, getUpdateStatus, subscribeUpdateStatus,
} from '../pwa/updates';
import {
  canOfferInstall, guideRoute, installRoute, promptInstall, subscribeInstall, type InstallRoute,
} from '../pwa/install';
import { createMapItemRenderer, type MapItemRenderer } from '../ui/MapItemRenderer';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { BACK_BAR_HEIGHT, InkUI, INK_UI, INK_UI_HEX, type UIBounds } from '../ui/InkUI';
import {
  BATTLE_DIFFICULTIES, BATTLE_SPEEDS, getBattleDifficulty, getBattleSpeed,
  setBattleDifficulty, setBattleSpeed,
} from '../game/battleOptions';
import { CARD_ICON_SIZE, drawCardIcon, type CardIconId } from '../ui/CardIcons';
import { Copilot, type CopilotStep } from '../ui/Copilot';
import { drawLanguageFlag } from '../ui/languageFlags';
import { PIGMENT } from '../ui/ink/palette';
import { INK, brushStroke, inkOutline, shade, washFill, waveLine } from '../ui/inkTheme';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import { getMapTheme, MAP_THEME_OPTIONS, setMapTheme } from '../ui/mapTheme';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { inkPath, mulberry32, thickPath, washFill as washInk, type Pt } from '../ui/ink/stroke';
import { house, karstRange, softRidge } from '../ui/ink/props';
import { drawFieldPlot, type FieldPlot } from '../ui/ink/settlements';
import { GRAPHICS_QUALITIES, applyPendingRenderScale, applyRenderScale, getGraphicsQuality, renderScale, requestRenderScale, setGraphicsQuality } from '../game/graphicsQuality';
import { TRAFFIC_DENSITIES, getLifeSettings, setLifeSettings } from '../game/lifeSettings';
import { SUPPORT, configuredSupportChannels, supportQrTextureKey, type SupportChannel } from '../data/support';
import { allowsDonationLinks, notifyShellReady } from '../platform/shell';
import { copyToClipboard, openExternalLink } from '../utils/browser';
import { encodeQr, type QrMatrix } from '../utils/qr';
import { attachPaperSheet } from '../ui/ink/paperSheet';
import { qualityLadder } from '../game/qualityLadder';
import { rungForTier } from '../game/qualityRungs';

type MenuMode = 'main' | 'classic' | 'confirm-new' | 'legacy' | 'settings';

/**
 * The front page's footer, measured up from the bottom edge.
 *
 * The support row — two independent links offering a coffee or a pull request — sits on the
 * sheet's edge, with the settings button just above it. The row holds pressable phrases rather
 * than buttons, so its height is the touch band they are centred in, not the type's visual height.
 *
 * 46 leaves both links their full touch height and separates them from the build stamp below.
 *
 * The button column stops at `SETTINGS_TOP`; the three settings rows that used to live there have
 * their own page now, and what is left above the footer is breathing room for the art.
 */
const SUPPORT_ROW_HEIGHT = 46;
/**
 * The build stamp on the very bottom edge, under the support sentence.
 *
 * It was only ever on the settings page, which is two taps away and not where anybody thinks to
 * look when they are trying to say which version they are running. On the front page it is the
 * last thing on the sheet, in the quietest type the page has, doing what a colophon does: present
 * for whoever needs it, invisible to whoever does not.
 *
 * It sits on the bottom edge itself, below the 14 of margin the rest of the footer keeps — a
 * colophon belongs at the foot of the sheet, not floating one gap above it. `VERSION_EDGE` is all
 * that is left under it, and it is not zero because a descender on the last line of a page needs
 * somewhere to go, and because a phone with rounded corners eats the last few rows.
 *
 * 30 is the 9px line plus the air above it, and the air is most of it: the support actions keep
 * full-size touch areas even though their type is quiet, so a band sized to the type alone would
 * put the build stamp inside the links' hit region.
 *
 * The whole footer stack moves up by what this band takes and the art lane above it loses the
 * same, which is slack it had.
 */
const VERSION_ROW_HEIGHT = 30;
const VERSION_EDGE = 6;
const SUPPORT_TOP = GAME_HEIGHT - VERSION_ROW_HEIGHT - SUPPORT_ROW_HEIGHT;
/** The language line under the utility buttons: two small flags, two labels, and thumb-sized hits. */
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
  /**
   * Whether the install hint has already had its turn this visit.
   *
   * Once per page load, not once ever: somebody who has not installed after four visits has said
   * no four times, but they have also possibly never seen it — the strip shows for six seconds in
   * the corner of a page whose middle is a button they came to press. Shown again next launch,
   * never twice in one, and never at all once the game is running from the home screen.
   */
  private installTipShown = false;
  private installTipTimer?: Phaser.Time.TimerEvent;
  /** Set while the install sheet is up, so the tip does not re-arm underneath it. */
  private installModalOpen = false;
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
  private tourTargets: Partial<Record<'play' | 'classic' | 'footer' | 'skirmish', UIBounds>> = {};
  /** Set for this visit to the classic page, so a re-render cannot raise the tour twice. */
  private classicTourDone = false;
  /**
   * Which page the standing tour belongs to.
   *
   * There are two of them on this scene now — the front page's and the classic page's — and the
   * guard in `render` that takes a tour down when the player navigates away has to know which one
   * is up. Without it that guard would tear down the classic tour the instant it appeared, since
   * its page is not `main`, and would mark the *front page's* flag as seen while doing it: one
   * tour destroyed on sight, the other silently never shown again.
   */
  private copilotFor?: MenuMode;

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
    const BOTTOM_ROWS = 148;   // the footer: utility buttons, flagged language row, and support
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
    applyPendingRenderScale(this.game);
    // The front page is a still image with a ripple: pacing it at 30 halves the idle battery
    // cost of leaving the game open on the menu. Cleared the moment any world starts.
    qualityLadder()?.setSceneCap(30);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => qualityLadder()?.setSceneCap(undefined));
    applyRenderScale(this);
    // The chrome is printed on the same sheet as the world, so it takes the same paper pass.
    applyPaperFX(this);
    attachPaperSheet(this);
    window.__mandateState = undefined;
    this.registry.remove('gameState');
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    this.mapItems = createMapItemRenderer(this);
    this.previewFlagSeed = loadSnapshot()?.state.mapConfig.seed ?? Math.floor(Math.random() * 1_000_000);
    this.drawBackground();
    this.render();
    // The service worker finishes caching, or a new build lands, minutes after this page was
    // drawn. Redrawing on the change is what lets the front page raise its notice and the settings
    // page grow its Reload button without the player having to leave and come back.
    const unsubscribeUpdates = subscribeUpdateStatus(() => this.render());
    // `beforeinstallprompt` lands whenever Chromium gets round to deciding the site is
    // installable, which on a first visit is after this page is already drawn. Without this the
    // corner mark would offer the written guide to a browser that has a real button.
    const unsubscribeInstall = subscribeInstall(() => this.render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribeUpdates();
      unsubscribeInstall();
      this.installTipTimer?.remove();
      this.installTipTimer = undefined;
      this.copilot?.destroy();
      this.copilot = undefined;
    });
    // After the page, never before it: every rectangle the tour points at is a measured one.
    if (this.mode === 'main' && !hasSeenTour()) {
      this.startTour();
    }
    // The launch splash comes down here and nowhere else, because this scene is the first thing
    // the game ever draws. `postrender` rather than the end of `create`: `create` runs *before*
    // the frame it just built reaches the canvas, so dismissing from here would cross-fade the
    // splash into one frame of empty paper. The hook is declared inline in `index.html` and is
    // gone by the time this fires a second time — `once` is belt to that braces.
    //
    // A native shell's splash comes down on the same frame and for the identical reason: it is
    // holding a full-screen image over a web view that has not painted anything yet, and it wants
    // the one frame that is genuinely the menu. Two splashes, one signal.
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      window.__splashDone?.();
      notifyShellReady();
    });
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
      // The first card offers the language, because it is the first thing anybody sees and it is
      // shown in whatever the browser defaulted to. The front page's own switch is at the foot of
      // a page this tour is covering with its veil, so without this the one moment the choice is
      // most needed is the one moment it cannot be reached.
      {
        id: 'welcome',
        heading: 'copilot.welcome.h',
        body: 'copilot.welcome.b',
        languagePicker: true,
      },
      { id: 'play', heading: 'copilot.play.h', body: 'copilot.play.b', target: () => this.tourTargets.play },
      { id: 'modes', heading: 'copilot.modes.h', body: 'copilot.modes.b', target: () => this.tourTargets.classic },
      { id: 'learn', heading: 'copilot.learn.h', body: 'copilot.learn.b', target: () => this.tourTargets.footer },
      { id: 'ready', heading: 'copilot.ready.h', body: 'copilot.ready.b' },
    ];
    this.copilotFor = 'main';
    this.copilot = new Copilot(this, {
      steps,
      /**
       * The last card's second button starts a *run*, not the manual.
       *
       * A tour that ends by sending the reader to four pages of prose has answered "how do I
       * play" with "go and read". The player is one press from a game and has just been told
       * what every door on this page does; what they want now is somebody to sit beside them
       * while they play one. The manual is still a door on the footer for anyone who would
       * rather read first.
       */
      onGuide: () => {
        requestGuidedRun();
        this.startAscentRun();
      },
      // Skipped and finished are the same event here. A player who dismissed the tour has answered
      // the question it was asking, and showing it again next time refuses to take that answer.
      // The front page redraws in the new language under the card that asked for it. Safe while
      // the tour is up: `render`'s teardown guard compares the page the tour belongs to against
      // the page being drawn, and both are still `main`.
      onLanguage: () => this.render(),
      onClose: () => {
        markTourSeen();
        this.copilot = undefined;
        this.copilotFor = undefined;
      },
    });
  }

  private drawBackground(): void {
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT).setDepth(-10);
    const menu = this.mapRenderer.theme.renderers.menu;

    if (menu === 'dongho') {
      this.drawDongHoIllustration();
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
   * The landscape is deliberately sparse — mountains, one river, six broad paddies, two houses and
   * a lotus cluster — but the lower wash still gives the button column a calm sheet to stand on.
   * It gains opacity down the page, making the illustration recede before it reaches the actions.
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
   * objects tagged `menuAspectSafe` counter-scale inside the container, so mountains, houses and
   * lotus flowers keep their authored proportions while their anchor positions still fit the
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

  /** The approved river scene, registered as four real image layers instead of one static plate. */
  private drawDongHoIllustration(): void {
    const texture = this.textures.get('menu-layer-ground-v3').getSourceImage() as { width: number; height: number };
    // The art lane loses height much faster than width on short browser-chrome viewports. Shrink
    // uniformly instead of squashing the landscape: full bleed on the 844 sheet, a quiet paper
    // margin on the compact sheet, and the lotus/roofs keep their authored proportions on both.
    const fitted = Phaser.Math.Clamp((this.vScale - 0.62) / 0.38, 0, 1);
    // A tall sheet can carry a small, safe overscan; the source keeps clear outer margins around
    // the lotus and roofs. That closes the dead parchment band above the first plate without
    // cropping a focal object. Compact sheets remain at their existing contained width.
    const width = GAME_WIDTH * Math.min(1.08, Phaser.Math.Linear(0.8, 1.2, fitted));
    const height = width * (texture.height / texture.width);
    const top = this.vy(190) + Math.round(16 * fitted);
    const left = (GAME_WIDTH - width) / 2;
    const centreY = top + height / 2;
    const artwork = this.add.container(0, 0)
      .setDepth(-8)
      .setData('menuLandscapeRole', 'illustration')
      .setData('menuArtwork', {
        version: 7,
        layers: ['ground', 'mountains', 'mountain-mist', 'river-fx', 'bamboo', 'lotus'],
        composition: ['karst-mountains', 's-curve-river', 'foreground-lotus', 'right-bank-paddies', 'right-bank-bamboo-grove'],
        motion: ['mountain-drift', 'mountain-mist', 'bamboo-breeze', 'lotus-sway', 'pointer-lotus-spring', 'river-currents', 'lotus-water-wakes', 'tap-and-drag-wakes'],
        width,
        height,
      });

    const layer = (key: string, name: string, alpha: number): Phaser.GameObjects.Image => {
      const source = this.textures.get(key).getSourceImage() as { width: number; height: number };
      const image = this.add.image(GAME_WIDTH / 2, centreY, key)
        .setDisplaySize(width, height)
        .setAlpha(alpha)
        .setData('menuArtworkLayer', name)
        .setData('sourceSize', { width: source.width, height: source.height });
      artwork.add(image);
      return image;
    };

    const ground = layer('menu-layer-ground-v3', 'ground', 0.95);
    const mountains = layer('menu-layer-mountains-v1', 'mountains', 0.86);
    // This container is deliberately inserted between mountains and village. Mist can cross the
    // feet of the karst without whitening the houses or close lotus in front of it.
    const mountainMist = this.add.container(0, 0)
      .setData('menuArtworkLayer', 'mountain-mist')
      .setData('menuLayerMotion', 'valley-drift');
    artwork.add(mountainMist);
    // Every live water mark belongs inside the illustration, before the bamboo and lotus.
    // Scene-level depth cannot interleave with children of a Container: the old currents were
    // therefore painted over the entire plate, including the foreground flowers.
    const waterFx = this.add.container(0, 0)
      .setData('menuArtworkLayer', 'river-fx')
      .setData('menuCompositing', 'below-bamboo-and-lotus');
    artwork.add(waterFx);
    const bamboo = layer('menu-layer-bamboo-v1', 'bamboo', 0.76)
      .setData('menuBambooPlacement', 'right-bank-dry-verge')
      .setData('menuBambooBand', 'lower-right-below-horizon')
      .setData('menuBambooStyle', 'dong-ho-natural-pigment')
      .setData('menuBambooCulmCount', 14);
    // The isolated grove keeps the registered 1536x1024 frame. Its measured ink bounds are
    // transformed onto the dry right-bank verge so the leaves begin below the mountain feet and
    // the roots remain outside the planted plots. The low scale keeps bamboo as quiet scenery.
    const bambooScale = 0.48;
    const bambooSourceBounds = { left: 590, top: 448, right: 1494, bottom: 970 };
    const bambooSourceCentre = {
      x: (bambooSourceBounds.left + bambooSourceBounds.right) / 2,
      y: (bambooSourceBounds.top + bambooSourceBounds.bottom) / 2,
    };
    const bambooTargetCentre = { x: 1235, y: 650 };
    const bambooX = left + width * (bambooTargetCentre.x / 1536)
      - width * bambooScale * (bambooSourceCentre.x / 1536 - 0.5);
    const bambooY = top + height * (bambooTargetCentre.y / 1024)
      - height * bambooScale * (bambooSourceCentre.y / 1024 - 0.5);
    bamboo
      .setDisplaySize(width * bambooScale, height * bambooScale)
      .setPosition(bambooX, bambooY)
      .setData('menuBambooHome', { x: bambooX, y: bambooY })
      .setData('menuBambooTransform', {
        scale: bambooScale,
        sourceBounds: bambooSourceBounds,
        targetCentre: bambooTargetCentre,
      });
    const lotus = layer('menu-layer-lotus-v1', 'lotus', 0.98);
    const layers = { ground, mountains, mountainMist, waterFx, bamboo, lotus };

    // The illustration carries its own softly stained paper. Feathering that paper back into the
    // scene's điệp sheet avoids a pasted rectangular edge without erasing the pale river and mist
    // inside the composition. This stays above the plate and below every word or control.
    const edge = Math.max(12, Math.min(22, width * 0.055));
    const feather = this.add.graphics().setDepth(-7.9);
    feather.fillGradientStyle(PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, 1, 1, 0, 0);
    feather.fillRect(left - 1, top - 1, width + 2, edge + 1);
    feather.fillGradientStyle(PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, 0, 0, 1, 1);
    feather.fillRect(left - 1, top + height - edge, width + 2, edge + 1);
    feather.fillGradientStyle(PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, 1, 0, 1, 0);
    feather.fillRect(left - 1, top - 1, edge + 1, height + 2);
    feather.fillGradientStyle(PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, 0, 1, 0, 1);
    feather.fillRect(left + width - edge, top - 1, edge + 1, height + 2);

    this.animateDongHoIllustration({ left, top, width, height }, layers);
  }

  /**
   * Each registered image plate owns a different movement range: distant mountains barely drift,
   * the bamboo follows a very small breeze, and the close lotus has the most visible sway.
   * Water, mist and touch ripples then add local motion without moving the stable river base.
   */
  private animateDongHoIllustration(
    bounds: { left: number; top: number; width: number; height: number },
    layers: {
      ground: Phaser.GameObjects.Image;
      mountains: Phaser.GameObjects.Image;
      mountainMist: Phaser.GameObjects.Container;
      waterFx: Phaser.GameObjects.Container;
      bamboo: Phaser.GameObjects.Image;
      lotus: Phaser.GameObjects.Image;
    },
  ): void {
    const { left, top, width, height } = bounds;
    const at = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(
      left + width * x,
      top + height * y,
    );

    const centreX = GAME_WIDTH / 2;
    const centreY = top + height / 2;
    layers.ground.setData('menuLayerMotion', 'stable-river-base');
    layers.mountains.setData('menuLayerMotion', 'distant-drift');
    layers.bamboo.setData('menuLayerMotion', 'bamboo-breeze');
    layers.lotus.setData('menuLayerMotion', 'foreground-sway');

    this.tweens.add({
      targets: layers.mountains,
      x: { from: centreX - 1.2, to: centreX + 1.2 },
      y: { from: centreY + 0.4, to: centreY - 0.4 },
      duration: 16_000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const bambooHome = layers.bamboo.getData('menuBambooHome') as { x: number; y: number };
    this.tweens.add({
      targets: layers.bamboo,
      x: { from: bambooHome.x - 0.35, to: bambooHome.x + 0.35 },
      angle: { from: -0.08, to: 0.08 },
      duration: 11_800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // Ambient drift and pointer bending use separate proxies, then combine once onto the image.
    // Competing tweens on the image's x/y/angle caused pointer motion either to snap or to vanish
    // on the next ambient frame; two inputs into one transform behave like wind plus a soft stem.
    const lotusAmbient = { x: -1.1, y: 1.4, angle: -0.1 };
    const lotusReaction = { x: 0, y: 0, angle: 0 };
    const applyLotusMotion = (): void => {
      layers.lotus
        .setPosition(centreX + lotusAmbient.x + lotusReaction.x, centreY + lotusAmbient.y + lotusReaction.y)
        .setAngle(lotusAmbient.angle + lotusReaction.angle)
        .setData('menuLotusReaction', { ...lotusReaction });
    };
    layers.lotus
      .setData('menuMotionProxy', lotusAmbient)
      .setData('menuLotusResponse', 'damped-pointer-spring');
    this.tweens.add({
      targets: lotusAmbient,
      x: { from: -1.1, to: 1.4 },
      y: { from: 1.4, to: -1.4 },
      angle: { from: -0.1, to: 0.1 },
      duration: 4_900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: applyLotusMotion,
    });
    applyLotusMotion();

    // The centre of the painted river, read from the generated plate in normalized coordinates.
    // Effects and hit feedback share this curve, so a ripple cannot appear in a rice plot.
    const river = new Phaser.Curves.Spline([
      at(0.52, 0.43), at(0.46, 0.47), at(0.34, 0.51), at(0.20, 0.57),
      at(0.15, 0.64), at(0.22, 0.71), at(0.38, 0.80), at(0.53, 0.90),
      at(0.60, 0.97),
    ]);

    // Sparse, long current strokes travel by arc length rather than raw spline parameter. That
    // removes the old acceleration through tight bends, while a 48–58 second passage reads as
    // an unhurried stream instead of little marks racing down a track.
    const currentCount = getGraphicsQuality() === 'low' ? 5 : 8;
    for (let index = 0; index < currentCount; index += 1) {
      const current = this.add.graphics()
        .setData('menuAmbient', 'river-current')
        .setData('menuCurrentLane', index % 3 - 1)
        .setData('menuCurrentVisibility', 'readable')
        .setData('menuCurrentInterpolation', 'arc-length')
        .setData('menuCurrentDuration', 48_000 + index * 1_800 + (index % 2) * 2_400);
      layers.waterFx.add(current);
      inkPath(current, [{ x: -13, y: 0 }, { x: -5, y: -0.35 }, { x: 4, y: 0.28 }, { x: 14, y: 0 }], 7200 + index, {
        width: 0.64,
        alpha: 0.62,
        colour: PIGMENT.cham,
        wobble: 0.16,
        step: 5,
      });
      inkPath(current, [{ x: -9, y: 2 }, { x: 0, y: 1.72 }, { x: 10, y: 2 }], 7250 + index, {
        width: 0.44,
        alpha: 0.48,
        colour: PIGMENT.chamPale,
        wobble: 0.12,
        step: 5,
      });

      const lane = (index % 3 - 1) * (0.62 + ((index * 37) % 5) * 0.07);
      const phase = { t: index / currentCount };
      const place = (): void => {
        const progress = phase.t % 1;
        const point = river.getPointAt(progress);
        const tangent = river.getTangentAt(progress).normalize();
        const laneWidth = width * (0.006 + progress * 0.012);
        current.setPosition(
          point.x - tangent.y * lane * laneWidth,
          point.y + tangent.x * lane * laneWidth,
        );
        current.setRotation(Math.atan2(tangent.y, tangent.x));
        current.setScale(0.5 + progress * 0.72);
        current.setAlpha(Math.sin(progress * Math.PI) * (0.5 + (index % 3) * 0.05));
      };
      place();
      this.tweens.add({
        targets: phase,
        t: phase.t + 1,
        duration: current.getData('menuCurrentDuration') as number,
        repeat: -1,
        ease: 'Linear',
        onUpdate: place,
      });
    }

    // Three feathered banks are real children of the mountain depth layer. Rendering order is
    // ground -> mountain -> mist -> village -> lotus, so the haze sits in the valley instead of
    // becoming a translucent white sticker across the roofs and foreground flowers.
    const mistStarts = [at(0.18, 0.44), at(0.40, 0.455), at(0.64, 0.44), at(0.82, 0.43)];
    for (let index = 0; index < mistStarts.length; index += 1) {
      const mist = this.add.graphics()
        .setData('menuAmbient', 'mountain-mist')
        .setData('menuMistLayer', 'mountains')
        .setData('menuMistVisibility', 'readable');
      const span = width * (0.3 + (index % 2) * 0.08);
      const bandHeight = Math.max(8, height * (0.042 + index * 0.004));
      mist.fillStyle(PIGMENT.diepHi, 0.58);
      mist.fillEllipse(-span * 0.17, 0, span * 0.7, bandHeight);
      mist.fillStyle(PIGMENT.diep, 0.7);
      mist.fillEllipse(span * 0.14, 1, span * 0.82, bandHeight * 0.78);
      mist.fillStyle(PIGMENT.diepHi, 0.48);
      mist.fillEllipse(0, -1, span, bandHeight * 0.5);
      mist.fillStyle(PIGMENT.chamPale, 0.16);
      mist.fillEllipse(span * 0.04, bandHeight * 0.18, span * 0.86, bandHeight * 0.34);
      inkPath(mist, [
        { x: -span * 0.43, y: -bandHeight * 0.06 },
        { x: -span * 0.19, y: bandHeight * 0.08 },
        { x: span * 0.04, y: -bandHeight * 0.04 },
        { x: span * 0.24, y: bandHeight * 0.07 },
        { x: span * 0.44, y: -bandHeight * 0.03 },
      ], 7_350 + index, {
        width: 0.66,
        alpha: 0.32,
        colour: PIGMENT.chamPale,
        wobble: 0.55,
        step: 5,
      });
      layers.mountainMist.add(mist);
      const start = mistStarts[index];
      mist.setPosition(start.x, start.y).setAlpha(0.58);
      this.tweens.add({
        targets: mist,
        x: start.x + width * (index % 2 === 0 ? 0.055 : -0.045),
        y: start.y + (index % 2 === 0 ? -1.2 : 1.1),
        alpha: { from: 0.48, to: 0.78 },
        scaleX: { from: 0.94, to: 1.09 },
        duration: 10_200 + index * 1_900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Decorative interaction sits below all real menu controls. Even where the art safely
    // overscans beneath the first plate, that plate wins the input sort and keeps its route.
    const touch = this.add.zone(left, top, width, height)
      .setOrigin(0, 0)
      .setDepth(-6)
      .setInteractive()
      .setData('menuLandscapeInteraction', 'river-ripple');
    touch.setData('menuRiverGestures', ['tap', 'drag', 'hover-wake']);
    const nearestOnRiver = (targetX: number, targetY: number): {
      point: Phaser.Math.Vector2;
      tangent: Phaser.Math.Vector2;
      distance: number;
    } => {
      let nearest = river.getPoint(0);
      let nearestT = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let sample = 0; sample <= 96; sample += 1) {
        const t = sample / 96;
        const point = river.getPoint(t);
        const distance = Phaser.Math.Distance.Squared(targetX, targetY, point.x, point.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = point;
          nearestT = t;
        }
      }
      return { point: nearest, tangent: river.getTangent(nearestT).normalize(), distance: nearestDistance };
    };

    touch.on('pointerdown', (_pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
      const nearest = nearestOnRiver(left + localX, top + localY);
      const angle = Math.atan2(nearest.tangent.y, nearest.tangent.x);
      this.spawnDongHoWake(layers.waterFx, nearest.point.x, nearest.point.y, angle, width / GAME_WIDTH, 1);
      this.spawnDongHoRipple(layers.waterFx, nearest.point.x, nearest.point.y, width / GAME_WIDTH);
    });

    let lastWakeAt = -1_000;
    let lastDragRippleAt = -1_000;
    touch.on('pointermove', (pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
      const nearest = nearestOnRiver(left + localX, top + localY);
      const closeToWater = nearest.distance <= (width * 0.075) ** 2;
      if (!closeToWater || this.time.now - lastWakeAt < 90) return;
      lastWakeAt = this.time.now;
      const angle = Math.atan2(nearest.tangent.y, nearest.tangent.x);
      this.spawnDongHoWake(layers.waterFx, nearest.point.x, nearest.point.y, angle, width / GAME_WIDTH, pointer.isDown ? 0.9 : 0.42);
      if (pointer.isDown && this.time.now - lastDragRippleAt >= 260) {
        lastDragRippleAt = this.time.now;
        this.spawnDongHoRipple(layers.waterFx, nearest.point.x, nearest.point.y, width / GAME_WIDTH * 0.72);
      }
    });

    // The foreground lotus owns the top-left water region. A local hit zone keeps this gesture
    // separate from the river wake zone underneath it, while a soft overshooting return gives the
    // cluster the feel of stems bending and settling instead of a sprite following the cursor.
    const lotusTouch = this.add.zone(
      left + width * 0.02,
      top + height * 0.53,
      width * 0.51,
      height * 0.45,
    )
      .setOrigin(0, 0)
      .setDepth(-5.8)
      .setInteractive()
      .setData('menuLandscapeInteraction', 'lotus-sway')
      .setData('menuLotusGestures', ['hover', 'drag', 'water-wake']);
    layers.lotus.setData('menuLotusWaterResponse', 'wake-and-ripple');
    let lastLotusPointer: { x: number; y: number } | undefined;
    let lastLotusWakeAt = -1_000;
    let lastLotusRippleAt = -1_000;
    const wakeBelowLotus = (
      pointer: Phaser.Input.Pointer,
      localX: number,
      localY: number,
      initial = false,
    ): void => {
      if (!initial && this.time.now - lastLotusWakeAt < 110) return;
      lastLotusWakeAt = this.time.now;
      const nearest = nearestOnRiver(lotusTouch.x + localX, lotusTouch.y + localY);
      const angle = Math.atan2(nearest.tangent.y, nearest.tangent.x);
      this.spawnDongHoWake(
        layers.waterFx,
        nearest.point.x,
        nearest.point.y,
        angle,
        width / GAME_WIDTH,
        pointer.isDown ? 0.86 : 0.38,
        'lotus',
      );
      if (pointer.isDown && this.time.now - lastLotusRippleAt >= 260) {
        lastLotusRippleAt = this.time.now;
        this.spawnDongHoRipple(layers.waterFx, nearest.point.x, nearest.point.y, width / GAME_WIDTH * 0.65);
      }
    };
    const bendLotus = (pointer: Phaser.Input.Pointer, localX: number, localY: number): void => {
      const fallbackX = (localX / lotusTouch.width - 0.5) * 5;
      const fallbackY = (localY / lotusTouch.height - 0.5) * 2;
      const dx = lastLotusPointer ? localX - lastLotusPointer.x : fallbackX;
      const dy = lastLotusPointer ? localY - lastLotusPointer.y : fallbackY;
      lastLotusPointer = { x: localX, y: localY };
      const strength = pointer.isDown ? 1 : 0.52;
      wakeBelowLotus(pointer, localX, localY);
      this.tweens.killTweensOf(lotusReaction);
      lotusReaction.x = Phaser.Math.Clamp(lotusReaction.x + dx * 0.22 * strength, -4.8, 4.8);
      lotusReaction.y = Phaser.Math.Clamp(lotusReaction.y + dy * 0.12 * strength, -2.4, 2.4);
      lotusReaction.angle = Phaser.Math.Clamp(lotusReaction.angle + dx * 0.09 * strength, -1.8, 1.8);
      applyLotusMotion();
      this.tweens.add({
        targets: lotusReaction,
        x: 0,
        y: 0,
        angle: 0,
        duration: pointer.isDown ? 940 : 720,
        ease: 'Back.easeOut',
        onUpdate: applyLotusMotion,
      });
    };
    lotusTouch.on('pointerover', (pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
      lastLotusPointer = { x: localX, y: localY };
      wakeBelowLotus(pointer, localX, localY, true);
    });
    lotusTouch.on('pointermove', bendLotus);
    lotusTouch.on('pointerdown', bendLotus);
    lotusTouch.on('pointerout', () => {
      lastLotusPointer = undefined;
    });
  }

  /** One touch answer, gone before it can become another permanent object in the composition. */
  private spawnDongHoRipple(parent: Phaser.GameObjects.Container, x: number, y: number, artScale: number): void {
    const ripple = this.add.graphics({ x, y })
      .setScale(0.35)
      .setData('menuRipple', true);
    parent.add(ripple);
    ripple.lineStyle(0.95, PIGMENT.cham, 0.78);
    ripple.strokeEllipse(0, 0, 20 * artScale, 5.5 * artScale);
    ripple.lineStyle(0.65, PIGMENT.chamPale, 0.66);
    ripple.strokeEllipse(0, 0, 30 * artScale, 8 * artScale);
    this.tweens.add({
      targets: ripple,
      scaleX: 1.7,
      scaleY: 1.7,
      alpha: { from: 0.88, to: 0 },
      duration: 760,
      ease: 'Quad.easeOut',
      onComplete: () => ripple.destroy(),
    });
  }

  /** A brief current-aligned answer to hover or drag, carried downstream instead of expanding in place. */
  private spawnDongHoWake(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    angle: number,
    artScale: number,
    strength: number,
    source: 'river' | 'lotus' = 'river',
  ): void {
    const wake = this.add.graphics({ x, y })
      .setRotation(angle)
      .setAlpha(0.82 * strength)
      .setScale(0.7)
      .setData('menuWaterWake', true)
      .setData('menuWakeSource', source);
    parent.add(wake);
    const seed = 7_400 + Math.round(this.time.now) % 997;
    inkPath(wake, [{ x: -7, y: -2 }, { x: -1, y: -1.4 }, { x: 6, y: -2.2 }], seed, {
      width: 0.74,
      alpha: 0.74,
      colour: PIGMENT.cham,
      wobble: 0.24,
      step: 4,
    });
    inkPath(wake, [{ x: -6, y: 2 }, { x: 0, y: 1.4 }, { x: 7, y: 2.2 }], seed + 1, {
      width: 0.58,
      alpha: 0.62,
      colour: PIGMENT.chamPale,
      wobble: 0.2,
      step: 4,
    });
    const travel = 14 * artScale;
    this.tweens.add({
      targets: wake,
      x: x + Math.cos(angle) * travel,
      y: y + Math.sin(angle) * travel,
      scaleX: 1.25,
      scaleY: 1.05,
      alpha: 0,
      duration: 720 + Math.round(180 * strength),
      ease: 'Quad.easeOut',
      onComplete: () => wake.destroy(),
    });
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
   * A quiet Lý–Trần ceramic composition rather than a miniature strategy map: the mountains stay,
   * while the armies, standards, buffalo, field grid and scattered villages give way to a river,
   * broad right-bank paddies, two farmhouses and lotus. Four ideas can be read at phone scale;
   * forty little objects can only be counted.
   */
  private drawDongHoLandscape(river: MenuRiver): void {
    const g = this.add.graphics()
      .setData('menuLandscapeRole', 'ground');
    const rand = mulberry32(1307);
    const HORIZON = 292;
    const FLOOR = 500;

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
    }).setData('menuLandscapeRole', 'mountains');

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

    // Three nearly transparent ground washes, not seven competing terrain bands. They give the
    // houses somewhere to stand without turning the illustration back into a map.
    for (let band = 0; band < 3; band += 1) {
      const y = HORIZON + band * ((FLOOR - HORIZON) / 3);
      g.fillStyle(band % 2 === 0 ? PIGMENT.diepLo : PIGMENT.hoePale, 0.07 - band * 0.012);
      g.fillEllipse(GAME_WIDTH / 2 + (rand() - 0.5) * 45, y + 28, GAME_WIDTH * 1.6, 170);
    }

    // The river as a course rather than a stripe: a band that narrows upstream, with its own inked
    // banks, running off the left edge before it reaches the buttons.
    washInk(g, river.banks, PIGMENT.chamWash, 3007, 0.55);
    inkPath(g, river.banks, 3008, { width: 0.85, alpha: 0.36, colour: PIGMENT.cham, wobble: 1.2, step: 13 });

    // Six large plots sharing their boundaries. The old eleven-unit lattice made a hundred little
    // tiles; these read as one cultivated river plain before they read as individual rectangles.
    const paddies: FieldPlot[] = [
      { points: [{ x: 246, y: 330 }, { x: 310, y: 326 }, { x: 304, y: 359 }, { x: 234, y: 365 }], stage: 0.84, seed: 4201 },
      { points: [{ x: 310, y: 326 }, { x: 402, y: 332 }, { x: 394, y: 361 }, { x: 304, y: 359 }], stage: 0.22, seed: 4202 },
      { points: [{ x: 234, y: 365 }, { x: 304, y: 359 }, { x: 300, y: 400 }, { x: 218, y: 409 }], stage: 0.62, seed: 4203 },
      { points: [{ x: 304, y: 359 }, { x: 394, y: 361 }, { x: 390, y: 402 }, { x: 300, y: 400 }], stage: 0.86, seed: 4204 },
      { points: [{ x: 218, y: 409 }, { x: 300, y: 400 }, { x: 294, y: 449 }, { x: 196, y: 462 }], stage: 0.58, seed: 4205 },
      { points: [{ x: 300, y: 400 }, { x: 390, y: 402 }, { x: 398, y: 448 }, { x: 294, y: 449 }], stage: 0.9, seed: 4206 },
    ];
    for (const plot of paddies) {
      drawFieldPlot(g, plot);
    }
    g.setData('menuRiceFields', paddies.map((plot) => ({
      x: plot.points.reduce((sum, point) => sum + point.x, 0) / plot.points.length,
      y: plot.points.reduce((sum, point) => sum + point.y, 0) / plot.points.length,
    })));

    // Exactly two homes, because this is a farmstead rather than a village icon cluster. They use
    // the map's nhà ba gian renderer: packed-earth walls and low rice-straw roofs, no temple finial.
    this.aspectProp(290, 385, (prop) => house(prop, -23, 0, 1.58, 4301))
      .setData('menuLandscapeRole', 'farmhouse');
    this.aspectProp(337, 417, (prop) => house(prop, -21, 0, 1.42, 4302))
      .setData('menuLandscapeRole', 'farmhouse');

    // Ripples ride the surface rather than being scratched onto it at random. Level strokes only:
    // randomising both ends put crossed scratches on the water.
    for (let ripple = 0; ripple < 6; ripple += 1) {
      const y = HORIZON + 20 + rand() * 220;
      const span = river.spanAt(y);
      if (!span) continue;
      const x = span.left + 3 + rand() * Math.max(2, span.right - span.left - 6);
      inkPath(g, [{ x: x - 6, y }, { x: x + 6, y: y + 1 }], 3100 + ripple,
        { width: 0.6, alpha: 0.26, colour: PIGMENT.cham, wobble: 0.4, step: 6 });
    }

    this.aspectProp(26, 486, (prop) => this.drawMenuLotusCluster(prop))
      .setData('menuLandscapeRole', 'lotus');
  }

  /** Two open lotus flowers and three leaves, large enough to read as the foreground at phone size. */
  private drawMenuLotusCluster(g: Phaser.GameObjects.Graphics): void {
    const leaf = (cx: number, cy: number, rx: number, ry: number, seed: number): void => {
      const points: Pt[] = [];
      for (let index = 0; index < 28; index += 1) {
        const angle = (index / 28) * Math.PI * 2;
        points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
      }
      washInk(g, points, PIGMENT.tramPale, seed, 0.42, 0.35);
      inkPath(g, [...points, points[0]], seed + 1, {
        width: 0.8, alpha: 0.55, colour: PIGMENT.tramDeep, wobble: 0.3, step: 5,
      });
      for (const angle of [-2.55, -2.05, -1.55, -1.05, -0.55]) {
        inkPath(g, [
          { x: cx, y: cy },
          { x: cx + Math.cos(angle) * rx * 0.86, y: cy + Math.sin(angle) * ry * 0.86 },
        ], seed + 4 + Math.round(angle * 10), {
          width: 0.45, alpha: 0.28, colour: PIGMENT.tramDeep, wobble: 0.15, step: 4,
        });
      }
    };
    const flower = (cx: number, cy: number, scale: number, seed: number, petals: number): void => {
      for (let index = 0; index < petals; index += 1) {
        const t = petals === 1 ? 0.5 : index / (petals - 1);
        const angle = -Math.PI + 0.32 + t * (Math.PI - 0.64);
        const length = scale * (11.5 - Math.abs(t - 0.5) * 5);
        const width = scale * 3.4;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const px = -dy;
        const py = dx;
        const petal: Pt[] = [
          { x: cx, y: cy + scale * 2 },
          { x: cx + dx * length * 0.46 + px * width, y: cy + dy * length * 0.46 + py * width },
          { x: cx + dx * length, y: cy + dy * length },
          { x: cx + dx * length * 0.46 - px * width, y: cy + dy * length * 0.46 - py * width },
        ];
        washInk(g, petal, PIGMENT.diepHi, seed + index, 0.88, 0.18);
        inkPath(g, [...petal, petal[0]], seed + 20 + index, {
          width: 0.7, alpha: 0.68, colour: PIGMENT.nau, wobble: 0.18, step: 4,
        });
      }
      inkPath(g, [{ x: cx - scale * 8, y: cy + scale * 2 }, { x: cx, y: cy + scale * 5 }, { x: cx + scale * 8, y: cy + scale * 2 }], seed + 40, {
        width: 0.8, alpha: 0.58, colour: PIGMENT.nau, wobble: 0.22, step: 4,
      });
    };

    // Still water first, then stems behind the leaves and flowers.
    for (let line = 0; line < 3; line += 1) {
      inkPath(g, [{ x: -4 + line * 6, y: line * 3 }, { x: 92 - line * 4, y: line * 3 + 1 }], 5000 + line, {
        width: 0.55, alpha: 0.24, colour: PIGMENT.cham, wobble: 0.5, step: 9,
      });
    }
    inkPath(g, [{ x: 28, y: 2 }, { x: 30, y: -52 }], 5010, { width: 0.9, alpha: 0.62, colour: PIGMENT.tramDeep, wobble: 0.25, step: 6 });
    inkPath(g, [{ x: 70, y: 2 }, { x: 69, y: -33 }], 5011, { width: 0.8, alpha: 0.58, colour: PIGMENT.tramDeep, wobble: 0.22, step: 6 });
    leaf(12, -8, 20, 8, 5020);
    leaf(47, -9, 17, 7, 5030);
    leaf(76, -5, 19, 8, 5040);
    flower(30, -49, 1.8, 5050, 7);
    flower(69, -31, 1.05, 5060, 5);
  }

  /**
   * What moves on the front page: only a handful of water strokes.
   *
   * The Đông Hồ menu had four banners twitching and nothing else — a printed picture with a corner
   * flapping. The river is the largest thing on the sheet and was the most obviously frozen, so it
   * carries the load: strokes ride the surface downstream and fade at each end of their run. The
   * farm itself stays still, which is part of the calm the composition is meant to create.
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

    // No birds, people, animals or banners. Motion belongs to the water and nowhere else.
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
    // The tour ends when the page it is touring does.
    //
    // `startTour` only runs from `create`, and only on the front page — but `render` changes
    // `mode` without going near `create`, so the tour outlived the page it was measured against.
    // Its veil is a full-screen `setInteractive` blocker at depth 900: left up over the settings
    // sheet it framed nothing and deafened everything under it. Measured, with the tour running,
    // tapping a map-theme option did exactly nothing while the same tap worked without it — which
    // is what "changing map type does not work any more" is.
    //
    // Navigating away answers the tour's question the same way Skip does, so it counts as seen —
    // see `onClose`, which takes the same view.
    if (this.copilot && this.copilotFor !== this.mode) {
      this.copilot.destroy();
      this.copilot = undefined;
      if (this.copilotFor === 'classic') markClassicTourSeen();
      else markTourSeen();
      this.copilotFor = undefined;
    }
    this.clearContent();
    this.renderTitle();
    this.renderPage();
    // Last, and on every mode rather than only the front page: it is app chrome, not a row of this
    // screen. Last also because its caption is set in the footer's left margin and the support
    // sentence is drawn into the same band — printed under the page, the caption would spend its
    // three seconds behind "help build the game".
    this.renderInstallMark();
  }

  private renderPage(): void {
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

    this.renderUpdateNotice();

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
    // These are doors beside the run, not rival calls to action. Their printed plates are narrower
    // and less than two thirds as tall as Dragon Ascent's; the invisible hit rectangle grows back
    // to 44 units so the visual hierarchy costs no touchability. Continue still owns two lines, so
    // 30 is the floor below which its save note would become cramped even in the smaller type.
    const SECONDARY_WIDTH = 240;
    const SECONDARY_X = Math.round((GAME_WIDTH - SECONDARY_WIDTH) / 2);
    const ROW = Math.max(30, this.vh(32));
    const SECONDARY_HIT_PADDING = Math.max(0, 44 - ROW);

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
    // Continue holds its row whether or not there is a save behind it, greyed when there is not.
    //
    // It used to be dropped entirely on a first run, on the argument that a disabled row spends a
    // line of a phone screen saying something can't be resumed that was never started. What that
    // costs is a page whose shape changes under the player: the column ran two rows instead of
    // three and left an obvious hole above the footer — see `menu-nosave-844` — and the row every
    // returning player reaches for was somewhere different on their first visit from where it is
    // on every visit after. A greyed row with the reason printed under it says what the missing
    // row could not, and it says it in the place the answer will later appear.
    const rows = this.vh(58) + tagline.height + ROW + ROW;
    // TWICE the gap for the break, not three times it. Three left an obvious hole between the last
    // row and Settings while the art above the column was being crowded — the page had its slack
    // in the one place nothing needed it. Doubling is still an unmissable break (the gaps inside
    // the group are 12 design units at 844 against 24 here) and it hands the difference back to
    // the column, which now sits that much lower down the sheet.
    //
    // The budget, at the 620 floor where it is tightest: SETTINGS_TOP is 506 and ART_FLOOR 322, so
    // the column has 184. The rows come to 36 + 28 (the tagline wraps to two lines in Vietnamese)
    // + 30 + 30 = 124, and five gaps land at the 9-unit ceiling for 45. The smaller secondary tier
    // leaves enough air for its hierarchy to read without pushing the primary action into the art.
    const inner = 3;
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

    this.tourTargets.classic = { x: SECONDARY_X, y: cursor, width: SECONDARY_WIDTH, height: ROW };
    this.content.push(this.ui.button(this.tourTargets.classic, t('ascent.menu.classic'), () => {
      this.mode = 'classic';
      this.render();
    }, { variant: 'secondary', fontSize: '12px', extraHitPadding: SECONDARY_HIT_PADDING })
      .setData('menuSecondary', 'classic')
      .setData('visualBounds', { width: SECONDARY_WIDTH, height: ROW }));
    cursor += ROW + gap;

    // `snapshotLabel()` already answers both cases — the save's date, or "no saved campaign" — and
    // the disabled variant greys the sub-label along with the label, so the row reads as one
    // unavailable thing rather than as a live button with a warning under it.
    this.content.push(this.ui.button({ x: SECONDARY_X, y: cursor, width: SECONDARY_WIDTH, height: ROW }, t('menu.continue'), () => {
      const snapshot = loadSnapshot();
      if (snapshot) {
        this.startGame(snapshot.state);
      }
    }, {
      variant: saved ? 'ghost' : 'disabled',
      fontSize: '11px',
      subLabel: snapshotLabel(),
      extraHitPadding: SECONDARY_HIT_PADDING,
    })
      .setData('menuSecondary', 'continue')
      .setData('visualBounds', { width: SECONDARY_WIDTH, height: ROW }));
    cursor += ROW + gap;
    // The group break, and the reason the footer reads as a different kind of thing from the
    // buttons above it.
    cursor += gap * 2;

    this.renderLanguageSwitch();
    this.renderFooterPair();

    this.renderSupportRow();
    this.renderVersionLine();

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
   * The one line the front page will interrupt itself for: there is a newer game than this one.
   *
   * It hangs under the gold rule, on the sky above the karst, and it is an overlay — nothing below
   * it moves. That is deliberate. The button column's gaps are already clamped at their floor on a
   * 620-tall sheet (`renderMain` shares out whatever is left between the art and the footer), so a
   * notice that took a row would have taken it out of the landscape, on every page load, for a
   * state that is true for about a minute a month.
   *
   * Under the rule rather than over the top of the sheet: the first pass put it at vy(112), which
   * on every height printed it straight across the bottom third of the drum. The mark and the
   * wordmark own everything from the top edge down to the rule at 206, and the only paper this
   * page has spare is the sky between that rule and the mountain tops.
   *
   * Only the two states that are news are shown — one on its way down, one waiting to be taken.
   * "Saving for offline play" and "ready to play offline" are the settings page's business: the
   * front page is not the place to narrate housekeeping that needs no decision.
   */
  private renderUpdateNotice(): void {
    const status = getUpdateStatus();
    if (status !== 'ready' && status !== 'installing') {
      return;
    }

    const ready = status === 'ready';
    const label = this.ui.label(
      GAME_WIDTH / 2,
      this.vy(224),
      ready ? t('menu.update.readyHint') : t('menu.update.installing'),
      'caption',
      {
        color: ready ? '#8a2a1b' : INK_UI_HEX.mutedText,
        fontSize: '11px',
        fontStyle: ready ? '700' : '400',
        align: 'center',
        // The paper behind it is a landscape; small type straight onto a mountain is unreadable.
        backgroundColor: 'rgba(243,230,196,0.86)',
        padding: { x: 9, y: 4 },
      },
    ).setOrigin(0.5);
    this.content.push(label);

    if (!ready) {
      return;
    }

    const hit = this.add
      .rectangle(GAME_WIDTH / 2, label.y, label.width + 20, label.height + 12, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => applyUpdate());
    this.content.push(hit);
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

    /**
     * Skirmish first, and the two long games under it.
     *
     * The order is by how much of an evening each one asks for, not by how much game is in it.
     * Skirmish is one fight: set both hosts, pick the ground, take command, and it is over in
     * minutes. The other two are runs. Somebody arriving on this page who has not decided what
     * they want should meet the cheapest thing to try first — and it is also the only one here
     * that teaches the battle system, which both of the others eventually hand you.
     *
     * Called Skirmish rather than "The Field" for the reason the genre already settled: it is what
     * a one-off fight outside a campaign is called, in this kind of game, everywhere.
     */
    for (const mode of [
      {
        title: t('arena.title'),
        body: t('arena.menuBlurb'),
        border: INK_UI.cinnabar,
        variant: 'primary' as const,
        start: 'arena' as const,
      },
      {
        title: t('empire.menu.title'),
        body: t('ascent.menu.empireBlurb'),
        border: INK_UI.gold,
        variant: 'secondary' as const,
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
          onClick: () => (mode.start === 'arena'
            ? this.scene.start('BattleArenaScene')
            : this.scene.start('CampaignScene', { mode: mode.start })),
        },
      });
      this.content.push(card);
      // The tour on this page points at the first card, so its measured rectangle is kept. Height
      // comes off the card rather than from the 88 requested: `InkUI.card` grows to fit whatever
      // its body wraps to, and in Vietnamese every one of these blurbs runs a line longer.
      if (mode.start === 'arena') {
        this.tourTargets.skirmish = {
          x: 28,
          y: cursor,
          width: GAME_WIDTH - 56,
          height: card.getData('cardHeight') as number,
        };
      }
      cursor += (card.getData('cardHeight') as number) + 14;
    }

    // First time on this page, once: what a skirmish is and how one is won.
    this.startClassicTour();

    this.content.push(this.ui.backBar(cursor + 6, () => {
      this.mode = 'main';
      this.render();
    }));
  }

  /**
   * Dragon Ascent skips the setup screen entirely: the founder choice is the run's first
   * in-game prompt, so starting a run is one tap and no menu.
   */
  private startAscentRun(): void {
    const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    this.scene.start('ConquestScene', { state });
  }

  /**
   * The three cards on the classic page, explained the first time somebody opens it.
   *
   * Skirmish gets two of the three because it is the one mode nothing else on the front page
   * prepares you for: the other two are runs whose shape the Dragon Ascent tour already
   * described, while a skirmish is a single fight with its own vocabulary — ground, posture,
   * focus, reserve — and no economy underneath to forgive a mistake.
   *
   * Its own storage flag. A player who skipped the front page's tour may still want this one,
   * and a player who watched it has not thereby been told what a skirmish is.
   */
  private startClassicTour(): void {
    if (this.classicTourDone || this.copilot || hasSeenClassicTour()) return;
    this.classicTourDone = true;

    const steps: CopilotStep[] = [
      {
        id: 'skirmish',
        heading: 'copilot.classic.skirmish.h',
        body: 'copilot.classic.skirmish.b',
        target: () => this.tourTargets.skirmish,
      },
      {
        id: 'skirmish-win',
        heading: 'copilot.classic.win.h',
        body: 'copilot.classic.win.b',
        target: () => this.tourTargets.skirmish,
      },
      { id: 'classic-long', heading: 'copilot.classic.long.h', body: 'copilot.classic.long.b' },
    ];

    this.copilotFor = 'classic';
    this.copilot = new Copilot(this, {
      steps,
      // The offer at the end is the thing the tour just spent two of its three cards on.
      onGuide: () => this.scene.start('BattleArenaScene'),
      onClose: () => {
        markClassicTourSeen();
        this.copilot = undefined;
        this.copilotFor = undefined;
      },
    });
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

    this.content.push(this.ui.backBar(Math.min(y + 6, this.vy(726)), () => {
      this.mode = 'main';
      this.render();
    }));
  }

  /**
   * One row of mutually exclusive settings: a heading and a strip of tiles.
   *
   * Style, graphics and language were three copies of the same twenty lines, which is why they had
   * drifted to three different tile heights.
   */
  /**
   * The language switch: two flags and names under the utility row, the inactive one tappable.
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
   * BOTH languages are shown, Vietnamese first, with the current one inked and the other in muted
   * type. A single
   * button naming only the other language has to be understood before it can be used; a pair says
   * "these are the two, this is the one you are on" at a glance, and the tap target is unambiguous.
   */
  private renderLanguageSwitch(): void {
    const current = getLanguage();
    const options: Array<{ id: LanguageCode; label: string }> = [
      { id: 'vi', label: 'Tiếng Việt' },
      { id: 'en', label: 'English' },
    ];
    const y = LANGUAGE_TOP + LANGUAGE_ROW_HEIGHT / 2;
    const FLAG_WIDTH = 22;
    const FLAG_GAP = 6;
    const OPTION_GAP = 20;

    const labels = options.map((option) => this.ui.label(0, y, option.label, 'button', {
      color: option.id === current ? '#3a2a14' : INK_UI_HEX.mutedText,
      fontSize: '11px',
      fontStyle: option.id === current ? '700' : '400',
    }).setOrigin(0, 0.5));
    const widths = labels.map((label) => FLAG_WIDTH + FLAG_GAP + label.width);
    const total = widths[0] + OPTION_GAP + widths[1];
    let cursor = (GAME_WIDTH - total) / 2;

    labels.forEach((label, index) => {
      const option = options[index];
      const width = widths[index];
      const flag = drawLanguageFlag(this, option.id, FLAG_WIDTH, 14)
        .setPosition(cursor + FLAG_WIDTH / 2, y);
      label.setX(cursor + FLAG_WIDTH + FLAG_GAP);
      this.content.push(flag, label);

      // The whole flag-and-name group is the target; neither the star nor a short word has to be
      // hit exactly. The current language remains inert so the selected state is unambiguous.
      const hit = this.add
        .rectangle(cursor + width / 2, y, width + 12, LANGUAGE_ROW_HEIGHT + 12, 0xffffff, 0.001)
        .setData('languageOption', option.id);
      if (option.id !== current) {
        hit.setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => {
          setLanguage(option.id);
          this.render();
        });
      }
      this.content.push(hit);
      cursor += width + OPTION_GAP;
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
            // The ladder's rung override shadows the tier inside `profile()` — without re-pointing
            // it, `renderScale()` keeps answering from the old rung and this tap changes nothing.
            qualityLadder()?.force(rungForTier(id).id);
            // No reload: the new tier's scale is applied to the live buffer at this boundary
            // and the menu rebuilds itself — labels re-rasterise at the new resolution.
            requestRenderScale(renderScale());
            applyPendingRenderScale(this.game);
            this.scene.restart();
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
      /**
       * ── The fight itself ──
       *
       * Not a graphics setting and not a taste setting about the map: these two change how the game
       * plays. Difficulty is how fast an invader answers the shape you are standing in — the fight
       * is a race between spotting a matchup and being countered out of it, so reaction time is the
       * one number that makes it harder without making it a different game. Pace is how long a
       * round is held on screen.
       *
       * Repeated on the skirmish setup page, which is where a player actually tries them out.
       */
      {
        name: t('arena.difficulty'),
        build: (y) => this.renderSettingRow(
          { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
          t('menu.battleDifficulty'),
          BATTLE_DIFFICULTIES.map((id) => ({
            id, label: t(`arena.difficulty.${id}` as 'arena.difficulty.easy'),
          })),
          getBattleDifficulty(),
          (id) => {
            setBattleDifficulty(id);
            this.render();
          },
        ),
      },
      {
        name: t('arena.speed'),
        build: (y) => this.renderSettingRow(
          { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
          t('menu.battleSpeed'),
          BATTLE_SPEEDS.map((id) => ({ id, label: t(`arena.speed.${id}` as 'arena.speed.slow') })),
          getBattleSpeed(),
          (id) => {
            setBattleSpeed(id);
            this.render();
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
          [{ id: 'vi' as LanguageCode, label: 'Tiếng Việt' }, { id: 'en' as LanguageCode, label: 'English' }],
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

    // The sheet is sized from this sum, and the way back is one fixed control on every page now
    // — see `BACK_BAR_HEIGHT`. Scaled, it came out 27 points tall on a 620 sheet.
    const backHeight = BACK_BAR_HEIGHT;
    // The update block: a rule, one line of type, and — only when there is something to take — the
    // button that takes it. Measured here rather than drawn and hoped for, because the plate is
    // sized from this sum and a short sheet (620) has nothing to spare at the bottom.
    const status = getUpdateStatus();
    const VERSION_LINE = 13;
    const STATUS_LINE = 15;
    const updateButtonHeight = status === 'ready' ? this.vh(34) : 0;
    const updateHeight = status === 'unsupported'
      ? 0
      : 14 + VERSION_LINE + 4 + STATUS_LINE + (updateButtonHeight > 0 ? 8 + updateButtonHeight : 0);
    const plateHeight = PAD + title.height + 20
      + settings.length * ROW_HEIGHT + (settings.length - 1) * ROW_GAP
      + updateHeight
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
    cursor -= ROW_GAP;

    // ── Which build this is, and whether there is a better one ──
    //
    // Two lines rather than one. The build stamp is a serial number a player reads out to somebody
    // else; the state is a sentence they act on. Run together they were a line nobody finished.
    if (updateHeight > 0) {
      cursor += 14;

      const version = this.ui.label(contentX, cursor, buildStamp(), 'caption', {
        color: INK_UI_HEX.mutedText,
        fontSize: '9px',
      }).setOrigin(0, 0);
      this.content.push(version);

      // The manual check is offered only at rest. While anything is in flight the game is already
      // asking, and a button that re-asks a question being answered is a button that does nothing.
      if (status === 'offlineReady') {
        const check = this.ui.textLink(
          contentX + contentWidth,
          cursor + VERSION_LINE / 2,
          t('menu.update.check'),
          // Forced: a player who taps a button labelled "check for updates" gets a check, not the
          // throttle that keeps the background poll from spending their data.
          () => checkForUpdate(true),
          { fontSize: '9px' },
        );
        // `textLink` lays its type out rightwards from its origin, so right-aligning it means
        // measuring the drawn thing and stepping back by that — its own hit padding included.
        const linkWidth = check.getBounds().width;
        check.setX(check.x - linkWidth);
        // Both halves share one line, and the stamp is the longer half in Vietnamese. If they would
        // meet, the link goes — the version is the thing that has to be readable, and the check it
        // offers happens on its own every half hour anyway.
        if (version.width + 10 + linkWidth <= contentWidth) {
          this.content.push(check);
        } else {
          check.destroy();
        }
      }
      cursor += VERSION_LINE + 4;

      this.content.push(this.ui.label(contentX, cursor, t(`menu.update.${status}` as 'menu.update.ready'), 'caption', {
        color: status === 'ready' ? '#8a2a1b' : INK_UI_HEX.mutedText,
        fontSize: '11px',
        fontStyle: status === 'ready' ? '700' : '400',
        wordWrap: { width: contentWidth },
      }).setOrigin(0, 0));
      cursor += STATUS_LINE;

      if (updateButtonHeight > 0) {
        cursor += 8;
        this.content.push(this.ui.button(
          { x: contentX, y: cursor, width: contentWidth, height: updateButtonHeight },
          t('menu.update.reload'),
          () => applyUpdate(),
          { variant: 'primary', fontSize: '13px' },
        ));
        cursor += updateButtonHeight;
      }
    }
    cursor += 22;

    this.content.push(this.ui.backBar(cursor, () => {
      this.mode = 'main';
      this.render();
    }));
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
    this.content.push(this.ui.backBar(this.vy(690), () => {
      this.mode = 'main';
      this.render();
    }));
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
   * Ninety units per hit target keeps each control generous under a thumb while bringing the
   * visible icon-label groups into one coherent utility row. The old 104 + 7 rhythm left more air
   * between neighbouring words than inside each control, so the three links looked unrelated.
   */
  private renderFooterPair(): void {
    const WIDTH = 90;
    const GAP = 0;
    const left = Math.round((GAME_WIDTH - (WIDTH * 3 + GAP * 2)) / 2);
    const height = this.vh(34);
    // Remembered as one rectangle rather than three: the tour's card is about the footer as a
    // tier — the manual, the record and the settings — and framing one of the three would say the
    // other two were something else.
    this.tourTargets.footer = { x: left, y: SETTINGS_TOP, width: WIDTH * 3 + GAP * 2, height };

    // 12px, not 13. "How to Play" is three words where the other two are two and one, and at 13 it
    // wraps to a second line inside a 34-unit button — which centres the pair of lines and leaves
    // the row looking like one button broke.
    const doors: Array<{ id: string; label: string; icon: CardIconId; onPress: () => void }> = [
      { id: 'guide', label: t('guide.menu.button'), icon: 'scroll', onPress: () => this.scene.start('GuideScene') },
      { id: 'history', label: t('history.menu.button'), icon: 'book', onPress: () => this.scene.start('HistoryScene') },
      { id: 'settings', label: t('menu.settings'), icon: 'gear', onPress: () => { this.mode = 'settings'; this.render(); } },
    ];
    doors.forEach((door, index) => {
      const button = this.ui.button(
        { x: left + index * (WIDTH + GAP), y: SETTINGS_TOP, width: WIDTH, height },
        door.label,
        door.onPress,
        {
          variant: 'ghost',
          frameless: true,
          icon: door.icon,
          fontSize: '11px',
          extraHitPadding: 4,
        },
      )
        .setData('menuUtility', door.id)
        .setData('utilityIcon', door.icon)
        .setData('ghostWithIcon', true);
      this.content.push(button);
    });
  }

  private renderSupportRow(): void {
    const row = this.add.container(GAME_WIDTH / 2, SUPPORT_TOP + SUPPORT_ROW_HEIGHT / 2)
      .setData('menuSupportRow', true);

    /**
     * On iOS the sentence loses its first half, because the App Store will not have it.
     *
     * Two separate rules, either one of which is a rejection on its own: guideline 3.2.1(vii)
     * excludes tips and donations *in games* from the external-link allowance other categories
     * get, and 4.7 says HTML5 game content may not provide access to charitable donations. A link
     * to the repository is neither, so the second half stays — see `allowsDonationLinks`.
     *
     * It stays under a different string, though. Beside the coffee link the short lowercase label
     * reads as a peer action; on its own it needs `improveAlone` to stand up as a complete line.
     *
     * The band stays too, at its full height. `SETTINGS_TOP` is measured up from `SUPPORT_TOP`,
     * so a row that removed itself would leave 46 units of nothing at the foot of the menu and
     * float everything above it.
     */
    const alone = !allowsDonationLinks();
    const improve = this.ui.textLink(
      0,
      0,
      t(alone ? 'menu.support.improveAlone' : 'menu.support.improve'),
      () => openExternalLink(SUPPORT.github),
      { icon: 'hammer' },
    ).setData('menuSupportLink', 'improve');
    const improveWidth = improve.getData('linkWidth') as number;

    if (alone) {
      improve.x = -improveWidth / 2;
      row.add(improve);
      this.content.push(row);
      return;
    }

    const coffee = this.ui.textLink(
      0,
      0,
      t('menu.support.coffee'),
      () => this.renderSupportModal(),
      { icon: 'cup' },
    ).setData('menuSupportLink', 'coffee');

    // `textLink` grows its invisible hit area seven units beyond each visual edge. Eighteen visual
    // units therefore leave four real units between the two touch rectangles: close enough to read
    // as one row, but never one merged target.
    const gap = 18;
    const coffeeWidth = coffee.getData('linkWidth') as number;
    const total = coffeeWidth + gap + improveWidth;

    /**
     * These are sibling actions, not a sentence: keep them on one centred line in every language.
     * The scale guard is only for a future translation longer than today's English or Vietnamese;
     * it preserves the one-line contract without allowing either edge to leave the sheet.
     */
    const maxWidth = GAME_WIDTH - 64;
    coffee.x = -total / 2;
    improve.x = coffee.x + coffeeWidth + gap;
    if (total > maxWidth) {
      row.setScale(maxWidth / total);
    }

    row.add([coffee, improve]);
    this.content.push(row);
  }

  /**
   * The build stamp, centred on the bottom edge.
   *
   * Same string as the settings page prints — one `buildStamp()`, so the two can never disagree
   * about what is running — and the same size and colour as the quietest caption on the page, which
   * is what keeps it from competing with the sentence above it. Never pressable: it is a fact about
   * the page, not a way off it.
   *
   * Shrinks rather than wraps in the unlikely event it outgrows the sheet, because there is exactly
   * one line of room here and a wrapped colophon would push itself off the bottom edge.
   */
  private renderVersionLine(): void {
    const stamp = buildStamp();
    if (!stamp) {
      return;
    }
    // Anchored to the bottom edge by its own baseline rather than centred in the band, so the air
    // in the band is all above it and the line lands where the sheet ends.
    const line = this.ui.label(GAME_WIDTH / 2, GAME_HEIGHT - VERSION_EDGE, stamp, 'caption', {
      color: INK_UI_HEX.mutedText,
      fontSize: '9px',
    }).setOrigin(0.5, 1).setData('menuVersionLine', true);
    const maxWidth = GAME_WIDTH - 32;
    if (line.width > maxWidth) {
      line.setScale(maxWidth / line.width);
    }
    this.content.push(line);
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
    this.installModalOpen = false;
  }

  // ── Putting the game on the home screen ───────────────────────────────────

  /**
   * The install mark: the shared install glyph beside the build stamp, and nothing else.
   *
   * An inline colophon mark rather than a row in the column, because installing is not one of the
   * things the player came to this page to do — it is worth offering and not worth spending a
   * button on. It disappears the moment the game is running from the home screen
   * (`canOfferInstall`). On menu pages without the front-page build stamp it retains a quiet
   * bottom-left fallback rather than inventing a line that page does not otherwise carry.
   *
   * **No tile, no border, no fill.** A bordered button in the corner of a page whose whole column
   * is bordered buttons reads as a fifth thing to press; the ink alone reads as a mark, which is
   * what it is. It is the quietest thing on the sheet on purpose — the caption below is what tells
   * anybody it is there, and after three seconds the mark is meant to be furniture.
   *
   * The glyph comes from `CardIcons` and uses the exact 0.62 scale of the three utility icons.
   * The previous one-off drawing occupied a 30-unit box against their 16-unit marks, which is the
   * inconsistency this shared source removes.
   */
  private renderInstallMark(): void {
    if (!canOfferInstall()) {
      return;
    }

    const ICON_SCALE = 0.62;
    const ICON_SIZE = CARD_ICON_SIZE * ICON_SCALE;
    const INLINE_GAP = 6;
    const versionLine = this.children.list.find(
      (child) => child.getData?.('menuVersionLine') === true,
    ) as Phaser.GameObjects.Text | undefined;

    // Default for pages without the front-page colophon: still on the last band, but now at the
    // same visual size as every other footer icon.
    let cx = 18;
    let cy = GAME_HEIGHT - VERSION_EDGE - ICON_SIZE / 2;
    if (versionLine) {
      // Icon + gap + stamp are one centred group. Aligning their visual centres, rather than their
      // object origins, puts the arrow on the text's actual line despite the text being
      // bottom-anchored and the icon being centre-anchored.
      const groupWidth = ICON_SIZE + INLINE_GAP + versionLine.displayWidth;
      const left = (GAME_WIDTH - groupWidth) / 2;
      cx = left + ICON_SIZE / 2;
      cy = versionLine.y - versionLine.displayHeight / 2;
      versionLine.setX(left + ICON_SIZE + INLINE_GAP + versionLine.displayWidth / 2);
    }
    const box: UIBounds = {
      x: cx - ICON_SIZE / 2,
      y: cy - ICON_SIZE / 2,
      width: ICON_SIZE,
      height: ICON_SIZE,
    };

    const glyph = drawCardIcon(this, 'install', INK_UI.brush)
      .setPosition(cx, cy)
      .setScale(ICON_SCALE)
      .setAlpha(0.64)
      .setData('menuInstallMark', true)
      .setData('footerInline', Boolean(versionLine))
      .setData('visualSize', ICON_SIZE);

    // The tap target is bigger than the mark, because the mark is small on purpose and a thumb
    // is not. 44 is the smallest square either platform's guidance will accept.
    // The colophon sits eleven units above the lower edge. Centre the hit area higher than the ink
    // so all 44 units remain on the canvas while still covering the mark.
    const hitCenterY = Math.min(cy, GAME_HEIGHT - 22);
    const hit = this.add
      .rectangle(cx, hitCenterY, 44, 44, 0xffffff, 0.001)
      .setData('menuInstallHit', true)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.openInstall();
    });

    this.content.push(glyph, hit);

    // The hint, once per visit. A mark in a corner that has never been pressed is a mark nobody
    // knows is pressable, and this one is offering the difference between a browser tab and an
    // app — so it says what it is, briefly, and then gets out of the way.
    if (!this.installTipShown && !this.installModalOpen) {
      this.installTipShown = true;
      this.showInstallTip(box);
    }
  }

  /** The corner mark's own caption, set above it and gone in under two seconds. */
  private showInstallTip(box: UIBounds): void {
    // Measured first, then the sheet is cut to it — the same order `renderInstallModal` uses, and
    // for the same reason: the line is one length in English and another in Vietnamese.
    const label = this.add.text(0, 0, t('menu.install.tip'), {
      color: INK_UI_HEX.inkText,
      fontFamily: UI_FONT,
      fontSize: '11px',
    }).setOrigin(0, 0);

    const PAD_X = 10;
    const PAD_Y = 6;
    const width = Math.round(label.width + PAD_X * 2);
    const height = Math.round(label.height + PAD_Y * 2);
    // Above the mark and aligned to its left edge. Beside it would run the caption straight across
    // the support sentence, which is centred in this same band.
    const bounds: UIBounds = { x: box.x, y: box.y - 8 - height, width, height };

    // The game's own printed surface, not a text object with a background colour behind it. Every
    // other thing on this page that sits *on top of* the page — a card, a modal, the coffee sheet
    // — is an `InkUI` panel with its torn contour and its shade, and a plain rectangle among them
    // reads as a browser tooltip that wandered in.
    const panel = this.ui.panel(bounds, {
      fill: INK_UI.parchment,
      fillShade: INK_UI.parchmentDark,
      border: INK_UI.brush,
      radius: 8,
      borderWidth: 1.6,
    });
    // The tail, pointing down at the mark it is about.
    //
    // A caption floating above an icon is a caption about the whole corner; a caption with a point
    // on it is about that one thing. Drawn rather than taken from the panel because `InkUI.panel`
    // has no notion of a tail — and it is three lines: fill the triangle in the panel's own
    // parchment, then ink only its two sloping sides, so the panel's bottom border reads straight
    // through the top of it instead of being crossed by a line.
    const tailX = bounds.x + 14;
    const tail = this.add.graphics();
    tail.fillStyle(INK_UI.parchment, 1);
    tail.fillTriangle(tailX - 6, bounds.y + height - 1, tailX + 6, bounds.y + height - 1, tailX, bounds.y + height + 7);
    tail.lineStyle(1.6, INK_UI.brush, 0.9);
    tail.beginPath();
    tail.moveTo(tailX - 6, bounds.y + height - 1);
    tail.lineTo(tailX, bounds.y + height + 7);
    tail.lineTo(tailX + 6, bounds.y + height - 1);
    tail.strokePath();

    label.setPosition(bounds.x + PAD_X, bounds.y + PAD_Y);
    // Built before the panel, so it is under it until told otherwise.
    this.children.bringToTop(label);

    const hit = this.add
      .rectangle(bounds.x + width / 2, bounds.y + height / 2, width, height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.openInstall();
    });

    this.content.push(panel, tail, label, hit);

    this.installTipTimer?.remove();
    // Short on purpose. It is one line naming what the mark under it does, and anybody who wants
    // it can press the mark — a caption that outstays that is a caption sitting on the footer.
    this.installTipTimer = this.time.delayedCall(1800, () => {
      this.installTipTimer = undefined;
      // The page may have been re-rendered out from under it, which destroys these three.
      if (!label.scene) {
        return;
      }
      this.tweens.add({
        targets: [panel, tail, label],
        alpha: 0,
        duration: 420,
        ease: 'Sine.easeOut',
        onComplete: () => {
          panel.destroy();
          tail.destroy();
          label.destroy();
          hit.destroy();
        },
      });
    });
  }

  /**
   * What the mark does, which is not the same thing on any two platforms.
   *
   * Chromium hands over a real prompt and one tap installs. Everybody else gets the sheet, because
   * everybody else keeps the same command in a menu and there is no API that can reach it. A held
   * prompt that fails falls through to the sheet rather than doing nothing — see `guideRoute`.
   */
  private openInstall(): void {
    if (installRoute() !== 'native') {
      this.renderInstallModal(guideRoute());
      return;
    }
    void promptInstall().then((outcome) => {
      if (!this.scene.isActive()) {
        return;
      }
      if (outcome === 'unavailable') {
        this.renderInstallModal(guideRoute());
        return;
      }
      // Accepted: `canOfferInstall` is false from here and the mark leaves with the re-render.
      // Dismissed: the mark stays, and nothing is said about it.
      this.render();
    });
  }

  private renderInstallModal(route: Exclude<InstallRoute, 'native' | 'installed'>): void {
    this.closeModal();
    this.installModalOpen = true;
    this.installTipTimer?.remove();
    this.installTipTimer = undefined;

    const group: Record<typeof route, string> = {
      'ios-safari': 'iosSafari',
      'ios-other': 'iosOther',
      'android-other': 'android',
      desktop: 'desktop',
    };
    const steps = [1, 2, 3].map((n) => t(`menu.install.${group[route]}.step${n}` as Parameters<typeof t>[0]));

    // Measured, then sized. A three-step sheet asked for a fixed height came out two-thirds empty
    // paper — the steps wrap to one line or two depending on the language and the platform, and
    // there is no number that is right for both. The bodies are built off-screen, their real
    // heights added up, and the sheet cut to fit; then they are moved onto it.
    const BODY_WIDTH = 362 - 28 - 40;
    const bodies = steps.map((step) => this.add.text(-999, -999, step, {
      color: '#2a2118',
      fontFamily: UI_FONT,
      fontSize: '13px',
      lineSpacing: 3,
      wordWrap: { width: BODY_WIDTH },
    }).setOrigin(0, 0));
    const stepHeights = bodies.map((body) => Math.max(28, body.height + 16));
    const needed = stepHeights.reduce((sum, height) => sum + height, 0);

    // 104 header + 20 the modal's own content inset + the steps + a footer band it does not use,
    // because `contentBounds` is measured back off one whether anything is drawn in it or not.
    const modal = this.ui.modal({
      title: t('menu.install.title'),
      subtitle: t('menu.install.subtitle'),
      onClose: () => this.closeModal(),
      height: 104 + 66 + 20 + needed,
    });
    this.modalObjects.push(...modal.objects);

    const { contentBounds } = modal;
    let cursor = contentBounds.y + 4;
    bodies.forEach((body, index) => {
      // The number is set in cinnabar on the margin, the way a printed instruction is — it is what
      // makes three sentences read as an order to follow rather than as a paragraph.
      const numeral = this.ui.label(contentBounds.x + 10, cursor + 2, `${index + 1}`, 'title', {
        color: '#8a2a1b',
        fontSize: '17px',
        fontStyle: '700',
      }).setOrigin(0.5, 0);
      body.setPosition(contentBounds.x + 28, cursor);
      // Built before the sheet was, so it is *under* the sheet. Nothing else in this scene needs
      // depth sorting, so the one line that fixes it beats giving the whole modal a depth band.
      this.children.bringToTop(body);
      this.modalObjects.push(numeral, body);
      cursor += stepHeights[index];
    });
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
 * The menu river, as a shape that can be asked questions.
 *
 * It remains queryable after the armies are gone because the paddy contract is just as important:
 * every field belongs on the right bank, never painted across the water.
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
    // markedly wider than its nominal width.
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
