import {
  DRAFT_CARD_COUNT,
  REROLL_BASE_COST,
  REROLL_COST_MULT,
  XP_SKIP_REFUND_SHARE,
} from '../../game/ascentConfig';
import { findPowerCard, ROLLABLE_POWER_CARDS } from '../../data/ascentCards';
import { weightedPickIndex } from '../../utils/math';
import { applyCourtEffect } from '../PoliticsSystem';
import { applyResourceDelta, canSpend } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { addAscentXp, computeAscentPower } from './PowerSystem';
import { enqueueAscentPrompt } from './AscentState';
import { t } from '../../i18n';
import type { AscentState, CourtModifier, GameState, PowerCardDef } from '../../state/types';

/** Opening reroll price for a draft at this level. Doubles again on each use within it. */
export function rerollPriceFor(level: number): number {
  return Math.round(REROLL_BASE_COST * (1 + Math.max(0, level - 1) * 0.35));
}

/** How many times this card has been taken. */
export function cardStack(ascent: AscentState, cardId: string): number {
  return ascent.cardStacks[cardId] ?? 0;
}

function isMaxed(ascent: AscentState, card: PowerCardDef): boolean {
  return cardStack(ascent, card.id) >= card.maxStacks;
}

/**
 * True when this card's evolution partner is already maxed, so taking this one to max
 * completes the pair. Drives both the draft weighting and the card's badge.
 */
export function isEvolutionReady(ascent: AscentState, card: PowerCardDef): boolean {
  if (!card.evolvesWith || ascent.retiredCards.includes(card.id)) return false;
  const partner = findPowerCard(card.evolvesWith);
  if (!partner) return false;
  return cardStack(ascent, partner.id) >= partner.maxStacks;
}

/** Cards that could still be offered: not maxed, not retired by an evolution, requirements met. */
function eligibleCards(state: GameState, ascent: AscentState): PowerCardDef[] {
  return ROLLABLE_POWER_CARDS.filter((card) => {
    if (ascent.retiredCards.includes(card.id)) return false;
    if (isMaxed(ascent, card)) return false;
    if (card.requires && !card.requires(state)) return false;
    return true;
  });
}

/**
 * Rolls `DRAFT_CARD_COUNT` distinct cards, weighted by rarity.
 *
 * Rarity weights live on run state rather than in the data file so they can drift (a shrine
 * province nudges them up). Cards already in progress get a small bonus so the run tends to
 * deepen a build rather than scattering one-offs across everything.
 */
/**
 * How much more likely a card is to be offered again, given how deep the player is already in it.
 *
 * A flat 2.2× for anything with at least one stack was applied *forever*, so the first few cards
 * a run happened to take crowded out the rest of the pool for the remainder of it: measured, a
 * full run built a deck of only five distinct powers however many drafts it saw. The pull toward
 * a coherent build is right — scattering one-offs across everything is worse — but it has to
 * taper, or the deck stops being a choice after the third draft.
 *
 * Peaks at the second copy, where committing actually matters, then falls away; a card already
 * three deep is nearly maxed and is pushed *down* so something new can appear beside it.
 */
function focusBonus(stacks: number): number {
  if (stacks <= 0) return 1;
  if (stacks === 1) return 2.2;
  if (stacks === 2) return 1.3;
  return 0.6;
}

export function rollPowerDraftCards(state: GameState): string[] {
  const ascent = state.ascent;
  if (!ascent) return [];

  const pool = eligibleCards(state, ascent);
  const picks: string[] = [];

  // A completable evolution is *guaranteed* a slot rather than merely weighted. Evolutions
  // are meant to be the run's landmarks; leaving the final piece to a dice roll meant they
  // almost never fired, and a payoff the player can see coming but never reach is worse
  // than none at all.
  const ready = pool.find((card) => isEvolutionReady(ascent, card));
  if (ready) picks.push(ready.id);

  while (picks.length < DRAFT_CARD_COUNT && picks.length < pool.length) {
    const candidates = pool.filter((card) => !picks.includes(card.id));
    const index = weightedPickIndex(
      candidates.map((card) => {
        const rarityWeight = ascent.draftWeights[card.rarity] ?? 1;
        return rarityWeight * (card.weight ?? 1) * focusBonus(cardStack(ascent, card.id));
      }),
    );
    if (index < 0) break;
    picks.push(candidates[index].id);
  }

  return picks;
}

