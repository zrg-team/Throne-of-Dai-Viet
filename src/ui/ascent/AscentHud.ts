import Phaser from 'phaser';
import { GAME_WIDTH, HEADER_HEIGHT } from '../../game/constants';
import { INK_UI, INK_UI_HEX, InkUI } from '../InkUI';
import { TITLE_FONT, UI_FONT } from '../fonts';
import { heatFor } from '../../systems/ascent/AmbitionSystem';
import { WAVE_INTERVAL_TICKS } from '../../game/ascentConfig';
import { heronMeter } from '../ink/devices';
import { t } from '../../i18n';
import type { AscentState } from '../../state/types';
import { PIGMENT } from '../ink/palette';

/**
 * Bottom edge of the HUD band. Kept in sync with ConquestScene's input guard.
 *
 * Deliberately tight. With the header above and a 50px action bar below, every pixel this band
 * takes is a pixel of map the player cannot see — and the map is the game. The three numbers are
 * laid out on two dense rows rather than three airy ones.
 *
 * Eight of these went to the header, which needed them: the band used to close itself with a răng
 * cưa frieze sitting immediately under the level bar, so the bottom of the readout was a gold
 * progress bar with a second, decorative bar of teeth directly beneath it and then a hairline
 * closing the band anyway. Three horizontal rules in eight pixels, two of which say nothing.
 */
