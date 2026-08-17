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
    id: 'surveyors-corps',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'silver',
    // Two stacks takes the realm from one claim at a time to three, which is as far as the pacing
    // this cap exists to create will stretch before expansion stops being a choice again.
    maxStacks: 2,
    levels: [{ effect: { permanent: true }, display: { slots: 1 } }],
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

  // ── Story-only (granted by the Chronicle, never rolled) ───────────────────
  //
  // Each is the payout of a charge kept — see `data/stories/charges.ts`. They are deliberately at
  // or above the power of the jade evolutions, because they cost something the draft never asks
  // for: thirty seasons of the run bent toward somebody else's oath.
  {
    // 1428. Nguyễn Trãi writes for Lê Lợi after ten years of uprising: the Ming are expelled and
    // Đại Việt declares itself. "Việc nhân nghĩa cốt ở yên dân" — benevolence lies in bringing
    // peace to the people. So it pays in the people: loyalty, stability, and a world that stops
    // treating the realm as prey.
    id: 'dai-cao',
    rarity: 'jade',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { gold: 12, food: 12 },
          stabilityDelta: 25,
          relationsAllDelta: 18,
          armyPowerModifier: 0.12,
        },
        display: { pct: 12, all: 12 },
      },
    ],
  },
  {
    // 1077. On the Như Nguyệt river a poem is read aloud at night from a shrine, and the Song
    // army hears its own defeat foretold. Held to be the first declaration of independence — so
    // it works on the enemy's heart rather than on our walls.
    id: 'tho-than',
    rarity: 'gold',
    maxStacks: 1,
    storyOnly: true,
    levels: [{ effect: { permanent: true, armyPowerModifier: 0.14 }, display: { pct: 14 } }],
  },
  {
    // ~1284. Trần Hưng Đạo writes to his commanders before the second Mongol invasion, shaming
    // and steeling them by turns. The realm's hosts fight above themselves and recover faster.
    id: 'hich-van',
    rarity: 'gold',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.1, armyXpModifier: 0.5 }, display: { pct: 10, xp: 50 } },
    ],
  },
  {
    // Tết, 1789. Quang Trung marches an army north at impossible speed and breaks the Qing at
    // Ngọc Hồi–Đống Đa during the new-year festival.
    id: 'than-toc',
    rarity: 'jade',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      {
        effect: { permanent: true, recruitSpeedModifier: 1.6, recruitmentSupplyCostModifier: -0.3, armyPowerModifier: 0.08 },
        display: { pct: 8 },
      },
    ],
  },
  {
    // 1010. Lý Công Uẩn moves the seat from the cramped valley of Hoa Lư to Đại La and renames it
    // Thăng Long — the ascending dragon. The mode is named after this edict.
    id: 'chieu-doi-do',
    rarity: 'jade',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { gold: 18, supplies: 10 },
          claimSlotBonus: 1,
          buildSpeedBonus: 1,
          buildingCostModifier: -0.15,
        },
        display: { gold: 18, supplies: 10, slots: 1 },
      },
    ],
  },
  {
    // 1427. A Ming relief column is drawn into the narrow pass at Chi Lăng; its commander Liễu
    // Thăng is killed and the siege he was marching to relieve collapses behind him.
    id: 'chi-lang',
    rarity: 'gold',
    maxStacks: 1,
    storyOnly: true,
    levels: [{ effect: { permanent: true, defenseBoost: 26, armyPowerModifier: 0.06 }, display: { defense: 26, pct: 6 } }],
  },
  {
    // 1075. Lý Thường Kiệt does not wait to be invaded: he crosses the border first and burns the
    // staging depots at Ung Châu. The doctrine is in the name — strike first, master the enemy.
    id: 'tien-phat',
    rarity: 'gold',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.16, battleSupplyCostModifier: -0.2 }, display: { pct: 16 } },
    ],
  },
  {
    // 40 AD. Trưng Trắc and Trưng Nhị raise the districts against Han rule and hold the country
    // for three years. Sixty-five citadels answer them — so the card pays in what answered.
    id: 'hai-ba',
    rarity: 'jade',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      {
        effect: { permanent: true, resourceRateModifier: { humans: 6 }, defenseBoost: 18, stabilityDelta: 15, armyPowerModifier: 0.1 },
        display: { pct: 10, defense: 18 },
      },
    ],
  },

  // ── The annals' cards (story-only) ────────────────────────────────────────
  // Paid by the middle-length histories in `data/stories/annals.ts`. Pitched below the eight
  // charge-epic cards on purpose: these are five-beat stories, not thirty-season undertakings.
  {
    // 1428. The sword Thuận Thiên, given for a war and asked back once the war was over.
    id: 'thuan-thien',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, armyPowerModifier: 0.11, stabilityDelta: 12 }, display: { pct: 11 } }],
  },
  {
    // ~208 BC. The crossbow of Cổ Loa, kept because the marriage was refused.
    id: 'no-than',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, defenseBoost: 22, nextArmyArchersBonus: 60 }, display: { defense: 22 } }],
  },
  {
    // 1288. The grain fleet taken at Vân Đồn while the war fleet sailed past.
    id: 'van-don',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, resourceRateModifier: { food: 14, supplies: 8 }, battleSupplyCostModifier: -0.2 }, display: { food: 14, supplies: 8 } }],
  },
  {
    // 17th c. Đào Duy Từ's wall, which held a border for a century and a half.
    id: 'luy-thay',
    rarity: 'jade', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, defenseBoost: 30, buildingCostModifier: -0.15 }, display: { defense: 30 } }],
  },
  {
    // 1070. The Temple of Literature, and the examinations that staffed a dynasty.
    id: 'van-mieu',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, courtCardSpeedModifier: 0.5, resourceRateModifier: { gold: 10 }, stabilityDelta: 10 }, display: { gold: 10 } }],
  },
  {
    // 13th c. Trần Thủ Độ. Order, at a price somebody else paid.
    id: 'thu-do',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, stabilityDelta: 20, armyPowerModifier: 0.08, armyGoldUpkeepModifier: -0.15 }, display: { pct: 8 } }],
  },
  {
    // 1285. "Rather a ghost in the South than a king in the North."
    id: 'binh-trong',
    rarity: 'jade', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, armyPowerModifier: 0.18, armyXpModifier: 0.35 }, display: { pct: 18, xp: 35 } }],
  },
  {
    // 905. Autonomy taken by simply governing, and nobody arriving to stop it.
    id: 'khuc-thua-du',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, resourceRateModifier: { gold: 12, supplies: 6 }, claimSlotBonus: 1 }, display: { gold: 12, slots: 1 } }],
  },
  {
    // The dykes. A thousand years of carrying earth in baskets, every single year.
    id: 'de-dieu',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, resourceRateModifier: { food: 16 }, buildSpeedBonus: 1 }, display: { food: 16 } }],
  },
  {
    // 14th c. Chế Bồng Nga, who sacked the capital three times and was killed for a bribe.
    id: 'che-bong-nga',
    rarity: 'jade', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, armyPowerModifier: 0.14, relationsAllDelta: 10, defenseBoost: 14 }, display: { pct: 14 } }],
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
export const ROLLABLE_POWER_CARDS = POWER_CARDS.filter(
  (card) => !card.evolutionOnly && !card.storyOnly,
);
