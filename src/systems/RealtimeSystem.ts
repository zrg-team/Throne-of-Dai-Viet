import { createHeroDraft } from './HeroSystem';
import { drawPoliticsCard } from './PoliticsSystem';
import { checkVictory } from './LandSystem';
import { collectPlayerIncome, payPlayerUpkeep } from './ResourceSystem';
import { runBotTurns } from './BotSystem';
import type { GameState, Season } from '../state/types';

const seasons: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

export function advanceRealtimeMonth(state: GameState): void {
  if (state.victory) {
    return;
  }

  collectPlayerIncome(state);
  payPlayerUpkeep(state);

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

  if (state.turn % 5 === 0) {
    createHeroDraft(state);
  } else if (state.turn % 4 === 0) {
    drawPoliticsCard(state);
  } else {
    state.message = `Time passes: Year ${state.year}, ${state.season}.`;
  }

  runBotTurns(state);
  checkVictory(state);
}
