import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH, isCampaignMode } from '../game/constants';
import type { GameState } from '../state/types';
import { InkUI, INK_UI, INK_UI_HEX } from './InkUI';
import { CARD_ICON_SIZE, drawCardIcon, type CardIconId } from './CardIcons';
import { sawtoothBand } from './ink/devices';
import { t } from '../i18n';

const EMPIRE_KEYS = ['build', 'heroes', 'court', 'army', 'affairs', 'directives', 'pause'] as const;
const CAMPAIGN_KEYS = ['build', 'heroes', 'court', 'army', 'affairs', 'pause'] as const;
const RIVAL_KEYS = ['build', 'heroes', 'court', 'army', 'pause'] as const;
/**
 * Dragon Ascent's bar is the classic menu, not a new one: the same Build / Heroes / Court /
 * Army / Affairs screens the other modes have, plus this mode's Codex. Conquest is reached
 * the classic way too — by selecting a province on the map — so it needs no button here.
 */
/**
 * The Codex is deliberately **not** here.
 *
 * It is the permanent collection across runs — mostly rows reading "???" for champions not yet
 * summoned — and mid-run there is nothing to be done about any of it. A button on the action bar
 * is a standing promise that something behind it is worth doing now, and this one could not keep
 * it. The number that *does* matter in a run, how much of the roster has been recorded, already
 * appears on the founder card where it frames the choice being made.
 *
 * It is still reachable at the end of a run, which is the moment the collection changes and the
 * only moment a player has any reason to look at it. See `showRunOver`.
 */
/**
 * The Codex's slot now carries the Chronicle.
 *
 * The Codex could not keep the bar's standing promise that something behind a button is worth
 * doing *now* — it is a cross-run collection, mostly rows reading "???", and nothing in it can be
 * acted on mid-run. A Chronicle can: it is what has happened to this realm, this run, and the one
 * screen a player reaches for while playing.
 */
const ASCENT_KEYS = ['build', 'heroes', 'court', 'army', 'affairs', 'chronicle'] as const;

/**
 * Dragon Ascent's two system controls, drawn as glyphs at the right edge rather than as
 * labelled screens.
 *
 * They are separated because they answer different questions and were previously answered by
 * one button. `pause` stops the clock so the player can *think*; `menu` is where the run is
 * saved and left. The old single button was labelled Pause/Resume — a time toggle — but opened
 * the quit sheet, so the only way to un-pause was through a menu that looked like an exit.
 */
const ASCENT_SYSTEM_KEYS = ['pause', 'menu'] as const;

/**
 * The răng cưa band across the bar's top edge: where it starts, and how tall it is.
 *
 * Named rather than typed inline because the buttons are placed *from* it. It lost a unit of
 * height when they were — 5 to 4 — which is the difference between the bar having six units of
 * slack to spend on margins and having eight. At this size the tooth is two pixels either way and
 * nothing about the drum reads differently; the four units of air it bought are visible.
 */
const BAND_TOP = 2;
const BAND_HEIGHT = 4;
/** Air between the band and the buttons, and between the buttons and the foot of the screen. */
const BUTTON_CLEAR = 4;

export const ACTION_BUTTON_HEIGHT = 36;
/**
 * The type size the row is set in, and the floor it will not go below.
 *
 * 11 is the size the bar was fixed at, and it was a size for six English words: at 49 units a
 * button "Heroes" measures 40 against 37 units of usable width, so it drew over its own border.
 * 9 is where a bar label stops being readable at arm's length, so a row that cannot fit at 9 —
 * seven Vietnamese lanes with a siege running — is left slightly tight rather than illegible.
 */
const MAX_BAR_FONT = 11;
const MIN_BAR_FONT = 9;
/**
 * How small the row will go to keep every lane on ONE line.
 *
 * Below the readable floor on purpose, and it is the right trade here: "Ngoại giao" needs 48 units
 * at 9px against the 46 a lane has, so the whole row missing one line by two units is what put
 * half the bar's words a line lower than the other half. 8 buys the alignment back, and the glyph
 * over each word is carrying the identification now.
 */
