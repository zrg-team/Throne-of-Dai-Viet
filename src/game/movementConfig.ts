import { ARMY_NO_PROVISION_SPEED_PENALTY } from './gameplayConfig';
import type { Army, Land, TerrainSummary, UnitType } from '../state/types';

/** Relative march speed for each unit type. Lower values move slower. */
export const UNIT_SPEED: Record<UnitType, number> = {
  spearmen: 1,
  archers: 1,
  heavyInfantry: 0.75,
};

/** Relative difficulty of crossing a land dominated by each terrain type. Higher values are slower. */
export const TERRAIN_MOVE_COST: Record<keyof TerrainSummary, number> = {
  plains: 1,
  fields: 1,
  riceFields: 1.1,
  forest: 1.3,
  hills: 1.6,
  mountains: 2,
  water: 2.2,
  fortress: 0.9,
  shrine: 0.9,
};

/** Ticks needed to cross one plains land at normal march speed. */
export const BASE_MOVE_TICKS = 1;

/** Weighted average march speed of an army, based on its unit composition. */
export function getArmySpeed(army: Army): number {
  const { spearmen, archers, heavyInfantry } = army.units;
  const total = spearmen + archers + heavyInfantry;
  if (total <= 0) {
    return 1;
  }

  const weighted = spearmen * UNIT_SPEED.spearmen + archers * UNIT_SPEED.archers + heavyInfantry * UNIT_SPEED.heavyInfantry;
  const speed = Math.max(0.5, weighted / total);
  return army.provisions <= 0 ? speed * ARMY_NO_PROVISION_SPEED_PENALTY : speed;
}

/** Weighted average terrain movement cost for entering this land. */
export function getLandMovementCost(land: Land): number {
  const entries = Object.entries(land.terrainSummary) as Array<[keyof TerrainSummary, number]>;
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total <= 0) {
    return 1;
  }

  const weighted = entries.reduce((sum, [terrain, count]) => sum + count * TERRAIN_MOVE_COST[terrain], 0);
  return weighted / total;
}

/** Ticks required for an army to march onto the given land. */
export function getLegTicks(army: Army, targetLand: Land): number {
  return Math.max(1, Math.round((BASE_MOVE_TICKS * getLandMovementCost(targetLand)) / getArmySpeed(army)));
}
