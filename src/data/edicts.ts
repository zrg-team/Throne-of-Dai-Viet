import type { CourtModifier, EraId, ResourceBag } from '../state/types';

export type EdictBranch = 'war' | 'economy' | 'governance';

/**
 * What play must have produced before the throne can even consider a project (Dragon Ascent).
 *
 * This is what turns the edict list from a fixed menu into something the run *grows*: capture
 * land and the registry edicts appear, seat a legendary and the imperial ones do, see a story
 * to its end and the court starts quoting it. Era remains a second gate on top.
 */
export type ProjectUnlock =
  | { kind: 'level'; level: number }
  | { kind: 'lands'; count: number }
  | { kind: 'seat'; rarity: 'Epic' | 'Legendary' }
  | { kind: 'chronicle'; count: number }
  | { kind: 'waves'; count: number };

/**
 * A permanent realm upgrade. Edicts are bought with Mandate edict-points; Wonders
 * are bought with resources. Both apply a permanent CourtModifier (aggregated by
 * computeCourtBonuses) and are gated behind an era.
 */
export interface RealmProject {
  id: string;
  kind: 'edict' | 'wonder';
  branch: EdictBranch;
  era: EraId;
  /** Edict-point cost (edicts only). */
  edictCost?: number;
  /** Resource cost (wonders only). */
  resourceCost?: Partial<ResourceBag>;
  /**
   * Mutually-exclusive choice group: enacting any project in a group permanently locks the
   * others, so an era's edict is a real branching decision that differentiates runs.
   */
  exclusiveGroup?: string;
  /** Achievement gate on top of the era gate. Projects carrying one exist only in Dragon Ascent. */
  unlock?: ProjectUnlock;
  /** The permanent bonus applied when enacted (CourtModifier payload sans id/label). */
  modifier: Omit<CourtModifier, 'id' | 'label' | 'remainingTicks'>;
}