const NOWRAP_BAR_FONT = 8;
/**
 * The buttons' centre line — measured down from the band, not taken as the middle of the bar.
 *
 * `GAME_HEIGHT - ACTION_BAR_HEIGHT / 2` is what this was, and centring is exactly what went wrong:
 * the bar is not symmetrical. It carries a hairline and a drum band across its top eight units and
 * nothing at all across its bottom, so a 36-unit button centred in 50 units of bar starts at seven
 * — one unit INSIDE the band — and the sawtooth ran through the top edge of every label. Placed
 * from the band instead, the arithmetic has to add up and says so: 6 of band + 4 + 36 + 4 = 50.
 */
export const ACTION_BUTTON_Y = GAME_HEIGHT - ACTION_BAR_HEIGHT
  + BAND_TOP + BAND_HEIGHT + BUTTON_CLEAR + ACTION_BUTTON_HEIGHT / 2;

/**
 * Width of an icon-only system control, and the gap separating that cluster from the lanes.
 *
 * 28 is a *touch* number, not a drawn one — the glyphs inside are about eighteen units across and
 * nothing is printed around them. With `extraHitPadding` it comes to the 44 units a fingertip
 * wants, which is the whole reason these keep a width at all. It came down from 34 to buy the
 * lanes their gaps back: two frameless glyphs were reserving twelve units of the strip that the
 * six labelled buttons beside them needed more, and nothing about the marks reads differently.
 *
 * The gap went 6 → 12 when the frames came off. A framed control ends at its own border and the
 * eye finds the seam; a bare mark ends wherever its ink stops, so the only thing left to say
 * "these two are not lanes" is the air in front of them.
 */
const SYSTEM_BUTTON_WIDTH = 28;
const SYSTEM_CLUSTER_GAP = 10;

/**
 * One mark per lane, so the row can be read without reading it.
 *
 * The bar was six torn-paper buttons in a line, each with a border, a shade and a two-line
 * Vietnamese label inside 47 units — six frames competing for the same corner of the eye, and the
 * only way to tell one from another was to stop and read the type. A glyph is recognised where a
 * word has to be read, so the glyph carries the identity and the word confirms it.
 *
 * Drawn from `CardIcons`, which is the game's existing icon vocabulary rather than a second one:
 * the hammer over Build is the same hammer a build card prints.
 */
const LANE_ICONS: Record<string, CardIconId> = {
  build: 'hammer',
  heroes: 'person',
  court: 'crown',
  army: 'spears',
  affairs: 'globe',
  directives: 'banner',
  chronicle: 'scroll',
  battle: 'blade',
  pause: 'hourglass',
};

/**
 * The glyph's size on the bar: 26 × 0.68, so about 18 units.
 *
 * It went 0.46 → 0.42 → 0.68 across one afternoon, and the middle number is the interesting one.
 * At 0.46 the Vietnamese lanes wrapped to two lines and the second was printed off the bottom
 * edge, so the glyph was cut to buy the type its room. Setting the whole row at whatever size
 * keeps *every* lane on one line then handed all of that room back at once — a single line is
 * thirteen units where two were twenty-six — and a glyph sized for the crisis was left sitting in
 * the middle of it. The mark carries the identification now, so it takes the space.
 */
const LANE_ICON_SCALE = 0.68;
/**
 * And the glyph the *crowded* row gets instead.
 *
 * One row in the game cannot be set on a single line at any size: Dragon Ascent in Vietnamese with
 * a siege running, which is eight slots and lanes of 41 units. That row wraps, two lines are 22
 * units of type, and the large glyph leaves 20 for them — so its second line printed one and a
 * half units below the foot of the screen. The row that has to wrap gets the small mark back, and
 * every other row keeps the large one.
 */
const LANE_ICON_SCALE_WRAPPED = 0.42;
/** Air above the glyph, and between the glyph and the word under it. */
const ICON_TOP_PAD = 1;
const ICON_TEXT_GAP = 1;

/** Where the label's first line starts, measured from the centre of the lane's box. */
function laneTextTop(scale: number): number {
  return -ACTION_BUTTON_HEIGHT / 2 + ICON_TOP_PAD + CARD_ICON_SIZE * scale + ICON_TEXT_GAP;
}

