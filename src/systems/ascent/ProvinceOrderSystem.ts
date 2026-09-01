/**
 * What a province is *for*, and who holds it — asked when the realm is visibly short of something
 * or a province is standing open.
 *
 * **Why the card exists.** Both levers already worked and neither was ever proposed. A focus is
 * buried two taps inside the Build lane and a governorship is one row on an appointment card that
 * only appears when a champion happens to arrive — so a run could bleed nine food a season for
 * twenty ticks with a breadbasket-grade delta sitting unclaimed, and a border province could be
 * overrun with three champions idle at court. Measured over six seeds: the realm ends the opening
 * with 0.8 provinces and every one of them on `balanced`.
 *
 * **Why one card for two answers.** `decree-offer` gives the reason in its own comment — the
 * director already weighs ten kinds, and a new kind does not merely add its own cards, it
 * displaces everyone else's. *Tell this district to grow rice* and *post this champion to it* are
 * two answers to one question, and putting them on one sheet is what makes it a decision: the
 * focus is free, permanent and reversible; the champion is a person you have exactly one of, and
 * spending them here is not spending them at court.
 *
 * **Every number on the card is a projection of this province**, not a promise about provinces in
 * general — `getSpecializationMult` and `getLandGovernorEffects` are the same functions the
 * economy tick reads, so the card cannot quote a figure the next tick disagrees with.
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  getFocusDefenseMult,
  getLandAptitude,
  getLandSpecialization,
  getSpecializationMult,
  refreshAllLandOutputs,
  setLandSpecialization,
} from '../ResourceSystem';
import { assignHeroToLand, getLandGovernorEffects } from '../CourtSystem';
import { enqueueAscentPrompt } from './AscentState';
import { defenceCommanderOf } from './landCommand';
import type {
  GameState, Hero, Land, LandSpecialization, ProvinceOrderOption,
} from '../../state/types';

/** The focus that answers each shortage. */
const FIX: Record<'food' | 'supplies' | 'gold', LandSpecialization> = {
  // Rice is food; the classic breadbasket multipliers apply unchanged in this mode.
  food: 'breadbasket',
  // Supplies are what arms a host, and `garrison` is the focus that makes a province arm one.
  supplies: 'garrison',
  gold: 'trade',
};

/**
 * How far into the red a rate has to be before the throne is interrupted about it.
 *
 * Not zero. A realm hovering at −0.4 food is a realm one harvest from level, and a card about it
 * would fire in the first season of every run and teach the player to dismiss the kind.
 */
const DEFICIT_RATE = -2;

/** Waves before which nobody is asked to garrison anything — the opening has enough to read. */
const UNDEFENDED_FROM_WAVE = 2;

