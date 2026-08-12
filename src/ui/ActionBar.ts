import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH, isCampaignMode } from '../game/constants';
import type { GameState } from '../state/types';
import { InkUI, INK_UI } from './InkUI';
import { t } from '../i18n';

const EMPIRE_KEYS = ['build', 'heroes', 'court', 'army', 'affairs', 'directives', 'pause'] as const;
const CAMPAIGN_KEYS = ['build', 'heroes', 'court', 'army', 'affairs', 'pause'] as const;
const RIVAL_KEYS = ['build', 'heroes', 'court', 'army', 'pause'] as const;
/**
 * Dragon Ascent's bar is the classic menu, not a new one: the same Build / Heroes / Court /
 * Army / Affairs screens the other modes have, plus this mode's Codex. Conquest is reached
 * the classic way too — by selecting a province on the map — so it needs no button here.
 */
const ASCENT_KEYS = ['build', 'heroes', 'court', 'army', 'affairs', 'codex'] as const;

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

export const ACTION_BUTTON_HEIGHT = 36;
export const ACTION_BUTTON_Y = GAME_HEIGHT - ACTION_BAR_HEIGHT / 2;

/** Width of an icon-only system control, and the gap separating that cluster from the lanes. */
const SYSTEM_BUTTON_WIDTH = 34;
const SYSTEM_CLUSTER_GAP = 6;

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

function getButtonGap(gameMode: string): number {
  if (gameMode === 'ascent' || gameMode === 'empire') return 2;
  return isCampaignMode(gameMode) ? 3 : 4;
}

function getButtonMargin(gameMode: string): number {
  if (gameMode === 'ascent' || gameMode === 'empire') return 6;
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
    this.add(scene.add.rectangle(0, top, GAME_WIDTH, ACTION_BAR_HEIGHT, INK_UI.backgroundInk, 0.96).setOrigin(0, 0));
    this.add(scene.add.rectangle(14, top + 3, GAME_WIDTH - 28, 2, INK_UI.cinnabar, 0.78).setOrigin(0, 0));

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

  private buildButtons(): void {
    const paused = this.gameState.isStrategyPause;
    const top = ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2;

    for (const slot of actionBarSlots(this.gameMode, this.context())) {
      const bounds = { x: slot.x, y: top, width: slot.width, height: ACTION_BUTTON_HEIGHT };

      if (slot.system) {
        this.buildSystemButton(slot, bounds, paused);
        continue;
      }

      let label: string;
      let variant: string;

      if (slot.action === 'pause') {
        // Classic modes keep the labelled Pause/Resume toggle.
        label = paused ? t('action.resume') : t('action.pause');
        variant = paused ? 'danger' : 'ghost';
      } else if (slot.action === 'affairs') {
        label = t('action.affairs');
        variant = 'secondary';
      } else if (slot.action === 'directives') {
        label = t('empire.action.directives');
        variant = 'secondary';
      } else if (slot.action === 'battle') {
        // The siege is the loudest thing on the bar while it lasts.
        label = t('action.battle');
        variant = 'danger';
      } else {
        label = t(`action.${slot.action}` as Parameters<typeof t>[0]);
        variant = 'secondary';
      }

      const button = this.ui.button(
        bounds,
        label,
        () => this.onAction(slot.action),
        { fontSize: '11px', variant: variant as 'secondary' | 'ghost' | 'danger' | 'primary' },
      );
      this.add(button);
      this.buttonObjects.push(button);
      this.addStatusDot(slot, top);
    }
  }

  /**
   * Pause and Menu, drawn as glyphs rather than words.
   *
   * Drawn with Graphics rather than set as text: the two are one-shape ideas that survive at
   * 34px where a label cannot, and drawing them means never depending on a webfont happening
   * to carry ❚❚ / ☰.
   */
  private buildSystemButton(slot: ActionSlot, bounds: { x: number; y: number; width: number; height: number }, paused: boolean): void {
    const isPause = slot.action === 'pause';
    const button = this.ui.button(
      bounds,
      '',
      () => this.onAction(slot.action),
      {
        variant: isPause && paused ? 'primary' : 'secondary',
        // The smallest targets on the bar, so they get back in touch area what they gave up
        // in width.
        extraHitPadding: 10,
      },
    );

    const glyph = this.scene.add.graphics();
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;
    glyph.fillStyle(INK_UI.brush, 0.92);

    if (isPause && paused) {
      // Paused → the button offers play.
      glyph.fillTriangle(cx - 5, cy - 7, cx + 7, cy, cx - 5, cy + 7);
    } else if (isPause) {
      glyph.fillRect(cx - 6, cy - 7, 4, 14);
      glyph.fillRect(cx + 2, cy - 7, 4, 14);
    } else {
      for (const dy of [-6, 0, 6]) glyph.fillRect(cx - 8, cy + dy - 1.5, 16, 3);
    }

    button.add(glyph);
    this.add(button);
    this.buttonObjects.push(button);
    this.addStatusDot(slot, bounds.y);
  }

  private addStatusDot(slot: ActionSlot, top: number): void {
    const dot = this.statusColor?.(slot.action);
    if (dot === undefined) return;
    // Drawn as a sibling rather than a child of the button, so `ui.button`'s press
    // tween (which scales the whole container) does not make the dot pulse with it.
    const marker = this.scene.add.circle(slot.x + slot.width - 7, top + 7, 3.5, dot, 0.95);
    this.add(marker);
    this.buttonObjects.push(marker);
  }
}
