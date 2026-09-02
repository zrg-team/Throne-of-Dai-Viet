import { eraIndex } from '../empire/MandateSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { hasTrait } from '../../state/dynasty';
import { t } from '../../i18n';
import type { AscentDoctrine, AscentRarity, EraId, GameState } from '../../state/types';

/**
 * What kind of realm this is going to be.
 *
 * **The divergence lever.** Measured across four wildly different play policies — answer every
 * card, refuse every card, answer at random, always take the last option — a run finished within
 * 16% of every other run. The reason was not that the player's choices were weak; it was that the
 * autopilot files every build, upgrade, recruitment, resupply, march and land purchase from a
 * fixed set of weights, so the realm underneath those choices was the same realm every time.
 *
 * The answer is deliberately *not* to hand the economy back to the player. This is a mobile game
 * and the automation is a pillar — a run must never become fiddly. So the player briefs the
 * autopilot instead of overruling it: one card at each era change, four times a run, in the shape
 * they already know from the Power Draft. They never place a building. They say what kind of realm
 * this is, and then watch it become one.
 *
 * Every number here is a multiplier on a weight that already existed. Nothing new is computed.
 */

export const ALL_DOCTRINES: AscentDoctrine[] = ['fortify', 'expand', 'enrich', 'arm'];

interface DoctrineProfile {
  /** Multipliers on `outputWeights` in the autopilot's build scoring. */
  gold: number;
  food: number;
  supplies: number;
  /** Multiplier on the defensive weight fortifications carry when scoring a building. */
  defence: number;
  /** Added to the realm's target standing host count. */
  hosts: number;
  /** Multiplier on the seasons between routine village purchases — below 1 buys land faster. */
  claimInterval: number;
  /** Multiplier on how much militia a province supports. */
  militia: number;
  /** Rarity the Power Draft leans toward while this doctrine stands. */
  draftLean: AscentRarity;
}

/**
 * The four, and what each actually trades.
 *
 * Kept genuinely lopsided on purpose. A set of four doctrines that each nudge everything by 10%
 * produces four realms that look identical on the measurement that matters, which is the failure
 * being fixed — so each one is strong at its own thing and visibly worse at somebody else's.
 */
const PROFILES: Record<AscentDoctrine, DoctrineProfile> = {
  // Walls, militia, and holding what you have. Buys the fewest provinces and loses the fewest.
  fortify: { gold: 0.9, food: 1.1, supplies: 1.2, defence: 2.2, hosts: 0, claimInterval: 1.5, militia: 1.5, draftLean: 'silver' },
  // Ground, quickly. More provinces than the realm can comfortably hold is the point of it.
  expand: { gold: 1.1, food: 1.35, supplies: 0.9, defence: 0.6, hosts: 1, claimInterval: 0.5, militia: 1.0, draftLean: 'bronze' },
  // The counting house. Poor at war, and rich enough to buy its way out of one.
  enrich: { gold: 1.6, food: 1.0, supplies: 1.15, defence: 0.8, hosts: -1, claimInterval: 0.8, militia: 0.85, draftLean: 'gold' },
  // Hosts in the field. Thin walls, thin treasury, and the only doctrine that takes rival ground.
  arm: { gold: 0.85, food: 1.3, supplies: 1.4, defence: 0.7, hosts: 2, claimInterval: 1.2, militia: 0.9, draftLean: 'jade' },
};

/**
 * The realm's standing course, as one profile.
 *
 * With Twin Doctrine (`dynastyTraits`) the realm may hold two at once, and they are *composed*
 * here rather than read separately: the multiplicative terms multiply and the additive host count
 * adds, so every reader below — output, defence, claim interval, militia — keeps working with no
 * knowledge that a second slot exists. That is the whole of the trait's cost.
 *
 * Two lopsided profiles multiplied are deliberately not two profiles' worth of strength: `fortify`
 * with `enrich` runs 1.44 gold and 1.76 defence but also 1.2 claim interval and −1 host, so a pair
 * is a sharper realm rather than a strictly better one. Nothing here touches battle power, which
 * is what keeps the trait inside the table's budget.
 */
function profile(state: GameState): DoctrineProfile | undefined {
  const first = state.ascent?.doctrine;
  if (!first) return undefined;
  const second = state.ascent?.doctrine2;
  if (!second || second === first) return PROFILES[first];
  const a = PROFILES[first];
  const b = PROFILES[second];
  return {
    gold: a.gold * b.gold,
    food: a.food * b.food,
    supplies: a.supplies * b.supplies,
    defence: a.defence * b.defence,
    hosts: a.hosts + b.hosts,
    claimInterval: a.claimInterval * b.claimInterval,
    militia: a.militia * b.militia,
    // The first course still names the lean: two leans at once is no lean at all, and the draft
    // table is the one place a doctrine has to stay legible.
    draftLean: a.draftLean,
  };
}

/** True when a second course may stand beside the first — the trait, from the second era on. */
export function twinDoctrineOpen(state: GameState): boolean {
  const era = state.mandate?.era;
  return hasTrait('twin-doctrine') && era !== undefined && eraIndex(era) >= 1;
}

/** Multiplier this doctrine puts on one resource's build value. 1 when none is set. */
export function doctrineOutputMult(state: GameState, key: 'gold' | 'food' | 'supplies'): number {
  return profile(state)?.[key] ?? 1;
}

