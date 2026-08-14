import type { GameState, Season } from '../state/types';

/**
 * The calendar, shared by both tick loops.
 *
 * Classic and Dragon Ascent each used to carry their own four-line copy of this, which was fine
 * while a season *was* a tick. It stopped being fine the moment the two needed to agree on how many
 * ticks a season is worth: a divisor that lives in two places is a divisor that will eventually be
 * two different numbers.
 */

const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

/**
 * Economy ticks a season lasts.
 *
 * A season used to be exactly one tick — 3.5 s in ascent — which is not long enough to *be* a
 * season. The map's look now turns with the calendar rather than sitting under a coloured filter,
 * and a picture that redraws itself every three and a half seconds reads as flicker, not as weather.
 *
 * Raising the tick interval instead would have been the wrong lever: it slows the economy, the
 * marches, the sieges and the wave clock along with the calendar. This slows only the calendar.
 */
export const SEASON_TICKS = 2;

/** Seasons to the year. Also the tick period the great powers keep — see `greatPowersDue`. */
export const SEASONS_PER_YEAR = 4;

export interface CalendarTurn {
  /** The season changed on this tick. The map's scenery is re-baked when it does. */
  seasonTurned: boolean;
  /** The year rolled over on this tick. Display only — see `greatPowersDue` for the pacing. */
  yearTurned: boolean;
}

/** Advances the calendar by one economy tick. Call after `state.turn` has been incremented. */
export function advanceSeasonClock(state: GameState): CalendarTurn {
  const held = (state.seasonTick ?? 0) + 1;
  if (held < SEASON_TICKS) {
    state.seasonTick = held;
    return { seasonTurned: false, yearTurned: false };
  }

  state.seasonTick = 0;
  const next = SEASONS.indexOf(state.season) + 1;
  if (next >= SEASONS.length) {
    state.season = SEASONS[0];
    state.year += 1;
    return { seasonTurned: true, yearTurned: true };
  }
  state.season = SEASONS[next];
  return { seasonTurned: true, yearTurned: false };
}

/**
 * Whether the rival empires take their yearly turn on this tick.
 *
 * Keyed on the tick count rather than on `yearTurned`, deliberately. A year is now
 * `SEASONS_PER_YEAR * SEASON_TICKS` ticks, so hanging the great powers off the year rollover would
 * have halved how often they arm, destabilise and collapse — a pacing change smuggled in by a
 * rendering fix. They keep the cadence they were tuned at.
 */
export function greatPowersDue(state: GameState): boolean {
  return state.turn > 0 && state.turn % SEASONS_PER_YEAR === 0;
}
