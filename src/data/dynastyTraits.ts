/**
 * The eight things a house can learn — the Tông Phả's launch table.
 *
 * ## The budget, and it is not negotiable
 *
 * Waves shadow the realm's power (`WAVE_DEFENCE_SHADOW`, `ascentConfig`), so a trait that hands
 * the player raw strength hands the invader the same strength one wave later and the run feels
 * exactly as it did before — meta-progression that the difficulty curve eats. **Traits are verbs,
 * options and tempo, never raw power.**
 *
 * The published cap, which any future addition to this table inherits:
 *
 *   - every stat-flavoured trait *together* stays under +10% power equivalent;
 *   - a flat resource or output seed lands only inside waves 1–5, where
 *     `EARLY_WAVE_FIELD_SHARE` already caps what the enemy may field against it;
 *   - everything else must change *what the player may choose*, not what the numbers are.
 *
 * Read the table against that: six of the eight change an option count, a price or a slot. Only
 * Quartermaster and Old Roads touch a figure at all, and both are inside the early window.
 *
 * Each trait is one boolean read at one existing site — no new systems. `deep-shelf` and
 * `long-memory` ship as stored flags with no reader; Phases 3 and 4 pick them up. Offering them
 * early is deliberate: choosing a future is still a choice.
 */
export interface DynastyTrait {
  id: string;
  /** Where the flag is read, for the next person looking for it. Not used at run time. */
  readSite: string;
}

export const DYNASTY_TRAITS: DynastyTrait[] = [
  // Power drafts offer 5 cards, not 4.
  { id: 'wide-draft', readSite: 'PowerDraftSystem.rollPowerDraftCards' },
  // The first reroll of each draft is free.
  { id: 'first-reroll-free', readSite: 'PowerDraftSystem.offerPowerDraft' },
  // The founding card offers 5 champions, not 3.
  { id: 'second-founder', readSite: 'GameState.founderOptionCount' },
  // A second doctrine stands beside the first, from era 2.
  { id: 'twin-doctrine', readSite: 'RealmDoctrineSystem.adoptDoctrine' },
  // A muster completes one season sooner.
  { id: 'quartermaster', readSite: 'WarSystem.musterTicks' },
  // The realm opens holding the trade two more districts would have brought.
  { id: 'old-roads', readSite: 'GameState.seedAscentOpening' },
  // +1 opening-hand seal slot. Read by Phase 3.
  { id: 'deep-shelf', readSite: 'Phase 3 — The Cabinet of Seals' },
  // +2 Hall of Names capacity. Read by Phase 4.
  { id: 'long-memory', readSite: 'Phase 4 — Swear a Name' },
];

export function findDynastyTrait(id: string): DynastyTrait | undefined {
  return DYNASTY_TRAITS.find((trait) => trait.id === id);
}

/** Traits with no reader yet, so the sheet can say so rather than promising an effect. */
export const DYNASTY_TRAITS_PENDING: ReadonlySet<string> = new Set(['deep-shelf', 'long-memory']);
