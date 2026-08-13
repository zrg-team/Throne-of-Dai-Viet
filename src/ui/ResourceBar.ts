import Phaser from 'phaser';
import { GAME_WIDTH, HEADER_HEIGHT } from '../game/constants';
import type { GameState, ResourceKey } from '../state/types';
import { compactNumber } from '../utils/format';
import { seasonLabel, t } from '../i18n';
import { InkUI, INK_UI, INK_UI_HEX } from './InkUI';
import { RESOURCE_ICONS } from './theme';
import { sawtoothBand } from './ink/devices';
import { PIGMENT } from './ink/palette';

const RESOURCE_ORDER: ResourceKey[] = ['food', 'supplies', 'gold', 'humans'];
const ICON_DISPLAY_SIZE = 15;

/**
 * The strip's vertical rhythm. The two răng cưa bands frame it, so the type has to clear them
 * rather than share their rows — which is what it was doing in Vietnamese, where the title's
 * diacritics sit higher than any Latin cap.
 */
const TOP_BAND_Y = 3;
const BAND_HEIGHT = 4;
const TITLE_Y = 10;
/** Centre line of the resource row. */
const ROW_Y = 36;
const BOTTOM_BAND_Y = HEADER_HEIGHT - 7;

/**
 * Where the two friezes sit, exported so a driver can assert the type clears them. A band drawn
 * into a `Graphics` has no bounds to read, and this is precisely the collision that shipped.
 */
export const HEADER_BANDS = {
  top: { y: TOP_BAND_Y, height: BAND_HEIGHT },
  bottom: { y: BOTTOM_BAND_Y, height: BAND_HEIGHT },
};

/**
 * Stores whose exhaustion actively hurts — `collectPlayerIncome` docks army morale and supply
 * every tick either of these hits zero, and food additionally puts population into decline.
 * Gold and people running low are setbacks; these two are a countdown.
 */
const CRITICAL_RESOURCES: ResourceKey[] = ['food', 'supplies'];
/** Seasons of buffer at the current burn below which the strip escalates. */
const WARNING_SEASONS = 10;
const CRISIS_SEASONS = 3;

export class ResourceBar extends Phaser.GameObjects.Container {
  private seasonText: Phaser.GameObjects.Text;
  private resourceTexts: Record<ResourceKey, Phaser.GameObjects.Text>;
  private resourceIcons!: Record<ResourceKey, Phaser.GameObjects.Image>;
  /** Filled plate behind a store that is running out, so the crisis reads at a glance. */
  private alertChips: Record<ResourceKey, Phaser.GameObjects.Rectangle>;

  constructor(scene: Phaser.Scene, private readonly gameState: GameState) {
    super(scene, 0, 0);
    this.setDepth(80);
    const ui = new InkUI(scene);

    const back = scene.add.rectangle(0, 0, GAME_WIDTH, HEADER_HEIGHT, INK_UI.backgroundInk, 0.97).setOrigin(0, 0);
    this.add(back);

    // Đông Sơn bronze — the narrator's register, kept distinct from the world's. The răng cưa
    // sawtooth is the drum band that still reads at seven pixels tall; a meander at this size
    // renders as the letter P repeated across the screen.
    const band = scene.add.graphics();
    band.setDefaultStyles({});
    sawtoothBand(band, 8, TOP_BAND_Y, GAME_WIDTH - 16, BAND_HEIGHT, 0.45);
    sawtoothBand(band, 8, BOTTOM_BAND_Y, GAME_WIDTH - 16, BAND_HEIGHT, 0.4);
    band.lineStyle(1, PIGMENT.mucSoft, 0.35);
    band.lineBetween(0, HEADER_HEIGHT - 0.5, GAME_WIDTH, HEADER_HEIGHT - 0.5);
    this.add(band);

    this.seasonText = ui.label(12, TITLE_Y, '', 'title', { color: INK_UI_HEX.inkText, fontSize: '15px' });
    this.add(this.seasonText);

    const itemWidth = (GAME_WIDTH - 24) / RESOURCE_ORDER.length;
    this.resourceTexts = {} as Record<ResourceKey, Phaser.GameObjects.Text>;
    this.alertChips = {} as Record<ResourceKey, Phaser.GameObjects.Rectangle>;
    this.resourceIcons = {} as Record<ResourceKey, Phaser.GameObjects.Image>;
    RESOURCE_ORDER.forEach((resource, index) => {
      const x = 12 + index * itemWidth;
      // Added before the icon and text so it always sits behind them.
      const chip = scene.add
        .rectangle(x - 4, ROW_Y, itemWidth - 6, 17, INK_UI.cinnabar, 0.9)
        .setOrigin(0, 0.5)
        .setVisible(false);
      const icon = scene.add
        .image(x, ROW_Y, RESOURCE_ICONS[resource].key)
        .setOrigin(0, 0.5)
        .setDisplaySize(ICON_DISPLAY_SIZE, ICON_DISPLAY_SIZE);
      const text = ui.label(x + ICON_DISPLAY_SIZE + 4, ROW_Y, '', 'subtitle', {
        fontSize: '12px',
      }).setOrigin(0, 0.5);
      this.resourceTexts[resource] = text;
      this.alertChips[resource] = chip;
      this.resourceIcons[resource] = icon;
      this.add([chip, icon, text]);
    });

    scene.add.existing(this);
    this.refresh();
  }

