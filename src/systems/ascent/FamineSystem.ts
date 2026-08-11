import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  FAMINE_COOLDOWN_TICKS,
  FAMINE_GOLD_PER_FOOD,
  FAMINE_GRAIN_SEASONS,
  FAMINE_HERD_SUPPLY_RATE,
  FAMINE_REQUISITION_MORALE,
  FAMINE_TREASURY_CAP,
  SCARCITY_CRISIS_SEASONS,
} from '../../game/ascentConfig';
import { applyResourceDelta, canSpend } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { t } from '../../i18n';
import type { FamineOption, GameState } from '../../state/types';

/**
 * Famine, as something the player is actually told about.
 *
 * The mode already *modelled* starvation in detail — `collectPlayerIncome` docks every host 4
 * morale and 6 supply on any tick the granary is empty, and population goes into decline — but
 * it reported it in an eight-pixel grey number in the header, the same size and weight as the
 * gold figure beside it. Measured across five seeds, the realm was losing food in 41-68% of all
 * seasons and sat at exactly zero for hundreds of consecutive turns. Every run that ended,
 * ended here: armies quietly rotted, defence collapsed, and then a wave that would otherwise
 * have been routine took the capital.
 *
 * Losing a run to a system the game never mentions is the worst thing a roguelite can do — the
 * player cannot learn from it, so the next run is no better than the last. This raises the
 * crisis as a real decision with real trade-offs, and gives the treasury the one thing it has
 * never had: something worth buying.
 */

/** Seasons of buffer left at the current burn. Infinity while the granary is filling. */
function foodRunway(state: GameState): number {
  const rate = state.resourceRates.food;
  if (rate >= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, state.resources.food) / Math.max(1, -rate);
}

/** Food the realm is short each season, as a positive number. */
export function famineShortfall(state: GameState): number {
  return Math.max(0, -state.resourceRates.food);
}

/**
 * True when the granary is within a few seasons of empty and still draining.
 *
 * Raised on the approach rather than on the emptiness itself. Waiting for food to actually
 * reach zero means the card arrives after `collectPlayerIncome` has already begun docking every
 * host 4 morale and 6 supply a tick — the player is then told about a crisis at the exact
 * moment it stops being preventable, which is the same "informed too late to act" failure that
 * made famine invisible in the first place.
 *
 * Still deliberately not raised on a merely falling stockpile: a realm dipping into deep
 * reserves is playing normally, and a card about it every few seasons would be the prompt spam
 * this mode has already had to be rescued from once.
 */
export function famineReady(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  if ((ascent.famineCooldown ?? 0) > 0) return false;
  if (famineShortfall(state) <= 0) return false;
  return foodRunway(state) <= SCARCITY_CRISIS_SEASONS;
}

/**
 * Grain a purchase brings in: enough to cover the deficit for a while, not merely one season —
 * but never more than the realm can pay for out of a share of its coffers.
 *
 * The cap is not a nicety. Uncapped, a deep shortfall priced a single relief shipment at twelve
 * thousand gold and a player who took it (as the naive policy does, and as anyone would when the
 * alternative is starvation) had nothing left for walls or mercenaries. Measured, that alone cut
 * a naive run from ~350 seasons to 75: the card meant to rescue the run was ending it.
 */
export function grainAmount(state: GameState): number {
  const wanted = Math.max(60, Math.round(famineShortfall(state) * FAMINE_GRAIN_SEASONS));
  const affordableGrain = Math.floor((state.resources.gold * FAMINE_TREASURY_CAP) / FAMINE_GOLD_PER_FOOD);
  return Math.max(60, Math.min(wanted, affordableGrain));
}

export function grainCost(state: GameState): number {
  return Math.round(grainAmount(state) * FAMINE_GOLD_PER_FOOD);
}

/** Supplies the herds cost when driven to slaughter, and the food they yield. */
export function herdSupplies(state: GameState): number {
  return Math.round(grainAmount(state) * FAMINE_HERD_SUPPLY_RATE);
}

/** Rations sitting in the baggage trains of every host the realm has in the field. */
export function requisitionableRations(state: GameState): number {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
    .reduce((sum, army) => sum + Math.max(0, Math.floor(army.rations * 0.6)), 0);
}

export function buildFamineOptions(state: GameState): FamineOption[] {
  const gold = grainCost(state);
  const supplies = herdSupplies(state);
  const rations = requisitionableRations(state);

  return [
    // The treasury's answer. This is deliberately the *good* option when you are rich, because
    // a fat treasury having no use was the other half of this same complaint.
    {
      id: 'buy-grain',
      cost: { gold },
      food: grainAmount(state),
      affordable: canSpend(state, { gold }),
    },
    // Trades one store for another: fine when the granary is the only empty one.
    {
      id: 'slaughter-herds',
      cost: { supplies },
      food: grainAmount(state),
      affordable: canSpend(state, { supplies }),
    },
    // Feeds the realm out of the army's own baggage. Real, and really costly — the hosts that
    // give it up lose the morale they were holding the line with.
    {
      id: 'requisition',
      food: rations,
      affordable: rations > 0,
    },
    // Always takeable: the player must never be cornered with no legal move.
    { id: 'endure', affordable: true },
  ];
}

export function offerFamine(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  enqueueAscentPrompt(state, {
    kind: 'famine',
    shortfall: famineShortfall(state),
    options: buildFamineOptions(state),
  });
  ascent.famineCooldown = FAMINE_COOLDOWN_TICKS;
  return true;
}

export function resolveFamine(state: GameState, optionId: string): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  const option = buildFamineOptions(state).find((candidate) => candidate.id === optionId);
  if (!option || !option.affordable) return false;

  switch (option.id) {
    case 'buy-grain': {
      applyResourceDelta(state, { gold: -(option.cost?.gold ?? 0), food: option.food ?? 0 });
      pushToast(state, t('ascent.famine.boughtToast', { food: option.food ?? 0 }), 'reward');
      break;
    }
    case 'slaughter-herds': {
      applyResourceDelta(state, { supplies: -(option.cost?.supplies ?? 0), food: option.food ?? 0 });
      pushToast(state, t('ascent.famine.herdsToast', { food: option.food ?? 0 }), 'info');
      break;
    }
    case 'requisition': {
      // Taken from the baggage trains directly, so the cost lands where the food came from.
      for (const army of state.armies) {
        if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;
        const taken = Math.max(0, Math.floor(army.rations * 0.6));
        if (taken <= 0) continue;
        army.rations -= taken;
        army.morale = Math.max(20, army.morale - FAMINE_REQUISITION_MORALE);
      }
      applyResourceDelta(state, { food: option.food ?? 0 });
      pushToast(state, t('ascent.famine.requisitionToast', { food: option.food ?? 0 }), 'threat');
      break;
    }
    case 'endure':
      pushToast(state, t('ascent.famine.endureToast'), 'threat');
      break;
  }

  return true;
}

export function tickFamineCooldown(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.famineCooldown = Math.max(0, (ascent.famineCooldown ?? 0) - 1);
}
