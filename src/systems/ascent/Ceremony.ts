import { computeRunScore, getLegacy } from '../../state/legacy';
import { founderOptionCount, getDynasty, rollTraitOffer } from '../../state/dynasty';
import type { GameState } from '../../state/types';

/**
 * The ceremony a reign closes with.
 *
 * A chain of prompts on the **run-over path** — already terminal, already paused — walked in one
 * direction: the Reckoning that already existed, then the house growing, then what the next reign
 * opens holding. Phases 3 and 4 slot "bind a seal" and "swear a name" in between without anything
 * here being reordered, which is why the stage is a named string rather than a boolean.
 *
 * **Never routed through the decision director.** `advanceCeremony` writes `pendingAscentPrompt`
 * by hand instead of calling `enqueueAscentPrompt`, for two reasons that both bite: the director's
 * per-kind cooldowns and court-phase window can delay a card indefinitely, and `enqueue` hands
 * `run-over` the whole queue (it clears everything else on arrival), so a ceremony step queued
 * beside it would simply be deleted.
 */

/** Advances to the next ceremony step. Returns false when the ceremony is finished. */
export function advanceCeremony(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  const store = getDynasty();

  if (store.pendingPicks > 0) {
    const options = rollTraitOffer(store);
    // A pick with nothing left to offer is not a pick. Falls through to the closing screen rather
    // than raising a card with an empty body, which is a modal the player cannot answer.
    if (options.length > 0) {
      ascent.ceremonyStage = 'levels';
      state.pendingAscentPrompt = {
        kind: 'dynasty-level',
        level: store.level,
        score: computeRunScore(state),
        options,
        remaining: store.pendingPicks - 1,
      };
      state.isPaused = true;
      return true;
    }
  }

  if (ascent.ceremonyStage !== 'reign' && ascent.ceremonyStage !== 'done') {
    ascent.ceremonyStage = 'reign';
    state.pendingAscentPrompt = {
      kind: 'next-reign',
      founderCount: founderOptionCount(),
      traits: store.traits,
      level: store.level,
      codes: (getLegacy().codes ?? []).length,
    };
    state.isPaused = true;
    return true;
  }

  ascent.ceremonyStage = 'done';
  return false;
}
