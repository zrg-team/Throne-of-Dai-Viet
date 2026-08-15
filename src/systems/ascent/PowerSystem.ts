import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { REALM_DEFENCE_SHARE, XP_PER_OWNED_LAND, XP_PER_TICK_BASE, xpToNextLevel } from '../../game/ascentConfig';
import { armyPower, terrainDefenseMultiplier } from '../WarSystem';
import { getFocusDefenseMult } from '../ResourceSystem';
import { ambitionHeat } from './AmbitionSystem';
import type { GameState, Land } from '../../state/types';

/**
 * The garrison half of `defenderPower` (WarSystem), reused so the HUD's "holding power"
 * matches what an attacker actually has to beat.
 */
export function landGarrisonPower(state: GameState, land: Land): number {
  return (land.defense * 16 + land.localSoldiers * 2.5)
    * terrainDefenseMultiplier(land)
    * getFocusDefenseMult(state, land);
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
      hold += landGarrisonPower(state, land);
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
    if (land.ownerId === PLAYER_KINGDOM_ID) total += landGarrisonPower(state, land);
  }
  return Math.round(total);
}

/**
 * What the realm can actually bring to bear where a wave lands: its field hosts, plus the
 * capital's own garrison.
 *
 * Distinct from `computeDefensivePower`, which sums *every* province's walls. A wave arrives
 * at one place, so total defence badly overstates what meets it — a realm holding a dozen
 * lightly-walled districts has a large defensive total and almost nothing at the point of
 * contact. Sizing waves against the total is what made the first tuning pass lethal: a wave
 * budgeted at 70% of a 4,000 defensive total hit a province holding a few hundred.
 */
export function computeFieldDefencePower(state: GameState): number {
  let total = 0;
  for (const army of state.armies) {
    if (army.kingdomId === PLAYER_KINGDOM_ID) total += armyPower(state, army);
  }
  const capitalId = state.ascent?.capitalLandId;
  const capital = state.lands.find(
    (land) => land.id === capitalId && land.ownerId === PLAYER_KINGDOM_ID,
  );
  if (capital) total += landGarrisonPower(state, capital);
  return Math.round(total);
}

/**
 * The denominator the whole difficulty curve hangs off: what a wave is sized against, and
 * what the odds quoted on the response card are computed from. **Both must use this**, or the
 * mode lies to the player about how dangerous a wave is.
 *
 * Neither of the two obvious figures works alone. `computeFieldDefencePower` excludes every
 * province's walls, and the autopilot caps the realm at three hosts — so it is effectively
 * flat for a whole run while the realm grows from five provinces to thirty-five. Sizing waves
 * against it capped the threat curve and made a big realm *safer* than a small one, which is
 * backwards. `computeDefensivePower` is the opposite error: it counts all thirty-five
 * garrisons against a host that can only ever attack one of them, so it quoted 98% odds.
 *
 * The blend says: a wave meets your armies and the province it lands on in full, plus a
 * fraction of the rest of the realm — reinforcements, walls it must pass, the depth a raider
 * has to cut through. Measured: this takes the total/field gap from 6.3× at turn 320 down to
 * a curve that keeps rising with the realm instead of flattening.
 */
export function contestedDefencePower(state: GameState): number {
  const field = computeFieldDefencePower(state);
  const total = computeDefensivePower(state);
  return Math.round(field + (total - field) * REALM_DEFENCE_SHARE);
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
  // The same figure waves are sized against and the response card quotes odds from. Publishing
  // `computeDefensivePower` here instead made the HUD's THREAT gauge read "comfortable" for a
  // whole run while the maths behind the wave used a number up to six times smaller — the
  // gauge and the game disagreed about how much trouble the realm was in.
  ascent.defensePower = contestedDefencePower(state);

  // Momentum rides ambition. This is the loop that makes engaging worth its price: a realm
  // that keeps taking ground levels faster, drafts more often and compounds, while a cautious
  // one advances slowly and safely. Passive momentum is the bulk of a run's XP — a wave's
  // survival bonus is under a tenth of it — so scaling only the wave bonus would have made
  // the reward arc a rounding error against a danger arc that was very real indeed.
  const base = XP_PER_TICK_BASE + ownedLandCount(state) * XP_PER_OWNED_LAND;
  addAscentXp(state, base * ambitionHeat(state));
}
