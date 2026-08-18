import {
  VASSAL_AMBITION_PROVINCES,
  VASSAL_BREAK_LOYALTY,
  VASSAL_FEAR_FLOOR,
  VASSAL_LOYALTY_DRIFT,
  VASSAL_MAX,
  VASSAL_POWER_SHARE,
  VASSAL_RELATIONS_FLOOR,
  VASSAL_TRIBUTE_MAX,
  VASSAL_TRIBUTE_MIN,
  VASSAL_TRIBUTE_SHARE,
} from '../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { addCourtModifier } from '../CourtSystem';
import { addOpinionModifier, getEmpirePower, getFear } from '../DiplomacySystem';
import { pushToast } from '../empire/notifications';
import { chargeAmbition } from './AmbitionSystem';
import { t } from '../../i18n';
import type { GameState, Kingdom, Vassalage } from '../../state/types';

/**
 * Crowns sworn to the player.
 *
 * The game already had vassalage in one direction — a rival demanding *your* submission
 * (`RivalDirector.offerVassalage`), which pays them a tithe through a permanent `CourtModifier`.
 * This is that shape with the gold sign flipped, and using the same shape is the point: a
 * `resourceRateModifier` is already in `createModifier`'s hardcoded key list and already summed
 * by `getCourtBonuses`, so none of this needs a new `CourtModifier` field. Adding one would mean
 * editing the type, that allow-list and the accumulator in lockstep, and a missed one silently
 * drops the money.
 *
 * What a vassal is: it pays every season, it never attacks you, and it counts toward POWER. What
 * it is deliberately *not* is defensive strength — see `vassalPowerTerm`.
 */

const TRIBUTE_PREFIX = 'vassal-tribute-';

export function isVassal(kingdom: Kingdom): boolean {
  return Boolean(kingdom.vassalage);
}

export function vassals(state: GameState): Kingdom[] {
  return state.kingdoms.filter((kingdom) => kingdom.vassalage && !kingdom.isDefeated);
}

export function vassalCount(state: GameState): number {
  return vassals(state).length;
}

/** Rivals still their own masters. The world that wants you dead. */
export function sovereignRivals(state: GameState): Kingdom[] {
  return state.kingdoms.filter(
    (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated && !kingdom.vassalage,
  );
}

/** Tribute scales with what they actually are, so a realm wrecked by a story pays less. */
export function vassalTributeGold(state: GameState, kingdom: Kingdom): number {
  const raw = getEmpirePower(state, kingdom) * VASSAL_TRIBUTE_SHARE;
  return Math.round(Math.max(VASSAL_TRIBUTE_MIN, Math.min(VASSAL_TRIBUTE_MAX, raw)));
}

/**
 * Upsert the tribute modifier.
 *
 * Filters the old one out first: `addCourtModifier` is a bare push with no dedupe — the existing
 * tithe at `RivalDirector` has exactly this bug and stacks if it ever fires twice.
 */
export function setVassalTribute(state: GameState, kingdom: Kingdom): void {
  const gold = vassalTributeGold(state, kingdom);
  removeVassalTribute(state, kingdom);
  if (kingdom.vassalage) kingdom.vassalage.tributeGold = gold;
  addCourtModifier(state, {
    id: `${TRIBUTE_PREFIX}${kingdom.id}`,
    label: t('ascent.vassal.tribute', { name: kingdom.name }),
    resourceRateModifier: { gold },
  });
}

export function removeVassalTribute(state: GameState, kingdom: Kingdom): void {
  state.activeCourtModifiers = state.activeCourtModifiers.filter(
    (modifier) => modifier.id !== `${TRIBUTE_PREFIX}${kingdom.id}`,
  );
}

/** Whether this crown can be asked to bend the knee, and why not when it cannot. */
export function canVassalize(state: GameState, kingdom: Kingdom): { ok: boolean; reason?: string } {
  if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) return { ok: false };
  if (kingdom.vassalage) return { ok: false, reason: t('ascent.vassal.already') };
  if (vassalCount(state) >= VASSAL_MAX) return { ok: false, reason: t('ascent.vassal.capped', { n: VASSAL_MAX }) };
  // Never the last sovereign. `tickWaveDirector` counts the wave up and *then* bails when
  // `pickAggressor` finds nobody, so a world with no enemies left is a run that cannot end.
  if (sovereignRivals(state).length <= 1) return { ok: false, reason: t('ascent.vassal.lastRival') };
  if (getFear(state, kingdom) < VASSAL_FEAR_FLOOR) return { ok: false, reason: t('ascent.vassal.unafraid') };
  if ((kingdom.relations ?? 50) < VASSAL_RELATIONS_FLOOR) return { ok: false, reason: t('ascent.vassal.cold') };
  return { ok: true };
}

