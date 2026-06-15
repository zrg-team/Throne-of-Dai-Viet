import { applyResourceDelta } from './ResourceSystem';
import { getCourtBonuses } from './CourtSystem';
import type { GameState } from '../state/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Picks the next court card, weighting crises higher when stability is low and biasing toward seated heroes' favored card types. */
export function drawPoliticsCard(state: GameState): void {
  if (state.activePoliticsCard || state.pendingCourtRequest || state.politicsDeck.length === 0) {
    return;
  }

  const weights = state.politicsDeck.map((card) => {
    let weight = 1;

    if (card.type === 'crisis' && state.court.stability < 35) {
      weight *= 2.5;
    }

    for (const heroId of Object.values(state.court.seats)) {
      const hero = state.heroes.find((candidate) => candidate.id === heroId);
      if (hero?.cardBias === card.type) {
        weight *= 1.5;
      }
    }

    return weight;
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * totalWeight;
  let index = 0;
  for (; index < weights.length - 1; index += 1) {
    roll -= weights[index];
    if (roll <= 0) {
      break;
    }
  }

  const card = state.politicsDeck[index];
  state.pendingCourtRequest = card;
  state.message = `Court requests attention: ${card.title}`;
}

/** Decrements the court card cooldown each economy tick, drawing a new card and resetting the cooldown once it elapses. */
export function progressPoliticsCooldown(state: GameState): void {
  if (state.activePoliticsCard || state.pendingCourtRequest) {
    return;
  }

  state.court.cardCooldown -= 1;
  if (state.court.cardCooldown > 0) {
    return;
  }

  drawPoliticsCard(state);
  const bonuses = getCourtBonuses(state);
  state.court.cardCooldown = Math.max(2, Math.round(3 / bonuses.cardFrequencyMult));
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

  if (typeof choice.effects.stability === 'number') {
    state.court.stability = clamp(state.court.stability + choice.effects.stability, 0, 100);
  }
  if (typeof choice.effects.influence === 'number') {
    state.court.influence = clamp(state.court.influence + choice.effects.influence, 0, 100);
  }

  state.politicsDeck = state.politicsDeck.filter((candidate) => candidate.id !== card.id);
  state.activePoliticsCard = undefined;
  state.isPaused = false;
  state.message = `${choice.label}: ${choice.description}`;
  return true;
}
