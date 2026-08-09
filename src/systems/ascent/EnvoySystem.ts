import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { getEmpirePower, getFear, giftCost, giftOpinionGain, hasPact } from '../DiplomacySystem';
import { demandTribute, proposeTrade, sendGift } from '../ForeignAffairsSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { heroName, t } from '../../i18n';
import type { EnvoyOption, GameState, Hero, Kingdom } from '../../state/types';

const TRADE_INFLUENCE_COST = 10;

/**
 * The rival most worth a card right now: the one whose hostility is climbing fastest against
 * the realm's ability to answer it. Cultivating this empire measurably lowers how often it
 * shows up as the aggressor — `WaveDirector.pickAggressor` weights by `100 - relations`.
 */
export function pickEnvoyTarget(state: GameState): Kingdom | undefined {
  const candidates = state.kingdoms
    .filter((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated)
    // Filter before ranking, not after. Ranking first and testing the winner meant the
    // strongest empire was always chosen and then rejected for being content — so the card
    // never fired at all while three colder neighbours were worth visiting.
    .filter((kingdom) => isWorthVisiting(kingdom));
  if (candidates.length === 0) return undefined;

  return [...candidates].sort((a, b) => envoyUrgency(state, b) - envoyUrgency(state, a))[0];
}

/**
 * Whether a court is worth a modal: they are cooling toward war, or already keen on it. A
 * placid neighbour under a standing pact is not a decision.
 */
export function isWorthVisiting(kingdom: Kingdom): boolean {
  if (hasPact(kingdom)) return false;
  return (kingdom.relations ?? 50) < 55 || (kingdom.warAppetite ?? 0) >= 30;
}

function envoyUrgency(state: GameState, kingdom: Kingdom): number {
  const hostility = Math.max(0, 60 - (kingdom.relations ?? 50));
  const appetite = kingdom.warAppetite ?? 0;
  const strength = getEmpirePower(state, kingdom) / 40;
  // A pact already holds them off, so they are the least interesting court to visit.
  return (hostility * 1.4 + appetite + strength * 6) * (hasPact(kingdom) ? 0.35 : 1);
}

/** An unposted hero to send as ambassador — diplomacy is what the posting actually uses. */
function bestAmbassador(state: GameState): Hero | undefined {
  return state.heroes
    .filter((hero) => !hero.assignedTo)
    .sort((a, b) => b.stats.diplomacy - a.stats.diplomacy)[0];
}

/**
 * Everything the realm can do about one empire, on one card. Unaffordable actions still show
 * with their price so the player learns what a warmer relationship would have cost.
 */
export function buildEnvoyOptions(state: GameState, kingdom: Kingdom): EnvoyOption[] {
  const gift = giftCost(kingdom);
  const ambassador = bestAmbassador(state);
  const alreadyPosted = Boolean(kingdom.ambassadorHeroId);

  return [
    {
      id: 'gift',
      cost: { gold: gift },
      affordable: state.resources.gold >= gift,
    },
    {
      id: 'trade',
      influenceCost: TRADE_INFLUENCE_COST,
      affordable: state.court.influence >= TRADE_INFLUENCE_COST,
    },
    {
      id: 'ambassador',
      heroId: ambassador?.id,
      affordable: Boolean(ambassador) && !alreadyPosted,
    },
    {
      id: 'tribute',
      // Extortion is always *possible*; whether it pays depends on how weak they are, which
      // is the gamble. Refusal costs relations and is the point of the option.
      affordable: true,
    },
    // Always takeable: the player must never be cornered on a card with no legal move.
    { id: 'ignore', affordable: true },
  ];
}

export function offerEnvoy(state: GameState): boolean {
  return offerEnvoyTo(state, pickEnvoyTarget(state)?.id);
}

/** The same card for a named court — how the World lane opens a specific rival. */
export function offerEnvoyTo(state: GameState, kingdomId: string | undefined): boolean {
  const kingdom = state.kingdoms.find(
    (candidate) => candidate.id === kingdomId && candidate.id !== PLAYER_KINGDOM_ID && !candidate.isDefeated,
  );
  if (!kingdom) return false;

  enqueueAscentPrompt(state, {
    kind: 'envoy',
    kingdomId: kingdom.id,
    kingdomName: kingdom.name,
    relations: Math.round(kingdom.relations ?? 50),
    power: Math.round(getEmpirePower(state, kingdom)),
    options: buildEnvoyOptions(state, kingdom),
  });
  return true;
}

/**
 * Applies an envoy action. Gift / trade / tribute are the existing `ForeignAffairsSystem`
 * functions verbatim; posting an ambassador writes the same `ambassadorHeroId` field
 * `tickGreatPowersYear` already reads to warm relations and cool war appetite each year.
 */
export function resolveEnvoy(state: GameState, kingdomId: string, optionId: string): boolean {
  const ascent = state.ascent;
  const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
  if (!kingdom) return false;

  let ok = false;
  switch (optionId) {
    case 'gift':
      ok = sendGift(state, kingdomId);
      break;
    case 'trade':
      ok = proposeTrade(state, kingdomId);
      break;
    case 'tribute':
      ok = demandTribute(state, kingdomId);
      break;
    case 'ambassador': {
      const hero = bestAmbassador(state);
      if (hero && !kingdom.ambassadorHeroId) {
        kingdom.ambassadorHeroId = hero.id;
        hero.assignedTo = `ambassador:${kingdom.id}`;
        pushToast(state, t('ascent.envoy.posted', { hero: heroName(hero), kingdom: kingdom.name }), 'milestone');
        ok = true;
      }
      break;
    }
    case 'ignore':
      ok = true;
      break;
  }

  if (ok && ascent) {
    ascent.laneStats.envoyActions[optionId] = (ascent.laneStats.envoyActions[optionId] ?? 0) + 1;
    ascent.laneState.lastDecisionTurn.world = state.turn;
  }
  return ok;
}

/** Card-ready numbers for one envoy option, so the modal never invents its own maths. */
export function envoyOptionDetail(state: GameState, kingdom: Kingdom, option: EnvoyOption): string {
  switch (option.id) {
    case 'gift':
      return t('ascent.envoy.giftFx', { gain: giftOpinionGain(kingdom) });
    case 'trade':
      return t('ascent.envoy.tradeFx');
    case 'ambassador': {
      const hero = state.heroes.find((candidate) => candidate.id === option.heroId);
      return kingdom.ambassadorHeroId
        ? t('ascent.envoy.ambassadorPosted')
        : hero
          ? t('ascent.envoy.ambassadorFx', { hero: heroName(hero) })
          : t('ascent.envoy.ambassadorNone');
    }
    case 'tribute':
      return t('ascent.envoy.tributeFx', { fear: Math.round(getFear(state, kingdom)) });
    case 'ignore':
    default:
      return t('ascent.envoy.ignoreFx');
  }
}
