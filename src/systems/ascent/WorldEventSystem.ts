/**
 * **Things that happen between courts without the player starting them.**
 *
 * Asked for as *"more random actions to affect to relations"*, and the gap it fills is real: every
 * other instrument in the diplomacy system is something the realm *does* — a gift, a charter, an
 * embassy, a denunciation. A board that only ever moves when the player pushes it is a board the
 * player learns to stop reading, because nothing on it can surprise them.
 *
 * Two rules shape every event here, and they are what keep this from being a resource tax with
 * flavour text:
 *
 *  - **No option is free.** Warming one court costs coin, or grain, or standing somewhere else.
 *    An event whose best answer is obvious is a notification wearing a card's clothes.
 *  - **Most name two courts.** The interesting question in this mode is never "do I want to be
 *    liked" — it is *by whom*, given that [[FEUD_ENVY_SHARE]] means the answer cannot be everyone.
 *    An event that forces the player to pick a side is the cheapest way to make that concrete.
 *
 * Deliberately low priority and on a long cadence: this is the world talking, not the world
 * demanding, and it must never crowd out a wave response or a muster.
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  WORLD_EVENT_DRAW,
  WORLD_EVENT_GRACE_TICKS,
  WORLD_EVENT_MIN_GAP_TICKS,
} from '../../game/ascentConfig';
import { addOpinionModifier, applyEnvy } from '../DiplomacySystem';
import { applyResourceDelta, canSpend } from '../ResourceSystem';
import { enqueueAscentPrompt } from './AscentState';
import { pushToast } from '../empire/notifications';
import { t } from '../../i18n';
import type { GameState, Kingdom, ResourceBag } from '../../state/types';

/** One answer to an event, and everything it moves. */
interface WorldEventOption {
  id: string;
  /** Opinion change with the court the event is about. */
  self?: number;
  /** Opinion change with the second court the event names. */
  other?: number;
  /** Opinion change with every court the event does not name. */
  bystander?: number;
  cost?: Partial<ResourceBag>;
}

interface WorldEventDef {
  id: string;
  /** Whether the event is only worth raising when a second court can be named. */
  pair: boolean;
  options: WorldEventOption[];
}

/**
 * The events, and the shape of each one's decision.
 *
 * Six, not sixty. Each exists because it asks a *different* question — pay or bear it, take a side,
 * be seen to be weak, spend grain on someone else's disaster — and a seventh that only reshuffled
 * those numbers would make the set feel longer without making a run feel different.
 */
const WORLD_EVENTS: WorldEventDef[] = [
  // Pay, swallow it, or make it an incident. The cheapest of the set, and the one that teaches
  // that standing has a price list.
  {
    id: 'border-incident',
    pair: false,
    options: [
      { id: 'demand', self: -14 },
      { id: 'overlook', self: 6 },
      { id: 'compensate', self: 13, cost: { gold: 0 } },
    ],
  },
  // A bond with one court is a slight to its rival. The clearest statement of the whole feud rule.
  {
    id: 'marriage-offer',
    pair: true,
    options: [
      { id: 'accept', self: 18, other: -10 },
      { id: 'decline', self: -8 },
    ],
  },
  // Two courts at war, and both are watching. There is no neutral answer — that is the point.
  {
    id: 'their-war',
    pair: true,
    options: [
      { id: 'back-them', self: 20, other: -22 },
      { id: 'back-rival', self: -22, other: 20 },
      { id: 'stay-out', self: -6, other: -6 },
    ],
  },
  // Being seen to be pushed around, priced. The bystander term is the whole event.
  {
    id: 'caravan-refused',
    pair: false,
    options: [
      { id: 'protest', self: -10, bystander: 3 },
      { id: 'reroute', cost: { gold: 0 } },
      { id: 'submit', self: 9, bystander: -4 },
    ],
  },
  // Their disaster, our grain. The only event that asks for food, and the only one where refusing
  // is free at the moment and expensive later.
  {
    id: 'plague-blamed',
    pair: false,
    options: [
      { id: 'physicians', self: 16, cost: { food: 0, gold: 0 } },
      { id: 'deny', self: -12 },
    ],
  },
  // A prince in our hall. Cheap, warm, and visible to exactly the wrong people.
  {
    id: 'hostage-prince',
    pair: true,
    options: [
      { id: 'accept', self: 14, other: -7 },
      { id: 'refuse', self: -6 },
    ],
  },
];

/**
 * What an option actually costs, scaled to the realm's income.
 *
 * The table above carries zeroes as placeholders: a flat price is a real decision in the first
 * minutes of a run and a rounding error by Year 20, which is the same defect the flat thirty-gold
 * gift had. Everything is quoted off `resourceRates` here instead, at the one place the card and
 * the resolver both read.
 */