  /**
   * Seasons of buffer left at the current burn, or `Infinity` while a store is filling.
   */
  private runway(resource: ResourceKey): number {
    const rate = this.gameState.resourceRates[resource];
    if (rate >= 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, this.gameState.resources[resource]) / Math.max(1, -rate);
  }

  /**
   * Packs the four stores into the strip after their values are known.
   *
   * The slots used to be a quarter of the width each, decided before anybody knew what would go in
   * them. A realm holding 29.1k gold writes "29.1k (+522)" and runs straight through the icon of
   * the store beside it — the numbers collide exactly when the run is going well enough to care
   * about them. Measuring first and packing by flow cannot collide; if the four still will not fit
   * the type steps down until they do.
   */
  private reflow(): void {
    const available = GAME_WIDTH - 24;
    for (const size of ['12px', '11px', '10px', '9px']) {
      let total = 0;
      for (const resource of RESOURCE_ORDER) {
        const text = this.resourceTexts[resource];
        if (text.style.fontSize !== size) {
          text.setFontSize(size);
        }
        total += ICON_DISPLAY_SIZE + 4 + text.width;
      }
      const gap = (available - total) / (RESOURCE_ORDER.length - 1);
      if (gap < 6 && size !== '9px') {
        continue;
      }
      let x = 12;
      for (const resource of RESOURCE_ORDER) {
        const text = this.resourceTexts[resource];
        const width = ICON_DISPLAY_SIZE + 4 + text.width;
        this.resourceIcons[resource].setPosition(x, ROW_Y);
        text.setPosition(x + ICON_DISPLAY_SIZE + 4, ROW_Y);
        this.alertChips[resource].setPosition(x - 4, ROW_Y).setSize(width + 6, 17);
        x += width + Math.max(6, gap);
      }
      return;
    }
  }

  refresh(): void {
    this.seasonText.setText(t('time.yearSeason', { year: this.gameState.year, season: seasonLabel(this.gameState.season) }));
    RESOURCE_ORDER.forEach((resource) => {
      const rate = this.gameState.resourceRates[resource];
      const signedRate = rate > 0 ? `+${compactNumber(rate)}` : compactNumber(rate);
      const text = this.resourceTexts[resource];
      text.setText(`${compactNumber(this.gameState.resources[resource])} (${signedRate})`);

      // A store that is merely shrinking gets the old pink; one that is about to run dry gets
      // escalated, because the two are not remotely the same situation and used to look it.
      //
      // Measured across five runs, a realm could sit at zero food for hundreds of consecutive
      // seasons — every host losing 4 morale and 6 supply a tick — while the strip rendered that
      // in the same 12px as a healthy gold surplus beside it. Runs were being decided by a line
      // of text no wider than a thumbnail.
      const seasons = CRITICAL_RESOURCES.includes(resource) ? this.runway(resource) : Number.POSITIVE_INFINITY;
      const crisis = seasons <= CRISIS_SEASONS;
      const warning = !crisis && seasons <= WARNING_SEASONS;

      this.alertChips[resource].setVisible(crisis);
      // Read on paper, not on the old near-black: ink for the ordinary case, sỏi son only when a
      // store is actually running out.
      text.setColor(
        crisis ? '#8a2a1b'
          : warning ? '#9a6b16'
            : rate < 0 ? '#a4522f'
              : rate > 0 ? '#4c6b46' : INK_UI_HEX.inkText,
      );
      text.setFontStyle(crisis || warning ? 'bold' : 'normal');
    });

    this.reflow();
  }
}
