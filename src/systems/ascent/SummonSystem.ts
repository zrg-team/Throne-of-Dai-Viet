import {
  BASE_DRAFT_WEIGHTS,
  PITY_GOLD_STEP,
  PITY_HARD_CAP,
  PITY_JADE_STEP,
  SUMMON_CARD_COUNT,
} from '../../game/ascentConfig';
import { weightedPickIndex } from '../../utils/math';
import { unlockHero } from '../../state/codex';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { heroName, t } from '../../i18n';
import type { AscentRarity, GameState, Hero } from '../../state/types';

/**
 * Rarity is cosmetic everywhere else in the game — here it does real work: it drives both
 * the draw weights and, through the hero's own stats, the magnitude of what you get.
 */
const RARITY_BY_TIER: Record<AscentRarity, Hero['rarity']> = {
  bronze: 'Common',
  silver: 'Rare',
  gold: 'Epic',
  jade: 'Legendary',
};

const TIER_ORDER: AscentRarity[] = ['bronze', 'silver', 'gold', 'jade'];

export function tierForHero(hero: Hero): AscentRarity {
  return TIER_ORDER.find((tier) => RARITY_BY_TIER[tier] === hero.rarity) ?? 'bronze';
}

/**
 * Draw weights for one summon, shifted by soft pity: every summon that fails to produce a
 * gold-or-better tilts the odds further toward the top tiers, so a cold streak visibly
 * corrects itself instead of feeling arbitrary.
 */
function summonWeights(pity: number): Record<AscentRarity, number> {
  return {
    bronze: Math.max(4, BASE_DRAFT_WEIGHTS.bronze - pity * (PITY_GOLD_STEP * 0.8)),
    silver: BASE_DRAFT_WEIGHTS.silver,
    gold: BASE_DRAFT_WEIGHTS.gold + pity * PITY_GOLD_STEP,
    jade: BASE_DRAFT_WEIGHTS.jade + pity * PITY_JADE_STEP,
  };
}

function pickHeroOfTier(pool: Hero[], tier: AscentRarity): Hero | undefined {
  const matching = pool.filter((hero) => hero.rarity === RARITY_BY_TIER[tier]);
  if (matching.length === 0) return undefined;
  return matching[Math.floor(Math.random() * matching.length)];
}

/**
 * Rolls the three summon cards. One roll per card, each against the pity-adjusted weights,
 * falling back down the tiers when the deck has run dry of a rarity so a summon is never
 * empty.
 */
export function rollSummonHeroes(state: GameState): { heroIds: string[]; pityUsed: boolean } {
  const ascent = state.ascent;
  if (!ascent || state.heroDeck.length === 0) return { heroIds: [], pityUsed: false };

  const guaranteed = ascent.summonPity >= PITY_HARD_CAP;
  const weights = summonWeights(ascent.summonPity);
  const remaining = [...state.heroDeck];
  const heroIds: string[] = [];

  for (let slot = 0; slot < SUMMON_CARD_COUNT && remaining.length > 0; slot += 1) {
    // The hard-pity guarantee is spent on the first card so the player sees it immediately.
    const forceHigh = guaranteed && slot === 0;
    let tier: AscentRarity;
    if (forceHigh) {
      tier = pickHeroOfTier(remaining, 'jade') ? 'jade' : 'gold';
    } else {
      const index = weightedPickIndex(TIER_ORDER.map((candidate) => weights[candidate]));
      tier = TIER_ORDER[index < 0 ? 0 : index];
    }

    let hero = pickHeroOfTier(remaining, tier);
    // Walk down the ladder, then up, rather than showing an empty slot.
    for (let step = TIER_ORDER.indexOf(tier) - 1; !hero && step >= 0; step -= 1) {
      hero = pickHeroOfTier(remaining, TIER_ORDER[step]);
    }
    for (let step = TIER_ORDER.indexOf(tier) + 1; !hero && step < TIER_ORDER.length; step += 1) {
      hero = pickHeroOfTier(remaining, TIER_ORDER[step]);
    }
    if (!hero) break;

    heroIds.push(hero.id);
    remaining.splice(remaining.indexOf(hero), 1);
  }

  return { heroIds, pityUsed: guaranteed };
}

/**
 * Raises the champion card from whichever source is ready.
 *
 * Two feed it. The court's Favor meter pays out a `state.activeHeroDraft` on its own clock —
 * that is the classic "heroes arrive over time" — and wave milestones roll the rarity-weighted
 * gacha. Both land on the same card so the player only ever learns one screen.
 */
export function offerHeroSummon(state: GameState): boolean {
  const draft = state.activeHeroDraft;
  if (draft?.length) {
    enqueueAscentPrompt(state, {
      kind: 'hero-choice',
      heroIds: draft.map((hero) => hero.id),
      source: 'court',
      pityUsed: false,
    });
    return true;
  }

  const { heroIds, pityUsed } = rollSummonHeroes(state);
  if (heroIds.length === 0) return false;
  enqueueAscentPrompt(state, { kind: 'hero-choice', heroIds, source: 'summon', pityUsed });
  return true;
}

/**
 * Recruits the chosen champion, records them in the permanent Codex, and resets or advances
 * soft pity. The two passed-over cards are discarded with the prompt.
 *
 * The hero is deliberately left unposted: `resolveAscentPrompt` raises the Appointment card
 * next, which is where the player decides what they actually do. An auto-assign here would
 * make the appointment a correction rather than a choice.
 */
export function recruitSummonedHero(state: GameState, heroId: string, source: 'summon' | 'court'): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  const hero = state.heroDeck.find((candidate) => candidate.id === heroId);
  if (!hero) return false;

  state.heroDeck = state.heroDeck.filter((candidate) => candidate.id !== heroId);
  state.heroes.push(hero);
  ascent.heroesSummoned += 1;

  if (source === 'court') {
    // A Favor draft is not a summon: counting it would advance the wave-milestone ledger and
    // silently swallow the next gacha the player earned.
    state.activeHeroDraft = undefined;
  } else {
    ascent.summonsDone += 1;
    const tier = tierForHero(hero);
    ascent.summonPity = tier === 'gold' || tier === 'jade' ? 0 : ascent.summonPity + 1;
  }

  const isNew = unlockHero(hero.id);
  pushToast(state, t('ascent.summon.joined', { hero: heroName(hero) }), isNew ? 'milestone' : 'reward');
  return true;
}

/** Declines all three. Pity still advances, so passing is never a pure loss. */
export function passHeroSummon(state: GameState, source: 'summon' | 'court'): void {
  const ascent = state.ascent;
  if (!ascent) return;
  if (source === 'court') {
    state.activeHeroDraft = undefined;
    return;
  }
  ascent.summonsDone += 1;
  ascent.summonPity += 1;
}
