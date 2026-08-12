import { PLAYER_KINGDOM_ID } from '../game/constants';
import type { PowerCardDef } from '../state/types';

/**
 * The Dragon Ascent Power Draft pool.
 *
 * Each card's payload is an ordinary `CourtEffect`, so `applyCourtEffect` does all the
 * work and stacking comes free: every take pushes another permanent `CourtModifier`, and
 * `getCourtBonuses` sums them. Taking Iron Levy three times really is +33% army power.
 *
 * Four pillars, so a draft almost always offers a meaningful choice rather than a strict
 * upgrade: MILITARY (army power), ECONOMY (income), LOGISTICS (build/recruit speed),
 * DEFENCE (holding what you took).
 *
 * Evolutions: max out both parents and they retire into a unique Jade card. These are the
 * run's landmarks — the moment a long game pays off.
 *   iron-levy      + royal-guard    → bach-dang-stakes
 *   village-muster + war-drums      → thunder-march
 *   rice-tribute   + granary-edict  → celestial-granary
 */
export const POWER_CARDS: PowerCardDef[] = [
  // ── Bronze ────────────────────────────────────────────────────────────────
  {
    id: 'iron-levy',
    rarity: 'bronze',
    maxStacks: 3,
    evolvesWith: 'royal-guard',
    evolvesInto: 'bach-dang-stakes',
    levels: [{ effect: { permanent: true, armyPowerModifier: 0.11 }, display: { pct: 11 } }],
  },
  {
    id: 'rice-tribute',
    rarity: 'bronze',
    maxStacks: 3,
    evolvesWith: 'granary-edict',
    evolvesInto: 'celestial-granary',
    levels: [{ effect: { permanent: true, resourceRateModifier: { food: 9, gold: 5 } }, display: { food: 9, gold: 5 } }],
  },
  /**
   * Rewritten from `marketGoldOutputModifier: 0.14`.
   *
   * "+14% market gold" was the clearest example of the pool's problem: a number attached to a
   * system the player never touches, in a currency the mode oversupplies. It only became a real
   * card once coin had something finite to buy — now that walls and companies escalate in price
   * with every purchase, a discount on them is a decision about how long the treasury lasts.
   */
  {
    id: 'salt-roads',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'bronze',
    maxStacks: 2,
    levels: [{ effect: { permanent: true }, display: { pct: 22 } }],
  },
  {
    id: 'feigned-retreat',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'bronze',
    maxStacks: 3,
    levels: [{ effect: { permanent: true }, display: { pct: 7 } }],
  },
  {
    id: 'village-muster',
    rarity: 'bronze',
    maxStacks: 3,
    evolvesWith: 'war-drums',
    evolvesInto: 'thunder-march',
    levels: [
      {
        effect: { permanent: true, recruitSpeedModifier: 0.4, recruitmentSupplyCostModifier: -0.08 },
        display: { pct: 8 },
      },
    ],
  },

  // ── Silver ────────────────────────────────────────────────────────────────
  {
    id: 'bronze-drums',
    rarity: 'silver',
    maxStacks: 3,
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.12, armyXpModifier: 0.15 }, display: { pct: 12, xp: 15 } },
    ],
  },
  {
    id: 'corvee-labour',
    rarity: 'silver',
    maxStacks: 3,
    levels: [
      { effect: { permanent: true, buildSpeedBonus: 1, buildingCostModifier: -0.1 }, display: { pct: 10 } },
    ],
  },
  {
    id: 'granary-edict',
    rarity: 'silver',
    maxStacks: 3,
    evolvesWith: 'rice-tribute',
    evolvesInto: 'celestial-granary',
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { food: 12, supplies: 6 },
          buildingSuppliesUpkeepModifier: -0.1,
        },
        display: { food: 12, supplies: 6 },
      },
    ],
  },
  {
    id: 'earthen-ramparts',
    rarity: 'silver',
    maxStacks: 3,
    levels: [{ effect: { defenseBoost: 8 }, display: { defense: 8 } }],
  },
  {
    id: 'bamboo-palisade',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'silver',
    maxStacks: 1,
    levels: [{ effect: { permanent: true }, display: {} }],
  },
  {
    id: 'mountain-pass',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'silver',
    maxStacks: 2,
    levels: [{ effect: { permanent: true }, display: { ticks: 1 } }],
  },
  {
    id: 'bronze-drum',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'silver',
    maxStacks: 2,
    // Pointless with nothing else in the field to steady.
    requires: (state) => state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID).length > 1,
    levels: [{ effect: { permanent: true }, display: { morale: 7 } }],
  },

  // ── Gold ──────────────────────────────────────────────────────────────────
  {
    id: 'royal-guard',
    rarity: 'gold',
    maxStacks: 2,
    // Only useful once there is a host to elevate.
    requires: (state) => state.armies.some((army) => army.kingdomId === PLAYER_KINGDOM_ID),
    evolvesWith: 'iron-levy',
    evolvesInto: 'bach-dang-stakes',
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.09, armyLevelCapBonus: 1 }, display: { pct: 9, cap: 1 } },
    ],
  },
  {
    id: 'fire-arrows',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'gold',
    maxStacks: 3,
    levels: [{ effect: { permanent: true }, display: { pct: 9 } }],
  },
  {
    id: 'twice-born',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'gold',
    maxStacks: 1,
    requires: (state) => state.armies.some((army) => army.kingdomId === PLAYER_KINGDOM_ID),
    levels: [{ effect: { permanent: true }, display: {} }],
  },
  {
    id: 'mandarin-academy',
    rarity: 'gold',
    maxStacks: 2,
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { gold: 14 },
          marketGoldOutputModifier: 0.15,
          buildingGoldUpkeepModifier: -0.12,
        },
        display: { gold: 14, pct: 15 },
      },
    ],
  },
  {
    id: 'war-drums',
    rarity: 'gold',
    maxStacks: 2,
    evolvesWith: 'village-muster',
    evolvesInto: 'thunder-march',
    levels: [
      {
        effect: { permanent: true, recruitSpeedModifier: 1, battleSupplyCostModifier: -0.15 },
        display: { pct: 15 },
      },
    ],
  },
  {
    id: 'dragon-standard',
    rarity: 'gold',
    maxStacks: 2,
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.15, armyXpModifier: 0.3 }, display: { pct: 15, xp: 30 } },
    ],
  },

  // ── Jade ──────────────────────────────────────────────────────────────────
  {
    id: 'heavenly-mandate',
    rarity: 'jade',
    maxStacks: 1,
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { food: 10, supplies: 10, gold: 10 },
          armyPowerModifier: 0.1,
          buildSpeedBonus: 1,
        },
        display: { all: 10, pct: 10 },
      },
    ],
  },

  // ── Evolutions (granted, never rolled) ────────────────────────────────────
  {
    id: 'bach-dang-stakes',
    rarity: 'jade',
    maxStacks: 1,
    evolutionOnly: true,
    levels: [
      {
        effect: { permanent: true, armyPowerModifier: 0.25, battleSupplyCostModifier: -0.3 },
        display: { pct: 25, supply: 30 },
      },
    ],
  },
  {
    id: 'thunder-march',
    rarity: 'jade',
    maxStacks: 1,
    evolutionOnly: true,
    levels: [
      {
        effect: {
          permanent: true,
          recruitSpeedModifier: 2,
          recruitmentSupplyCostModifier: -0.35,
          armyPowerModifier: 0.08,
        },
        display: { pct: 8 },
      },
    ],
  },
  {
    id: 'celestial-granary',
    rarity: 'jade',
    maxStacks: 1,
    evolutionOnly: true,
    levels: [
      {
        effect: { permanent: true, resourceRateModifier: { food: 30, supplies: 18, gold: 10 } },
        display: { food: 30, supplies: 18, gold: 10 },
      },
    ],
  },
];

const BY_ID = new Map(POWER_CARDS.map((card) => [card.id, card]));

export function findPowerCard(id: string): PowerCardDef | undefined {
  return BY_ID.get(id);
}

/** Cards eligible to be rolled in a draft (evolution results are granted, not offered). */
export const ROLLABLE_POWER_CARDS = POWER_CARDS.filter((card) => !card.evolutionOnly);
