import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { XP_PER_OWNED_LAND, XP_PER_TICK_BASE, xpToNextLevel } from '../../game/ascentConfig';
import { armyPower, terrainDefenseMultiplier } from '../WarSystem';
import type { GameState, Land } from '../../state/types';

/**
 * The garrison half of `defenderPower` (WarSystem), reused so the HUD's "holding power"
 * matches what an attacker actually has to beat.
 */
export function landGarrisonPower(land: Land): number {
  return (land.defense * 16 + land.localSoldiers * 2.5) * terrainDefenseMultiplier(land);
}

/**
 * The single POWER scalar the whole mode is legible through.
 *
 * Three channels, so every card category visibly moves the number:
 *  - field: standing armies. `armyPower` already folds in `getCourtBonuses().armyPowerMult`,
 *    so an `armyPowerModifier` card lands here on the very next recompute.
 *  - hold: fortifications and militia across owned provinces (defenceBoost cards).
 *  - engine: the economy, weighted toward the resources that buy military strength
 *    (economy cards flow in through `state.resourceRates`).
 *
 * Deliberately recomputed once per tick and cached on `ascent.power`, never per frame —
 * `armyPower` walks `activeCourtModifiers`, which grows one entry per card taken.
 */
export function computeAscentPower(state: GameState): number {
  let field = 0;
  for (const army of state.armies) {
    if (army.kingdomId === PLAYER_KINGDOM_ID) {
      field += armyPower(state, army);
    }
  }

  let hold = 0;
  for (const land of state.lands) {
    if (land.ownerId === PLAYER_KINGDOM_ID) {
      hold += landGarrisonPower(land);
    }
  }

  // The economy counts, but only as a minority share. It was originally weighted heavily
  // enough to dominate the total, which made POWER climb steadily while the realm's actual
  // ability to take ground flatlined — the number went up and nothing happened, which is
  // exactly the failure this mode exists to avoid.
  const rates = state.resourceRates;
  const engine = Math.max(0, rates.gold * 3 + rates.food * 1.5 + rates.supplies * 3) * 1.5;

  return Math.round(field * 1.5 + hold * 0.6 + engine);
}

/**
 * What the realm can actually bring to a defence: field hosts plus fortifications, with no
 * economy term. THREAT is compared against this, not against POWER — a fat treasury does
 * not stop a war host, and a HUD that implied otherwise would be lying.
 */
export function computeDefensivePower(state: GameState): number {
  let total = 0;
  for (const army of state.armies) {
    if (army.kingdomId === PLAYER_KINGDOM_ID) total += armyPower(state, army);
  }
  for (const land of state.lands) {
    if (land.ownerId === PLAYER_KINGDOM_ID) total += landGarrisonPower(land);
  }
  return Math.round(total);
}

/** Provinces the player currently holds. */
export function ownedLandCount(state: GameState): number {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
}

/**
 * Adds momentum and banks any level-ups as `pendingLevelUps`. Drafts are never dropped:
 * if the player levels twice while a prompt is open, they get two drafts.
 */
export function addAscentXp(state: GameState, amount: number): void {
  const ascent = state.ascent;
  if (!ascent || amount <= 0) return;

  ascent.xp += Math.round(amount);
  // A loop, not an `if` — a big lump (a boss wave plus a province) can cross two levels.
  while (ascent.xp >= ascent.xpToNext) {
    ascent.xp -= ascent.xpToNext;
    ascent.level += 1;
    ascent.pendingLevelUps += 1;
    ascent.xpToNext = xpToNextLevel(ascent.level);
  }
}

/**
 * Per-tick progression: refresh the cached POWER (keeping the previous value so the HUD
 * can tween a delta ticker) and accrue passive momentum from the realm's size.
 */
export function tickAscentProgress(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  ascent.powerPrev = ascent.power;
  ascent.power = computeAscentPower(state);
  ascent.peakPower = Math.max(ascent.peakPower, ascent.power);
  ascent.defensePower = computeDefensivePower(state);

  addAscentXp(state, XP_PER_TICK_BASE + ownedLandCount(state) * XP_PER_OWNED_LAND);
}
