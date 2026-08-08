import Phaser from 'phaser';
import { GAME_WIDTH, HEADER_HEIGHT } from '../../game/constants';
import { INK_UI, INK_UI_HEX, InkUI } from '../InkUI';
import { TITLE_FONT, UI_FONT } from '../fonts';
import { t } from '../../i18n';
import type { AscentState } from '../../state/types';

/** Bottom edge of the HUD band. Kept in sync with ConquestScene's input guard. */
export const ASCENT_HUD_HEIGHT = 106;

const TOP = HEADER_HEIGHT;

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/**
 * The permanent readout: POWER, THREAT, MOMENTUM.
 *
 * These three numbers are the whole reason this mode is legible without menus — the player
 * should be able to answer "am I getting stronger?", "can I survive what's coming?" and
 * "when is my next choice?" at a glance, without opening anything.
 */
export class AscentHud {
  private readonly ui: InkUI;
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** Tweened display value, so POWER counts up to its new figure instead of snapping. */
  private shownPower = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.ui = new InkUI(scene);
  }

  destroy(): void {
    for (const object of this.objects) object.destroy();
    this.objects = [];
  }

  render(ascent: AscentState): void {
    this.destroy();

    const panel = this.ui.panel(
      { x: 0, y: TOP, width: GAME_WIDTH, height: ASCENT_HUD_HEIGHT },
      { fill: INK_UI.backgroundInk, fillShade: INK_UI.brush, border: INK_UI.gold, radius: 0 },
    );
    panel.setDepth(90);
    this.objects.push(panel);

    this.renderPower(ascent);
    this.renderThreat(ascent);
    this.renderMomentum(ascent);

    for (const object of this.objects) {
      (object as Phaser.GameObjects.Container).setDepth?.(91);
    }
    panel.setDepth(90);
  }

  private add(object: Phaser.GameObjects.GameObject): void {
    this.objects.push(object);
  }

  private renderPower(ascent: AscentState): void {
    this.add(this.ui.label(14, TOP + 8, t('ascent.hud.power'), 'caption', {
      color: INK_UI_HEX.lightText,
      fontSize: '10px',
    }).setAlpha(0.7));

    const value = this.scene.add.text(14, TOP + 22, formatNumber(this.shownPower), {
      color: '#f3dd9a',
      fontFamily: TITLE_FONT,
      fontSize: '26px',
      fontStyle: '700',
    });
    this.add(value);

    // Count up rather than snap: the number moving is the feedback for a card just taken.
    const target = ascent.power;
    if (this.shownPower !== target) {
      const from = this.shownPower;
      this.scene.tweens.addCounter({
        from,
        to: target,
        duration: 520,
        ease: 'Cubic.easeOut',
        onUpdate: (tween) => {
          this.shownPower = tween.getValue() ?? target;
          if (value.active) value.setText(formatNumber(this.shownPower));
        },
        onComplete: () => {
          this.shownPower = target;
        },
      });
    }

    const delta = ascent.power - ascent.powerPrev;
    if (delta !== 0 && ascent.powerPrev > 0) {
      const rising = delta > 0;
      const ticker = this.scene.add.text(
        16 + value.width + 8,
        TOP + 30,
        `${rising ? '▲' : '▼'}${formatNumber(Math.abs(delta))}`,
        {
          color: rising ? '#9ecb8c' : '#e08a7c',
          fontFamily: UI_FONT,
          fontSize: '12px',
          fontStyle: '700',
        },
      );
      this.add(ticker);
      this.scene.tweens.add({
        targets: ticker,
        y: TOP + 22,
        alpha: 0,
        duration: 1400,
        ease: 'Cubic.easeOut',
      });
    }
  }

  private renderThreat(ascent: AscentState): void {
    const x = GAME_WIDTH - 14;

    this.add(this.ui.label(x, TOP + 8, t('ascent.hud.threat'), 'caption', {
      color: INK_UI_HEX.lightText,
      fontSize: '10px',
      align: 'right',
    }).setOrigin(1, 0).setAlpha(0.7));

    // Compared against what can actually fight, not the headline POWER — a full treasury
    // does not hold a wall, and colouring it against POWER would flatter the player.
    const ratio = ascent.defensePower > 0 ? ascent.threat / ascent.defensePower : 99;
    const { color, key } = ratio < 0.7
      ? { color: '#9ecb8c', key: 'ascent.hud.ahead' as const }
      : ratio < 1.1
        ? { color: '#e8c56a', key: 'ascent.hud.even' as const }
        : { color: '#e08a7c', key: 'ascent.hud.behind' as const };

    this.add(this.scene.add.text(x, TOP + 22, formatNumber(ascent.threat), {
      color,
      fontFamily: TITLE_FONT,
      fontSize: '22px',
      fontStyle: '700',
      align: 'right',
    }).setOrigin(1, 0));

    this.add(this.scene.add.text(x, TOP + 48, t(key), {
      color,
      fontFamily: UI_FONT,
      fontSize: '10px',
      align: 'right',
    }).setOrigin(1, 0).setAlpha(0.9));

    const bossNext = (ascent.wave + 1) % 4 === 0;
    const countdown = bossNext
      ? t('ascent.hud.bossIn', { ticks: Math.max(0, ascent.ticksToWave) })
      : t('ascent.hud.waveIn', { ticks: Math.max(0, ascent.ticksToWave) });
    this.add(this.scene.add.text(x, TOP + 62, countdown, {
      color: bossNext ? '#e08a7c' : '#d8c48e',
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: bossNext ? '700' : 'normal',
      align: 'right',
    }).setOrigin(1, 0));
  }

  private renderMomentum(ascent: AscentState): void {
    const y = TOP + 84;

    this.add(this.scene.add.text(14, y - 2, t('ascent.hud.level', { level: ascent.level }), {
      color: '#f3dd9a',
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontStyle: '700',
    }));

    this.add(this.scene.add.text(58, y - 2, t('ascent.hud.wave', { wave: ascent.wave }), {
      color: '#d8c48e',
      fontFamily: UI_FONT,
      fontSize: '11px',
    }));

    const barX = 118;
    const barWidth = GAME_WIDTH - barX - 14;
    const bar = this.ui.statBar(
      { x: barX, y, width: barWidth, height: 9 },
      ascent.xp,
      Math.max(1, ascent.xpToNext),
      INK_UI.gold,
    );
    this.add(bar);
  }
}
