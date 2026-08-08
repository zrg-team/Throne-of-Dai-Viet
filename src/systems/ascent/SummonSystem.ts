import {
  BASE_DRAFT_WEIGHTS,
  PITY_GOLD_STEP,
  PITY_HARD_CAP,
  PITY_JADE_STEP,
  SUMMON_CARD_COUNT,
} from '../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { weightedPickIndex } from '../../utils/math';
import { unlockHero } from '../../state/codex';
import { assignHeroToPosition, ALL_COURT_POSITIONS } from '../CourtSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { heroName, t } from '../../i18n';
import type { AscentRarity, CourtPositionId, GameState, Hero, HeroType } from '../../state/types';

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

export function offerHeroSummon(state: GameState): void {
  const { heroIds, pityUsed } = rollSummonHeroes(state);
  if (heroIds.length === 0) return;
  enqueueAscentPrompt(state, { kind: 'hero-summon', heroIds, pityUsed });
}

/** Which court seat a hero type serves best — used so recruiting needs no follow-up menu. */
const SEAT_FOR_TYPE: Record<HeroType, CourtPositionId[]> = {
  general: ['marshal', 'masterOfHorse'],
  governor: ['steward', 'treasurer'],
  minister: ['treasurer', 'chancellor', 'steward'],
  agent: ['spymaster', 'censor', 'chancellor'],
};

/**
 * Puts a new champion straight to work: commanding a leaderless host if they are a general,
 * otherwise taking the best empty seat their type suits. This is what keeps the gacha from
 * spawning a second management screen — the reward applies itself.
 */
function autoAssign(state: GameState, hero: Hero): void {
  if (hero.type === 'general') {
    const leaderless = state.armies.find(
      (army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.generalHeroId,
    );
    if (leaderless) {
      leaderless.generalHeroId = hero.id;
      hero.assignedTo = leaderless.id;
    }
    // Otherwise leave them unposted on purpose: `queueRecruitment` needs an *unassigned*
    // hero to command a new host, so parking generals in a court seat would quietly
    // strangle the autopilot's ability to raise armies at all.
    return;
  }

  const preferred = SEAT_FOR_TYPE[hero.type] ?? [];
  const order = [...preferred, ...ALL_COURT_POSITIONS];
  for (const seat of order) {
    if (!state.court.unlockedSeats.includes(seat)) continue;
    if (state.court.seats[seat]) continue;
    if (assignHeroToPosition(state, hero.id, seat)) return;
  }
  // No seat and no host: they wait in the roster and the autopilot will hand them a command.
}

/**
 * Recruits the chosen champion, records them in the permanent Codex, and resets or advances
 * soft pity. The two passed-over cards are discarded with the prompt.
 */
export function recruitSummonedHero(state: GameState, heroId: string): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  const hero = state.heroDeck.find((candidate) => candidate.id === heroId);
  if (!hero) return false;

  state.heroDeck = state.heroDeck.filter((candidate) => candidate.id !== heroId);
  state.heroes.push(hero);
  ascent.heroesSummoned += 1;
  ascent.summonsDone += 1;

  const tier = tierForHero(hero);
  ascent.summonPity = tier === 'gold' || tier === 'jade' ? 0 : ascent.summonPity + 1;

  const isNew = unlockHero(hero.id);
  autoAssign(state, hero);

  pushToast(state, t('ascent.summon.joined', { hero: heroName(hero) }), isNew ? 'milestone' : 'reward');
  return true;
}

/** Declines all three. Pity still advances, so passing is never a pure loss. */
export function passHeroSummon(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.summonsDone += 1;
  ascent.summonPity += 1;
}