/** Multiplier on the weight fortifications carry when the autopilot scores a building. */
export function doctrineDefenceMult(state: GameState): number {
  return profile(state)?.defence ?? 1;
}

/** Hosts added to (or taken from) the realm's standing target. Never below one host. */
export function doctrineHostBonus(state: GameState): number {
  return profile(state)?.hosts ?? 0;
}

/** Multiplier on the gap between routine village purchases. */
export function doctrineClaimIntervalMult(state: GameState): number {
  return profile(state)?.claimInterval ?? 1;
}

/** Multiplier on how much militia a province supports. */
export function doctrineMilitiaMult(state: GameState): number {
  return profile(state)?.militia ?? 1;
}

/**
 * Draft weight bonus for one rarity under the standing doctrine.
 *
 * Deliberately a lean rather than a lock: a realm at arms sees more jade, it does not stop seeing
 * bronze. The deck diverging is half of what makes two runs feel different, and a doctrine that
 * only moved the economy would leave the build identical.
 */
export function doctrineDraftBonus(state: GameState, rarity: AscentRarity): number {
  const lean = profile(state)?.draftLean;
  // 1.3 rather than 1.8. At the stronger figure `verify-ascent`'s "built a varied deck" check
  // failed: leaning that hard on one rarity collapsed a run's deck below six distinct cards, which
  // is the same crowding-out that `focusBonus` above was retuned to avoid. A lean has to be felt
  // across a run without deciding any single draft.
  return lean === rarity ? 1.3 : 1;
}

/** True when this era has not yet been asked. */
export function doctrineReady(state: GameState): boolean {
  const ascent = state.ascent;
  const era = state.mandate?.era;
  if (!ascent || !era) return false;
  return !(ascent.doctrineErasAsked ?? []).includes(era);
}

/**
 * Raises the doctrine card for the current era.
 *
 * All four are always offered. There is no unlock ladder and no cost: the decision is which realm
 * to be, and gating it behind a resource would turn a fork in the run into a purchase.
 */
export function offerDoctrine(state: GameState): boolean {
  const ascent = state.ascent;
  const era = state.mandate?.era;
  if (!ascent || !era || !doctrineReady(state)) return false;

  enqueueAscentPrompt(state, { kind: 'doctrine', options: ALL_DOCTRINES, era });
  return true;
}

/** Applies the chosen doctrine. Marks the era asked either way, so a decline is respected. */
export function resolveDoctrine(state: GameState, choiceId: string): boolean {
  const ascent = state.ascent;
  const era = state.mandate?.era;
  if (!ascent || !era) return false;

  const asked = (ascent.doctrineErasAsked ??= []);
  if (!asked.includes(era)) asked.push(era);

  // Anything that is not one of the four is treated as holding the present course, and the
  // prompt is *always* reported answered.
  //
  // This is not defensiveness for its own sake. A prompt whose resolver can return false is a
  // prompt that can never be cleared — `resolveAscentPrompt` leaves `pendingAscentPrompt` in
  // place on a false — and the run then sits on a modal with no legal move. Measured the hard
  // way: the objective score fell from 57.5 to 27.6 the first time this card shipped, because a
  // driver that did not know the new kind answered it with an id this function rejected, and the
  // same card was re-raised every other tick for the rest of every run.
  if (choiceId === 'hold' || !ALL_DOCTRINES.includes(choiceId as AscentDoctrine)) {
    // Keeping the standing doctrine is a real answer, and in a later era it is often the right
    // one — switching costs the realm the compounding it has already built toward.
    return true;
  }

  adoptDoctrine(state, choiceId as AscentDoctrine);
  return true;
}

/**
 * Turns the realm to a doctrine, from wherever the order is given.
 *
 * Two doors reach it: the once-an-era card, and the standing picker at the foot of the court
 * lane — the king may re-brief the ministers whenever he is reading their page, not only when
 * the era turns. Same mutation, same announcement, whichever door.
 */
export function adoptDoctrine(state: GameState, doctrine: AscentDoctrine): void {
  const ascent = state.ascent;
  if (!ascent || ascent.doctrine === doctrine || ascent.doctrine2 === doctrine) return;
  // Twin Doctrine fills the empty second slot rather than overwriting the first; once both stand,
  // a further choice replaces the second, so the founding course is the one the house keeps.
  if (ascent.doctrine && twinDoctrineOpen(state)) {
    ascent.doctrine2 = doctrine;
    ascent.laneState.lastDecisionTurn.court = state.turn;
    pushToast(state, t('ascent.doctrine.set', { name: doctrineName(doctrine) }), 'milestone');
    return;
  }
  ascent.doctrine = doctrine;
  ascent.laneState.lastDecisionTurn.court = state.turn;
  pushToast(state, t('ascent.doctrine.set', { name: doctrineName(doctrine) }), 'milestone');
}

export function doctrineName(doctrine: AscentDoctrine): string {
  return t(`ascent.doctrine.${doctrine}` as Parameters<typeof t>[0]);
}

export function doctrineBlurb(doctrine: AscentDoctrine): string {
  return t(`ascent.doctrine.${doctrine}.d` as Parameters<typeof t>[0]);
}

/** The era's name, for the card's subtitle. */
export function doctrineEraLabel(era: EraId): string {
  return t(`empire.era.${era}` as Parameters<typeof t>[0]);
}

/** Sort order for the card, newest era first — kept so the UI never has to know the era list. */
export function doctrineEraIndex(era: EraId): number {
  return eraIndex(era);
}