export const REALM_PROJECTS: RealmProject[] = [
  // ── Edicts · War ──
  { id: 'levy-reform', kind: 'edict', branch: 'war', era: 'founding', edictCost: 1, modifier: { recruitSpeedModifier: 0.3 } },
  // Rivalry war: a branching choice — drill veterans OR mobilise faster/cheaper.
  { id: 'iron-discipline', kind: 'edict', branch: 'war', era: 'rivalry', edictCost: 1, exclusiveGroup: 'war-rivalry', modifier: { armyXpModifier: 0.5 } },
  { id: 'martial-drills', kind: 'edict', branch: 'war', era: 'rivalry', edictCost: 1, exclusiveGroup: 'war-rivalry', modifier: { recruitSpeedModifier: 0.5, recruitmentSupplyCostModifier: -0.2 } },
  { id: 'standing-army', kind: 'edict', branch: 'war', era: 'empires', edictCost: 2, modifier: { armyGoldUpkeepModifier: -0.3, armyLevelCapBonus: 1 } },
  { id: 'imperial-guard', kind: 'edict', branch: 'war', era: 'mandate', edictCost: 3, modifier: { armyLevelCapBonus: 1, armyXpModifier: 0.5, recruitSpeedModifier: 0.3 } },

  // ── Edicts · Economy ──
  { id: 'land-survey', kind: 'edict', branch: 'economy', era: 'founding', edictCost: 1, modifier: { resourceRateModifier: { food: 2, supplies: 1 } } },
  // Rivalry economy: trade coin OR agrarian growth.
  { id: 'coin-reform', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 1, exclusiveGroup: 'econ-rivalry', modifier: { marketGoldOutputModifier: 0.3 } },
  { id: 'agrarian-focus', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 1, exclusiveGroup: 'econ-rivalry', modifier: { resourceRateModifier: { food: 3, humans: 1 } } },
  { id: 'tribute-system', kind: 'edict', branch: 'economy', era: 'empires', edictCost: 2, modifier: { resourceRateModifier: { gold: 3 } } },
  { id: 'golden-age', kind: 'edict', branch: 'economy', era: 'mandate', edictCost: 3, modifier: { marketGoldOutputModifier: 0.4, resourceRateModifier: { gold: 4 } } },

  // ── Edicts · Governance ──
  { id: 'meritocracy', kind: 'edict', branch: 'governance', era: 'founding', edictCost: 1, modifier: { buildingCostModifier: -0.15, buildSpeedBonus: 1 } },
  // Rivalry governance: count the people OR launch public works.
  { id: 'census', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 1, exclusiveGroup: 'gov-rivalry', modifier: { resourceRateModifier: { humans: 3 } } },
  { id: 'public-works', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 1, exclusiveGroup: 'gov-rivalry', modifier: { buildingCostModifier: -0.2, buildSpeedBonus: 1, upgradeSpeedBonus: 1 } },
  { id: 'grand-secretariat', kind: 'edict', branch: 'governance', era: 'empires', edictCost: 2, modifier: { courtCardSpeedModifier: 0.4, acquisitionCostModifier: -0.2 } },
  // The other way to widen the claim cap, for a player who did not draw the Surveyors' Corps.
  // `claimSlotBonus` is inert outside Dragon Ascent, where claiming has never been capped.
  { id: 'surveyors-charter', kind: 'edict', branch: 'governance', era: 'empires', edictCost: 2, modifier: { claimSlotBonus: 1 } },
  { id: 'great-code', kind: 'edict', branch: 'governance', era: 'mandate', edictCost: 3, modifier: { courtCardSpeedModifier: 0.5, resourceRateModifier: { humans: 4 }, buildingCostModifier: -0.1 } },

  // ── Edicts earned by play (Dragon Ascent) ──
  //
  // None of these are reachable from the era track alone: each appears the moment the run
  // produces the thing it is written about. Conquest feeds the registry line, waves feed the
  // veteran line, champions at court feed the imperial line, and finished chronicle stories
  // feed the scholarly line.

  // War — survival and champions.
  { id: 'veterans-of-the-waves', kind: 'edict', branch: 'war', era: 'founding', edictCost: 2, unlock: { kind: 'waves', count: 4 }, modifier: { armyPowerModifier: 0.08 } },
  { id: 'iron-quenching', kind: 'edict', branch: 'war', era: 'rivalry', edictCost: 3, unlock: { kind: 'waves', count: 8 }, modifier: { armyLevelCapBonus: 1, armyPowerModifier: 0.05 } },
  { id: 'hero-banner', kind: 'edict', branch: 'war', era: 'rivalry', edictCost: 3, unlock: { kind: 'seat', rarity: 'Legendary' }, modifier: { armyPowerModifier: 0.1 } },
  { id: 'proving-grounds', kind: 'edict', branch: 'war', era: 'founding', edictCost: 1, unlock: { kind: 'level', level: 4 }, modifier: { armyXpModifier: 0.3 } },

  // Economy — conquest and growth.
  { id: 'spoils-doctrine', kind: 'edict', branch: 'economy', era: 'founding', edictCost: 1, unlock: { kind: 'lands', count: 4 }, modifier: { resourceRateModifier: { gold: 2, supplies: 2 } } },
  { id: 'frontier-markets', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 2, unlock: { kind: 'lands', count: 8 }, modifier: { marketGoldOutputModifier: 0.25, acquisitionCostModifier: -0.15 } },
  { id: 'granary-network', kind: 'edict', branch: 'economy', era: 'founding', edictCost: 2, unlock: { kind: 'level', level: 6 }, modifier: { resourceRateModifier: { food: 4 } } },
  { id: 'scholars-of-the-chronicle', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 2, unlock: { kind: 'chronicle', count: 2 }, modifier: { courtCardSpeedModifier: 0.25, resourceRateModifier: { gold: 2 } } },

  // Governance — stories, ministers, and the widening registry.
  { id: 'oral-histories', kind: 'edict', branch: 'governance', era: 'founding', edictCost: 1, unlock: { kind: 'chronicle', count: 1 }, modifier: { courtCardSpeedModifier: 0.2, resourceRateModifier: { humans: 2 } } },
  { id: 'ministers-council', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 2, unlock: { kind: 'seat', rarity: 'Epic' }, modifier: { courtCardSpeedModifier: 0.3 } },
  { id: 'wide-registry', kind: 'edict', branch: 'governance', era: 'empires', edictCost: 3, unlock: { kind: 'lands', count: 10 }, modifier: { claimSlotBonus: 1, acquisitionCostModifier: -0.1 } },
  { id: 'mandarin-exams', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 2, unlock: { kind: 'level', level: 8 }, modifier: { buildingCostModifier: -0.15, resourceRateModifier: { humans: 3 } } },

  // ── Wonders (resource-funded megaprojects) ──
  { id: 'grand-canal', kind: 'wonder', branch: 'economy', era: 'rivalry', resourceCost: { gold: 240, supplies: 120 }, modifier: { resourceRateModifier: { food: 5, gold: 3 } } },
  { id: 'imperial-academy', kind: 'wonder', branch: 'governance', era: 'empires', resourceCost: { gold: 340, humans: 150 }, modifier: { armyXpModifier: 0.5, recruitSpeedModifier: 0.3 } },
  { id: 'heavenly-altar', kind: 'wonder', branch: 'war', era: 'mandate', resourceCost: { gold: 480, supplies: 220 }, modifier: { resourceRateModifier: { gold: 6, food: 6 }, marketGoldOutputModifier: 0.3 } },
];

export function getProject(id: string): RealmProject | undefined {
  return REALM_PROJECTS.find((p) => p.id === id);
}
