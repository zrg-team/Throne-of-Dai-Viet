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
 *
 * **Built once, then written into.** This band used to be torn down and rebuilt on every call:
 * eight `Text` objects, a Đông Sơn frieze and two bars, each text a canvas measure and a texture
 * upload. `ConquestUIScene.refresh` calls it, and during a fight the *battle clock* drives that
 * refresh at `BATTLE_TICK_MS` — so the band was rebuilt 1.8 times a second. Measured at a 4x CPU
 * throttle: 50.5 ms per beat, more than the entire battle screen underneath it. And a signature
 * guard could not save it, because during a fight every number here is genuinely moving — men are
 * dying, so POWER and THREAT change on every exchange. The work had to get cheaper, not rarer.
 *
 * So the objects are made once and each render writes strings and redraws two graphics. What still
 * allocates is the ▲/▼ ticker, which is a transient by nature and only appears when POWER moves.
 */
export class AscentHud {
  private readonly ui: InkUI;
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

  /** The band's permanent furniture. Undefined until the first render builds it. */
  private parts?: {
    panel: Phaser.GameObjects.Graphics;
    powerValue: Phaser.GameObjects.Text;
    threatValue: Phaser.GameObjects.Text;
    threatVerdict: Phaser.GameObjects.Text;
    countdown: Phaser.GameObjects.Text;
    ambition: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    wave: Phaser.GameObjects.Text;
    meter: Phaser.GameObjects.Graphics;
    xp: Phaser.GameObjects.Graphics;
    labels: Phaser.GameObjects.GameObject[];
  };

  constructor(private readonly scene: Phaser.Scene) {
    this.ui = new InkUI(scene);
  }

  destroy(): void {
    const parts = this.parts;
    if (!parts) return;
    for (const object of [parts.panel, parts.powerValue, parts.threatValue, parts.threatVerdict,
      parts.countdown, parts.ambition, parts.level, parts.wave, parts.meter, parts.xp, ...parts.labels]) {
      object.destroy();
    }
    this.parts = undefined;
  }

  render(ascent: AscentState): void {
    const parts = this.parts ?? this.build();

    // ── POWER ────────────────────────────────────────────────────────────
    // Count up rather than snap: the number moving is the feedback for a card just taken. The
    // counter writes into a text object that now outlives the render, so a rebuild can no longer
    // orphan a tween half way through its climb.
    const target = ascent.power;
    if (this.shownPower !== target) {
      this.scene.tweens.killTweensOf(parts.powerValue);
      this.scene.tweens.addCounter({
        from: this.shownPower,
        to: target,
        duration: 520,
        ease: 'Cubic.easeOut',
        onUpdate: (tween) => {
          this.shownPower = tween.getValue() ?? target;
          if (parts.powerValue.active) parts.powerValue.setText(formatNumber(this.shownPower));
        },
        onComplete: () => { this.shownPower = target; },
      });
    }

    const delta = ascent.power - ascent.powerPrev;
    if (delta !== 0 && ascent.powerPrev > 0) this.spawnTicker(delta, parts.powerValue.width);

    // ── THREAT ───────────────────────────────────────────────────────────
    const x = GAME_WIDTH - 14;
    // Compared against what can actually fight, not the headline POWER — a full treasury
    // does not hold a wall, and colouring it against POWER would flatter the player.
    const ratio = ascent.defensePower > 0 ? ascent.threat / ascent.defensePower : 99;
    const { color, key } = ratio < 0.7
      ? { color: '#4c6b46', key: 'ascent.hud.ahead' as const }
      : ratio < 1.1
        ? { color: '#9a6b16', key: 'ascent.hud.even' as const }
        : { color: '#a4402c', key: 'ascent.hud.behind' as const };

    write(parts.threatValue, formatNumber(ascent.threat), color);
    // Beside the figure, not beneath it: the verdict and the number are one thought.
    write(parts.threatVerdict, t(key), color);
    parts.threatVerdict.setX(x - parts.threatValue.width - 6);

    const bossNext = (ascent.wave + 1) % 4 === 0;
    write(
      parts.countdown,
      bossNext
        ? t('ascent.hud.bossIn', { ticks: Math.max(0, ascent.ticksToWave) })
        : t('ascent.hud.waveIn', { ticks: Math.max(0, ascent.ticksToWave) }),
      bossNext ? '#a4402c' : '#5a4c39',
    );
    parts.countdown.setFontStyle(bossNext ? '700' : 'normal');
    this.countdownLeft = x - parts.countdown.width;

    // The cause, printed beside its effect.
    //
    // The threat figure above already climbs as the player commits — it is quoted from live
    // ambition — but a number that moves for reasons the player cannot see is the exact
    // failure the ambition curve was built to end. This says *why* it moved, on the same
    // right-hand column, and warms from jade through gold to cinnabar as the realm gets bolder.
    const heat = heatFor(ascent.ambition);
    if (heat > 1.001) {
      write(
        parts.ambition,
        t('ascent.hud.ambition', { mult: heat.toFixed(1) }),
        heat < 1.4 ? '#4c6b46' : heat < 2 ? '#9a6b16' : '#a4402c',
      );
      parts.ambition.setVisible(true).setX(this.countdownLeft - 8);
      // The XP bar is bounded by whatever now sits furthest left on this row, not by the
      // countdown specifically — otherwise the gold fill runs straight under this label.
      this.countdownLeft -= parts.ambition.width + 8;
    } else {
      parts.ambition.setVisible(false);
    }

    // ── MOMENTUM ─────────────────────────────────────────────────────────
    const y = TOP + 41;
    write(parts.level, t('ascent.hud.level', { level: ascent.level }));
    write(parts.wave, t('ascent.hud.wave', { wave: ascent.wave }));

    // Stops short of the countdown above it rather than running to the band's edge. THREAT is
    // written before MOMENTUM, so the measurement is always this frame's.
    const barX = 110;
    const barWidth = Math.max(60, this.countdownLeft - 10 - barX);

    // The wave, as a Đông Sơn frieze: the Lạc birds of the Ngọc Lũ tympanum ink in as it closes.
    // A bar chart from 500 BCE, and it earns the slot because the meter speaks in the narrator's
    // register — bronze — while the world it is counting down over is dated to a dynasty.
    const toWave = 1 - Math.max(0, Math.min(1, ascent.ticksToWave / Math.max(1, WAVE_INTERVAL_TICKS)));
    parts.meter.clear();
    heronMeter(parts.meter, barX, y - 1, barWidth, 11, toWave, true);

    // Level progress keeps its own thin rule beneath the frieze: two different quantities, and
    // stacking them beat merging them into one ambiguous bar.
    const filled = Math.max(0, Math.min(1, ascent.xp / Math.max(1, ascent.xpToNext)));
    parts.xp.clear();
    parts.xp.fillStyle(INK_UI.brush, 0.2);
    parts.xp.fillRect(barX, y + 11, barWidth, 3);
    if (filled > 0) {
      parts.xp.fillStyle(INK_UI.gold, 0.88);
      parts.xp.fillRect(barX, y + 11, Math.max(1.5, barWidth * filled), 3);
    }
  }

