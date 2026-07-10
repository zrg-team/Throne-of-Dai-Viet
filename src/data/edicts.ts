import type { CourtModifier, EraId, ResourceBag } from '../state/types';

export type EdictBranch = 'war' | 'economy' | 'governance';

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
  { id: 'great-code', kind: 'edict', branch: 'governance', era: 'mandate', edictCost: 3, modifier: { courtCardSpeedModifier: 0.5, resourceRateModifier: { humans: 4 }, buildingCostModifier: -0.1 } },

  // ── Wonders (resource-funded megaprojects) ──
  { id: 'grand-canal', kind: 'wonder', branch: 'economy', era: 'rivalry', resourceCost: { gold: 240, supplies: 120 }, modifier: { resourceRateModifier: { food: 5, gold: 3 } } },
  { id: 'imperial-academy', kind: 'wonder', branch: 'governance', era: 'empires', resourceCost: { gold: 340, humans: 150 }, modifier: { armyXpModifier: 0.5, recruitSpeedModifier: 0.3 } },
  { id: 'heavenly-altar', kind: 'wonder', branch: 'war', era: 'mandate', resourceCost: { gold: 480, supplies: 220 }, modifier: { resourceRateModifier: { gold: 6, food: 6 }, marketGoldOutputModifier: 0.3 } },
];

export function getProject(id: string): RealmProject | undefined {
  return REALM_PROJECTS.find((p) => p.id === id);
}
