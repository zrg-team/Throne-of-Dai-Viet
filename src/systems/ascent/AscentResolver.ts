import { bankLegacy, computeRunScore, getLegacy } from '../../state/legacy';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { resolveWorldEvent } from './WorldEventSystem';
import { findPowerCard } from '../../data/ascentCards';
import { applyCourtEffect } from '../PoliticsSystem';
import { fireHeroArrival } from './ArrivalSystem';
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
import { resolveDecreeOffer } from '../decree/OfferSystem';
import { reignName, reignSummary } from '../decree/SchoolSystem';
import { resolveDoctrine } from './RealmDoctrineSystem';
import { resolveEnvoy } from './EnvoySystem';
import { resolveProvinceOrder } from './ProvinceOrderSystem';
import { resolveFamine } from './FamineSystem';
import { raiseHostWithPlan } from './MusterSystem';
import { CLAIM_DECLINE_TICKS, MUSTER_DECLINE_TICKS } from '../../game/ascentConfig';
import { pushToast } from '../empire/notifications';
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

  // The card leaves the screen the moment it is answered, not at the end of the dispatch.
  //
  // `enqueueAscentPrompt` refuses a superseded kind that is *already on screen* — the player is
  // reading it and it must not be swapped under their hand. While the answered card still sat in
  // `pendingAscentPrompt`, that guard also swallowed every re-raise a handler makes against its
  // own kind, and `conquer-method` is one: a refused bribe spends the gold, builds the reason,
  // and asks for the sheet back with the refusal banner on it. That ask was dropped on the floor
  // — the sheet closed, the treasury was lighter, and the mode said nothing, which from the
  // throne is indistinguishable from a tap that never registered. Measured on seed 20260824:
  // `conquestPlans` recorded `status: 'blocked'` with the nobles' refusal in `reason`, and the
  // prompt queue was empty.
  //
  // Restored below if nothing handled the choice, because a prompt whose resolver returns false
  // has to stay up — see the note in `resolveDoctrine` about what an unclearable card costs.
  state.pendingAscentPrompt = undefined;

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
        fireHeroArrival(state, hero);
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
        // Leaving the sheet without taking the province is an answer, and the court has to hear
        // it: routine expansion raises this same sheet on its own initiative, so without a
        // cooldown "not this one" would be met by the same proposal a season or two later.
        ascent.claimDeclinedUntil = state.turn + CLAIM_DECLINE_TICKS;
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
      // An attempt that was made and refused still answers the prompt — the gold is gone either
      // way — but it must not vanish. Re-raise the sheet against the world as it now stands,
      // carrying the reason, so the player learns what their tap bought them.
      //
      // **Once per reason, though.** The re-raise is only worth making when it tells the player
      // something they have not just been told: a refusal that changes nothing about the world
      // rebuilds the identical sheet, and a player pressing the same row again gets it back for
      // ever with the run's clock stopped the whole time — measured at 58 re-raises inside one
      // tick before the sheet stopped offering hosts that would refuse. The notice already on
      // screen is the record of having said it, so matching it is the end of the exchange: the
      // reason stands in `state.message`, and the lane's own cadence will offer the province
      // again when something has actually moved.
      if (attempt.attempted && !attempt.ok && attempt.reason !== prompt.notice) {
        const land = findLand(state, prompt.target.landId);
        if (land) {
          enqueueAscentPrompt(state, {
            kind: 'conquer-method',
            target: buildConquestTarget(state, land),
            notice: attempt.reason,
          });
        }
      }
      // **A method that could not even be attempted still closes the card.**
      //
      // `handled = attempt.attempted` alone deadlocks the run. The sheet carries a *snapshot* of
      // the methods; `executeConquestMethod` re-reads them from `buildMethodOptions` and refuses
      // outright — `attempted: false` — when the chosen one is no longer open, which happens
      // whenever the province changes hands, is claimed, or the purse moves while the card
      // stands. An unhandled prompt is put straight back by the dispatcher, the stale snapshot
      // still lists that method as open, and the same choice is refused for ever. Reproduced
      // from a full run: `stuckPrompts: ['conquer-method']`, and every card queued behind it —
      // the Power Draft included — never fired again for the rest of that run.
      //
      // Nothing is re-raised in that case, deliberately. The refusal above re-raises because the
      // player *spent* something and is owed the reason; this one costs nothing, and the routine
      // claim cadence will offer the province again on its own if it is still worth having.
      // Re-raising here instead put a second sheet up on the very next tick, which is the
      // back-to-back pacing the mode is explicit about not doing.
      handled = true;
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

    case 'decree-offer': {
      handled = resolveDecreeOffer(state, choiceId, prompt);
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

    case 'world-event': {
      handled = resolveWorldEvent(
        state, prompt.eventId, prompt.kingdomId, prompt.otherKingdomId, choiceId,
      );
      break;
    }

    case 'province-order': {
      handled = resolveProvinceOrder(state, prompt.landId, choiceId);
      break;
    }

    case 'famine': {
      handled = resolveFamine(state, choiceId);
      break;
    }

    case 'muster-proposal': {
      // Accepting runs the plan on the card; a muster that can no longer be afforded (the world
      // moved while the card stood) says why rather than failing silently. Adjusting closes the
      // card and leaves the plan to the raise form — the screen hands it over — with a short
      // silence so the autopilot does not propose again while the form is open. Declining is
      // the long silence.
      if (choiceId === 'accept') {
        const result = raiseHostWithPlan(state, prompt.plan);
        if (!result.ok && result.reason) pushToast(state, result.reason, 'threat');
        if (result.ok) ascent.autopilotStats.recruits += 1;
        ascent.musterDeclinedUntil = state.turn + (result.ok ? 0 : 4);
      } else if (choiceId === 'adjust') {
        ascent.musterDeclinedUntil = state.turn + 4;
      } else {
        ascent.musterDeclinedUntil = state.turn + MUSTER_DECLINE_TICKS;
      }
      handled = true;
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

    case 'host-lost': {
      // Nothing to decide — the host is already gone. Acknowledging clears it.
      handled = true;
      break;
    }

    case 'run-over': {
      // Terminal: the scene takes over from here (summary screen → menu).
      return true;
    }
  }

  if (!handled) {
    // **A card that cannot be answered is dropped rather than left standing for ever.**
    //
    // Re-arming an unhandled prompt is the right default — a refused bribe must not read as a tap
    // that never registered — but on its own it is also an unbounded loop, and it has produced a
    // hung run three times now: `conquer-method` against a province that changed hands, `envoy`
    // against an empty treasury, and a prompt kind whose answerer did not know it. In every case
    // the queue behind it stopped for the rest of the run, so the failure is never local: the
    // Power Draft, the appointments and the law cards all go silent together.
    //
    // Three refusals of the *same* card is past the point where re-asking can be the right answer,
    // so it is dropped, counted, and the run goes on. The counter is keyed by kind, cleared on any
    // success, and small enough that a legitimate re-ask — the refusal sheet, which re-raises with
    // a notice — is never touched by it.
    ascent.promptRefusals ??= {};
    const refused = (ascent.promptRefusals[prompt.kind] ?? 0) + 1;
    ascent.promptRefusals[prompt.kind] = refused;
    if (refused >= 3) {
      ascent.promptRefusals[prompt.kind] = 0;
      drainAscentPrompts(state);
      return false;
    }
    // Nobody took the choice, so the card is still the live question — unless the dispatch put
    // something more urgent up on its way past, which is allowed to keep the slot.
    state.pendingAscentPrompt ??= prompt;
    return false;
  }

  if (ascent.promptRefusals) ascent.promptRefusals[prompt.kind] = 0;
  startPromptCooldown(state, prompt.kind);
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
    reign: reignName(state),
    reignDetail: reignSummary(state),
  };
  state.isPaused = true;
}
