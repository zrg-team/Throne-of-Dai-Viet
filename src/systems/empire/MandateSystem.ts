import { MAX_BUILDING_LEVEL } from '../../game/gameplayConfig';
import type { EraId, GameState, MandateState } from '../../state/types';
import { t } from '../../i18n';
import { estateStanding, ESTATE_CRISIS } from '../DecreeSystem';
import { pushToast } from './notifications';
import { grantDeed } from '../../state/cabinet';
import { noteRubbing } from '../ascent/Inheritance';

/** Ordered eras and the cumulative Mandate points needed to enter each. */
export const ERA_ORDER: EraId[] = ['founding', 'rivalry', 'empires', 'mandate'];

interface EraConfig {
  id: EraId;
  threshold: number;
  /** Extra court seats granted on top of Communal Hall seats. */
  seatBonus: number;
  /** District building level cap while in this era. */
  buildingCap: number;
  /** Edict points granted on first reaching this era. */
  edictGrant: number;
}

// The building cap is itself a progression gate: districts can only be pushed toward
// their steep high levels as the empire advances through the eras, so upgrading always
// has a "not yet — reach the next era" horizon rather than being maxable from turn one.
const ERA_CONFIG: Record<EraId, EraConfig> = {
  founding: { id: 'founding', threshold: 0, seatBonus: 0, buildingCap: MAX_BUILDING_LEVEL - 3, edictGrant: 1 },
  rivalry: { id: 'rivalry', threshold: 32, seatBonus: 1, buildingCap: MAX_BUILDING_LEVEL - 2, edictGrant: 2 },
  empires: { id: 'empires', threshold: 92, seatBonus: 2, buildingCap: MAX_BUILDING_LEVEL - 1, edictGrant: 3 },
  mandate: { id: 'mandate', threshold: 190, seatBonus: 3, buildingCap: MAX_BUILDING_LEVEL, edictGrant: 4 },
};

export function createInitialMandate(): MandateState {
  return {
    points: 0,
    era: 'founding',
    edicts: [],
    edictPoints: ERA_CONFIG.founding.edictGrant,
    reachedEras: ['founding'],
    ascensionReady: false,
  };
}

/** Highest era whose threshold the given points meet. */
function eraForPoints(points: number): EraId {
  let result: EraId = 'founding';
  for (const era of ERA_ORDER) {
    if (points >= ERA_CONFIG[era].threshold) {
      result = era;
    }
  }
  return result;
}

export function eraIndex(era: EraId): number {
  return ERA_ORDER.indexOf(era);
}

export function eraLabel(era: EraId): string {
  return t(`empire.era.${era}` as Parameters<typeof t>[0]);
}

/** Extra court seats an empire-mode player has earned through their era. */
export function eraSeatBonus(state: GameState): number {
  const era = state.mandate?.era;
  return era ? ERA_CONFIG[era].seatBonus : 0;
}

/** District building level cap, raised by era in empire mode. */
export function getBuildingLevelCap(state: GameState): number {
  const era = state.mandate?.era;
  return era ? ERA_CONFIG[era].buildingCap : MAX_BUILDING_LEVEL;
}

/** Progress within the current era, for the always-visible HUD Mandate bar. */
export function eraProgress(state: GameState): {
  era: EraId;
  ratio: number;
  points: number;
  eraStart: number;
  nextThreshold: number;
  atMax: boolean;
} {
  const mandate = state.mandate;
  if (!mandate) {
    return { era: 'founding', ratio: 0, points: 0, eraStart: 0, nextThreshold: ERA_CONFIG.rivalry.threshold, atMax: false };
  }
  const idx = eraIndex(mandate.era);
  const eraStart = ERA_CONFIG[mandate.era].threshold;
  const next = ERA_ORDER[idx + 1];
  if (!next) {
    return { era: mandate.era, ratio: 1, points: mandate.points, eraStart, nextThreshold: eraStart, atMax: true };
  }
  const nextThreshold = ERA_CONFIG[next].threshold;
  const span = Math.max(1, nextThreshold - eraStart);
  const ratio = Math.min(1, Math.max(0, (mandate.points - eraStart) / span));
  return { era: mandate.era, ratio, points: mandate.points, eraStart, nextThreshold, atMax: false };
}

/** Points remaining until the next era, or 0 if already at the final era. */
export function pointsToNextEra(state: GameState): number {
  const mandate = state.mandate;
  if (!mandate) return 0;
  const idx = eraIndex(mandate.era);
  const next = ERA_ORDER[idx + 1];
  if (!next) return 0;
  return Math.max(0, ERA_CONFIG[next].threshold - mandate.points);
}

/**
 * Adds Mandate points and applies any era transitions that result. Era changes
 * grant edict points, raise the building cap / seat bonus (read lazily elsewhere),
 * and announce themselves via a milestone toast.
 */
export function addMandate(state: GameState, amount: number): void {
  const mandate = state.mandate;
  if (!mandate || amount <= 0) {
    return;
  }
  mandate.points += amount;

  const newEra = eraForPoints(mandate.points);
  if (eraIndex(newEra) > eraIndex(mandate.era)) {
    // Announce/grant for every era newly crossed (a big award can skip one).
    for (const era of ERA_ORDER) {
      if (eraIndex(era) <= eraIndex(newEra) && !mandate.reachedEras.includes(era)) {
        mandate.reachedEras.push(era);
        mandate.edictPoints += ERA_CONFIG[era].edictGrant;
        pushToast(state, t('empire.mandate.eraReached', { era: eraLabel(era) }), 'milestone');
        // The house remembers the era across runs: the two later ones each open a banner mark in
        // the Coronation. Deeds rather than a new store, and paid out here rather than at the
        // doctrine card, because this is the one place an era is *entered* — a big award can
        // cross two at once, and the loop above is already written to announce both.
        if (era === 'empires' && grantDeed('era-empires')) noteRubbing(state);
        if (era === 'mandate' && grantDeed('era-mandate')) noteRubbing(state);
      }
    }
    mandate.era = newEra;
  }

  if (mandate.era === 'mandate') {
    mandate.ascensionReady = true;
  }
}

/**
 * Grants edict points ("chiếu chỉ") outside of era jumps and announces it, so the
 * authority currency is an ongoing, earned reward for good play — completing epic
 * directives, raising Wonders — rather than a rare lump you get only at era changes.
 */
export function grantEdictPoints(state: GameState, amount: number): void {
  const mandate = state.mandate;
  if (!mandate || amount <= 0) return;
  // Sĩ at rock bottom stops the reform engine dead. Scholars are the office that drafts, copies
  // and files a decree; a court that has dishonoured them has nobody left to write with, and the
  // player has to repair that standing before they can legislate again. Deliberately a full stop
  // rather than a slowdown — a fractional trickle would read as a bug, not as a consequence.
  if (estateStanding(state, 'si') < ESTATE_CRISIS) {
    pushToast(state, t('decree.estate.angry', {
      estate: t('decree.estate.si'),
      effect: t('decree.estate.si.angry'),
    }), 'threat');
    return;
  }
  mandate.edictPoints += amount;
  pushToast(state, t('empire.mandate.edictEarned', { points: amount }), 'reward');
}