/** One button's place on the bar. Produced by `actionBarSlots`, which owns all bar geometry. */
export interface ActionSlot {
  action: string;
  x: number;
  width: number;
  /** Icon-only control pinned to the right edge, drawn as a glyph rather than a label. */
  system: boolean;
}

export interface ActionBarContext {
  /** Ascent only: the Battle button exists exactly while there is a siege to watch. */
  battleLive?: boolean;
}

export function getActionKeys(gameMode: string, context: ActionBarContext = {}): readonly string[] {
  if (gameMode === 'ascent') {
    // `battle` sits first because while a siege is live it is the only thing that matters, and
    // it is the one button that appears and disappears with the state of the world. A button
    // that is present with nothing behind it is worse than no button: tapping it used to open
    // an empty screen with no way back.
    const lanes = context.battleLive ? ['battle', ...ASCENT_KEYS] : [...ASCENT_KEYS];
    return [...lanes, ...ASCENT_SYSTEM_KEYS];
  }
  if (gameMode === 'empire') return [...EMPIRE_KEYS];
  return isCampaignMode(gameMode) ? [...CAMPAIGN_KEYS] : [...RIVAL_KEYS];
}

/** Preferred label width, before the fit-to-screen clamp below. */
function getButtonWidth(gameMode: string): number {
  if (gameMode === 'ascent' || gameMode === 'empire') return 50;
  return isCampaignMode(gameMode) ? 60 : 72;
}

/**
 * Air between two buttons.
 *
 * Two units was not a gap. Each button is drawn as a torn sheet — a wobbled contour with a 1.6-unit
 * border and a shadow offset a unit and a half down-right — so at two units of nominal clearance
 * the ink of one button reached the ink of the next and the six lanes read as one crowded ribbon.
 * Three is the least that shows daylight at this scale, and it costs the lanes one unit of width.
 */
function getButtonGap(gameMode: string): number {
  if (gameMode === 'ascent' || gameMode === 'empire') return 3;
  return isCampaignMode(gameMode) ? 3 : 4;
}

function getButtonMargin(gameMode: string): number {
  if (gameMode === 'ascent' || gameMode === 'empire') return 5;
  return isCampaignMode(gameMode) ? 7 : 6;
}

function isSystemKey(gameMode: string, action: string): boolean {
  return gameMode === 'ascent' && (ASCENT_SYSTEM_KEYS as readonly string[]).includes(action);
}

/**
 * Every button's rectangle, laid out to fit the screen.
 *
 * The bar used to be `margin + index * (width + gap)` with a fixed width, which silently ran
 * off the right edge as soon as a mode had one button too many: Dragon Ascent's eight buttons
 * needed 420px of a 390px screen, so Pause was drawn 30px past the edge and could not be
 * pressed at all. Widths are now derived from the space actually available, so adding a button
 * makes the others narrower instead of pushing one off the world.
 *
 * The single source of truth for the bar's geometry: `ActionBar` draws from it and `UIScene`
 * hit-tests against it, so the two cannot drift.
 */
export function actionBarSlots(gameMode: string, context: ActionBarContext = {}): ActionSlot[] {
  const keys = getActionKeys(gameMode, context);
  const margin = getButtonMargin(gameMode);
  const gap = getButtonGap(gameMode);

  const laneKeys = keys.filter((key) => !isSystemKey(gameMode, key));
  const systemKeys = keys.filter((key) => isSystemKey(gameMode, key));

  const clusterWidth = systemKeys.length > 0
    ? systemKeys.length * SYSTEM_BUTTON_WIDTH + (systemKeys.length - 1) * gap
    : 0;
  const reserved = systemKeys.length > 0 ? clusterWidth + SYSTEM_CLUSTER_GAP : 0;

  const laneSpace = GAME_WIDTH - margin * 2 - reserved - Math.max(0, laneKeys.length - 1) * gap;
  const laneWidth = laneKeys.length > 0
    ? Math.max(28, Math.min(getButtonWidth(gameMode), Math.floor(laneSpace / laneKeys.length)))
    : 0;

  const slots: ActionSlot[] = laneKeys.map((action, index) => ({
    action,
    x: margin + index * (laneWidth + gap),
    width: laneWidth,
    system: false,
  }));

  // Pinned to the right edge rather than trailing the lanes, so Pause and Menu stay put when
  // the Battle button appears mid-siege and the lanes reflow around it.
  const clusterLeft = GAME_WIDTH - margin - clusterWidth;
  systemKeys.forEach((action, index) => {
    slots.push({
      action,
      x: clusterLeft + index * (SYSTEM_BUTTON_WIDTH + gap),
      width: SYSTEM_BUTTON_WIDTH,
      system: true,
    });
  });

  return slots;
}

