/**
 * The monsoon, and what it does to a province that lives on a river.
 *
 * Water in this realm is not a bonus with no downside — the same river that feeds a province also
 * drowns it. Flood control and irrigation were the throne's core administrative problem for
 * centuries, and the dike system was consolidated in the mid-13th century precisely because the
 * Red River kept taking the harvest and threatening the citadel.
 *
 * Three rules, hung off the season turn:
 *
 *  - **Flood.** Summer, on an undiked river province. Costs a third of the year's grain and some
 *    of its people.
 *  - **Silt.** A flood leaves the soil richer than it found it. This is the compensation that makes
 *    the flood a trade rather than a tax, and it is why a diked delta slowly loses its fertility.
 *  - **Drought.** Winter, on cropped ground with no lake and no dike-fed canal to hold water
 *    through the dry months.
 *
 * The dike is deliberately *not* a straight upgrade: it stops the flood and stops the silt, and it
 * is paid for in people rather than only in gold, because corvée labour was the real price of
 * keeping the dikes standing.
 */
import { PLAYER_KINGDOM_ID } from '../game/constants';
import { t } from '../i18n';
import { logEvent } from './empire/notifications';
import type { GameState, Land } from '../state/types';

/** How much of a year's grain a flood takes. */
const FLOOD_FOOD_LOSS = 0.35;
/** Share of a province's people a flood costs. */
const FLOOD_POPULATION_LOSS = 0.02;
/** Stability the realm loses when a province of its floods. */
const FLOOD_STABILITY_LOSS = 6;
/** Irrigation a flood leaves behind in silt, and the ceiling that gift can reach. */
const SILT_GAIN = 0.1;
const SILT_CAP = 0.3;
/** How much of a season's grain a drought takes. */
const DROUGHT_FOOD_LOSS = 0.2;

/** Does this province keep a dike? */
export function hasDike(land: Land): boolean {
  return land.buildings.some((building) => building.type === 'dike');
}

/**
 * Chance this province floods in a given summer.
 *
 * Scales with how much river it holds, because a province straddling a broad lower course is
 * exposed in a way a headwater village is not. Capped so no ground is a coin flip every year.
 */
export function floodRisk(land: Land): number {
  // Read straight off the province rather than through `getWaterProfile`: `ResourceSystem` imports
  // this module for the weather terms, and importing it back would close a cycle for one number
  // that is already a field here.
  const riverHexes = land.waterKinds.river;
  if (riverHexes <= 0 || hasDike(land)) {
    return 0;
  }
  return Math.min(0.45, 0.15 + 0.05 * riverHexes);
}

/** Is this province exposed to the dry season? */
export function droughtRisk(land: Land): boolean {
  const ts = land.terrainSummary;
  if (ts.riceFields + ts.fields <= 0) {
    return false;
  }
  // A lake is a reservoir and a dike feeds a canal; either one carries the crop through.
  return land.waterKinds.lake === 0 && !hasDike(land);
}

/**
 * Runs the season's water. Call on a season turn, after the calendar has advanced.
 *
 * Only the player's own provinces report; the rest are simulated silently, so a realm of forty
 * districts does not bury the notification log every summer.
 */
export function tickHydrology(state: GameState): void {
  const summer = state.season === 'Summer';
  const winter = state.season === 'Winter';
  if (!summer && !winter) {
    return;
  }

  for (const land of state.lands) {
    const owned = land.ownerId === PLAYER_KINGDOM_ID;

    if (summer) {
      const risk = floodRisk(land);
      if (risk > 0 && Math.random() < risk) {
        land.floodedUntilYear = state.year + 1;
        land.population = Math.max(0, Math.round(land.population * (1 - FLOOD_POPULATION_LOSS)));
        // The river takes the harvest and leaves the soil. Both halves are the same event.
        land.silt = Math.min(SILT_CAP, (land.silt ?? 0) + SILT_GAIN);
        if (owned) {
          state.court.stability = Math.max(0, Math.min(100, state.court.stability - FLOOD_STABILITY_LOSS));
          logEvent(state, t('msg.flood', { land: land.name }), 'threat');
        }
      }
      continue;
    }

    if (droughtRisk(land)) {
      land.droughtUntilTurn = state.turn + 2;
      if (owned) {
        logEvent(state, t('msg.drought', { land: land.name }), 'threat');
      }
    }
  }
}

/**
 * The standing multiplier a province's grain carries from the weather.
 *
 * Read by `calculateLandOutputs` rather than applied as a one-off delta, so a flooded province
 * stays visibly poorer for the year instead of taking an invisible hit the player cannot trace.
 */
export function weatherFoodMult(state: GameState, land: Land): number {
  let mult = 1;
  if (land.floodedUntilYear !== undefined && state.year < land.floodedUntilYear) {
    mult *= 1 - FLOOD_FOOD_LOSS;
  }
  if (land.droughtUntilTurn !== undefined && state.turn < land.droughtUntilTurn) {
    mult *= 1 - DROUGHT_FOOD_LOSS;
  }
  return mult;
}

/**
 * Silt the province is still living off.
 *
 * A dike removes it along with the flood: that is the trade the whole mechanic exists for, and it
 * is what actually happened — the Red River's diked bed rose above the plain behind it while the
 * fields it once renewed no longer got their annual coat.
 */
export function siltBonus(land: Land): number {
  return hasDike(land) ? 0 : land.silt ?? 0;
}
