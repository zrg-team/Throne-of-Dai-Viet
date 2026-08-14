/**
 * The province-focus selector, as data.
 *
 * Two scenes show this list — the Empire land panel (`UIScene`) and Dragon Ascent's build sheet
 * (`ConquestUIScene`) — and they draw cards with different APIs, so what is shared here is the
 * *reading* of a province rather than any Phaser object: which focus the land suits, what each
 * one actually pays here, and how to say so. Rendering stays with each scene.
 *
 * The point of showing aptitude at all is that `getLandAptitude` made terrain matter, and a bonus
 * the player cannot see is a bonus they cannot play around. This is the screen that turns "what
 * should this province be?" into a question with a discoverable answer.
 */
import type { Land, LandSpecialization } from '../state/types';
import { SPECIALIZATION_MULT, getFocusOutputMult, getLandAptitude, getLandSpecialization } from '../systems/ResourceSystem';
import { t } from '../i18n';

/** How well the ground takes to a focus, bucketed for display. */
export type FocusSuitability = 'high' | 'mid' | 'low' | 'neutral';

export interface FocusRow {
  focus: LandSpecialization;
  /** Display name, e.g. "Breadbasket". */
  title: string;
  /** The tilt as it will actually be paid on this land, e.g. "Food x1.54  Supplies x0.85". */
  effect: string;
  /** One line on how well the land suits it. */
  suitLine: string;
  suitability: FocusSuitability;
  aptitude: number;
  isCurrent: boolean;
  /** The single best-suited non-neutral focus for this province. */
  isBest: boolean;
}

const ORDER: LandSpecialization[] = ['balanced', 'breadbasket', 'mining', 'trade', 'populous', 'fortress'];

function suitabilityOf(focus: LandSpecialization, aptitude: number): FocusSuitability {
  if (focus === 'balanced') return 'neutral';
  if (aptitude >= 0.66) return 'high';
  if (aptitude >= 0.36) return 'mid';
  return 'low';
}

/**
 * One row per focus, in a fixed order.
 *
 * Fixed rather than sorted best-first on purpose: the list is read many times across a run, and a
 * list whose rows move between provinces cannot be learned. The recommendation is carried by the
 * `isBest` flag instead.
 */
export function buildFocusRows(land: Land): FocusRow[] {
  const aptitude = getLandAptitude(land);
  const current = getLandSpecialization(land);

  let best: LandSpecialization = 'breadbasket';
  for (const focus of ORDER) {
    if (focus !== 'balanced' && aptitude[focus] > aptitude[best]) {
      best = focus;
    }
  }

  return ORDER.map((focus) => {
    // Shown as the land will actually pay it, not as the table promises — the whole reason the
    // aptitude scaling exists is that those two numbers differ.
    const probe = { ...land, specialization: focus } as Land;
    const mult = focus === 'balanced' ? SPECIALIZATION_MULT.balanced : getFocusOutputMult(probe);
    const effect = (['food', 'supplies', 'gold'] as const)
      .map((key) => `${t(`resource.${key}` as Parameters<typeof t>[0])} ×${mult[key].toFixed(2)}`)
      .join('  ');

    const suitability = suitabilityOf(focus, aptitude[focus]);
    const pct = Math.round(aptitude[focus] * 100);
    const suitLine = suitability === 'neutral'
      ? t('focus.neutral')
      : suitability === 'high'
        ? t('focus.suitHigh', { pct })
        : suitability === 'mid'
          ? t('focus.suitMid', { pct })
          : t('focus.suitLow', { pct });

    return {
      focus,
      title: t(`focus.${focus}` as Parameters<typeof t>[0]),
      effect,
      suitLine,
      suitability,
      aptitude: aptitude[focus],
      isCurrent: focus === current,
      isBest: focus === best && aptitude[best] > 0.5,
    };
  });
}