/** The slot under a screen-space x, or undefined between/outside the buttons. */
export function actionSlotAt(gameMode: string, x: number, context: ActionBarContext = {}): ActionSlot | undefined {
  return actionBarSlots(gameMode, context).find((slot) => x >= slot.x && x <= slot.x + slot.width);
}

export class ActionBar extends Phaser.GameObjects.Container {
  private readonly gameMode: string;
  private readonly ui: InkUI;
  private buttonObjects: Phaser.GameObjects.GameObject[] = [];

  /**
   * Optional per-button status dot. Dragon Ascent uses it to carry each lane's
   * ready/busy/alert state onto the bar, so relocating the lanes here loses none of the
   * at-a-glance signal the old top strip carried. Return `undefined` for no dot.
   */
  statusColor?: (action: string) => number | undefined;

  /** Extra state the key set depends on. Supplied by the scene, read on every refresh. */
  context: () => ActionBarContext = () => ({});

  constructor(
    scene: Phaser.Scene,
    private readonly gameState: GameState,
    private readonly onAction: (action: string) => void,
  ) {
    super(scene, 0, 0);
    this.gameMode = gameState.gameMode;
    this.setDepth(420);
    this.ui = new InkUI(scene);

    const top = GAME_HEIGHT - ACTION_BAR_HEIGHT;
    this.add(scene.add.rectangle(0, top, GAME_WIDTH, ACTION_BAR_HEIGHT, INK_UI.backgroundInk, 0.97).setOrigin(0, 0));
    // The same drum band as the resource strip, so the two ends of the screen are one frame.
    const band = scene.add.graphics();
    band.lineStyle(1, INK_UI.softBrush, 0.35);
    band.lineBetween(0, top + 0.5, GAME_WIDTH, top + 0.5);
    sawtoothBand(band, 10, top + BAND_TOP, GAME_WIDTH - 20, BAND_HEIGHT, 0.45);
    this.add(band);

    scene.add.existing(this);
    this.buildButtons();
  }

  refresh(): void {
    this.clearButtons();
    this.buildButtons();
  }

  private clearButtons(): void {
    for (const btn of this.buttonObjects) {
      this.remove(btn, true);
    }
    this.buttonObjects = [];
  }

  /** What is printed on a lane button. Read twice per refresh: once to size the row, once to draw it. */
  private slotLabel(action: string, paused: boolean): string {
    if (action === 'pause') return paused ? t('action.resume') : t('action.pause');
    if (action === 'directives') return t('empire.action.directives');
    return t(`action.${action}` as Parameters<typeof t>[0]);
  }