/** Opens a Power Draft for one banked level-up. */
export function offerPowerDraft(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent || ascent.pendingLevelUps <= 0) return;

  const cards = rollPowerDraftCards(state);
  if (cards.length === 0) {
    // Everything is maxed — convert the level into momentum rather than stalling the run.
    ascent.pendingLevelUps -= 1;
    addAscentXp(state, Math.round(ascent.xpToNext * XP_SKIP_REFUND_SHARE));
    return;
  }

  // Priced off the run's progress, not flat: gold income compounds steeply, and a fixed
  // 40g reroll is free money by the time the realm holds a dozen provinces.
  ascent.rerollCost = rerollPriceFor(ascent.level);
  enqueueAscentPrompt(state, {
    kind: 'power-draft',
    cards,
    rerollCost: ascent.rerollCost,
    level: ascent.level,
  });
}

/** Re-rolls the open draft for gold. The price doubles each time within the same draft. */
export function rerollPowerDraft(state: GameState): boolean {
  const ascent = state.ascent;
  const prompt = state.pendingAscentPrompt;
  if (!ascent || prompt?.kind !== 'power-draft') return false;

  const cost = { gold: ascent.rerollCost };
  if (!canSpend(state, cost)) return false;

  applyResourceDelta(state, { gold: -ascent.rerollCost });
  ascent.rerollCost = Math.round(ascent.rerollCost * REROLL_COST_MULT);

  const cards = rollPowerDraftCards(state);
  if (cards.length > 0) {
    prompt.cards = cards;
  }
  prompt.rerollCost = ascent.rerollCost;
  return true;
}

/**
 * When both parents of an evolution are maxed, retire them and grant the unique result.
 * Retirement filters the parents' modifiers out by their `asc:<id>:` label prefix — the
 * reason takes are labelled machine-readably rather than with a display name.
 */
function maybeEvolve(state: GameState, ascent: AscentState, taken: PowerCardDef): void {
  if (!taken.evolvesWith || !taken.evolvesInto) return;

  const partner = findPowerCard(taken.evolvesWith);
  const result = findPowerCard(taken.evolvesInto);
  if (!partner || !result) return;
  if (!isMaxed(ascent, taken) || !isMaxed(ascent, partner)) return;
  if (ascent.retiredCards.includes(taken.id) || ascent.retiredCards.includes(partner.id)) return;

  state.activeCourtModifiers = state.activeCourtModifiers.filter(
    (modifier) =>
      !modifier.label.startsWith(`asc:${taken.id}:`) && !modifier.label.startsWith(`asc:${partner.id}:`),
  );
  ascent.retiredCards.push(taken.id, partner.id);

  applyPowerCardEffect(state, result, 0);
  ascent.cardStacks[result.id] = 1;

  // pushToast already records the event in the persistent log.
  const name = t(`ascent.card.${result.id}` as Parameters<typeof t>[0]);
  pushToast(state, t('ascent.draft.evolved', { name }), 'reward');
}

function applyPowerCardEffect(state: GameState, card: PowerCardDef, stackIndex: number): void {
  const level = card.levels[Math.min(stackIndex, card.levels.length - 1)];
  applyCourtEffect(state, `asc:${card.id}:${stackIndex + 1}`, level.effect);
}

/**
 * Takes a card: applies its payload, bumps the stack counter, checks for an evolution, and
 * consumes one banked level-up. Every take pushes a *new* permanent modifier, which is what
 * makes stacking work without any bespoke machinery.
 */
export function takePowerCard(state: GameState, cardId: string): boolean {
  const ascent = state.ascent;
  const card = findPowerCard(cardId);
  if (!ascent || !card) return false;

  const stack = cardStack(ascent, cardId);
  if (stack >= card.maxStacks) return false;

  applyPowerCardEffect(state, card, stack);
  ascent.cardStacks[cardId] = stack + 1;
  ascent.pendingLevelUps = Math.max(0, ascent.pendingLevelUps - 1);
  ascent.rerollCost = rerollPriceFor(ascent.level);

  maybeEvolve(state, ascent, card);
  return true;
}

