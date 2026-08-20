import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { GameState, Kingdom } from '../../state/types';
import { addCourtModifier, removeCourtModifier } from '../CourtSystem';
import { applyEstateDeltas } from '../DecreeSystem';
import { pushToast } from '../empire/notifications';
import { t } from '../../i18n';

/**
 * Decrees the *other* empires pass, aimed at you.
 *
 * The decree system was entirely one-directional: the player legislated at a world that never
 * legislated back. A rival that only ever answers with an army is a rival with one verb, and the
 * off-map empires in `GreatPowersSystem` already have the standing, the personality and the
 * relations to do something cleverer than march.
 *
 * Deliberately answerable in three ways rather than one. A counter-decree is the throne's own
 * instrument, but warming the relationship or simply outlasting it are both real answers — an edict
 * you can only respond to by spending an edict point is just a tax with a story attached.
 */

/** How long a rival's edict stands before it lapses on its own. */
const RIVAL_DECREE_SEASONS = 30;

/** Relations below which an empire is hostile enough to legislate against you. */
const HOSTILE_BELOW = 38;

/**
 * Seasons of grace before any neighbour writes anything about you.
 *
 * Measured rather than guessed: without it the first counter-decree landed on turn ~50 of a fresh
 * empire run, and because the aggressive personalities reach for the bounty on recruiters, the
 * realm reached year eight with **no army at all** — the 60-tick fingerprint went from one host to
 * zero. A neighbour proclaiming against a realm that has not yet done anything is not pressure, it
 * is an opening tax; they need to have had time to notice you first.
 */
const RIVAL_DECREE_GRACE = 90;

interface RivalDecreeDef {
  id: string;
  /** Which personalities reach for this one. */
  from: Kingdom['personality'][];
  modifier: Parameters<typeof addCourtModifier>[1];
}

/**
 * What a hostile court actually does to you.
 *
 * Each is the kind of order a neighbouring realm can give inside its own borders and still have
 * bite across them — an embargo, a bounty on your recruiters, a closed frontier. None of them is a
 * flat damage number: they each take away a *lever*, which is what makes answering them worth
 * doing rather than absorbing.
 */
const RIVAL_DECREES: RivalDecreeDef[] = [
  {
    id: 'cam-thong-thuong',
    from: ['economic', 'diplomatic', 'defensive'],
    modifier: { id: '', label: '', marketGoldOutputModifier: -0.25 },
  },
  {
    id: 'be-quan-toa-cang',
    from: ['defensive', 'economic'],
    modifier: { id: '', label: '', acquisitionCostModifier: 0.3 },
  },
  {
    id: 'treo-giai-thuong',
    from: ['aggressive', 'expansionist'],
    modifier: { id: '', label: '', recruitSpeedModifier: -0.3 },
  },
];

const modifierId = (kingdomId: string) => `rival-decree-${kingdomId}`;

/** Rival edicts standing against the realm right now. */
export function rivalDecrees(state: GameState): Array<{ kingdomId: string; decreeId: string; until: number }> {
  return state.mandate?.rivalDecrees ?? [];
}

/**
 * Every so often, the empire that likes you least writes something down.
 *
 * Called from the great-powers year rather than every tick: these empires already live on their own
 * slower clock, and a neighbour that proclaimed at you every season would be noise rather than an
 * event.
 */
export function tickRivalDecrees(state: GameState): void {
  const mandate = state.mandate;
  if (!mandate) return;

  mandate.rivalDecrees ??= [];

  // Lapse anything that has run its course, and take its modifier off with it.
  const expired = mandate.rivalDecrees.filter((entry) => state.turn >= entry.until);
  for (const entry of expired) {
    removeCourtModifier(state, modifierId(entry.kingdomId));
    const kingdom = state.kingdoms.find((k) => k.id === entry.kingdomId);
    pushToast(state, t('decree.rival.lapsed', { kingdom: kingdom?.name ?? '' }), 'info');
  }
  mandate.rivalDecrees = mandate.rivalDecrees.filter((entry) => state.turn < entry.until);

  // One standing rival edict at a time. Two at once is a pile-on the player cannot answer, and the
  // answer is the point.
  if (mandate.rivalDecrees.length > 0) return;
  if (state.turn < RIVAL_DECREE_GRACE) return;

  const hostile = state.kingdoms
    .filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated && (k.relations ?? 50) < HOSTILE_BELOW)
    .sort((a, b) => (a.relations ?? 50) - (b.relations ?? 50))[0];
  if (!hostile) return;

  const options = RIVAL_DECREES.filter((def) => def.from.includes(hostile.personality));
  const def = options[Math.floor(Math.random() * options.length)] ?? RIVAL_DECREES[0];
  if (!def) return;

  mandate.rivalDecrees.push({
    kingdomId: hostile.id,
    decreeId: def.id,
    until: state.turn + RIVAL_DECREE_SEASONS,
  });
  addCourtModifier(state, {
    ...def.modifier,
    id: modifierId(hostile.id),
    label: t(`decree.rival.${def.id}` as Parameters<typeof t>[0], { kingdom: hostile.name }),
  });
  // The court takes it as an insult before it takes it as an economic problem.
  applyEstateDeltas(state, { si: -4, thuong: -6 });
  pushToast(state, t('decree.rival.proclaimed', {
    kingdom: hostile.name,
    decree: t(`decree.rival.${def.id}` as Parameters<typeof t>[0], { kingdom: hostile.name }),
  }), 'threat');
}

/**
 * Strikes a rival's edict off — the answer to it.
 *
 * Called when the relationship warms past hostility (a gift, a pact, a marriage) or when they are
 * vassalised or destroyed, so all three of the player's existing diplomatic levers double as
 * answers to this without any of them needing to know the decree system exists.
 */
export function clearRivalDecree(state: GameState, kingdomId: string): boolean {
  const mandate = state.mandate;
  if (!mandate?.rivalDecrees?.length) return false;
  const before = mandate.rivalDecrees.length;
  mandate.rivalDecrees = mandate.rivalDecrees.filter((entry) => entry.kingdomId !== kingdomId);
  if (mandate.rivalDecrees.length === before) return false;
  removeCourtModifier(state, modifierId(kingdomId));
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  pushToast(state, t('decree.rival.answered', { kingdom: kingdom?.name ?? '' }), 'reward');
  return true;
}

/** Sweeps any rival edict whose author is no longer hostile, defeated, or sworn to us. */
export function reconcileRivalDecrees(state: GameState): void {
  for (const entry of [...rivalDecrees(state)]) {
    const kingdom = state.kingdoms.find((k) => k.id === entry.kingdomId);
    if (!kingdom || kingdom.isDefeated || (kingdom.relations ?? 50) >= HOSTILE_BELOW + 12) {
      clearRivalDecree(state, entry.kingdomId);
    }
  }
}
