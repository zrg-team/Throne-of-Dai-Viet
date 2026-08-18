import { HERO_ARRIVALS, findArrival } from '../../data/heroArrivals';
import { pushToast } from '../empire/notifications';
import { t } from '../../i18n';
import type { GameState, Hero } from '../../state/types';

/**
 * Fires the one-off a ruler brings when they join the roster.
 *
 * There is no single place a hero joins — `state.heroes.push` appears at eight call sites, and
 * the two that matter here (the gacha in `SummonSystem` and the founding in `AscentResolver`)
 * do not share code. So this is called from both and guarded, rather than hidden inside one of
 * them where the other would silently miss it.
 *
 * The guard is a list of ids on `AscentState`, not a flag on the `Hero`: a hero re-cloned out of
 * the deck would lose a flag, and the list is also what the run summary counts. The id goes in
 * *before* `apply` runs, so an effect that throws cannot fire twice on a retry.
 */
export function fireHeroArrival(state: GameState, hero: Hero): boolean {
  const ascent = state.ascent;
  // Empire mode drafts the same templates through `HeroDraftPanel`; an arrival balanced against
  // the Ascent wave curve has no business firing there.
  if (!ascent || state.gameMode !== 'ascent') return false;
  if (hero.rarity !== 'Legendary' || !hero.arrival) return false;

  const fired = ascent.arrivalsFired ?? (ascent.arrivalsFired = []);
  if (fired.includes(hero.id)) return false;
  fired.push(hero.id);

  const arrival = findArrival(hero.arrival);
  if (!arrival) return false;

  // A Legendary is never a dud: when the world cannot honour what the card promised — no free
  // province, the vassal cap already reached — the treasury answers instead.
  const landed = arrival.apply(state, hero) || HERO_ARRIVALS.treasury.apply(state, hero);
  if (landed) {
    pushToast(state, t('ascent.arrival.toast', { name: hero.name }), 'milestone');
  }
  return landed;
}