function ownedLands(state: GameState): Land[] {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

/**
 * Who could take the province, and what taking it costs.
 *
 * Unassigned champions first. If none — and by turn 6 there are none, because the founder is
 * appointed on the run's first card — a **seated minister** is offered instead, with the seat
 * named on the option. That is the trade the card exists to put in front of the player: a
 * governor is not a free lever, it is a chair at court you are choosing to empty. Measured: with
 * only idle champions in the pool the card offered a posting in 0 of 6 seeds.
 *
 * A champion already governing somewhere is never offered — moving them is a lateral shuffle
 * that costs one province what it gives another, and the card would be lying about the gain.
 */
function postable(state: GameState): { hero: Hero; fromSeat?: string }[] {
  const idle = state.heroes.filter((hero) => !hero.assignedTo);
  if (idle.length > 0) return idle.map((hero) => ({ hero }));
  return state.heroes
    .filter((hero) => hero.assignedTo?.startsWith('court:'))
    .map((hero) => ({ hero, fromSeat: hero.assignedTo?.slice('court:'.length) }));
}

/** Seasonal output this province would gain from being told what it is for. */
function focusGain(state: GameState, land: Land, focus: LandSpecialization, key: 'food' | 'supplies' | 'gold'): number {
  const before = getSpecializationMult(state, getLandSpecialization(land))[key];
  const after = getSpecializationMult(state, focus)[key];
  return Math.round((land.outputs?.[key] ?? 0) * (after - before));
}

/**
 * The province standing most open: no governor, no host, and the most sides facing somebody else.
 *
 * Border exposure rather than raw weakness, because the point of the card is the province an
 * invader will actually reach first.
 */
function mostExposed(state: GameState): Land | undefined {
  const owned = ownedLands(state);
  if (owned.length <= 1) return undefined;
  return owned
    .filter((land) => !defenceCommanderOf(state, land) && getLandSpecialization(land) !== 'fortress')
    .map((land) => ({
      land,
      open: land.neighbors.filter((id) => {
        const neighbour = state.lands.find((candidate) => candidate.id === id);
        return neighbour && neighbour.ownerId !== PLAYER_KINGDOM_ID;
      }).length,
    }))
    .filter((entry) => entry.open > 0)
    .sort((a, b) => b.open - a.open)[0]?.land;
}

/** The shortage worth interrupting for, worst first, or nothing. */
function worstDeficit(state: GameState): 'food' | 'supplies' | 'gold' | undefined {
  return (['food', 'supplies', 'gold'] as const)
    .filter((key) => (state.resourceRates?.[key] ?? 0) <= DEFICIT_RATE)
    .sort((a, b) => (state.resourceRates?.[a] ?? 0) - (state.resourceRates?.[b] ?? 0))[0];
}

type Draft = Extract<import('../../state/types').AscentPrompt, { kind: 'province-order' }>;

/**
 * The card, or nothing. Pure — `provinceOrderReady` and `offerProvinceOrder` both run it, so the
 * director never advertises a card the builder would then decline to raise.
 */
export function draftProvinceOrder(state: GameState): Draft | undefined {
  if (!state.ascent) return undefined;
  const owned = ownedLands(state);
  if (owned.length === 0) return undefined;

  const shortage = worstDeficit(state);
  const reason: Draft['reason'] = shortage ?? 'undefended';
  if (!shortage && (state.ascent.wave ?? 0) < UNDEFENDED_FROM_WAVE) return undefined;

  const focus: LandSpecialization = shortage ? FIX[shortage] : 'fortress';
  const land = shortage
    ? owned
      .filter((candidate) => getLandSpecialization(candidate) !== focus)
      .sort((a, b) => getLandAptitude(b)[focus] - getLandAptitude(a)[focus])[0]
    : mostExposed(state);
  if (!land) return undefined;

  const options: ProvinceOrderOption[] = [];

  // 1 · what the ground is for. Free, permanent, and reversible from the Build lane afterwards.
  const gain = shortage
    ? focusGain(state, land, focus, shortage)
    : Math.round((getFocusDefenseMult(state, land, 'fortress') - 1) * 100);
  if (gain > 0) {
    options.push({
      id: `focus:${focus}`,
      role: 'focus',
      focus,
      effect: gain,
      affordable: true,
    });
  }

  // 2 · who holds it. Judged on what *this* province rewards — a captain on ground held to defend,
  // a clerk on ground held to pay — which is the whole reason the posting is a reading of the map
  // rather than a sort by administration.
  const candidates = postable(state);
  const best = candidates
    .map(({ hero, fromSeat }) => {
      const effects = getLandGovernorEffects(state, land, hero);
      const worth = shortage
        ? effects.outputMult
        : 1 + hero.stats.martial * 0.004;
      return { hero, effects, worth, fromSeat };
    })
    .sort((a, b) => b.worth - a.worth)[0];
  if (best) {
    options.push({
      id: `governor:${best.hero.id}`,
      role: 'governor',
      heroId: best.hero.id,
      heroName: best.hero.name,
      fromSeat: best.fromSeat,
      keyStat: shortage ? best.effects.keyStat : 'martial',
      effect: shortage
        ? Math.round((best.effects.outputMult - 1) * 100)
        : best.hero.stats.martial,
      affordable: true,
    });
  }

  // A card with nothing but "leave it" on it is a notification wearing a decision's clothes —
  // ten of the forty-seven cards in the opening already are, and this kind will not be one.
  if (options.length === 0) return undefined;

  options.push({ id: 'hold', role: 'hold', affordable: true });

  return {
    kind: 'province-order',
    landId: land.id,
    landName: land.name,
    reason,
    rate: shortage ? Math.round((state.resourceRates?.[shortage] ?? 0) * 10) / 10 : undefined,
    options,
  };
}

export function provinceOrderReady(state: GameState): boolean {
  return Boolean(draftProvinceOrder(state));
}

export function offerProvinceOrder(state: GameState): boolean {
  const draft = draftProvinceOrder(state);
  if (!draft) return false;
  enqueueAscentPrompt(state, draft);
  return true;
}

/**
 * Carries the order out. Returns false only when the world has moved under the card — the
 * province lost, the champion taken — and `resolveAscentPrompt` then leaves the card standing
 * rather than swallowing a tap that did nothing.
 */
export function resolveProvinceOrder(state: GameState, landId: string, choiceId: string): boolean {
  if (choiceId === 'hold') return true;

  const [verb, value] = choiceId.split(':');
  if (verb === 'focus') {
    const done = setLandSpecialization(state, landId, value as LandSpecialization);
    // The focus changes what every building on the ground is worth; without this the card's own
    // number does not appear until something else happens to recompute the realm.
    if (done) refreshAllLandOutputs(state);
    return done;
  }
  if (verb === 'governor') {
    const done = assignHeroToLand(state, value, landId);
    if (done) refreshAllLandOutputs(state);
    return done;
  }
  return false;
}
