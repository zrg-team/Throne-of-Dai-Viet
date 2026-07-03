import { PLAYER_KINGDOM_ID } from '../game/constants';
import type { DirectiveTier, GameState, ResourceBag } from '../state/types';

/** Pure metric evaluators read by the Directive system to measure progress. */
export const DIRECTIVE_METRICS: Record<string, (state: GameState) => number> = {
  ownedLands: (s) => s.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).length,
  armySize: (s) =>
    s.armies
      .filter((a) => a.kingdomId === PLAYER_KINGDOM_ID)
      .reduce((sum, a) => sum + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0),
  goldReserve: (s) => s.resources.gold,
  foodReserve: (s) => s.resources.food,
  suppliesReserve: (s) => s.resources.supplies,
  seatedSeats: (s) => Object.keys(s.court.seats).length,
  heroesRecruited: (s) => s.heroes.length,
  invasionsRepelled: (s) => s.invasionsRepelled ?? 0,
  wondersBuilt: (s) => s.wondersBuilt ?? 0,
  edictsEnacted: (s) => s.mandate?.edicts.length ?? 0,
  playerBuildings: (s) =>
    s.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).reduce((sum, l) => sum + l.buildings.length, 0),
  population: (s) =>
    s.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).reduce((sum, l) => sum + l.population, 0),
  mandatePoints: (s) => s.mandate?.points ?? 0,
};

export interface DirectiveTemplate {
  id: string;
  tier: DirectiveTier;
  metricKey: keyof typeof DIRECTIVE_METRICS;
  /** Target value, computed at issue time (often relative to the current metric). */
  target: (state: GameState, current: number) => number;
  rewardMandate: number;
  rewardResources?: Partial<ResourceBag>;
  weight?: number;
}

const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

// Directives are deliberately ACTION goals — each is advanced by a decision the
// player makes (expand, recruit, build, seat, defend, enact), never by idly
// watching a resource number tick up. That keeps the board a to-do list, not a
// set of timers.
export const DIRECTIVE_TEMPLATES: DirectiveTemplate[] = [
  // ── Short ───────────────────────────────────────────────────────────────
  { id: 'expand-realm', tier: 'short', metricKey: 'ownedLands', target: (_s, c) => c + 1, rewardMandate: 10, rewardResources: { gold: 20 } },
  { id: 'muster-guard', tier: 'short', metricKey: 'armySize', target: (_s, c) => round(c + 300, 50), rewardMandate: 8, rewardResources: { supplies: 20 } },
  { id: 'raise-hall', tier: 'short', metricKey: 'playerBuildings', target: (_s, c) => c + 2, rewardMandate: 8 },
  { id: 'recruit-talent', tier: 'short', metricKey: 'heroesRecruited', target: (_s, c) => c + 1, rewardMandate: 8 },

  // ── Medium ──────────────────────────────────────────────────────────────
  { id: 'settle-frontier', tier: 'medium', metricKey: 'ownedLands', target: (_s, c) => c + 3, rewardMandate: 20, rewardResources: { gold: 40 } },
  { id: 'grand-host', tier: 'medium', metricKey: 'armySize', target: (_s, c) => round(Math.max(c + 500, 900), 100), rewardMandate: 18, rewardResources: { gold: 40 } },
  { id: 'seat-council', tier: 'medium', metricKey: 'seatedSeats', target: (_s, c) => Math.min(8, c + 2), rewardMandate: 16 },
  { id: 'hold-the-line', tier: 'medium', metricKey: 'invasionsRepelled', target: (_s, c) => c + 2, rewardMandate: 22, rewardResources: { supplies: 40 } },
  { id: 'enact-first', tier: 'medium', metricKey: 'edictsEnacted', target: (_s, c) => c + 1, rewardMandate: 16 },

  // ── Epic ────────────────────────────────────────────────────────────────
  { id: 'great-realm', tier: 'epic', metricKey: 'ownedLands', target: (_s, c) => Math.max(c + 5, 12), rewardMandate: 44, rewardResources: { gold: 60 } },
  { id: 'wonder-of-realm', tier: 'epic', metricKey: 'wondersBuilt', target: (_s, c) => c + 1, rewardMandate: 40, rewardResources: { gold: 80 } },
  { id: 'imperial-council', tier: 'epic', metricKey: 'seatedSeats', target: () => 8, rewardMandate: 36 },
  { id: 'enact-reforms', tier: 'epic', metricKey: 'edictsEnacted', target: (_s, c) => c + 3, rewardMandate: 30 },
  { id: 'legend-of-arms', tier: 'epic', metricKey: 'invasionsRepelled', target: (_s, c) => c + 5, rewardMandate: 50, rewardResources: { gold: 60 } },
];