export const ASCENT_HUD_HEIGHT = 58;

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
  /**
   * Left edge of the wave countdown, measured once it is laid out.
   *
   * The countdown and the XP bar share the band's last rows, and the bar ran the full width
   * beneath it — so the gold fill was drawn straight through "next wave in 10". Measuring is
   * what makes the two coexist in every language: the row heights are close enough that no
   * fixed vertical split survives a font whose glyphs sit a pixel lower.
   */
  private countdownLeft = GAME_WIDTH - 14;

  constructor(private readonly scene: Phaser.Scene) {
    this.ui = new InkUI(scene);
  }

  destroy(): void {
    for (const object of this.objects) object.destroy();
    this.objects = [];
  }

  render(ascent: AscentState): void {
    this.destroy();

    // One plate with the resource bar above, not a card floating under it.
    //
    // This was an InkUI panel: gold border, cut corners, a rule inside its own edge. Directly
    // beneath a header that is a plain paper strip, that reads as a separate object bolted on —
    // the same complaint the chrome work started from, one level down. It is the same paper now,
    // drawn up over the header's closing hairline so the two are continuous, and closed at the
    // bottom by a single hairline. The header above wears the răng cưa frieze; repeating it here,
    // one pixel under the level bar, only added a second bar for the eye to read as data.
    const panel = this.scene.add.graphics();
    panel.fillStyle(INK_UI.backgroundInk, 0.97);
    panel.fillRect(0, TOP - 2, GAME_WIDTH, ASCENT_HUD_HEIGHT + 2);
    panel.lineStyle(1, PIGMENT.mucSoft, 0.35);
    panel.lineBetween(0, TOP + ASCENT_HUD_HEIGHT - 0.5, GAME_WIDTH, TOP + ASCENT_HUD_HEIGHT - 0.5);
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
    this.add(this.ui.label(14, TOP + 2, t('ascent.hud.power'), 'caption', {
      color: INK_UI_HEX.mutedText,
      fontSize: '9px',
    }).setAlpha(0.7));

    const value = this.scene.add.text(14, TOP + 11, formatNumber(this.shownPower), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '22px',
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
        TOP + 19,
        `${rising ? '▲' : '▼'}${formatNumber(Math.abs(delta))}`,
        {
          color: rising ? '#4c6b46' : '#a4402c',
          fontFamily: UI_FONT,
          fontSize: '12px',
          fontStyle: '700',
        },
      );
      this.add(ticker);
      this.scene.tweens.add({
        targets: ticker,
        y: TOP + 11,
        alpha: 0,
        duration: 1400,
        ease: 'Cubic.easeOut',
      });
    }
  }

  private renderThreat(ascent: AscentState): void {
    const x = GAME_WIDTH - 14;

    this.add(this.ui.label(x, TOP + 2, t('ascent.hud.threat'), 'caption', {
      color: INK_UI_HEX.mutedText,
      fontSize: '9px',
      align: 'right',
    }).setOrigin(1, 0).setAlpha(0.7));

    // Compared against what can actually fight, not the headline POWER — a full treasury
    // does not hold a wall, and colouring it against POWER would flatter the player.
    const ratio = ascent.defensePower > 0 ? ascent.threat / ascent.defensePower : 99;
    const { color, key } = ratio < 0.7
      ? { color: '#4c6b46', key: 'ascent.hud.ahead' as const }
      : ratio < 1.1
        ? { color: '#9a6b16', key: 'ascent.hud.even' as const }
        : { color: '#a4402c', key: 'ascent.hud.behind' as const };

    const threatValue = this.scene.add.text(x, TOP + 11, formatNumber(ascent.threat), {
      color,
      fontFamily: TITLE_FONT,
      fontSize: '20px',
      fontStyle: '700',
      align: 'right',
    }).setOrigin(1, 0);
    this.add(threatValue);

    // Beside the figure, not beneath it: the verdict and the number are one thought.
    this.add(this.scene.add.text(x - threatValue.width - 6, TOP + 17, t(key), {
      color,
      fontFamily: UI_FONT,
      fontSize: '10px',
      align: 'right',
    }).setOrigin(1, 0).setAlpha(0.9));

    const bossNext = (ascent.wave + 1) % 4 === 0;
    const countdown = bossNext
      ? t('ascent.hud.bossIn', { ticks: Math.max(0, ascent.ticksToWave) })
      : t('ascent.hud.waveIn', { ticks: Math.max(0, ascent.ticksToWave) });
    const countdownText = this.scene.add.text(x, TOP + 34, countdown, {
      color: bossNext ? '#a4402c' : '#5a4c39',
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: bossNext ? '700' : 'normal',
      align: 'right',
    }).setOrigin(1, 0);
    this.add(countdownText);
    this.countdownLeft = x - countdownText.width;


    // The cause, printed beside its effect.
    //
    // The threat figure above already climbs as the player commits — it is quoted from live
    // ambition — but a number that moves for reasons the player cannot see is the exact
    // failure the ambition curve was built to end. This says *why* it moved, on the same
    // right-hand column, and warms from jade through gold to cinnabar as the realm gets bolder.
    const heat = heatFor(ascent.ambition);
    if (heat > 1.001) {
      const heatColor = heat < 1.4 ? '#4c6b46' : heat < 2 ? '#9a6b16' : '#a4402c';
      const ambitionText = this.scene.add.text(
        this.countdownLeft - 8,
        TOP + 34,
        t('ascent.hud.ambition', { mult: heat.toFixed(1) }),
        { color: heatColor, fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700', align: 'right' },
      ).setOrigin(1, 0);
      this.add(ambitionText);
      // The XP bar is bounded by whatever now sits furthest left on this row, not by the
      // countdown specifically — otherwise the gold fill runs straight under this label.
      this.countdownLeft -= ambitionText.width + 8;
    }
  }

  private renderMomentum(ascent: AscentState): void {
    const y = TOP + 41;

    this.add(this.scene.add.text(14, y - 2, t('ascent.hud.level', { level: ascent.level }), {
      color: '#2a2118',
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: '700',
    }));

    this.add(this.scene.add.text(54, y - 2, t('ascent.hud.wave', { wave: ascent.wave }), {
      color: '#5a4c39',
      fontFamily: UI_FONT,
      fontSize: '10px',
    }));

    // Stops short of the countdown above it rather than running to the band's edge. `render`
    // draws threat before momentum, so the measurement is always this frame's.
    const barX = 110;
    const barWidth = Math.max(60, this.countdownLeft - 10 - barX);

    // The wave, as a Đông Sơn frieze: the Lạc birds of the Ngọc Lũ tympanum ink in as it closes.
    // A bar chart from 500 BCE, and it earns the slot because the meter speaks in the narrator's
    // register — bronze — while the world it is counting down over is dated to a dynasty.
    const toWave = 1 - Math.max(0, Math.min(1, ascent.ticksToWave / Math.max(1, WAVE_INTERVAL_TICKS)));
    const meter = this.scene.add.graphics();
    heronMeter(meter, barX, y - 1, barWidth, 11, toWave, true);
    this.add(meter);

    // Level progress keeps its own thin rule beneath the frieze: two different quantities, and
    // stacking them beat merging them into one ambiguous bar.
    const bar = this.ui.statBar(
      { x: barX, y: y + 11, width: barWidth, height: 3 },
      ascent.xp,
      Math.max(1, ascent.xpToNext),
      INK_UI.gold,
    );
    this.add(bar);
  }
}