/** Declines the draft in exchange for momentum toward the next one. */
export function skipPowerDraft(state: GameState): number {
  const ascent = state.ascent;
  if (!ascent) return 0;

  const refund = Math.round(ascent.xpToNext * XP_SKIP_REFUND_SHARE);
  ascent.pendingLevelUps = Math.max(0, ascent.pendingLevelUps - 1);
  ascent.rerollCost = rerollPriceFor(ascent.level);
  addAscentXp(state, refund);
  return refund;
}

/** Momentum a skip would refund, for the button label. */
export function skipRefundAmount(state: GameState): number {
  return Math.round((state.ascent?.xpToNext ?? 0) * XP_SKIP_REFUND_SHARE);
}

/**
 * How much POWER this card would actually add, as a percentage.
 *
 * Measured, not guessed: the card's modifier is pushed onto the live modifier list, POWER is
 * recomputed, and the modifier is popped straight back off. That is what lets the card
 * promise "▲ POWER +7%" and have the HUD then move by that much — the honesty of that badge
 * is the thing that makes the draft feel like it matters.
 */
export function estimatePowerGainPct(state: GameState, card: PowerCardDef, stackIndex: number): number {
  const before = computeAscentPower(state);
  if (before <= 0) return 0;

  const level = card.levels[Math.min(stackIndex, card.levels.length - 1)];
  const preview: CourtModifier = { id: 'ascent-preview', label: 'ascent-preview', ...level.effect };

  state.activeCourtModifiers.push(preview);
  let after = computeAscentPower(state);
  state.activeCourtModifiers.pop();

  // Income modifiers only reach `resourceRates` after a real apply refreshes land outputs,
  // and `defenseBoost` is a one-shot grant rather than a modifier, so both are folded in by
  // hand using the same weights `computeAscentPower` uses.
  const rates = level.effect.resourceRateModifier;
  if (rates) {
    after += ((rates.gold ?? 0) * 3 + (rates.food ?? 0) * 1.5 + (rates.supplies ?? 0) * 3) * 1.5;
  }
  if (level.effect.defenseBoost) {
    after += level.effect.defenseBoost * 16 * 0.6;
  }

  return Math.max(0, Math.round(((after - before) / before) * 100));
}

export interface PowerCardView {
  id: string;
  rarity: PowerCardDef['rarity'];
  name: string;
  description: string;
  /** "NEW", "II → III", or "MAX". */
  stackLabel: string;
  stackCount: string;
  powerGainPct: number;
  maxed: boolean;
  /** Taking this to max completes an evolution — called out on the card. */
  evolutionReady: boolean;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

/** Everything the draft panel needs to render one card, with the numbers already resolved. */
export function powerCardView(state: GameState, cardId: string): PowerCardView | undefined {
  const ascent = state.ascent;
  const card = findPowerCard(cardId);
  if (!ascent || !card) return undefined;

  const stack = cardStack(ascent, cardId);
  const level = card.levels[Math.min(stack, card.levels.length - 1)];
  const maxed = stack >= card.maxStacks;

  return {
    id: card.id,
    rarity: card.rarity,
    name: t(`ascent.card.${card.id}` as Parameters<typeof t>[0]),
    description: t(`ascent.card.${card.id}.d` as Parameters<typeof t>[0], level.display),
    stackLabel: maxed
      ? t('ascent.draft.maxed')
      : stack === 0
        ? t('ascent.draft.new')
        : t('ascent.draft.stack', { from: roman(stack), to: roman(stack + 1) }),
    stackCount: t('ascent.draft.stackCount', { n: Math.min(stack + 1, card.maxStacks), max: card.maxStacks }),
    powerGainPct: estimatePowerGainPct(state, card, stack),
    maxed,
    // Only worth shouting about when this take is the one that completes the pair.
    evolutionReady: isEvolutionReady(ascent, card) && stack + 1 >= card.maxStacks,
  };
}
