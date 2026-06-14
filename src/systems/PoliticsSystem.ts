import { applyResourceDelta } from './ResourceSystem';
import type { GameState } from '../state/types';

export function drawPoliticsCard(state: GameState): void {
  if (state.activePoliticsCard || state.pendingCourtRequest || state.politicsDeck.length === 0) {
    return;
  }

  const card = state.politicsDeck[state.turn % state.politicsDeck.length];
  state.pendingCourtRequest = card;
  state.message = `Court requests attention: ${card.title}`;
}

export function choosePoliticsCard(state: GameState, choiceId: string): boolean {
  const card = state.activePoliticsCard;

  if (!card) {
    return false;
  }

  const choice = card.choices.find((candidate) => candidate.id === choiceId);

  if (!choice) {
    return false;
  }

  applyResourceDelta(state, choice.effects);
  state.politicsDeck = state.politicsDeck.filter((candidate) => candidate.id !== card.id);
  state.activePoliticsCard = undefined;
  state.isPaused = false;
  state.message = `${choice.label}: ${choice.description}`;
  return true;
}