export function worldEventCost(state: GameState, eventId: string, optionId: string): Partial<ResourceBag> {
  const gold = Math.max(30, Math.round(Math.max(0, state.resourceRates.gold) * 3));
  const food = Math.max(40, Math.round(Math.max(0, state.resourceRates.food) * 3));
  if (eventId === 'border-incident' && optionId === 'compensate') return { gold };
  if (eventId === 'caravan-refused' && optionId === 'reroute') return { gold };
  if (eventId === 'plague-blamed' && optionId === 'physicians') return { food, gold: Math.round(gold * 0.5) };
  return {};
}

function livingCourts(state: GameState): Kingdom[] {
  return state.kingdoms.filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
}

/**
 * Raises an event, sometimes.
 *
 * Guarded three ways so the world stays quiet enough to be worth listening to: a grace period
 * before the first one, a minimum gap between them, and a draw. All three matter — the mode's
 * card budget is contended, and `DecisionDirector` records four prompt kinds that fired *zero*
 * times in a normal run because something louder always had the slot.
 */
export function maybeOfferWorldEvent(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  if (state.turn < WORLD_EVENT_GRACE_TICKS) return false;
  if (state.turn - (ascent.lastWorldEventTurn ?? -99) < WORLD_EVENT_MIN_GAP_TICKS) return false;
  if (Math.random() > WORLD_EVENT_DRAW) return false;

  const courts = livingCourts(state);
  if (courts.length === 0) return false;

  const about = courts[Math.floor(Math.random() * courts.length)];
  // The second court is the feud partner where there is one, because that is the pairing the
  // player has been learning all run — an event that named two courts at random would teach a
  // rivalry that does not exist and undercut the one that does.
  const other = state.kingdoms.find((k) => k.id === about.feudWith && !k.isDefeated)
    ?? courts.find((k) => k.id !== about.id);

  const pool = WORLD_EVENTS.filter((event) => !event.pair || Boolean(other));
  if (pool.length === 0) return false;
  const event = pool[Math.floor(Math.random() * pool.length)];

  ascent.lastWorldEventTurn = state.turn;
  enqueueAscentPrompt(state, {
    kind: 'world-event',
    eventId: event.id,
    kingdomId: about.id,
    kingdomName: about.name,
    otherKingdomId: event.pair ? other?.id : undefined,
    otherKingdomName: event.pair ? other?.name : undefined,
    options: event.options.map((option) => {
      const cost = worldEventCost(state, event.id, option.id);
      return {
        id: option.id,
        cost: Object.keys(cost).length > 0 ? cost : undefined,
        affordable: Object.keys(cost).length === 0 || canSpend(state, cost),
      };
    }),
  });
  return true;
}

/** Applies one answer. Returns false only for an id no event defines — see `resolveEnvoy`. */
export function resolveWorldEvent(
  state: GameState,
  eventId: string,
  kingdomId: string,
  otherKingdomId: string | undefined,
  optionId: string,
): boolean {
  const event = WORLD_EVENTS.find((candidate) => candidate.id === eventId);
  const option = event?.options.find((candidate) => candidate.id === optionId);
  if (!event || !option) return false;

  const about = state.kingdoms.find((k) => k.id === kingdomId);
  if (!about) return true;

  const cost = worldEventCost(state, eventId, optionId);
  if (Object.keys(cost).length > 0) {
    // Refused for want of coin still answers the card — the same rule `resolveEnvoy` follows, and
    // for the same reason: a resolver that returns false leaves the prompt standing for ever.
    if (!canSpend(state, cost)) {
      state.message = t('ascent.event.cannotAfford');
      return true;
    }
    applyResourceDelta(state, Object.fromEntries(
      Object.entries(cost).map(([key, value]) => [key, -(value ?? 0)]),
    ) as Partial<ResourceBag>);
  }

  const move = (kingdom: Kingdom | undefined, by: number | undefined): void => {
    if (!kingdom || !by) return;
    addOpinionModifier(kingdom, {
      id: `event-${eventId}-${state.turn}-${kingdom.id}`,
      label: t(`ascent.event.${eventId}.mod` as Parameters<typeof t>[0]),
      value: by,
      decay: 0.4,
      source: 'event',
    });
    // Warming through an event carries envy exactly as a gift does. Anything else would make
    // events the loophole in the rule the whole feud design rests on.
    applyEnvy(state, kingdom, by);
  };

  move(about, option.self);
  move(state.kingdoms.find((k) => k.id === otherKingdomId), option.other);
  if (option.bystander) {
    for (const kingdom of livingCourts(state)) {
      if (kingdom.id === kingdomId || kingdom.id === otherKingdomId) continue;
      move(kingdom, option.bystander);
    }
  }

  pushToast(state, t('ascent.event.done', { kingdom: about.name }), 'info');
  return true;
}
