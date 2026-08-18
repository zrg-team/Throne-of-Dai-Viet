import { bankLegacy, computeRunScore, getLegacy } from '../../state/legacy';
import { findPowerCard } from '../../data/ascentCards';
import { applyCourtEffect } from '../PoliticsSystem';
import { unlockHero } from '../../state/codex';
import { drainAscentPrompts, enqueueAscentPrompt } from './AscentState';
import { rerollPowerDraft, skipPowerDraft, takePowerCard } from './PowerDraftSystem';
import {
  buildConquestTarget,
  executeConquestMethod,
  holdConquest,
  methodHasActor,
} from './ConquestSystem';
import { applyAppointment, offerAppointment, resolveLawChoice, resolveParliament } from './CourtLaneSystem';
import { resolveDoctrine } from './RealmDoctrineSystem';
import { resolveEnvoy } from './EnvoySystem';
import { resolveFamine } from './FamineSystem';
import { resolveRivalDemand } from './RivalDirector';
import { resolveStoryBeat } from '../story/StorySystem';
import { passHeroSummon, recruitSummonedHero } from './SummonSystem';
import { resolveEmpireResponse } from './WaveDirector';
import { startPromptCooldown } from './DecisionDirector';
import { applyFoundingGift } from '../../state/GameState';
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
    case 'mandate': {
      // The same call `takePowerCard` makes. No `pendingLevelUps` to spend and no ambition to
      // charge: this one is the reign's dowry, not a reward the run had to earn.
      const card = findPowerCard(choiceId);
      if (card) {
        applyCourtEffect(state, `boon:${card.id}:1`, card.levels[0].effect);
        ascent.cardStacks[card.id] = (ascent.cardStacks[card.id] ?? 0) + 1;
      }
      handled = true;
      break;
    }

    case 'founder': {
      const hero = state.heroDeck.find((candidate) => candidate.id === choiceId);
      if (hero) {
        state.heroDeck = state.heroDeck.filter((candidate) => candidate.id !== hero.id);
        state.heroes.push(hero);
        unlockHero(hero.id);
        ascent.heroesSummoned += 1;
        ascent.founderHeroId = hero.id;
        // What they bring: a district, a host, a treasury or the country's goodwill, by office.
        applyFoundingGift(state, hero);
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
      //
      // Unless there is only one way in. A sheet listing a single legal method and a Back button
      // is a confirmation dialog wearing a decision's clothes — it costs the player a second tap
      // to be told what was already settled. Those go straight through; every province that
      // genuinely admits a choice still asks.
      const land = findLand(state, choiceId);
      if (land) {
        const target = buildConquestTarget(state, land);
        const open = target.methods.filter((method) => !method.blockedReason);
        // Falls through to the sheet if the direct attempt is refused, rather than reporting
        // the prompt unhandled — an unhandled prompt is never cleared, so the run would sit on
        // a modal the player cannot dismiss.
        if (open.length === 1 && !methodHasActor(open[0].method)) {
          const attempt = executeConquestMethod(state, target.landId, open[0].method);
          if (attempt.attempted) {
            // Refused, so the sheet the fast path skipped is exactly where the player needs to
            // be: it says what happened and offers the other ways in. Rebuilt from the world as
            // it stands *after* the attempt — the gold is spent, so the options have changed.
            if (!attempt.ok) {
              enqueueAscentPrompt(state, {
                kind: 'conquer-method',
                target: buildConquestTarget(state, land),
                notice: attempt.reason,
              });
            }
            handled = true;
            break;
          }
        }
        enqueueAscentPrompt(state, { kind: 'conquer-method', target });
        handled = true;
      }
      break;
    }

    case 'conquer-method': {
      if (choiceId === 'back') {
        handled = true;
        break;
      }
      // "method", or "method:actorId", or "method:actorId:force" — the sheet's picker names who
      // carries the method out; a bare method (the harness, the fast path) leaves it to the sheet.
      const [methodId, actorId, flag] = choiceId.split(':');
      const method = methodId as AscentConquestMethod;
      const actor = actorId
        ? method === 'diplomacy'
          ? { heroId: actorId, force: flag === 'force' }
          : { armyId: actorId, force: flag === 'force' }
        : undefined;
      const attempt = executeConquestMethod(state, prompt.target.landId, method, actor);
      handled = attempt.attempted;
      // An attempt that was made and refused still answers the prompt — the gold is gone either
      // way — but it must not vanish. Re-raise the sheet against the world as it now stands,
      // carrying the reason, so the player learns what their tap bought them.
      if (attempt.attempted && !attempt.ok) {
        const land = findLand(state, prompt.target.landId);
        if (land) {
          enqueueAscentPrompt(state, {
            kind: 'conquer-method',
            target: buildConquestTarget(state, land),
            notice: attempt.reason,
          });
        }
      }
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

    case 'doctrine': {
      handled = resolveDoctrine(state, choiceId);
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

    case 'famine': {
      handled = resolveFamine(state, choiceId);
      break;
    }

    case 'rival-demand': {
      handled = resolveRivalDemand(state, prompt.demand, prompt.kingdomId, choiceId);
      break;
    }

    case 'story-beat': {
      handled = resolveStoryBeat(state, prompt.storyId, prompt.fragmentId, choiceId);
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
  // Read before banking: `bankLegacy` raises `bestScore` to this run's, so asking afterwards
  // would always report the player as having tied their own record.
  const previousBest = getLegacy().bestScore;
  const legacyEarned = bankLegacy(state, false);

  state.pendingAscentPrompt = {
    kind: 'run-over',
    score,
    legacyEarned,
    cause: ascent.endCause ?? 'annihilated',
    landName: ascent.endLandName,
    previousBest,
    legacyTotal: getLegacy().points,
  };
  state.isPaused = true;
}
