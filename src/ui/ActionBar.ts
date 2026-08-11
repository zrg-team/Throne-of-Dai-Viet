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
// `battle` sits first because while a siege is live it is the only thing that matters, and
// it is the one button that appears and disappears with the state of the world.
const ASCENT_KEYS = ['battle', 'build', 'heroes', 'court', 'army', 'affairs', 'codex', 'pause'] as const;

export const ACTION_BUTTON_HEIGHT = 36;
export const ACTION_BUTTON_Y = GAME_HEIGHT - ACTION_BAR_HEIGHT / 2;

export function getActionKeys(gameMode: string): readonly string[] {
  if (gameMode === 'ascent') return [...ASCENT_KEYS];
  if (gameMode === 'empire') return [...EMPIRE_KEYS];
  return isCampaignMode(gameMode) ? [...CAMPAIGN_KEYS] : [...RIVAL_KEYS];
}

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

export function actionButtonLeft(index: number, gameMode = 'rival'): number {
  return getButtonMargin(gameMode) + index * (getButtonWidth(gameMode) + getButtonGap(gameMode));
}

export function getActionButtonWidth(gameMode = 'rival'): number {
  return getButtonWidth(gameMode);
}

export function getActionButtonGap(gameMode = 'rival'): number {
  return getButtonGap(gameMode);
}

export function getActionButtonMargin(gameMode = 'rival'): number {
  return getButtonMargin(gameMode);
}

// Legacy constants kept for backwards-compat
export const ACTION_BUTTON_WIDTH = 72;
export const ACTION_BUTTON_GAP = 4;
export const ACTION_BUTTON_MARGIN = 6;
export const ACTION_BUTTON_LABELS = ['Build', 'Heroes', 'Court', 'Army', 'Pause'];

export class ActionBar extends Phaser.GameObjects.Container {
  private readonly gameMode: string;
  private readonly ui: InkUI;
  private buttonObjects: Phaser.GameObjects.Container[] = [];

  /**
   * Optional per-button status dot. Dragon Ascent uses it to carry each lane's
   * ready/busy/alert state onto the bar, so relocating the lanes here loses none of the
   * at-a-glance signal the old top strip carried. Return `undefined` for no dot.
   */
  statusColor?: (action: string) => number | undefined;

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
    const keys = getActionKeys(this.gameMode);
    const bw = getButtonWidth(this.gameMode);
    const bg = getButtonGap(this.gameMode);
    const bm = getButtonMargin(this.gameMode);
    const paused = this.gameState.isStrategyPause;

    keys.forEach((action, index) => {
      const xLeft = bm + index * (bw + bg);
      const isPause = action === 'pause';
      const isAffairs = action === 'affairs';

      let label: string;
      let variant: string;

      if (isPause) {
        label = paused ? t('action.resume') : t('action.pause');
        variant = paused ? 'danger' : 'ghost';
      } else if (isAffairs) {
        label = t('action.affairs');
        variant = 'secondary';
      } else if (action === 'directives') {
        label = t('empire.action.directives');
        variant = 'secondary';
      } else {
        label = t(`action.${action}` as Parameters<typeof t>[0]);
        variant = 'secondary';
      }

      const top = ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2;
      const button = this.ui.button(
        { x: xLeft, y: top, width: bw, height: ACTION_BUTTON_HEIGHT },
        label,
        () => this.onAction(action),
        { fontSize: '11px', variant: variant as 'secondary' | 'ghost' | 'danger' | 'primary' },
      );
      this.add(button);
      this.buttonObjects.push(button);

      const dot = this.statusColor?.(action);
      if (dot !== undefined) {
        // Drawn as a sibling rather than a child of the button, so `ui.button`'s press
        // tween (which scales the whole container) does not make the dot pulse with it.
        const marker = this.scene.add.circle(xLeft + bw - 7, top + 7, 3.5, dot, 0.95);
        this.add(marker);
        this.buttonObjects.push(marker as unknown as Phaser.GameObjects.Container);
      }
    });
  }
}
