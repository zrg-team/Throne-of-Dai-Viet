import { checkVictory, progressAcquisitions, refreshPlayerVisibility } from './LandSystem';
import { collectPlayerIncome, progressBuildOrders } from './ResourceSystem';
import { runBotTurns } from './BotSystem';
import type { GameState, Season } from '../state/types';

const seasons: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

export function advanceRealtimeMonth(state: GameState): void {
  if (state.victory) {
    return;
  }

  collectPlayerIncome(state);
  const acquisitionCompleted = progressAcquisitions(state);
  const buildCompleted = progressBuildOrders(state);

  for (const army of state.armies) {
    army.hasMoved = false;
  }

  state.turn += 1;
  const nextSeasonIndex = seasons.indexOf(state.season) + 1;

  if (nextSeasonIndex >= seasons.length) {
    state.season = seasons[0];
    state.year += 1;
  } else {
    state.season = seasons[nextSeasonIndex];
  }

  state.ordersRemaining = 3;
  if (!acquisitionCompleted && !buildCompleted) {
    state.message = `Economy tick: Year ${state.year}, ${state.season}. Expand, build, and prepare for the rival capital.`;
  }

  runBotTurns(state);
  refreshPlayerVisibility(state);
  checkVictory(state);
}