  /**
   * One type size for the whole row, chosen from the longest label on it.
   *
   * `InkUI.button` will shrink a label that does not fit its own button, which is what stops a word
   * running through its border — but done button by button it produced a bar set in four sizes at
   * once (Build at 11, Heroes at 10, Affairs at 10.5, Battle at 9), and a row of equal buttons in
   * ragged type reads as a mistake even when every word fits. So the row is measured as a set and
   * the largest size that suits all of it is used for all of it.
   *
   * Measured on a throwaway Text rather than estimated from character counts: Vietnamese labels
   * wrap to two lines ("Ngoại giao") and the wrap decides the height, which is half of what has to
   * fit.
   */
  private barFontSize(labels: string[], laneWidth: number): { size: number; scale: number } {
    // Four units of clearance rather than twelve: there is no border for the type to run through
    // any more, only air, so the lane gets its own width back — which is what pays for the glyph
    // above the word without the word shrinking to fit under it.
    const maxWidth = laneWidth - 4;
    // What is left under the glyph, derived from the same three numbers `buildLaneButton` places
    // it with rather than restated as a constant — the two disagreeing is how a row gets chosen at
    // a size it cannot actually be drawn at. The `BUTTON_CLEAR` below the box counts: the type
    // sits in it by design.
    const maxHeight = ACTION_BUTTON_HEIGHT / 2 + BUTTON_CLEAR - laneTextTop(LANE_ICON_SCALE_WRAPPED);
    const probe = this.ui.label(0, 0, '', 'button', { align: 'center' });
    probe.setVisible(false);

    /**
     * **One line for every lane, if the row can be had at all.**
     *
     * The frames came off and the ragged edge they had been hiding came with them: "Xây" and "Sử
     * Ký" stand one line tall while "Triều đình" and "Ngoại giao" stand two, so half the row's
     * words ended a line lower than the other half and the bar read as six things at five
     * different heights. Aligned type is worth more here than large type — the glyph above each
     * word is what identifies the lane now, and the word underneath it only confirms.
     *
     * So the row is set at the largest size at which *nothing wraps*, down to 8. Only if even 8
     * cannot hold the longest label does it fall back to the wrapping fit below, which is the
     * seven-Vietnamese-lanes-with-a-siege case and is left slightly ragged rather than illegible.
     */
    probe.setWordWrapWidth(null);
    for (let size = MAX_BAR_FONT; size >= NOWRAP_BAR_FONT; size -= 0.5) {
      probe.setFontSize(size);
      const fits = labels.every((text) => {
        probe.setText(text);
        return probe.width <= maxWidth;
      });
      if (fits) {
        probe.destroy();
        return { size, scale: LANE_ICON_SCALE };
      }
    }

    probe.setWordWrapWidth(maxWidth);
    let chosen = MIN_BAR_FONT;
    for (let size = MAX_BAR_FONT; size >= MIN_BAR_FONT; size -= 0.5) {
      probe.setFontSize(size);
      const fits = labels.every((text) => {
        probe.setText(text);
        return probe.width <= maxWidth && probe.height <= maxHeight;
      });
      if (fits) {
        chosen = size;
        break;
      }
    }
    probe.destroy();
    return { size: chosen, scale: LANE_ICON_SCALE_WRAPPED };
  }

  private buildButtons(): void {
    const paused = this.gameState.isStrategyPause;
    const top = ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2;
    const slots = actionBarSlots(this.gameMode, this.context());
    const laneWidth = slots.find((slot) => !slot.system)?.width ?? 0;
    const { size: fontSize, scale: iconScale } = this.barFontSize(
      slots.filter((slot) => !slot.system).map((slot) => this.slotLabel(slot.action, paused)),
      laneWidth,
    );

    for (const slot of slots) {
      const bounds = { x: slot.x, y: top, width: slot.width, height: ACTION_BUTTON_HEIGHT };

      if (slot.system) {
        this.buildSystemButton(slot, bounds, paused);
        continue;
      }

      this.buildLaneButton(slot, bounds, this.slotLabel(slot.action, paused), fontSize, paused, iconScale);
      this.addStatusDot(slot, top, iconScale);
    }

    this.buildSeparator(slots, top);
  }