/** Seat the oath. Returns false when the world could not honour it. */
export function grantVassalage(state: GameState, kingdom: Kingdom, source: Vassalage['source']): boolean {
  if (kingdom.vassalage || kingdom.isDefeated || kingdom.id === PLAYER_KINGDOM_ID) return false;
  if (vassalCount(state) >= VASSAL_MAX || sovereignRivals(state).length <= 1) return false;

  const vassalage: Vassalage = {
    sinceTurn: state.turn,
    loyalty: Math.max(55, Math.round(getFear(state, kingdom))),
    tributeGold: 0,
    source,
  };
  kingdom.vassalage = vassalage;
  setVassalTribute(state, kingdom);
  kingdom.warAppetite = 0;
  kingdom.hostilityTimer = 0;
  addOpinionModifier(kingdom, {
    id: `vassal-oath-${kingdom.id}`,
    label: t('ascent.vassal.oath'),
    value: 25,
    source: 'treaty',
  });

  // Durable growth costs heat everywhere else in this mode; it should here too. Charged once,
  // visible on the ambition dial, and decaying — rather than a permanent hidden tax on the curve.
  chargeAmbition(state, 'province', VASSAL_AMBITION_PROVINCES);

  const ascent = state.ascent;
  if (ascent) ascent.vassalsTaken = (ascent.vassalsTaken ?? 0) + 1;
  pushToast(state, t('ascent.vassal.sworn', { name: kingdom.name }), 'milestone');
  return true;
}

export function breakVassalage(
  state: GameState,
  kingdom: Kingdom,
  cause: 'revolt' | 'released' | 'rebirth',
): void {
  if (!kingdom.vassalage) return;
  removeVassalTribute(state, kingdom);
  kingdom.vassalage = undefined;
  if (cause === 'revolt') {
    kingdom.warAppetite = 100;
    pushToast(state, t('ascent.vassal.revolt', { name: kingdom.name }), 'threat');
  } else if (cause === 'released') {
    kingdom.relations = Math.min(100, (kingdom.relations ?? 50) + 15);
    pushToast(state, t('ascent.vassal.released', { name: kingdom.name }), 'info');
  }
}

/**
 * POWER the realm draws from oaths sworn to it — the HUD figure and the run score.
 *
 * Explicitly *not* defensive strength. `contestedDefencePower` feeds the raid budget, mercenary
 * pricing and `projectedWinChance`; a vassal is off the map and brings no host to the point of
 * contact, so counting it there would inflate the raids coming at you *and* make the game quote
 * odds the battle resolver will not honour.
 */
export function vassalPowerTerm(state: GameState): number {
  let total = 0;
  for (const kingdom of vassals(state)) {
    const loyalty = (kingdom.vassalage?.loyalty ?? 0) / 100;
    total += getEmpirePower(state, kingdom) * VASSAL_POWER_SHARE * loyalty;
  }
  return Math.round(total);
}

/**
 * Loyalty drifts toward how much they still fear you, and tribute follows their strength.
 *
 * The oath is a bet on staying strong: let your capital be besieged and your hosts die, fear
 * falls, and the crown that knelt tears the oath up and marches.
 */
export function tickVassals(state: GameState): void {
  for (const kingdom of state.kingdoms) {
    const vassalage = kingdom.vassalage;
    if (!vassalage) continue;
    if (kingdom.isDefeated) {
      breakVassalage(state, kingdom, 'rebirth');
      continue;
    }
    const fear = getFear(state, kingdom);
    vassalage.loyalty += Math.sign(fear - vassalage.loyalty) * VASSAL_LOYALTY_DRIFT;
    vassalage.loyalty = Math.max(0, Math.min(100, vassalage.loyalty));
    if (vassalage.loyalty < VASSAL_BREAK_LOYALTY) {
      breakVassalage(state, kingdom, 'revolt');
      continue;
    }
    if (state.turn % 12 === 0) setVassalTribute(state, kingdom);
  }
}
