import { bankLegacy, computeRunScore } from '../../state/legacy';
import { unlockHero } from '../../state/codex';
import { drainAscentPrompts } from './AscentState';
import { rerollPowerDraft, skipPowerDraft, takePowerCard } from './PowerDraftSystem';
import { executeMarchOrder, holdMarchOrder } from './MarchOrderSystem';
import { passHeroSummon, recruitSummonedHero } from './SummonSystem';
import { resolveEmpireResponse } from './WaveDirector';
import type { GameState } from '../../state/types';

/**
 * The single entry point the UI calls to answer whatever prompt is open. One dispatcher
 * rather than one handler per modal keeps the pause/resume contract in one place.
 *
 * Note the ending: it re-drains the queue instead of blindly clearing `isPaused`. Every
 * other pausing system in this codebase unpauses unconditionally on resolve, which would
 * make the map flicker back to life for a frame between two chained prompts.
 */
export function resolveAscentPrompt(state: GameState, choiceId: string): boolean {
  const prompt = state.pendingAscentPrompt;
  const ascent = state.ascent;
  if (!prompt || !ascent) return false;

  let handled = false;

  switch (prompt.kind) {
    case 'founder': {
      const hero = state.heroDeck.find((candidate) => candidate.id === choiceId);
      if (hero) {
        state.heroDeck = state.heroDeck.filter((candidate) => candidate.id !== choiceId);
        state.heroes.push(hero);
        unlockHero(hero.id);
        ascent.heroesSummoned += 1;
      }
      handled = true;
      break;
    }

    case 'power-draft': {
      handled = choiceId === 'skip' ? skipPowerDraft(state) >= 0 : takePowerCard(state, choiceId);
      break;
    }

    case 'march-order': {
      if (choiceId === 'hold') {
        holdMarchOrder(state);
        handled = true;
      } else {
        handled = executeMarchOrder(state, choiceId);
      }
      break;
    }

    case 'hero-summon': {
      if (choiceId === 'pass') {
        passHeroSummon(state);
        handled = true;
      } else {
        handled = recruitSummonedHero(state, choiceId);
      }
      break;
    }

    case 'empire-response': {
      resolveEmpireResponse(state, prompt, choiceId);
      handled = true;
      break;
    }

    case 'wave-result': {
      handled = true;
      break;
    }

    case 'run-over': {
      // Terminal: the scene takes over from here (summary screen → menu).
      return true;
    }
  }

  if (!handled) return false;

  state.pendingAscentPrompt = undefined;
  drainAscentPrompts(state);
  return true;
}

/** Re-rolls the open Power Draft. Separate from `resolveAscentPrompt`: it does not close it. */
export function rerollAscentDraft(state: GameState): boolean {
  return rerollPowerDraft(state);
}

/**
 * Ends the run: banks Legacy once and raises the terminal prompt. Guarded by `legacyBanked`
 * so a re-entrant tick can never pay out twice.
 */
export function endAscentRun(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent || state.legacyBanked) return;

  state.legacyBanked = true;
  state.isDefeated = true;
  state.defeatReason = 'conquest';

  const score = computeRunScore(state);
  const legacyEarned = bankLegacy(state, false);

  state.pendingAscentPrompt = { kind: 'run-over', score, legacyEarned };
  state.isPaused = true;
}