  /**
   * One lane: a mark over a word, on open paper.
   *
   * **No surface at all.** Every lane used to be a torn sheet with its own border and shade, which
   * is six printed boxes across the foot of a screen that is itself a printed sheet — the frames
   * were most of the ink down there and none of the meaning. What tells a player this is pressable
   * is that it is a row of marks in a bar at the bottom of the screen, and it always was; the
   * borders were saying it a seventh and eighth time.
   *
   * Loudness is carried by the ink instead of by a fill: a live siege inks its lane in sỏi son
   * rather than being printed white-on-red, and a paused clock does the same to Pause.
   *
   * Built here rather than through `InkUI.button` because that one sets its glyph *beside* the
   * label as one centred group — right for a 200-unit sheet button, wrong for a 47-unit lane where
   * the only way to fit both is to stack them.
   */
  private buildLaneButton(
    slot: ActionSlot,
    bounds: { x: number; y: number; width: number; height: number },
    label: string,
    fontSize: number,
    paused: boolean,
    iconScale: number,
  ): void {
    // The container is placed at the lane's *centre* so the press tween scales about the middle
    // of the mark. Anchored top-left it would shrink towards the corner, which reads as the
    // button sliding rather than being pushed.
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const container = this.scene.add.container(cx, cy);

    const loud = slot.action === 'battle' || (slot.action === 'pause' && paused);
    const tone = loud ? INK_UI.cinnabar : INK_UI.brush;

    const icon = drawCardIcon(this.scene, LANE_ICONS[slot.action] ?? 'scroll', tone);
    icon.setScale(iconScale);
    icon.setAlpha(loud ? 1 : 0.88);
    const iconHeight = CARD_ICON_SIZE * iconScale;
    icon.setPosition(0, -bounds.height / 2 + ICON_TOP_PAD + iconHeight / 2);

    const text = this.ui.label(0, 0, label, 'button', {
      color: loud ? '#8a2a1b' : INK_UI_HEX.inkText,
      fontSize: `${fontSize}px`,
      align: 'center',
      wordWrap: { width: bounds.width - 4 },
    }).setOrigin(0.5, 0);
    text.setY(laneTextTop(iconScale));

    const hit = this.scene.add
      .rectangle(0, 0, bounds.width, bounds.height + 8, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    this.wirePress(hit, container, () => this.onAction(slot.action));

    container.add([icon, text, hit]);
    this.add(container);
    this.buttonObjects.push(container);
  }

  /**
   * The press, as a movement rather than as a redrawn surface.
   *
   * A framed button could say "pressed" by reprinting itself a shade darker and a unit lower.
   * With the frames gone there is nothing to reprint, so the mark itself takes the push: down to
   * 0.86 under the finger, and back on a small overshoot when it lifts. The overshoot is the part
   * that reads as a *button* and not as a fade — 1.06 for 90ms is enough to feel and too quick to
   * look like an animation.
   *
   * `killTweensOf` first, because a second tap arriving mid-spring would otherwise compose two
   * scales and leave the lane permanently small.
   */
  private wirePress(
    hit: Phaser.GameObjects.Rectangle,
    target: Phaser.GameObjects.Container,
    onClick: () => void,
  ): void {
    const stop = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation();

    const settle = (): void => {
      this.scene.tweens.killTweensOf(target);
      this.scene.tweens.add({
        targets: target,
        scale: { from: target.scale, to: 1 },
        duration: 150,
        ease: 'Back.easeOut',
      });
    };

    hit.on('pointerdown', (p: Phaser.Input.Pointer, lx: number, ly: number, e: Phaser.Types.Input.EventData) => {
      stop(p, lx, ly, e);
      this.scene.tweens.killTweensOf(target);
      this.scene.tweens.add({ targets: target, scale: 0.86, duration: 70, ease: 'Quad.easeOut' });
    });
    // A finger that slides off a lane must not leave it pressed — and on a bar this narrow,
    // sliding off is how a mis-tap is corrected.
    hit.on('pointerout', () => settle());
    hit.on('pointerup', (p: Phaser.Input.Pointer, lx: number, ly: number, e: Phaser.Types.Input.EventData) => {
      stop(p, lx, ly, e);
      settle();
      onClick();
    });
  }

  /**
   * The hairline between the lanes and the clock.
   *
   * With the frames on, the twelve units of air in front of Pause were enough to say "these two
   * are not lanes" — a framed control ends at its own border and the eye finds the seam. With
   * every frame gone the whole bar is marks on paper and that gap reads as one more gap, so the
   * division has to be drawn. One hairline, inset from both edges of the bar's height, in the same
   * soft ink as the drum band above it.
   */
  private buildSeparator(slots: ActionSlot[], top: number): void {
    const firstSystem = slots.find((slot) => slot.system);
    if (!firstSystem) {
      return;
    }
    const rule = this.scene.add.graphics();
    rule.lineStyle(1, INK_UI.softBrush, 0.32);
    const x = firstSystem.x - SYSTEM_CLUSTER_GAP / 2;
    rule.lineBetween(x, top + 5, x, top + ACTION_BUTTON_HEIGHT - 5);
    this.add(rule);
    this.buttonObjects.push(rule);
  }

  /**
   * Pause and Menu: the mark alone, with nothing printed round it.
   *
   * Drawn with Graphics rather than set as text — the two are one-shape ideas that survive at
   * this size where a label cannot, and drawing them means never depending on a webfont
   * happening to carry ❚❚ / ☰.
   *
   * They used to sit in the same rounded, bordered, shaded surface as the six lane buttons, which
   * put a frame around two marks that were already legible and made the busiest end of the bar out
   * of the part with the least in it. A frame earns its ink by saying *this is pressable* — and it
   * has nothing to say next to six framed buttons that already established what pressable looks
   * like, on a bar where everything is. Bare, the cluster reads as what it is: not another lane,
   * but the controls for the clock and the door.
   *
   * State moved with the frame. Paused was the `primary` variant — a printed surface — so with no
   * surface to print it is carried by the glyph itself: the mark turns to sỏi son and swaps to a
   * play triangle, which is two signals where the frame gave one.
   */
  private buildSystemButton(slot: ActionSlot, bounds: { x: number; y: number; width: number; height: number }, paused: boolean): void {
    const isPause = slot.action === 'pause';
    // Centre-anchored like the lanes, and for the same reason: the press tween has to push the
    // mark rather than drag it towards a corner.
    const container = this.scene.add.container(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);

    const glyph = this.scene.add.graphics();
    // A hair heavier than the framed pair carried: a mark on open paper has no border helping it
    // hold the eye, so it holds it alone.
    const lit = isPause && paused;
    glyph.fillStyle(lit ? INK_UI.cinnabar : INK_UI.brush, lit ? 1 : 0.9);

    if (lit) {
      // Paused → the control offers play.
      glyph.fillTriangle(-6, -8, 8, 0, -6, 8);
    } else if (isPause) {
      glyph.fillRect(-7, -8, 5, 16);
      glyph.fillRect(2, -8, 5, 16);
    } else {
      for (const dy of [-6.5, 0, 6.5]) glyph.fillRect(-9, dy - 1.6, 18, 3.2);
    }

    // The smallest targets on the bar, so they get back in touch area what they gave up in
    // width. 28 + 16 is the 44 units a fingertip actually needs.
    const hit = this.scene.add
      .rectangle(0, 0, bounds.width + 16, bounds.height + 8, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    this.wirePress(hit, container, () => this.onAction(slot.action));

    container.add([glyph, hit]);
    this.add(container);
    this.buttonObjects.push(container);
    this.addStatusDot(slot, bounds.y);
  }

  /**
   * The dot, stamped on the button's cut corner rather than inside it.
   *
   * Seven units in from the corner put it in the one place the label also wants: with a lane
   * 47 units wide an English label measured up to 40 and a wrapped Vietnamese one stands two lines
   * tall, so the dot landed on the type — on the "t" of Court, over the second line of "Triều
   * đình". Moved onto the corner itself it overlaps only the chamfer, which is paper, and the ring
   * behind it keeps it legible where it crosses the button's own border.
   */
  private addStatusDot(slot: ActionSlot, top: number, iconScale = LANE_ICON_SCALE): void {
    const dot = this.statusColor?.(slot.action);
    if (dot === undefined) return;
    // Drawn as siblings rather than children of the button, so the press tween (which scales the
    // whole container) does not make the dot pulse with it.
    //
    // Beside the glyph, not on the lane's top-right corner. The corner was clear while the label
    // was centred in a framed button; with the word set full-width under the mark, a dot at the
    // corner is a dot on the last letter of "Triều đình" — `verify-action-bar` caught it on three
    // of the eight rows. Level with the glyph and just outside it, there is nothing to land on:
    // the type starts below the mark, and the mark is 18 units wide in a 47-unit lane.
    const iconHalf = (CARD_ICON_SIZE * iconScale) / 2;
    const x = slot.system
      ? slot.x + slot.width - 4
      : Math.min(slot.x + slot.width - 4, slot.x + slot.width / 2 + iconHalf + 4);
    const y = top + ICON_TOP_PAD + 4;
    const ring = this.scene.add.circle(x, y, 4.6, INK_UI.parchment, 1);
    const marker = this.scene.add.circle(x, y, 3.2, dot, 0.95);
    this.add(ring);
    this.add(marker);
    this.buttonObjects.push(ring, marker);
  }
}
