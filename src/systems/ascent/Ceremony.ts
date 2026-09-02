import { computeRunScore, getLegacy } from '../../state/legacy';
import { founderOptionCount, getDynasty, rollTraitOffer } from '../../state/dynasty';
import { findPowerCard } from '../../data/ascentCards';
import type { AscentRarity, GameState } from '../../state/types';

const RARITY_RANK: Record<AscentRarity, number> = { jade: 3, gold: 2, silver: 1, bronze: 0 };

/**
 * The cards the bind step fans out: cards this run actually played, best first.
 *
 * Best-rarity-then-deepest rather than random, because the step is a *memory*, not a pull —
 * the jade the run forged should be on the table every time, and which of the three to keep
 * is the decision. At most three, like every hand in the mode.
 */
export function bindOfferCards(state: GameState): string[] {
  const ascent = state.ascent;
  if (!ascent) return [];
  return Object.entries(ascent.cardStacks)
    .filter(([id, stacks]) => stacks > 0 && findPowerCard(id))
    .sort(([aId, aStacks], [bId, bStacks]) => {
      const a = findPowerCard(aId);
      const b = findPowerCard(bId);
      return (RARITY_RANK[b?.rarity ?? 'bronze'] - RARITY_RANK[a?.rarity ?? 'bronze'])
        || (bStacks - aStacks);
    })
    .slice(0, 3)
    .map(([id]) => id);
}

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

  // Bind a seal — the run's memory becomes property. Skipped without a card raised when the
  // reign played nothing: a modal with an empty fan is a modal the player cannot answer.
  if (ascent.ceremonyStage !== 'bind' && ascent.ceremonyStage !== 'reign' && ascent.ceremonyStage !== 'done') {
    const options = bindOfferCards(state);
    if (options.length > 0) {
      ascent.ceremonyStage = 'bind';
      state.pendingAscentPrompt = { kind: 'bind-card', options };
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
