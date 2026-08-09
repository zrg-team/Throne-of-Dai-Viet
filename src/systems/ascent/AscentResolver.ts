import { bankLegacy, computeRunScore } from '../../state/legacy';
import { unlockHero } from '../../state/codex';
import { drainAscentPrompts, enqueueAscentPrompt } from './AscentState';
import { rerollPowerDraft, skipPowerDraft, takePowerCard } from './PowerDraftSystem';
import {
  buildConquestTarget,
  executeConquestMethod,
  holdConquest,
} from './ConquestSystem';
import { applyAppointment, offerAppointment, resolveLawChoice, resolveParliament } from './CourtLaneSystem';
import { resolveEnvoy } from './EnvoySystem';
import { passHeroSummon, recruitSummonedHero } from './SummonSystem';
import { resolveEmpireResponse } from './WaveDirector';
import { startPromptCooldown } from './DecisionDirector';
import { findLand } from '../LandSystem';
import type { AscentConquestMethod, GameState } from '../../state/types';

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
        // The founder is the run's first appointment too — it teaches the role card before
        // any of the systems that depend on understanding it come into play.
        offerAppointment(state, hero.id);
      }
      handled = true;
      break;
    }

    case 'power-draft': {
      handled = choiceId === 'skip' ? skipPowerDraft(state) >= 0 : takePowerCard(state, choiceId);
      break;
    }

    case 'conquer-target': {
      if (choiceId === 'hold') {
        holdConquest(state);
        handled = true;
        break;
      }
      // Choosing a province opens its method sheet rather than acting: *how* you take a
      // province is the decision this lane exists for.
      const land = findLand(state, choiceId);
      if (land) {
        enqueueAscentPrompt(state, { kind: 'conquer-method', target: buildConquestTarget(state, land) });
        handled = true;
      }
      break;
    }

    case 'conquer-method': {
      if (choiceId === 'back') {
        handled = true;
        break;
      }
      handled = executeConquestMethod(state, prompt.target.landId, choiceId as AscentConquestMethod);
      break;
    }

    case 'hero-choice': {
      if (choiceId === 'pass') {
        passHeroSummon(state, prompt.source);
        handled = true;
        break;
      }
      handled = recruitSummonedHero(state, choiceId, prompt.source);
      // Recruiting deliberately leaves the champion unposted; this is where they get a job.
      if (handled) offerAppointment(state, choiceId);
      break;
    }

    case 'court-appointment': {
      handled = applyAppointment(state, prompt.heroId, choiceId);
      break;
    }

    case 'law-choice': {
      handled = resolveLawChoice(state, choiceId);
      break;
    }

    case 'parliament': {
      handled = resolveParliament(state, prompt.cardId, choiceId);
      break;
    }

    case 'envoy': {
      handled = resolveEnvoy(state, prompt.kingdomId, choiceId);
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

  startPromptCooldown(state, prompt.kind);
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