  /** The furniture, made once: everything whose position and content the band keeps re-writing. */
  private build(): NonNullable<AscentHud['parts']> {
    const labels: Phaser.GameObjects.GameObject[] = [];

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

    const x = GAME_WIDTH - 14;
    labels.push(this.ui.label(14, TOP + 2, t('ascent.hud.power'), 'caption', {
      color: INK_UI_HEX.mutedText, fontSize: '9px',
    }).setAlpha(0.7).setDepth(91));
    labels.push(this.ui.label(x, TOP + 2, t('ascent.hud.threat'), 'caption', {
      color: INK_UI_HEX.mutedText, fontSize: '9px', align: 'right',
    }).setOrigin(1, 0).setAlpha(0.7).setDepth(91));

    const powerValue = this.scene.add.text(14, TOP + 11, formatNumber(this.shownPower), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '22px', fontStyle: '700',
    }).setDepth(91);

    const threatValue = this.scene.add.text(x, TOP + 11, '', {
      color: '#4c6b46', fontFamily: TITLE_FONT, fontSize: '20px', fontStyle: '700', align: 'right',
    }).setOrigin(1, 0).setDepth(91);

    const threatVerdict = this.scene.add.text(x, TOP + 17, '', {
      color: '#4c6b46', fontFamily: UI_FONT, fontSize: '10px', align: 'right',
    }).setOrigin(1, 0).setAlpha(0.9).setDepth(91);

    const countdown = this.scene.add.text(x, TOP + 34, '', {
      color: '#5a4c39', fontFamily: UI_FONT, fontSize: '10px', align: 'right',
    }).setOrigin(1, 0).setDepth(91);

    const ambition = this.scene.add.text(x, TOP + 34, '', {
      color: '#4c6b46', fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700', align: 'right',
    }).setOrigin(1, 0).setVisible(false).setDepth(91);

    const y = TOP + 41;
    const level = this.scene.add.text(14, y - 2, '', {
      color: '#2a2118', fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
    }).setDepth(91);
    const wave = this.scene.add.text(54, y - 2, '', {
      color: '#5a4c39', fontFamily: UI_FONT, fontSize: '10px',
    }).setDepth(91);

    const meter = this.scene.add.graphics().setDepth(91);
    const xp = this.scene.add.graphics().setDepth(91);

    this.parts = {
      panel, powerValue, threatValue, threatVerdict, countdown, ambition, level, wave, meter, xp, labels,
    };
    return this.parts;
  }

  /** The ▲/▼ that rises off POWER when it moves. A transient by nature, so it is still made fresh. */
  private spawnTicker(delta: number, powerWidth: number): void {
    const rising = delta > 0;
    const ticker = this.scene.add.text(
      16 + powerWidth + 8,
      TOP + 19,
      `${rising ? '▲' : '▼'}${formatNumber(Math.abs(delta))}`,
      { color: rising ? '#4c6b46' : '#a4402c', fontFamily: UI_FONT, fontSize: '12px', fontStyle: '700' },
    ).setDepth(91);
    this.scene.tweens.add({
      targets: ticker,
      y: TOP + 11,
      alpha: 0,
      duration: 1400,
      ease: 'Cubic.easeOut',
      // It owns its own end. Left in the band's object list it was destroyed by the next rebuild
      // with 840 ms of its climb still to run, leaving a tween writing to nothing.
      onComplete: () => ticker.destroy(),
    });
  }
}

/** `setText` re-measures the canvas and re-uploads the texture even for an identical string. */
function write(label: Phaser.GameObjects.Text, text: string, colour?: string): void {
  if (label.text !== text) label.setText(text);
  if (colour !== undefined && label.style.color !== colour) label.setColor(colour);
}
